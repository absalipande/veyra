CREATE TABLE "veyra_assistant_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"summary" text NOT NULL,
	"source" text DEFAULT 'user_confirmed' NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_user_preferences" ADD COLUMN "allow_assistant_memory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "veyra_user_preferences" ADD COLUMN "assistant_memory_updated_at" timestamp;--> statement-breakpoint
CREATE INDEX "veyra_assistant_memories_clerk_user_idx" ON "veyra_assistant_memories" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_assistant_memories_kind_idx" ON "veyra_assistant_memories" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "veyra_assistant_memories_created_at_idx" ON "veyra_assistant_memories" USING btree ("created_at");