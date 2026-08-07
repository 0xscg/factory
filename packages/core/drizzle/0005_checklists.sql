CREATE TYPE "public"."checklist_status" AS ENUM('open', 'signed_off');--> statement-breakpoint
CREATE TABLE "checklist_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"checklist_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"requires_evidence" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"evidence_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"template_key" text NOT NULL,
	"name" text NOT NULL,
	"record_id" uuid,
	"status" "checklist_status" DEFAULT 'open' NOT NULL,
	"signed_off_by" uuid,
	"signed_off_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_steps_checklist_step_idx" ON "checklist_steps" USING btree ("checklist_id","step_key");--> statement-breakpoint
ALTER TABLE "checklists" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checklists" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "checklists_tenant_isolation" ON "checklists"
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT UPDATE ("status", "signed_off_by", "signed_off_at") ON "checklists" TO "factory_app";
--> statement-breakpoint
ALTER TABLE "checklist_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checklist_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "checklist_steps_tenant_isolation" ON "checklist_steps"
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT UPDATE ("completed_at", "completed_by", "evidence_id", "notes") ON "checklist_steps" TO "factory_app";
--> statement-breakpoint
CREATE INDEX "checklists_org_template_idx" ON "checklists" ("org_id", "template_key", "created_at" DESC);
--> statement-breakpoint
CREATE FUNCTION checklists_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'signed_off' THEN
    RAISE EXCEPTION 'checklist % is signed off and frozen', OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER checklists_frozen_after_signoff
  BEFORE UPDATE OR DELETE ON "checklists"
  FOR EACH ROW EXECUTE FUNCTION checklists_freeze();
--> statement-breakpoint
CREATE FUNCTION checklists_no_forged_signoff() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'open' THEN
    RAISE EXCEPTION 'checklists must be inserted open; sign-off is a transition';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER checklists_insert_open_only
  BEFORE INSERT ON "checklists"
  FOR EACH ROW EXECUTE FUNCTION checklists_no_forged_signoff();
--> statement-breakpoint
CREATE FUNCTION checklist_steps_freeze() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "checklists" c
    WHERE c.id = OLD.checklist_id AND c.status = 'signed_off'
  ) THEN
    RAISE EXCEPTION 'checklist % is signed off; its steps are frozen', OLD.checklist_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER checklist_steps_frozen_after_signoff
  BEFORE UPDATE OR DELETE ON "checklist_steps"
  FOR EACH ROW EXECUTE FUNCTION checklist_steps_freeze();
--> statement-breakpoint
ALTER TABLE "checklist_steps" ADD CONSTRAINT "checklist_steps_evidence_fk"
  FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id");
