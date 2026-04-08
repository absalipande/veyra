ALTER TABLE "veyra_accounts"
ADD COLUMN IF NOT EXISTS "credit_limit" integer DEFAULT 0 NOT NULL;
