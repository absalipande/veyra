import {
  createLoan,
  deleteLoan,
  getLoan,
  getLoansSummary,
  listLoans,
  recordLoanPayment,
  updateLoan,
} from "@/features/loans/server/service";
import {
  createLoanSchema,
  deleteLoanSchema,
  getLoanSchema,
  listLoansSchema,
  recordLoanPaymentSchema,
  updateLoanSchema,
} from "@/features/loans/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const loansRouter = createTRPCRouter({
  list: protectedProcedure.input(listLoansSchema).query(({ ctx, input }) => listLoans(ctx, input)),
  get: protectedProcedure.input(getLoanSchema).query(({ ctx, input }) => getLoan(ctx, input)),
  summary: protectedProcedure.query(({ ctx }) => getLoansSummary(ctx)),
  create: protectedProcedure.input(createLoanSchema).mutation(({ ctx, input }) => createLoan(ctx, input)),
  recordPayment: protectedProcedure
    .input(recordLoanPaymentSchema)
    .mutation(({ ctx, input }) => recordLoanPayment(ctx, input)),
  update: protectedProcedure.input(updateLoanSchema).mutation(({ ctx, input }) => updateLoan(ctx, input)),
  remove: protectedProcedure.input(deleteLoanSchema).mutation(({ ctx, input }) => deleteLoan(ctx, input)),
});
