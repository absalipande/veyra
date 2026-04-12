import {
  createCategory,
  deleteCategory,
  getCategoriesSummary,
  listCategories,
  updateCategory,
} from "@/features/categories/server/service";
import {
  createCategorySchema,
  deleteCategorySchema,
  updateCategorySchema,
} from "@/features/categories/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const categoriesRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listCategories(ctx)),
  summary: protectedProcedure.query(({ ctx }) => getCategoriesSummary(ctx)),
  create: protectedProcedure.input(createCategorySchema).mutation(({ ctx, input }) => createCategory(ctx, input)),
  update: protectedProcedure.input(updateCategorySchema).mutation(({ ctx, input }) => updateCategory(ctx, input)),
  remove: protectedProcedure.input(deleteCategorySchema).mutation(({ ctx, input }) => deleteCategory(ctx, input)),
});
