import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { accounts, budgets, ledgerEntries, transactionEvents } from "@/db/schema";
import {
  createTransactionEventSchema,
  deleteTransactionEventSchema,
} from "@/features/transactions/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type CreateTransactionEventInput = z.infer<typeof createTransactionEventSchema>;
type DeleteTransactionEventInput = z.infer<typeof deleteTransactionEventSchema>;

type AccountRecord = typeof accounts.$inferSelect;
type EventType = CreateTransactionEventInput["type"];
type BalanceMutationClient = Pick<TRPCContext["db"], "update">;

type BalanceEntry = {
  accountId: string;
  amountDelta: number;
  currency: string;
  role:
    | "primary"
    | "source"
    | "destination"
    | "fee_account"
    | "payment_account"
    | "liability_account"
    | "loan_account"
    | "disbursement_account";
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

function requireAccount(
  accountMap: Map<string, AccountRecord>,
  accountId: string,
  label: string
): AccountRecord {
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

function assertSameCurrency(accountsToCompare: AccountRecord[], message: string) {
  const currencies = new Set(accountsToCompare.map((account) => account.currency));
  if (currencies.size > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
    });
  }
}

function assertDifferentAccounts(leftId: string, rightId: string, message: string) {
  if (leftId === rightId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
    });
  }
}

async function getUserAccounts(
  ctx: Pick<TRPCContext, "db" | "userId">,
  accountIds: string[]
) {
  const userId = assertUserId(ctx.userId);

  const uniqueIds = Array.from(new Set(accountIds));
  const rows = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.clerkUserId, userId), inArray(accounts.id, uniqueIds)));

  return new Map(rows.map((account) => [account.id, account]));
}

async function requireBudgetForUser(
  ctx: Pick<TRPCContext, "db" | "userId">,
  budgetId: string
) {
  const userId = assertUserId(ctx.userId);
  const budget = await ctx.db.query.budgets.findFirst({
    where: and(eq(budgets.id, budgetId), eq(budgets.clerkUserId, userId)),
  });

  if (!budget) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Budget not found.",
    });
  }

  return budget;
}

function buildEntriesForEvent(
  input: CreateTransactionEventInput,
  accountMap: Map<string, AccountRecord>
) {
  switch (input.type) {
    case "income": {
      const account = requireAccount(accountMap, input.accountId, "Income account");
      assertAccountType(account, ["cash", "wallet"], "Income account");

      return {
        currency: account.currency,
        entries: [
          {
            accountId: account.id,
            amountDelta: input.amount,
            currency: account.currency,
            role: "primary" as const,
          },
        ],
      };
    }

    case "expense": {
      const account = requireAccount(accountMap, input.accountId, "Expense account");
      assertAccountType(account, ["cash", "wallet", "credit"], "Expense account");

      return {
        currency: account.currency,
        entries: [
          {
            accountId: account.id,
            amountDelta: account.type === "credit" ? input.amount : -input.amount,
            currency: account.currency,
            role: "primary" as const,
          },
        ],
      };
    }

    case "transfer": {
      const source = requireAccount(accountMap, input.sourceAccountId, "Source account");
      const destination = requireAccount(
        accountMap,
        input.destinationAccountId,
        "Destination account"
      );

      assertDifferentAccounts(source.id, destination.id, "Transfer accounts must be different.");
      assertAccountType(source, ["cash", "wallet"], "Transfer source");
      assertAccountType(destination, ["cash", "wallet"], "Transfer destination");
      assertSameCurrency(
        [source, destination],
        "Transfers currently require the same currency on both accounts."
      );

      return {
        currency: source.currency,
        entries: [
          {
            accountId: source.id,
            amountDelta: -input.amount,
            currency: source.currency,
            role: "source" as const,
          },
          {
            accountId: destination.id,
            amountDelta: input.amount,
            currency: destination.currency,
            role: "destination" as const,
          },
          ...(input.feeAmount > 0
            ? [
                {
                  accountId: source.id,
                  amountDelta: -input.feeAmount,
                  currency: source.currency,
                  role: "fee_account" as const,
                },
              ]
            : []),
        ],
      };
    }

    case "credit_payment": {
      const source = requireAccount(accountMap, input.sourceAccountId, "Payment account");
      const credit = requireAccount(accountMap, input.creditAccountId, "Credit account");

      assertDifferentAccounts(source.id, credit.id, "Payment accounts must be different.");
      assertAccountType(source, ["cash", "wallet"], "Payment source");
      assertAccountType(credit, ["credit"], "Credit account");
      assertSameCurrency(
        [source, credit],
        "Credit payments currently require matching account currencies."
      );

      return {
        currency: source.currency,
        entries: [
          {
            accountId: source.id,
            amountDelta: -input.amount,
            currency: source.currency,
            role: "payment_account" as const,
          },
          {
            accountId: credit.id,
            amountDelta: -input.amount,
            currency: credit.currency,
            role: "liability_account" as const,
          },
          ...(input.feeAmount > 0
            ? [
                {
                  accountId: source.id,
                  amountDelta: -input.feeAmount,
                  currency: source.currency,
                  role: "fee_account" as const,
                },
              ]
            : []),
        ],
      };
    }

    case "loan_disbursement": {
      const loan = requireAccount(accountMap, input.loanAccountId, "Loan account");
      const destination = requireAccount(
        accountMap,
        input.destinationAccountId,
        "Disbursement account"
      );

      assertDifferentAccounts(loan.id, destination.id, "Loan and destination accounts must be different.");
      assertAccountType(loan, ["loan"], "Loan account");
      assertAccountType(destination, ["cash", "wallet"], "Disbursement destination");
      assertSameCurrency(
        [loan, destination],
        "Loan disbursements currently require matching account currencies."
      );

      return {
        currency: loan.currency,
        entries: [
          {
            accountId: loan.id,
            amountDelta: input.amount,
            currency: loan.currency,
            role: "loan_account" as const,
          },
          {
            accountId: destination.id,
            amountDelta: input.amount,
            currency: destination.currency,
            role: "disbursement_account" as const,
          },
        ],
      };
    }

  }
}

async function applyBalanceEntries(
  tx: BalanceMutationClient,
  entries: BalanceEntry[],
  userId: string
) {
  const appliedEntries: BalanceEntry[] = [];

  for (const entry of entries) {
    await tx
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
  tx: BalanceMutationClient,
  entries: Pick<BalanceEntry, "accountId" | "amountDelta">[],
  userId: string
) {
  for (const entry of entries) {
    await tx
      .update(accounts)
      .set({
        balance: sql`${accounts.balance} - ${entry.amountDelta}`,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, entry.accountId), eq(accounts.clerkUserId, userId)));
  }
}

export async function listTransactionEvents(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const events = await ctx.db.query.transactionEvents.findMany({
    where: eq(transactionEvents.clerkUserId, userId),
    orderBy: [desc(transactionEvents.occurredAt), desc(transactionEvents.createdAt)],
  });

  const eventIds = events.map((event) => event.id);
  const entries =
    eventIds.length === 0
      ? []
      : await ctx.db.query.ledgerEntries.findMany({
          where: inArray(ledgerEntries.eventId, eventIds),
          orderBy: [desc(ledgerEntries.createdAt)],
        });

  const accountIds = Array.from(new Set(entries.map((entry) => entry.accountId)));
  const accountRows =
    accountIds.length === 0
      ? []
      : await ctx.db
          .select({
            id: accounts.id,
            name: accounts.name,
            type: accounts.type,
            currency: accounts.currency,
          })
          .from(accounts)
          .where(and(eq(accounts.clerkUserId, userId), inArray(accounts.id, accountIds)));

  const accountMap = new Map(accountRows.map((account) => [account.id, account]));
  const entriesByEvent = new Map<string, typeof entries>();

  for (const entry of entries) {
    const existing = entriesByEvent.get(entry.eventId) ?? [];
    existing.push(entry);
    entriesByEvent.set(entry.eventId, existing);
  }

  return events.map((event) => ({
    ...event,
    entries:
      entriesByEvent.get(event.id)?.map((entry) => ({
        ...entry,
        account: accountMap.get(entry.accountId) ?? null,
      })) ?? [],
  }));
}

export async function getTransactionEventsSummary(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const [row] = await ctx.db
    .select({
      totalEvents: sql<number>`count(*)`,
      incomeEvents: sql<number>`coalesce(sum(case when ${transactionEvents.type} = 'income' then 1 else 0 end), 0)`,
      expenseEvents: sql<number>`coalesce(sum(case when ${transactionEvents.type} = 'expense' then 1 else 0 end), 0)`,
      transferEvents: sql<number>`coalesce(sum(case when ${transactionEvents.type} = 'transfer' then 1 else 0 end), 0)`,
      creditPaymentEvents: sql<number>`coalesce(sum(case when ${transactionEvents.type} = 'credit_payment' then 1 else 0 end), 0)`,
      loanDisbursementEvents: sql<number>`coalesce(sum(case when ${transactionEvents.type} = 'loan_disbursement' then 1 else 0 end), 0)`,
      totalTransferFees: sql<number>`coalesce(sum(case when ${transactionEvents.type} in ('transfer', 'credit_payment') then ${transactionEvents.feeAmount} else 0 end), 0)`,
    })
    .from(transactionEvents)
    .where(eq(transactionEvents.clerkUserId, userId));

  return {
    totalEvents: Number(row?.totalEvents ?? 0),
    incomeEvents: Number(row?.incomeEvents ?? 0),
    expenseEvents: Number(row?.expenseEvents ?? 0),
    transferEvents: Number(row?.transferEvents ?? 0),
    creditPaymentEvents: Number(row?.creditPaymentEvents ?? 0),
    loanDisbursementEvents: Number(row?.loanDisbursementEvents ?? 0),
    totalTransferFees: Number(row?.totalTransferFees ?? 0),
  };
}

export async function createTransactionEvent(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateTransactionEventInput
) {
  const userId = assertUserId(ctx.userId);

  if (input.type === "expense" && input.budgetId) {
    await requireBudgetForUser(ctx, input.budgetId);
  }

  const accountIds =
    input.type === "income" || input.type === "expense"
      ? [input.accountId]
      : input.type === "transfer"
        ? [input.sourceAccountId, input.destinationAccountId]
      : input.type === "credit_payment"
        ? [input.sourceAccountId, input.creditAccountId]
      : [input.loanAccountId, input.destinationAccountId];

  const accountMap = await getUserAccounts(ctx, accountIds);
  const { currency, entries } = buildEntriesForEvent(input, accountMap);

  const eventId = crypto.randomUUID();
  let eventInserted = false;
  let appliedEntries: BalanceEntry[] = [];

  try {
    await ctx.db.insert(transactionEvents).values({
      id: eventId,
      clerkUserId: userId,
      type: input.type as EventType,
      currency,
      amount: input.amount,
      feeAmount:
        input.type === "transfer" || input.type === "credit_payment" ? input.feeAmount : 0,
      budgetId: input.type === "expense" ? input.budgetId ?? null : null,
      description: input.description,
      notes: input.notes || null,
      occurredAt: input.date,
    });
    eventInserted = true;

    await ctx.db.insert(ledgerEntries).values(
      entries.map((entry) => ({
        id: crypto.randomUUID(),
        clerkUserId: userId,
        eventId,
        accountId: entry.accountId,
        role: entry.role,
        amountDelta: entry.amountDelta,
        currency: entry.currency,
      }))
    );

    appliedEntries = await applyBalanceEntries(ctx.db, entries, userId);
  } catch (error) {
    if (appliedEntries.length > 0) {
      await rollbackBalanceEntries(ctx.db, appliedEntries, userId).catch(() => undefined);
    }

    if (eventInserted) {
      await ctx.db.delete(transactionEvents).where(eq(transactionEvents.id, eventId)).catch(() => undefined);
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to record transaction event.",
      cause: error,
    });
  }

  return {
    eventId,
    type: input.type,
  };
}

export async function deleteTransactionEvent(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteTransactionEventInput
) {
  const userId = assertUserId(ctx.userId);

  const event = await ctx.db.query.transactionEvents.findFirst({
    where: and(eq(transactionEvents.id, input.id), eq(transactionEvents.clerkUserId, userId)),
  });

  if (!event) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Transaction event not found.",
    });
  }

  const entries = await ctx.db.query.ledgerEntries.findMany({
    where: and(eq(ledgerEntries.eventId, input.id), eq(ledgerEntries.clerkUserId, userId)),
  });

  let balancesRolledBack = false;

  try {
    await rollbackBalanceEntries(ctx.db, entries, userId);
    balancesRolledBack = true;

    await ctx.db.delete(transactionEvents).where(eq(transactionEvents.id, input.id));
  } catch (error) {
    if (balancesRolledBack) {
      await applyBalanceEntries(ctx.db, entries, userId).catch(() => undefined);
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to delete transaction event.",
      cause: error,
    });
  }

  return {
    success: true,
  };
}
