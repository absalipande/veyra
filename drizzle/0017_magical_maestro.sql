ALTER TABLE "veyra_bill_occurrences" ADD COLUMN "loan_payment_id" text;--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD COLUMN "obligation_type" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD COLUMN "loan_id" text;--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD COLUMN "loan_installment_id" text;--> statement-breakpoint
ALTER TABLE "veyra_bill_occurrences" ADD CONSTRAINT "veyra_bill_occurrences_loan_payment_id_veyra_loan_payments_id_fk" FOREIGN KEY ("loan_payment_id") REFERENCES "public"."veyra_loan_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD CONSTRAINT "veyra_bill_series_loan_id_veyra_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."veyra_loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD CONSTRAINT "veyra_bill_series_loan_installment_id_veyra_loan_installments_id_fk" FOREIGN KEY ("loan_installment_id") REFERENCES "public"."veyra_loan_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_bill_occurrences_loan_payment_idx" ON "veyra_bill_occurrences" USING btree ("loan_payment_id");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_obligation_type_idx" ON "veyra_bill_series" USING btree ("obligation_type");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_loan_idx" ON "veyra_bill_series" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "veyra_bill_series_loan_installment_idx" ON "veyra_bill_series" USING btree ("loan_installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "veyra_bill_series_loan_repayment_uidx" ON "veyra_bill_series" USING btree ("clerk_user_id","loan_id");--> statement-breakpoint
ALTER TABLE "veyra_bill_series" ADD CONSTRAINT "veyra_bill_series_obligation_consistency_check" CHECK ((
      ("veyra_bill_series"."obligation_type" = 'loan_repayment' AND "veyra_bill_series"."loan_id" IS NOT NULL)
      OR
      ("veyra_bill_series"."obligation_type" = 'general' AND "veyra_bill_series"."loan_id" IS NULL AND "veyra_bill_series"."loan_installment_id" IS NULL)
    ));