CREATE TABLE "veyra_ai_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"surface" text NOT NULL,
	"payload" text NOT NULL,
	"generated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "veyra_ai_insights_clerk_user_idx" ON "veyra_ai_insights" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_ai_insights_surface_idx" ON "veyra_ai_insights" USING btree ("surface");--> statement-breakpoint
CREATE UNIQUE INDEX "veyra_ai_insights_user_surface_uidx" ON "veyra_ai_insights" USING btree ("clerk_user_id","surface");