import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { accounts, billOccurrences, billSeries } from "@/db/schema";
import {
  createTransactionEvent,
  deleteTransactionEvent,
} from "@/features/transactions/server/service";
import { recordLoanPayment } from "@/features/loans/server/service";
import {
  completeBillSchema,
  createBillSchema,
  deleteBillSchema,
  getBillSchema,
  listBillsSchema,
  markBillPaidSchema,
  updateBillSchema,
} from "@/features/bills/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type ListBillsInput = z.infer<typeof listBillsSchema>;
type GetBillInput = z.infer<typeof getBillSchema>;
type CreateBillInput = z.infer<typeof createBillSchema>;
type UpdateBillInput = z.infer<typeof updateBillSchema>;
type MarkBillPaidInput = z.infer<typeof markBillPaidSchema>;
type DeleteBillInput = z.infer<typeof deleteBillSchema>;
type CompleteBillInput = z.infer<typeof completeBillSchema>;

type BillSeriesRecord = typeof billSeries.$inferSelect;
type BillOccurrenceRecord = typeof billOccurrences.$inferSelect;
type AccountRecord = typeof accounts.$inferSelect;

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }
  return userId;
}

function deriveBillStatus(
  pendingOccurrence: BillOccurrenceRecord | null,
  isActive: boolean
): "pending" | "paid" | "overdue" {
  if (!pendingOccurrence || !isActive) return "paid";
  return pendingOccurrence.dueDate < new Date() ? "overdue" : "pending";
}

function addCadence(date: Date, cadence: BillSeriesRecord["cadence"], intervalCount: number) {
  const next = new Date(date);
  if (cadence === "weekly") {
    next.setDate(next.getDate() + 7 * intervalCount);
    return next;
  }
  if (cadence === "monthly") {
    next.setMonth(next.getMonth() + intervalCount);
    return next;
  }
  if (cadence === "yearly") {
    next.setFullYear(next.getFullYear() + intervalCount);
    return next;
  }
  return date;
}

function requireAccountFromMap(
  accountMap: Map<string, AccountRecord>,
  accountId: string,
  label: string
) {
  const account = accountMap.get(accountId);
  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${label} was not found.`,
    });
  }
  return account;
}

function assertAccountType(
  account: AccountRecord,
  allowed: AccountRecord["type"][],
  label: string
) {
  if (!allowed.includes(account.type)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} must be one of: ${allowed.join(", ")}.`,
    });
  }
}

async function getUserAccounts(
  ctx: Pick<TRPCContext, "db" | "userId">,
  accountIds: string[]
) {
  const userId = assertUserId(ctx.userId);
  const uniqueIds = Array.from(new Set(accountIds));
  if (uniqueIds.length === 0) {
    return new Map<string, AccountRecord>();
  }

  const rows = await ctx.db.query.accounts.findMany({
    where: and(eq(accounts.clerkUserId, userId), inArray(accounts.id, uniqueIds)),
  });
  return new Map(rows.map((account) => [account.id, account]));
}

async function buildBillPaymentTransactionInput(
  ctx: Pick<TRPCContext, "db" | "userId">,
  series: BillSeriesRecord,
  occurrence: BillOccurrenceRecord,
  input: MarkBillPaidInput,
  paidAt: Date
) {
  const accountIds = [series.accountId, input.paymentAccountId].filter(
    (value): value is string => Boolean(value)
  );
  const accountMap = await getUserAccounts(ctx, accountIds);
  const linkedAccount = series.accountId
    ? requireAccountFromMap(accountMap, series.accountId, "Bill account")
    : null;
  const paymentAccount = input.paymentAccountId
    ? requireAccountFromMap(accountMap, input.paymentAccountId, "Payment account")
    : null;

  if (linkedAccount?.type === "credit") {
    if (!paymentAccount) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Credit card bills require a liquid payment account.",
      });
    }

    assertAccountType(paymentAccount, ["cash", "wallet"], "Payment account");

    return {
      type: "credit_payment" as const,
      sourceAccountId: paymentAccount.id,
      creditAccountId: linkedAccount.id,
      amount: occurrence.amount,
      feeAmount: 0,
      date: paidAt,
      description: `${series.name} payment`,
      notes: input.notes?.trim() || "",
    };
  }

  const expenseAccount = paymentAccount ?? linkedAccount;
  if (!expenseAccount) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select a payment account to record this bill payment.",
    });
  }
  assertAccountType(expenseAccount, ["cash", "wallet", "credit"], "Expense account");

  return {
    type: "expense" as const,
    accountId: expenseAccount.id,
    amount: occurrence.amount,
    budgetId: undefined,
    categoryId: undefined,
    date: paidAt,
    description: series.name,
    notes: input.notes?.trim() || "",
  };
}

async function requireUserAccount(
  ctx: Pick<TRPCContext, "db" | "userId">,
  accountId: string
) {
  const userId = assertUserId(ctx.userId);
  const account = await ctx.db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.clerkUserId, userId)),
  });
  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Account was not found.",
    });
  }
  return account;
}

async function requireBillSeries(
  ctx: Pick<TRPCContext, "db" | "userId">,
  id: string
) {
  const userId = assertUserId(ctx.userId);
  const series = await ctx.db.query.billSeries.findFirst({
    where: and(eq(billSeries.id, id), eq(billSeries.clerkUserId, userId)),
  });
  if (!series) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Bill was not found.",
    });
  }
  return series;
}

async function getOccurrenceMap(
  ctx: Pick<TRPCContext, "db" | "userId">,
  billIds: string[]
) {
  const userId = assertUserId(ctx.userId);
  if (billIds.length === 0) {
    return new Map<string, BillOccurrenceRecord[]>();
  }

  const rows = await ctx.db.query.billOccurrences.findMany({
    where: and(
      eq(billOccurrences.clerkUserId, userId),
      inArray(billOccurrences.billId, billIds)
    ),
    orderBy: [asc(billOccurrences.dueDate)],
  });

  const map = new Map<string, BillOccurrenceRecord[]>();
  for (const row of rows) {
    const existing = map.get(row.billId) ?? [];
    existing.push(row);
    map.set(row.billId, existing);
  }
  return map;
}

function mapBillResult(
  series: BillSeriesRecord,
  occurrences: BillOccurrenceRecord[]
) {
  const pendingOccurrence =
    occurrences.find((occurrence) => occurrence.status === "pending") ?? null;
  const latestPaidOccurrence =
    [...occurrences]
      .filter((occurrence) => occurrence.status === "paid")
      .sort((left, right) => right.dueDate.getTime() - left.dueDate.getTime())[0] ?? null;

  return {
    ...series,
    status: deriveBillStatus(pendingOccurrence, series.isActive),
    nextPendingOccurrence: pendingOccurrence,
    latestPaidOccurrence,
    occurrences,
  };
}

function isSameMonth(date: Date, reference: Date) {
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
}

export async function listBills(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: ListBillsInput
) {
  const userId = assertUserId(ctx.userId);
  const search = input.search.trim();

  const whereClause = and(
    eq(billSeries.clerkUserId, userId),
    input.accountId ? eq(billSeries.accountId, input.accountId) : undefined,
    input.includeInactive ? undefined : eq(billSeries.isActive, true),
    search
      ? or(
          ilike(billSeries.name, `%${search}%`),
          ilike(sql`coalesce(${billSeries.notes}, '')`, `%${search}%`)
        )
      : undefined
  );

  const offset = (input.page - 1) * input.pageSize;
  const [rows, countRows] = await Promise.all([
    ctx.db.query.billSeries.findMany({
      where: whereClause,
      orderBy: [asc(billSeries.nextDueDate), desc(billSeries.createdAt)],
      limit: input.pageSize,
      offset,
    }),
    ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(billSeries)
      .where(whereClause),
  ]);

  const occurrenceMap = await getOccurrenceMap(
    ctx,
    rows.map((row) => row.id)
  );
  const hydrated = rows.map((series) => mapBillResult(series, occurrenceMap.get(series.id) ?? []));
  const filtered =
    input.status === "all" ? hydrated : hydrated.filter((row) => row.status === input.status);

  return {
    items: filtered,
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(Number(countRows[0]?.count ?? 0) / input.pageSize)),
  };
}

export async function getBill(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetBillInput
) {
  const series = await requireBillSeries(ctx, input.id);
  const occurrences = await ctx.db.query.billOccurrences.findMany({
    where: and(
      eq(billOccurrences.clerkUserId, assertUserId(ctx.userId)),
      eq(billOccurrences.billId, input.id)
    ),
    orderBy: [desc(billOccurrences.dueDate)],
    limit: 24,
  });

  return mapBillResult(series, occurrences);
}

export async function getBillsSummary(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const rows = await ctx.db.query.billSeries.findMany({
    where: and(eq(billSeries.clerkUserId, userId), eq(billSeries.isActive, true)),
    orderBy: [asc(billSeries.nextDueDate)],
  });
  const occurrenceMap = await getOccurrenceMap(
    ctx,
    rows.map((row) => row.id)
  );
  const hydrated = rows.map((series) => mapBillResult(series, occurrenceMap.get(series.id) ?? []));

  const today = new Date();
  let dueSoonCount = 0;
  let overdueCount = 0;
  let dueThisMonthAmount = 0;
  let paidThisMonthAmount = 0;

  for (const row of hydrated) {
    const pending = row.nextPendingOccurrence;
    if (pending) {
      if (pending.dueDate < today) {
        overdueCount += 1;
      } else {
        const dayDiff = Math.ceil((pending.dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        if (dayDiff <= 7) dueSoonCount += 1;
      }
      if (isSameMonth(pending.dueDate, today)) {
        dueThisMonthAmount += pending.amount;
      }
    }

    if (row.latestPaidOccurrence?.paidAt && isSameMonth(row.latestPaidOccurrence.paidAt, today)) {
      paidThisMonthAmount += row.latestPaidOccurrence.amount;
    }
  }

  return {
    activeBillCount: hydrated.length,
    dueSoonCount,
    overdueCount,
    dueThisMonthAmount,
    paidThisMonthAmount,
  };
}

export async function createBill(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateBillInput
) {
  const userId = assertUserId(ctx.userId);
  if (input.accountId) {
    await requireUserAccount(ctx, input.accountId);
  }

  const firstDueDate = input.firstDueDate ?? input.startsAt;
  const endsAfterOccurrences =
    input.cadence === "one_time"
      ? 1
      : input.endsAfterOccurrences;
  const remainingOccurrences =
    typeof endsAfterOccurrences === "number" ? endsAfterOccurrences : null;
  const isActive = input.isActive && (remainingOccurrences === null || remainingOccurrences > 0);
  const nextDueDate = isActive ? firstDueDate : null;
  const now = new Date();
  const id = crypto.randomUUID();

  const [series] = await ctx.db
    .insert(billSeries)
    .values({
      id,
      clerkUserId: userId,
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      cadence: input.cadence,
      intervalCount: input.cadence === "one_time" ? 1 : input.intervalCount,
      startsAt: input.startsAt,
      nextDueDate,
      endsAfterOccurrences: endsAfterOccurrences ?? null,
      remainingOccurrences,
      obligationType: "general",
      loanId: null,
      loanInstallmentId: null,
      isActive,
      accountId: input.accountId ?? null,
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!series) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create bill.",
    });
  }

  if (nextDueDate) {
      await ctx.db.insert(billOccurrences).values({
        id: crypto.randomUUID(),
        clerkUserId: userId,
        billId: id,
        dueDate: nextDueDate,
        amount: input.amount,
        status: "pending",
        paidAt: null,
        loanPaymentId: null,
        createdAt: now,
        updatedAt: now,
      });
  }

  return getBill(ctx, { id });
}

export async function updateBill(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateBillInput
) {
  const userId = assertUserId(ctx.userId);
  const existing = await requireBillSeries(ctx, input.id);
  if (input.accountId) {
    await requireUserAccount(ctx, input.accountId);
  }

  const sanitizedRemaining =
    input.cadence === "one_time" ? Math.min(input.remainingOccurrences ?? 1, 1) : input.remainingOccurrences;
  const nextDueDate =
    input.isActive === false ? null : input.nextDueDate ?? existing.nextDueDate;

  const [updated] = await ctx.db
    .update(billSeries)
    .set({
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      cadence: input.cadence,
      intervalCount: input.cadence === "one_time" ? 1 : input.intervalCount,
      startsAt: input.startsAt,
      nextDueDate,
      endsAfterOccurrences: input.endsAfterOccurrences ?? null,
      remainingOccurrences: sanitizedRemaining ?? null,
      obligationType: existing.obligationType,
      loanId: existing.loanId,
      loanInstallmentId: existing.loanInstallmentId,
      isActive: input.isActive && (sanitizedRemaining === undefined || sanitizedRemaining !== 0),
      accountId: input.accountId ?? null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(billSeries.id, input.id), eq(billSeries.clerkUserId, userId)))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update bill.",
    });
  }

  if (nextDueDate) {
    const pendingRow = await ctx.db.query.billOccurrences.findFirst({
      where: and(
        eq(billOccurrences.clerkUserId, userId),
        eq(billOccurrences.billId, input.id),
        eq(billOccurrences.status, "pending")
      ),
      orderBy: [asc(billOccurrences.dueDate)],
    });

    if (pendingRow) {
      await ctx.db
        .update(billOccurrences)
        .set({
          dueDate: nextDueDate,
          amount: input.amount,
          updatedAt: new Date(),
        })
        .where(and(eq(billOccurrences.id, pendingRow.id), eq(billOccurrences.clerkUserId, userId)));
    } else if (updated.isActive) {
      await ctx.db.insert(billOccurrences).values({
        id: crypto.randomUUID(),
        clerkUserId: userId,
        billId: input.id,
        dueDate: nextDueDate,
        amount: input.amount,
        status: "pending",
        paidAt: null,
        loanPaymentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return getBill(ctx, { id: input.id });
}

export async function markBillPaid(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: MarkBillPaidInput
) {
  const userId = assertUserId(ctx.userId);
  const series = await requireBillSeries(ctx, input.billId);

  const occurrence =
    input.occurrenceId
      ? await ctx.db.query.billOccurrences.findFirst({
          where: and(
            eq(billOccurrences.id, input.occurrenceId),
            eq(billOccurrences.clerkUserId, userId),
            eq(billOccurrences.billId, series.id)
          ),
        })
      : await ctx.db.query.billOccurrences.findFirst({
          where: and(
            eq(billOccurrences.clerkUserId, userId),
            eq(billOccurrences.billId, series.id),
            eq(billOccurrences.status, "pending")
          ),
          orderBy: [asc(billOccurrences.dueDate)],
        });

  if (!occurrence) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No pending bill occurrence was found.",
    });
  }

  if (occurrence.status === "paid" || occurrence.transactionEventId) {
    return getBill(ctx, { id: series.id });
  }

  const paidAt = input.paidAt ?? new Date();
  if (series.obligationType === "loan_repayment" && series.loanId && !input.settleOnly) {
    const paymentSourceAccountId = input.paymentAccountId ?? series.accountId ?? undefined;
    if (!paymentSourceAccountId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Loan-linked repayments require a liquid payment account.",
      });
    }

    const result = await recordLoanPayment(ctx, {
      loanId: series.loanId,
      installmentId: series.loanInstallmentId ?? undefined,
      sourceAccountId: paymentSourceAccountId,
      amount: occurrence.amount,
      paidAt,
      notes: input.notes,
    });

    await ctx.db
      .update(billOccurrences)
      .set({
        status: "paid",
        paidAt,
        loanPaymentId:
          result.loan.payments.find(
            (payment) =>
              payment.paidAt.getTime() === paidAt.getTime() &&
              payment.amount === occurrence.amount
          )?.id ?? null,
        transactionEventId: occurrence.transactionEventId ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(billOccurrences.id, occurrence.id), eq(billOccurrences.clerkUserId, userId)));

    return getBill(ctx, { id: series.id });
  }

  let transactionEventId: string | null = null;

  if (!input.settleOnly) {
    const transactionInput = await buildBillPaymentTransactionInput(
      ctx,
      series,
      occurrence,
      input,
      paidAt
    );
    const created = await createTransactionEvent(ctx, transactionInput);
    transactionEventId = created.eventId;
  }

  try {
    await ctx.db
      .update(billOccurrences)
      .set({
        status: "paid",
        paidAt,
        loanPaymentId: null,
        transactionEventId,
        updatedAt: new Date(),
      })
      .where(and(eq(billOccurrences.id, occurrence.id), eq(billOccurrences.clerkUserId, userId)));

    let remainingOccurrences = series.remainingOccurrences;
    if (typeof remainingOccurrences === "number" && remainingOccurrences > 0) {
      remainingOccurrences -= 1;
    }

    const shouldCreateNext =
      series.cadence !== "one_time" &&
      (remainingOccurrences === null || remainingOccurrences === undefined || remainingOccurrences > 0);
    const nextDueDate = shouldCreateNext
      ? addCadence(occurrence.dueDate, series.cadence, Math.max(series.intervalCount, 1))
      : null;

    if (shouldCreateNext && nextDueDate) {
      await ctx.db
        .insert(billOccurrences)
        .values({
          id: crypto.randomUUID(),
          clerkUserId: userId,
          billId: series.id,
          dueDate: nextDueDate,
          amount: series.amount,
          status: "pending",
          paidAt: null,
          loanPaymentId: null,
          transactionEventId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
    }

    await ctx.db
      .update(billSeries)
      .set({
        nextDueDate,
        remainingOccurrences:
          remainingOccurrences === undefined ? null : remainingOccurrences,
        isActive: Boolean(shouldCreateNext || nextDueDate),
        updatedAt: new Date(),
      })
      .where(and(eq(billSeries.id, series.id), eq(billSeries.clerkUserId, userId)));
  } catch (error) {
    if (transactionEventId) {
      await deleteTransactionEvent(ctx, { id: transactionEventId }).catch(() => undefined);
    }
    throw error;
  }

  return getBill(ctx, { id: series.id });
}

export async function deleteBill(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteBillInput
) {
  const userId = assertUserId(ctx.userId);
  const [deleted] = await ctx.db
    .delete(billSeries)
    .where(and(eq(billSeries.id, input.id), eq(billSeries.clerkUserId, userId)))
    .returning({ id: billSeries.id });

  if (!deleted) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Bill was not found.",
    });
  }

  return deleted;
}

export async function completeBill(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CompleteBillInput
) {
  const userId = assertUserId(ctx.userId);
  await requireBillSeries(ctx, input.id);

  await ctx.db
    .delete(billOccurrences)
    .where(
      and(
        eq(billOccurrences.billId, input.id),
        eq(billOccurrences.clerkUserId, userId),
        eq(billOccurrences.status, "pending")
      )
    );

  const [updated] = await ctx.db
    .update(billSeries)
    .set({
      isActive: false,
      nextDueDate: null,
      updatedAt: new Date(),
    })
    .where(and(eq(billSeries.id, input.id), eq(billSeries.clerkUserId, userId)))
    .returning({ id: billSeries.id });

  if (!updated) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Bill was not found.",
    });
  }

  return { id: updated.id };
}
