CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"record_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "evidence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "evidence_tenant_select" ON "evidence" FOR SELECT
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "evidence_tenant_insert" ON "evidence" FOR INSERT
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE TRIGGER evidence_no_update_delete
  BEFORE UPDATE OR DELETE ON "evidence"
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER evidence_no_truncate
  BEFORE TRUNCATE ON "evidence"
  FOR EACH STATEMENT EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE INDEX "evidence_record_idx" ON "evidence" ("record_id", "created_at" DESC);
