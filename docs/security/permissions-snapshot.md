# DB permission snapshot — baseline

Captured: 2026-08-08 (audit-2026-08-08). Source: postgres://localhost:5433/factory. Diff against this on the next fortnightly audit.

## Roles
```
                              List of roles
  Role name  |                         Attributes                         
-------------+------------------------------------------------------------
 app_login   | 
 factory     | Superuser, Create role, Create DB, Replication, Bypass RLS
 factory_app | Cannot login

```
## Table-level grants (non-owner)
```
    table_name     |   grantee   | privilege_type 
-------------------+-------------+----------------
 audit_log         | factory_app | INSERT
 audit_log         | factory_app | SELECT
 checklist_steps   | factory_app | INSERT
 checklist_steps   | factory_app | SELECT
 checklists        | factory_app | INSERT
 checklists        | factory_app | SELECT
 evidence          | factory_app | INSERT
 evidence          | factory_app | SELECT
 magic_link_tokens | factory_app | INSERT
 magic_link_tokens | factory_app | SELECT
 members           | factory_app | DELETE
 members           | factory_app | INSERT
 members           | factory_app | SELECT
 obligations       | factory_app | INSERT
 obligations       | factory_app | SELECT
 orgs              | factory_app | INSERT
 orgs              | factory_app | SELECT
 orgs              | factory_app | UPDATE
 record_versions   | factory_app | INSERT
 record_versions   | factory_app | SELECT
 records           | factory_app | INSERT
 records           | factory_app | SELECT
 sessions          | factory_app | INSERT
 sessions          | factory_app | SELECT
 stripe_events     | factory_app | INSERT
 stripe_events     | factory_app | SELECT
 subscriptions     | factory_app | INSERT
 subscriptions     | factory_app | SELECT
 users             | factory_app | INSERT
 users             | factory_app | SELECT
(30 rows)

```
## Column-level grants (factory_app)
```
    table_name     |      column_name       | privilege_type 
-------------------+------------------------+----------------
 audit_log         | action                 | INSERT
 audit_log         | action                 | SELECT
 audit_log         | actor_user_id          | INSERT
 audit_log         | actor_user_id          | SELECT
 audit_log         | after                  | INSERT
 audit_log         | after                  | SELECT
 audit_log         | before                 | INSERT
 audit_log         | before                 | SELECT
 audit_log         | created_at             | INSERT
 audit_log         | created_at             | SELECT
 audit_log         | entity_id              | INSERT
 audit_log         | entity_id              | SELECT
 audit_log         | entity_type            | INSERT
 audit_log         | entity_type            | SELECT
 audit_log         | id                     | INSERT
 audit_log         | id                     | SELECT
 audit_log         | org_id                 | INSERT
 audit_log         | org_id                 | SELECT
 audit_log         | product                | INSERT
 audit_log         | product                | SELECT
 checklist_steps   | checklist_id           | INSERT
 checklist_steps   | checklist_id           | SELECT
 checklist_steps   | completed_at           | INSERT
 checklist_steps   | completed_at           | SELECT
 checklist_steps   | completed_at           | UPDATE
 checklist_steps   | completed_by           | INSERT
 checklist_steps   | completed_by           | SELECT
 checklist_steps   | completed_by           | UPDATE
 checklist_steps   | created_at             | INSERT
 checklist_steps   | created_at             | SELECT
 checklist_steps   | evidence_id            | INSERT
 checklist_steps   | evidence_id            | SELECT
 checklist_steps   | evidence_id            | UPDATE
 checklist_steps   | id                     | INSERT
 checklist_steps   | id                     | SELECT
 checklist_steps   | notes                  | INSERT
 checklist_steps   | notes                  | SELECT
 checklist_steps   | notes                  | UPDATE
 checklist_steps   | org_id                 | INSERT
 checklist_steps   | org_id                 | SELECT
 checklist_steps   | position               | INSERT
 checklist_steps   | position               | SELECT
 checklist_steps   | product                | INSERT
 checklist_steps   | product                | SELECT
 checklist_steps   | requires_evidence      | INSERT
 checklist_steps   | requires_evidence      | SELECT
 checklist_steps   | step_key               | INSERT
 checklist_steps   | step_key               | SELECT
 checklist_steps   | title                  | INSERT
 checklist_steps   | title                  | SELECT
 checklists        | created_at             | INSERT
 checklists        | created_at             | SELECT
 checklists        | created_by             | INSERT
 checklists        | created_by             | SELECT
 checklists        | id                     | INSERT
 checklists        | id                     | SELECT
 checklists        | name                   | INSERT
 checklists        | name                   | SELECT
 checklists        | org_id                 | INSERT
 checklists        | org_id                 | SELECT
 checklists        | product                | INSERT
 checklists        | product                | SELECT
 checklists        | record_id              | INSERT
 checklists        | record_id              | SELECT
 checklists        | signed_off_at          | INSERT
 checklists        | signed_off_at          | SELECT
 checklists        | signed_off_at          | UPDATE
 checklists        | signed_off_by          | INSERT
 checklists        | signed_off_by          | SELECT
 checklists        | signed_off_by          | UPDATE
 checklists        | status                 | INSERT
 checklists        | status                 | SELECT
 checklists        | status                 | UPDATE
 checklists        | template_key           | INSERT
 checklists        | template_key           | SELECT
 evidence          | content_type           | INSERT
 evidence          | content_type           | SELECT
 evidence          | created_at             | INSERT
 evidence          | created_at             | SELECT
 evidence          | filename               | INSERT
 evidence          | filename               | SELECT
 evidence          | id                     | INSERT
 evidence          | id                     | SELECT
 evidence          | org_id                 | INSERT
 evidence          | org_id                 | SELECT
 evidence          | product                | INSERT
 evidence          | product                | SELECT
 evidence          | record_id              | INSERT
 evidence          | record_id              | SELECT
 evidence          | sha256                 | INSERT
 evidence          | sha256                 | SELECT
 evidence          | size_bytes             | INSERT
 evidence          | size_bytes             | SELECT
 evidence          | storage_key            | INSERT
 evidence          | storage_key            | SELECT
 evidence          | uploaded_by            | INSERT
 evidence          | uploaded_by            | SELECT
 magic_link_tokens | consumed_at            | INSERT
 magic_link_tokens | consumed_at            | SELECT
 magic_link_tokens | consumed_at            | UPDATE
 magic_link_tokens | created_at             | INSERT
 magic_link_tokens | created_at             | SELECT
 magic_link_tokens | expires_at             | INSERT
 magic_link_tokens | expires_at             | SELECT
 magic_link_tokens | id                     | INSERT
 magic_link_tokens | id                     | SELECT
 magic_link_tokens | token_hash             | INSERT
 magic_link_tokens | token_hash             | SELECT
 magic_link_tokens | user_id                | INSERT
 magic_link_tokens | user_id                | SELECT
 members           | created_at             | INSERT
 members           | created_at             | SELECT
 members           | org_id                 | INSERT
 members           | org_id                 | SELECT
 members           | role                   | INSERT
 members           | role                   | SELECT
 members           | role                   | UPDATE
 members           | user_id                | INSERT
 members           | user_id                | SELECT
 obligations       | citation               | INSERT
 obligations       | citation               | SELECT
 obligations       | created_at             | INSERT
 obligations       | created_at             | SELECT
 obligations       | due_at                 | INSERT
 obligations       | due_at                 | SELECT
 obligations       | id                     | INSERT
 obligations       | id                     | SELECT
 obligations       | met_at                 | INSERT
 obligations       | met_at                 | SELECT
 obligations       | met_at                 | UPDATE
 obligations       | met_by                 | INSERT
 obligations       | met_by                 | SELECT
 obligations       | met_by                 | UPDATE
 obligations       | name                   | INSERT
 obligations       | name                   | SELECT
 obligations       | notified_stages        | INSERT
 obligations       | notified_stages        | SELECT
 obligations       | notified_stages        | UPDATE
 obligations       | org_id                 | INSERT
 obligations       | org_id                 | SELECT
 obligations       | product                | INSERT
 obligations       | product                | SELECT
 obligations       | record_id              | INSERT
 obligations       | record_id              | SELECT
 obligations       | rule_key               | INSERT
 obligations       | rule_key               | SELECT
 obligations       | status                 | INSERT
 obligations       | status                 | SELECT
 obligations       | status                 | UPDATE
 orgs              | created_at             | INSERT
 orgs              | created_at             | SELECT
 orgs              | created_at             | UPDATE
 orgs              | id                     | INSERT
 orgs              | id                     | SELECT
 orgs              | id                     | UPDATE
 orgs              | name                   | INSERT
 orgs              | name                   | SELECT
 orgs              | name                   | UPDATE
 record_versions   | created_at             | INSERT
 record_versions   | created_at             | SELECT
 record_versions   | created_by             | INSERT
 record_versions   | created_by             | SELECT
 record_versions   | data                   | INSERT
 record_versions   | data                   | SELECT
 record_versions   | id                     | INSERT
 record_versions   | id                     | SELECT
 record_versions   | org_id                 | INSERT
 record_versions   | org_id                 | SELECT
 record_versions   | product                | INSERT
 record_versions   | product                | SELECT
 record_versions   | record_id              | INSERT
 record_versions   | record_id              | SELECT
 record_versions   | version                | INSERT
 record_versions   | version                | SELECT
 records           | created_at             | INSERT
 records           | created_at             | SELECT
 records           | created_by             | INSERT
 records           | created_by             | SELECT
 records           | data                   | INSERT
 records           | data                   | SELECT
 records           | data                   | UPDATE
 records           | deleted_at             | INSERT
 records           | deleted_at             | SELECT
 records           | deleted_at             | UPDATE
 records           | entity_type            | INSERT
 records           | entity_type            | SELECT
 records           | id                     | INSERT
 records           | id                     | SELECT
 records           | org_id                 | INSERT
 records           | org_id                 | SELECT
 records           | product                | INSERT
 records           | product                | SELECT
 records           | updated_at             | INSERT
 records           | updated_at             | SELECT
 records           | updated_at             | UPDATE
 records           | version                | INSERT
 records           | version                | SELECT
 records           | version                | UPDATE
 sessions          | created_at             | INSERT
 sessions          | created_at             | SELECT
 sessions          | expires_at             | INSERT
 sessions          | expires_at             | SELECT
 sessions          | id                     | INSERT
 sessions          | id                     | SELECT
 sessions          | revoked_at             | INSERT
 sessions          | revoked_at             | SELECT
 sessions          | revoked_at             | UPDATE
 sessions          | token_hash             | INSERT
 sessions          | token_hash             | SELECT
 sessions          | user_id                | INSERT
 sessions          | user_id                | SELECT
 stripe_events     | id                     | INSERT
 stripe_events     | id                     | SELECT
 stripe_events     | received_at            | INSERT
 stripe_events     | received_at            | SELECT
 stripe_events     | type                   | INSERT
 stripe_events     | type                   | SELECT
 subscriptions     | canceled_at            | INSERT
 subscriptions     | canceled_at            | SELECT
 subscriptions     | canceled_at            | UPDATE
 subscriptions     | created_at             | INSERT
 subscriptions     | created_at             | SELECT
 subscriptions     | current_period_end     | INSERT
 subscriptions     | current_period_end     | SELECT
 subscriptions     | current_period_end     | UPDATE
 subscriptions     | id                     | INSERT
 subscriptions     | id                     | SELECT
 subscriptions     | last_event_at          | INSERT
 subscriptions     | last_event_at          | SELECT
 subscriptions     | last_event_at          | UPDATE
 subscriptions     | org_id                 | INSERT
 subscriptions     | org_id                 | SELECT
 subscriptions     | price_lookup_key       | INSERT
 subscriptions     | price_lookup_key       | SELECT
 subscriptions     | price_lookup_key       | UPDATE
 subscriptions     | product                | INSERT
 subscriptions     | product                | SELECT
 subscriptions     | status                 | INSERT
 subscriptions     | status                 | SELECT
 subscriptions     | status                 | UPDATE
 subscriptions     | stripe_customer_id     | INSERT
 subscriptions     | stripe_customer_id     | SELECT
 subscriptions     | stripe_customer_id     | UPDATE
 subscriptions     | stripe_subscription_id | INSERT
 subscriptions     | stripe_subscription_id | SELECT
 subscriptions     | stripe_subscription_id | UPDATE
 subscriptions     | updated_at             | INSERT
 subscriptions     | updated_at             | SELECT
 subscriptions     | updated_at             | UPDATE
 users             | created_at             | INSERT
 users             | created_at             | SELECT
 users             | email                  | INSERT
 users             | email                  | SELECT
 users             | id                     | INSERT
 users             | id                     | SELECT
 users             | totp_enabled           | INSERT
 users             | totp_enabled           | SELECT
 users             | totp_enabled           | UPDATE
 users             | totp_secret            | INSERT
 users             | totp_secret            | SELECT
 users             | totp_secret            | UPDATE
(261 rows)

```
## RLS enablement (relrowsecurity / relforcerowsecurity)
```
      relname      | relrowsecurity | relforcerowsecurity 
-------------------+----------------+---------------------
 audit_log         | t              | t
 checklist_steps   | t              | t
 checklists        | t              | t
 evidence          | t              | t
 magic_link_tokens | f              | f
 members           | t              | t
 obligations       | t              | t
 orgs              | t              | t
 record_versions   | t              | t
 records           | t              | t
 sessions          | f              | f
 stripe_events     | t              | t
 subscriptions     | t              | t
 users             | f              | f
(14 rows)

```
## RLS policies
```
    tablename    |            policyname            |  cmd   |  roles   |                                       qual                                       |                                   with_check                                   
-----------------+----------------------------------+--------+----------+----------------------------------------------------------------------------------+--------------------------------------------------------------------------------
 audit_log       | audit_log_tenant_insert          | INSERT | {public} |                                                                                  | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 audit_log       | audit_log_tenant_select          | SELECT | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | 
 checklist_steps | checklist_steps_tenant_isolation | ALL    | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 checklists      | checklists_tenant_isolation      | ALL    | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 evidence        | evidence_tenant_insert           | INSERT | {public} |                                                                                  | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 evidence        | evidence_tenant_select           | SELECT | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | 
 members         | members_self_view                | SELECT | {public} | (user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid) | 
 members         | members_tenant_isolation         | ALL    | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 obligations     | obligations_tenant_isolation     | ALL    | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 orgs            | orgs_tenant_isolation            | ALL    | {public} | (id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)       | (id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 record_versions | record_versions_tenant_insert    | INSERT | {public} |                                                                                  | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 record_versions | record_versions_tenant_select    | SELECT | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | 
 records         | records_tenant_isolation         | ALL    | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
 stripe_events   | stripe_events_insert             | INSERT | {public} |                                                                                  | true
 stripe_events   | stripe_events_select             | SELECT | {public} | true                                                                             | 
 subscriptions   | subscriptions_tenant_isolation   | ALL    | {public} | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)   | (org_id = (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid)
(16 rows)

```
## Append-only / freeze triggers
```
 event_object_table |             trigger_name             | event_manipulation | action_timing |                action_statement                 
--------------------+--------------------------------------+--------------------+---------------+-------------------------------------------------
 audit_log          | audit_log_no_update_delete           | DELETE             | BEFORE        | EXECUTE FUNCTION audit_log_immutable()
 audit_log          | audit_log_no_update_delete           | UPDATE             | BEFORE        | EXECUTE FUNCTION audit_log_immutable()
 checklist_steps    | checklist_steps_frozen_after_signoff | UPDATE             | BEFORE        | EXECUTE FUNCTION checklist_steps_freeze()
 checklist_steps    | checklist_steps_frozen_after_signoff | DELETE             | BEFORE        | EXECUTE FUNCTION checklist_steps_freeze()
 checklists         | checklists_frozen_after_signoff      | UPDATE             | BEFORE        | EXECUTE FUNCTION checklists_freeze()
 checklists         | checklists_frozen_after_signoff      | DELETE             | BEFORE        | EXECUTE FUNCTION checklists_freeze()
 checklists         | checklists_insert_open_only          | INSERT             | BEFORE        | EXECUTE FUNCTION checklists_no_forged_signoff()
 evidence           | evidence_no_update_delete            | DELETE             | BEFORE        | EXECUTE FUNCTION append_only()
 evidence           | evidence_no_update_delete            | UPDATE             | BEFORE        | EXECUTE FUNCTION append_only()
 record_versions    | record_versions_no_update_delete     | UPDATE             | BEFORE        | EXECUTE FUNCTION append_only()
 record_versions    | record_versions_no_update_delete     | DELETE             | BEFORE        | EXECUTE FUNCTION append_only()
(11 rows)

```
## Accepted deviations (baseline notes)
- users, sessions, magic_link_tokens: RLS disabled — pre-auth/global tables without org_id, access mediated by column grants.
- stripe_events: RLS forced with permissive true policies (global webhook idempotency store); no append-only trigger — role lacks UPDATE/DELETE grants.
- audit_log: no UPDATE/DELETE grants + audit_log_immutable() trigger — the reference append-only pattern.
