import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { createAccount, deleteAccount, updateAccount } from "@/features/accounts/server/service";
import { createAccountSchema } from "@/features/accounts/server/schema";

function createAccountsDbMock() {
  const findFirst = vi.fn();
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn();
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    query: {
      accounts: {
        findFirst,
      },
    },
    insert,
    update,
    delete: deleteFn,
    __mocks: {
      findFirst,
      insertValues,
      insertReturning,
      updateSet,
      updateWhere,
      updateReturning,
      deleteWhere,
      deleteFn,
    },
  };
}

describe("accounts service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("createAccount returns firstAccount=true when user has no existing accounts", async () => {
    const db = createAccountsDbMock();
    const id = "1b2ea108-5f62-4a0a-b779-3ed3e9e3d735";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
    db.__mocks.findFirst.mockResolvedValueOnce(null);
    db.__mocks.insertReturning.mockResolvedValueOnce([
      {
        id,
        clerkUserId: "user_1",
        name: "Maya wallet",
        currency: "PHP",
        institution: null,
        type: "wallet",
        balance: 120_000,
        creditLimit: 0,
      },
    ]);

    const result = await createAccount(
      { db: db as never, userId: "user_1" },
      {
        name: "Maya wallet",
        currency: "PHP",
        institution: "",
        type: "wallet",
        balance: 120_000,
        creditLimit: 9_999,
      },
    );

    expect(result.firstAccount).toBe(true);
    expect(result.account.id).toBe(id);
    expect(db.__mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: "user_1",
        creditLimit: 0,
        type: "wallet",
      }),
    );
  });

  it("updateAccount forces creditLimit to zero for non-credit account types", async () => {
    const db = createAccountsDbMock();
    const accountId = "eb48dc06-9c4b-4dbe-8e7a-b7bc4c9b2877";

    db.__mocks.findFirst.mockResolvedValueOnce({
      id: accountId,
      clerkUserId: "user_1",
      type: "credit",
    });
    db.__mocks.updateReturning.mockResolvedValueOnce([
      {
        id: accountId,
        clerkUserId: "user_1",
        name: "Emergency wallet",
        currency: "PHP",
        institution: null,
        type: "wallet",
        balance: 50_000,
        creditLimit: 0,
      },
    ]);

    const result = await updateAccount(
      { db: db as never, userId: "user_1" },
      {
        id: accountId,
        name: "Emergency wallet",
        currency: "PHP",
        institution: "",
        type: "wallet",
        balance: 50_000,
        creditLimit: 500_000,
      },
    );

    expect(result.account.creditLimit).toBe(0);
    expect(db.__mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        creditLimit: 0,
      }),
    );
  });

  it("rejects negative bank or wallet opening balances", () => {
    expect(() =>
      createAccountSchema.parse({
        name: "Emergency fund",
        currency: "PHP",
        institution: "",
        type: "cash",
        balance: -1_000,
        creditLimit: 0,
      }),
    ).toThrow(ZodError);
  });

  it("rejects credit balances higher than the credit limit", () => {
    expect(() =>
      createAccountSchema.parse({
        name: "Main card",
        currency: "PHP",
        institution: "",
        type: "credit",
        balance: 55_000,
        creditLimit: 50_000,
      }),
    ).toThrow(ZodError);
  });

  it("deleteAccount throws NOT_FOUND when record belongs to a different user", async () => {
    const db = createAccountsDbMock();
    const accountId = "9be48dbd-ae0b-4375-9278-1f232f87c4bb";
    db.__mocks.findFirst.mockResolvedValueOnce({
      id: accountId,
      clerkUserId: "another_user",
    });

    await expect(
      deleteAccount({ db: db as never, userId: "user_1" }, { id: accountId }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(db.__mocks.deleteFn).not.toHaveBeenCalled();
  });
});
