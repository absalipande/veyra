import { eq } from "drizzle-orm";

import { userPreferences } from "@/db/schema";
import { logAuditEvent } from "@/features/trust/server/audit";
import type { TRPCContext } from "@/server/api/trpc";

type UsageEventInput = {
  eventName: string;
  surface: string;
  metadata?: Record<string, unknown> | null;
  auditOnDrop?: boolean;
};

type UsageTrackingResult =
  | { status: "captured_local_only" }
  | { status: "dropped_by_policy" };

function getUserId(ctx: Pick<TRPCContext, "userId">) {
  if (!ctx.userId) {
    throw new Error("User is required for usage tracking.");
  }
  return ctx.userId;
}

export async function trackUsageEvent(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UsageEventInput
): Promise<UsageTrackingResult> {
  const userId = getUserId(ctx);
  const preferences = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.clerkUserId, userId),
    columns: { allowUsageAnalytics: true },
  });

  if (!preferences?.allowUsageAnalytics) {
    if (input.auditOnDrop) {
      await logAuditEvent(ctx, {
        action: "analytics.event_dropped_by_policy",
        entityType: "analytics",
        summary: `Dropped analytics event "${input.eventName}"`,
        metadata: {
          eventName: input.eventName,
          surface: input.surface,
          reason: "allowUsageAnalytics=false",
          ...(input.metadata ?? {}),
        },
      });
    }
    return { status: "dropped_by_policy" };
  }

  // Placeholder sink for usage analytics until an external telemetry pipeline is added.
  if (process.env.NODE_ENV !== "production") {
    console.info("[usage-analytics]", {
      userId,
      eventName: input.eventName,
      surface: input.surface,
      metadata: input.metadata ?? {},
    });
  }

  return { status: "captured_local_only" };
}

