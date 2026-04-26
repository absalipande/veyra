ALTER TABLE "veyra_loans" ADD COLUMN "repayment_account_id" text;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "repayment_account_kind" text DEFAULT 'loan_account' NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "liability_treatment" text DEFAULT 'separate_loan' NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_balance_treatment" text;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_linked_opening_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_balance_at_link" integer;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_limit_at_link" integer;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_available_at_link" integer;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_utilization_at_link" integer;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "credit_opening_adjustment_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD COLUMN "default_payment_source_account_id" text;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD CONSTRAINT "veyra_loans_repayment_account_id_veyra_accounts_id_fk" FOREIGN KEY ("repayment_account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD CONSTRAINT "veyra_loans_default_payment_source_account_id_veyra_accounts_id_fk" FOREIGN KEY ("default_payment_source_account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_loans_repayment_account_idx" ON "veyra_loans" USING btree ("repayment_account_id");--> statement-breakpoint
CREATE INDEX "veyra_loans_repayment_account_kind_idx" ON "veyra_loans" USING btree ("repayment_account_kind");--> statement-breakpoint
CREATE INDEX "veyra_loans_default_payment_source_account_idx" ON "veyra_loans" USING btree ("default_payment_source_account_id");--> statement-breakpoint
ALTER TABLE "veyra_loans" ADD CONSTRAINT "veyra_loans_credit_link_consistency_check" CHECK ((
        ("veyra_loans"."repayment_account_kind" = 'credit_account'
          AND "veyra_loans"."repayment_account_id" IS NOT NULL
          AND "veyra_loans"."liability_treatment" = 'credit_linked_overlay'
          AND "veyra_loans"."credit_balance_treatment" IS NOT NULL
          AND "veyra_loans"."credit_balance_at_link" IS NOT NULL
          AND "veyra_loans"."credit_limit_at_link" IS NOT NULL
          AND "veyra_loans"."credit_available_at_link" IS NOT NULL
          AND "veyra_loans"."credit_utilization_at_link" IS NOT NULL)
        OR
        ("veyra_loans"."repayment_account_kind" = 'loan_account'
          AND "veyra_loans"."liability_treatment" = 'separate_loan'
          AND "veyra_loans"."credit_balance_treatment" IS NULL
          AND "veyra_loans"."credit_opening_adjustment_applied" = false)
      ));