import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { categories, transactionEvents } from "@/db/schema";
import {
  createCategorySchema,
  deleteCategorySchema,
  updateCategorySchema,
} from "@/features/categories/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

async function ensureUniqueName(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: { id?: string; kind: CreateCategoryInput["kind"]; name: string }
) {
  const userId = assertUserId(ctx.userId);
  const normalized = input.name.trim().toLowerCase();

  const existing = await ctx.db.query.categories.findMany({
    where: and(
      eq(categories.clerkUserId, userId),
      eq(categories.kind, input.kind),
      eq(categories.isArchived, false)
    ),
    columns: {
      id: true,
      name: true,
    },
  });

  const duplicate = existing.find(
    (category) => category.name.trim().toLowerCase() === normalized && category.id !== input.id
  );

  if (duplicate) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A category with that name already exists for this type.",
    });
  }
}

export async function listCategories(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  return ctx.db.query.categories.findMany({
    where: and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)),
    orderBy: [asc(categories.kind), asc(categories.sortOrder), asc(categories.name)],
  });
}

export async function getCategoriesSummary(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const [row] = await ctx.db
    .select({
      totalCategories: sql<number>`count(*)`,
      expenseCategories: sql<number>`coalesce(sum(case when ${categories.kind} = 'expense' then 1 else 0 end), 0)`,
      incomeCategories: sql<number>`coalesce(sum(case when ${categories.kind} = 'income' then 1 else 0 end), 0)`,
    })
    .from(categories)
    .where(and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)));

  return {
    totalCategories: Number(row?.totalCategories ?? 0),
    expenseCategories: Number(row?.expenseCategories ?? 0),
    incomeCategories: Number(row?.incomeCategories ?? 0),
  };
}

export async function createCategory(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateCategoryInput
) {
  const userId = assertUserId(ctx.userId);

  await ensureUniqueName(ctx, input);

  const [created] = await ctx.db
    .insert(categories)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      name: input.name.trim(),
      kind: input.kind,
    })
    .returning();

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create category.",
    });
  }

  return {
    category: created,
  };
}

export async function updateCategory(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateCategoryInput
) {
  const userId = assertUserId(ctx.userId);

  const existing = await ctx.db.query.categories.findFirst({
    where: and(eq(categories.id, input.id), eq(categories.clerkUserId, userId)),
  });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Category not found.",
    });
  }

  await ensureUniqueName(ctx, input);

  const [updated] = await ctx.db
    .update(categories)
    .set({
      name: input.name.trim(),
      kind: input.kind,
      updatedAt: new Date(),
    })
    .where(eq(categories.id, input.id))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update category.",
    });
  }

  return {
    category: updated,
  };
}

export async function deleteCategory(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteCategoryInput
) {
  const userId = assertUserId(ctx.userId);

  const existing = await ctx.db.query.categories.findFirst({
    where: and(eq(categories.id, input.id), eq(categories.clerkUserId, userId)),
  });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Category not found.",
    });
  }

  await ctx.db
    .update(transactionEvents)
    .set({
      categoryId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(transactionEvents.categoryId, input.id), eq(transactionEvents.clerkUserId, userId)));

  await ctx.db.delete(categories).where(eq(categories.id, input.id));

  return {
    success: true,
  };
}
