import {
  applyCategoryFix,
  getDataQualityReport,
  markOddTransactionReviewed,
  removeDuplicateFix,
} from "@/features/data-quality/server/service";
import {
  applyCategoryFixSchema,
  markOddReviewedSchema,
  removeDuplicateFixSchema,
} from "@/features/data-quality/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const dataQualityRouter = createTRPCRouter({
  transactions: protectedProcedure.query(({ ctx }) => getDataQualityReport(ctx)),
  applyCategoryFix: protectedProcedure
    .input(applyCategoryFixSchema)
    .mutation(({ ctx, input }) => applyCategoryFix(ctx, input)),
  removeDuplicateFix: protectedProcedure
    .input(removeDuplicateFixSchema)
    .mutation(({ ctx, input }) => removeDuplicateFix(ctx, input)),
  markOddReviewed: protectedProcedure
    .input(markOddReviewedSchema)
    .mutation(({ ctx, input }) => markOddTransactionReviewed(ctx, input)),
});
