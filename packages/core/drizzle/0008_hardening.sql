CREATE TABLE "auth_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_last_used_step" bigint;--> statement-breakpoint
GRANT UPDATE ("totp_last_used_step") ON "users" TO "factory_app";
--> statement-breakpoint
-- auth_attempts: system-level rate-limit counters (no tenant data; keys
-- are derived identifiers like "magic_link:<email>"). The app role may
-- read, insert, and bump counters — never delete (windows roll forward
-- in place).
ALTER TABLE "auth_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_attempts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "auth_attempts_select" ON "auth_attempts" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "auth_attempts_insert" ON "auth_attempts" FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "auth_attempts_update" ON "auth_attempts" FOR UPDATE USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT UPDATE ("window_start", "count") ON "auth_attempts" TO "factory_app";
--> statement-breakpoint
-- stripe_events joins the append-only class (audit finding, LOW): the
-- idempotency ledger must not be editable even by superuser mistake.
CREATE TRIGGER stripe_events_append_only
  BEFORE UPDATE OR DELETE ON "stripe_events"
  FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER stripe_events_no_truncate
  BEFORE TRUNCATE ON "stripe_events"
  FOR EACH STATEMENT EXECUTE FUNCTION append_only();
