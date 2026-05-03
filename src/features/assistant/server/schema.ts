import { z } from "zod";

export const askAssistantSchema = z.object({
  message: z.string().trim().min(3).max(800),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1200),
      })
    )
    .max(8)
    .optional(),
});

const assistantSessionMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

export const rememberAssistantMemorySchema = z.object({
  message: z.string().trim().min(3).max(800),
  answer: z.string().trim().min(3).max(2000),
  intent: z
    .enum(["accounts", "budgets", "bills", "loans", "spending", "cashflow", "general"])
    .default("general"),
  dataBasis: z.string().trim().min(3).max(240),
});

export const rememberAssistantSessionSchema = z.object({
  memoryId: z.string().min(1).optional(),
  messages: z.array(assistantSessionMessageSchema).min(2).max(20),
});

export const deleteAssistantMemorySchema = z.object({
  id: z.string().min(1),
});

export type AskAssistantInput = z.infer<typeof askAssistantSchema>;
export type RememberAssistantMemoryInput = z.infer<typeof rememberAssistantMemorySchema>;
export type RememberAssistantSessionInput = z.infer<typeof rememberAssistantSessionSchema>;
