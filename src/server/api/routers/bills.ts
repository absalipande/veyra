import {
  completeBill,
  createBill,
  deleteBill,
  getBill,
  getBillsSummary,
  listBills,
  markBillPaid,
  updateBill,
} from "@/features/bills/server/service";
import {
  completeBillSchema,
  createBillSchema,
  deleteBillSchema,
  getBillSchema,
  listBillsSchema,
  markBillPaidSchema,
  updateBillSchema,
} from "@/features/bills/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const billsRouter = createTRPCRouter({
  list: protectedProcedure.input(listBillsSchema).query(({ ctx, input }) => listBills(ctx, input)),
  get: protectedProcedure.input(getBillSchema).query(({ ctx, input }) => getBill(ctx, input)),
  summary: protectedProcedure.query(({ ctx }) => getBillsSummary(ctx)),
  create: protectedProcedure.input(createBillSchema).mutation(({ ctx, input }) => createBill(ctx, input)),
  update: protectedProcedure.input(updateBillSchema).mutation(({ ctx, input }) => updateBill(ctx, input)),
  markPaid: protectedProcedure
    .input(markBillPaidSchema)
    .mutation(({ ctx, input }) => markBillPaid(ctx, input)),
  complete: protectedProcedure
    .input(completeBillSchema)
    .mutation(({ ctx, input }) => completeBill(ctx, input)),
  remove: protectedProcedure.input(deleteBillSchema).mutation(({ ctx, input }) => deleteBill(ctx, input)),
});
