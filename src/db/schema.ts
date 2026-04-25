import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userPreferences = pgTable(
  "veyra_user_preferences",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    defaultCurrency: text("default_currency").default("PHP").notNull(),
    locale: text("locale").default("en-PH").notNull(),
    weekStartsOn: text("week_starts_on", {
      enum: ["monday", "sunday"],
    })
      .default("monday")
      .notNull(),
    dateFormat: text("date_format", {
      enum: ["month-day-year", "day-month-year", "year-month-day"],
    })
      .default("month-day-year")
      .notNull(),
    timezone: text("timezone").default("Asia/Manila").notNull(),
    allowAiCoaching: boolean("allow_ai_coaching").default(true).notNull(),
    allowUsageAnalytics: boolean("allow_usage_analytics").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_user_preferences_clerk_user_idx").on(table.clerkUserId),
  })
);

export const aiInsights = pgTable(
  "veyra_ai_insights",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    surface: text("surface").notNull(),
    payload: text("payload").notNull(),
    generatedAt: timestamp("generated_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_ai_insights_clerk_user_idx").on(table.clerkUserId),
    surfaceIdx: index("veyra_ai_insights_surface_idx").on(table.surface),
    uniqueUserSurfaceIdx: uniqueIndex("veyra_ai_insights_user_surface_uidx").on(
      table.clerkUserId,
      table.surface
    ),
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

export const loans = pgTable(
  "veyra_loans",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    kind: text("kind", {
      enum: ["institution", "personal"],
    }).notNull(),
    name: text("name").notNull(),
    lenderName: text("lender_name").notNull(),
    currency: text("currency").default("PHP").notNull(),
    principalAmount: integer("principal_amount").notNull(),
    outstandingAmount: integer("outstanding_amount").notNull(),
    disbursedAt: timestamp("disbursed_at", { mode: "date" }).notNull(),
    status: text("status", {
      enum: ["active", "closed"],
    })
      .default("active")
      .notNull(),
    destinationAccountId: text("destination_account_id")
      .references(() => accounts.id, { onDelete: "set null" })
      .notNull(),
    underlyingLoanAccountId: text("underlying_loan_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    cadence: text("cadence", {
      enum: ["daily", "weekly", "bi-weekly", "monthly"],
    }),
    nextDueDate: timestamp("next_due_date", { mode: "date" }),
    notes: text("notes"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_loans_clerk_user_idx").on(table.clerkUserId),
    statusIdx: index("veyra_loans_status_idx").on(table.status),
    destinationAccountIdx: index("veyra_loans_destination_account_idx").on(table.destinationAccountId),
    underlyingAccountIdx: index("veyra_loans_underlying_account_idx").on(table.underlyingLoanAccountId),
    dueDateIdx: index("veyra_loans_next_due_date_idx").on(table.nextDueDate),
  })
);

export const loanInstallments = pgTable(
  "veyra_loan_installments",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    loanId: text("loan_id")
      .references(() => loans.id, { onDelete: "cascade" })
      .notNull(),
    sequence: integer("sequence").notNull(),
    dueDate: timestamp("due_date", { mode: "date" }).notNull(),
    amount: integer("amount").notNull(),
    principalAmount: integer("principal_amount").default(0).notNull(),
    interestAmount: integer("interest_amount").default(0).notNull(),
    paidAmount: integer("paid_amount").default(0).notNull(),
    paidPrincipalAmount: integer("paid_principal_amount").default(0).notNull(),
    paidInterestAmount: integer("paid_interest_amount").default(0).notNull(),
    paidAt: timestamp("paid_at", { mode: "date" }),
    status: text("status", {
      enum: ["pending", "paid", "overdue"],
    })
      .default("pending")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_loan_installments_clerk_user_idx").on(table.clerkUserId),
    loanIdx: index("veyra_loan_installments_loan_idx").on(table.loanId),
    dueDateIdx: index("veyra_loan_installments_due_date_idx").on(table.dueDate),
    statusIdx: index("veyra_loan_installments_status_idx").on(table.status),
  })
);

export const loanPayments = pgTable(
  "veyra_loan_payments",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    loanId: text("loan_id")
      .references(() => loans.id, { onDelete: "cascade" })
      .notNull(),
    installmentId: text("installment_id").references(() => loanInstallments.id, {
      onDelete: "set null",
    }),
    sourceAccountId: text("source_account_id")
      .references(() => accounts.id, { onDelete: "set null" })
      .notNull(),
    amount: integer("amount").notNull(),
    appliedAmount: integer("applied_amount").notNull(),
    principalAmount: integer("principal_amount").default(0).notNull(),
    interestAmount: integer("interest_amount").default(0).notNull(),
    paidAt: timestamp("paid_at", { mode: "date" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_loan_payments_clerk_user_idx").on(table.clerkUserId),
    loanIdx: index("veyra_loan_payments_loan_idx").on(table.loanId),
    installmentIdx: index("veyra_loan_payments_installment_idx").on(table.installmentId),
    paidAtIdx: index("veyra_loan_payments_paid_at_idx").on(table.paidAt),
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

export const goals = pgTable(
  "veyra_goals",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    targetAmount: integer("target_amount").notNull(),
    currentAmount: integer("current_amount").default(0).notNull(),
    currency: text("currency").default("PHP").notNull(),
    targetDate: timestamp("target_date", { mode: "date" }).notNull(),
    linkedBudgetId: text("linked_budget_id").references(() => budgets.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: text("status", {
      enum: ["active", "completed", "paused"],
    })
      .default("active")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_goals_clerk_user_idx").on(table.clerkUserId),
    statusIdx: index("veyra_goals_status_idx").on(table.status),
    targetDateIdx: index("veyra_goals_target_date_idx").on(table.targetDate),
    linkedBudgetIdx: index("veyra_goals_linked_budget_idx").on(table.linkedBudgetId),
  })
);

export const auditLogs = pgTable(
  "veyra_audit_logs",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_audit_logs_clerk_user_idx").on(table.clerkUserId),
    actionIdx: index("veyra_audit_logs_action_idx").on(table.action),
    entityTypeIdx: index("veyra_audit_logs_entity_type_idx").on(table.entityType),
    createdAtIdx: index("veyra_audit_logs_created_at_idx").on(table.createdAt),
  })
);

export const categories = pgTable(
  "veyra_categories",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["expense", "income"],
    }).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    color: text("color"),
    icon: text("icon"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_categories_clerk_user_idx").on(table.clerkUserId),
    kindIdx: index("veyra_categories_kind_idx").on(table.kind),
    archivedIdx: index("veyra_categories_archived_idx").on(table.isArchived),
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
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
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
    categoryIdx: index("veyra_transaction_events_category_idx").on(table.categoryId),
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

export const billSeries = pgTable(
  "veyra_bill_series",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").default("PHP").notNull(),
    cadence: text("cadence", {
      enum: ["one_time", "weekly", "monthly", "yearly"],
    })
      .default("monthly")
      .notNull(),
    intervalCount: integer("interval_count").default(1).notNull(),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    nextDueDate: timestamp("next_due_date", { mode: "date" }),
    endsAfterOccurrences: integer("ends_after_occurrences"),
    remainingOccurrences: integer("remaining_occurrences"),
    obligationType: text("obligation_type", {
      enum: ["general", "loan_repayment"],
    })
      .default("general")
      .notNull(),
    loanId: text("loan_id").references(() => loans.id, { onDelete: "set null" }),
    loanInstallmentId: text("loan_installment_id").references(() => loanInstallments.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").default(true).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_bill_series_clerk_user_idx").on(table.clerkUserId),
    nextDueDateIdx: index("veyra_bill_series_next_due_date_idx").on(table.nextDueDate),
    accountIdx: index("veyra_bill_series_account_idx").on(table.accountId),
    activeIdx: index("veyra_bill_series_active_idx").on(table.isActive),
    obligationTypeIdx: index("veyra_bill_series_obligation_type_idx").on(table.obligationType),
    loanIdx: index("veyra_bill_series_loan_idx").on(table.loanId),
    loanInstallmentIdx: index("veyra_bill_series_loan_installment_idx").on(table.loanInstallmentId),
    uniqueLoanRepaymentIdx: uniqueIndex("veyra_bill_series_loan_repayment_uidx").on(
      table.clerkUserId,
      table.loanId
    ),
    obligationConsistency: check(
      "veyra_bill_series_obligation_consistency_check",
      sql`(
      (${table.obligationType} = 'loan_repayment' AND ${table.loanId} IS NOT NULL)
      OR
      (${table.obligationType} = 'general' AND ${table.loanId} IS NULL AND ${table.loanInstallmentId} IS NULL)
    )`
    ),
  })
);

export const billOccurrences = pgTable(
  "veyra_bill_occurrences",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    billId: text("bill_id")
      .references(() => billSeries.id, { onDelete: "cascade" })
      .notNull(),
    dueDate: timestamp("due_date", { mode: "date" }).notNull(),
    amount: integer("amount").notNull(),
    status: text("status", {
      enum: ["pending", "paid", "skipped"],
    })
      .default("pending")
      .notNull(),
    paidAt: timestamp("paid_at", { mode: "date" }),
    loanPaymentId: text("loan_payment_id").references(() => loanPayments.id, {
      onDelete: "set null",
    }),
    transactionEventId: text("transaction_event_id").references(() => transactionEvents.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_bill_occurrences_clerk_user_idx").on(table.clerkUserId),
    billIdx: index("veyra_bill_occurrences_bill_idx").on(table.billId),
    dueDateIdx: index("veyra_bill_occurrences_due_date_idx").on(table.dueDate),
    statusIdx: index("veyra_bill_occurrences_status_idx").on(table.status),
    loanPaymentIdx: index("veyra_bill_occurrences_loan_payment_idx").on(table.loanPaymentId),
    transactionEventIdx: index("veyra_bill_occurrences_transaction_event_idx").on(
      table.transactionEventId
    ),
    uniqueBillDueIdx: uniqueIndex("veyra_bill_occurrences_bill_due_uidx").on(
      table.billId,
      table.dueDate
    ),
  })
);
