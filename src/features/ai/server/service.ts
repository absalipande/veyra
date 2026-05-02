import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  accounts,
  aiInsights,
  budgets,
  categories,
  loanInstallments,
  loanPayments,
  loans,
  transactionEvents,
  userPreferences,
} from "@/db/schema";
import { formatCurrencyMiliunits } from "@/lib/currencies";
import { getQuickCaptureDraftSchema } from "@/features/ai/server/schema";
import { getBudgetsSummary } from "@/features/budgets/server/service";
import type { TRPCContext } from "@/server/api/trpc";

type GetQuickCaptureDraftInput = z.infer<typeof getQuickCaptureDraftSchema>;

type Intent = "expense" | "income" | "transfer" | null;

type ParsedDraft = {
  intent: Intent;
  amountMiliunits: number | null;
  description: string | null;
  dateValue: string;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  budgetId: string | null;
  confidence: "high" | "medium" | "low";
  missing: Array<
    "intent" | "amount" | "description" | "account" | "sourceAccount" | "destinationAccount"
  >;
};

function checkpointValue(value: Date | string | null | undefined) {
  if (!value) return "0";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value);
}

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }
  return userId;
}

export async function isAiCoachingEnabled(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const preferences = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.clerkUserId, userId),
    columns: { allowAiCoaching: true },
  });

  return preferences?.allowAiCoaching ?? true;
}

function normalizeValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectIntent(input: string): Intent {
  const normalized = normalizeValue(input);
  if (/(transfer|transferred|move|moved)/.test(normalized)) return "transfer";
  if (/(receive|received|earned|salary|got paid)/.test(normalized)) return "income";
  if (/(pay|paid|spent|spend|bought|buy)/.test(normalized)) return "expense";
  return null;
}

function extractAmount(input: string) {
  const match = input.match(/(?:₱|php\s*)?(\d+(?:\.\d{1,2})?)/i);
  if (!match?.[1]) return null;

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  return Math.round(numeric * 1000);
}

function findAccountMatch(
  phrase: string | null,
  items: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  if (!phrase) return null;
  const normalizedPhrase = normalizeValue(phrase);
  if (!normalizedPhrase) return null;

  return (
    items.find((account) => {
      const normalizedName = normalizeValue(account.name);
      return normalizedName.includes(normalizedPhrase) || normalizedPhrase.includes(normalizedName);
    }) ?? null
  );
}

function findCategoryMatch(
  phrase: string | null,
  kind: "income" | "expense",
  items: Array<{ id: string; name: string; kind: "income" | "expense" }>
) {
  if (!phrase) return null;
  const normalizedPhrase = normalizeValue(phrase);
  if (!normalizedPhrase) return null;

  return (
    items.find((category) => {
      if (category.kind !== kind) return false;
      const normalizedName = normalizeValue(category.name);
      return (
        normalizedName === normalizedPhrase ||
        normalizedName.includes(normalizedPhrase) ||
        normalizedPhrase.includes(normalizedName)
      );
    }) ?? null
  );
}

function toDateValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatDraftDescription(input: string, intent: Intent) {
  const merchantInParentheses = input.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
  if (merchantInParentheses) {
    return merchantInParentheses
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
      .join(" ")
      .slice(0, 120);
  }

  const merchantFromPreposition =
    input.match(/\b(?:for|at|from)\s+(.+?)(?:\s+(?:using|via|today|yesterday)\b|$)/i)?.[1] ??
    input.match(/\bon\s+(.+?)(?:\s+(?:using|via|today|yesterday)\b|$)/i)?.[1] ??
    null;

  if (merchantFromPreposition) {
    const normalizedMerchant = merchantFromPreposition
      .replace(/\b(food|groceries|transport|shopping|expense|income)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (normalizedMerchant) {
      return normalizedMerchant
        .split(" ")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
        .join(" ")
        .slice(0, 120);
    }
  }

  const cleaned = input
    .replace(/(?:₱|php\s*)?\d+(?:\.\d{1,2})?/i, "")
    .replace(/\b(today|yesterday)\b/gi, "")
    .replace(/\b(paid|pay|spent|spend|bought|buy|received|receive|earned|got paid)\b/gi, "")
    .replace(/\b(using|via)\s+.+$/gi, "")
    .replace(/\bfor\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 0) return cleaned.slice(0, 120);
  if (intent === "expense") return "Expense";
  if (intent === "income") return "Income";
  if (intent === "transfer") return "Transfer";
  return null;
}

function deriveConfidence(parsed: Omit<ParsedDraft, "confidence">): ParsedDraft["confidence"] {
  let score = 0;
  if (parsed.intent) score += 0.28;
  if (parsed.amountMiliunits) score += 0.28;
  if (parsed.description) score += 0.2;

  if (parsed.intent === "transfer") {
    if (parsed.sourceAccountId) score += 0.12;
    if (parsed.destinationAccountId) score += 0.12;
  } else {
    if (parsed.sourceAccountId) score += 0.14;
    if (parsed.categoryId) score += 0.08;
  }

  if (score >= 0.8) return "high";
  if (score >= 0.52) return "medium";
  return "low";
}

async function parseQuickCaptureDraft(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetQuickCaptureDraftInput
): Promise<ParsedDraft> {
  const userId = assertUserId(ctx.userId);
  const raw = input.text.trim();
  const lower = raw.toLowerCase();
  const intent = detectIntent(raw);
  const amountMiliunits = extractAmount(raw);
  const dateValue = toDateValue(/\byesterday\b/.test(lower) ? -1 : 0);

  const [accountRows, categoryRows, budgetRows] = await Promise.all([
    ctx.db.query.accounts.findMany({
      where: eq(accounts.clerkUserId, userId),
      columns: { id: true, name: true, type: true },
    }),
    ctx.db.query.categories.findMany({
      where: and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)),
      columns: { id: true, name: true, kind: true },
    }),
    ctx.db.query.budgets.findMany({
      where: and(eq(budgets.clerkUserId, userId), eq(budgets.isActive, true)),
      columns: { id: true, name: true },
      orderBy: [desc(budgets.updatedAt)],
    }),
  ]);

  const spendableAccounts = accountRows.filter(
    (account) => account.type === "cash" || account.type === "wallet" || account.type === "credit"
  );
  const liquidAccounts = accountRows.filter(
    (account) => account.type === "cash" || account.type === "wallet"
  );

  let description: string | null = null;
  let sourceAccountId: string | null = null;
  let destinationAccountId: string | null = null;
  let categoryId: string | null = null;
  let budgetId: string | null = null;

  if (intent === "transfer") {
    const transferMatch = raw.match(/from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:today|yesterday))?$/i);
    const sourcePhrase = transferMatch?.[1]?.trim() ?? null;
    const destinationPhrase = transferMatch?.[2]?.trim() ?? null;
    sourceAccountId = findAccountMatch(sourcePhrase, liquidAccounts)?.id ?? null;
    destinationAccountId = findAccountMatch(destinationPhrase, liquidAccounts)?.id ?? null;
    description = "Transfer";
  } else {
    const descriptionMatch = raw.match(/\bfor\s+(.+?)(?:\s+(?:today|yesterday))?$/i);
    description = descriptionMatch?.[1]?.trim() || formatDraftDescription(raw, intent);

    const accountPhrase =
      raw.match(/\b(?:using|via)\s+(.+?)(?:\s+(?:today|yesterday))?$/i)?.[1]?.trim() ?? null;
    const candidateAccounts = intent === "income" ? liquidAccounts : spendableAccounts;
    sourceAccountId = findAccountMatch(accountPhrase, candidateAccounts)?.id ?? null;

    if (intent === "expense" || intent === "income") {
      categoryId = findCategoryMatch(description, intent, categoryRows)?.id ?? null;
      if (intent === "expense" && description) {
        const normalizedDescription = normalizeValue(description);
        budgetId =
          budgetRows.find((budget) => normalizeValue(budget.name).includes(normalizedDescription))
            ?.id ?? null;
      }
    }
  }

  const missing: ParsedDraft["missing"] = [];
  if (!intent) missing.push("intent");
  if (!amountMiliunits) missing.push("amount");
  if (!description) missing.push("description");

  if (intent === "transfer") {
    if (!sourceAccountId) missing.push("sourceAccount");
    if (!destinationAccountId) missing.push("destinationAccount");
  } else if (intent === "expense" || intent === "income") {
    if (!sourceAccountId) missing.push("account");
  }

  const baseParsed = {
    intent,
    amountMiliunits,
    description,
    dateValue,
    sourceAccountId,
    destinationAccountId,
    categoryId,
    budgetId,
    missing,
  };

  return {
    ...baseParsed,
    confidence: deriveConfidence(baseParsed),
  };
}

export async function getAiDashboardInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const budgetSummary = await getBudgetsSummary(ctx);
  const summary = budgetSummary.summary;
  const totalBudgets = summary.totalBudgets;
  const atRisk = summary.warningBudgets + summary.dangerBudgets + summary.exceededBudgets;
  const onTrack = Math.max(0, totalBudgets - atRisk);

  if (totalBudgets === 0) {
    return {
      statement: "Veyra insights are ready. Add your first budget to unlock cycle guidance.",
      projectedImpact: "No budget projection yet",
      confidence: "Initial estimate",
      window: "Next 7 days",
      nextActionLabel: "Set your first budget",
      nextActionHref: "/budgets",
      budgetStatusSummary: "No active budgets yet",
      totalBudgets,
      atRisk,
      onTrack,
      totalRemaining: 0,
    };
  }

  if (atRisk > 0) {
    return {
      statement: `${atRisk} budget${atRisk === 1 ? "" : "s"} are showing pacing pressure this cycle.`,
      projectedImpact: "Possible buffer tightening",
      confidence: "Medium confidence",
      window: "This cycle",
      nextActionLabel: "Review budgets",
      nextActionHref: "/budgets",
      budgetStatusSummary: `${onTrack} on track · ${atRisk} at risk`,
      totalBudgets,
      atRisk,
      onTrack,
      totalRemaining: summary.totalRemaining,
    };
  }

  return {
    statement: "Your budgets are holding steady this week. Keep this pace to protect your buffer.",
    projectedImpact: "Stable budget runway",
    confidence: "Medium confidence",
    window: "Next 7 days",
    nextActionLabel: "Review budgets",
    nextActionHref: "/budgets",
    budgetStatusSummary: `${onTrack} on track · 0 at risk`,
    totalBudgets,
    atRisk,
    onTrack,
    totalRemaining: summary.totalRemaining,
  };
}

export async function getAiDashboardInsightCheckpoint(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const [txnRow, budgetRow, accountRow] = await Promise.all([
    ctx.db
      .select({ value: sql<Date | null>`max(${transactionEvents.updatedAt})` })
      .from(transactionEvents)
      .where(eq(transactionEvents.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${budgets.updatedAt})` })
      .from(budgets)
      .where(eq(budgets.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${accounts.updatedAt})` })
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId)),
  ]);

  return [
    `tx:${checkpointValue(txnRow[0]?.value)}`,
    `bg:${checkpointValue(budgetRow[0]?.value)}`,
    `ac:${checkpointValue(accountRow[0]?.value)}`,
  ].join("|");
}

export async function getAiQuickCaptureDraft(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetQuickCaptureDraftInput
) {
  return parseQuickCaptureDraft(ctx, input);
}

export async function getAiQuickCaptureCheckpoint(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetQuickCaptureDraftInput
) {
  const userId = assertUserId(ctx.userId);
  const normalizedText = normalizeValue(input.text);

  const [accountRow, budgetRow, categoryRow] = await Promise.all([
    ctx.db
      .select({ value: sql<Date | null>`max(${accounts.updatedAt})` })
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${budgets.updatedAt})` })
      .from(budgets)
      .where(eq(budgets.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${categories.updatedAt})` })
      .from(categories)
      .where(eq(categories.clerkUserId, userId)),
  ]);

  return [
    `q:${normalizedText}`,
    `ac:${checkpointValue(accountRow[0]?.value)}`,
    `bg:${checkpointValue(budgetRow[0]?.value)}`,
    `cg:${checkpointValue(categoryRow[0]?.value)}`,
  ].join("|");
}

export async function getAiTransactionsInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);
  const fortyFiveDaysAgo = new Date(now);
  fortyFiveDaysAgo.setDate(now.getDate() - 45);

  const [recentEvents, priorEvents, recurringCandidates, monthlyExpenseEvents, categoryRows] =
    await Promise.all([
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        gte(transactionEvents.occurredAt, sevenDaysAgo)
      ),
      columns: {
        id: true,
        type: true,
        amount: true,
        categoryId: true,
        occurredAt: true,
        description: true,
      },
      orderBy: [desc(transactionEvents.occurredAt)],
    }),
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        gte(transactionEvents.occurredAt, fourteenDaysAgo),
        lt(transactionEvents.occurredAt, sevenDaysAgo)
      ),
      columns: {
        type: true,
        amount: true,
        categoryId: true,
      },
    }),
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        gte(transactionEvents.occurredAt, fortyFiveDaysAgo)
      ),
      columns: { description: true, type: true },
      orderBy: [desc(transactionEvents.occurredAt)],
    }),
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        eq(transactionEvents.type, "expense"),
        gte(transactionEvents.occurredAt, monthStart)
      ),
      columns: {
        amount: true,
        categoryId: true,
      },
    }),
    ctx.db.query.categories.findMany({
      where: and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)),
      columns: { id: true, name: true },
    }),
    ]);

  const recentExpenseEvents = recentEvents.filter((event) => event.type === "expense");
  const priorExpenseEvents = priorEvents.filter((event) => event.type === "expense");
  const uncategorizedRecentExpenseCount = recentExpenseEvents.filter(
    (event) => !event.categoryId
  ).length;

  const categoryById = new Map(categoryRows.map((category) => [category.id, category.name]));

  const byCategoryRecent = new Map<string, number>();
  const byCategoryPrior = new Map<string, number>();

  recentExpenseEvents.forEach((event) => {
    const key = (event.categoryId ? categoryById.get(event.categoryId) : null) ?? "Uncategorized";
    byCategoryRecent.set(key, (byCategoryRecent.get(key) ?? 0) + event.amount);
  });
  priorExpenseEvents.forEach((event) => {
    const key = (event.categoryId ? categoryById.get(event.categoryId) : null) ?? "Uncategorized";
    byCategoryPrior.set(key, (byCategoryPrior.get(key) ?? 0) + event.amount);
  });

  let topShiftCategory = "No major shift";
  let topShiftAmount = 0;
  for (const [category, recentAmount] of byCategoryRecent.entries()) {
    const priorAmount = byCategoryPrior.get(category) ?? 0;
    const delta = recentAmount - priorAmount;
    if (delta > topShiftAmount) {
      topShiftAmount = delta;
      topShiftCategory = category;
    }
  }

  const byCategoryMonth = new Map<string, number>();
  monthlyExpenseEvents.forEach((event) => {
    const key = (event.categoryId ? categoryById.get(event.categoryId) : null) ?? "Uncategorized";
    byCategoryMonth.set(key, (byCategoryMonth.get(key) ?? 0) + event.amount);
  });
  const totalMonthlyExpense = monthlyExpenseEvents.reduce((sum, event) => sum + event.amount, 0);
  const [topMonthlyCategory, topMonthlyAmount] =
    Array.from(byCategoryMonth.entries()).sort((left, right) => right[1] - left[1])[0] ?? [
      "No category yet",
      0,
    ];
  const topMonthlySharePct =
    totalMonthlyExpense > 0 ? Math.round((topMonthlyAmount / totalMonthlyExpense) * 100) : 0;
  const potentialMonthlySavings = Math.round(topMonthlyAmount * 0.1);

  const recurringMap = new Map<string, number>();
  recurringCandidates
    .filter((event) => event.type === "expense")
    .forEach((event) => {
      const key = normalizeValue(event.description).slice(0, 80);
      if (!key) return;
      recurringMap.set(key, (recurringMap.get(key) ?? 0) + 1);
    });
  const recurringLabel =
    Array.from(recurringMap.entries()).find(([, count]) => count >= 3)?.[0] ?? null;

  const recommendation: string[] = [];
  if (topMonthlyAmount > 0 && topMonthlyCategory !== "No category yet") {
    recommendation.push(
      `${topMonthlyCategory} is your top spend this month (${topMonthlySharePct}% of expenses).`
    );
    recommendation.push(
      `Try reducing ${topMonthlyCategory} by 10% to save about ${formatCurrencyMiliunits(
        potentialMonthlySavings,
        "PHP"
      )} this month.`
    );
  }
  if (topShiftAmount > 0 && topShiftCategory !== "No major shift") {
    recommendation.push(`Review ${topShiftCategory} spending this week.`);
  }
  if (uncategorizedRecentExpenseCount > 0) {
    recommendation.push(`Categorize ${uncategorizedRecentExpenseCount} recent expenses.`);
  }
  if (recurringLabel) {
    recommendation.push("Tag recurring payments to improve forecasting.");
  }
  if (recommendation.length === 0 && topMonthlyAmount > 0) {
    recommendation.push(
      `Your largest expense area is ${topMonthlyCategory} at ${formatCurrencyMiliunits(
        topMonthlyAmount,
        "PHP"
      )} this month.`
    );
  }
  if (recommendation.length === 0) {
    recommendation.push("Transaction flow is stable; keep categories tidy for cleaner trends.");
  }

  return {
    headline: "AI transaction intelligence",
    summary:
      topMonthlyAmount > 0 && topMonthlyCategory !== "No category yet"
        ? `${topMonthlyCategory} is your largest spending category this month (${topMonthlySharePct}% share).`
        : topShiftAmount > 0 && topShiftCategory !== "No major shift"
          ? `You spent ${formatCurrencyMiliunits(topShiftAmount, "PHP")} more on ${topShiftCategory} vs the prior 7 days.`
          : "No strong category spikes versus the prior week.",
    confidence:
      recentExpenseEvents.length >= 8 ? "Medium confidence" : "Initial estimate",
    metrics: [
      {
        label: "Expense events (7d)",
        value: String(recentExpenseEvents.length),
        tone: "neutral" as const,
      },
      {
        label: "Top category (month)",
        value:
          topMonthlyAmount > 0 && topMonthlyCategory !== "No category yet"
            ? `${topMonthlyCategory} ${topMonthlySharePct}%`
            : "No data yet",
        tone: topMonthlyAmount > 0 ? ("warning" as const) : ("neutral" as const),
      },
      {
        label: "Largest shift",
        value:
          topShiftCategory === "No major shift"
            ? "No major shift vs prior 7d"
            : `${topShiftCategory} +${formatCurrencyMiliunits(topShiftAmount, "PHP")} vs prior 7d`,
        tone: topShiftAmount > 0 ? ("warning" as const) : ("positive" as const),
      },
      {
        label: "Savings opportunity",
        value:
          potentialMonthlySavings > 0
            ? `${formatCurrencyMiliunits(potentialMonthlySavings, "PHP")} / month`
            : "No estimate yet",
        tone: potentialMonthlySavings > 0 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Uncategorized",
        value: String(uncategorizedRecentExpenseCount),
        tone: uncategorizedRecentExpenseCount > 0 ? ("warning" as const) : ("positive" as const),
      },
    ],
    recommendations: recommendation.slice(0, 3),
  };
}

export async function getAiTransactionsInsightCheckpoint(
  ctx: Pick<TRPCContext, "db" | "userId">
) {
  const userId = assertUserId(ctx.userId);
  const [txnRow, categoryRow] = await Promise.all([
    ctx.db
      .select({ value: sql<Date | null>`max(${transactionEvents.updatedAt})` })
      .from(transactionEvents)
      .where(eq(transactionEvents.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${categories.updatedAt})` })
      .from(categories)
      .where(eq(categories.clerkUserId, userId)),
  ]);

  return [
    `tx:${checkpointValue(txnRow[0]?.value)}`,
    `cg:${checkpointValue(categoryRow[0]?.value)}`,
  ].join("|");
}

export type HabitCoachingInsight = {
  version: number;
  generatedAt: string;
  periodLabel: string;
  summary: string;
  topSpendCategory: {
    name: string;
    amountLabel: string;
    sharePct: number;
  };
  monthOverMonthShift: {
    category: string;
    deltaLabel: string;
    direction: "up" | "down" | "flat";
  };
  keyFindings: string[];
  advice: string[];
  categoryHighlights: Array<{
    name: string;
    amountLabel: string;
    sharePct: number;
    note: string;
  }>;
  budgetPosture: {
    trackedBudgets: number;
    atRiskBudgets: number;
    onTrackBudgets: number;
    totalRemainingLabel: string;
    note: string;
  };
  dataWindow: {
    expensesAnalyzed: number;
    budgetsAnalyzed: number;
  };
};

const HABIT_SURFACE = "habit_coaching";
const HABIT_INSIGHT_VERSION = 2;
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const FALLBACK_OPENAI_MODEL = "gpt-4o-mini";
const FALLBACK_CLOUDFLARE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const habitInsightDraftSchema = z.object({
  summary: z.string().min(1).max(260),
  keyFindings: z.array(z.string().min(1)).min(2).max(5),
  advice: z.array(z.string().min(1)).min(2).max(5),
  categoryNotes: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        note: z.string().min(1).max(180),
      })
    )
    .max(6)
    .optional(),
  budgetNote: z.string().min(1).max(180).optional(),
});

type HabitInsightDraft = z.infer<typeof habitInsightDraftSchema>;

const habitCoachingInsightSchema = z.object({
  version: z.number().optional(),
  generatedAt: z.string(),
  periodLabel: z.string(),
  summary: z.string(),
  topSpendCategory: z.object({
    name: z.string(),
    amountLabel: z.string(),
    sharePct: z.number(),
  }),
  monthOverMonthShift: z.object({
    category: z.string(),
    deltaLabel: z.string(),
    direction: z.enum(["up", "down", "flat"]),
  }),
  keyFindings: z.array(z.string()),
  advice: z.array(z.string()),
  categoryHighlights: z
    .array(
      z.object({
        name: z.string(),
        amountLabel: z.string(),
        sharePct: z.number(),
        note: z.string(),
      })
    )
    .optional(),
  budgetPosture: z
    .object({
      trackedBudgets: z.number(),
      atRiskBudgets: z.number(),
      onTrackBudgets: z.number(),
      totalRemainingLabel: z.string(),
      note: z.string(),
    })
    .optional(),
  dataWindow: z
    .object({
      expensesAnalyzed: z.number(),
      budgetsAnalyzed: z.number(),
    })
    .optional(),
});

function normalizeInsightLines(lines: string[], fallback: string[]) {
  const normalized = lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeCategoryKey(name: string) {
  return normalizeValue(name);
}

function categoryMatches(key: string, terms: string[]) {
  return terms.some((term) => key.includes(term));
}

function getCategoryFocusNote(name: string, sharePct: number) {
  const key = normalizeCategoryKey(name);
  const highShare = sharePct >= 25;

  if (categoryMatches(key, ["food", "dining", "restaurant", "eat"])) {
    return highShare
      ? "Food is taking a big share this month. Plan meals and limit delivery days each week."
      : "Keep food spending steady by planning meals and reducing delivery orders.";
  }

  if (categoryMatches(key, ["clothing", "fashion", "apparel", "shopping"])) {
    return highShare
      ? "Clothing spend is high this month. Set a cap and use a 48-hour pause before buying."
      : "Track clothing buys against a monthly cap to avoid impulse purchases.";
  }

  if (categoryMatches(key, ["bills", "utilities", "subscription", "rent", "internet"])) {
    return highShare
      ? "Bills are a large part of spending. Review subscriptions and remove one low-use service."
      : "Keep bills predictable by checking recurring charges once a week.";
  }

  if (name === "Uncategorized") {
    return "Many expenses are uncategorized. Add categories to get more useful coaching.";
  }

  return highShare
    ? "This is a big part of your spending. Set a monthly cap and review weekly."
    : "Steady category. Keep this within your monthly plan.";
}

function getCategoryActionPlan(name: string, amount: number, sharePct: number) {
  const key = normalizeCategoryKey(name);
  const suggestedCap = formatCurrencyMiliunits(Math.round(amount * 0.88), "PHP");

  if (categoryMatches(key, ["food", "dining", "restaurant", "eat"])) {
    return [
      `Set a Food budget target of about ${suggestedCap} this month and check it every weekend.`,
      "Try a simple meal plan this week and cap food delivery to 2 days.",
    ];
  }

  if (categoryMatches(key, ["clothing", "fashion", "apparel", "shopping"])) {
    return [
      `Set a Clothing budget cap around ${suggestedCap} for this month.`,
      "Use a 48-hour pause before non-essential clothing purchases.",
    ];
  }

  if (categoryMatches(key, ["bills", "utilities", "subscription", "rent", "internet"])) {
    return [
      "Split bills into fixed costs and subscriptions, then set a monthly subscription cap.",
      "Cancel or pause one low-use subscription this week.",
    ];
  }

  if (name === "Uncategorized") {
    return ["Categorize your latest expenses so recommendations can be more specific to your habits."];
  }

  return [
    `Set a monthly limit for ${name} at around ${suggestedCap} and track progress weekly.`,
    sharePct >= 25
      ? `Since ${name} is a big share of spend, plan one small cut this week.`
      : `Keep ${name} spending within plan and review once per week.`,
  ];
}

function toFriendlyAdviceLine(line: string) {
  return line
    .replace(/\bguardrail\b/gi, "budget cap")
    .replace(/\bpacing\b/gi, "spending pace")
    .replace(/\bconcentration\b/gi, "high spend")
    .replace(/\bnon-essential\b/gi, "optional")
    .replace(/\btrim\b/gi, "reduce");
}

function normalizeAdviceLines(lines: string[], fallback: string[]) {
  return normalizeInsightLines(lines, fallback).map((line) => toFriendlyAdviceLine(line));
}

function isGenericAdviceLine(line: string) {
  const normalized = normalizeValue(line);
  return (
    normalized.includes("guardrail") ||
    normalized.includes("monthly cap") ||
    normalized.includes("monthly limit") ||
    normalized.includes("check weekly") ||
    normalized.includes("optional spending") ||
    normalized.includes("non essential")
  );
}

function buildCoachingAdvice(input: {
  draftAdvice: string[];
  fallbackAdvice: string[];
  topCategory: string;
  topAmount: number;
  topSharePct: number;
}) {
  const normalizedDraft = normalizeAdviceLines(input.draftAdvice, input.fallbackAdvice);
  if (input.topAmount <= 0 || input.topCategory === "No category yet") {
    return normalizedDraft.slice(0, 3);
  }

  const baseCategoryActions = getCategoryActionPlan(
    input.topCategory,
    input.topAmount,
    input.topSharePct
  ).map((line) => toFriendlyAdviceLine(line));

  const hasCategoryNamedAdvice = normalizedDraft.some((line) =>
    normalizeValue(line).includes(normalizeValue(input.topCategory))
  );
  const genericLineCount = normalizedDraft.filter((line) => isGenericAdviceLine(line)).length;
  const shouldInjectCategoryActions = !hasCategoryNamedAdvice || genericLineCount >= 2;

  if (!shouldInjectCategoryActions) {
    return normalizedDraft.slice(0, 3);
  }

  const merged = [...baseCategoryActions, ...normalizedDraft];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of merged) {
    const key = normalizeValue(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }

  return deduped.slice(0, 3);
}

function parseHabitInsightDraftContent(content: string | null | undefined): HabitInsightDraft | null {
  if (!content) return null;
  try {
    const trimmed = content.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? trimmed);
    const validated = habitInsightDraftSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
}

function buildHabitInsightModelMessages(input: {
  periodLabel: string;
  currentTotal: number;
  previousTotal: number;
  topCategory: string;
  topSharePct: number;
  shiftCategory: string;
  shiftLabel: string;
  budgetSummary: Awaited<ReturnType<typeof getBudgetsSummary>>["summary"];
  topCategories: Array<{
    name: string;
    currentAmount: number;
    previousAmount: number;
    currentSharePct: number;
  }>;
  recentExpenses: Array<{
    date: string;
    description: string;
    category: string;
    amount: number;
    budgetName: string | null;
  }>;
}) {
  const atRiskBudgets =
    input.budgetSummary.warningBudgets +
    input.budgetSummary.dangerBudgets +
    input.budgetSummary.exceededBudgets;

  const payload = {
    periodLabel: input.periodLabel,
    totals: {
      currentMonthExpense: input.currentTotal,
      previousMonthExpense: input.previousTotal,
      currency: "PHP",
    },
    budgets: {
      totalBudgets: input.budgetSummary.totalBudgets,
      onTrackBudgets: input.budgetSummary.onTrackBudgets,
      atRiskBudgets,
      totalRemaining: input.budgetSummary.totalRemaining,
    },
    topCategory: {
      name: input.topCategory,
      sharePct: input.topSharePct,
    },
    shift: {
      category: input.shiftCategory,
      label: input.shiftLabel,
    },
    topCategories: input.topCategories,
    recentExpenses: input.recentExpenses,
  };

  return [
    {
      role: "system",
      content:
        "You are a personal finance coaching assistant for Veyra. Use only the provided budget and transaction data. " +
        "Return valid JSON only with keys: summary, keyFindings, advice, categoryNotes, budgetNote. " +
        "Use plain, supportive language and avoid technical finance jargon. " +
        "Focus on concrete category coaching (e.g., food, clothing), and give behavior-based actions " +
        "like budget caps, cooking more, reducing delivery, or a waiting period before buying.",
    },
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ];
}

function shouldUseCloudflareAi() {
  const provider = process.env.VEYRA_AI_PROVIDER?.trim().toLowerCase();
  return (
    provider === "cloudflare-workers-ai" ||
    (!provider && Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN))
  );
}

function logAiProviderSelection(provider: string, model: string | null) {
  console.info("[ai.provider]", {
    provider,
    model,
  });
}

function buildDefaultBudgetPosture(
  budgetSummary: Awaited<ReturnType<typeof getBudgetsSummary>>["summary"]
) {
  const atRiskBudgets =
    budgetSummary.warningBudgets + budgetSummary.dangerBudgets + budgetSummary.exceededBudgets;
  const onTrackBudgets = budgetSummary.onTrackBudgets;

  return {
    trackedBudgets: budgetSummary.totalBudgets,
    atRiskBudgets,
    onTrackBudgets,
    totalRemainingLabel: formatCurrencyMiliunits(budgetSummary.totalRemaining, "PHP"),
    note:
      budgetSummary.totalBudgets === 0
        ? "No active budgets yet. Add one to get budget pacing guidance."
        : atRiskBudgets > 0
          ? `${atRiskBudgets} budget${atRiskBudgets === 1 ? "" : "s"} need closer pacing this cycle.`
          : "Budgets are currently pacing within plan.",
  };
}

async function generateInsightDraftFromOpenAi(input: {
  periodLabel: string;
  currentTotal: number;
  previousTotal: number;
  topCategory: string;
  topSharePct: number;
  shiftCategory: string;
  shiftLabel: string;
  budgetSummary: Awaited<ReturnType<typeof getBudgetsSummary>>["summary"];
  topCategories: Array<{
    name: string;
    currentAmount: number;
    previousAmount: number;
    currentSharePct: number;
  }>;
  recentExpenses: Array<{
    date: string;
    description: string;
    category: string;
    amount: number;
    budgetName: string | null;
  }>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_HABIT_MODEL ?? process.env.OPENAI_MODEL ?? FALLBACK_OPENAI_MODEL;
  const messages = buildHabitInsightModelMessages(input);

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return parseHabitInsightDraftContent(json.choices?.[0]?.message?.content);
}

async function generateInsightDraftFromCloudflare(input: Parameters<typeof generateInsightDraftFromOpenAi>[0]) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_TOKEN;
  if (!accountId || !apiToken) return null;

  const model =
    process.env.CLOUDFLARE_AI_MODEL ?? process.env.VEYRA_AI_MODEL ?? FALLBACK_CLOUDFLARE_MODEL;
  const messages = buildHabitInsightModelMessages(input);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        messages,
        temperature: 0.3,
        max_tokens: 700,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare Workers AI request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    result?: { response?: string | null };
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };

  if (json.success === false) {
    const message = json.errors?.[0]?.message ?? "Cloudflare Workers AI request failed";
    throw new Error(message);
  }

  return parseHabitInsightDraftContent(json.result?.response);
}

async function generateHabitInsightDraft(input: Parameters<typeof generateInsightDraftFromOpenAi>[0]) {
  if (shouldUseCloudflareAi()) {
    logAiProviderSelection(
      "cloudflare-workers-ai",
      process.env.CLOUDFLARE_AI_MODEL ?? process.env.VEYRA_AI_MODEL ?? FALLBACK_CLOUDFLARE_MODEL
    );
    return generateInsightDraftFromCloudflare(input);
  }

  logAiProviderSelection(
    process.env.OPENAI_API_KEY ? "openai" : "deterministic-fallback",
    process.env.OPENAI_API_KEY
      ? (process.env.OPENAI_HABIT_MODEL ?? process.env.OPENAI_MODEL ?? FALLBACK_OPENAI_MODEL)
      : null
  );
  return generateInsightDraftFromOpenAi(input);
}

function parseHabitInsightPayload(payload: string): HabitCoachingInsight | null {
  try {
    const parsed = JSON.parse(payload);
    const validated = habitCoachingInsightSchema.safeParse(parsed);
    if (!validated.success) return null;

    const value = validated.data;
    return {
      version: value.version ?? 1,
      generatedAt: value.generatedAt,
      periodLabel: value.periodLabel,
      summary: value.summary,
      topSpendCategory: value.topSpendCategory,
      monthOverMonthShift: value.monthOverMonthShift,
      keyFindings: value.keyFindings,
      advice: value.advice,
      categoryHighlights: value.categoryHighlights ?? [],
      budgetPosture:
        value.budgetPosture ?? {
          trackedBudgets: 0,
          atRiskBudgets: 0,
          onTrackBudgets: 0,
          totalRemainingLabel: formatCurrencyMiliunits(0, "PHP"),
          note: "No budget posture available yet.",
        },
      dataWindow:
        value.dataWindow ?? {
          expensesAnalyzed: 0,
          budgetsAnalyzed: 0,
        },
    };
  } catch {
    return null;
  }
}

export async function getStoredHabitInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const row = await ctx.db.query.aiInsights.findFirst({
    where: and(eq(aiInsights.clerkUserId, userId), eq(aiInsights.surface, HABIT_SURFACE)),
    columns: { payload: true },
  });
  if (!row) return null;
  const parsed = parseHabitInsightPayload(row.payload);
  if (!parsed) return null;
  if ((parsed.version ?? 1) < HABIT_INSIGHT_VERSION) return null;
  return parsed;
}

export async function saveHabitInsight(
  ctx: Pick<TRPCContext, "db" | "userId">,
  insight: HabitCoachingInsight
) {
  const userId = assertUserId(ctx.userId);
  const id = `${userId}:${HABIT_SURFACE}`;
  const now = new Date();

  await ctx.db
    .insert(aiInsights)
    .values({
      id,
      clerkUserId: userId,
      surface: HABIT_SURFACE,
      payload: JSON.stringify(insight),
      generatedAt: new Date(insight.generatedAt),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiInsights.id,
      set: {
        payload: JSON.stringify(insight),
        generatedAt: new Date(insight.generatedAt),
        updatedAt: now,
      },
    });
}

function getMonthDateRange(reference: Date, shiftMonths: number) {
  const shifted = new Date(reference.getFullYear(), reference.getMonth() + shiftMonths, 1);
  const start = new Date(shifted.getFullYear(), shifted.getMonth(), 1);
  const end = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 1);
  return { start, end };
}

function getRollingDateRange(reference: Date, days: number) {
  const end = new Date(reference);
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Math.max(1, days - 1));
  return { start, end };
}

function normalizeMerchantLabel(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  if (normalized.length <= 2) return null;

  return normalized
    .split(" ")
    .slice(0, 4)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export async function generateMonthlyHabitCoachingInsight(
  ctx: Pick<TRPCContext, "db" | "userId">
): Promise<HabitCoachingInsight> {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const current = getMonthDateRange(now, 0);
  const previous = getMonthDateRange(now, -1);
  const rolling = getRollingDateRange(now, 90);
  const queryStart = rolling.start < previous.start ? rolling.start : previous.start;

  const [events, categoryRows, budgetSummary] = await Promise.all([
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        eq(transactionEvents.type, "expense"),
        gte(transactionEvents.occurredAt, queryStart),
        lt(transactionEvents.occurredAt, current.end)
      ),
      columns: {
        amount: true,
        categoryId: true,
        budgetId: true,
        description: true,
        occurredAt: true,
      },
    }),
    ctx.db.query.categories.findMany({
      where: and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)),
      columns: { id: true, name: true },
    }),
    getBudgetsSummary(ctx),
  ]);

  const categoryById = new Map(categoryRows.map((category) => [category.id, category.name]));
  const budgetNameById = new Map(budgetSummary.budgets.map((budget) => [budget.id, budget.name]));
  const currentByCategory = new Map<string, number>();
  const previousByCategory = new Map<string, number>();
  const rollingByCategory = new Map<string, number>();
  const uncategorizedMerchantCurrent = new Map<string, number>();
  const uncategorizedMerchantRolling = new Map<string, number>();

  for (const event of events) {
    const category = (event.categoryId ? categoryById.get(event.categoryId) : null) ?? "Uncategorized";
    const inCurrentMonth = event.occurredAt >= current.start;
    const inRollingWindow = event.occurredAt >= rolling.start;
    const targetMap = inCurrentMonth ? currentByCategory : previousByCategory;
    targetMap.set(category, (targetMap.get(category) ?? 0) + event.amount);

    if (inRollingWindow) {
      rollingByCategory.set(category, (rollingByCategory.get(category) ?? 0) + event.amount);
    }

    if (!event.categoryId) {
      const merchant = normalizeMerchantLabel(event.description);
      if (merchant && inCurrentMonth) {
        uncategorizedMerchantCurrent.set(
          merchant,
          (uncategorizedMerchantCurrent.get(merchant) ?? 0) + event.amount
        );
      }
      if (merchant && inRollingWindow) {
        uncategorizedMerchantRolling.set(
          merchant,
          (uncategorizedMerchantRolling.get(merchant) ?? 0) + event.amount
        );
      }
    }
  }

  const currentTotal = Array.from(currentByCategory.values()).reduce((sum, value) => sum + value, 0);
  const previousTotal = Array.from(previousByCategory.values()).reduce((sum, value) => sum + value, 0);
  const rollingTotal = Array.from(rollingByCategory.values()).reduce((sum, value) => sum + value, 0);
  const currentExpenseCount = events.filter((event) => event.occurredAt >= current.start).length;
  const rollingExpenseCount = events.filter((event) => event.occurredAt >= rolling.start).length;

  const [topCategory, topAmount] =
    Array.from(currentByCategory.entries()).sort((a, b) => b[1] - a[1])[0] ?? ["No category yet", 0];
  const topSharePct = currentTotal > 0 ? Math.round((topAmount / currentTotal) * 100) : 0;

  let shiftCategory = "No major shift";
  let shiftAmount = 0;
  for (const [category, amount] of currentByCategory.entries()) {
    const previousAmount = previousByCategory.get(category) ?? 0;
    const delta = amount - previousAmount;
    if (Math.abs(delta) > Math.abs(shiftAmount)) {
      shiftAmount = delta;
      shiftCategory = category;
    }
  }

  const direction: "up" | "down" | "flat" =
    shiftAmount > 0 ? "up" : shiftAmount < 0 ? "down" : "flat";
  const shiftLabel =
    direction === "flat"
      ? "No significant change"
      : `${direction === "up" ? "+" : "-"}${formatCurrencyMiliunits(Math.abs(shiftAmount), "PHP")} vs last month`;

  const potentialSavings = topAmount > 0 ? Math.round(topAmount * 0.12) : 0;

  const categoryStats = Array.from(
    new Set([...currentByCategory.keys(), ...previousByCategory.keys()])
  )
    .map((name) => {
      const currentAmount = currentByCategory.get(name) ?? 0;
      const previousAmount = previousByCategory.get(name) ?? 0;
      return {
        name,
        currentAmount,
        previousAmount,
        currentSharePct: currentTotal > 0 ? Math.round((currentAmount / currentTotal) * 100) : 0,
      };
    })
    .sort((left, right) => right.currentAmount - left.currentAmount);

  const topCategoryStats = categoryStats.filter((entry) => entry.currentAmount > 0).slice(0, 4);
  const defaultMonthlyHighlights = topCategoryStats.slice(0, 3).map((entry) => ({
    name: entry.name,
    amountLabel: formatCurrencyMiliunits(entry.currentAmount, "PHP"),
    sharePct: entry.currentSharePct,
    note: getCategoryFocusNote(entry.name, entry.currentSharePct),
  }));
  const rollingCategoryStats = Array.from(rollingByCategory.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      sharePct: rollingTotal > 0 ? Math.round((amount / rollingTotal) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const fallbackTopCategory = rollingCategoryStats[0] ?? null;
  const fallbackTopCategoryName = topAmount > 0 ? topCategory : (fallbackTopCategory?.name ?? "No category yet");
  const fallbackTopAmount = topAmount > 0 ? topAmount : (fallbackTopCategory?.amount ?? 0);
  const fallbackTopSharePct = topAmount > 0 ? topSharePct : (fallbackTopCategory?.sharePct ?? 0);
  const defaultKeyFindings: string[] = [];
  if (topAmount > 0) {
    defaultKeyFindings.push(
      `${topCategory} is your biggest spend this month at ${formatCurrencyMiliunits(
        topAmount,
        "PHP"
      )} (${topSharePct}% of expenses).`
    );
  } else if (fallbackTopAmount > 0) {
    defaultKeyFindings.push(
      `${fallbackTopCategoryName} is your largest spend across the last 90 days at ${formatCurrencyMiliunits(
        fallbackTopAmount,
        "PHP"
      )} (${fallbackTopSharePct}% share).`
    );
  }
  if (direction !== "flat" && shiftCategory !== "No major shift") {
    defaultKeyFindings.push(`${shiftCategory} moved ${shiftLabel}.`);
  } else {
    defaultKeyFindings.push("Spending distribution stayed relatively stable month-over-month.");
  }
  if (currentTotal > 0 && previousTotal > 0) {
    const totalDelta = currentTotal - previousTotal;
    const totalDeltaLabel = `${totalDelta >= 0 ? "+" : "-"}${formatCurrencyMiliunits(
      Math.abs(totalDelta),
      "PHP"
    )}`;
    defaultKeyFindings.push(`Overall spending change: ${totalDeltaLabel} vs last month.`);
  }

  const defaultAdvice: string[] = [];
  if (topAmount > 0 && topCategory !== "No category yet") {
    defaultAdvice.push(...getCategoryActionPlan(topCategory, topAmount, topSharePct));
    if (potentialSavings > 0) {
      defaultAdvice.push(
        `A 12% cut in ${topCategory} could free up around ${formatCurrencyMiliunits(
          potentialSavings,
          "PHP"
        )} this month.`
      );
    }
  } else if (fallbackTopAmount > 0 && fallbackTopCategoryName !== "No category yet") {
    defaultAdvice.push(...getCategoryActionPlan(fallbackTopCategoryName, fallbackTopAmount, fallbackTopSharePct));
  } else {
    defaultAdvice.push("Categorize more expenses so recommendations can match your real spending habits.");
  }
  if (direction === "up" && shiftCategory !== "No major shift") {
    defaultAdvice.push(`Review recent ${shiftCategory} transactions and reduce optional spending first.`);
  }
  const budgetPosture = buildDefaultBudgetPosture(budgetSummary.summary);

  const defaultRollingHighlights = rollingCategoryStats
    .filter((entry) => entry.amount > 0)
    .slice(0, 3)
    .map((entry) => ({
      name: entry.name,
      amountLabel: formatCurrencyMiliunits(entry.amount, "PHP"),
      sharePct: entry.sharePct,
      note: getCategoryFocusNote(entry.name, entry.sharePct),
    }));

  const strongestMerchantCurrent =
    Array.from(uncategorizedMerchantCurrent.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const strongestMerchantRolling =
    Array.from(uncategorizedMerchantRolling.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const hasCurrentMonthCategoryData = defaultMonthlyHighlights.length > 0;
  const defaultCategoryHighlights = hasCurrentMonthCategoryData
    ? defaultMonthlyHighlights
    : defaultRollingHighlights;

  const normalizedHighlights = defaultCategoryHighlights.map((entry) => {
    if (entry.name !== "Uncategorized") return entry;

    const strongestMerchant = strongestMerchantCurrent ?? strongestMerchantRolling;
    if (!strongestMerchant) return entry;

    return {
      ...entry,
      note: `Top uncategorized merchant: ${strongestMerchant[0]} (${formatCurrencyMiliunits(strongestMerchant[1], "PHP")}).`,
    };
  });

  const fallbackInsight: HabitCoachingInsight = {
    version: HABIT_INSIGHT_VERSION,
    generatedAt: now.toISOString(),
    periodLabel: hasCurrentMonthCategoryData
      ? "This month vs last month"
      : "Last 90 days (insufficient current-month category data)",
    summary:
      topAmount > 0
        ? `${topCategory} leads your spending this month.`
        : fallbackTopAmount > 0
          ? `${fallbackTopCategoryName} is your top spend across the last 90 days.`
          : "Not enough categorized spending yet for coaching insights.",
    topSpendCategory: {
      name: fallbackTopCategoryName,
      amountLabel: formatCurrencyMiliunits(fallbackTopAmount, "PHP"),
      sharePct: fallbackTopSharePct,
    },
    monthOverMonthShift: {
      category: shiftCategory,
      deltaLabel: shiftLabel,
      direction,
    },
    keyFindings: defaultKeyFindings,
    advice: defaultAdvice,
    categoryHighlights: normalizedHighlights,
    budgetPosture,
    dataWindow: {
      expensesAnalyzed: Math.max(currentExpenseCount, rollingExpenseCount),
      budgetsAnalyzed: budgetSummary.summary.totalBudgets,
    },
  };

  try {
    const recentExpenses = events
      .filter((event) => event.occurredAt >= current.start)
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 15)
      .map((event) => ({
        date: event.occurredAt.toISOString().slice(0, 10),
        description: event.description,
        category: (event.categoryId ? categoryById.get(event.categoryId) : null) ?? "Uncategorized",
        amount: event.amount,
        budgetName: event.budgetId ? (budgetNameById.get(event.budgetId) ?? null) : null,
      }));

    const aiDraft = await generateHabitInsightDraft({
      periodLabel: fallbackInsight.periodLabel,
      currentTotal,
      previousTotal,
      topCategory,
      topSharePct,
      shiftCategory,
      shiftLabel,
      budgetSummary: budgetSummary.summary,
      topCategories: hasCurrentMonthCategoryData
        ? topCategoryStats
        : rollingCategoryStats.slice(0, 4).map((entry) => ({
            name: entry.name,
            currentAmount: entry.amount,
            previousAmount: 0,
            currentSharePct: entry.sharePct,
          })),
      recentExpenses,
    });

    if (!aiDraft) {
      return fallbackInsight;
    }

    const categoryNoteByName = new Map(
      (aiDraft.categoryNotes ?? []).map((entry) => [normalizeValue(entry.name), entry.note.trim()])
    );
    const categoryHighlights = (fallbackInsight.categoryHighlights.length
      ? fallbackInsight.categoryHighlights
      : normalizedHighlights
    ).map((entry) => ({
      ...entry,
      note: categoryNoteByName.get(normalizeValue(entry.name)) ?? entry.note,
    }));

    return {
      ...fallbackInsight,
      summary: aiDraft.summary.trim(),
      keyFindings: normalizeInsightLines(aiDraft.keyFindings, fallbackInsight.keyFindings),
      advice: buildCoachingAdvice({
        draftAdvice: aiDraft.advice,
        fallbackAdvice: fallbackInsight.advice,
        topCategory: fallbackTopCategoryName,
        topAmount: fallbackTopAmount,
        topSharePct: fallbackTopSharePct,
      }),
      categoryHighlights,
      budgetPosture: {
        ...fallbackInsight.budgetPosture,
        note: aiDraft.budgetNote?.trim() || fallbackInsight.budgetPosture.note,
      },
    };
  } catch (error) {
    console.error("[ai.generateMonthlyHabitCoachingInsight] fallback", error);
    return fallbackInsight;
  }
}

export async function getAiBudgetsInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const now = new Date();
  const budgetSummary = await getBudgetsSummary(ctx);
  const trackedBudgets = budgetSummary.budgets.filter((budget) => !budget.parentBudgetId);
  const atRisk = trackedBudgets.filter(
    (budget) => budget.status === "warning" || budget.status === "danger" || budget.status === "exceeded"
  );

  let likelyOvershootDate: string | null = null;
  for (const budget of atRisk) {
    if (budget.totalSpent <= 0 || budget.amount <= budget.totalSpent) continue;
    const elapsedMs = now.getTime() - budget.periodStart.getTime();
    const elapsedDays = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)));
    const dailyPace = budget.totalSpent / elapsedDays;
    if (dailyPace <= 0) continue;

    const daysToLimit = Math.ceil((budget.amount - budget.totalSpent) / dailyPace);
    if (daysToLimit <= 0) {
      likelyOvershootDate = now.toISOString().slice(0, 10);
      break;
    }

    const estimated = new Date(now);
    estimated.setDate(now.getDate() + daysToLimit);
    if (estimated <= budget.periodEnd) {
      likelyOvershootDate = estimated.toISOString().slice(0, 10);
      break;
    }
  }

  return {
    headline: "AI budget intelligence",
    summary:
      trackedBudgets.length === 0
        ? "No active budgets yet. Create one to start pacing guidance."
        : atRisk.length > 0
          ? `${atRisk.length} budget${atRisk.length === 1 ? "" : "s"} need attention this cycle.`
          : "Budgets are pacing well so far this cycle.",
    confidence: trackedBudgets.length >= 2 ? "Medium confidence" : "Initial estimate",
    timeWindow: "Current budget cycle",
    likelyOvershootDate,
    recommendations:
      atRisk.length > 0
        ? ["Review at-risk budgets now.", "Reduce non-essential category spend this week."]
        : ["Keep current pace and review again mid-cycle."],
    metrics: [
      {
        label: "Tracked budgets",
        value: String(trackedBudgets.length),
        tone: "neutral" as const,
      },
      {
        label: "At risk",
        value: String(atRisk.length),
        tone: atRisk.length > 0 ? ("warning" as const) : ("positive" as const),
      },
      {
        label: "Likely overshoot",
        value: likelyOvershootDate ?? "None projected",
        tone: likelyOvershootDate ? ("warning" as const) : ("positive" as const),
      },
    ],
  };
}

export async function getAiBudgetsInsightCheckpoint(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const [txnRow, budgetRow] = await Promise.all([
    ctx.db
      .select({ value: sql<Date | null>`max(${transactionEvents.updatedAt})` })
      .from(transactionEvents)
      .where(eq(transactionEvents.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${budgets.updatedAt})` })
      .from(budgets)
      .where(eq(budgets.clerkUserId, userId)),
  ]);

  return [
    `tx:${checkpointValue(txnRow[0]?.value)}`,
    `bg:${checkpointValue(budgetRow[0]?.value)}`,
  ].join("|");
}

export async function getAiAccountsInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [accountRows, recentExpenseEvents] = await Promise.all([
    ctx.db.query.accounts.findMany({
      where: eq(accounts.clerkUserId, userId),
      columns: {
        id: true,
        type: true,
        name: true,
        balance: true,
        creditLimit: true,
        currency: true,
      },
    }),
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        eq(transactionEvents.type, "expense"),
        gte(transactionEvents.occurredAt, thirtyDaysAgo)
      ),
      columns: {
        amount: true,
      },
    }),
  ]);

  const liquidAccounts = accountRows.filter(
    (account) => account.type === "cash" || account.type === "wallet"
  );
  const creditAccounts = accountRows.filter((account) => account.type === "credit");
  const loanAccounts = accountRows.filter((account) => account.type === "loan");

  const totalLiquid = liquidAccounts.reduce((sum, account) => sum + account.balance, 0);
  const totalCreditDebt = creditAccounts.reduce((sum, account) => sum + account.balance, 0);
  const totalLoanDebt = loanAccounts.reduce((sum, account) => sum + account.balance, 0);
  const totalLiabilities = totalCreditDebt + totalLoanDebt;

  const totalCreditLimit = creditAccounts.reduce((sum, account) => sum + account.creditLimit, 0);
  const utilizationPct =
    totalCreditLimit > 0 ? Math.round((totalCreditDebt / totalCreditLimit) * 100) : 0;

  const monthlyExpense = recentExpenseEvents.reduce((sum, event) => sum + event.amount, 0);
  const runwayMonths = monthlyExpense > 0 ? totalLiquid / monthlyExpense : null;

  const weakestLiquidAccount =
    [...liquidAccounts].sort((left, right) => left.balance - right.balance)[0] ?? null;

  const recommendations: string[] = [];
  if (utilizationPct >= 70) {
    recommendations.push("Credit utilization is elevated. Prioritize one extra card payment this cycle.");
  }
  if (runwayMonths !== null && runwayMonths < 1.5) {
    recommendations.push("Liquid runway is tight. Delay non-essential spending until the next inflow.");
  }
  if (weakestLiquidAccount && weakestLiquidAccount.balance <= 0) {
    recommendations.push(`Review ${weakestLiquidAccount.name} to avoid overdraft-style pressure.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("Account posture is stable. Keep balancing liquidity and debt paydown.");
  }

  let summary = "Accounts are stable with manageable liquidity and liabilities.";
  if (utilizationPct >= 70) {
    summary = `Credit utilization is at ${utilizationPct}%. Focus on paydown to recover margin.`;
  } else if (runwayMonths !== null && runwayMonths < 1.5) {
    summary = "Liquid runway is below six weeks based on recent expense pace.";
  } else if (totalLiabilities > totalLiquid && totalLiabilities > 0) {
    summary = "Liabilities are currently higher than liquid balances. Keep debt pacing visible.";
  }

  return {
    headline: "Veyra accounts watchdog",
    summary,
    confidence: accountRows.length >= 3 ? "Medium confidence" : "Initial estimate",
    recommendations,
    metrics: [
      {
        label: "Liquid balance",
        value: formatCurrencyMiliunits(totalLiquid, "PHP"),
        tone: "neutral" as const,
      },
      {
        label: "Liabilities",
        value: formatCurrencyMiliunits(totalLiabilities, "PHP"),
        tone: totalLiabilities > totalLiquid ? ("warning" as const) : ("neutral" as const),
      },
      {
        label: "Credit utilization",
        value: totalCreditLimit > 0 ? `${utilizationPct}%` : "No credit line",
        tone:
          totalCreditLimit > 0
            ? utilizationPct >= 70
              ? ("warning" as const)
              : ("positive" as const)
            : ("neutral" as const),
      },
      {
        label: "Runway",
        value: runwayMonths === null ? "Insufficient history" : `${runwayMonths.toFixed(1)} months`,
        tone:
          runwayMonths === null
            ? ("neutral" as const)
            : runwayMonths < 1.5
              ? ("warning" as const)
              : ("positive" as const),
      },
    ],
  };
}

export async function getAiAccountsInsightCheckpoint(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const [accountRow, txnRow] = await Promise.all([
    ctx.db
      .select({
        maxUpdatedAt: sql<Date | null>`max(${accounts.updatedAt})`,
        accountCount: sql<number>`count(*)`,
        balanceSum: sql<number>`coalesce(sum(${accounts.balance}), 0)`,
        creditLimitSum: sql<number>`coalesce(sum(${accounts.creditLimit}), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${transactionEvents.updatedAt})` })
      .from(transactionEvents)
      .where(eq(transactionEvents.clerkUserId, userId)),
  ]);

  return [
    `ac:${checkpointValue(accountRow[0]?.maxUpdatedAt)}`,
    `ac_n:${Number(accountRow[0]?.accountCount ?? 0)}`,
    `ac_b:${Number(accountRow[0]?.balanceSum ?? 0)}`,
    `ac_l:${Number(accountRow[0]?.creditLimitSum ?? 0)}`,
    `tx:${checkpointValue(txnRow[0]?.value)}`,
  ].join("|");
}

export async function getAiLoansInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [loanRows, installmentRows, paymentRows] = await Promise.all([
    ctx.db.query.loans.findMany({
      where: eq(loans.clerkUserId, userId),
      columns: {
        id: true,
        name: true,
        lenderName: true,
        currency: true,
        outstandingAmount: true,
        status: true,
        nextDueDate: true,
      },
    }),
    ctx.db.query.loanInstallments.findMany({
      where: eq(loanInstallments.clerkUserId, userId),
      columns: {
        loanId: true,
        dueDate: true,
        amount: true,
        paidAmount: true,
        status: true,
      },
    }),
    ctx.db.query.loanPayments.findMany({
      where: and(eq(loanPayments.clerkUserId, userId), gte(loanPayments.paidAt, thirtyDaysAgo)),
      columns: {
        amount: true,
      },
    }),
  ]);

  if (loanRows.length === 0) {
    return {
      headline: "Veyra loan coach",
      summary: "No loans tracked yet. Add a loan to start repayment guidance.",
      confidence: "Initial estimate",
      recommendations: ["Add your first loan with a repayment plan to unlock due-date coaching."],
      metrics: [
        { label: "Active loans", value: "0", tone: "neutral" as const },
        { label: "Due in 7d", value: "0", tone: "neutral" as const },
        { label: "Overdue", value: "0", tone: "neutral" as const },
        { label: "30d payments", value: formatCurrencyMiliunits(0, "PHP"), tone: "neutral" as const },
      ],
    };
  }

  const installmentOutstandingByLoanId = new Map<string, number>();
  const installmentCountByLoanId = new Map<string, number>();
  for (const installment of installmentRows) {
    const remaining = Math.max(installment.amount - installment.paidAmount, 0);
    installmentOutstandingByLoanId.set(
      installment.loanId,
      (installmentOutstandingByLoanId.get(installment.loanId) ?? 0) + remaining
    );
    installmentCountByLoanId.set(
      installment.loanId,
      (installmentCountByLoanId.get(installment.loanId) ?? 0) + 1
    );
  }

  const activeLoans = loanRows
    .filter((loan) => loan.status === "active")
    .map((loan) => {
      const hasSchedule = (installmentCountByLoanId.get(loan.id) ?? 0) > 0;
      const effectiveOutstanding = hasSchedule
        ? installmentOutstandingByLoanId.get(loan.id) ?? 0
        : Math.max(loan.outstandingAmount, 0);
      return { ...loan, effectiveOutstanding };
    });

  const totalOutstanding = activeLoans.reduce((sum, loan) => sum + loan.effectiveOutstanding, 0);
  const overdueLoans = activeLoans.filter(
    (loan) => loan.nextDueDate && loan.nextDueDate < now && loan.effectiveOutstanding > 0
  );
  const dueSoonLoans = activeLoans.filter(
    (loan) =>
      loan.nextDueDate &&
      loan.nextDueDate >= now &&
      loan.nextDueDate <= sevenDaysFromNow &&
      loan.effectiveOutstanding > 0
  );
  const monthlyPayments = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);

  const groupedOutstanding = new Map<string, number>();
  for (const loan of activeLoans) {
    groupedOutstanding.set(
      loan.lenderName,
      (groupedOutstanding.get(loan.lenderName) ?? 0) + loan.effectiveOutstanding
    );
  }

  const topLender = [...groupedOutstanding.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const topLenderShare =
    topLender && totalOutstanding > 0 ? Math.round((topLender[1] / totalOutstanding) * 100) : 0;

  const activeLoanIds = new Set(activeLoans.map((loan) => loan.id));
  const pendingInstallments = installmentRows.filter(
    (installment) => activeLoanIds.has(installment.loanId) && installment.status !== "paid"
  );
  const remainingScheduled = pendingInstallments.reduce(
    (sum, installment) => sum + Math.max(installment.amount - installment.paidAmount, 0),
    0
  );

  const recommendations: string[] = [];
  if (overdueLoans.length > 0) {
    recommendations.push(
      `${overdueLoans.length} loan${overdueLoans.length > 1 ? "s are" : " is"} overdue. Prioritize the oldest due loan first.`
    );
  }
  if (dueSoonLoans.length > 0) {
    recommendations.push(
      `${dueSoonLoans.length} loan${dueSoonLoans.length > 1 ? "s are" : " is"} due within 7 days. Queue payment from your main liquid account.`
    );
  }
  if (topLender && topLenderShare >= 55) {
    recommendations.push(
      `${topLender[0]} holds ${topLenderShare}% of active debt. Consider a focused paydown plan for this lender.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("Loan pacing looks stable. Keep paying on schedule to reduce finance drag.");
  }

  let summary = "Loan posture is stable with manageable repayment pacing.";
  if (overdueLoans.length > 0) {
    summary = `${overdueLoans.length} loan${overdueLoans.length > 1 ? "s are" : " is"} overdue. Address overdue installments first.`;
  } else if (dueSoonLoans.length > 0) {
    summary = `${dueSoonLoans.length} loan${dueSoonLoans.length > 1 ? "s are" : " is"} due this week.`;
  } else if (remainingScheduled > totalOutstanding && totalOutstanding > 0) {
    summary = "Scheduled repayments exceed current outstanding, likely due to finance charges.";
  }

  return {
    headline: "Veyra loan coach",
    summary,
    confidence: activeLoans.length >= 2 ? "Medium confidence" : "Initial estimate",
    recommendations,
    metrics: [
      {
        label: "Active loans",
        value: String(activeLoans.length),
        tone: activeLoans.length > 0 ? ("neutral" as const) : ("warning" as const),
      },
      {
        label: "Due in 7d",
        value: String(dueSoonLoans.length),
        tone: dueSoonLoans.length > 0 ? ("warning" as const) : ("positive" as const),
      },
      {
        label: "Overdue",
        value: String(overdueLoans.length),
        tone: overdueLoans.length > 0 ? ("warning" as const) : ("positive" as const),
      },
      {
        label: "Outstanding",
        value: formatCurrencyMiliunits(totalOutstanding, activeLoans[0]?.currency ?? "PHP"),
        tone: "neutral" as const,
      },
      {
        label: "30d payments",
        value: formatCurrencyMiliunits(monthlyPayments, activeLoans[0]?.currency ?? "PHP"),
        tone: monthlyPayments > 0 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Unpaid schedule",
        value: formatCurrencyMiliunits(remainingScheduled, activeLoans[0]?.currency ?? "PHP"),
        tone: remainingScheduled > totalOutstanding ? ("warning" as const) : ("neutral" as const),
      },
    ],
  };
}

export async function getAiLoansInsightCheckpoint(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const [loanRow, installmentRow, paymentRow] = await Promise.all([
    ctx.db
      .select({ value: sql<Date | null>`max(${loans.updatedAt})` })
      .from(loans)
      .where(eq(loans.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${loanInstallments.updatedAt})` })
      .from(loanInstallments)
      .where(eq(loanInstallments.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${loanPayments.createdAt})` })
      .from(loanPayments)
      .where(eq(loanPayments.clerkUserId, userId)),
  ]);

  return [
    `ln:${checkpointValue(loanRow[0]?.value)}`,
    `li:${checkpointValue(installmentRow[0]?.value)}`,
    `lp:${checkpointValue(paymentRow[0]?.value)}`,
  ].join("|");
}
