import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
    type: text("type", {
      enum: ["cash", "credit", "loan", "wallet"],
    })
      .default("cash")
      .notNull(),
    balance: integer("balance").default(0).notNull(),
    institution: text("institution"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clerkUserIdx: index("veyra_accounts_clerk_user_idx").on(table.clerkUserId),
  })
);
