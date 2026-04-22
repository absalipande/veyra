import { describe, expect, it } from "vitest";

import { getCashflowForecast } from "@/features/forecast/server/service";

function createForecastHarness(seed: {
  defaultCurrency?: string;
  accounts: Array<{
    id: string;
    clerkUserId: string;
    type: "cash" | "wallet" | "credit" | "loan";
    currency: string;
    balance: number;
  }>;
  billSeries: Array<{
    id: string;
    clerkUserId: string;
    name: string;
    currency: string;
    isActive: boolean;
  }>;
  billOccurrences: Array<{
    id: string;
    clerkUserId: string;
    billId: string;
    dueDate: Date;
    amount: number;
    status: "pending" | "paid" | "overdue";
  }>;
  loans: Array<{
    id: string;
    clerkUserId: string;
    name: string;
    currency: string;
    status: "active" | "closed";
  }>;
  installments: Array<{
    id: string;
    clerkUserId: string;
    loanId: string;
    dueDate: Date;
    amount: number;
    paidAmount: number;
  }>;
}) {
  return {
    db: {
      query: {
        userPreferences: {
          findFirst: async () =>
            seed.defaultCurrency ? { defaultCurrency: seed.defaultCurrency } : null,
        },
        accounts: {
          findMany: async () => seed.accounts,
        },
        billOccurrences: {
          findMany: async () => seed.billOccurrences,
        },
        billSeries: {
          findMany: async () => seed.billSeries,
        },
        loanInstallments: {
          findMany: async () => seed.installments,
        },
        loans: {
          findMany: async () => seed.loans,
        },
      },
    },
  };
}

describe("forecast service", () => {
  it("builds daily projection with bill and installment obligations", async () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const harness = createForecastHarness({
      defaultCurrency: "PHP",
      accounts: [
        {
          id: "cash-1",
          clerkUserId: "user_1",
          type: "cash",
          currency: "PHP",
          balance: 20_000,
        },
        {
          id: "wallet-1",
          clerkUserId: "user_1",
          type: "wallet",
          currency: "PHP",
          balance: 5_000,
        },
      ],
      billSeries: [
        {
          id: "bill-1",
          clerkUserId: "user_1",
          name: "Internet",
          currency: "PHP",
          isActive: true,
        },
      ],
      billOccurrences: [
        {
          id: "occ-1",
          clerkUserId: "user_1",
          billId: "bill-1",
          dueDate: new Date("2026-04-24T00:00:00.000Z"),
          amount: 1_500,
          status: "pending",
        },
      ],
      loans: [
        {
          id: "loan-1",
          clerkUserId: "user_1",
          name: "Atome",
          currency: "PHP",
          status: "active",
        },
      ],
      installments: [
        {
          id: "inst-1",
          clerkUserId: "user_1",
          loanId: "loan-1",
          dueDate: new Date("2026-04-26T00:00:00.000Z"),
          amount: 3_000,
          paidAmount: 1_000,
        },
      ],
    });

    const result = await getCashflowForecast(
      { db: harness.db as never, userId: "user_1" },
      { days: 7, currency: "PHP" },
      { now }
    );

    expect(result.startingBalance).toBe(25_000);
    expect(result.obligationsTotal).toBe(3_500);
    expect(result.projectedEndingBalance).toBe(21_500);
    expect(result.lowestBalance).toBe(21_500);
    expect(result.riskLevel).toBe("safe");
    expect(result.dailyProjection).toHaveLength(7);
    expect(result.topObligations).toHaveLength(2);
    expect(result.dueSoonCount).toBe(2);
    expect(result.dueSoonAmount).toBe(3_500);
  });

  it("reports shortfall when obligations push balance below zero", async () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const harness = createForecastHarness({
      defaultCurrency: "PHP",
      accounts: [
        {
          id: "cash-1",
          clerkUserId: "user_1",
          type: "cash",
          currency: "PHP",
          balance: 2_000,
        },
      ],
      billSeries: [
        {
          id: "bill-1",
          clerkUserId: "user_1",
          name: "Rent",
          currency: "PHP",
          isActive: true,
        },
      ],
      billOccurrences: [
        {
          id: "occ-1",
          clerkUserId: "user_1",
          billId: "bill-1",
          dueDate: new Date("2026-04-23T00:00:00.000Z"),
          amount: 5_000,
          status: "pending",
        },
      ],
      loans: [],
      installments: [],
    });

    const result = await getCashflowForecast(
      { db: harness.db as never, userId: "user_1" },
      { days: 7 },
      { now }
    );

    expect(result.currency).toBe("PHP");
    expect(result.startingBalance).toBe(2_000);
    expect(result.lowestBalance).toBe(-3_000);
    expect(result.riskLevel).toBe("shortfall");
    expect(result.topObligations[0]?.name).toBe("Rent");
  });

  it("falls back to strongest liquid currency when preferred currency has no liquid accounts", async () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const harness = createForecastHarness({
      defaultCurrency: "PHP",
      accounts: [
        {
          id: "cash-usd-1",
          clerkUserId: "user_1",
          type: "cash",
          currency: "USD",
          balance: 9_000,
        },
        {
          id: "wallet-usd-2",
          clerkUserId: "user_1",
          type: "wallet",
          currency: "USD",
          balance: 2_000,
        },
        {
          id: "cash-eur",
          clerkUserId: "user_1",
          type: "cash",
          currency: "EUR",
          balance: 5_000,
        },
      ],
      billSeries: [],
      billOccurrences: [],
      loans: [],
      installments: [],
    });

    const result = await getCashflowForecast(
      { db: harness.db as never, userId: "user_1" },
      { days: 30 },
      { now }
    );

    expect(result.currency).toBe("USD");
    expect(result.startingBalance).toBe(11_000);
  });

  it("marks projection as watch when lowest balance drops below half of starting balance", async () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const harness = createForecastHarness({
      defaultCurrency: "PHP",
      accounts: [
        {
          id: "cash-php",
          clerkUserId: "user_1",
          type: "cash",
          currency: "PHP",
          balance: 10_000,
        },
      ],
      billSeries: [
        {
          id: "bill-1",
          clerkUserId: "user_1",
          name: "Tuition reserve",
          currency: "PHP",
          isActive: true,
        },
      ],
      billOccurrences: [
        {
          id: "occ-1",
          clerkUserId: "user_1",
          billId: "bill-1",
          dueDate: new Date("2026-04-25T00:00:00.000Z"),
          amount: 5_200,
          status: "pending",
        },
      ],
      loans: [],
      installments: [],
    });

    const result = await getCashflowForecast(
      { db: harness.db as never, userId: "user_1" },
      { days: 10 },
      { now }
    );

    expect(result.lowestBalance).toBe(4_800);
    expect(result.riskLevel).toBe("watch");
  });

  it("sorts top obligations by due date then amount descending for same-day items", async () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const harness = createForecastHarness({
      defaultCurrency: "PHP",
      accounts: [
        {
          id: "cash-php",
          clerkUserId: "user_1",
          type: "cash",
          currency: "PHP",
          balance: 20_000,
        },
      ],
      billSeries: [
        {
          id: "bill-1",
          clerkUserId: "user_1",
          name: "Electricity",
          currency: "PHP",
          isActive: true,
        },
        {
          id: "bill-2",
          clerkUserId: "user_1",
          name: "Water",
          currency: "PHP",
          isActive: true,
        },
      ],
      billOccurrences: [
        {
          id: "occ-1",
          clerkUserId: "user_1",
          billId: "bill-1",
          dueDate: new Date("2026-04-24T00:00:00.000Z"),
          amount: 1_000,
          status: "pending",
        },
        {
          id: "occ-2",
          clerkUserId: "user_1",
          billId: "bill-2",
          dueDate: new Date("2026-04-24T00:00:00.000Z"),
          amount: 2_000,
          status: "pending",
        },
      ],
      loans: [],
      installments: [],
    });

    const result = await getCashflowForecast(
      { db: harness.db as never, userId: "user_1" },
      { days: 10 },
      { now }
    );

    expect(result.topObligations.map((entry) => entry.name)).toEqual(["Water", "Electricity"]);
  });

  it("excludes installments tied to closed loans from projected obligations", async () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const harness = createForecastHarness({
      defaultCurrency: "PHP",
      accounts: [
        {
          id: "cash-php",
          clerkUserId: "user_1",
          type: "cash",
          currency: "PHP",
          balance: 10_000,
        },
      ],
      billSeries: [],
      billOccurrences: [],
      loans: [
        {
          id: "loan-closed",
          clerkUserId: "user_1",
          name: "Closed loan",
          currency: "PHP",
          status: "closed",
        },
      ],
      installments: [
        {
          id: "inst-1",
          clerkUserId: "user_1",
          loanId: "loan-closed",
          dueDate: new Date("2026-04-25T00:00:00.000Z"),
          amount: 2_000,
          paidAmount: 500,
        },
      ],
    });

    const result = await getCashflowForecast(
      { db: harness.db as never, userId: "user_1" },
      { days: 10 },
      { now }
    );

    expect(result.obligationsTotal).toBe(0);
    expect(result.topObligations).toHaveLength(0);
  });
});
