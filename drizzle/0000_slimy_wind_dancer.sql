CREATE TABLE "veyra_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'cash' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"institution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veyra_user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"default_currency" text DEFAULT 'PHP' NOT NULL,
	"locale" text DEFAULT 'en-PH' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "veyra_user_preferences_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE INDEX "veyra_accounts_clerk_user_idx" ON "veyra_accounts" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_user_preferences_clerk_user_idx" ON "veyra_user_preferences" USING btree ("clerk_user_id");