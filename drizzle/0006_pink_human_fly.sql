CREATE TABLE "veyra_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_transaction_events" ADD COLUMN "category_id" text;--> statement-breakpoint
CREATE INDEX "veyra_categories_clerk_user_idx" ON "veyra_categories" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_categories_kind_idx" ON "veyra_categories" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "veyra_categories_archived_idx" ON "veyra_categories" USING btree ("is_archived");--> statement-breakpoint
ALTER TABLE "veyra_transaction_events" ADD CONSTRAINT "veyra_transaction_events_category_id_veyra_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."veyra_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_transaction_events_category_idx" ON "veyra_transaction_events" USING btree ("category_id");