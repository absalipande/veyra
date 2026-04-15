CREATE TABLE "veyra_loan_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"loan_id" text NOT NULL,
	"installment_id" text,
	"source_account_id" text NOT NULL,
	"amount" integer NOT NULL,
	"applied_amount" integer NOT NULL,
	"principal_amount" integer DEFAULT 0 NOT NULL,
	"interest_amount" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD COLUMN "principal_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD COLUMN "interest_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD COLUMN "paid_principal_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD COLUMN "paid_interest_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loan_payments" ADD CONSTRAINT "veyra_loan_payments_loan_id_veyra_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."veyra_loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_loan_payments" ADD CONSTRAINT "veyra_loan_payments_installment_id_veyra_loan_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."veyra_loan_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_loan_payments" ADD CONSTRAINT "veyra_loan_payments_source_account_id_veyra_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_loan_payments_clerk_user_idx" ON "veyra_loan_payments" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_loan_payments_loan_idx" ON "veyra_loan_payments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "veyra_loan_payments_installment_idx" ON "veyra_loan_payments" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "veyra_loan_payments_paid_at_idx" ON "veyra_loan_payments" USING btree ("paid_at");