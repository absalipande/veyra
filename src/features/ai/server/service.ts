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
      statement: "AI insights are ready. Add your first budget to unlock cycle guidance.",
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
};

const HABIT_SURFACE = "habit_coaching";

function parseHabitInsightPayload(payload: string): HabitCoachingInsight | null {
  try {
    const parsed = JSON.parse(payload) as HabitCoachingInsight;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.generatedAt !== "string") return null;
    if (typeof parsed.periodLabel !== "string") return null;
    if (typeof parsed.summary !== "string") return null;
    if (!Array.isArray(parsed.keyFindings) || !Array.isArray(parsed.advice)) return null;
    return parsed;
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
  return parseHabitInsightPayload(row.payload);
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

export async function generateMonthlyHabitCoachingInsight(
  ctx: Pick<TRPCContext, "db" | "userId">
): Promise<HabitCoachingInsight> {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const current = getMonthDateRange(now, 0);
  const previous = getMonthDateRange(now, -1);

  const [events, categoryRows] = await Promise.all([
    ctx.db.query.transactionEvents.findMany({
      where: and(
        eq(transactionEvents.clerkUserId, userId),
        eq(transactionEvents.type, "expense"),
        gte(transactionEvents.occurredAt, previous.start),
        lt(transactionEvents.occurredAt, current.end)
      ),
      columns: {
        amount: true,
        categoryId: true,
        occurredAt: true,
      },
    }),
    ctx.db.query.categories.findMany({
      where: and(eq(categories.clerkUserId, userId), eq(categories.isArchived, false)),
      columns: { id: true, name: true },
    }),
  ]);

  const categoryById = new Map(categoryRows.map((category) => [category.id, category.name]));
  const currentByCategory = new Map<string, number>();
  const previousByCategory = new Map<string, number>();

  for (const event of events) {
    const category = (event.categoryId ? categoryById.get(event.categoryId) : null) ?? "Uncategorized";
    const inCurrentMonth = event.occurredAt >= current.start;
    const targetMap = inCurrentMonth ? currentByCategory : previousByCategory;
    targetMap.set(category, (targetMap.get(category) ?? 0) + event.amount);
  }

  const currentTotal = Array.from(currentByCategory.values()).reduce((sum, value) => sum + value, 0);
  const previousTotal = Array.from(previousByCategory.values()).reduce((sum, value) => sum + value, 0);

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
  const keyFindings: string[] = [];
  if (topAmount > 0) {
    keyFindings.push(
      `${topCategory} is your biggest spend this month at ${formatCurrencyMiliunits(
        topAmount,
        "PHP"
      )} (${topSharePct}% of expenses).`
    );
  }
  if (direction !== "flat" && shiftCategory !== "No major shift") {
    keyFindings.push(`${shiftCategory} moved ${shiftLabel}.`);
  } else {
    keyFindings.push("Spending distribution stayed relatively stable month-over-month.");
  }
  if (currentTotal > 0 && previousTotal > 0) {
    const totalDelta = currentTotal - previousTotal;
    const totalDeltaLabel = `${totalDelta >= 0 ? "+" : "-"}${formatCurrencyMiliunits(
      Math.abs(totalDelta),
      "PHP"
    )}`;
    keyFindings.push(`Overall spending change: ${totalDeltaLabel} vs last month.`);
  }

  const advice: string[] = [];
  if (topAmount > 0 && topCategory !== "No category yet") {
    advice.push(
      `Set a monthly guardrail for ${topCategory} and review it weekly.`
    );
    advice.push(
      `If you cut ${topCategory} by 12%, you can free up about ${formatCurrencyMiliunits(
        potentialSavings,
        "PHP"
      )} this month.`
    );
  } else {
    advice.push("Record more categorized expenses to unlock stronger coaching insights.");
  }
  if (direction === "up" && shiftCategory !== "No major shift") {
    advice.push(`Check recent ${shiftCategory} transactions and trim non-essential items first.`);
  }

  return {
    generatedAt: now.toISOString(),
    periodLabel: "This month vs last month",
    summary:
      topAmount > 0
        ? `${topCategory} leads your spending this month.`
        : "Not enough categorized spending yet for coaching insights.",
    topSpendCategory: {
      name: topCategory,
      amountLabel: formatCurrencyMiliunits(topAmount, "PHP"),
      sharePct: topSharePct,
    },
    monthOverMonthShift: {
      category: shiftCategory,
      deltaLabel: shiftLabel,
      direction,
    },
    keyFindings,
    advice,
  };
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
    headline: "AI accounts watchdog",
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
      .select({ value: sql<Date | null>`max(${accounts.updatedAt})` })
      .from(accounts)
      .where(eq(accounts.clerkUserId, userId)),
    ctx.db
      .select({ value: sql<Date | null>`max(${transactionEvents.updatedAt})` })
      .from(transactionEvents)
      .where(eq(transactionEvents.clerkUserId, userId)),
  ]);

  return [
    `ac:${checkpointValue(accountRow[0]?.value)}`,
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
      headline: "AI loan coach",
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

  const activeLoans = loanRows.filter((loan) => loan.status === "active");
  const totalOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstandingAmount, 0);
  const overdueLoans = activeLoans.filter(
    (loan) => loan.nextDueDate && loan.nextDueDate < now && loan.outstandingAmount > 0
  );
  const dueSoonLoans = activeLoans.filter(
    (loan) =>
      loan.nextDueDate &&
      loan.nextDueDate >= now &&
      loan.nextDueDate <= sevenDaysFromNow &&
      loan.outstandingAmount > 0
  );
  const monthlyPayments = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);

  const groupedOutstanding = new Map<string, number>();
  for (const loan of activeLoans) {
    groupedOutstanding.set(
      loan.lenderName,
      (groupedOutstanding.get(loan.lenderName) ?? 0) + loan.outstandingAmount
    );
  }

  const topLender = [...groupedOutstanding.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const topLenderShare =
    topLender && totalOutstanding > 0 ? Math.round((topLender[1] / totalOutstanding) * 100) : 0;

  const pendingInstallments = installmentRows.filter((installment) => installment.status !== "paid");
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
    headline: "AI loan coach",
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
