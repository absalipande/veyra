ALTER TABLE "veyra_transaction_events" ADD COLUMN "amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_transaction_events" ADD COLUMN "fee_amount" integer DEFAULT 0 NOT NULL;
