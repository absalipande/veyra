import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userPreferences = pgTable(
  "veyra_user_preferences",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    defaultCurrency: text("default_currency").default("PHP").notNull(),
    locale: text("locale").default("en-PH").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_user_preferences_clerk_user_idx").on(table.clerkUserId),
  })
);

export const accounts = pgTable(
  "veyra_accounts",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").default("PHP").notNull(),
    type: text("type", {
      enum: ["cash", "credit", "loan", "wallet"],
    })
      .default("cash")
      .notNull(),
    balance: integer("balance").default(0).notNull(),
    creditLimit: integer("credit_limit").default(0).notNull(),
    institution: text("institution"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_accounts_clerk_user_idx").on(table.clerkUserId),
  })
);

export const budgets = pgTable(
  "veyra_budgets",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    period: text("period", {
      enum: ["daily", "weekly", "bi-weekly", "monthly"],
    }).notNull(),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    salaryDates: text("salary_dates"),
    parentBudgetId: text("parent_budget_id"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_budgets_clerk_user_idx").on(table.clerkUserId),
    parentBudgetIdx: index("veyra_budgets_parent_budget_idx").on(table.parentBudgetId),
    periodIdx: index("veyra_budgets_period_idx").on(table.period),
  })
);

export const transactionEvents = pgTable(
  "veyra_transaction_events",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    type: text("type", {
      enum: [
        "income",
        "expense",
        "transfer",
        "credit_payment",
        "loan_disbursement",
      ],
    }).notNull(),
    currency: text("currency").default("PHP").notNull(),
    amount: integer("amount").notNull(),
    feeAmount: integer("fee_amount").default(0).notNull(),
    budgetId: text("budget_id").references(() => budgets.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_transaction_events_clerk_user_idx").on(table.clerkUserId),
    occurredAtIdx: index("veyra_transaction_events_occurred_at_idx").on(table.occurredAt),
    typeIdx: index("veyra_transaction_events_type_idx").on(table.type),
    budgetIdx: index("veyra_transaction_events_budget_idx").on(table.budgetId),
  })
);

export const ledgerEntries = pgTable(
  "veyra_ledger_entries",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    eventId: text("event_id")
      .references(() => transactionEvents.id, { onDelete: "cascade" })
      .notNull(),
    accountId: text("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role", {
      enum: [
        "primary",
        "source",
        "destination",
        "fee_account",
        "payment_account",
        "liability_account",
        "loan_account",
        "disbursement_account",
      ],
    }).notNull(),
    amountDelta: integer("amount_delta").notNull(),
    currency: text("currency").default("PHP").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_ledger_entries_clerk_user_idx").on(table.clerkUserId),
    eventIdx: index("veyra_ledger_entries_event_idx").on(table.eventId),
    accountIdx: index("veyra_ledger_entries_account_idx").on(table.accountId),
  })
);
