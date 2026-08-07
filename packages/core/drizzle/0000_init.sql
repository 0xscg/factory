CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orgs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "orgs_tenant_isolation" ON "orgs"
  USING (id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
DO $$ BEGIN
  CREATE ROLE "factory_app" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO "factory_app";
--> statement-breakpoint
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO "factory_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO "factory_app";
--> statement-breakpoint
GRANT UPDATE ON "orgs" TO "factory_app";
