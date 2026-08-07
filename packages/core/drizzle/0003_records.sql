CREATE TABLE "record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"record_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"entity_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "record_versions_record_version_idx" ON "record_versions" USING btree ("record_id","version");--> statement-breakpoint
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "records_tenant_isolation" ON "records"
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT UPDATE ("data", "version", "updated_at", "deleted_at") ON "records" TO "factory_app";
--> statement-breakpoint
ALTER TABLE "record_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "record_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "record_versions_tenant_select" ON "record_versions" FOR SELECT
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "record_versions_tenant_insert" ON "record_versions" FOR INSERT
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
CREATE FUNCTION append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER record_versions_no_update_delete
  BEFORE UPDATE OR DELETE ON "record_versions"
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER record_versions_no_truncate
  BEFORE TRUNCATE ON "record_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE INDEX "records_org_type_idx" ON "records" ("org_id", "entity_type", "created_at" DESC);
