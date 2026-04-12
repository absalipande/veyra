import { z } from "zod";

export const categoryKinds = ["expense", "income"] as const;

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(categoryKinds),
});

export const updateCategorySchema = createCategorySchema.extend({
  id: z.string().uuid(),
});

export const deleteCategorySchema = z.object({
  id: z.string().uuid(),
});
