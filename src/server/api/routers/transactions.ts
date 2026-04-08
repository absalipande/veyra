import {
  createTransactionEvent,
  deleteTransactionEvent,
  getTransactionEventsSummary,
  listTransactionEvents,
} from "@/features/transactions/server/service";
import {
  createTransactionEventSchema,
  deleteTransactionEventSchema,
} from "@/features/transactions/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const transactionsRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listTransactionEvents(ctx)),
  summary: protectedProcedure.query(({ ctx }) => getTransactionEventsSummary(ctx)),
  create: protectedProcedure
    .input(createTransactionEventSchema)
    .mutation(({ ctx, input }) => createTransactionEvent(ctx, input)),
  remove: protectedProcedure
    .input(deleteTransactionEventSchema)
    .mutation(({ ctx, input }) => deleteTransactionEvent(ctx, input)),
});
