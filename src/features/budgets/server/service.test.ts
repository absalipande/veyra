import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBudget, getBudgetsSummary } from "@/features/budgets/server/service";

type BudgetState = {
  id: string;
  clerkUserId: string;
  name: string;
  amount: number;
  period: "daily" | "weekly" | "bi-weekly" | "monthly";
  startDate: Date;
  salaryDates: string | null;
  parentBudgetId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function createBudgetsHarness(seed: { budgets: BudgetState[]; totalSpentQueue?: number[] }) {
  const state = {
    budgets: [...seed.budgets],
  };
  const totalSpentQueue = [...(seed.totalSpentQueue ?? [])];

  const selectWhere = vi.fn(async () => [{ totalSpent: totalSpentQueue.shift() ?? 0 }]);
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const insertReturning = vi.fn(async () => [state.budgets[state.budgets.length - 1]]);
  const insertValues = vi.fn(async (value: BudgetState) => {
    state.budgets.push(value);
    return { returning: insertReturning };
  });
  const insert = vi.fn(() => ({ values: insertValues }));

  const queryBudgetsFindFirst = vi.fn(
    async () => state.budgets.find((budget) => budget.id === "parent-weekly") ?? null,
  );
  const queryBudgetsFindMany = vi.fn(async () => state.budgets.filter((budget) => budget.isActive));

  return {
    db: {
      select,
      insert,
      query: {
        budgets: {
          findFirst: queryBudgetsFindFirst,
          findMany: queryBudgetsFindMany,
        },
      },
    },
    state,
    __mocks: {
      queryBudgetsFindFirst,
      queryBudgetsFindMany,
      selectWhere,
      insertValues,
      insertReturning,
    },
  };
}

describe("budgets service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects createBudget when parent period is shorter than child period", async () => {
    const harness = createBudgetsHarness({
      budgets: [
        {
          id: "parent-weekly",
          clerkUserId: "user_1",
          name: "Parent weekly",
          amount: 10_000,
          period: "weekly",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          salaryDates: null,
          parentBudgetId: null,
          isActive: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      createBudget(
        { db: harness.db as never, userId: "user_1" },
        {
          name: "Monthly child",
          amount: 5_000,
          period: "monthly",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          salaryDates: undefined,
          parentBudgetId: "parent-weekly",
          isActive: true,
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("summarizes only parent budgets in top-line totals while retaining full budget breakdowns", async () => {
    const harness = createBudgetsHarness({
      budgets: [
        {
          id: "parent-1",
          clerkUserId: "user_1",
          name: "Household",
          amount: 10_000,
          period: "monthly",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          salaryDates: null,
          parentBudgetId: null,
          isActive: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          id: "child-1",
          clerkUserId: "user_1",
          name: "Groceries",
          amount: 5_000,
          period: "weekly",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          salaryDates: null,
          parentBudgetId: "parent-1",
          isActive: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          id: "parent-2",
          clerkUserId: "user_1",
          name: "Transport",
          amount: 10_000,
          period: "monthly",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          salaryDates: null,
          parentBudgetId: null,
          isActive: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
      totalSpentQueue: [9_500, 4_000, 3_000],
    });

    const result = await getBudgetsSummary({ db: harness.db as never, userId: "user_1" });

    expect(result.budgets).toHaveLength(3);
    expect(result.summary.totalBudgets).toBe(2);
    expect(result.summary.onTrackBudgets).toBe(1);
    expect(result.summary.dangerBudgets).toBe(1);
    expect(result.summary.warningBudgets).toBe(0);
    expect(result.summary.exceededBudgets).toBe(0);
    expect(result.summary.totalBudgetAmount).toBe(20_000);
    expect(result.summary.totalSpentAmount).toBe(12_500);
    expect(result.summary.totalRemaining).toBe(7_500);
  });
});
