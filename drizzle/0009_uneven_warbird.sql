CREATE TABLE "veyra_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"lender_name" text NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"principal_amount" integer NOT NULL,
	"outstanding_amount" integer NOT NULL,
	"disbursed_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"destination_account_id" text NOT NULL,
	"underlying_loan_account_id" text,
	"cadence" text,
	"next_due_date" timestamp,
	"notes" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD CONSTRAINT "veyra_loans_destination_account_id_veyra_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD CONSTRAINT "veyra_loans_underlying_loan_account_id_veyra_accounts_id_fk" FOREIGN KEY ("underlying_loan_account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_loans_clerk_user_idx" ON "veyra_loans" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_loans_status_idx" ON "veyra_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "veyra_loans_destination_account_idx" ON "veyra_loans" USING btree ("destination_account_id");--> statement-breakpoint
CREATE INDEX "veyra_loans_underlying_account_idx" ON "veyra_loans" USING btree ("underlying_loan_account_id");--> statement-breakpoint
CREATE INDEX "veyra_loans_next_due_date_idx" ON "veyra_loans" USING btree ("next_due_date");