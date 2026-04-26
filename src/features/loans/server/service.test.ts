import { beforeEach, describe, expect, it, vi } from "vitest";

import { accounts, loanInstallments, loanPayments, loans } from "@/db/schema";
import { recordLoanPayment } from "@/features/loans/server/service";

type AccountState = {
  id: string;
  clerkUserId: string;
  name: string;
  type: "cash" | "wallet" | "credit" | "loan";
  currency: string;
  balance: number;
  creditLimit?: number;
};

type LoanState = {
  id: string;
  clerkUserId: string;
  kind: "institution" | "personal";
  name: string;
  lenderName: string;
  currency: string;
  principalAmount: number;
  outstandingAmount: number;
  disbursedAt: Date;
  status: "active" | "closed";
  destinationAccountId: string;
  underlyingLoanAccountId: string | null;
  repaymentAccountId?: string | null;
  repaymentAccountKind?: "loan_account" | "credit_account";
  liabilityTreatment?: "separate_loan" | "credit_linked_overlay";
  creditBalanceTreatment?: "already_included" | "add_to_credit_balance" | "track_separately" | null;
  creditLinkedOpeningAmount?: number;
  creditBalanceAtLink?: number | null;
  creditLimitAtLink?: number | null;
  creditAvailableAtLink?: number | null;
  creditUtilizationAtLink?: number | null;
  creditOpeningAdjustmentApplied?: boolean;
  defaultPaymentSourceAccountId?: string | null;
  cadence: "daily" | "weekly" | "bi-weekly" | "monthly" | null;
  nextDueDate: Date | null;
  notes: string | null;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type InstallmentState = {
  id: string;
  clerkUserId: string;
  loanId: string;
  sequence: number;
  dueDate: Date;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paidAmount: number;
  paidPrincipalAmount: number;
  paidInterestAmount: number;
  paidAt: Date | null;
  status: "pending" | "paid" | "overdue";
  createdAt: Date;
  updatedAt: Date;
};

type LoanPaymentState = {
  id: string;
  clerkUserId: string;
  loanId: string;
  installmentId: string | null;
  sourceAccountId: string;
  amount: number;
  appliedAmount: number;
  principalAmount: number;
  interestAmount: number;
  paidAt: Date;
  notes: string | null;
  createdAt: Date;
};

function createLoansHarness(seed: {
  accounts: AccountState[];
  loan: LoanState;
  installments: InstallmentState[];
  payments?: LoanPaymentState[];
  duplicatePayment?: LoanPaymentState | null;
}) {
  const state = {
    accounts: [...seed.accounts],
    loan: { ...seed.loan },
    installments: [...seed.installments],
    payments: [...(seed.payments ?? [])],
  };

  let accountQueryCall = 0;
  let installmentUpdateCursor = 0;
  let pendingBalanceMutations: Array<{ accountId: string; amountDelta: number }> = [];

  const queryAccountsFindFirst = vi.fn(async () => {
    const row = state.accounts[accountQueryCall];
    accountQueryCall += 1;
    return row ?? null;
  });

  const queryLoansFindFirst = vi.fn(async () => state.loan);
  const queryLoanInstallmentsFindMany = vi.fn(async () =>
    [...state.installments].sort((a, b) => a.sequence - b.sequence),
  );
  const queryLoanPaymentsFindMany = vi.fn(async () =>
    [...state.payments].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()),
  );
  const queryLoanPaymentsFindFirst = vi.fn(async () => seed.duplicatePayment ?? null);

  const update = vi.fn((table: unknown) => ({
    set: (payload: Record<string, unknown>) => ({
      where: vi.fn(() => {
        if (table === loanInstallments) {
          const sorted = [...state.installments].sort((a, b) => a.sequence - b.sequence);
          const target = sorted[installmentUpdateCursor];
          installmentUpdateCursor += 1;
          if (target) {
            Object.assign(target, payload);
          }
        }

        if (table === loans) {
          Object.assign(state.loan, payload);
        }

        if (table === accounts) {
          const next = pendingBalanceMutations.shift();
          if (!next && typeof payload.balance !== "number") {
            throw new Error("Missing pending account balance mutation.");
          }
          const target = next
            ? state.accounts.find((account) => account.id === next.accountId)
            : state.accounts.find((account) => account.type === "loan");
          if (!target) {
            throw new Error("Unknown account balance mutation target.");
          }
          if (next) {
            target.balance += next.amountDelta;
          } else if (typeof payload.balance === "number") {
            target.balance = payload.balance;
          }
        }

        return {
          returning: async () => [{}],
        };
      }),
    }),
  }));

  const insert = vi.fn((table: unknown) => ({
    values: vi.fn(async (value: LoanPaymentState) => {
      if (table === loanPayments) {
        state.payments.push({
          ...value,
          createdAt: new Date(),
        });
      }
    }),
  }));

  return {
    db: {
      query: {
        accounts: {
          findFirst: queryAccountsFindFirst,
        },
        loans: {
          findFirst: queryLoansFindFirst,
        },
        loanInstallments: {
          findMany: queryLoanInstallmentsFindMany,
        },
        loanPayments: {
          findMany: queryLoanPaymentsFindMany,
          findFirst: queryLoanPaymentsFindFirst,
        },
      },
      update,
      insert,
    },
    state,
    setBalanceMutations(entries: Array<{ accountId: string; amountDelta: number }>) {
      pendingBalanceMutations = [...entries];
    },
    resetInstallmentCursor() {
      installmentUpdateCursor = 0;
    },
  };
}

describe("loans service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allocates payment across installments and updates balances/outstanding correctly", async () => {
    const sourceAccountId = "7878f5df-c8d7-4f8b-8ee8-38c2d2824f7f";
    const liabilityAccountId = "90430176-f071-4bfd-a4fb-e53a8cf04f1e";
    const loanId = "e5433f04-7dac-491c-82f0-71523f313f22";
    const paidAt = new Date("2026-06-15T00:00:00.000Z");

    const harness = createLoansHarness({
      accounts: [
        {
          id: sourceAccountId,
          clerkUserId: "user_1",
          name: "Wallet",
          type: "wallet",
          currency: "PHP",
          balance: 10_000,
        },
        {
          id: liabilityAccountId,
          clerkUserId: "user_1",
          name: "Loan account",
          type: "loan",
          currency: "PHP",
          balance: 6_000,
        },
      ],
      loan: {
        id: loanId,
        clerkUserId: "user_1",
        kind: "institution",
        name: "Atome loan",
        lenderName: "Atome",
        currency: "PHP",
        principalAmount: 4_000,
        outstandingAmount: 3_000,
        disbursedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: "active",
        destinationAccountId: sourceAccountId,
        underlyingLoanAccountId: liabilityAccountId,
        cadence: "monthly",
        nextDueDate: new Date("2026-06-10T00:00:00.000Z"),
        notes: null,
        metadata: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      installments: [
        {
          id: "37cf0752-02c8-4df1-bae1-f743d7aeaf3a",
          clerkUserId: "user_1",
          loanId,
          sequence: 1,
          dueDate: new Date("2026-06-10T00:00:00.000Z"),
          amount: 2_000,
          principalAmount: 1_500,
          interestAmount: 500,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidAt: null,
          status: "pending",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          id: "8fa7ef65-1552-48e2-a0af-a2fa0f2059c7",
          clerkUserId: "user_1",
          loanId,
          sequence: 2,
          dueDate: new Date("2026-07-10T00:00:00.000Z"),
          amount: 2_000,
          principalAmount: 1_500,
          interestAmount: 500,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidAt: null,
          status: "pending",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    });

    harness.setBalanceMutations([
      { accountId: sourceAccountId, amountDelta: -2_500 },
    ]);
    harness.resetInstallmentCursor();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("7f23823c-0351-4731-a2be-a2d1671c83b0");

    const result = await recordLoanPayment(
      { db: harness.db as never, userId: "user_1" },
      {
        loanId,
        sourceAccountId,
        amount: 2_500,
        paidAt,
        notes: "June payment",
      },
    );

    expect(result.appliedAmount).toBe(2_500);
    expect(result.allocatedToSchedule).toBe(2_500);
    expect(result.unappliedAmount).toBe(0);

    expect(harness.state.accounts.find((a) => a.id === sourceAccountId)?.balance).toBe(7_500);
    expect(harness.state.accounts.find((a) => a.id === liabilityAccountId)?.balance).toBe(1_500);
    expect(harness.state.loan.outstandingAmount).toBe(1_500);
    expect(harness.state.loan.status).toBe("active");
    expect(harness.state.loan.nextDueDate?.toISOString()).toBe("2026-07-10T00:00:00.000Z");

    const firstInstallment = harness.state.installments[0];
    const secondInstallment = harness.state.installments[1];
    expect(firstInstallment?.status).toBe("paid");
    expect(firstInstallment?.paidAmount).toBe(2_000);
    expect(firstInstallment?.paidPrincipalAmount).toBe(1_500);
    expect(firstInstallment?.paidInterestAmount).toBe(500);
    expect(secondInstallment?.status).toBe("pending");
    expect(secondInstallment?.paidAmount).toBe(500);
    expect(secondInstallment?.paidPrincipalAmount).toBe(375);
    expect(secondInstallment?.paidInterestAmount).toBe(125);

    expect(harness.state.payments).toHaveLength(1);
    expect(harness.state.payments[0]).toMatchObject({
      amount: 2_500,
      appliedAmount: 2_500,
      principalAmount: 1_875,
      interestAmount: 625,
    });
    expect(result.loan.paidInstallmentCount).toBe(1);
  });

  it("closes loan when payment settles remaining outstanding balance", async () => {
    const sourceAccountId = "5f3f9618-7150-4fa1-913c-a9fdcad92a37";
    const liabilityAccountId = "e6f7ccb5-df84-492f-adf0-4797d7a3027e";
    const loanId = "c544f247-f664-4bdf-bf45-b777e6ca3f2e";

    const harness = createLoansHarness({
      accounts: [
        {
          id: sourceAccountId,
          clerkUserId: "user_1",
          name: "Wallet",
          type: "wallet",
          currency: "PHP",
          balance: 2_000,
        },
        {
          id: liabilityAccountId,
          clerkUserId: "user_1",
          name: "Loan account",
          type: "loan",
          currency: "PHP",
          balance: 1_000,
        },
      ],
      loan: {
        id: loanId,
        clerkUserId: "user_1",
        kind: "institution",
        name: "Small loan",
        lenderName: "Lender",
        currency: "PHP",
        principalAmount: 1_000,
        outstandingAmount: 1_000,
        disbursedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: "active",
        destinationAccountId: sourceAccountId,
        underlyingLoanAccountId: liabilityAccountId,
        cadence: "monthly",
        nextDueDate: new Date("2026-06-10T00:00:00.000Z"),
        notes: null,
        metadata: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      installments: [
        {
          id: "bb8c0134-a1ad-49c6-aa66-30529d1c8359",
          clerkUserId: "user_1",
          loanId,
          sequence: 1,
          dueDate: new Date("2026-06-10T00:00:00.000Z"),
          amount: 1_000,
          principalAmount: 900,
          interestAmount: 100,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidAt: null,
          status: "pending",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    });

    harness.setBalanceMutations([
      { accountId: sourceAccountId, amountDelta: -1_000 },
      { accountId: liabilityAccountId, amountDelta: -1_000 },
    ]);
    harness.resetInstallmentCursor();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("a119f4f8-fef2-4318-8ddc-e5b4cc1eac2e");

    const result = await recordLoanPayment(
      { db: harness.db as never, userId: "user_1" },
      {
        loanId,
        sourceAccountId,
        amount: 2_500,
        paidAt: new Date("2026-06-15T00:00:00.000Z"),
        notes: "",
      },
    );

    expect(result.appliedAmount).toBe(1_000);
    expect(result.allocatedToSchedule).toBe(1_000);
    expect(result.unappliedAmount).toBe(0);
    expect(harness.state.loan.outstandingAmount).toBe(0);
    expect(harness.state.loan.status).toBe("closed");
    expect(harness.state.loan.nextDueDate).toBeNull();
    expect(harness.state.installments[0]?.status).toBe("paid");
    expect(result.loan.status).toBe("closed");
    expect(result.loan.paidInstallmentCount).toBe(1);
  });

  it("throws NOT_FOUND when targeted installment does not belong to the loan", async () => {
    const sourceAccountId = "f72cb31a-31c7-4f8b-9a8f-c95a4f660607";
    const liabilityAccountId = "f2fabd29-4108-4ac8-b528-0fecaf9df5ab";
    const loanId = "0ebc9745-fe8a-4428-8af5-db368a6f7192";
    const harness = createLoansHarness({
      accounts: [
        {
          id: sourceAccountId,
          clerkUserId: "user_1",
          name: "Wallet",
          type: "wallet",
          currency: "PHP",
          balance: 5_000,
        },
        {
          id: liabilityAccountId,
          clerkUserId: "user_1",
          name: "Loan account",
          type: "loan",
          currency: "PHP",
          balance: 4_000,
        },
      ],
      loan: {
        id: loanId,
        clerkUserId: "user_1",
        kind: "institution",
        name: "Loan",
        lenderName: "Lender",
        currency: "PHP",
        principalAmount: 4_000,
        outstandingAmount: 4_000,
        disbursedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: "active",
        destinationAccountId: sourceAccountId,
        underlyingLoanAccountId: liabilityAccountId,
        cadence: "monthly",
        nextDueDate: new Date("2026-06-10T00:00:00.000Z"),
        notes: null,
        metadata: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      installments: [
        {
          id: "4459f281-5224-4d24-bfd8-39f0e4f2e78f",
          clerkUserId: "user_1",
          loanId,
          sequence: 1,
          dueDate: new Date("2026-06-10T00:00:00.000Z"),
          amount: 2_000,
          principalAmount: 1_500,
          interestAmount: 500,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidAt: null,
          status: "pending",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      recordLoanPayment(
        { db: harness.db as never, userId: "user_1" },
        {
          loanId,
          installmentId: "9f195f31-5069-4fdd-b8dc-a35ce247d40d",
          sourceAccountId,
          amount: 1_000,
          paidAt: new Date("2026-06-15T00:00:00.000Z"),
          notes: "",
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns existing result for duplicate payment submissions within idempotency window", async () => {
    const sourceAccountId = "f2f87ef0-4469-43e4-b56b-0bfdad85fda1";
    const liabilityAccountId = "9be7881f-c6da-45c9-8e4e-b26874922095";
    const loanId = "e1058839-98ab-4b5d-8cf5-37db95f65a31";
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const duplicatePayment: LoanPaymentState = {
      id: "bc7722ca-d52f-42cc-8d65-89ab3db5a3bf",
      clerkUserId: "user_1",
      loanId,
      installmentId: "7805bd4e-cbf7-4412-80dc-b9b0fee8ad81",
      sourceAccountId,
      amount: 1_000,
      appliedAmount: 1_000,
      principalAmount: 900,
      interestAmount: 100,
      paidAt,
      notes: "retry",
      createdAt: new Date(),
    };

    const harness = createLoansHarness({
      accounts: [
        {
          id: sourceAccountId,
          clerkUserId: "user_1",
          name: "Wallet",
          type: "wallet",
          currency: "PHP",
          balance: 8_000,
        },
        {
          id: liabilityAccountId,
          clerkUserId: "user_1",
          name: "Loan account",
          type: "loan",
          currency: "PHP",
          balance: 2_000,
        },
      ],
      loan: {
        id: loanId,
        clerkUserId: "user_1",
        kind: "institution",
        name: "Loan",
        lenderName: "Lender",
        currency: "PHP",
        principalAmount: 3_000,
        outstandingAmount: 2_000,
        disbursedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: "active",
        destinationAccountId: sourceAccountId,
        underlyingLoanAccountId: liabilityAccountId,
        cadence: "monthly",
        nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
        notes: null,
        metadata: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      installments: [
        {
          id: "7805bd4e-cbf7-4412-80dc-b9b0fee8ad81",
          clerkUserId: "user_1",
          loanId,
          sequence: 1,
          dueDate: new Date("2026-07-01T00:00:00.000Z"),
          amount: 1_000,
          principalAmount: 900,
          interestAmount: 100,
          paidAmount: 1_000,
          paidPrincipalAmount: 900,
          paidInterestAmount: 100,
          paidAt,
          status: "paid",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-15T00:00:00.000Z"),
        },
      ],
      payments: [duplicatePayment],
      duplicatePayment,
    });

    const sourceBefore = harness.state.accounts.find((row) => row.id === sourceAccountId)?.balance;
    const liabilityBefore = harness.state.accounts.find((row) => row.id === liabilityAccountId)?.balance;

    const result = await recordLoanPayment(
      { db: harness.db as never, userId: "user_1" },
      {
        loanId,
        sourceAccountId,
        amount: 1_000,
        paidAt,
        notes: "retry",
      },
    );

    expect(result.appliedAmount).toBe(1_000);
    expect(result.allocatedToSchedule).toBe(1_000);
    expect(result.unappliedAmount).toBe(0);
    expect(harness.state.payments).toHaveLength(1);
    expect(harness.state.accounts.find((row) => row.id === sourceAccountId)?.balance).toBe(sourceBefore);
    expect(harness.state.accounts.find((row) => row.id === liabilityAccountId)?.balance).toBe(liabilityBefore);
  });

  it("records credit-linked loan payments as deltas against the linked credit account", async () => {
    const sourceAccountId = "7d15a7d9-c019-44de-8bb4-3daa5fc0f7ea";
    const creditAccountId = "f2e3cf9f-3fcb-4877-9eec-7c521ad7ed91";
    const loanId = "34d51285-5d74-4c54-ac6c-9a22018a7431";

    const harness = createLoansHarness({
      accounts: [
        {
          id: sourceAccountId,
          clerkUserId: "user_1",
          name: "BDO Savings",
          type: "cash",
          currency: "PHP",
          balance: 50_000,
        },
        {
          id: creditAccountId,
          clerkUserId: "user_1",
          name: "RCBC Gold Mastercard",
          type: "credit",
          currency: "PHP",
          balance: 40_865,
          creditLimit: 50_000,
        },
      ],
      loan: {
        id: loanId,
        clerkUserId: "user_1",
        kind: "institution",
        name: "RCBC Cash Loan",
        lenderName: "RCBC",
        currency: "PHP",
        principalAmount: 42_000,
        outstandingAmount: 52_938,
        disbursedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: "active",
        destinationAccountId: sourceAccountId,
        underlyingLoanAccountId: null,
        repaymentAccountId: creditAccountId,
        repaymentAccountKind: "credit_account",
        liabilityTreatment: "credit_linked_overlay",
        creditBalanceTreatment: "already_included",
        creditLinkedOpeningAmount: 42_000,
        creditBalanceAtLink: 40_865,
        creditLimitAtLink: 50_000,
        creditAvailableAtLink: 9_135,
        creditUtilizationAtLink: 82,
        creditOpeningAdjustmentApplied: false,
        defaultPaymentSourceAccountId: sourceAccountId,
        cadence: "monthly",
        nextDueDate: new Date("2026-05-01T00:00:00.000Z"),
        notes: null,
        metadata: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      installments: [
        {
          id: "cd94a6d3-4c9d-4a09-84f9-cab6355de8d0",
          clerkUserId: "user_1",
          loanId,
          sequence: 1,
          dueDate: new Date("2026-05-01T00:00:00.000Z"),
          amount: 2_206,
          principalAmount: 1_700,
          interestAmount: 506,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidAt: null,
          status: "pending",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          id: "399b0a1d-9d52-406c-8e5e-9fa3e24ee2e6",
          clerkUserId: "user_1",
          loanId,
          sequence: 2,
          dueDate: new Date("2026-06-01T00:00:00.000Z"),
          amount: 50_732,
          principalAmount: 40_300,
          interestAmount: 10_432,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidAt: null,
          status: "pending",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    });

    harness.setBalanceMutations([
      { accountId: sourceAccountId, amountDelta: -2_206 },
      { accountId: creditAccountId, amountDelta: -2_206 },
    ]);
    harness.resetInstallmentCursor();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("055a209b-20e0-4da9-a68e-2af7be366cb2");

    const result = await recordLoanPayment(
      { db: harness.db as never, userId: "user_1" },
      {
        loanId,
        sourceAccountId,
        amount: 2_206,
        paidAt: new Date("2026-05-01T00:00:00.000Z"),
        notes: "First RCBC amortization",
      },
    );

    expect(result.appliedAmount).toBe(2_206);
    expect(harness.state.accounts.find((row) => row.id === sourceAccountId)?.balance).toBe(47_794);
    expect(harness.state.accounts.find((row) => row.id === creditAccountId)?.balance).toBe(38_659);
    expect(harness.state.loan.outstandingAmount).toBe(50_732);
    expect(harness.state.loan.repaymentAccountKind).toBe("credit_account");
    expect(harness.state.loan.underlyingLoanAccountId).toBeNull();
  });
});
