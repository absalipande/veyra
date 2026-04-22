import { beforeEach, describe, expect, it, vi } from "vitest";

import { billOccurrences, billSeries } from "@/db/schema";
import { completeBill, markBillPaid } from "@/features/bills/server/service";

type BillSeriesState = {
  id: string;
  clerkUserId: string;
  name: string;
  amount: number;
  currency: string;
  cadence: "one_time" | "weekly" | "monthly" | "yearly";
  intervalCount: number;
  startsAt: Date;
  nextDueDate: Date | null;
  endsAfterOccurrences: number | null;
  remainingOccurrences: number | null;
  isActive: boolean;
  accountId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BillOccurrenceState = {
  id: string;
  clerkUserId: string;
  billId: string;
  dueDate: Date;
  amount: number;
  status: "pending" | "paid" | "overdue";
  paidAt: Date | null;
  transactionEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createBillsHarness(seed: {
  series: BillSeriesState[];
  occurrences: BillOccurrenceState[];
}) {
  const state = {
    series: [...seed.series],
    occurrences: [...seed.occurrences],
  };

  const queryBillSeriesFindFirst = vi.fn(async (..._args: unknown[]) => state.series[0] ?? null);
  const queryBillOccurrencesFindFirst = vi.fn(async () => {
    const pending = state.occurrences
      .filter((entry) => entry.status === "pending")
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    return pending ?? null;
  });
  const queryBillOccurrencesFindMany = vi.fn(async () =>
    [...state.occurrences].sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime()),
  );

  const update = vi.fn((table: unknown) => ({
    set: (payload: Partial<BillOccurrenceState & BillSeriesState>) => ({
      where: vi.fn(() => {
        if (table === billOccurrences) {
          const target = state.occurrences
            .filter((entry) => entry.status === "pending")
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
          if (target) Object.assign(target, payload);
        }

        if (table === billSeries) {
          const target = state.series[0];
          if (target) Object.assign(target, payload);
        }

        return {
          returning: async () => [{ id: state.series[0]?.id }],
        };
      }),
    }),
  }));

  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((value: BillOccurrenceState) => {
      if (table === billOccurrences) {
        state.occurrences.push(value);
      }
      return {
        onConflictDoNothing: async () => undefined,
      };
    }),
  }));

  const deleteFn = vi.fn((table: unknown) => ({
    where: vi.fn(async () => {
      if (table === billOccurrences) {
        state.occurrences = state.occurrences.filter((entry) => entry.status !== "pending");
      }
    }),
  }));

  const db = {
    query: {
      billSeries: {
        findFirst: queryBillSeriesFindFirst,
      },
      billOccurrences: {
        findFirst: queryBillOccurrencesFindFirst,
        findMany: queryBillOccurrencesFindMany,
      },
    },
    update,
    insert,
    delete: deleteFn,
  };

  return {
    db,
    state,
  };
}

describe("bills service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("markBillPaid settle-only marks pending occurrence paid and creates the next recurrence", async () => {
    const seriesId = "b5f12502-b5f8-4ffa-b2bf-c1ed84713281";
    const firstDue = new Date("2026-05-10T00:00:00.000Z");
    const harness = createBillsHarness({
      series: [
        {
          id: seriesId,
          clerkUserId: "user_1",
          name: "Internet",
          amount: 1_500,
          currency: "PHP",
          cadence: "monthly",
          intervalCount: 1,
          startsAt: new Date("2026-05-01T00:00:00.000Z"),
          nextDueDate: firstDue,
          endsAfterOccurrences: 2,
          remainingOccurrences: 2,
          isActive: true,
          accountId: null,
          notes: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      occurrences: [
        {
          id: "7f9afd79-2276-4488-88bf-c0d093f9d704",
          clerkUserId: "user_1",
          billId: seriesId,
          dueDate: firstDue,
          amount: 1_500,
          status: "pending",
          paidAt: null,
          transactionEventId: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    vi.spyOn(crypto, "randomUUID").mockReturnValue("9ef45822-93f7-4f42-a378-a167a5fa1469");
    const paidAt = new Date("2026-05-10T08:30:00.000Z");

    const result = await markBillPaid(
      { db: harness.db as never, userId: "user_1" },
      {
        billId: seriesId,
        settleOnly: true,
        paidAt,
        notes: "Paid on app",
      },
    );

    expect(result.status).toBe("pending");
    expect(result.nextPendingOccurrence?.dueDate.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(harness.state.series[0]?.remainingOccurrences).toBe(1);
    expect(harness.state.series[0]?.isActive).toBe(true);
    expect(harness.state.occurrences.filter((entry) => entry.status === "paid")).toHaveLength(1);
    expect(harness.state.occurrences.filter((entry) => entry.status === "pending")).toHaveLength(1);
  });

  it("completeBill clears pending occurrences and deactivates the bill", async () => {
    const seriesId = "f6edeb17-bf70-4d55-8cbb-58cb7a618b91";
    const harness = createBillsHarness({
      series: [
        {
          id: seriesId,
          clerkUserId: "user_1",
          name: "Streaming",
          amount: 500,
          currency: "PHP",
          cadence: "monthly",
          intervalCount: 1,
          startsAt: new Date("2026-05-01T00:00:00.000Z"),
          nextDueDate: new Date("2026-06-01T00:00:00.000Z"),
          endsAfterOccurrences: null,
          remainingOccurrences: null,
          isActive: true,
          accountId: null,
          notes: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      occurrences: [
        {
          id: "f0f595ad-13b8-4d71-8bc9-a0ebfd73cc77",
          clerkUserId: "user_1",
          billId: seriesId,
          dueDate: new Date("2026-05-01T00:00:00.000Z"),
          amount: 500,
          status: "paid",
          paidAt: new Date("2026-05-01T00:00:00.000Z"),
          transactionEventId: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          id: "b3188d9f-dac8-4e40-b801-d8de11e31e6b",
          clerkUserId: "user_1",
          billId: seriesId,
          dueDate: new Date("2026-06-01T00:00:00.000Z"),
          amount: 500,
          status: "pending",
          paidAt: null,
          transactionEventId: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const result = await completeBill(
      { db: harness.db as never, userId: "user_1" },
      {
        id: seriesId,
      },
    );

    expect(result.id).toBe(seriesId);
    expect(harness.state.series[0]?.isActive).toBe(false);
    expect(harness.state.series[0]?.nextDueDate).toBeNull();
    expect(harness.state.occurrences.filter((entry) => entry.status === "pending")).toHaveLength(0);
  });
});
