import { beforeEach, describe, expect, it, vi } from "vitest";

import { accounts, ledgerEntries, transactionEvents } from "@/db/schema";
import {
  createTransactionEvent,
  deleteTransactionEvent,
  updateTransactionEvent,
} from "@/features/transactions/server/service";

type AccountState = {
  id: string;
  clerkUserId: string;
  name: string;
  type: "cash" | "wallet" | "credit" | "loan";
  currency: string;
  balance: number;
};

type EventState = {
  id: string;
  clerkUserId: string;
  type: "income" | "expense" | "transfer" | "credit_payment" | "loan_disbursement";
  currency: string;
  amount: number;
  feeAmount: number;
  budgetId: string | null;
  categoryId: string | null;
  description: string;
  notes: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type LedgerEntryState = {
  id: string;
  clerkUserId: string;
  eventId: string;
  accountId: string;
  role:
    | "primary"
    | "source"
    | "destination"
    | "fee_account"
    | "payment_account"
    | "liability_account"
    | "loan_account"
    | "disbursement_account";
  amountDelta: number;
  currency: string;
  createdAt: Date;
};

function createTransactionHarness(seed?: {
  accounts?: AccountState[];
  events?: EventState[];
  ledgerEntries?: LedgerEntryState[];
}) {
  const state = {
    accounts: [...(seed?.accounts ?? [])],
    events: [...(seed?.events ?? [])],
    ledgerEntries: [...(seed?.ledgerEntries ?? [])],
  };

  let pendingBalanceQueue: Array<{ accountId: string; amountDelta: number }> = [];
  let pendingBalanceMode: "apply" | "rollback" = "apply";
  let activeEventId: string | null = state.events[0]?.id ?? null;

  const selectWhere = vi.fn(async () => state.accounts);
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const insertValues = vi.fn(async (values: unknown) => {
    if (!Array.isArray(values) && typeof values === "object" && values !== null) {
      if ("eventId" in values) {
        return undefined;
      }

      if ("type" in values && "amount" in values) {
        state.events.push(values as EventState);
        activeEventId = (values as EventState).id;
      }
      return undefined;
    }

    if (Array.isArray(values) && values.length > 0) {
      if (values[0] && typeof values[0] === "object" && "eventId" in values[0]) {
        const rows = values as LedgerEntryState[];
        state.ledgerEntries.push(...rows);
        pendingBalanceQueue = rows.map((row) => ({
          accountId: row.accountId,
          amountDelta: row.amountDelta,
        }));
        pendingBalanceMode = "apply";
      }
    }

    return undefined;
  });
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateWhere = vi.fn(() => {
    return {
      returning: async () => [{}],
    };
  });
  const updateSet = vi.fn((payload: unknown) => {
    if (typeof payload === "object" && payload !== null) {
      if ("balance" in payload) {
        const next = pendingBalanceQueue.shift();
        if (!next) {
          throw new Error("Missing pending balance mutation.");
        }
        const account = state.accounts.find((item) => item.id === next.accountId);
        if (!account) {
          throw new Error("Attempted balance mutation on unknown account.");
        }
        account.balance += pendingBalanceMode === "apply" ? next.amountDelta : -next.amountDelta;
      }

      if ("type" in payload && activeEventId) {
        const event = state.events.find((item) => item.id === activeEventId);
        if (event) {
          Object.assign(event, payload);
        }
      }
    }

    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set: updateSet }));

  const deleteWhere = vi.fn(async () => {
    return undefined;
  });
  const deleteFn = vi.fn((table: unknown) => ({
    where: vi.fn(async () => {
      if (table === ledgerEntries) {
        if (activeEventId) {
          state.ledgerEntries = state.ledgerEntries.filter((entry) => entry.eventId !== activeEventId);
        }
      }

      if (table === transactionEvents) {
        if (activeEventId) {
          state.events = state.events.filter((event) => event.id !== activeEventId);
          state.ledgerEntries = state.ledgerEntries.filter((entry) => entry.eventId !== activeEventId);
          activeEventId = null;
        }
      }
      await deleteWhere();
    }),
  }));

  const db = {
    select,
    insert,
    update,
    delete: deleteFn,
    query: {
      budgets: {
        findFirst: vi.fn(async () => null),
      },
      categories: {
        findFirst: vi.fn(async () => null),
      },
      transactionEvents: {
        findFirst: vi.fn(async () => {
          if (!activeEventId) return null;
          return state.events.find((event) => event.id === activeEventId) ?? null;
        }),
      },
      ledgerEntries: {
        findMany: vi.fn(async () => {
          if (!activeEventId) return [];
          const rows = state.ledgerEntries.filter((entry) => entry.eventId === activeEventId);
          pendingBalanceQueue = rows.map((row) => ({
            accountId: row.accountId,
            amountDelta: row.amountDelta,
          }));
          pendingBalanceMode = "rollback";
          return rows;
        }),
      },
    },
    __setActiveEventId: (eventId: string) => {
      activeEventId = eventId;
    },
    __state: state,
  };

  return db;
}

describe("transactions service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects transfer when source and destination accounts are the same", async () => {
    const accountId = "5fb4c6c4-ae51-420f-ad1f-f0112393f9f8";
    const db = createTransactionHarness({
      accounts: [
        {
          id: accountId,
          clerkUserId: "user_1",
          name: "Main wallet",
          type: "wallet",
          currency: "PHP",
          balance: 50_000,
        },
      ],
    });

    await expect(
      createTransactionEvent(
        { db: db as never, userId: "user_1" },
        {
          type: "transfer",
          sourceAccountId: accountId,
          destinationAccountId: accountId,
          amount: 2_000,
          feeAmount: 0,
          date: new Date("2026-04-22T00:00:00.000Z"),
          description: "Move funds",
          notes: "",
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("creates a transfer with fee and mutates balances correctly", async () => {
    const sourceId = "49f89a42-3195-4ecf-9145-32e3f32d4082";
    const destinationId = "c9e8f9a8-e24f-4b9d-a2f0-0a13ec34624a";
    const eventId = "7e65889a-f1e7-4a21-a5d7-c8a31cd84d29";
    const entryIds = [
      "4a5b708e-7d23-4c1f-9e7f-4f39f5df62d6",
      "596f2f7a-04c4-4425-b41b-f517bd3cb6ad",
      "71f6af7c-03fd-43b6-a27f-d31f1ed86ec2",
    ];

    const db = createTransactionHarness({
      accounts: [
        {
          id: sourceId,
          clerkUserId: "user_1",
          name: "Wallet PHP",
          type: "wallet",
          currency: "PHP",
          balance: 10_000,
        },
        {
          id: destinationId,
          clerkUserId: "user_1",
          name: "Bank PHP",
          type: "cash",
          currency: "PHP",
          balance: 2_000,
        },
      ],
    });

    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(eventId)
      .mockReturnValueOnce(entryIds[0] ?? "")
      .mockReturnValueOnce(entryIds[1] ?? "")
      .mockReturnValueOnce(entryIds[2] ?? "");

    await createTransactionEvent(
      { db: db as never, userId: "user_1" },
      {
        type: "transfer",
        sourceAccountId: sourceId,
        destinationAccountId: destinationId,
        amount: 3_000,
        feeAmount: 200,
        date: new Date("2026-04-22T00:00:00.000Z"),
        description: "Move funds",
        notes: "",
      },
    );

    const source = db.__state.accounts.find((account) => account.id === sourceId);
    const destination = db.__state.accounts.find((account) => account.id === destinationId);
    expect(source?.balance).toBe(6_800);
    expect(destination?.balance).toBe(5_000);

    const createdEntries = db.__state.ledgerEntries.filter((entry) => entry.eventId === eventId);
    expect(createdEntries).toHaveLength(3);
    expect(createdEntries.map((entry) => [entry.role, entry.amountDelta])).toEqual([
      ["source", -3_000],
      ["destination", 3_000],
      ["fee_account", -200],
    ]);
  });

  it("updates an existing event and rebalances old and new ledger entries correctly", async () => {
    const eventId = "f7b712db-df9f-498d-a8b5-33ae9e12476e";
    const accountA = "af2ee312-c4fd-4e17-aaf2-0de8f9cd8587";
    const accountB = "35f9d96c-46cc-42ba-b4e7-cf95adb0cd3b";

    const db = createTransactionHarness({
      accounts: [
        {
          id: accountA,
          clerkUserId: "user_1",
          name: "Primary wallet",
          type: "wallet",
          currency: "PHP",
          balance: 8_000,
        },
        {
          id: accountB,
          clerkUserId: "user_1",
          name: "Reserve bank",
          type: "cash",
          currency: "PHP",
          balance: 2_000,
        },
      ],
      events: [
        {
          id: eventId,
          clerkUserId: "user_1",
          type: "expense",
          currency: "PHP",
          amount: 2_000,
          feeAmount: 0,
          budgetId: null,
          categoryId: null,
          description: "Old expense",
          notes: null,
          occurredAt: new Date("2026-04-01T00:00:00.000Z"),
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
      ledgerEntries: [
        {
          id: "d06d299c-8f77-4208-819e-01eecdad3acd",
          clerkUserId: "user_1",
          eventId,
          accountId: accountA,
          role: "primary",
          amountDelta: -2_000,
          currency: "PHP",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    });
    db.__setActiveEventId(eventId);

    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("46cd5f06-c07d-46ee-88a4-c723e98dd2d9")
      .mockReturnValueOnce("e11b1fa3-9066-4510-8cdd-6589dbadf53f")
      .mockReturnValueOnce("f5c5f0c2-24ca-4d87-b8fa-c67c639558f3");

    await updateTransactionEvent(
      { db: db as never, userId: "user_1" },
      {
        id: eventId,
        type: "transfer",
        sourceAccountId: accountA,
        destinationAccountId: accountB,
        amount: 1_500,
        feeAmount: 100,
        date: new Date("2026-04-22T00:00:00.000Z"),
        description: "Reclassified movement",
        notes: "",
      },
    );

    const source = db.__state.accounts.find((account) => account.id === accountA);
    const destination = db.__state.accounts.find((account) => account.id === accountB);
    expect(source?.balance).toBe(8_400);
    expect(destination?.balance).toBe(3_500);

    const updatedEventEntries = db.__state.ledgerEntries.filter((entry) => entry.eventId === eventId);
    expect(updatedEventEntries.map((entry) => [entry.role, entry.amountDelta])).toEqual([
      ["source", -1_500],
      ["destination", 1_500],
      ["fee_account", -100],
    ]);
  });

  it("deletes an event and rolls back prior balance impact", async () => {
    const eventId = "8f44bddf-b5a5-4f51-b4f4-64f6b8a076ff";
    const cashId = "6639f6ad-9681-4a71-aa97-a8f248f5145c";
    const creditId = "166eb4b0-0fa4-47bb-a8a5-b7d8e95a9a40";

    const db = createTransactionHarness({
      accounts: [
        {
          id: cashId,
          clerkUserId: "user_1",
          name: "Cash",
          type: "cash",
          currency: "PHP",
          balance: 7_000,
        },
        {
          id: creditId,
          clerkUserId: "user_1",
          name: "Credit card",
          type: "credit",
          currency: "PHP",
          balance: 4_000,
        },
      ],
      events: [
        {
          id: eventId,
          clerkUserId: "user_1",
          type: "credit_payment",
          currency: "PHP",
          amount: 3_000,
          feeAmount: 0,
          budgetId: null,
          categoryId: null,
          description: "Card payment",
          notes: null,
          occurredAt: new Date("2026-04-20T00:00:00.000Z"),
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
          updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ],
      ledgerEntries: [
        {
          id: "ddfcf725-c383-4b8f-a823-b2bbfeeeaf32",
          clerkUserId: "user_1",
          eventId,
          accountId: cashId,
          role: "payment_account",
          amountDelta: -3_000,
          currency: "PHP",
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
        },
        {
          id: "dbd6c5ba-d24d-4f42-95af-69986cc4c48d",
          clerkUserId: "user_1",
          eventId,
          accountId: creditId,
          role: "liability_account",
          amountDelta: -3_000,
          currency: "PHP",
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ],
    });
    db.__setActiveEventId(eventId);

    await deleteTransactionEvent({ db: db as never, userId: "user_1" }, { id: eventId });

    const cash = db.__state.accounts.find((account) => account.id === cashId);
    const credit = db.__state.accounts.find((account) => account.id === creditId);
    expect(cash?.balance).toBe(10_000);
    expect(credit?.balance).toBe(7_000);
    expect(db.__state.events).toHaveLength(0);
    expect(db.__state.ledgerEntries).toHaveLength(0);
  });

  it("rejects transfer when account currencies do not match", async () => {
    const sourceId = "4b163f74-f4fb-40dc-a640-d62e06d34be0";
    const destinationId = "46138dc5-c566-4f95-9152-fdd175f4a055";
    const db = createTransactionHarness({
      accounts: [
        {
          id: sourceId,
          clerkUserId: "user_1",
          name: "Wallet PHP",
          type: "wallet",
          currency: "PHP",
          balance: 10_000,
        },
        {
          id: destinationId,
          clerkUserId: "user_1",
          name: "Bank USD",
          type: "cash",
          currency: "USD",
          balance: 3_000,
        },
      ],
    });

    await expect(
      createTransactionEvent(
        { db: db as never, userId: "user_1" },
        {
          type: "transfer",
          sourceAccountId: sourceId,
          destinationAccountId: destinationId,
          amount: 2_000,
          feeAmount: 0,
          date: new Date("2026-04-22T00:00:00.000Z"),
          description: "Cross-currency test",
          notes: "",
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects expense when a bank or wallet account would go negative", async () => {
    const accountId = "d6e04d4f-f2c4-458f-b40e-80489e6d4b54";
    const db = createTransactionHarness({
      accounts: [
        {
          id: accountId,
          clerkUserId: "user_1",
          name: "Main wallet",
          type: "wallet",
          currency: "PHP",
          balance: 1_000,
        },
      ],
    });

    await expect(
      createTransactionEvent(
        { db: db as never, userId: "user_1" },
        {
          type: "expense",
          accountId,
          amount: 1_500,
          budgetId: undefined,
          categoryId: undefined,
          date: new Date("2026-04-22T00:00:00.000Z"),
          description: "Overspend",
          notes: "",
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Main wallet cannot go below zero.",
    });
  });

  it("rejects credit payment when it would overpay the credit balance", async () => {
    const sourceId = "5dd5f71a-ea31-4314-9cfa-737daf1e4199";
    const creditId = "8a990a56-b4a7-469d-8d17-ed19dc9e12f6";
    const db = createTransactionHarness({
      accounts: [
        {
          id: sourceId,
          clerkUserId: "user_1",
          name: "Cash wallet",
          type: "wallet",
          currency: "PHP",
          balance: 10_000,
        },
        {
          id: creditId,
          clerkUserId: "user_1",
          name: "Main card",
          type: "credit",
          currency: "PHP",
          balance: 2_000,
        },
      ],
    });

    await expect(
      createTransactionEvent(
        { db: db as never, userId: "user_1" },
        {
          type: "credit_payment",
          sourceAccountId: sourceId,
          creditAccountId: creditId,
          amount: 3_000,
          feeAmount: 0,
          date: new Date("2026-04-22T00:00:00.000Z"),
          description: "Too much payment",
          notes: "",
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Main card payment is higher than the current credit balance.",
    });
  });
});
