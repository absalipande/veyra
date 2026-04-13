import { clearWorkspaceSchema, updateSettingsSchema } from "@/features/settings/server/schema";
import {
  clearWorkspaceData,
  getUserSettings,
  updateUserSettings,
} from "@/features/settings/server/service";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const settingsRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => getUserSettings(ctx)),
  update: protectedProcedure
    .input(updateSettingsSchema)
    .mutation(({ ctx, input }) => updateUserSettings(ctx, input)),
  clearWorkspace: protectedProcedure
    .input(clearWorkspaceSchema)
    .mutation(({ ctx, input }) => clearWorkspaceData(ctx, input)),
});
