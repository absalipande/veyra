import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  accounts,
  billOccurrences,
  billSeries,
  ledgerEntries,
  loanInstallments,
  loanPayments,
  loans,
  transactionEvents,
} from "@/db/schema";
import {
  createLoanSchema,
  deleteLoanSchema,
  getLoanSchema,
  listLoansSchema,
  recordLoanPaymentSchema,
  updateLoanSchema,
} from "@/features/loans/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type ListLoansInput = z.infer<typeof listLoansSchema>;
type GetLoanInput = z.infer<typeof getLoanSchema>;
type CreateLoanInput = z.infer<typeof createLoanSchema>;
type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
type DeleteLoanInput = z.infer<typeof deleteLoanSchema>;
type RecordLoanPaymentInput = z.infer<typeof recordLoanPaymentSchema>;
type LoanInstallmentInput = CreateLoanInput["repaymentPlan"][number];

type AccountRecord = typeof accounts.$inferSelect;

type BalanceEntry = {
  accountId: string;
  amountDelta: number;
};

type LoanRecord = typeof loans.$inferSelect;
type LoanInstallmentRecord = typeof loanInstallments.$inferSelect;
type LoanPaymentRecord = typeof loanPayments.$inferSelect;

type CreditLinkResolution = {
  repaymentAccount: AccountRecord | null;
  defaultPaymentSourceAccount: AccountRecord | null;
  snapshot: {
    balance: number | null;
    limit: number | null;
    available: number | null;
    utilization: number | null;
  };
  openingAmount: number;
  shouldApplyOpeningAdjustment: boolean;
};

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

async function requireUserAccount(
  ctx: Pick<TRPCContext, "db" | "userId">,
  accountId: string,
  label: string
) {
  const userId = assertUserId(ctx.userId);
  const account = await ctx.db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.clerkUserId, userId)),
  });

  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${label} was not found.`,
    });
  }

  return account;
}

async function requireLoan(
  ctx: Pick<TRPCContext, "db" | "userId">,
  id: string,
  message = "Loan not found."
) {
  const userId = assertUserId(ctx.userId);
  const loan = await ctx.db.query.loans.findFirst({
    where: and(eq(loans.id, id), eq(loans.clerkUserId, userId)),
  });

  if (!loan) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message,
    });
  }

  return loan;
}

function assertAccountType(
  account: AccountRecord,
  allowed: Array<AccountRecord["type"]>,
  label: string
) {
  if (!allowed.includes(account.type)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} must be one of: ${allowed.join(", ")}.`,
    });
  }
}

function assertSameCurrency(accountsToCompare: AccountRecord[], message: string) {
  const currencies = new Set(accountsToCompare.map((account) => account.currency));

  if (currencies.size > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
    });
  }
}

function getCreditAccountSnapshot(account: AccountRecord) {
  const balance = Math.max(account.balance, 0);
  const limit = Math.max(account.creditLimit, 0);
  const available = Math.max(limit - balance, 0);
  const utilization = limit > 0 ? Math.round((balance / limit) * 100) : 0;

  return {
    balance,
    limit,
    available,
    utilization,
  };
}

async function applyBalanceEntries(
  ctx: Pick<TRPCContext, "db">,
  userId: string,
  entries: BalanceEntry[]
) {
  const appliedEntries: BalanceEntry[] = [];

  for (const entry of entries) {
    const [updatedAccount] = await ctx.db
      .update(accounts)
      .set({
        balance: sql`${accounts.balance} + ${entry.amountDelta}`,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, entry.accountId), eq(accounts.clerkUserId, userId)))
      .returning({ id: accounts.id });

    if (!updatedAccount) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to apply account balance update.",
      });
    }

    appliedEntries.push(entry);
  }

  return appliedEntries;
}

async function rollbackBalanceEntries(
  ctx: Pick<TRPCContext, "db">,
  userId: string,
  entries: BalanceEntry[]
) {
  for (const entry of entries) {
    await ctx.db
      .update(accounts)
      .set({
        balance: sql`${accounts.balance} - ${entry.amountDelta}`,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, entry.accountId), eq(accounts.clerkUserId, userId)));
  }
}

function assertLoanState(input: Pick<CreateLoanInput | UpdateLoanInput, "status" | "outstandingAmount">) {
  if (input.status === "closed" && input.outstandingAmount > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Closed loans must have zero outstanding amount.",
    });
  }
}

function normalizeRepaymentPlan(plan: LoanInstallmentInput[]) {
  return [...plan].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
}

function deriveInstallmentBreakdown(
  plan: LoanInstallmentInput[],
  principalAmount: number
) {
  if (plan.length === 0) {
    return [];
  }

  const totalPayable = plan.reduce((sum, installment) => sum + installment.amount, 0);
  if (totalPayable <= 0) {
    return plan.map((installment) => ({
      ...installment,
      principalAmount: installment.principalAmount ?? installment.amount,
      interestAmount: installment.interestAmount ?? 0,
    }));
  }

  let principalAssigned = 0;
  let interestAssigned = 0;

  return plan.map((installment, index) => {
    const hasManualBreakdown =
      typeof installment.principalAmount === "number" || typeof installment.interestAmount === "number";

    if (hasManualBreakdown) {
      const principal = Math.max(installment.principalAmount ?? 0, 0);
      const interest = Math.max(installment.interestAmount ?? installment.amount - principal, 0);
      principalAssigned += principal;
      interestAssigned += interest;
      return {
        ...installment,
        principalAmount: principal,
        interestAmount: interest,
      };
    }

    const isLast = index === plan.length - 1;
    const principal = isLast
      ? Math.max(principalAmount - principalAssigned, 0)
      : Math.round((principalAmount * installment.amount) / totalPayable);
    principalAssigned += principal;

    const interest = isLast
      ? Math.max(totalPayable - principalAmount - interestAssigned, 0)
      : Math.max(installment.amount - principal, 0);
    interestAssigned += interest;

    return {
      ...installment,
      principalAmount: Math.min(principal, installment.amount),
      interestAmount: Math.max(installment.amount - Math.min(principal, installment.amount), 0),
    };
  });
}

function getInstallmentRemainingAmount(installment: LoanInstallmentRecord) {
  return Math.max(installment.amount - installment.paidAmount, 0);
}

function getEffectiveOutstandingAmount(
  loan: Pick<LoanRecord, "outstandingAmount">,
  installments: LoanInstallmentRecord[]
) {
  if (installments.length === 0) {
    return Math.max(loan.outstandingAmount, 0);
  }

  return installments.reduce(
    (sum, installment) => sum + getInstallmentRemainingAmount(installment),
    0
  );
}

function mapLoanCadenceToBillSchedule(cadence: LoanRecord["cadence"]) {
  if (cadence === "weekly") return { cadence: "weekly" as const, intervalCount: 1 };
  if (cadence === "bi-weekly") return { cadence: "weekly" as const, intervalCount: 2 };
  if (cadence === "monthly") return { cadence: "monthly" as const, intervalCount: 1 };
  return { cadence: "monthly" as const, intervalCount: 1 };
}

async function syncLinkedLoanBillSeries(
  ctx: Pick<TRPCContext, "db" | "userId">,
  loan: LoanRecord,
  installments: LoanInstallmentRecord[]
) {
  const dbAny = ctx.db as unknown as {
    query?: {
      billSeries?: { findMany?: (...args: unknown[]) => Promise<Array<typeof billSeries.$inferSelect>> };
      billOccurrences?: unknown;
    };
    update?: unknown;
    insert?: unknown;
    delete?: unknown;
  };
  if (
    !dbAny.query?.billSeries?.findMany ||
    !dbAny.query?.billOccurrences ||
    typeof dbAny.update !== "function" ||
    typeof dbAny.insert !== "function" ||
    typeof dbAny.delete !== "function"
  ) {
    return null;
  }

  const userId = assertUserId(ctx.userId);
  const sortedInstallments = [...installments].sort(
    (left, right) => left.sequence - right.sequence || left.dueDate.getTime() - right.dueDate.getTime()
  );
  const pendingInstallments = sortedInstallments.filter(
    (installment) => getInstallmentStatus(installment) !== "paid" && getInstallmentRemainingAmount(installment) > 0
  );
  const nextPendingInstallment = pendingInstallments[0] ?? null;
  const pendingCount = pendingInstallments.length;
  const shouldBeActive = loan.status === "active" && Boolean(nextPendingInstallment);

  const schedule = mapLoanCadenceToBillSchedule(loan.cadence);
  const startsAt = sortedInstallments[0]?.dueDate ?? loan.disbursedAt;
  const nextDueDate = nextPendingInstallment?.dueDate ?? null;
  const nextAmount = nextPendingInstallment
    ? getInstallmentRemainingAmount(nextPendingInstallment)
    : 0;

  const linkedSeriesRows = await ctx.db.query.billSeries.findMany({
    where: and(
      eq(billSeries.clerkUserId, userId),
      eq(billSeries.loanId, loan.id),
      eq(billSeries.obligationType, "loan_repayment")
    ),
    orderBy: [desc(billSeries.updatedAt), desc(billSeries.createdAt)],
  });

  const primarySeries = linkedSeriesRows[0] ?? null;
  const duplicateSeries = linkedSeriesRows.slice(1);

  if (duplicateSeries.length > 0) {
    await Promise.all(
      duplicateSeries.map((series) =>
        ctx.db
          .update(billSeries)
          .set({
            isActive: false,
            nextDueDate: null,
            remainingOccurrences: 0,
            updatedAt: new Date(),
          })
          .where(and(eq(billSeries.id, series.id), eq(billSeries.clerkUserId, userId)))
      )
    );
  }

  if (!primarySeries && pendingCount === 0) {
    return null;
  }

  let targetSeriesId = primarySeries?.id ?? null;
  if (!primarySeries && pendingCount > 0) {
    targetSeriesId = crypto.randomUUID();
    await ctx.db.insert(billSeries).values({
      id: targetSeriesId,
      clerkUserId: userId,
      name: loan.name,
      amount: nextAmount,
      currency: loan.currency,
      cadence: schedule.cadence,
      intervalCount: schedule.intervalCount,
      startsAt,
      nextDueDate,
      endsAfterOccurrences: sortedInstallments.length > 0 ? sortedInstallments.length : null,
      remainingOccurrences: pendingCount,
      obligationType: "loan_repayment",
      loanId: loan.id,
      loanInstallmentId: nextPendingInstallment?.id ?? null,
      isActive: shouldBeActive,
      accountId: loan.destinationAccountId,
      notes: loan.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else if (primarySeries && targetSeriesId) {
    await ctx.db
      .update(billSeries)
      .set({
        name: loan.name,
        amount: nextAmount > 0 ? nextAmount : primarySeries.amount,
        currency: loan.currency,
        cadence: schedule.cadence,
        intervalCount: schedule.intervalCount,
        startsAt,
        nextDueDate,
        endsAfterOccurrences: sortedInstallments.length > 0 ? sortedInstallments.length : null,
        remainingOccurrences: pendingCount,
        obligationType: "loan_repayment",
        loanId: loan.id,
        loanInstallmentId: nextPendingInstallment?.id ?? null,
        isActive: shouldBeActive,
        accountId: loan.destinationAccountId,
        notes: loan.notes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(billSeries.id, targetSeriesId), eq(billSeries.clerkUserId, userId)));
  }

  if (!targetSeriesId) return null;

  await ctx.db
    .delete(billOccurrences)
    .where(
      and(
        eq(billOccurrences.clerkUserId, userId),
        eq(billOccurrences.billId, targetSeriesId),
        eq(billOccurrences.status, "pending")
      )
    );

  if (shouldBeActive && nextDueDate && nextAmount > 0) {
    await ctx.db.insert(billOccurrences).values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      billId: targetSeriesId,
      dueDate: nextDueDate,
      amount: nextAmount,
      status: "pending",
      paidAt: null,
      loanPaymentId: null,
      transactionEventId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return targetSeriesId;
}

async function settleLinkedBillOccurrenceForLoanPayment(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: {
    loanId: string;
    installmentDueDate: Date | null;
    paymentAmount: number;
    paymentDate: Date;
    loanPaymentId: string;
  }
) {
  const dbAny = ctx.db as unknown as {
    query?: {
      billSeries?: { findFirst?: (...args: unknown[]) => Promise<typeof billSeries.$inferSelect | null> };
      billOccurrences?: { findFirst?: (...args: unknown[]) => Promise<typeof billOccurrences.$inferSelect | null> };
    };
    update?: unknown;
  };
  if (
    !dbAny.query?.billSeries?.findFirst ||
    !dbAny.query?.billOccurrences?.findFirst ||
    typeof dbAny.update !== "function"
  ) {
    return;
  }

  const userId = assertUserId(ctx.userId);
  const series = await ctx.db.query.billSeries.findFirst({
    where: and(
      eq(billSeries.clerkUserId, userId),
      eq(billSeries.loanId, input.loanId),
      eq(billSeries.obligationType, "loan_repayment")
    ),
    orderBy: [desc(billSeries.updatedAt), desc(billSeries.createdAt)],
  });
  if (!series) return;

  const byDueDate = input.installmentDueDate
    ? await ctx.db.query.billOccurrences.findFirst({
        where: and(
          eq(billOccurrences.clerkUserId, userId),
          eq(billOccurrences.billId, series.id),
          eq(billOccurrences.status, "pending"),
          eq(billOccurrences.dueDate, input.installmentDueDate)
        ),
        orderBy: [asc(billOccurrences.dueDate)],
      })
    : null;

  const pending = byDueDate
    ? byDueDate
    : await ctx.db.query.billOccurrences.findFirst({
        where: and(
          eq(billOccurrences.clerkUserId, userId),
          eq(billOccurrences.billId, series.id),
          eq(billOccurrences.status, "pending")
        ),
        orderBy: [asc(billOccurrences.dueDate)],
      });

  if (!pending) return;
  if (pending.amount !== input.paymentAmount) return;

  await ctx.db
    .update(billOccurrences)
    .set({
      status: "paid",
      paidAt: input.paymentDate,
      loanPaymentId: input.loanPaymentId,
      updatedAt: new Date(),
    })
    .where(and(eq(billOccurrences.id, pending.id), eq(billOccurrences.clerkUserId, userId)));
}

function getInstallmentStatus(installment: LoanInstallmentRecord) {
  if (installment.paidAmount >= installment.amount || installment.status === "paid") {
    return "paid" as const;
  }

  if (installment.dueDate < new Date()) {
    return "overdue" as const;
  }

  return "pending" as const;
}

function deriveInitialInstallmentPaymentState(
  plan: LoanInstallmentInput[],
  outstandingAmount: number,
  principalAmount: number
) {
  const normalizedPlan = deriveInstallmentBreakdown(plan, principalAmount);
  const totalPayable = normalizedPlan.reduce((sum, installment) => sum + installment.amount, 0);
  const installmentRows = normalizedPlan.map((installment, index) => {
    const status: LoanInstallmentRecord["status"] = "pending";
    const principalAmount = installment.principalAmount ?? 0;
    const interestAmount = installment.interestAmount ?? Math.max(installment.amount - principalAmount, 0);

    return {
      id: crypto.randomUUID(),
      sequence: index + 1,
      dueDate: installment.dueDate,
      amount: installment.amount,
      principalAmount,
      interestAmount,
      paidAmount: 0,
      paidPrincipalAmount: 0,
      paidInterestAmount: 0,
      paidAt: null,
      status,
    };
  });

  const normalizedOutstanding = plan.length > 0 ? totalPayable : outstandingAmount;
  const firstPending = installmentRows[0] ?? null;

  return {
    installmentRows,
    totalPayable,
    normalizedOutstanding,
    nextDueDate: firstPending?.dueDate ?? null,
  };
}

function deriveLoanMetrics(loan: LoanRecord, installments: LoanInstallmentRecord[]) {
  const sortedInstallments = [...installments].sort(
    (left, right) => left.dueDate.getTime() - right.dueDate.getTime()
  );
  const totalPayable =
    sortedInstallments.length > 0
      ? sortedInstallments.reduce((sum, installment) => sum + installment.amount, 0)
      : loan.outstandingAmount;
  const financeCharge = Math.max(totalPayable - loan.principalAmount, 0);
  const paidInstallmentCount = sortedInstallments.filter(
    (installment) => getInstallmentStatus(installment) === "paid"
  ).length;
  const derivedOutstandingAmount = getEffectiveOutstandingAmount(loan, sortedInstallments);

  const firstPendingInstallment = sortedInstallments.find(
    (installment) => getInstallmentStatus(installment) !== "paid"
  );
  const derivedNextDueDate = firstPendingInstallment?.dueDate ?? null;
  const derivedStatus: LoanRecord["status"] =
    derivedOutstandingAmount <= 0 ? "closed" : "active";

  return {
    totalPayable,
    financeCharge,
    installmentCount: sortedInstallments.length,
    paidInstallmentCount,
    outstandingAmount: derivedOutstandingAmount,
    nextDueDate: derivedNextDueDate,
    status: derivedStatus,
  };
}

async function getLoanInstallmentsMap(
  ctx: Pick<TRPCContext, "db" | "userId">,
  loanIds: string[]
) {
  const userId = assertUserId(ctx.userId);
  const uniqueIds = Array.from(new Set(loanIds));
  if (uniqueIds.length === 0) {
    return new Map<string, LoanInstallmentRecord[]>();
  }

  const rows = await ctx.db.query.loanInstallments.findMany({
    where: and(
      eq(loanInstallments.clerkUserId, userId),
      inArray(loanInstallments.loanId, uniqueIds)
    ),
    orderBy: [asc(loanInstallments.sequence), asc(loanInstallments.dueDate)],
  });

  const map = new Map<string, LoanInstallmentRecord[]>();
  for (const row of rows) {
    const existing = map.get(row.loanId) ?? [];
    existing.push(row);
    map.set(row.loanId, existing);
  }

  return map;
}

async function getLoanPaymentsMap(
  ctx: Pick<TRPCContext, "db" | "userId">,
  loanIds: string[]
) {
  const userId = assertUserId(ctx.userId);
  const uniqueIds = Array.from(new Set(loanIds));
  if (uniqueIds.length === 0) {
    return new Map<string, LoanPaymentRecord[]>();
  }

  const rows = await ctx.db.query.loanPayments.findMany({
    where: and(eq(loanPayments.clerkUserId, userId), inArray(loanPayments.loanId, uniqueIds)),
    orderBy: [desc(loanPayments.paidAt), desc(loanPayments.createdAt)],
  });

  const map = new Map<string, LoanPaymentRecord[]>();
  for (const row of rows) {
    const existing = map.get(row.loanId) ?? [];
    existing.push(row);
    map.set(row.loanId, existing);
  }

  return map;
}

function enrichLoanRecords(
  loanRows: LoanRecord[],
  installmentsMap: Map<string, LoanInstallmentRecord[]>,
  paymentsMap: Map<string, LoanPaymentRecord[]>
) {
  return loanRows.map((loan) => {
    const installments = installmentsMap.get(loan.id) ?? [];
    const payments = paymentsMap.get(loan.id) ?? [];
    const metrics = deriveLoanMetrics(loan, installments);

    return {
      ...loan,
      status: metrics.status,
      outstandingAmount: metrics.outstandingAmount,
      nextDueDate: metrics.nextDueDate,
      totalPayable: metrics.totalPayable,
      financeCharge: metrics.financeCharge,
      installmentCount: metrics.installmentCount,
      paidInstallmentCount: metrics.paidInstallmentCount,
      installments: installments.map((installment) => ({
        ...installment,
        status: getInstallmentStatus(installment),
        remainingAmount: getInstallmentRemainingAmount(installment),
      })),
      payments,
    };
  });
}

async function resolveLoanAccounts(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: {
    currency: string;
    destinationAccountId: string;
    underlyingLoanAccountId?: string;
  }
) {
  const destinationAccount = await requireUserAccount(
    ctx,
    input.destinationAccountId,
    "Destination account"
  );
  assertAccountType(destinationAccount, ["cash", "wallet"], "Destination account");

  let underlyingLoanAccount: AccountRecord | null = null;

  if (input.underlyingLoanAccountId) {
    underlyingLoanAccount = await requireUserAccount(
      ctx,
      input.underlyingLoanAccountId,
      "Underlying loan account"
    );
    assertAccountType(underlyingLoanAccount, ["loan"], "Underlying loan account");
  }

  const compare = [destinationAccount, ...(underlyingLoanAccount ? [underlyingLoanAccount] : [])];
  assertSameCurrency(
    compare,
    "Loan destination and underlying accounts must use the same currency."
  );

  if (destinationAccount.currency !== input.currency) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loan currency must match the destination account currency.",
    });
  }

  return {
    destinationAccount,
    underlyingLoanAccount,
  };
}

async function resolveCreditLink(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: Pick<
    CreateLoanInput | UpdateLoanInput,
    | "currency"
    | "principalAmount"
    | "repaymentAccountKind"
    | "repaymentAccountId"
    | "creditBalanceTreatment"
    | "creditLinkedOpeningAmount"
    | "defaultPaymentSourceAccountId"
  >
): Promise<CreditLinkResolution> {
  const isCreditLinked = input.repaymentAccountKind === "credit_account";
  const openingAmount = input.creditLinkedOpeningAmount ?? input.principalAmount;

  if (!isCreditLinked) {
    return {
      repaymentAccount: null,
      defaultPaymentSourceAccount: null,
      snapshot: {
        balance: null,
        limit: null,
        available: null,
        utilization: null,
      },
      openingAmount: 0,
      shouldApplyOpeningAdjustment: false,
    };
  }

  if (!input.repaymentAccountId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose the credit account this loan is linked to.",
    });
  }

  if (!input.creditBalanceTreatment) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose how the card balance should be treated at link time.",
    });
  }

  const repaymentAccount = await requireUserAccount(
    ctx,
    input.repaymentAccountId,
    "Linked credit account"
  );
  assertAccountType(repaymentAccount, ["credit"], "Linked credit account");

  if (repaymentAccount.currency !== input.currency) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loan currency must match the linked credit account currency.",
    });
  }

  let defaultPaymentSourceAccount: AccountRecord | null = null;
  if (input.defaultPaymentSourceAccountId) {
    defaultPaymentSourceAccount = await requireUserAccount(
      ctx,
      input.defaultPaymentSourceAccountId,
      "Default payment source account"
    );
    assertAccountType(defaultPaymentSourceAccount, ["cash", "wallet"], "Default payment source account");
    assertSameCurrency(
      [repaymentAccount, defaultPaymentSourceAccount],
      "Linked credit account and default payment source must use matching currencies."
    );
  }

  const snapshot = getCreditAccountSnapshot(repaymentAccount);
  const shouldApplyOpeningAdjustment = input.creditBalanceTreatment === "add_to_credit_balance";

  if (shouldApplyOpeningAdjustment && snapshot.balance + openingAmount > snapshot.limit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This linked loan would push the card above its credit limit. Update the loan amount or card balance first; the credit limit is only changed manually.",
    });
  }

  return {
    repaymentAccount,
    defaultPaymentSourceAccount,
    snapshot,
    openingAmount,
    shouldApplyOpeningAdjustment,
  };
}

async function recordLoanDisbursementEvent(
  ctx: Pick<TRPCContext, "db">,
  input: {
    userId: string;
    loanName: string;
    date: Date;
    currency: string;
    amount: number;
    loanAccount: AccountRecord;
    destinationAccount: AccountRecord;
  }
) {
  const eventId = crypto.randomUUID();
  const entries = [
    {
      id: crypto.randomUUID(),
      clerkUserId: input.userId,
      eventId,
      accountId: input.loanAccount.id,
      role: "loan_account" as const,
      amountDelta: input.amount,
      currency: input.currency,
    },
    {
      id: crypto.randomUUID(),
      clerkUserId: input.userId,
      eventId,
      accountId: input.destinationAccount.id,
      role: "disbursement_account" as const,
      amountDelta: input.amount,
      currency: input.currency,
    },
  ];

  let eventInserted = false;
  let balanceAppliedEntries: BalanceEntry[] = [];

  try {
    await ctx.db.insert(transactionEvents).values({
      id: eventId,
      clerkUserId: input.userId,
      type: "loan_disbursement",
      currency: input.currency,
      amount: input.amount,
      feeAmount: 0,
      budgetId: null,
      categoryId: null,
      description: `Loan disbursement · ${input.loanName}`,
      notes: null,
      occurredAt: input.date,
    });
    eventInserted = true;

    await ctx.db.insert(ledgerEntries).values(entries);

    balanceAppliedEntries = await applyBalanceEntries(ctx, input.userId, [
      { accountId: input.loanAccount.id, amountDelta: input.amount },
      { accountId: input.destinationAccount.id, amountDelta: input.amount },
    ]);
  } catch (error) {
    if (balanceAppliedEntries.length > 0) {
      await rollbackBalanceEntries(ctx, input.userId, balanceAppliedEntries).catch(() => undefined);
    }

    if (eventInserted) {
      await ctx.db.delete(transactionEvents).where(eq(transactionEvents.id, eventId)).catch(() => undefined);
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to record opening loan disbursement.",
      cause: error,
    });
  }

  return eventId;
}

export async function listLoans(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: ListLoansInput
) {
  const userId = assertUserId(ctx.userId);
  const normalizedSearch = input.search.trim();
  const searchTerm = `%${normalizedSearch}%`;

  const filters = [
    eq(loans.clerkUserId, userId),
    input.status === "all" ? undefined : eq(loans.status, input.status),
    normalizedSearch
      ? or(
          ilike(loans.name, searchTerm),
          ilike(loans.lenderName, searchTerm),
          ilike(loans.notes, searchTerm)
        )
      : undefined,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  const whereClause = and(...filters);
  const page = input.page;
  const pageSize = input.pageSize;

  const [countRow] = await ctx.db
    .select({
      totalCount: sql<number>`count(*)`,
    })
    .from(loans)
    .where(whereClause);

  const totalCount = Number(countRow?.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;

  const loanRows = await ctx.db.query.loans.findMany({
    where: whereClause,
    orderBy: [desc(loans.disbursedAt), desc(loans.createdAt)],
    limit: pageSize,
    offset: safeOffset,
  });
  const installmentsMap = await getLoanInstallmentsMap(
    ctx,
    loanRows.map((loan) => loan.id)
  );
  const paymentsMap = await getLoanPaymentsMap(
    ctx,
    loanRows.map((loan) => loan.id)
  );
  const items = enrichLoanRecords(loanRows, installmentsMap, paymentsMap);

  return {
    items,
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
  };
}

export async function getLoan(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetLoanInput
) {
  const loan = await requireLoan(ctx, input.id);
  const installmentsMap = await getLoanInstallmentsMap(ctx, [loan.id]);
  const paymentsMap = await getLoanPaymentsMap(ctx, [loan.id]);
  const [enriched] = enrichLoanRecords([loan], installmentsMap, paymentsMap);

  if (!enriched) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Loan not found.",
    });
  }

  return enriched;
}

export async function getLoansSummary(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const dueSoonDate = new Date(now);
  dueSoonDate.setDate(dueSoonDate.getDate() + 7);

  const loanRows = await ctx.db.query.loans.findMany({
    where: eq(loans.clerkUserId, userId),
    orderBy: [desc(loans.createdAt)],
  });
  const installmentsMap = await getLoanInstallmentsMap(
    ctx,
    loanRows.map((loan) => loan.id)
  );
  const paymentsMap = await getLoanPaymentsMap(
    ctx,
    loanRows.map((loan) => loan.id)
  );
  const enrichedLoans = enrichLoanRecords(loanRows, installmentsMap, paymentsMap);
  const activeLoans = enrichedLoans.filter((loan) => loan.status === "active");
  const dueSoonLoans = activeLoans.filter(
    (loan) =>
      loan.nextDueDate &&
      loan.nextDueDate >= now &&
      loan.nextDueDate <= dueSoonDate &&
      loan.outstandingAmount > 0
  );
  const nextDueLoan =
    activeLoans
      .filter((loan) => loan.nextDueDate && loan.nextDueDate >= now)
      .sort((left, right) => {
        const leftTime = left.nextDueDate?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightTime = right.nextDueDate?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftTime - rightTime;
      })[0] ?? null;
  const totalOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstandingAmount, 0);

  return {
    totalLoans: enrichedLoans.length,
    activeLoans: activeLoans.length,
    closedLoans: enrichedLoans.filter((loan) => loan.status === "closed").length,
    totalOutstanding,
    dueSoonCount: dueSoonLoans.length,
    nextDueLoan: nextDueLoan
      ? {
          id: nextDueLoan.id,
          name: nextDueLoan.name,
          nextDueDate: nextDueLoan.nextDueDate,
          outstandingAmount: nextDueLoan.outstandingAmount,
          currency: nextDueLoan.currency,
        }
      : null,
  };
}

export async function createLoan(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateLoanInput
) {
  const userId = assertUserId(ctx.userId);
  assertLoanState(input);
  const isCreditLinked = input.repaymentAccountKind === "credit_account";

  let accountResolution = await resolveLoanAccounts(ctx, {
    currency: input.currency,
    destinationAccountId: input.destinationAccountId,
    underlyingLoanAccountId: input.underlyingLoanAccountId,
  });
  const creditLink = await resolveCreditLink(ctx, input);

  let createdUnderlyingLoanAccountId: string | null = null;

  if (!isCreditLinked && !accountResolution.underlyingLoanAccount && input.autoCreateUnderlyingAccount) {
    const createdAccountId = crypto.randomUUID();

    const [createdAccount] = await ctx.db
      .insert(accounts)
      .values({
        id: createdAccountId,
        clerkUserId: userId,
        name: input.name,
        currency: input.currency,
        institution: input.lenderName,
        type: "loan",
        balance: input.createOpeningDisbursement ? 0 : input.outstandingAmount,
        creditLimit: 0,
      })
      .returning();

    if (!createdAccount) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create underlying loan account.",
      });
    }

    createdUnderlyingLoanAccountId = createdAccount.id;

    accountResolution = {
      ...accountResolution,
      underlyingLoanAccount: createdAccount,
    };
  }

  if (!isCreditLinked && !accountResolution.underlyingLoanAccount) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A loan account is required to create a loan record.",
    });
  }

  if (
    accountResolution.underlyingLoanAccount &&
    accountResolution.underlyingLoanAccount.id === accountResolution.destinationAccount.id
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loan account and destination account must be different.",
    });
  }

  const loanId = crypto.randomUUID();
  let loanInserted = false;
  let openingEventId: string | null = null;
  const normalizedRepaymentPlan = normalizeRepaymentPlan(input.repaymentPlan);
  const initialScheduleState = deriveInitialInstallmentPaymentState(
    normalizedRepaymentPlan,
    input.outstandingAmount,
    input.principalAmount
  );
  const startingOutstanding =
    normalizedRepaymentPlan.length > 0
      ? initialScheduleState.normalizedOutstanding
      : input.outstandingAmount;
  const startingStatus = startingOutstanding <= 0 ? "closed" : input.status;
  const startingNextDueDate =
    input.nextDueDate ??
    (normalizedRepaymentPlan.length > 0
      ? initialScheduleState.nextDueDate
      : normalizedRepaymentPlan[0]?.dueDate ?? null);
  let linkedBillSynced = false;
  let creditOpeningAdjustmentApplied = false;

  try {
    if (
      accountResolution.underlyingLoanAccount &&
      !input.createOpeningDisbursement &&
      accountResolution.underlyingLoanAccount.balance !== startingOutstanding
    ) {
      await ctx.db
        .update(accounts)
        .set({
          balance: startingOutstanding,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accounts.id, accountResolution.underlyingLoanAccount.id),
            eq(accounts.clerkUserId, userId)
          )
        );
    }

    if (creditLink.shouldApplyOpeningAdjustment && creditLink.repaymentAccount) {
      await ctx.db
        .update(accounts)
        .set({
          balance: sql`${accounts.balance} + ${creditLink.openingAmount}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accounts.id, creditLink.repaymentAccount.id),
            eq(accounts.clerkUserId, userId),
            sql`${accounts.balance} + ${creditLink.openingAmount} <= ${accounts.creditLimit}`
          )
        )
        .returning({ id: accounts.id })
        .then(([updatedAccount]) => {
          if (!updatedAccount) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "This linked loan would push the card above its credit limit. The card balance was not changed.",
            });
          }
        });
      creditOpeningAdjustmentApplied = true;
    }

    await ctx.db.insert(loans).values({
      id: loanId,
      clerkUserId: userId,
      kind: input.kind,
      name: input.name,
      lenderName: input.lenderName,
      currency: input.currency,
      principalAmount: input.principalAmount,
      outstandingAmount: startingOutstanding,
      disbursedAt: input.disbursedAt,
      status: startingStatus,
      destinationAccountId: accountResolution.destinationAccount.id,
      underlyingLoanAccountId: accountResolution.underlyingLoanAccount?.id ?? null,
      repaymentAccountId: creditLink.repaymentAccount?.id ?? null,
      repaymentAccountKind: input.repaymentAccountKind,
      liabilityTreatment: input.liabilityTreatment,
      creditBalanceTreatment: input.creditBalanceTreatment ?? null,
      creditLinkedOpeningAmount: creditLink.openingAmount,
      creditBalanceAtLink: creditLink.snapshot.balance,
      creditLimitAtLink: creditLink.snapshot.limit,
      creditAvailableAtLink: creditLink.snapshot.available,
      creditUtilizationAtLink: creditLink.snapshot.utilization,
      creditOpeningAdjustmentApplied,
      defaultPaymentSourceAccountId: creditLink.defaultPaymentSourceAccount?.id ?? null,
      cadence: input.cadence ?? null,
      nextDueDate: startingNextDueDate,
      notes: input.notes || null,
      metadata: input.metadata || null,
    });
    loanInserted = true;

    if (normalizedRepaymentPlan.length > 0) {
      await ctx.db.insert(loanInstallments).values(
        initialScheduleState.installmentRows.map((installment) => ({
          id: installment.id,
          clerkUserId: userId,
          loanId,
          sequence: installment.sequence,
          dueDate: installment.dueDate,
          amount: installment.amount,
          principalAmount: installment.principalAmount,
          interestAmount: installment.interestAmount,
          paidAmount: installment.paidAmount,
          paidPrincipalAmount: installment.paidPrincipalAmount,
          paidInterestAmount: installment.paidInterestAmount,
          paidAt: installment.paidAt,
          status: installment.status,
        }))
      );
    }

    if (input.createOpeningDisbursement) {
      const openingAmount = input.openingDisbursementAmount ?? input.principalAmount;
      if (!accountResolution.underlyingLoanAccount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Opening disbursement requires an underlying loan account.",
        });
      }
      openingEventId = await recordLoanDisbursementEvent(ctx, {
        userId,
        loanName: input.name,
        date: input.disbursedAt,
        currency: input.currency,
        amount: openingAmount,
        loanAccount: accountResolution.underlyingLoanAccount,
        destinationAccount: accountResolution.destinationAccount,
      });
    }

    if (normalizedRepaymentPlan.length > 0) {
      const createdLoan = await requireLoan(ctx, loanId, "Loan was not found after create.");
      const createdInstallments = await ctx.db.query.loanInstallments.findMany({
        where: and(eq(loanInstallments.loanId, loanId), eq(loanInstallments.clerkUserId, userId)),
        orderBy: [asc(loanInstallments.sequence), asc(loanInstallments.dueDate)],
      });
      await syncLinkedLoanBillSeries(ctx, createdLoan, createdInstallments);
      linkedBillSynced = true;
    }
  } catch (error) {
    if (creditOpeningAdjustmentApplied && creditLink.repaymentAccount) {
      await ctx.db
        .update(accounts)
        .set({
          balance: sql`${accounts.balance} - ${creditLink.openingAmount}`,
          updatedAt: new Date(),
        })
        .where(and(eq(accounts.id, creditLink.repaymentAccount.id), eq(accounts.clerkUserId, userId)))
        .catch(() => undefined);
    }

    if (loanInserted) {
      if (linkedBillSynced) {
        await ctx.db
          .delete(billSeries)
          .where(
            and(
              eq(billSeries.clerkUserId, userId),
              eq(billSeries.loanId, loanId),
              eq(billSeries.obligationType, "loan_repayment")
            )
          )
          .catch(() => undefined);
      }
      await ctx.db.delete(loans).where(eq(loans.id, loanId)).catch(() => undefined);
    }

    if (createdUnderlyingLoanAccountId) {
      await ctx.db.delete(accounts).where(eq(accounts.id, createdUnderlyingLoanAccountId)).catch(() => undefined);
    }

    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create loan.",
      cause: error,
    });
  }

  return {
    loanId,
    underlyingLoanAccountId: accountResolution.underlyingLoanAccount?.id ?? null,
    openingDisbursementEventId: openingEventId,
  };
}

export async function updateLoan(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateLoanInput
) {
  const userId = assertUserId(ctx.userId);
  const existing = await requireLoan(ctx, input.id);
  assertLoanState(input);
  const isCreditLinked = input.repaymentAccountKind === "credit_account";

  if (input.repaymentAccountKind !== existing.repaymentAccountKind) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loan repayment account kind is fixed after creation to preserve the original link snapshot.",
    });
  }

  const accountResolution = await resolveLoanAccounts(ctx, {
    currency: input.currency,
    destinationAccountId: input.destinationAccountId,
    underlyingLoanAccountId: input.underlyingLoanAccountId,
  });
  const creditLink = await resolveCreditLink(ctx, input);

  if (
    accountResolution.underlyingLoanAccount &&
    accountResolution.underlyingLoanAccount.id === accountResolution.destinationAccount.id
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loan account and destination account must be different.",
    });
  }

  const normalizedRepaymentPlan = normalizeRepaymentPlan(input.repaymentPlan);
  const initialScheduleState = deriveInitialInstallmentPaymentState(
    normalizedRepaymentPlan,
    input.outstandingAmount,
    input.principalAmount
  );
  const normalizedOutstanding =
    normalizedRepaymentPlan.length > 0
      ? initialScheduleState.normalizedOutstanding
      : input.outstandingAmount;
  const normalizedStatus = normalizedOutstanding <= 0 ? "closed" : input.status;
  const normalizedNextDueDate =
    input.nextDueDate ??
    (normalizedRepaymentPlan.length > 0
      ? initialScheduleState.nextDueDate
      : normalizedRepaymentPlan[0]?.dueDate ?? null);

  const [updated] = await ctx.db
    .update(loans)
    .set({
      kind: input.kind,
      name: input.name,
      lenderName: input.lenderName,
      currency: input.currency,
      principalAmount: input.principalAmount,
      outstandingAmount: normalizedOutstanding,
      disbursedAt: input.disbursedAt,
      status: normalizedStatus,
      destinationAccountId: input.destinationAccountId,
      underlyingLoanAccountId: input.underlyingLoanAccountId ?? null,
      repaymentAccountId: isCreditLinked ? creditLink.repaymentAccount?.id ?? null : null,
      repaymentAccountKind: input.repaymentAccountKind,
      liabilityTreatment: input.liabilityTreatment,
      creditBalanceTreatment: isCreditLinked ? input.creditBalanceTreatment ?? null : null,
      creditLinkedOpeningAmount: isCreditLinked
        ? existing.creditLinkedOpeningAmount
        : 0,
      creditBalanceAtLink: isCreditLinked ? existing.creditBalanceAtLink : null,
      creditLimitAtLink: isCreditLinked ? existing.creditLimitAtLink : null,
      creditAvailableAtLink: isCreditLinked ? existing.creditAvailableAtLink : null,
      creditUtilizationAtLink: isCreditLinked ? existing.creditUtilizationAtLink : null,
      creditOpeningAdjustmentApplied: isCreditLinked
        ? existing.creditOpeningAdjustmentApplied
        : false,
      defaultPaymentSourceAccountId: creditLink.defaultPaymentSourceAccount?.id ?? null,
      cadence: input.cadence ?? null,
      nextDueDate: normalizedNextDueDate,
      notes: input.notes || null,
      metadata: input.metadata || null,
      updatedAt: new Date(),
    })
    .where(and(eq(loans.id, existing.id), eq(loans.clerkUserId, userId)))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update loan.",
    });
  }

  if (updated.underlyingLoanAccountId) {
    await ctx.db
      .update(accounts)
      .set({
        balance: normalizedOutstanding,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accounts.id, updated.underlyingLoanAccountId),
          eq(accounts.clerkUserId, userId)
        )
      );
  }

  await ctx.db
    .delete(loanInstallments)
    .where(and(eq(loanInstallments.loanId, existing.id), eq(loanInstallments.clerkUserId, userId)));

  if (normalizedRepaymentPlan.length > 0) {
    await ctx.db.insert(loanInstallments).values(
      initialScheduleState.installmentRows.map((installment) => ({
        id: installment.id,
        clerkUserId: userId,
        loanId: existing.id,
        sequence: installment.sequence,
        dueDate: installment.dueDate,
        amount: installment.amount,
        principalAmount: installment.principalAmount,
        interestAmount: installment.interestAmount,
        paidAmount: installment.paidAmount,
        paidPrincipalAmount: installment.paidPrincipalAmount,
        paidInterestAmount: installment.paidInterestAmount,
        paidAt: installment.paidAt,
        status: installment.status,
      }))
    );
  }

  const refreshedInstallments = await ctx.db.query.loanInstallments.findMany({
    where: and(eq(loanInstallments.loanId, existing.id), eq(loanInstallments.clerkUserId, userId)),
    orderBy: [asc(loanInstallments.sequence), asc(loanInstallments.dueDate)],
  });
  await syncLinkedLoanBillSeries(ctx, updated, refreshedInstallments);

  const installmentsMap = await getLoanInstallmentsMap(ctx, [existing.id]);
  const paymentsMap = await getLoanPaymentsMap(ctx, [existing.id]);
  const [enrichedLoan] = enrichLoanRecords([updated], installmentsMap, paymentsMap);

  return {
    loan: enrichedLoan ?? updated,
  };
}

export async function recordLoanPayment(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: RecordLoanPaymentInput
) {
  const userId = assertUserId(ctx.userId);
  const loan = await requireLoan(ctx, input.loanId, "Loan not found.");

  if (loan.status === "closed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This loan is already closed.",
    });
  }

  const isCreditLinked = loan.repaymentAccountKind === "credit_account";
  const repaymentAccountId = isCreditLinked ? loan.repaymentAccountId : loan.underlyingLoanAccountId;

  if (!repaymentAccountId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: isCreditLinked
        ? "Loan has no linked credit account configured."
        : "Loan has no underlying account configured.",
    });
  }

  const sourceAccount = await requireUserAccount(ctx, input.sourceAccountId, "Payment account");
  const repaymentAccount = await requireUserAccount(
    ctx,
    repaymentAccountId,
    isCreditLinked ? "Linked credit account" : "Underlying loan account"
  );

  assertAccountType(sourceAccount, ["cash", "wallet"], "Payment account");
  assertAccountType(
    repaymentAccount,
    isCreditLinked ? ["credit"] : ["loan"],
    isCreditLinked ? "Linked credit account" : "Underlying loan account"
  );
  assertSameCurrency(
    [sourceAccount, repaymentAccount],
    isCreditLinked
      ? "Payment account and linked credit account must use matching currencies."
      : "Payment account and loan account must use matching currencies."
  );

  const installments = await ctx.db.query.loanInstallments.findMany({
    where: and(eq(loanInstallments.loanId, loan.id), eq(loanInstallments.clerkUserId, userId)),
    orderBy: [asc(loanInstallments.sequence), asc(loanInstallments.dueDate)],
  });

  if (input.installmentId && !installments.some((installment) => installment.id === input.installmentId)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Installment not found for this loan.",
    });
  }

  const duplicateWindowStart = new Date(Date.now() - 30 * 1000);
  const duplicatePayment = await ctx.db.query.loanPayments.findFirst({
    where: and(
      eq(loanPayments.clerkUserId, userId),
      eq(loanPayments.loanId, loan.id),
      eq(loanPayments.sourceAccountId, input.sourceAccountId),
      eq(loanPayments.amount, input.amount),
      eq(loanPayments.paidAt, input.paidAt),
      input.notes ? eq(loanPayments.notes, input.notes) : isNull(loanPayments.notes),
      gte(loanPayments.createdAt, duplicateWindowStart)
    ),
    orderBy: [desc(loanPayments.createdAt)],
  });

  if (duplicatePayment) {
    const updatedLoan = await requireLoan(ctx, loan.id, "Loan not found after payment.");
    const installmentsMap = await getLoanInstallmentsMap(ctx, [loan.id]);
    const paymentsMap = await getLoanPaymentsMap(ctx, [loan.id]);
    const [enrichedLoan] = enrichLoanRecords([updatedLoan], installmentsMap, paymentsMap);
    const allocatedToSchedule = duplicatePayment.principalAmount + duplicatePayment.interestAmount;
    return {
      loan: enrichedLoan ?? updatedLoan,
      appliedAmount: duplicatePayment.appliedAmount,
      allocatedToSchedule,
      unappliedAmount: Math.max(duplicatePayment.amount - allocatedToSchedule, 0),
    };
  }

  const outstandingBefore = getEffectiveOutstandingAmount(loan, installments);
  if (outstandingBefore <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This loan is already closed.",
    });
  }

  const effectivePaymentAmount = Math.min(input.amount, outstandingBefore);
  const paymentDate = input.paidAt;
  const requestedAmount = effectivePaymentAmount;
  let remainingToAllocate = requestedAmount;

  const startSequence =
    input.installmentId
      ? installments.find((installment) => installment.id === input.installmentId)?.sequence ?? 1
      : 1;
  const touchedInstallments: Array<{
    before: LoanInstallmentRecord;
    after: LoanInstallmentRecord;
  }> = [];
  let appliedPrincipalAmount = 0;
  let appliedInterestAmount = 0;

  for (const installment of installments) {
    if (installment.sequence < startSequence) {
      continue;
    }

    if (remainingToAllocate <= 0) {
      break;
    }

    const remainingForInstallment = getInstallmentRemainingAmount(installment);
    if (remainingForInstallment <= 0) {
      continue;
    }

    const allocatedAmount = Math.min(remainingForInstallment, remainingToAllocate);
    remainingToAllocate -= allocatedAmount;
    const remainingPrincipalBefore = Math.max(installment.principalAmount - installment.paidPrincipalAmount, 0);
    const remainingInterestBefore = Math.max(installment.interestAmount - installment.paidInterestAmount, 0);
    let principalShare = remainingForInstallment > 0
      ? Math.min(
          remainingPrincipalBefore,
          Math.round((allocatedAmount * remainingPrincipalBefore) / remainingForInstallment)
        )
      : 0;
    let interestShare = Math.max(allocatedAmount - principalShare, 0);
    if (interestShare > remainingInterestBefore) {
      const overflow = interestShare - remainingInterestBefore;
      interestShare = remainingInterestBefore;
      const extraPrincipal = Math.min(overflow, remainingPrincipalBefore - principalShare);
      principalShare += extraPrincipal;
    }

    const nextPaidAmount = installment.paidAmount + allocatedAmount;
    const nextPaidPrincipalAmount = installment.paidPrincipalAmount + principalShare;
    const nextPaidInterestAmount = installment.paidInterestAmount + interestShare;
    const isPaid = nextPaidAmount >= installment.amount;
    const nextStatus = isPaid ? "paid" : "pending";
    const nextPaidAt = isPaid ? paymentDate : installment.paidAt;

    await ctx.db
      .update(loanInstallments)
      .set({
        paidAmount: nextPaidAmount,
        paidPrincipalAmount: nextPaidPrincipalAmount,
        paidInterestAmount: nextPaidInterestAmount,
        paidAt: nextPaidAt,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(loanInstallments.id, installment.id), eq(loanInstallments.clerkUserId, userId)));

    appliedPrincipalAmount += principalShare;
    appliedInterestAmount += interestShare;

    touchedInstallments.push({
      before: installment,
      after: {
        ...installment,
        paidAmount: nextPaidAmount,
        paidPrincipalAmount: nextPaidPrincipalAmount,
        paidInterestAmount: nextPaidInterestAmount,
        paidAt: nextPaidAt,
        status: nextStatus,
        updatedAt: new Date(),
      },
    });
  }

  const allocatedToSchedule = requestedAmount - remainingToAllocate;
  const outstandingAfter = Math.max(outstandingBefore - requestedAmount, 0);

  const refreshedInstallments = touchedInstallments.length
    ? await ctx.db.query.loanInstallments.findMany({
        where: and(eq(loanInstallments.loanId, loan.id), eq(loanInstallments.clerkUserId, userId)),
        orderBy: [asc(loanInstallments.sequence), asc(loanInstallments.dueDate)],
      })
    : installments;
  const nextPendingInstallment = refreshedInstallments.find(
    (installment) => getInstallmentStatus(installment) !== "paid"
  );
  const nextDueDate = nextPendingInstallment?.dueDate ?? null;

  const renderedPaymentAmount = (requestedAmount / 1000).toFixed(2);
  const newNoteLine =
    `[${paymentDate.toISOString().slice(0, 10)}] Loan payment ${renderedPaymentAmount}` +
    (input.notes ? ` · ${input.notes}` : "");
  const mergedNotes = [loan.notes, newNoteLine].filter(Boolean).join("\n");
  const targetInstallmentId = input.installmentId ?? touchedInstallments[0]?.after.id ?? null;
  const paymentRecordId = crypto.randomUUID();
  const targetInstallment = touchedInstallments[0]?.after ?? null;

  let balanceAppliedEntries: BalanceEntry[] = [];
  const repaymentBalanceBefore = repaymentAccount.balance;
  try {
    balanceAppliedEntries = await applyBalanceEntries(ctx, userId, [
      { accountId: sourceAccount.id, amountDelta: -requestedAmount },
    ]);

    const [updatedRepaymentAccount] = isCreditLinked
      ? await ctx.db
          .update(accounts)
          .set({
            balance: sql`${accounts.balance} - ${requestedAmount}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(accounts.id, repaymentAccount.id),
              eq(accounts.clerkUserId, userId),
              sql`${accounts.balance} - ${requestedAmount} >= 0`
            )
          )
          .returning({ id: accounts.id })
      : await ctx.db
          .update(accounts)
          .set({
            balance: outstandingAfter,
            updatedAt: new Date(),
          })
          .where(and(eq(accounts.id, repaymentAccount.id), eq(accounts.clerkUserId, userId)))
          .returning({ id: accounts.id });

    if (!updatedRepaymentAccount) {
      throw new TRPCError({
        code: isCreditLinked ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
        message: isCreditLinked
          ? "This payment would make the linked credit account balance negative. The card balance was not changed."
          : "Failed to update loan account balance.",
      });
    }

    await ctx.db
      .update(loans)
      .set({
        outstandingAmount: outstandingAfter,
        status: outstandingAfter <= 0 ? "closed" : "active",
        nextDueDate,
        notes: mergedNotes || null,
        updatedAt: new Date(),
      })
      .where(and(eq(loans.id, loan.id), eq(loans.clerkUserId, userId)));

    await ctx.db.insert(loanPayments).values({
      id: paymentRecordId,
      clerkUserId: userId,
      loanId: loan.id,
      installmentId: targetInstallmentId,
      sourceAccountId: sourceAccount.id,
      amount: requestedAmount,
      appliedAmount: effectivePaymentAmount,
      principalAmount: appliedPrincipalAmount,
      interestAmount: appliedInterestAmount,
      paidAt: paymentDate,
      notes: input.notes || null,
    });

    await settleLinkedBillOccurrenceForLoanPayment(ctx, {
      loanId: loan.id,
      installmentDueDate: targetInstallment?.dueDate ?? null,
      paymentAmount: requestedAmount,
      paymentDate,
      loanPaymentId: paymentRecordId,
    });
  } catch (error) {
    for (const touched of touchedInstallments) {
      await ctx.db
        .update(loanInstallments)
        .set({
          paidAmount: touched.before.paidAmount,
          paidPrincipalAmount: touched.before.paidPrincipalAmount,
          paidInterestAmount: touched.before.paidInterestAmount,
          paidAt: touched.before.paidAt,
          status: touched.before.status,
          updatedAt: touched.before.updatedAt,
        })
        .where(and(eq(loanInstallments.id, touched.before.id), eq(loanInstallments.clerkUserId, userId)))
        .catch(() => undefined);
    }
    if (balanceAppliedEntries.length > 0) {
      await rollbackBalanceEntries(ctx, userId, balanceAppliedEntries).catch(() => undefined);
    }
    await ctx.db
      .update(accounts)
      .set({
        balance: repaymentBalanceBefore,
        updatedAt: new Date(),
      })
        .where(and(eq(accounts.id, repaymentAccount.id), eq(accounts.clerkUserId, userId)))
      .catch(() => undefined);
    if (error instanceof TRPCError) {
      throw error;
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to record loan payment.",
      cause: error,
    });
  }

  const updatedLoan = await requireLoan(ctx, loan.id, "Loan not found after payment.");
  const installmentsMap = await getLoanInstallmentsMap(ctx, [loan.id]);
  const paymentsMap = await getLoanPaymentsMap(ctx, [loan.id]);
  const [enrichedLoan] = enrichLoanRecords([updatedLoan], installmentsMap, paymentsMap);
  await syncLinkedLoanBillSeries(ctx, updatedLoan, installmentsMap.get(loan.id) ?? []);

  return {
    loan: enrichedLoan ?? updatedLoan,
    appliedAmount: effectivePaymentAmount,
    allocatedToSchedule,
    unappliedAmount: remainingToAllocate,
  };
}

export async function deleteLoan(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteLoanInput
) {
  const existing = await requireLoan(ctx, input.id);
  const userId = assertUserId(ctx.userId);

  await ctx.db
    .update(billSeries)
    .set({
      obligationType: "general",
      loanId: null,
      loanInstallmentId: null,
      isActive: false,
      nextDueDate: null,
      remainingOccurrences: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(billSeries.clerkUserId, userId),
        eq(billSeries.loanId, existing.id),
        eq(billSeries.obligationType, "loan_repayment")
      )
    );
  const linkedLoanAccountIds = new Set<string>();
  if (existing.underlyingLoanAccountId) {
    linkedLoanAccountIds.add(existing.underlyingLoanAccountId);
  }

  const openingDisbursementDescription = `Loan disbursement · ${existing.name}`;
  const openingEvents = await ctx.db.query.transactionEvents.findMany({
    where: and(
      eq(transactionEvents.clerkUserId, userId),
      eq(transactionEvents.type, "loan_disbursement"),
      eq(transactionEvents.description, openingDisbursementDescription)
    ),
    orderBy: [desc(transactionEvents.createdAt)],
  });

  for (const event of openingEvents) {
    const entries = await ctx.db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.eventId, event.id),
        eq(ledgerEntries.clerkUserId, userId)
      ),
    });

    const eventLoanAccountIds = entries
      .filter((entry) => entry.role === "loan_account")
      .map((entry) => entry.accountId);
    const hasDestinationLink = entries.some(
      (entry) =>
        entry.role === "disbursement_account" &&
        entry.accountId === existing.destinationAccountId
    );
    const hasExplicitUnderlyingLink = existing.underlyingLoanAccountId
      ? eventLoanAccountIds.includes(existing.underlyingLoanAccountId)
      : false;
    const hasLoanAccountEntry = eventLoanAccountIds.length > 0;
    const hasLoanLink =
      hasDestinationLink &&
      (hasExplicitUnderlyingLink || (!existing.underlyingLoanAccountId && hasLoanAccountEntry));

    if (!hasLoanLink) {
      continue;
    }

    for (const loanAccountId of eventLoanAccountIds) {
      linkedLoanAccountIds.add(loanAccountId);
    }

    for (const entry of entries) {
      await ctx.db
        .update(accounts)
        .set({
          balance: sql`${accounts.balance} - ${entry.amountDelta}`,
          updatedAt: new Date(),
        })
        .where(and(eq(accounts.id, entry.accountId), eq(accounts.clerkUserId, userId)));
    }

    await ctx.db
      .delete(transactionEvents)
      .where(and(eq(transactionEvents.id, event.id), eq(transactionEvents.clerkUserId, userId)));
  }

  await ctx.db.delete(loans).where(and(eq(loans.id, existing.id), eq(loans.clerkUserId, userId)));

  for (const loanAccountId of linkedLoanAccountIds) {
    await ctx.db
      .delete(accounts)
      .where(
        and(
          eq(accounts.id, loanAccountId),
          eq(accounts.clerkUserId, userId),
          eq(accounts.type, "loan")
        )
      );
  }

  return {
    success: true,
  };
}
