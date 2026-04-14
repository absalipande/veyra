import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { accounts, ledgerEntries, loanInstallments, loans, transactionEvents } from "@/db/schema";
import {
  createLoanSchema,
  deleteLoanSchema,
  getLoanSchema,
  listLoansSchema,
  updateLoanSchema,
} from "@/features/loans/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type ListLoansInput = z.infer<typeof listLoansSchema>;
type GetLoanInput = z.infer<typeof getLoanSchema>;
type CreateLoanInput = z.infer<typeof createLoanSchema>;
type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
type DeleteLoanInput = z.infer<typeof deleteLoanSchema>;
type LoanInstallmentInput = CreateLoanInput["repaymentPlan"][number];

type AccountRecord = typeof accounts.$inferSelect;

type BalanceEntry = {
  accountId: string;
  amountDelta: number;
};

type LoanRecord = typeof loans.$inferSelect;
type LoanInstallmentRecord = typeof loanInstallments.$inferSelect;

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

async function applyBalanceEntries(
  ctx: Pick<TRPCContext, "db">,
  userId: string,
  entries: BalanceEntry[]
) {
  const appliedEntries: BalanceEntry[] = [];

  for (const entry of entries) {
    await ctx.db
      .update(accounts)
      .set({
        balance: sql`${accounts.balance} + ${entry.amountDelta}`,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, entry.accountId), eq(accounts.clerkUserId, userId)));

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

function deriveLoanMetrics(loan: LoanRecord, installments: LoanInstallmentRecord[]) {
  const sortedInstallments = [...installments].sort(
    (left, right) => left.dueDate.getTime() - right.dueDate.getTime()
  );
  const totalPayable =
    sortedInstallments.length > 0
      ? sortedInstallments.reduce((sum, installment) => sum + installment.amount, 0)
      : loan.outstandingAmount;
  const financeCharge = Math.max(totalPayable - loan.principalAmount, 0);

  const now = new Date();
  const derivedNextDueDate =
    sortedInstallments.find((installment) => installment.dueDate >= now)?.dueDate ?? loan.nextDueDate;

  return {
    totalPayable,
    financeCharge,
    installmentCount: sortedInstallments.length,
    nextDueDate: derivedNextDueDate,
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

function enrichLoanRecords(
  loanRows: LoanRecord[],
  installmentsMap: Map<string, LoanInstallmentRecord[]>
) {
  return loanRows.map((loan) => {
    const installments = installmentsMap.get(loan.id) ?? [];
    const metrics = deriveLoanMetrics(loan, installments);

    return {
      ...loan,
      nextDueDate: metrics.nextDueDate,
      totalPayable: metrics.totalPayable,
      financeCharge: metrics.financeCharge,
      installmentCount: metrics.installmentCount,
      installments,
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
  const items = enrichLoanRecords(loanRows, installmentsMap);

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
  const [enriched] = enrichLoanRecords([loan], installmentsMap);

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
  const enrichedLoans = enrichLoanRecords(loanRows, installmentsMap);
  const activeLoans = enrichedLoans.filter((loan) => loan.status === "active");
  const dueSoonLoans = activeLoans.filter(
    (loan) => loan.nextDueDate && loan.nextDueDate <= dueSoonDate
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

  let accountResolution = await resolveLoanAccounts(ctx, {
    currency: input.currency,
    destinationAccountId: input.destinationAccountId,
    underlyingLoanAccountId: input.underlyingLoanAccountId,
  });

  let createdUnderlyingLoanAccountId: string | null = null;

  if (!accountResolution.underlyingLoanAccount && input.autoCreateUnderlyingAccount) {
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

  if (!accountResolution.underlyingLoanAccount) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A loan account is required to create a loan record.",
    });
  }

  if (accountResolution.underlyingLoanAccount.id === accountResolution.destinationAccount.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loan account and destination account must be different.",
    });
  }

  const loanId = crypto.randomUUID();
  let loanInserted = false;
  let openingEventId: string | null = null;
  const normalizedRepaymentPlan = normalizeRepaymentPlan(input.repaymentPlan);

  try {
    await ctx.db.insert(loans).values({
      id: loanId,
      clerkUserId: userId,
      kind: input.kind,
      name: input.name,
      lenderName: input.lenderName,
      currency: input.currency,
      principalAmount: input.principalAmount,
      outstandingAmount: input.outstandingAmount,
      disbursedAt: input.disbursedAt,
      status: input.status,
      destinationAccountId: accountResolution.destinationAccount.id,
      underlyingLoanAccountId: accountResolution.underlyingLoanAccount.id,
      cadence: input.cadence ?? null,
      nextDueDate: input.nextDueDate ?? normalizedRepaymentPlan[0]?.dueDate ?? null,
      notes: input.notes || null,
      metadata: input.metadata || null,
    });
    loanInserted = true;

    if (normalizedRepaymentPlan.length > 0) {
      await ctx.db.insert(loanInstallments).values(
        normalizedRepaymentPlan.map((installment, index) => ({
          id: crypto.randomUUID(),
          clerkUserId: userId,
          loanId,
          sequence: index + 1,
          dueDate: installment.dueDate,
          amount: installment.amount,
        }))
      );
    }

    if (input.createOpeningDisbursement) {
      const openingAmount = input.openingDisbursementAmount ?? input.principalAmount;
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
  } catch (error) {
    if (loanInserted) {
      await ctx.db.delete(loans).where(eq(loans.id, loanId)).catch(() => undefined);
    }

    if (createdUnderlyingLoanAccountId) {
      await ctx.db.delete(accounts).where(eq(accounts.id, createdUnderlyingLoanAccountId)).catch(() => undefined);
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create loan.",
      cause: error,
    });
  }

  return {
    loanId,
    underlyingLoanAccountId: accountResolution.underlyingLoanAccount.id,
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

  const accountResolution = await resolveLoanAccounts(ctx, {
    currency: input.currency,
    destinationAccountId: input.destinationAccountId,
    underlyingLoanAccountId: input.underlyingLoanAccountId,
  });

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

  const [updated] = await ctx.db
    .update(loans)
    .set({
      kind: input.kind,
      name: input.name,
      lenderName: input.lenderName,
      currency: input.currency,
      principalAmount: input.principalAmount,
      outstandingAmount: input.outstandingAmount,
      disbursedAt: input.disbursedAt,
      status: input.status,
      destinationAccountId: input.destinationAccountId,
      underlyingLoanAccountId: input.underlyingLoanAccountId ?? null,
      cadence: input.cadence ?? null,
      nextDueDate: input.nextDueDate ?? normalizedRepaymentPlan[0]?.dueDate ?? null,
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
  await ctx.db
    .delete(loanInstallments)
    .where(and(eq(loanInstallments.loanId, existing.id), eq(loanInstallments.clerkUserId, userId)));

  if (normalizedRepaymentPlan.length > 0) {
    await ctx.db.insert(loanInstallments).values(
      normalizedRepaymentPlan.map((installment, index) => ({
        id: crypto.randomUUID(),
        clerkUserId: userId,
        loanId: existing.id,
        sequence: index + 1,
        dueDate: installment.dueDate,
        amount: installment.amount,
      }))
    );
  }

  const installmentsMap = await getLoanInstallmentsMap(ctx, [existing.id]);
  const [enrichedLoan] = enrichLoanRecords([updated], installmentsMap);

  return {
    loan: enrichedLoan ?? updated,
  };
}

export async function deleteLoan(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteLoanInput
) {
  const existing = await requireLoan(ctx, input.id);
  const userId = assertUserId(ctx.userId);

  await ctx.db.delete(loans).where(and(eq(loans.id, existing.id), eq(loans.clerkUserId, userId)));

  return {
    success: true,
  };
}
