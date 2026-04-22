import { createGoal, listGoals, removeGoal, updateGoal } from "@/features/goals/server/service";
import { createGoalSchema, deleteGoalSchema, updateGoalSchema } from "@/features/goals/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const goalsRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listGoals(ctx)),
  create: protectedProcedure.input(createGoalSchema).mutation(({ ctx, input }) => createGoal(ctx, input)),
  update: protectedProcedure.input(updateGoalSchema).mutation(({ ctx, input }) => updateGoal(ctx, input)),
  remove: protectedProcedure.input(deleteGoalSchema).mutation(({ ctx, input }) => removeGoal(ctx, input)),
});
