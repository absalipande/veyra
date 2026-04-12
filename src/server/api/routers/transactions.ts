import {
  createTransactionEvent,
  deleteTransactionEvent,
  getTransactionEventsSummary,
  listTransactionEvents,
  updateTransactionEvent,
} from "@/features/transactions/server/service";
import {
  createTransactionEventSchema,
  deleteTransactionEventSchema,
  listTransactionEventsSchema,
  updateTransactionEventSchema,
} from "@/features/transactions/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const transactionsRouter = createTRPCRouter({
  list: protectedProcedure.input(listTransactionEventsSchema).query(({ ctx, input }) => listTransactionEvents(ctx, input)),
  summary: protectedProcedure.query(({ ctx }) => getTransactionEventsSummary(ctx)),
  create: protectedProcedure
    .input(createTransactionEventSchema)
    .mutation(({ ctx, input }) => createTransactionEvent(ctx, input)),
  update: protectedProcedure
    .input(updateTransactionEventSchema)
    .mutation(({ ctx, input }) => updateTransactionEvent(ctx, input)),
  remove: protectedProcedure
    .input(deleteTransactionEventSchema)
    .mutation(({ ctx, input }) => deleteTransactionEvent(ctx, input)),
});
