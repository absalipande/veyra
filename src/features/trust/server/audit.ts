import { desc, eq } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import type { TRPCContext } from "@/server/api/trpc";

type AuditEventInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

function getUserId(ctx: Pick<TRPCContext, "userId">) {
  if (!ctx.userId) {
    throw new Error("User is required for audit logging.");
  }
  return ctx.userId;
}

export async function logAuditEvent(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: AuditEventInput
) {
  const userId = getUserId(ctx);

  await ctx.db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    clerkUserId: userId,
    actorUserId: userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export async function listAuditEvents(
  ctx: Pick<TRPCContext, "db" | "userId">,
  limit = 30
) {
  const userId = getUserId(ctx);

  return ctx.db.query.auditLogs.findMany({
    where: eq(auditLogs.clerkUserId, userId),
    orderBy: [desc(auditLogs.createdAt)],
    limit: Math.max(1, Math.min(100, limit)),
  });
}
