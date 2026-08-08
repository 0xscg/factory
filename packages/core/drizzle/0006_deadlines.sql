CREATE TYPE "public"."obligation_status" AS ENUM('pending', 'met');--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"rule_key" text NOT NULL,
	"name" text NOT NULL,
	"citation" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "obligation_status" DEFAULT 'pending' NOT NULL,
	"met_at" timestamp with time zone,
	"met_by" uuid,
	"record_id" uuid,
	"notified_stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "obligations_org_rule_due_idx" ON "obligations" USING btree ("org_id","product","rule_key","due_at");--> statement-breakpoint
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "obligations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "obligations_tenant_isolation" ON "obligations"
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT UPDATE ("status", "met_at", "met_by", "notified_stages") ON "obligations" TO "factory_app";
--> statement-breakpoint
CREATE INDEX "obligations_org_status_due_idx" ON "obligations" ("org_id", "status", "due_at");
