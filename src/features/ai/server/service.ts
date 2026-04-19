import { and, desc, eq, gte, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { accounts, budgets, categories, transactionEvents } from "@/db/schema";
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

export async function getAiQuickCaptureDraft(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: GetQuickCaptureDraftInput
) {
  return parseQuickCaptureDraft(ctx, input);
}

export async function getAiTransactionsInsight(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);
  const fortyFiveDaysAgo = new Date(now);
  fortyFiveDaysAgo.setDate(now.getDate() - 45);

  const [recentEvents, priorEvents, recurringCandidates, categoryRows] = await Promise.all([
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
  if (topShiftAmount > 0 && topShiftCategory !== "No major shift") {
    recommendation.push(`Review ${topShiftCategory} spending this week.`);
  }
  if (uncategorizedRecentExpenseCount > 0) {
    recommendation.push(`Categorize ${uncategorizedRecentExpenseCount} recent expenses.`);
  }
  if (recurringLabel) {
    recommendation.push("Tag recurring payments to improve forecasting.");
  }
  if (recommendation.length === 0) {
    recommendation.push("Transaction flow is stable; keep categories tidy for cleaner trends.");
  }

  return {
    headline: "AI transaction intelligence",
    summary:
      topShiftAmount > 0 && topShiftCategory !== "No major shift"
        ? `${topShiftCategory} is trending higher than the prior week.`
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
        label: "Largest shift",
        value:
          topShiftCategory === "No major shift"
            ? "No major shift vs prior 7d"
            : `${topShiftCategory} +${formatCurrencyMiliunits(topShiftAmount, "PHP")} vs prior 7d`,
        tone: topShiftAmount > 0 ? ("warning" as const) : ("positive" as const),
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
