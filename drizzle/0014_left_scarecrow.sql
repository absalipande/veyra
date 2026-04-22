CREATE TABLE "veyra_bill_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veyra_bill_series" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"cadence" text DEFAULT 'monthly' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp NOT NULL,
	"next_due_date" timestamp,
	"ends_after_occurrences" integer,
	"remaining_occurrences" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"account_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_bill_occurrences" ADD CONSTRAINT "veyra_bill_occurrences_bill_id_veyra_bill_series_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."veyra_bill_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD CONSTRAINT "veyra_bill_series_account_id_veyra_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_bill_occurrences_clerk_user_idx" ON "veyra_bill_occurrences" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_bill_occurrences_bill_idx" ON "veyra_bill_occurrences" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "veyra_bill_occurrences_due_date_idx" ON "veyra_bill_occurrences" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "veyra_bill_occurrences_status_idx" ON "veyra_bill_occurrences" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "veyra_bill_occurrences_bill_due_uidx" ON "veyra_bill_occurrences" USING btree ("bill_id","due_date");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_clerk_user_idx" ON "veyra_bill_series" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_next_due_date_idx" ON "veyra_bill_series" USING btree ("next_due_date");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_account_idx" ON "veyra_bill_series" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_active_idx" ON "veyra_bill_series" USING btree ("is_active");