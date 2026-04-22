import { z } from "zod";

export const applyCategoryFixSchema = z.object({
  eventId: z.string().uuid(),
  categoryId: z.string().uuid(),
});

export const removeDuplicateFixSchema = z.object({
  eventId: z.string().uuid(),
});

export const markOddReviewedSchema = z.object({
  eventId: z.string().uuid(),
});
