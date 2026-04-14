export type TransactionDisplayTitleType =
  | "income"
  | "expense"
  | "transfer"
  | "credit_payment"
  | "loan_disbursement";

type BuildTransactionDisplayTitleInput = {
  type: TransactionDisplayTitleType;
  description?: string | null;
  sourceAccountName?: string | null;
  destinationAccountName?: string | null;
  creditAccountName?: string | null;
  loanAccountName?: string | null;
};

const leadingVerbPattern = /^(paid?|spent|bought|purchase(?:d)?|received?|earned|got paid)\b[\s,:-]*/i;
const leadingConnectorPattern = /^(for|from|to|at|on|via|using|into)\b[\s,:-]*/i;
const trailingTimePattern = /\b(today|yesterday|tonight|this morning|this afternoon|this evening)\b$/i;
const embeddedAmountPattern = /\b(?:₱|php)?\s*\d[\d,]*(?:\.\d{1,2})?\b/gi;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\s*\/\s*/g, " / ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimPunctuation(value: string) {
  return value.replace(/^[^a-z0-9]+/i, "").replace(/[^a-z0-9]+$/i, "").trim();
}

function cleanFreeformPhrase(value: string) {
  let next = normalizeWhitespace(value);

  next = next.replace(embeddedAmountPattern, " ");
  next = normalizeWhitespace(next);
  next = next.replace(trailingTimePattern, "").trim();

  let previous = "";
  while (next && previous !== next) {
    previous = next;
    next = next.replace(leadingVerbPattern, "").trim();
    next = next.replace(leadingConnectorPattern, "").trim();
  }

  return trimPunctuation(next);
}

function toTitleCase(value: string) {
  const lowerCaseSmallWords = new Set(["and", "or", "the", "a", "an", "for", "to", "of", "in", "on"]);
  const tokens = value.split(" ");

  return tokens
    .map((token, index) => {
      if (token === "/") return token;
      if (/^\d+$/.test(token)) return token;
      if (/^[A-Z0-9]{2,6}$/.test(token)) return token;

      const lower = token.toLowerCase();
      if (index > 0 && lowerCaseSmallWords.has(lower)) return lower;

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function normalizeDescriptionTitle(description: string | null | undefined, fallback: string) {
  const cleaned = description ? cleanFreeformPhrase(description) : "";
  if (!cleaned) return fallback;

  return toTitleCase(cleaned);
}

export function buildTransactionDisplayTitle(input: BuildTransactionDisplayTitleInput): string {
  switch (input.type) {
    case "expense":
      return normalizeDescriptionTitle(input.description, "Expense");
    case "income":
      return normalizeDescriptionTitle(input.description, "Income");
    case "transfer":
      if (input.destinationAccountName) return `Transfer to ${input.destinationAccountName}`;
      if (input.sourceAccountName) return `Transfer from ${input.sourceAccountName}`;
      return "Transfer";
    case "credit_payment":
      if (input.creditAccountName) return `Credit payment to ${input.creditAccountName}`;
      return "Credit payment";
    case "loan_disbursement":
      if (input.destinationAccountName) return `Loan disbursement to ${input.destinationAccountName}`;
      if (input.loanAccountName) return `Loan disbursement from ${input.loanAccountName}`;
      return "Loan disbursement";
    default:
      return "Transaction";
  }
}
