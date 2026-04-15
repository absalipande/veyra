ALTER TABLE "veyra_loan_installments" ADD COLUMN "paid_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX "veyra_loan_installments_status_idx" ON "veyra_loan_installments" USING btree ("status");