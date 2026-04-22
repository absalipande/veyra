CREATE TABLE "veyra_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veyra_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" integer NOT NULL,
	"current_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"target_date" timestamp NOT NULL,
	"linked_budget_id" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_user_preferences" ADD COLUMN "allow_ai_coaching" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_user_preferences" ADD COLUMN "allow_usage_analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_goals" ADD CONSTRAINT "veyra_goals_linked_budget_id_veyra_budgets_id_fk" FOREIGN KEY ("linked_budget_id") REFERENCES "public"."veyra_budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_audit_logs_clerk_user_idx" ON "veyra_audit_logs" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_audit_logs_action_idx" ON "veyra_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "veyra_audit_logs_entity_type_idx" ON "veyra_audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "veyra_audit_logs_created_at_idx" ON "veyra_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "veyra_goals_clerk_user_idx" ON "veyra_goals" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_goals_status_idx" ON "veyra_goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "veyra_goals_target_date_idx" ON "veyra_goals" USING btree ("target_date");--> statement-breakpoint
CREATE INDEX "veyra_goals_linked_budget_idx" ON "veyra_goals" USING btree ("linked_budget_id");