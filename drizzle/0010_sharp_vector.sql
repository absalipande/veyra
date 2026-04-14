CREATE TABLE "veyra_loan_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"loan_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "veyra_loan_installments" ADD CONSTRAINT "veyra_loan_installments_loan_id_veyra_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."veyra_loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veyra_loan_installments_clerk_user_idx" ON "veyra_loan_installments" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "veyra_loan_installments_loan_idx" ON "veyra_loan_installments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "veyra_loan_installments_due_date_idx" ON "veyra_loan_installments" USING btree ("due_date");