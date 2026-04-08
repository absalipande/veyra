CREATE TABLE "veyra_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"period" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"salary_dates" text,
	"parent_budget_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_transaction_events" ADD COLUMN "budget_id" text;--> statement-breakpoint
CREATE INDEX "veyra_budgets_clerk_user_idx" ON "veyra_budgets" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_budgets_parent_budget_idx" ON "veyra_budgets" USING btree ("parent_budget_id");--> statement-breakpoint
CREATE INDEX "veyra_budgets_period_idx" ON "veyra_budgets" USING btree ("period");--> statement-breakpoint
ALTER TABLE "veyra_transaction_events" ADD CONSTRAINT "veyra_transaction_events_budget_id_veyra_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."veyra_budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_transaction_events_budget_idx" ON "veyra_transaction_events" USING btree ("budget_id");