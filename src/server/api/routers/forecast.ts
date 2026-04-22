import { getCashflowForecast } from "@/features/forecast/server/service";
import { getCashflowForecastSchema } from "@/features/forecast/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const forecastRouter = createTRPCRouter({
  summary: protectedProcedure
    .input(getCashflowForecastSchema)
    .query(({ ctx, input }) => getCashflowForecast(ctx, input)),
});
