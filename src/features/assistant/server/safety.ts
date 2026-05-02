import type { AskAssistantInput } from "@/features/assistant/server/schema";

export type AssistantIntent =
  | "accounts"
  | "budgets"
  | "bills"
  | "loans"
  | "spending"
  | "cashflow"
  | "general";

export function detectAssistantIntent(message: string): AssistantIntent {
  const normalized = message.toLowerCase();

  if (/\b(budget|overspend|over budget|remaining|paced|pacing|limit)\b/.test(normalized)) {
    return "budgets";
  }

  if (/\b(bill|due|subscription|obligation|payday|watch this week)\b/.test(normalized)) {
    return "bills";
  }

  if (/\b(loan|installment|amortization|principal|interest|lender|repayment)\b/.test(normalized)) {
    return "loans";
  }

  if (/\b(account|balance|cash|wallet|credit|utilization|liquid|liquidity)\b/.test(normalized)) {
    return "accounts";
  }

  if (/\b(cashflow|forecast|runway|afford|shortfall|ending balance)\b/.test(normalized)) {
    return "cashflow";
  }

  if (/\b(spend|spending|expense|category|merchant|changed|month|subscriptions?)\b/.test(normalized)) {
    return "spending";
  }

  return "general";
}

export function sanitizeAssistantHistory(history: AskAssistantInput["history"] = []) {
  return history
    .map((message) => ({
      role: message.role,
      content: message.content.replace(/\s+/g, " ").trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-6);
}

export function getIntentDataBasis(intent: AssistantIntent) {
  switch (intent) {
    case "accounts":
      return "account balances, liquidity, credit utilization, and liability summaries";
    case "budgets":
      return "active budget windows, spent totals, remaining amounts, and budget status";
    case "bills":
      return "pending bill occurrences and loan-linked obligation rules";
    case "loans":
      return "active loan records, outstanding balances, and upcoming unpaid installments";
    case "cashflow":
      return "liquid balances plus upcoming bills and loan installments";
    case "spending":
      return "recent tracked expenses, categories, and prior-period comparison";
    case "general":
    default:
      return "tracked Veyra accounts, spending, budgets, bills, and loans";
  }
}
