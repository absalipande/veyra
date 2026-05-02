import { TRPCError } from "@trpc/server";

import { buildAssistantContext } from "@/features/assistant/server/context";
import type { AskAssistantInput } from "@/features/assistant/server/schema";
import { isAssistantMemoryEnabled, listAssistantMemories } from "@/features/assistant/server/memory";
import { generateAssistantResponse } from "@/features/assistant/server/providers";
import {
  detectAssistantIntent,
  getIntentDataBasis,
  sanitizeAssistantHistory,
} from "@/features/assistant/server/safety";
import { isAiCoachingEnabled } from "@/features/ai/server/service";
import type { TRPCContext } from "@/server/api/trpc";

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

function buildSystemPrompt(input: { dataBasis: string; hasHistory: boolean }) {
  return [
    "You are Ask Veyra, a private finance assistant inside Veyra.",
    "Use only the trusted Veyra context provided by the server.",
    `The answer's data basis should be: ${input.dataBasis}.`,
    "Do not invent balances, dates, categories, or obligations.",
    "Do not claim to be a licensed financial advisor.",
    "Do not recommend investments, tax strategy, legal decisions, or lending guarantees.",
    "Keep answers concise, calm, and practical.",
    "When useful, include a short data basis such as 'Based on your tracked expenses...' in natural language.",
    "Offer one or two next steps. Do not create, edit, delete, or mark financial records paid.",
    "If the context is insufficient, say what is missing and ask one focused question.",
    "If assistant memory is included, use it only as a lightweight preference/pattern hint. Current trusted Veyra context overrides memory.",
    input.hasHistory
      ? "Short in-session chat history is included only for follow-up wording; the trusted Veyra context remains the source of truth."
      : "No prior chat history is included for this question.",
  ].join(" ");
}

export async function askAssistant(ctx: Pick<TRPCContext, "db" | "userId">, input: AskAssistantInput) {
  assertUserId(ctx.userId);

  const aiEnabled = await isAiCoachingEnabled(ctx);
  if (!aiEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "AI coaching is disabled in Settings.",
    });
  }

  const intent = detectAssistantIntent(input.message);
  const history = sanitizeAssistantHistory(input.history);
  const [contextPacket, memoryEnabled] = await Promise.all([
    buildAssistantContext(ctx, input.message, intent),
    isAssistantMemoryEnabled(ctx),
  ]);
  const memories = memoryEnabled ? await listAssistantMemories(ctx) : [];
  const response = await generateAssistantResponse([
    {
      role: "system",
      content: buildSystemPrompt({
        dataBasis: getIntentDataBasis(intent),
        hasHistory: history.length > 0,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        userQuestion: input.message,
        detectedIntent: intent,
        shortInSessionHistory: history,
        assistantMemory:
          memories.length > 0
            ? memories.slice(0, 8).map((memory) => ({
                kind: memory.kind,
                summary: memory.summary,
              }))
            : [],
        trustedVeyraContext: contextPacket,
      }),
    },
  ]);

  return {
    answer: response,
    generatedAt: new Date().toISOString(),
    intent,
    dataBasis: getIntentDataBasis(intent),
    memoryEnabled,
    contextWindow: contextPacket.spending.window,
  };
}

export { detectAssistantIntent };
