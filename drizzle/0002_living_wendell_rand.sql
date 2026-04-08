CREATE TABLE "veyra_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" text NOT NULL,
	"amount_delta" integer NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veyra_transaction_events" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"type" text NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_ledger_entries" ADD CONSTRAINT "veyra_ledger_entries_event_id_veyra_transaction_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."veyra_transaction_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veyra_ledger_entries" ADD CONSTRAINT "veyra_ledger_entries_account_id_veyra_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."veyra_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_ledger_entries_clerk_user_idx" ON "veyra_ledger_entries" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_ledger_entries_event_idx" ON "veyra_ledger_entries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "veyra_ledger_entries_account_idx" ON "veyra_ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "veyra_transaction_events_clerk_user_idx" ON "veyra_transaction_events" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_transaction_events_occurred_at_idx" ON "veyra_transaction_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "veyra_transaction_events_type_idx" ON "veyra_transaction_events" USING btree ("type");