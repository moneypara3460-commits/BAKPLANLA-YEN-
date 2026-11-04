-- BAKPLANLA DEV baseline reconstructed from the local sanitized catalog evidence.
-- Source catalog SHA-256: 21c7e05f8296b1f9dd4b570e1b34b8415bfac4cd1ab160fc8251131e167cf7b9
-- Retrieved 2026-10-28; database snapshot PostgreSQL 17.6.1.166.
-- Table DDL is reconstructed from exported metadata, not an authoritative database dump.
-- Sequence defaults are explicitly named by the catalog; sequence settings were unavailable, so PostgreSQL defaults are used for this empty DEV database.
-- DEV-only adjustment: business request notification callback points to this DEV project's Edge Function.
-- storage.objects remains Supabase-managed; its exported grants are omitted while its application policies are preserved.
-- No production data or credentials are included. Missing catalog details remain documented; this is not a production-equivalent restore.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SEQUENCE public.bakplanla_promo_attempts_id_seq AS bigint;
CREATE SEQUENCE public.bk_audit_id_seq AS bigint;
CREATE SEQUENCE public.bk_events_id_seq AS bigint;

-- Recreate only the private application bucket configuration; no objects or user data.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bakplanla-documents', 'bakplanla-documents', false, 8388608, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- BAKPLANLA DEV BASELINE MIGRATION — reconstructed from sanitized offline catalog evidence.
-- Source: .local/supabase-exports/catalog.json SHA-256 21c7e05f8296b1f9dd4b570e1b34b8415bfac4cd1ab160fc8251131e167cf7b9
-- Catalog retrieval completed 2026-10-28T11:09:48.9632171Z; snapshot PostgreSQL 17.6.
-- Table DDL is reconstructed from exported column/constraint metadata, not original CREATE text.
-- No customer rows, credentials, role passwords, vault contents, sequence current values or cron jobs.
-- This ordered baseline was applied to the isolated DEV project; pristine local replay remains unverified.
-- It is not a production-equivalent restore. Managed tables referenced here are not recreated.
-- Missing: table owners, role membership/BYPASSRLS, default/column ACLs, sequence configuration,
-- managed routine definitions, scheduler configuration, non-public custom routine bodies, storage bucket rows beyond configuration.
-- ACL statements describe explicit exported grants, not proof of effective runtime privilege.
-- SQL functions/trigger expressions and policy expressions below retain exact exported logic.

-- /rows/0/technical_definitions/relations/80
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_ai_usage" (
  "user_id" uuid NOT NULL,
  "day" date NOT NULL,
  "used" integer DEFAULT 0 NOT NULL
);

-- /rows/0/technical_definitions/relations/65
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres", "authenticated=arwd/postgres"]
CREATE TABLE "public"."bakplanla_backups" (
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "payload" jsonb NOT NULL,
  "checksum" text NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "task_count" integer DEFAULT 0 NOT NULL,
  "document_count" integer DEFAULT 0 NOT NULL,
  "app_version" text,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/81
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "anon=Dxtm/postgres", "authenticated=rDxtm/postgres", "service_role=rwDxtm/postgres"]
CREATE TABLE "public"."bakplanla_business_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "business_name" text NOT NULL,
  "category" text NOT NULL,
  "contact_name" text NOT NULL,
  "phone" text NOT NULL,
  "email" text NOT NULL,
  "district" text NOT NULL,
  "address" text NOT NULL,
  "website" text,
  "instagram" text,
  "description" text NOT NULL,
  "offer" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "admin_note" text,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp(6) with time zone,
  "notified_at" timestamp(6) with time zone,
  "decision_mailed_status" text,
  "decision_mailed_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/73
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_deletion_log" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE) NOT NULL,
  "user_hash" text NOT NULL,
  "deleted_rows" integer DEFAULT 0 NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "deleted_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/66
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres", "authenticated=arwd/postgres"]
CREATE TABLE "public"."bakplanla_devices" (
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "device_id" text NOT NULL,
  "name" text DEFAULT 'Cihaz'::text NOT NULL,
  "platform" text DEFAULT 'unknown'::text NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/67
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bakplanla_entitlements" (
  "user_id" uuid NOT NULL,
  "plan" text DEFAULT 'free'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "current_period_end" timestamp(6) with time zone,
  "auto_renew" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/64
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bakplanla_feature_trials" (
  "user_id" uuid NOT NULL,
  "feature" text NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "refunds" integer DEFAULT 0 NOT NULL,
  "first_used_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/48
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bakplanla_isbasi_coupons" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "shift_id" uuid,
  "code" text NOT NULL,
  "venue" text NOT NULL,
  "offer_id" uuid,
  "is_demo" boolean DEFAULT true NOT NULL,
  "partner_name" text NOT NULL,
  "title_tr" text NOT NULL,
  "title_en" text NOT NULL,
  "title_de" text NOT NULL,
  "issued_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp(6) with time zone NOT NULL,
  "redeemed_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/47
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bakplanla_isbasi_offers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "venue" text NOT NULL,
  "partner_name" text NOT NULL,
  "title_tr" text NOT NULL,
  "title_en" text NOT NULL,
  "title_de" text NOT NULL,
  "valid_days" integer DEFAULT 30 NOT NULL,
  "is_demo" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/45
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bakplanla_isbasi_progress" (
  "user_id" uuid NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/46
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bakplanla_isbasi_shifts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "level" integer NOT NULL,
  "seed" bigint NOT NULL,
  "game_date" date NOT NULL,
  "started_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'started'::text NOT NULL,
  "score" integer,
  "max_score" integer,
  "stars" integer,
  "reject_reason" text,
  "finished_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/70
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_pairings" (
  "code_hash" text NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp(6) with time zone NOT NULL,
  "used_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/76
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_partner_codes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "day" date NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp(6) with time zone NOT NULL,
  "redeemed_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/82
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_partner_fails" (
  "partner_id" text NOT NULL,
  "at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "kind" text DEFAULT 'pin'::text NOT NULL
);

-- /rows/0/technical_definitions/relations/75
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_partners" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "offer_tr" text NOT NULL,
  "offer_en" text DEFAULT ''::text NOT NULL,
  "offer_de" text DEFAULT ''::text NOT NULL,
  "discount_percent" integer NOT NULL,
  "window_start" time(6) without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
  "window_end" time(6) without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
  "pin_hash" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/71
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_promo_attempts" (
  "id" bigint DEFAULT nextval('bakplanla_promo_attempts_id_seq'::regclass) NOT NULL,
  "user_id" uuid NOT NULL,
  "attempted_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "success" boolean DEFAULT false NOT NULL
);

-- /rows/0/technical_definitions/relations/68
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."bakplanla_promo_codes" (
  "code" text NOT NULL,
  "display_code" text NOT NULL,
  "email" text NOT NULL,
  "duration_days" integer,
  "note" text,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "redeemed_by" uuid,
  "redeemed_at" timestamp(6) with time zone,
  "revoked" boolean DEFAULT false NOT NULL
);

-- /rows/0/technical_definitions/relations/84
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres", "authenticated=arwd/postgres"]
CREATE TABLE "public"."bakplanla_push_tokens" (
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "token" text NOT NULL,
  "platform" text,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/83
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres", "authenticated=rd/postgres"]
CREATE TABLE "public"."bakplanla_shopping_plans" (
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "shop_date" date NOT NULL,
  "remind_at" timestamp(6) with time zone NOT NULL,
  "district" text,
  "city" text,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "delivery" text DEFAULT 'local'::text NOT NULL,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "last_message" text,
  "sent_at" timestamp(6) with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/54
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_applications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text DEFAULT 'received'::text NOT NULL,
  "message" text,
  "share_history" boolean DEFAULT false NOT NULL,
  "contact_phone" text,
  "badge_snapshot" jsonb NOT NULL,
  "decision_note" text,
  "legal_confirmed_at" timestamp(6) with time zone,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/55
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_attendance" (
  "application_id" uuid NOT NULL,
  "token_hash" text,
  "token_expires_at" timestamp(6) with time zone,
  "check_in_at" timestamp(6) with time zone,
  "check_in_method" text,
  "check_out_at" timestamp(6) with time zone,
  "check_out_method" text,
  "manual_note" text,
  "updated_by" uuid,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/59
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_audit" (
  "id" bigint DEFAULT nextval('bk_audit_id_seq'::regclass) NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "target" uuid,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/52
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_business_members" (
  "business_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'owner'::text NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/51
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_businesses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "name" text NOT NULL,
  "contact_person" text NOT NULL,
  "contact_phone" text NOT NULL,
  "contact_email" text NOT NULL,
  "address" text NOT NULL,
  "district" text NOT NULL,
  "city" text NOT NULL,
  "sector" text NOT NULL,
  "tax_number" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "status_note" text,
  "verified_at" timestamp(6) with time zone,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/62
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bk_candidates" (
  "user_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "adult_confirmed" boolean DEFAULT false NOT NULL,
  "adult_confirmed_at" timestamp(6) with time zone,
  "city" text,
  "terms_accepted_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/63
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres", "authenticated=r/postgres"]
CREATE TABLE "public"."bk_events" (
  "id" bigint DEFAULT nextval('bk_events_id_seq'::regclass) NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "ref_id" uuid NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp(6) with time zone,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/57
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_offers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "offer_type" text NOT NULL,
  "details" text NOT NULL,
  "pay_info" text NOT NULL,
  "conditions" text NOT NULL,
  "status" text DEFAULT 'sent'::text NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "responded_at" timestamp(6) with time zone
);

-- /rows/0/technical_definitions/relations/58
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "admin_note" text,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/56
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "side" text NOT NULL,
  "author_id" uuid,
  "ratings" jsonb NOT NULL,
  "comment" text,
  "hidden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/53
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]
CREATE TABLE "public"."bk_shifts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "created_by" uuid,
  "title" text NOT NULL,
  "role" text NOT NULL,
  "description" text NOT NULL,
  "shift_date" date NOT NULL,
  "start_time" time(6) without time zone NOT NULL,
  "end_time" time(6) without time zone NOT NULL,
  "capacity" integer NOT NULL,
  "pay_amount" numeric(10,2) NOT NULL,
  "pay_type" text NOT NULL,
  "payment_method" text NOT NULL,
  "payment_timing" text NOT NULL,
  "min_level" integer DEFAULT 1 NOT NULL,
  "min_age" integer DEFAULT 18 NOT NULL,
  "address" text NOT NULL,
  "district" text NOT NULL,
  "city" text NOT NULL,
  "safety_info" text NOT NULL,
  "apply_deadline" timestamp(6) with time zone NOT NULL,
  "cancel_policy" text NOT NULL,
  "legal_declared_at" timestamp(6) with time zone NOT NULL,
  "status" text DEFAULT 'pending_review'::text NOT NULL,
  "review_note" text,
  "cancel_reason" text,
  "is_demo" boolean DEFAULT false NOT NULL,
  "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);

-- /rows/0/technical_definitions/relations/44
-- Raw relation ACL: ["postgres=arwdDxtm/postgres", "service_role=Dxtm/postgres"]
CREATE TABLE "public"."rate_limit_counters" (
  "user_id" uuid NOT NULL,
  "bucket" text NOT NULL,
  "window_start" timestamp(6) with time zone NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL
);

ALTER SEQUENCE public.bakplanla_promo_attempts_id_seq OWNED BY public.bakplanla_promo_attempts.id;
ALTER SEQUENCE public.bk_audit_id_seq OWNED BY public.bk_audit.id;
ALTER SEQUENCE public.bk_events_id_seq OWNED BY public.bk_events.id;

ALTER TABLE "public"."bakplanla_ai_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_ai_usage" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_backups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_backups" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_business_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_business_requests" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_deletion_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_deletion_log" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_devices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_devices" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_entitlements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_entitlements" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_feature_trials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_feature_trials" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_coupons" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_coupons" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_offers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_offers" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_progress" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_progress" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_shifts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_isbasi_shifts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_pairings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_pairings" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_partner_codes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_partner_codes" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_partner_fails" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_partner_fails" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_partners" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_partners" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_promo_attempts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_promo_attempts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_promo_codes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_promo_codes" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_push_tokens" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_push_tokens" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_shopping_plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bakplanla_shopping_plans" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_applications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_applications" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_attendance" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_audit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_audit" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_business_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_business_members" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_businesses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_businesses" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_candidates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_candidates" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_events" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_offers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_offers" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_reports" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_reports" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_reviews" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_reviews" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_shifts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bk_shifts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."rate_limit_counters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rate_limit_counters" NO FORCE ROW LEVEL SECURITY;

-- /rows/0/technical_definitions/constraints/76
ALTER TABLE "public"."bakplanla_isbasi_shifts" ADD CONSTRAINT "bakplanla_isbasi_shifts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/97
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/136
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_status_check" CHECK ((status = ANY (ARRAY['received'::text, 'reviewing'::text, 'approved'::text, 'rejected'::text, 'cancelled_by_user'::text, 'cancelled_by_business'::text, 'completed'::text, 'no_show'::text])));

-- /rows/0/technical_definitions/constraints/137
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_message_check" CHECK (((message IS NULL) OR (char_length(message) <= 300)));

-- /rows/0/technical_definitions/constraints/138
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_contact_phone_check" CHECK (((contact_phone IS NULL) OR ((char_length(contact_phone) >= 7) AND (char_length(contact_phone) <= 20))));

-- /rows/0/technical_definitions/constraints/141
ALTER TABLE "public"."rate_limit_counters" ADD CONSTRAINT "rate_limit_counters_bucket_check" CHECK ((bucket = ANY (ARRAY['ai'::text, 'places'::text])));

-- /rows/0/technical_definitions/constraints/142
ALTER TABLE "public"."rate_limit_counters" ADD CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY (user_id, bucket, window_start);

-- /rows/0/technical_definitions/constraints/143
ALTER TABLE "public"."bakplanla_isbasi_progress" ADD CONSTRAINT "bakplanla_isbasi_progress_pkey" PRIMARY KEY (user_id);

-- /rows/0/technical_definitions/constraints/144
ALTER TABLE "public"."bakplanla_isbasi_progress" ADD CONSTRAINT "bakplanla_isbasi_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/145
ALTER TABLE "public"."bakplanla_isbasi_shifts" ADD CONSTRAINT "bakplanla_isbasi_shifts_role_check" CHECK ((role = ANY (ARRAY['barista'::text, 'cashier'::text, 'shelf'::text])));

-- /rows/0/technical_definitions/constraints/146
ALTER TABLE "public"."bakplanla_isbasi_shifts" ADD CONSTRAINT "bakplanla_isbasi_shifts_level_check" CHECK (((level >= 1) AND (level <= 10)));

-- /rows/0/technical_definitions/constraints/147
ALTER TABLE "public"."bakplanla_isbasi_shifts" ADD CONSTRAINT "bakplanla_isbasi_shifts_status_check" CHECK ((status = ANY (ARRAY['started'::text, 'claimed'::text, 'verified'::text, 'rejected'::text, 'abandoned'::text])));

-- /rows/0/technical_definitions/constraints/148
ALTER TABLE "public"."bakplanla_isbasi_shifts" ADD CONSTRAINT "bakplanla_isbasi_shifts_stars_check" CHECK (((stars >= 0) AND (stars <= 3)));

-- /rows/0/technical_definitions/constraints/149
ALTER TABLE "public"."bakplanla_isbasi_shifts" ADD CONSTRAINT "bakplanla_isbasi_shifts_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/150
ALTER TABLE "public"."bakplanla_isbasi_offers" ADD CONSTRAINT "bakplanla_isbasi_offers_valid_days_check" CHECK (((valid_days >= 1) AND (valid_days <= 365)));

-- /rows/0/technical_definitions/constraints/151
ALTER TABLE "public"."bakplanla_isbasi_offers" ADD CONSTRAINT "bakplanla_isbasi_offers_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/152
ALTER TABLE "public"."bakplanla_isbasi_coupons" ADD CONSTRAINT "bakplanla_isbasi_coupons_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/153
ALTER TABLE "public"."bakplanla_isbasi_coupons" ADD CONSTRAINT "bakplanla_isbasi_coupons_code_key" UNIQUE (code);

-- /rows/0/technical_definitions/constraints/154
ALTER TABLE "public"."bakplanla_isbasi_coupons" ADD CONSTRAINT "bakplanla_isbasi_coupons_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/155
ALTER TABLE "public"."bakplanla_isbasi_coupons" ADD CONSTRAINT "bakplanla_isbasi_coupons_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES bakplanla_isbasi_shifts(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/156
ALTER TABLE "public"."bakplanla_isbasi_coupons" ADD CONSTRAINT "bakplanla_isbasi_coupons_offer_id_fkey" FOREIGN KEY (offer_id) REFERENCES bakplanla_isbasi_offers(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/157
ALTER TABLE "public"."bk_candidates" ADD CONSTRAINT "bk_candidates_display_name_check" CHECK (((char_length(display_name) >= 2) AND (char_length(display_name) <= 40)));

-- /rows/0/technical_definitions/constraints/158
ALTER TABLE "public"."bk_candidates" ADD CONSTRAINT "bk_candidates_city_check" CHECK (((city IS NULL) OR (char_length(city) <= 60)));

-- /rows/0/technical_definitions/constraints/159
ALTER TABLE "public"."bk_candidates" ADD CONSTRAINT "bk_candidates_pkey" PRIMARY KEY (user_id);

-- /rows/0/technical_definitions/constraints/160
ALTER TABLE "public"."bk_candidates" ADD CONSTRAINT "bk_candidates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/161
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_name_check" CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)));

-- /rows/0/technical_definitions/constraints/162
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_contact_person_check" CHECK (((char_length(contact_person) >= 2) AND (char_length(contact_person) <= 60)));

-- /rows/0/technical_definitions/constraints/163
ALTER TABLE "public"."bakplanla_devices" ADD CONSTRAINT "bakplanla_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/164
ALTER TABLE "public"."bakplanla_pairings" ADD CONSTRAINT "bakplanla_pairings_pkey" PRIMARY KEY (code_hash);

-- /rows/0/technical_definitions/constraints/165
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_contact_phone_check" CHECK (((char_length(contact_phone) >= 7) AND (char_length(contact_phone) <= 20)));

-- /rows/0/technical_definitions/constraints/166
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_contact_email_check" CHECK (((char_length(contact_email) >= 5) AND (char_length(contact_email) <= 120)));

-- /rows/0/technical_definitions/constraints/167
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_address_check" CHECK (((char_length(address) >= 5) AND (char_length(address) <= 200)));

-- /rows/0/technical_definitions/constraints/168
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_district_check" CHECK (((char_length(district) >= 2) AND (char_length(district) <= 60)));

-- /rows/0/technical_definitions/constraints/169
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_city_check" CHECK (((char_length(city) >= 2) AND (char_length(city) <= 60)));

-- /rows/0/technical_definitions/constraints/170
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_sector_check" CHECK (((char_length(sector) >= 2) AND (char_length(sector) <= 60)));

-- /rows/0/technical_definitions/constraints/171
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_tax_number_check" CHECK (((tax_number IS NULL) OR (tax_number ~ '^[0-9]{10,11}$'::text)));

-- /rows/0/technical_definitions/constraints/172
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'suspended'::text])));

-- /rows/0/technical_definitions/constraints/173
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/174
ALTER TABLE "public"."bk_businesses" ADD CONSTRAINT "bk_businesses_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/175
ALTER TABLE "public"."bk_business_members" ADD CONSTRAINT "bk_business_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text])));

-- /rows/0/technical_definitions/constraints/176
ALTER TABLE "public"."bk_business_members" ADD CONSTRAINT "bk_business_members_pkey" PRIMARY KEY (business_id, user_id);

-- /rows/0/technical_definitions/constraints/177
ALTER TABLE "public"."bk_business_members" ADD CONSTRAINT "bk_business_members_business_id_fkey" FOREIGN KEY (business_id) REFERENCES bk_businesses(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/178
ALTER TABLE "public"."bk_business_members" ADD CONSTRAINT "bk_business_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/179
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_title_check" CHECK (((char_length(title) >= 3) AND (char_length(title) <= 80)));

-- /rows/0/technical_definitions/constraints/180
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_description_check" CHECK (((char_length(description) >= 10) AND (char_length(description) <= 1000)));

-- /rows/0/technical_definitions/constraints/181
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_capacity_check" CHECK (((capacity >= 1) AND (capacity <= 50)));

-- /rows/0/technical_definitions/constraints/182
ALTER TABLE "public"."bakplanla_pairings" ADD CONSTRAINT "bakplanla_pairings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/183
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_pay_amount_check" CHECK (((pay_amount > (0)::numeric) AND (pay_amount <= (100000)::numeric)));

-- /rows/0/technical_definitions/constraints/184
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_pay_type_check" CHECK ((pay_type = ANY (ARRAY['total'::text, 'hourly'::text])));

-- /rows/0/technical_definitions/constraints/185
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_payment_method_check" CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'other'::text])));

-- /rows/0/technical_definitions/constraints/186
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_payment_timing_check" CHECK (((char_length(payment_timing) >= 3) AND (char_length(payment_timing) <= 120)));

-- /rows/0/technical_definitions/constraints/187
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_min_level_check" CHECK (((min_level >= 1) AND (min_level <= 10)));

-- /rows/0/technical_definitions/constraints/188
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_min_age_check" CHECK (((min_age >= 18) AND (min_age <= 65)));

-- /rows/0/technical_definitions/constraints/189
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_address_check" CHECK (((char_length(address) >= 5) AND (char_length(address) <= 200)));

-- /rows/0/technical_definitions/constraints/191
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_district_check" CHECK (((char_length(district) >= 2) AND (char_length(district) <= 60)));

-- /rows/0/technical_definitions/constraints/192
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_city_check" CHECK (((char_length(city) >= 2) AND (char_length(city) <= 60)));

-- /rows/0/technical_definitions/constraints/193
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_safety_info_check" CHECK (((char_length(safety_info) >= 10) AND (char_length(safety_info) <= 1000)));

-- /rows/0/technical_definitions/constraints/194
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_cancel_policy_check" CHECK (((char_length(cancel_policy) >= 10) AND (char_length(cancel_policy) <= 500)));

-- /rows/0/technical_definitions/constraints/195
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_status_check" CHECK ((status = ANY (ARRAY['pending_review'::text, 'rejected'::text, 'published'::text, 'full'::text, 'cancelled'::text, 'completed'::text])));

-- /rows/0/technical_definitions/constraints/196
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_check" CHECK ((end_time > start_time));

-- /rows/0/technical_definitions/constraints/197
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/198
ALTER TABLE "public"."bk_shifts" ADD CONSTRAINT "bk_shifts_business_id_fkey" FOREIGN KEY (business_id) REFERENCES bk_businesses(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/199
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_decision_note_check" CHECK (((decision_note IS NULL) OR (char_length(decision_note) <= 300)));

-- /rows/0/technical_definitions/constraints/200
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/201
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_shift_id_user_id_key" UNIQUE (shift_id, user_id);

-- /rows/0/technical_definitions/constraints/202
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES bk_shifts(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/203
ALTER TABLE "public"."bk_applications" ADD CONSTRAINT "bk_applications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/204
ALTER TABLE "public"."bk_attendance" ADD CONSTRAINT "bk_attendance_check_in_method_check" CHECK ((check_in_method = ANY (ARRAY['qr'::text, 'manual'::text])));

-- /rows/0/technical_definitions/constraints/205
ALTER TABLE "public"."bk_attendance" ADD CONSTRAINT "bk_attendance_check_out_method_check" CHECK ((check_out_method = ANY (ARRAY['qr'::text, 'manual'::text])));

-- /rows/0/technical_definitions/constraints/206
ALTER TABLE "public"."bk_attendance" ADD CONSTRAINT "bk_attendance_pkey" PRIMARY KEY (application_id);

-- /rows/0/technical_definitions/constraints/207
ALTER TABLE "public"."bk_attendance" ADD CONSTRAINT "bk_attendance_application_id_fkey" FOREIGN KEY (application_id) REFERENCES bk_applications(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/208
ALTER TABLE "public"."bk_attendance" ADD CONSTRAINT "bk_attendance_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/209
ALTER TABLE "public"."bk_reviews" ADD CONSTRAINT "bk_reviews_side_check" CHECK ((side = ANY (ARRAY['candidate'::text, 'business'::text])));

-- /rows/0/technical_definitions/constraints/210
ALTER TABLE "public"."bk_reviews" ADD CONSTRAINT "bk_reviews_comment_check" CHECK (((comment IS NULL) OR (char_length(comment) <= 500)));

-- /rows/0/technical_definitions/constraints/211
ALTER TABLE "public"."bk_reviews" ADD CONSTRAINT "bk_reviews_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/212
ALTER TABLE "public"."bk_reviews" ADD CONSTRAINT "bk_reviews_application_id_side_key" UNIQUE (application_id, side);

-- /rows/0/technical_definitions/constraints/213
ALTER TABLE "public"."bk_reviews" ADD CONSTRAINT "bk_reviews_application_id_fkey" FOREIGN KEY (application_id) REFERENCES bk_applications(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/214
ALTER TABLE "public"."bk_reviews" ADD CONSTRAINT "bk_reviews_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/215
ALTER TABLE "public"."bakplanla_promo_codes" ADD CONSTRAINT "bakplanla_promo_codes_duration_days_check" CHECK (((duration_days IS NULL) OR (duration_days > 0)));

-- /rows/0/technical_definitions/constraints/216
ALTER TABLE "public"."bakplanla_promo_codes" ADD CONSTRAINT "bakplanla_promo_codes_pkey" PRIMARY KEY (code);

-- /rows/0/technical_definitions/constraints/217
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_offer_type_check" CHECK ((offer_type = ANY (ARRAY['interview'::text, 'part_time'::text, 'full_time'::text, 'seasonal'::text])));

-- /rows/0/technical_definitions/constraints/218
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_details_check" CHECK (((char_length(details) >= 10) AND (char_length(details) <= 1000)));

-- /rows/0/technical_definitions/constraints/219
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_pay_info_check" CHECK (((char_length(pay_info) >= 3) AND (char_length(pay_info) <= 200)));

-- /rows/0/technical_definitions/constraints/220
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_conditions_check" CHECK (((char_length(conditions) >= 3) AND (char_length(conditions) <= 500)));

-- /rows/0/technical_definitions/constraints/221
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text])));

-- /rows/0/technical_definitions/constraints/222
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/223
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_application_id_fkey" FOREIGN KEY (application_id) REFERENCES bk_applications(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/224
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_business_id_fkey" FOREIGN KEY (business_id) REFERENCES bk_businesses(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/225
ALTER TABLE "public"."bk_offers" ADD CONSTRAINT "bk_offers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/226
ALTER TABLE "public"."bk_events" ADD CONSTRAINT "bk_events_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/227
ALTER TABLE "public"."bk_events" ADD CONSTRAINT "bk_events_user_id_kind_ref_id_key" UNIQUE (user_id, kind, ref_id);

-- /rows/0/technical_definitions/constraints/228
ALTER TABLE "public"."bk_events" ADD CONSTRAINT "bk_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/229
ALTER TABLE "public"."bk_reports" ADD CONSTRAINT "bk_reports_target_type_check" CHECK ((target_type = ANY (ARRAY['shift'::text, 'business'::text, 'review'::text, 'application'::text, 'offer'::text])));

-- /rows/0/technical_definitions/constraints/230
ALTER TABLE "public"."bk_reports" ADD CONSTRAINT "bk_reports_reason_check" CHECK (((char_length(reason) >= 5) AND (char_length(reason) <= 500)));

-- /rows/0/technical_definitions/constraints/231
ALTER TABLE "public"."bk_reports" ADD CONSTRAINT "bk_reports_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'rejected'::text])));

-- /rows/0/technical_definitions/constraints/232
ALTER TABLE "public"."bk_reports" ADD CONSTRAINT "bk_reports_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/233
ALTER TABLE "public"."bk_reports" ADD CONSTRAINT "bk_reports_reporter_id_target_type_target_id_key" UNIQUE (reporter_id, target_type, target_id);

-- /rows/0/technical_definitions/constraints/234
ALTER TABLE "public"."bk_reports" ADD CONSTRAINT "bk_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/235
ALTER TABLE "public"."bk_audit" ADD CONSTRAINT "bk_audit_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/236
ALTER TABLE "public"."bakplanla_backups" ADD CONSTRAINT "bakplanla_backups_payload_size" CHECK ((octet_length((payload)::text) <= 5000000));

-- /rows/0/technical_definitions/constraints/237
ALTER TABLE "public"."bakplanla_backups" ADD CONSTRAINT "bakplanla_backups_payload_shape" CHECK (((jsonb_typeof(payload) = 'object'::text) AND (jsonb_typeof((payload -> 'tasks'::text)) = 'array'::text) AND (jsonb_typeof((payload -> 'documents'::text)) = 'array'::text)));

-- /rows/0/technical_definitions/constraints/238
ALTER TABLE "public"."bakplanla_backups" ADD CONSTRAINT "bakplanla_backups_pkey" PRIMARY KEY (user_id);

-- /rows/0/technical_definitions/constraints/239
ALTER TABLE "public"."bakplanla_backups" ADD CONSTRAINT "bakplanla_backups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/240
ALTER TABLE "public"."bakplanla_entitlements" ADD CONSTRAINT "bakplanla_entitlements_plan_check" CHECK ((plan = ANY (ARRAY['free'::text, 'pro_monthly'::text, 'pro_yearly'::text])));

-- /rows/0/technical_definitions/constraints/241
ALTER TABLE "public"."bakplanla_promo_codes" ADD CONSTRAINT "bakplanla_promo_codes_redeemed_by_fkey" FOREIGN KEY (redeemed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- /rows/0/technical_definitions/constraints/242
ALTER TABLE "public"."bakplanla_promo_attempts" ADD CONSTRAINT "bakplanla_promo_attempts_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/243
ALTER TABLE "public"."bakplanla_entitlements" ADD CONSTRAINT "bakplanla_entitlements_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'expired'::text, 'billing_issue'::text])));

-- /rows/0/technical_definitions/constraints/244
ALTER TABLE "public"."bakplanla_entitlements" ADD CONSTRAINT "bakplanla_entitlements_pkey" PRIMARY KEY (user_id);

-- /rows/0/technical_definitions/constraints/245
ALTER TABLE "public"."bakplanla_entitlements" ADD CONSTRAINT "bakplanla_entitlements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/246
ALTER TABLE "public"."bakplanla_feature_trials" ADD CONSTRAINT "bakplanla_feature_trials_feature_check" CHECK ((feature = ANY (ARRAY['documentAnalysis'::text, 'planAI'::text, 'opportunities'::text, 'today'::text, 'qr'::text])));

-- /rows/0/technical_definitions/constraints/247
ALTER TABLE "public"."bakplanla_feature_trials" ADD CONSTRAINT "bakplanla_feature_trials_used_count_check" CHECK ((used_count >= 0));

-- /rows/0/technical_definitions/constraints/248
ALTER TABLE "public"."bakplanla_feature_trials" ADD CONSTRAINT "bakplanla_feature_trials_refunds_check" CHECK ((refunds >= 0));

-- /rows/0/technical_definitions/constraints/249
ALTER TABLE "public"."bakplanla_feature_trials" ADD CONSTRAINT "bakplanla_feature_trials_pkey" PRIMARY KEY (user_id, feature);

-- /rows/0/technical_definitions/constraints/250
ALTER TABLE "public"."bakplanla_feature_trials" ADD CONSTRAINT "bakplanla_feature_trials_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/251
ALTER TABLE "public"."bakplanla_devices" ADD CONSTRAINT "bakplanla_devices_device_id_check" CHECK (((char_length(device_id) >= 4) AND (char_length(device_id) <= 64)));

-- /rows/0/technical_definitions/constraints/252
ALTER TABLE "public"."bakplanla_devices" ADD CONSTRAINT "bakplanla_devices_name_check" CHECK ((char_length(name) <= 60));

-- /rows/0/technical_definitions/constraints/253
ALTER TABLE "public"."bakplanla_devices" ADD CONSTRAINT "bakplanla_devices_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text, 'unknown'::text])));

-- /rows/0/technical_definitions/constraints/254
ALTER TABLE "public"."bakplanla_devices" ADD CONSTRAINT "bakplanla_devices_pkey" PRIMARY KEY (user_id, device_id);

-- /rows/0/technical_definitions/constraints/255
ALTER TABLE "public"."bakplanla_promo_attempts" ADD CONSTRAINT "bakplanla_promo_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/256
ALTER TABLE "public"."bakplanla_deletion_log" ADD CONSTRAINT "bakplanla_deletion_log_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/259
ALTER TABLE "public"."bakplanla_partners" ADD CONSTRAINT "bakplanla_partners_discount_percent_check" CHECK (((discount_percent >= 1) AND (discount_percent <= 100)));

-- /rows/0/technical_definitions/constraints/260
ALTER TABLE "public"."bakplanla_partners" ADD CONSTRAINT "bakplanla_partners_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/261
ALTER TABLE "public"."bakplanla_partner_codes" ADD CONSTRAINT "bakplanla_partner_codes_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/262
ALTER TABLE "public"."bakplanla_partner_codes" ADD CONSTRAINT "bakplanla_partner_codes_partner_id_user_id_day_key" UNIQUE (partner_id, user_id, day);

-- /rows/0/technical_definitions/constraints/263
ALTER TABLE "public"."bakplanla_partner_codes" ADD CONSTRAINT "bakplanla_partner_codes_partner_id_day_code_key" UNIQUE (partner_id, day, code);

-- /rows/0/technical_definitions/constraints/264
ALTER TABLE "public"."bakplanla_partner_codes" ADD CONSTRAINT "bakplanla_partner_codes_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES bakplanla_partners(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/265
ALTER TABLE "public"."bakplanla_partner_codes" ADD CONSTRAINT "bakplanla_partner_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/266
ALTER TABLE "public"."bakplanla_ai_usage" ADD CONSTRAINT "bakplanla_ai_usage_used_check" CHECK ((used >= 0));

-- /rows/0/technical_definitions/constraints/267
ALTER TABLE "public"."bakplanla_ai_usage" ADD CONSTRAINT "bakplanla_ai_usage_pkey" PRIMARY KEY (user_id, day);

-- /rows/0/technical_definitions/constraints/268
ALTER TABLE "public"."bakplanla_ai_usage" ADD CONSTRAINT "bakplanla_ai_usage_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/269
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_business_name_check" CHECK (((char_length(business_name) >= 2) AND (char_length(business_name) <= 80)));

-- /rows/0/technical_definitions/constraints/270
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_category_check" CHECK (((char_length(category) >= 2) AND (char_length(category) <= 40)));

-- /rows/0/technical_definitions/constraints/271
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_contact_name_check" CHECK (((char_length(contact_name) >= 2) AND (char_length(contact_name) <= 80)));

-- /rows/0/technical_definitions/constraints/272
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_phone_check" CHECK (((char_length(phone) >= 7) AND (char_length(phone) <= 20)));

-- /rows/0/technical_definitions/constraints/273
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_email_check" CHECK (((char_length(email) >= 5) AND (char_length(email) <= 120)));

-- /rows/0/technical_definitions/constraints/274
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_district_check" CHECK (((char_length(district) >= 2) AND (char_length(district) <= 60)));

-- /rows/0/technical_definitions/constraints/275
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_address_check" CHECK (((char_length(address) >= 5) AND (char_length(address) <= 200)));

-- /rows/0/technical_definitions/constraints/276
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_website_check" CHECK (((website IS NULL) OR (char_length(website) <= 200)));

-- /rows/0/technical_definitions/constraints/277
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_instagram_check" CHECK (((instagram IS NULL) OR (char_length(instagram) <= 60)));

-- /rows/0/technical_definitions/constraints/278
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_description_check" CHECK (((char_length(description) >= 10) AND (char_length(description) <= 500)));

-- /rows/0/technical_definitions/constraints/279
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_offer_check" CHECK (((offer IS NULL) OR (char_length(offer) <= 200)));

-- /rows/0/technical_definitions/constraints/280
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

-- /rows/0/technical_definitions/constraints/281
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_pkey" PRIMARY KEY (id);

-- /rows/0/technical_definitions/constraints/282
ALTER TABLE "public"."bakplanla_business_requests" ADD CONSTRAINT "bakplanla_business_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/283
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_district_check" CHECK (((district IS NULL) OR (char_length(district) <= 60)));

-- /rows/0/technical_definitions/constraints/284
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_city_check" CHECK (((city IS NULL) OR (char_length(city) <= 60)));

-- /rows/0/technical_definitions/constraints/285
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_items_check" CHECK (((jsonb_typeof(items) = 'array'::text) AND (jsonb_array_length(items) <= 100) AND (pg_column_size(items) <= 24000)));

-- /rows/0/technical_definitions/constraints/286
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_delivery_check" CHECK ((delivery = ANY (ARRAY['local'::text, 'push'::text])));

-- /rows/0/technical_definitions/constraints/287
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])));

-- /rows/0/technical_definitions/constraints/288
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_last_message_check" CHECK (((last_message IS NULL) OR (char_length(last_message) <= 500)));

-- /rows/0/technical_definitions/constraints/289
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_pkey" PRIMARY KEY (user_id);

-- /rows/0/technical_definitions/constraints/290
ALTER TABLE "public"."bakplanla_shopping_plans" ADD CONSTRAINT "bakplanla_shopping_plans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/constraints/291
ALTER TABLE "public"."bakplanla_push_tokens" ADD CONSTRAINT "bakplanla_push_tokens_token_check" CHECK ((token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$'::text));

-- /rows/0/technical_definitions/constraints/292
ALTER TABLE "public"."bakplanla_push_tokens" ADD CONSTRAINT "bakplanla_push_tokens_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])));

-- /rows/0/technical_definitions/constraints/293
ALTER TABLE "public"."bakplanla_push_tokens" ADD CONSTRAINT "bakplanla_push_tokens_pkey" PRIMARY KEY (user_id, token);

-- /rows/0/technical_definitions/constraints/294
ALTER TABLE "public"."bakplanla_push_tokens" ADD CONSTRAINT "bakplanla_push_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- /rows/0/technical_definitions/indexes/142
CREATE INDEX bakplanla_isbasi_shifts_user_started ON public.bakplanla_isbasi_shifts USING btree (user_id, started_at DESC);

-- /rows/0/technical_definitions/indexes/143
CREATE INDEX bakplanla_isbasi_shifts_badge ON public.bakplanla_isbasi_shifts USING btree (user_id, role, level) WHERE (status = 'verified'::text);

-- /rows/0/technical_definitions/indexes/147
CREATE INDEX bakplanla_isbasi_coupons_user ON public.bakplanla_isbasi_coupons USING btree (user_id, issued_at DESC);

-- /rows/0/technical_definitions/indexes/152
CREATE INDEX bk_businesses_owner ON public.bk_businesses USING btree (owner_id);

-- /rows/0/technical_definitions/indexes/154
CREATE INDEX bk_business_members_user ON public.bk_business_members USING btree (user_id);

-- /rows/0/technical_definitions/indexes/156
CREATE INDEX bk_shifts_list ON public.bk_shifts USING btree (status, shift_date);

-- /rows/0/technical_definitions/indexes/157
CREATE INDEX bk_shifts_business ON public.bk_shifts USING btree (business_id, shift_date DESC);

-- /rows/0/technical_definitions/indexes/160
CREATE INDEX bk_applications_user ON public.bk_applications USING btree (user_id, created_at DESC);

-- /rows/0/technical_definitions/indexes/161
CREATE INDEX bk_applications_shift ON public.bk_applications USING btree (shift_id, status);

-- /rows/0/technical_definitions/indexes/166
CREATE UNIQUE INDEX bk_offers_one_open ON public.bk_offers USING btree (application_id) WHERE (status = 'sent'::text);

-- /rows/0/technical_definitions/indexes/173
CREATE INDEX bk_events_user ON public.bk_events USING btree (user_id, created_at DESC);

-- /rows/0/technical_definitions/indexes/181
CREATE INDEX bakplanla_promo_attempts_user_time ON public.bakplanla_promo_attempts USING btree (user_id, attempted_at);

-- /rows/0/technical_definitions/indexes/192
CREATE INDEX bakplanla_business_requests_user_idx ON public.bakplanla_business_requests USING btree (user_id, created_at DESC);

-- /rows/0/technical_definitions/indexes/193
CREATE INDEX bakplanla_business_requests_status_idx ON public.bakplanla_business_requests USING btree (status);

-- /rows/0/technical_definitions/indexes/194
CREATE INDEX bakplanla_partner_fails_idx ON public.bakplanla_partner_fails USING btree (partner_id, at);

-- /rows/0/technical_definitions/indexes/195
CREATE INDEX bakplanla_partner_fails_lookup ON public.bakplanla_partner_fails USING btree (partner_id, kind, at);

-- /rows/0/technical_definitions/indexes/197
CREATE INDEX bakplanla_shopping_plans_due_idx ON public.bakplanla_shopping_plans USING btree (remind_at) WHERE (status = 'scheduled'::text);

-- Public non-extension routines. Body is exact pg_get_functiondef output, no summarization.

-- /rows/0/technical_definitions/functions/0
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_admin_hide_review(p_review_id uuid, p_hidden boolean DEFAULT true)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update bk_reviews set hidden = p_hidden where id = p_review_id;
  insert into bk_audit (action, target, detail) values ('admin_hide_review', p_review_id, jsonb_build_object('hidden', p_hidden));
$function$;

ALTER FUNCTION "public"."bk_admin_hide_review"(p_review_id uuid, p_hidden boolean) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/1
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_admin_resolve_report(p_report_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_status not in ('reviewing', 'resolved', 'rejected') then perform public.bk_err('invalid:status'); end if;
  update bk_reports set status = p_status, admin_note = p_note where id = p_report_id;
  insert into bk_audit (action, target, detail) values ('admin_report_' || p_status, p_report_id, jsonb_build_object('note', p_note));
end $function$;

ALTER FUNCTION "public"."bk_admin_resolve_report"(p_report_id uuid, p_status text, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/2
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_roles()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ select array['barista', 'cashier', 'shelf']::text[] $function$;

ALTER FUNCTION "public"."bk_roles"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/3
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_save_candidate(p_display_name text, p_adult_confirmed boolean, p_city text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); v_name text := btrim(coalesce(p_display_name, '')); v_city text := nullif(btrim(coalesce(p_city, '')), '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 40 then perform public.bk_err('invalid:display_name'); end if;
  if v_city is not null and char_length(v_city) > 60 then perform public.bk_err('invalid:city'); end if;
  if coalesce(p_adult_confirmed, false) is not true then perform public.bk_err('not_adult'); end if;
  insert into bk_candidates (user_id, display_name, adult_confirmed, adult_confirmed_at, city)
    values (v_uid, v_name, true, now(), v_city)
  on conflict (user_id) do update set display_name = excluded.display_name, city = excluded.city,
    adult_confirmed = true, adult_confirmed_at = coalesce(bk_candidates.adult_confirmed_at, now()), updated_at = now();
  return (select to_jsonb(c) - 'user_id' from bk_candidates c where c.user_id = v_uid);
end $function$;

ALTER FUNCTION "public"."bk_save_candidate"(p_display_name text, p_adult_confirmed boolean, p_city text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/4
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_seats_taken(p_shift uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from bk_applications where shift_id = p_shift and status in ('approved', 'completed')
$function$;

ALTER FUNCTION "public"."bk_seats_taken"(p_shift uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/5
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_respond_offer(p_offer_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); o bk_offers;
begin
  select * into o from bk_offers where id = p_offer_id and user_id = v_uid for update;
  if not found then perform public.bk_err('not_found'); end if;
  if o.status <> 'sent' then perform public.bk_err('bad_transition'); end if;
  update bk_offers set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now() where id = o.id;
  perform public.bk_notify_business(o.business_id, 'offer_answered', o.id, jsonb_build_object('accepted', p_accept));
  perform public.bk_audit_log(v_uid, 'offer_' || case when p_accept then 'accept' else 'decline' end, o.id);
  return jsonb_build_object('id', o.id, 'status', case when p_accept then 'accepted' else 'declined' end);
end $function$;

ALTER FUNCTION "public"."bk_respond_offer"(p_offer_id uuid, p_accept boolean) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/6
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_uid()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v uuid := auth.uid();
begin
  if v is null then perform public.bk_err('not_signed_in'); end if;
  return v;
end $function$;

ALTER FUNCTION "public"."bk_uid"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/7
-- Raw function ACL: null
-- Owner: postgres; config: ["search_path=pg_catalog"]
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

-- NULL proacl: built-in default includes PUBLIC EXECUTE; no explicit ACL array exported.

-- /rows/0/technical_definitions/functions/8
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                      DECLARE
                                          v_window TIMESTAMPTZ;
                                              v_count INTEGER;
                                              BEGIN
                                                  IF p_user IS NULL
                                                         OR p_bucket NOT IN ('ai', 'places')
                                                                OR p_limit < 1
                                                                       OR p_window_seconds < 1 THEN
                                                                               RETURN FALSE;
                                                                                   END IF;

                                                                                       v_window := to_timestamp(
                                                                                               floor(extract(epoch FROM clock_timestamp()) / p_window_seconds)
                                                                                                       * p_window_seconds
                                                                                                           );

                                                                                                               INSERT INTO public.rate_limit_counters
                                                                                                                       (user_id, bucket, window_start, request_count)
                                                                                                                           VALUES
                                                                                                                                   (p_user, p_bucket, v_window, 1)
                                                                                                                                       ON CONFLICT (user_id, bucket, window_start)
                                                                                                                                           DO UPDATE SET request_count =
                                                                                                                                                   public.rate_limit_counters.request_count + 1
                                                                                                                                                       WHERE public.rate_limit_counters.request_count < p_limit
                                                                                                                                                           RETURNING request_count INTO v_count;

                                                                                                                                                               RETURN FOUND;
                                                                                                                                                               END;
                                                                                                                                                               $function$;

ALTER FUNCTION "public"."check_rate_limit"(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/9
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_get_shift(p_shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); s bk_shifts;
begin
  select * into s from bk_shifts where id = p_shift_id;
  if not found then perform public.bk_err('not_found'); end if;
  if s.status not in ('published', 'full', 'cancelled', 'completed')
     and not public.bk_is_member(s.business_id, v_uid) then
    perform public.bk_err('not_found');
  end if;
  return public.bk_shift_public(s, v_uid);
end $function$;

ALTER FUNCTION "public"."bk_get_shift"(p_shift_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/10
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.isbasi_commit(p_user_id uuid, p_shift_id uuid, p_old_version integer, p_progress jsonb, p_score integer, p_max_score integer, p_stars integer, p_coupon jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows integer;
  v_coupon public.bakplanla_isbasi_coupons;
begin
  -- Vardiya bu kullanıcıya ait ve "claimed" olmalı
  perform 1 from bakplanla_isbasi_shifts
    where id = p_shift_id and user_id = p_user_id and status = 'claimed' for update;
  if not found then
    return jsonb_build_object('ok', false, 'conflict', 'shift');
  end if;

  if p_old_version is null then
    insert into bakplanla_isbasi_progress (user_id, data, version, updated_at)
      values (p_user_id, p_progress, 1, now())
      on conflict (user_id) do nothing;
    get diagnostics v_rows = row_count;
  else
    update bakplanla_isbasi_progress
       set data = p_progress, version = version + 1, updated_at = now()
     where user_id = p_user_id and version = p_old_version;
    get diagnostics v_rows = row_count;
  end if;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'conflict', 'progress');
  end if;

  if p_coupon is not null then
    begin
      insert into bakplanla_isbasi_coupons
        (user_id, shift_id, code, venue, offer_id, is_demo, partner_name, title_tr, title_en, title_de, expires_at)
      values
        (p_user_id, p_shift_id, p_coupon->>'code', p_coupon->>'venue', nullif(p_coupon->>'offer_id', '')::uuid,
         coalesce((p_coupon->>'is_demo')::boolean, true), p_coupon->>'partner_name',
         p_coupon->>'title_tr', p_coupon->>'title_en', p_coupon->>'title_de', (p_coupon->>'expires_at')::timestamptz)
      returning * into v_coupon;
    exception when unique_violation then
      raise exception 'coupon_code_conflict' using errcode = 'P0001';
    end;
  end if;

  update bakplanla_isbasi_shifts
     set status = 'verified', score = p_score, max_score = p_max_score, stars = p_stars, finished_at = now()
   where id = p_shift_id;

  return jsonb_build_object('ok', true, 'coupon', case when v_coupon.id is null then null else to_jsonb(v_coupon) end);
exception when raise_exception then
  if sqlerrm = 'coupon_code_conflict' then
    return jsonb_build_object('ok', false, 'conflict', 'code');
  end if;
  raise;
end $function$;

ALTER FUNCTION "public"."isbasi_commit"(p_user_id uuid, p_shift_id uuid, p_old_version integer, p_progress jsonb, p_score integer, p_max_score integer, p_stars integer, p_coupon jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/11
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.isbasi_claim_shift(p_shift_id uuid, p_user_id uuid)
 RETURNS SETOF bakplanla_isbasi_shifts
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update bakplanla_isbasi_shifts set status = 'claimed'
   where id = p_shift_id and user_id = p_user_id and status = 'started'
  returning *;
$function$;

ALTER FUNCTION "public"."isbasi_claim_shift"(p_shift_id uuid, p_user_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/12
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_admin_review_shift(p_shift_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s bk_shifts;
begin
  select * into s from bk_shifts where id = p_shift_id for update;
  if not found then perform public.bk_err('not_found'); end if;
  if s.status <> 'pending_review' then perform public.bk_err('bad_transition'); end if;
  if p_approve and not exists (select 1 from bk_businesses where id = s.business_id and status = 'verified') then
    perform public.bk_err('business_not_verified');
  end if;
  update bk_shifts set status = case when p_approve then 'published' else 'rejected' end, review_note = p_note, updated_at = now()
   where id = s.id;
  perform public.bk_notify_business(s.business_id, case when p_approve then 'shift_published' else 'shift_rejected' end, s.id,
                                    jsonb_build_object('shift_title', s.title, 'note', p_note));
  perform public.bk_audit_log(null, case when p_approve then 'admin_publish_shift' else 'admin_reject_shift' end, s.id);
  return jsonb_build_object('id', s.id, 'status', case when p_approve then 'published' else 'rejected' end);
end $function$;

ALTER FUNCTION "public"."bk_admin_review_shift"(p_shift_id uuid, p_approve boolean, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/13
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_audit_log(p_actor uuid, p_action text, p_target uuid, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into bk_audit (actor_id, action, target, detail) values (p_actor, p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$function$;

ALTER FUNCTION "public"."bk_audit_log"(p_actor uuid, p_action text, p_target uuid, p_detail jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/14
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_badge_level(p_user uuid, p_role text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(max(level), 0)::int from bakplanla_isbasi_shifts
   where user_id = p_user and role = p_role and status = 'verified' and stars >= 2
$function$;

ALTER FUNCTION "public"."bk_badge_level"(p_user uuid, p_role text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/15
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_badges_of(p_user uuid)
 RETURNS TABLE(role text, best_level integer, verified_shifts integer, best_stars integer, first_at timestamp with time zone, last_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.role, max(s.level)::int, count(*)::int, max(s.stars)::int, min(s.finished_at), max(s.finished_at)
    from bakplanla_isbasi_shifts s
   where s.user_id = p_user and s.status = 'verified' and s.stars >= 2
   group by s.role
$function$;

ALTER FUNCTION "public"."bk_badges_of"(p_user uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/16
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_err(p_code text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$ begin raise exception 'bk:%', p_code using errcode = 'P0001'; end $function$;

ALTER FUNCTION "public"."bk_err"(p_code text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/17
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_is_member(p_business uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from bk_business_members where business_id = p_business and user_id = p_user)
$function$;

ALTER FUNCTION "public"."bk_is_member"(p_business uuid, p_user uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/18
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_role_max_level(p_role text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$ select case when p_role = any(public.bk_roles()) then 4 else 0 end $function$;

ALTER FUNCTION "public"."bk_role_max_level"(p_role text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/19
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_notify(p_user uuid, p_kind text, p_ref uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into bk_events (user_id, kind, ref_id, data) values (p_user, p_kind, p_ref, coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, kind, ref_id) do nothing
$function$;

ALTER FUNCTION "public"."bk_notify"(p_user uuid, p_kind text, p_ref uuid, p_data jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/20
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_notify_business(p_business uuid, p_kind text, p_ref uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into bk_events (user_id, kind, ref_id, data)
  select m.user_id, p_kind, p_ref, coalesce(p_data, '{}'::jsonb) from bk_business_members m where m.business_id = p_business
  on conflict (user_id, kind, ref_id) do nothing
$function$;

ALTER FUNCTION "public"."bk_notify_business"(p_business uuid, p_kind text, p_ref uuid, p_data jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/21
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_num(p jsonb, k text, mn numeric, mx numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare v numeric;
begin
  begin v := (p ->> k)::numeric; exception when others then v := null; end;
  if v is null or v < mn or v > mx then perform public.bk_err('invalid:' || k); end if;
  return v;
end $function$;

ALTER FUNCTION "public"."bk_num"(p jsonb, k text, mn numeric, mx numeric) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/22
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_shift_end(p_shift bk_shifts)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
AS $function$ select ((p_shift.shift_date + p_shift.end_time) at time zone 'Europe/Istanbul') $function$;

ALTER FUNCTION "public"."bk_shift_end"(p_shift bk_shifts) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/23
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_shift_fields(p jsonb)
 RETURNS bk_shifts
 LANGUAGE plpgsql
 STABLE
AS $function$
declare r public.bk_shifts; v_start timestamptz;
begin
  r.title := public.bk_txt(p, 'title', 3, 80);
  r.role := public.bk_txt(p, 'role', 2, 30);
  if not (r.role = any(public.bk_roles())) then perform public.bk_err('invalid:role'); end if;
  r.description := public.bk_txt(p, 'description', 10, 1000);
  begin r.shift_date := (p ->> 'shift_date')::date; exception when others then perform public.bk_err('invalid:shift_date'); end;
  if r.shift_date is null or r.shift_date < public.bk_today() or r.shift_date > public.bk_today() + 120 then perform public.bk_err('invalid:shift_date'); end if;
  begin r.start_time := (p ->> 'start_time')::time; exception when others then perform public.bk_err('invalid:start_time'); end;
  begin r.end_time := (p ->> 'end_time')::time; exception when others then perform public.bk_err('invalid:end_time'); end;
  if r.start_time is null then perform public.bk_err('invalid:start_time'); end if;
  if r.end_time is null or r.end_time <= r.start_time or r.end_time - r.start_time > interval '12 hours' then perform public.bk_err('invalid:end_time'); end if;
  r.capacity := public.bk_num(p, 'capacity', 1, 50)::int;
  r.pay_amount := round(public.bk_num(p, 'pay_amount', 1, 100000), 2);
  r.pay_type := public.bk_txt(p, 'pay_type', 4, 10);
  if r.pay_type not in ('total', 'hourly') then perform public.bk_err('invalid:pay_type'); end if;
  r.payment_method := public.bk_txt(p, 'payment_method', 4, 20);
  if r.payment_method not in ('cash', 'bank_transfer', 'other') then perform public.bk_err('invalid:payment_method'); end if;
  r.payment_timing := public.bk_txt(p, 'payment_timing', 3, 120);
  r.min_level := public.bk_num(p, 'min_level', 1, public.bk_role_max_level(r.role))::int;
  r.min_age := coalesce(nullif(p ->> 'min_age', '')::int, 18);
  if r.min_age < 18 or r.min_age > 65 then perform public.bk_err('invalid:min_age'); end if;
  r.address := public.bk_txt(p, 'address', 5, 200);
  r.district := public.bk_txt(p, 'district', 2, 60);
  r.city := public.bk_txt(p, 'city', 2, 60);
  r.safety_info := public.bk_txt(p, 'safety_info', 10, 1000);
  r.cancel_policy := public.bk_txt(p, 'cancel_policy', 10, 500);
  v_start := ((r.shift_date + r.start_time) at time zone 'Europe/Istanbul');
  if v_start <= now() + interval '2 hours' then perform public.bk_err('invalid:start_time'); end if;
  begin r.apply_deadline := (p ->> 'apply_deadline')::timestamptz; exception when others then perform public.bk_err('invalid:apply_deadline'); end;
  if r.apply_deadline is null then r.apply_deadline := v_start - interval '2 hours'; end if;
  if r.apply_deadline <= now() or r.apply_deadline > v_start then perform public.bk_err('invalid:apply_deadline'); end if;
  if coalesce((p ->> 'legal_declared')::boolean, false) is not true then perform public.bk_err('legal_declaration_required'); end if;
  return r;
end $function$;

ALTER FUNCTION "public"."bk_shift_fields"(p jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/24
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_shift_public(p_shift bk_shifts, p_uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', p_shift.id, 'title', p_shift.title, 'role', p_shift.role, 'description', p_shift.description,
    'shift_date', p_shift.shift_date, 'start_time', to_char(p_shift.start_time, 'HH24:MI'), 'end_time', to_char(p_shift.end_time, 'HH24:MI'),
    'duration_minutes', (extract(epoch from (p_shift.end_time - p_shift.start_time)) / 60)::int,
    'capacity', p_shift.capacity, 'seats_taken', public.bk_seats_taken(p_shift.id),
    'pay_amount', p_shift.pay_amount, 'pay_type', p_shift.pay_type, 'payment_method', p_shift.payment_method,
    'payment_timing', p_shift.payment_timing, 'min_level', p_shift.min_level, 'min_age', p_shift.min_age,
    'address', p_shift.address, 'district', p_shift.district, 'city', p_shift.city,
    'safety_info', p_shift.safety_info, 'apply_deadline', p_shift.apply_deadline, 'cancel_policy', p_shift.cancel_policy,
    'status', p_shift.status, 'is_demo', p_shift.is_demo,
    'business', (select jsonb_build_object('id', b.id, 'name', b.name, 'verified', b.status = 'verified', 'sector', b.sector)
                   from bk_businesses b where b.id = p_shift.business_id),
    'my_badge_level', public.bk_badge_level(p_uid, p_shift.role),
    'my_application', (select jsonb_build_object('id', a.id, 'status', a.status) from bk_applications a
                        where a.shift_id = p_shift.id and a.user_id = p_uid)
  )
$function$;

ALTER FUNCTION "public"."bk_shift_public"(p_shift bk_shifts, p_uid uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/25
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_shift_start(p_shift bk_shifts)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
AS $function$ select ((p_shift.shift_date + p_shift.start_time) at time zone 'Europe/Istanbul') $function$;

ALTER FUNCTION "public"."bk_shift_start"(p_shift bk_shifts) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/26
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_today()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$ select (now() at time zone 'Europe/Istanbul')::date $function$;

ALTER FUNCTION "public"."bk_today"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/27
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_get_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  return jsonb_build_object(
    'candidate', (select to_jsonb(c) - 'user_id' from bk_candidates c where c.user_id = v_uid),
    'badges', coalesce((select jsonb_agg(to_jsonb(b) order by b.role) from public.bk_badges_of(v_uid) b), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'status', b.status, 'status_note', b.status_note, 'member_role', m.role) order by b.created_at)
        from bk_business_members m join bk_businesses b on b.id = m.business_id where m.user_id = v_uid), '[]'::jsonb),
    'unread', (select count(*) from bk_events e where e.user_id = v_uid and e.read_at is null)
  );
end $function$;

ALTER FUNCTION "public"."bk_get_me"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/28
-- Raw function ACL: null
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.bakplanla_backups_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "public"."bakplanla_backups_touch"() OWNER TO "postgres";

-- NULL proacl: built-in default includes PUBLIC EXECUTE; no explicit ACL array exported.

-- /rows/0/technical_definitions/functions/29
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.refund_feature_trial(p_feature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.bakplanla_feature_trials t
     set used_count = greatest(t.used_count - 1, 0),
         refunds = t.refunds + 1
   where t.user_id = v_uid
     and t.feature = p_feature
     and t.used_count > 0
     and t.last_used_at > now() - interval '10 minutes'
     and t.refunds < 5;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('refunded', v_rows = 1);
end;
$function$;

ALTER FUNCTION "public"."refund_feature_trial"(p_feature text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/30
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.consume_feature_trial(p_feature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_feature is null or p_feature not in ('documentAnalysis', 'planAI', 'opportunities', 'today', 'qr') then
    raise exception 'unknown feature' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.bakplanla_entitlements e
    where e.user_id = v_uid
      and e.plan in ('pro_monthly', 'pro_yearly')
      and e.status in ('active', 'canceled')
      and ((e.current_period_end is null and e.status = 'active') or e.current_period_end > now())
  ) then
    return jsonb_build_object('allowed', true, 'pro', true);
  end if;

  insert into public.bakplanla_feature_trials as t (user_id, feature, used_count, first_used_at, last_used_at)
  values (v_uid, p_feature, 1, now(), now())
  on conflict (user_id, feature) do update
    set used_count = t.used_count + 1,
        last_used_at = now()
    where t.used_count < 1;  -- ücretsiz hak sınırı: özellik başına 1
  get diagnostics v_rows = row_count;

  return jsonb_build_object('allowed', v_rows = 1, 'pro', false);
end;
$function$;

ALTER FUNCTION "public"."consume_feature_trial"(p_feature text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/31
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.create_pairing_code()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_expires timestamptz := now() + interval '5 minutes';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- karışan harfler (I, O, 0, 1) yok
  i integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Eski/kullanılmış kayıtları temizle (tablo büyümesin).
  delete from public.bakplanla_pairings where expires_at < now() - interval '1 day';
  -- Aynı anda birden çok açık kod tutulmaz.
  delete from public.bakplanla_pairings where user_id = v_uid and used_at is null;

  v_code := '';
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;

  insert into public.bakplanla_pairings (code_hash, user_id, expires_at)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_uid, v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$function$;

ALTER FUNCTION "public"."create_pairing_code"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/32
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.redeem_pairing_code(p_code text, p_device_id text, p_name text, p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.bakplanla_pairings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_device_id is null or char_length(p_device_id) not between 4 and 64 then
    raise exception 'invalid device' using errcode = '22023';
  end if;

  select * into v_row
    from public.bakplanla_pairings
   where code_hash = encode(sha256(convert_to(upper(coalesce(p_code, '')), 'UTF8')), 'hex')
   for update;

  if not found then
    return jsonb_build_object('paired', false, 'reason', 'unknown');
  end if;
  if v_row.used_at is not null then
    return jsonb_build_object('paired', false, 'reason', 'used');
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('paired', false, 'reason', 'expired');
  end if;
  -- Kodu üreten hesapla tarayan hesap aynı olmalıdır: QR oturum aktarmaz.
  if v_row.user_id <> v_uid then
    return jsonb_build_object('paired', false, 'reason', 'self');
  end if;

  update public.bakplanla_pairings set used_at = now() where code_hash = v_row.code_hash;

  insert into public.bakplanla_devices (user_id, device_id, name, platform, last_seen_at)
  values (
    v_uid,
    p_device_id,
    coalesce(nullif(left(coalesce(p_name, ''), 60), ''), 'Cihaz'),
    case when p_platform in ('ios', 'android', 'web') then p_platform else 'unknown' end,
    now()
  )
  on conflict (user_id, device_id) do update
    set name = excluded.name, platform = excluded.platform, last_seen_at = now();

  return jsonb_build_object('paired', true);
end;
$function$;

ALTER FUNCTION "public"."redeem_pairing_code"(p_code text, p_device_id text, p_name text, p_platform text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/33
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_submit_review(p_application_id uuid, p_side text, p_ratings jsonb, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts; v_id uuid; v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into a from bk_applications where id = p_application_id;
  if not found then perform public.bk_err('not_found'); end if;
  select * into s from bk_shifts where id = a.shift_id;
  if p_side = 'candidate' then
    if a.user_id <> v_uid then perform public.bk_err('not_found'); end if;
  elsif p_side = 'business' then
    if not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  else
    perform public.bk_err('invalid:side');
  end if;
  if a.status <> 'completed' then perform public.bk_err('not_completed'); end if;
  if not public.bk_valid_ratings(p_side, p_ratings) then perform public.bk_err('invalid:ratings'); end if;
  if v_comment is not null and char_length(v_comment) > 500 then perform public.bk_err('invalid:comment'); end if;
  begin
    insert into bk_reviews (application_id, side, author_id, ratings, comment)
      values (a.id, p_side, v_uid, p_ratings, v_comment) returning id into v_id;
  exception when unique_violation then
    perform public.bk_err('review_exists');
  end;
  if p_side = 'business' then
    perform public.bk_notify(a.user_id, 'review_received', a.id, jsonb_build_object('shift_title', s.title));
  else
    perform public.bk_notify_business(s.business_id, 'review_received', a.id, jsonb_build_object('shift_title', s.title));
  end if;
  perform public.bk_audit_log(v_uid, 'review_' || p_side, a.id);
  return jsonb_build_object('id', v_id);
end $function$;

ALTER FUNCTION "public"."bk_submit_review"(p_application_id uuid, p_side text, p_ratings jsonb, p_comment text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/34
-- Raw function ACL: ["postgres=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.create_promo_code(p_email text, p_days integer, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_raw   text;
  v_disp  text;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'geçersiz e-posta: %', p_email;
  end if;
  if p_days is not null and p_days <= 0 then
    raise exception 'süre 0''dan büyük olmalı (süresiz için null yazın)';
  end if;

  loop
    v_raw  := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_disp := 'BAK-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
    begin
      insert into public.bakplanla_promo_codes (code, display_code, email, duration_days, note)
      values ('BAK' || v_raw, v_disp, v_email, p_days, p_note);
      exit;
    exception when unique_violation then
      -- çok düşük ihtimal: aynı kod çıktı, yeniden üret
    end;
  end loop;

  return v_disp;
end;
$function$;

ALTER FUNCTION "public"."create_promo_code"(p_email text, p_days integer, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/35
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_transition_ok(p_from text, p_to text, p_actor text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_actor = 'candidate' then p_to = 'cancelled_by_user' and p_from in ('received', 'reviewing', 'approved')
    when p_actor = 'business'  then
         (p_from = 'received'  and p_to in ('reviewing', 'approved', 'rejected'))
      or (p_from = 'reviewing' and p_to in ('approved', 'rejected'))
      or (p_from = 'approved'  and p_to in ('cancelled_by_business', 'no_show'))
    when p_actor = 'system'    then p_from = 'approved' and p_to = 'completed'
    else false end
$function$;

ALTER FUNCTION "public"."bk_transition_ok"(p_from text, p_to text, p_actor text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/36
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_code      text;
  v_email     text;
  v_confirmed timestamptz;
  v_promo     public.bakplanla_promo_codes%rowtype;
  v_ent       public.bakplanla_entitlements%rowtype;
  v_has_ent   boolean := false;
  v_active    boolean := false;
  v_plan      text;
  v_until     timestamptz;
  v_fails     integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*) into v_fails
    from public.bakplanla_promo_attempts a
   where a.user_id = v_uid and a.success = false
     and a.attempted_at > now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
    from auth.users u where u.id = v_uid;

  select * into v_promo from public.bakplanla_promo_codes c
   where c.code = v_code
   for update;

  if not found or v_promo.revoked then
    insert into public.bakplanla_promo_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_promo.redeemed_by = v_uid then
    select * into v_ent from public.bakplanla_entitlements e where e.user_id = v_uid;
    return jsonb_build_object('ok', true, 'already', true, 'until', v_ent.current_period_end);
  end if;

  if v_promo.redeemed_by is not null then
    insert into public.bakplanla_promo_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'used');
  end if;

  if v_email is null or v_email <> lower(v_promo.email) then
    insert into public.bakplanla_promo_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  if v_confirmed is null then
    return jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  end if;

  -- mevcut Pro durumu (consume_feature_trial ile aynı kural)
  select * into v_ent from public.bakplanla_entitlements e where e.user_id = v_uid for update;
  v_has_ent := found;
  if v_has_ent then
    v_active := v_ent.plan in ('pro_monthly', 'pro_yearly')
            and v_ent.status in ('active', 'canceled')
            and ((v_ent.current_period_end is null and v_ent.status = 'active')
                 or v_ent.current_period_end > now());
  end if;

  if v_active and v_ent.current_period_end is null then
    -- zaten süresiz Pro: dokunma
    v_plan  := v_ent.plan;
    v_until := null;
  elsif v_promo.duration_days is null then
    v_plan  := case when v_active then v_ent.plan else 'pro_yearly' end;
    v_until := null;
  else
    v_plan  := case when v_active then v_ent.plan
                    when v_promo.duration_days > 31 then 'pro_yearly'
                    else 'pro_monthly' end;
    v_until := (case when v_active then greatest(v_ent.current_period_end, now()) else now() end)
               + make_interval(days => v_promo.duration_days);
  end if;

  insert into public.bakplanla_entitlements as e
         (user_id, plan, status, current_period_end, auto_renew, source, updated_at)
  values (v_uid, v_plan, 'active', v_until, false, 'promo', now())
  on conflict (user_id) do update
     set plan = excluded.plan,
         status = 'active',
         current_period_end = excluded.current_period_end,
         auto_renew = case when v_active then e.auto_renew else false end,
         source = case when v_active then e.source else 'promo' end,
         updated_at = now();

  update public.bakplanla_promo_codes c
     set redeemed_by = v_uid, redeemed_at = now()
   where c.code = v_code;

  insert into public.bakplanla_promo_attempts (user_id, success) values (v_uid, true);

  return jsonb_build_object('ok', true, 'until', v_until);
end;
$function$;

ALTER FUNCTION "public"."redeem_promo_code"(p_code text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/37
-- Raw function ACL: ["postgres=X/postgres"]
-- Owner: postgres; config: ["search_path=\"\""]
CREATE OR REPLACE FUNCTION public.create_custom_promo_code(p_code text, p_email text, p_days integer, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_code  text;
begin
  v_code := upper(regexp_replace(
              translate(coalesce(p_code, ''), 'İıŞşĞğÇçÖöÜü', 'IISSGGCCOOUU'),
              '[^A-Za-z0-9]', '', 'g'));

  if length(v_code) < 4 or length(v_code) > 20 then
    raise exception 'kod 4-20 harf/rakam olmalı (şu an: %)', v_code;
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'geçersiz e-posta: %', p_email;
  end if;
  if p_days is not null and p_days <= 0 then
    raise exception 'süre 0''dan büyük olmalı (süresiz için null yazın)';
  end if;
  if exists (select 1 from public.bakplanla_promo_codes c where c.code = v_code) then
    raise exception 'bu kod zaten var: % — başka bir kod seç', v_code;
  end if;

  insert into public.bakplanla_promo_codes (code, display_code, email, duration_days, note)
  values (v_code, v_code, v_email, p_days, p_note);

  return v_code;
end;
$function$;

ALTER FUNCTION "public"."create_custom_promo_code"(p_code text, p_email text, p_days integer, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/38
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_report(p_target_type text, p_target_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); v_id uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_target_type not in ('shift', 'business', 'review', 'application', 'offer') then perform public.bk_err('invalid:target_type'); end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then perform public.bk_err('invalid:reason'); end if;
  if (select count(*) from bk_reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    perform public.bk_err('rate_limited');
  end if;
  insert into bk_reports (reporter_id, target_type, target_id, reason) values (v_uid, p_target_type, p_target_id, v_reason)
  on conflict (reporter_id, target_type, target_id) do nothing returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', v_id is null);
end $function$;

ALTER FUNCTION "public"."bk_report"(p_target_type text, p_target_id uuid, p_reason text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/39
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public, pg_temp"]
CREATE OR REPLACE FUNCTION public.bakplanla__delete_where(p_rel regclass, p_cond text, p_depth integer DEFAULT 0)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  fk record;
  child_cols text;
  parent_cols text;
  n bigint := 0;
  total bigint := 0;
begin
  if p_depth > 8 then
    raise exception 'bakplanla__delete_where: zincir cok derin (%).', p_rel;
  end if;
  for fk in
    select c.conrelid::regclass as child, c.conkey, c.confkey
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = p_rel
      and c.confdeltype in ('a', 'r')
      and c.conrelid <> p_rel
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord) into child_cols
    from unnest(fk.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = fk.child and a.attnum = k.attnum;
    select string_agg(quote_ident(a.attname), ', ' order by k.ord) into parent_cols
    from unnest(fk.confkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = p_rel and a.attnum = k.attnum;
    total := total + public.bakplanla__delete_where(
      fk.child,
      format('(%s) in (select %s from %s where %s)', child_cols, parent_cols, p_rel, p_cond),
      p_depth + 1
    );
  end loop;
  execute format('delete from %s where %s', p_rel, p_cond);
  get diagnostics n = row_count;
  return total + n;
end;
$function$;

ALTER FUNCTION "public"."bakplanla__delete_where"(p_rel regclass, p_cond text, p_depth integer) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/40
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public, pg_temp"]
CREATE OR REPLACE FUNCTION public.bakplanla_delete_user_data(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t record;
  n bigint;
  total bigint := 0;
  details jsonb := '{}'::jsonb;
  errors jsonb := '{}'::jsonb;
begin
  if p_user is null then
    raise exception 'p_user bos olamaz';
  end if;
  for t in
    select distinct c.conrelid::regclass as rel, a.attname::text as col, 'uuid' as typ
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace ns on ns.oid = r.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and ns.nspname = 'public'
      and array_length(c.conkey, 1) = 1
    union
    select (quote_ident(cl.table_schema) || '.' || quote_ident(cl.table_name))::regclass,
           cl.column_name::text,
           case when cl.data_type = 'uuid' then 'uuid' else 'text' end
    from information_schema.columns cl
    join information_schema.tables tb
      on tb.table_schema = cl.table_schema and tb.table_name = cl.table_name and tb.table_type = 'BASE TABLE'
    where cl.table_schema = 'public'
      and cl.column_name in ('user_id', 'owner_id', 'owner_user_id')
      and cl.data_type in ('uuid', 'text', 'character varying')
      and cl.table_name <> 'bakplanla_deletion_log'
  loop
    begin
      n := public.bakplanla__delete_where(
        t.rel,
        case when t.typ = 'uuid'
          then format('%I = %L::uuid', t.col, p_user)
          else format('%I = %L', t.col, p_user::text)
        end
      );
      total := total + n;
      if n > 0 then
        details := details || jsonb_build_object(t.rel::text || '.' || t.col, n);
      end if;
    exception when others then
      errors := errors || jsonb_build_object(t.rel::text || '.' || t.col, sqlerrm);
    end;
  end loop;
  if errors <> '{}'::jsonb then
    raise exception 'bakplanla_delete_user_data hatasi: %', errors::text;
  end if;
  delete from public.bakplanla_deletion_log where deleted_at < now() - interval '3 years';
  insert into public.bakplanla_deletion_log (user_hash, deleted_rows, details)
  values (encode(sha256(convert_to(p_user::text, 'UTF8')), 'hex'), total, details);
  return jsonb_build_object('deleted_rows', total, 'tables', details);
end;
$function$;

ALTER FUNCTION "public"."bakplanla_delete_user_data"(p_user uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/41
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_admin_set_business_status(p_business_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b bk_businesses;
begin
  if p_status not in ('pending', 'verified', 'rejected', 'suspended') then perform public.bk_err('invalid:status'); end if;
  update bk_businesses set status = p_status, status_note = p_note, updated_at = now(),
         verified_at = case when p_status = 'verified' then now() else verified_at end
   where id = p_business_id returning * into b;
  if not found then perform public.bk_err('not_found'); end if;
  if p_status = 'suspended' then   -- askıya alınan işletmenin yayındaki ilanları yayından kalkar
    update bk_shifts set status = 'rejected', review_note = 'İşletme askıya alındı', updated_at = now()
     where business_id = b.id and status in ('pending_review', 'published');
  end if;
  perform public.bk_notify_business(b.id, 'business_' || p_status, b.id, jsonb_build_object('note', p_note));
  perform public.bk_audit_log(null, 'admin_business_' || p_status, b.id, jsonb_build_object('note', p_note));
  return jsonb_build_object('id', b.id, 'status', b.status);
end $function$;

ALTER FUNCTION "public"."bk_admin_set_business_status"(p_business_id uuid, p_status text, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/42
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_apply(p_shift_id uuid, p_message text DEFAULT NULL::text, p_share_history boolean DEFAULT false, p_contact_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.bk_uid();
  s bk_shifts; c bk_candidates; v_level int; v_app bk_applications;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_contact_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  select * into c from bk_candidates where user_id = v_uid;
  if not found then perform public.bk_err('profile_required'); end if;
  if not c.adult_confirmed then perform public.bk_err('not_adult'); end if;

  select * into s from bk_shifts where id = p_shift_id for update;   -- ilan kilitlenir
  if not found then perform public.bk_err('not_found'); end if;
  if s.is_demo then perform public.bk_err('demo_shift'); end if;
  if exists (select 1 from bk_applications where shift_id = s.id and user_id = v_uid) then
    perform public.bk_err('already_applied');
  end if;
  if s.status = 'full' then perform public.bk_err('shift_full'); end if;
  if s.status <> 'published' then perform public.bk_err('not_published'); end if;
  if not exists (select 1 from bk_businesses b where b.id = s.business_id and b.status = 'verified') then
    perform public.bk_err('business_not_verified');
  end if;
  if public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('own_business'); end if;
  if now() > s.apply_deadline or now() >= public.bk_shift_start(s) then perform public.bk_err('deadline_passed'); end if;
  if public.bk_seats_taken(s.id) >= s.capacity then perform public.bk_err('shift_full'); end if;

  v_level := public.bk_badge_level(v_uid, s.role);
  if v_level < s.min_level then perform public.bk_err('badge_required'); end if;

  -- kötüye kullanım sınırları
  if (select count(*) from bk_applications where user_id = v_uid and status in ('received', 'reviewing', 'approved')) >= 5 then
    perform public.bk_err('too_many_active');
  end if;
  if (select count(*) from bk_applications where user_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    perform public.bk_err('rate_limited');
  end if;
  if v_msg is not null and char_length(v_msg) > 300 then perform public.bk_err('invalid:message'); end if;
  if v_phone is not null and (char_length(v_phone) < 7 or char_length(v_phone) > 20) then perform public.bk_err('invalid:contact_phone'); end if;

  insert into bk_applications (shift_id, user_id, message, share_history, contact_phone, badge_snapshot)
  values (s.id, v_uid, v_msg, coalesce(p_share_history, false), v_phone,
          jsonb_build_object('role', s.role, 'level', v_level, 'at', now()))
  returning * into v_app;

  perform public.bk_notify_business(s.business_id, 'application_received', v_app.id, jsonb_build_object('shift_title', s.title));
  perform public.bk_audit_log(v_uid, 'apply', v_app.id, jsonb_build_object('shift', s.id));
  return jsonb_build_object('id', v_app.id, 'status', v_app.status);
end $function$;

ALTER FUNCTION "public"."bk_apply"(p_shift_id uuid, p_message text, p_share_history boolean, p_contact_phone text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/43
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_business_shifts(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  if not public.bk_is_member(p_business_id, v_uid) then perform public.bk_err('not_found'); end if;
  return coalesce((
    select jsonb_agg(public.bk_shift_public(s, v_uid) || jsonb_build_object(
      'review_note', s.review_note, 'cancel_reason', s.cancel_reason,
      'counts', (select jsonb_object_agg(x.status, x.n) from (select status, count(*) n from bk_applications where shift_id = s.id group by status) x)
    ) order by s.shift_date desc, s.start_time)
      from bk_shifts s where s.business_id = p_business_id
  ), '[]'::jsonb);
end $function$;

ALTER FUNCTION "public"."bk_business_shifts"(p_business_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/44
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_cancel_application(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts;
begin
  select * into a from bk_applications where id = p_application_id and user_id = v_uid for update;
  if not found then perform public.bk_err('not_found'); end if;
  select * into s from bk_shifts where id = a.shift_id for update;
  if not public.bk_transition_ok(a.status, 'cancelled_by_user', 'candidate') then perform public.bk_err('bad_transition'); end if;
  if a.status = 'approved' and now() >= public.bk_shift_start(s) then perform public.bk_err('shift_started'); end if;
  update bk_applications set status = 'cancelled_by_user', updated_at = now() where id = a.id;
  if s.status = 'full' and public.bk_seats_taken(s.id) < s.capacity then
    update bk_shifts set status = 'published', updated_at = now() where id = s.id;
  end if;
  perform public.bk_notify_business(s.business_id, 'application_cancelled', a.id, jsonb_build_object('shift_title', s.title));
  perform public.bk_audit_log(v_uid, 'cancel_application', a.id);
  return jsonb_build_object('id', a.id, 'status', 'cancelled_by_user');
end $function$;

ALTER FUNCTION "public"."bk_cancel_application"(p_application_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/45
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_cancel_shift(p_shift_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); s bk_shifts; a record; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into s from bk_shifts where id = p_shift_id for update;
  if not found or not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if s.status in ('cancelled', 'completed') then perform public.bk_err('bad_transition'); end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then perform public.bk_err('invalid:reason'); end if;
  update bk_shifts set status = 'cancelled', cancel_reason = v_reason, updated_at = now() where id = s.id;
  for a in select id, user_id from bk_applications where shift_id = s.id and status in ('received', 'reviewing', 'approved') loop
    update bk_applications set status = 'cancelled_by_business', decision_note = left(v_reason, 300), updated_at = now(), decided_at = now()
     where id = a.id;
    perform public.bk_notify(a.user_id, 'shift_cancelled', a.id, jsonb_build_object('shift_title', s.title, 'reason', v_reason));
  end loop;
  perform public.bk_audit_log(v_uid, 'cancel_shift', s.id, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('id', s.id, 'status', 'cancelled');
end $function$;

ALTER FUNCTION "public"."bk_cancel_shift"(p_shift_id uuid, p_reason text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/46
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_confirm_legal(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts;
begin
  select * into a from bk_applications where id = p_application_id for update;
  if not found then perform public.bk_err('not_found'); end if;
  select * into s from bk_shifts where id = a.shift_id;
  if not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if a.status <> 'approved' then perform public.bk_err('not_approved'); end if;
  update bk_applications set legal_confirmed_at = coalesce(legal_confirmed_at, now()), updated_at = now() where id = a.id;
  perform public.bk_audit_log(v_uid, 'confirm_legal', a.id);
  return jsonb_build_object('id', a.id, 'legal_confirmed', true);
end $function$;

ALTER FUNCTION "public"."bk_confirm_legal"(p_application_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/47
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_create_shift(p_business_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); r bk_shifts; v_id uuid;
begin
  if not public.bk_is_member(p_business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if not exists (select 1 from bk_businesses where id = p_business_id and status = 'verified') then
    perform public.bk_err('business_not_verified');
  end if;
  if (select count(*) from bk_shifts where business_id = p_business_id and created_at > now() - interval '24 hours') >= 20 then
    perform public.bk_err('rate_limited');
  end if;
  r := public.bk_shift_fields(p);
  insert into bk_shifts (business_id, created_by, title, role, description, shift_date, start_time, end_time, capacity,
                         pay_amount, pay_type, payment_method, payment_timing, min_level, min_age, address, district, city,
                         safety_info, apply_deadline, cancel_policy, legal_declared_at, status)
  values (p_business_id, v_uid, r.title, r.role, r.description, r.shift_date, r.start_time, r.end_time, r.capacity,
          r.pay_amount, r.pay_type, r.payment_method, r.payment_timing, r.min_level, r.min_age, r.address, r.district, r.city,
          r.safety_info, r.apply_deadline, r.cancel_policy, now(), 'pending_review')
  returning id into v_id;
  perform public.bk_audit_log(v_uid, 'create_shift', v_id);
  return jsonb_build_object('id', v_id, 'status', 'pending_review');
end $function$;

ALTER FUNCTION "public"."bk_create_shift"(p_business_id uuid, p jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/48
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_decide_application(p_application_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into a from bk_applications where id = p_application_id;
  if not found then perform public.bk_err('not_found'); end if;
  select * into s from bk_shifts where id = a.shift_id for update;               -- kontenjan kilidi
  if not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  select * into a from bk_applications where id = p_application_id for update;   -- kilit altında tekrar oku
  if not public.bk_transition_ok(a.status, p_status, 'business') then perform public.bk_err('bad_transition'); end if;
  if v_note is not null and char_length(v_note) > 300 then perform public.bk_err('invalid:note'); end if;

  if p_status = 'approved' then
    if s.status <> 'published' then perform public.bk_err(case when s.status = 'full' then 'shift_full' else 'not_published' end); end if;
    if now() >= public.bk_shift_start(s) then perform public.bk_err('shift_started'); end if;
    if public.bk_seats_taken(s.id) >= s.capacity then perform public.bk_err('shift_full'); end if;
    -- aday aynı saatlerde başka bir onaylı vardiyada mı?
    if exists (select 1 from bk_applications a2 join bk_shifts s2 on s2.id = a2.shift_id
                where a2.user_id = a.user_id and a2.id <> a.id and a2.status = 'approved'
                  and s2.shift_date = s.shift_date and s2.start_time < s.end_time and s.start_time < s2.end_time) then
      perform public.bk_err('candidate_busy');
    end if;
  end if;
  if p_status = 'no_show' and now() < public.bk_shift_start(s) then perform public.bk_err('shift_not_started'); end if;
  if p_status = 'no_show' and exists (select 1 from bk_attendance where application_id = a.id and check_in_at is not null) then
    perform public.bk_err('already_checked_in');
  end if;

  update bk_applications set status = p_status, decision_note = coalesce(v_note, decision_note), updated_at = now(),
         decided_at = case when p_status in ('approved', 'rejected') then now() else decided_at end
   where id = a.id;

  if p_status = 'approved' and public.bk_seats_taken(s.id) >= s.capacity then
    update bk_shifts set status = 'full', updated_at = now() where id = s.id;
  elsif p_status = 'cancelled_by_business' and s.status = 'full' then
    update bk_shifts set status = 'published', updated_at = now() where id = s.id;
  end if;

  perform public.bk_notify(a.user_id, 'app_' || p_status, a.id, jsonb_build_object('shift_title', s.title));
  perform public.bk_audit_log(v_uid, 'decide_' || p_status, a.id);
  return jsonb_build_object('id', a.id, 'status', p_status);
end $function$;

ALTER FUNCTION "public"."bk_decide_application"(p_application_id uuid, p_status text, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/49
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_txt(p jsonb, k text, mn integer, mx integer, required boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare v text := nullif(btrim(coalesce(p ->> k, '')), '');
begin
  if v is null then
    if required then perform public.bk_err('invalid:' || k); end if;
    return null;
  end if;
  if char_length(v) < mn or char_length(v) > mx then perform public.bk_err('invalid:' || k); end if;
  return v;
end $function$;

ALTER FUNCTION "public"."bk_txt"(p jsonb, k text, mn integer, mx integer, required boolean) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/50
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_issue_checkin_token(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts; t bk_attendance;
  v_token text := encode(gen_random_bytes(16), 'hex'); v_exp timestamptz := now() + interval '5 minutes';
begin
  select * into a from bk_applications where id = p_application_id and user_id = v_uid;
  if not found then perform public.bk_err('not_found'); end if;
  if a.status <> 'approved' then perform public.bk_err('not_approved'); end if;
  select * into s from bk_shifts where id = a.shift_id;
  if s.status = 'cancelled' then perform public.bk_err('shift_cancelled'); end if;
  if now() < public.bk_shift_start(s) - interval '60 minutes' or now() > public.bk_shift_end(s) + interval '3 hours' then
    perform public.bk_err('wrong_time');
  end if;
  select * into t from bk_attendance where application_id = a.id;
  if t.check_out_at is not null then perform public.bk_err('already_done'); end if;
  insert into bk_attendance (application_id, token_hash, token_expires_at, updated_at)
    values (a.id, encode(digest(v_token, 'sha256'), 'hex'), v_exp, now())
  on conflict (application_id) do update set token_hash = excluded.token_hash, token_expires_at = excluded.token_expires_at, updated_at = now();
  return jsonb_build_object(
    'payload', 'BAKPLANLA:VRD:' || a.id::text || ':' || v_token,
    'expires_at', v_exp,
    'next_action', case when t.check_in_at is null then 'check_in' else 'check_out' end);
end $function$;

ALTER FUNCTION "public"."bk_issue_checkin_token"(p_application_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/51
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_list_open_shifts(p_role text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_min_pay numeric DEFAULT NULL::numeric, p_only_eligible boolean DEFAULT false, p_only_open_seats boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  return coalesce((
    select jsonb_agg(public.bk_shift_public(s, v_uid) order by s.shift_date, s.start_time)
      from bk_shifts s join bk_businesses b on b.id = s.business_id
     where s.status in ('published', 'full') and b.status = 'verified'
       and s.shift_date >= greatest(public.bk_today(), coalesce(p_from, public.bk_today()))
       and (p_to is null or s.shift_date <= p_to)
       and (p_role is null or s.role = p_role)
       and (p_min_pay is null or s.pay_amount >= p_min_pay)
       and (not coalesce(p_only_eligible, false) or public.bk_badge_level(v_uid, s.role) >= s.min_level)
       and (not coalesce(p_only_open_seats, false) or (s.status = 'published' and public.bk_seats_taken(s.id) < s.capacity))
  ), '[]'::jsonb);
end $function$;

ALTER FUNCTION "public"."bk_list_open_shifts"(p_role text, p_from date, p_to date, p_min_pay numeric, p_only_eligible boolean, p_only_open_seats boolean) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/52
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_manual_attendance(p_application_id uuid, p_action text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts; t bk_attendance; v_note text := btrim(coalesce(p_note, ''));
begin
  select * into a from bk_applications where id = p_application_id for update;
  if not found then perform public.bk_err('not_found'); end if;
  select * into s from bk_shifts where id = a.shift_id;
  if not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if a.status <> 'approved' then perform public.bk_err('not_approved'); end if;
  if char_length(v_note) < 5 or char_length(v_note) > 300 then perform public.bk_err('invalid:note'); end if;
  if now() < public.bk_shift_start(s) - interval '60 minutes' or now() > public.bk_shift_end(s) + interval '3 hours' then
    perform public.bk_err('wrong_time');
  end if;
  select * into t from bk_attendance where application_id = a.id for update;
  if p_action = 'check_in' then
    if t.check_in_at is not null then perform public.bk_err('already_checked_in'); end if;
    if a.legal_confirmed_at is null then perform public.bk_err('legal_not_confirmed'); end if;
    insert into bk_attendance (application_id, check_in_at, check_in_method, manual_note, updated_by)
      values (a.id, now(), 'manual', v_note, v_uid)
    on conflict (application_id) do update set check_in_at = now(), check_in_method = 'manual', manual_note = v_note,
      token_hash = null, token_expires_at = null, updated_by = v_uid, updated_at = now();
  elsif p_action = 'check_out' then
    if t.check_in_at is null then perform public.bk_err('not_checked_in'); end if;
    update bk_attendance set check_out_at = now(), check_out_method = 'manual',
           manual_note = coalesce(manual_note || ' | ', '') || v_note, token_hash = null, token_expires_at = null,
           updated_by = v_uid, updated_at = now() where application_id = a.id;
    update bk_applications set status = 'completed', updated_at = now() where id = a.id;
    perform public.bk_notify(a.user_id, 'app_completed', a.id, jsonb_build_object('shift_title', s.title));
  else
    perform public.bk_err('invalid:action');
  end if;
  perform public.bk_audit_log(v_uid, 'manual_' || p_action, a.id, jsonb_build_object('note', v_note));
  return jsonb_build_object('action', p_action, 'application_id', a.id);
end $function$;

ALTER FUNCTION "public"."bk_manual_attendance"(p_application_id uuid, p_action text, p_note text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/53
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_mark_events_read()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin update bk_events set read_at = now() where user_id = public.bk_uid() and read_at is null; end $function$;

ALTER FUNCTION "public"."bk_mark_events_read"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/54
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_my_applications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'created_at', a.created_at, 'decided_at', a.decided_at,
      'decision_note', a.decision_note, 'share_history', a.share_history,
      'legal_confirmed', a.legal_confirmed_at is not null,
      'shift', public.bk_shift_public(s, v_uid),
      'check_in_at', t.check_in_at, 'check_out_at', t.check_out_at,
      'my_review_done', exists (select 1 from bk_reviews r where r.application_id = a.id and r.side = 'candidate'),
      'business_review', (select jsonb_build_object('ratings', r.ratings, 'comment', r.comment, 'created_at', r.created_at)
                            from bk_reviews r where r.application_id = a.id and r.side = 'business' and not r.hidden),
      'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'offer_type', o.offer_type, 'details', o.details,
                            'pay_info', o.pay_info, 'conditions', o.conditions, 'status', o.status, 'created_at', o.created_at)
                            order by o.created_at desc) from bk_offers o where o.application_id = a.id), '[]'::jsonb)
    ) order by s.shift_date desc, a.created_at desc)
      from bk_applications a join bk_shifts s on s.id = a.shift_id
      left join bk_attendance t on t.application_id = a.id
     where a.user_id = v_uid
  ), '[]'::jsonb);
end $function$;

ALTER FUNCTION "public"."bk_my_applications"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/55
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_my_businesses()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  return coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('member_role', m.role) order by b.created_at)
                     from bk_business_members m join bk_businesses b on b.id = m.business_id where m.user_id = v_uid), '[]'::jsonb);
end $function$;

ALTER FUNCTION "public"."bk_my_businesses"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/56
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_my_events(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  return coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.created_at desc)
                     from (select * from bk_events where user_id = v_uid order by created_at desc
                            limit least(greatest(coalesce(p_limit, 50), 1), 200)) e), '[]'::jsonb);
end $function$;

ALTER FUNCTION "public"."bk_my_events"(p_limit integer) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/57
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_my_passport()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid();
begin
  return jsonb_build_object(
    'candidate', (select jsonb_build_object('display_name', c.display_name, 'city', c.city, 'since', c.created_at) from bk_candidates c where c.user_id = v_uid),
    'badges', coalesce((select jsonb_agg(to_jsonb(b) order by b.role) from public.bk_badges_of(v_uid) b), '[]'::jsonb),
    'experiences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'application_id', a.id, 'business_name', b.name, 'role', s.role, 'title', s.title, 'shift_date', s.shift_date,
        'minutes', case when t.check_in_at is not null and t.check_out_at is not null
                        then (extract(epoch from (t.check_out_at - t.check_in_at)) / 60)::int end,
        'business_review', (select r.ratings from bk_reviews r where r.application_id = a.id and r.side = 'business' and not r.hidden)
      ) order by s.shift_date desc)
        from bk_applications a join bk_shifts s on s.id = a.shift_id join bk_businesses b on b.id = s.business_id
        left join bk_attendance t on t.application_id = a.id
       where a.user_id = v_uid and a.status = 'completed'), '[]'::jsonb)
  );
end $function$;

ALTER FUNCTION "public"."bk_my_passport"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/58
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_redeem_checkin(p_payload text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public.bk_uid(); parts text[]; v_app uuid; v_token text;
  a bk_applications; s bk_shifts; t bk_attendance; c bk_candidates; v_action text;
begin
  parts := regexp_match(coalesce(p_payload, ''), '^BAKPLANLA:VRD:([0-9a-f-]{36}):([0-9a-f]{32})$');
  if parts is null then perform public.bk_err('bad_code'); end if;
  v_app := parts[1]::uuid; v_token := parts[2];
  select * into a from bk_applications where id = v_app for update;
  if not found then perform public.bk_err('bad_code'); end if;
  select * into s from bk_shifts where id = a.shift_id;
  if not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('wrong_business'); end if;
  if a.status <> 'approved' then perform public.bk_err('not_approved'); end if;
  if s.status = 'cancelled' then perform public.bk_err('shift_cancelled'); end if;
  select * into t from bk_attendance where application_id = a.id for update;
  if not found or t.token_hash is null then perform public.bk_err('token_used'); end if;
  if t.token_hash <> encode(digest(v_token, 'sha256'), 'hex') then perform public.bk_err('token_used'); end if;
  if t.token_expires_at < now() then perform public.bk_err('token_expired'); end if;
  if now() < public.bk_shift_start(s) - interval '60 minutes' or now() > public.bk_shift_end(s) + interval '3 hours' then
    perform public.bk_err('wrong_time');
  end if;
  if t.check_in_at is null and a.legal_confirmed_at is null then perform public.bk_err('legal_not_confirmed'); end if;

  if t.check_in_at is null then
    update bk_attendance set check_in_at = now(), check_in_method = 'qr', token_hash = null, token_expires_at = null,
           updated_by = v_uid, updated_at = now() where application_id = a.id;
    v_action := 'check_in';
  else
    update bk_attendance set check_out_at = now(), check_out_method = 'qr', token_hash = null, token_expires_at = null,
           updated_by = v_uid, updated_at = now() where application_id = a.id;
    update bk_applications set status = 'completed', updated_at = now() where id = a.id;
    perform public.bk_notify(a.user_id, 'app_completed', a.id, jsonb_build_object('shift_title', s.title));
    v_action := 'check_out';
  end if;
  select * into c from bk_candidates where user_id = a.user_id;
  perform public.bk_audit_log(v_uid, 'qr_' || v_action, a.id);
  return jsonb_build_object('action', v_action, 'application_id', a.id, 'display_name', c.display_name, 'shift_title', s.title, 'at', now());
end $function$;

ALTER FUNCTION "public"."bk_redeem_checkin"(p_payload text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/59
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_register_business(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); v_id uuid; v_tax text := nullif(regexp_replace(coalesce(p ->> 'tax_number', ''), '\s', '', 'g'), '');
begin
  if (select count(*) from bk_businesses where owner_id = v_uid) >= 3 then perform public.bk_err('too_many_businesses'); end if;
  if v_tax is not null and v_tax !~ '^[0-9]{10,11}$' then perform public.bk_err('invalid:tax_number'); end if;
  insert into bk_businesses (owner_id, name, contact_person, contact_phone, contact_email, address, district, city, sector, tax_number)
  values (v_uid,
          public.bk_txt(p, 'name', 2, 80), public.bk_txt(p, 'contact_person', 2, 60), public.bk_txt(p, 'contact_phone', 7, 20),
          public.bk_txt(p, 'contact_email', 5, 120), public.bk_txt(p, 'address', 5, 200), public.bk_txt(p, 'district', 2, 60),
          public.bk_txt(p, 'city', 2, 60), public.bk_txt(p, 'sector', 2, 60), v_tax)
  returning id into v_id;
  if (p ->> 'contact_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform public.bk_err('invalid:contact_email'); end if;
  insert into bk_business_members (business_id, user_id, role) values (v_id, v_uid, 'owner');
  perform public.bk_audit_log(v_uid, 'register_business', v_id);
  return jsonb_build_object('id', v_id, 'status', 'pending');
end $function$;

ALTER FUNCTION "public"."bk_register_business"(p jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/60
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_send_offer(p_application_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); a bk_applications; s bk_shifts; v_id uuid; v_type text := p ->> 'offer_type';
begin
  select * into a from bk_applications where id = p_application_id;
  if not found then perform public.bk_err('not_found'); end if;
  select * into s from bk_shifts where id = a.shift_id;
  if not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if a.status <> 'completed' then perform public.bk_err('not_completed'); end if;
  if v_type is null or v_type not in ('interview', 'part_time', 'full_time', 'seasonal') then perform public.bk_err('invalid:offer_type'); end if;
  begin
    insert into bk_offers (application_id, business_id, user_id, offer_type, details, pay_info, conditions)
    values (a.id, s.business_id, a.user_id, v_type, public.bk_txt(p, 'details', 10, 1000),
            public.bk_txt(p, 'pay_info', 3, 200), public.bk_txt(p, 'conditions', 3, 500))
    returning id into v_id;
  exception when unique_violation then
    perform public.bk_err('offer_exists');
  end;
  perform public.bk_notify(a.user_id, 'offer_received', v_id, jsonb_build_object('business', (select name from bk_businesses where id = s.business_id)));
  perform public.bk_audit_log(v_uid, 'send_offer', v_id);
  return jsonb_build_object('id', v_id, 'status', 'sent');
end $function$;

ALTER FUNCTION "public"."bk_send_offer"(p_application_id uuid, p jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/61
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_shift_applicants(p_shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); s bk_shifts;
begin
  select * into s from bk_shifts where id = p_shift_id;
  if not found or not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'created_at', a.created_at, 'message', a.message,
      'display_name', c.display_name, 'adult_confirmed', c.adult_confirmed,
      'badge_at_apply', a.badge_snapshot, 'badge_now', public.bk_badge_level(a.user_id, s.role),
      'contact_phone', case when a.status in ('approved', 'completed', 'no_show') then a.contact_phone end,
      'legal_confirmed', a.legal_confirmed_at is not null, 'decision_note', a.decision_note,
      'check_in_at', t.check_in_at, 'check_out_at', t.check_out_at,
      'my_review_done', exists (select 1 from bk_reviews r where r.application_id = a.id and r.side = 'business'),
      'offer_status', (select o.status from bk_offers o where o.application_id = a.id order by o.created_at desc limit 1),
      'history', case when a.share_history then jsonb_build_object(
          'completed', (select count(*) from bk_applications a2 where a2.user_id = a.user_id and a2.status = 'completed'),
          'no_show', (select count(*) from bk_applications a2 where a2.user_id = a.user_id and a2.status = 'no_show'),
          'avg_ratings', (select jsonb_object_agg(k, round(avg_v, 1)) from (
              select kv.key k, avg((kv.value)::numeric) avg_v
                from bk_reviews r join bk_applications a3 on a3.id = r.application_id, jsonb_each(r.ratings) kv
               where a3.user_id = a.user_id and r.side = 'business' and not r.hidden group by kv.key) q)
        ) end
    ) order by a.created_at)
      from bk_applications a join bk_candidates c on c.user_id = a.user_id
      left join bk_attendance t on t.application_id = a.id
     where a.shift_id = s.id
  ), '[]'::jsonb);
end $function$;

ALTER FUNCTION "public"."bk_shift_applicants"(p_shift_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/62
-- Raw function ACL: null
-- Owner: postgres; config: ["search_path=public, pg_temp"]
CREATE OR REPLACE FUNCTION public.bakplanla_shopping_plan_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  if (select auth.role()) = 'authenticated' then
    new.status := 'scheduled';
    new.sent_at := null;
    new.attempts := 0;
    new.last_message := null;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "public"."bakplanla_shopping_plan_touch"() OWNER TO "postgres";

-- NULL proacl: built-in default includes PUBLIC EXECUTE; no explicit ACL array exported.

-- /rows/0/technical_definitions/functions/63
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public, pg_temp"]
CREATE OR REPLACE FUNCTION public.bakplanla_check_cron_secret(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
     where name = 'bakplanla_shopping_cron_secret' and decrypted_secret = p_secret
  );
$function$;

ALTER FUNCTION "public"."bakplanla_check_cron_secret"(p_secret text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/64
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_update_shift(p_shift_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); s bk_shifts; r bk_shifts;
begin
  select * into s from bk_shifts where id = p_shift_id for update;
  if not found or not public.bk_is_member(s.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if s.status not in ('pending_review', 'rejected') then perform public.bk_err('not_editable'); end if;
  r := public.bk_shift_fields(p);
  update bk_shifts set title = r.title, role = r.role, description = r.description, shift_date = r.shift_date,
         start_time = r.start_time, end_time = r.end_time, capacity = r.capacity, pay_amount = r.pay_amount,
         pay_type = r.pay_type, payment_method = r.payment_method, payment_timing = r.payment_timing,
         min_level = r.min_level, min_age = r.min_age, address = r.address, district = r.district, city = r.city,
         safety_info = r.safety_info, apply_deadline = r.apply_deadline, cancel_policy = r.cancel_policy,
         legal_declared_at = now(), status = 'pending_review', review_note = null, updated_at = now()
   where id = s.id;
  perform public.bk_audit_log(v_uid, 'update_shift', s.id);
  return jsonb_build_object('id', s.id, 'status', 'pending_review');
end $function$;

ALTER FUNCTION "public"."bk_update_shift"(p_shift_id uuid, p jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/65
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: null
CREATE OR REPLACE FUNCTION public.bk_valid_ratings(p_side text, p_ratings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  keys text[] := case when p_side = 'candidate'
                      then array['communication', 'conditions_match', 'guidance', 'pay_clarity']
                      else array['punctuality', 'task_completion', 'following_instructions', 'customer_communication'] end;
  k text; v jsonb;
begin
  if p_ratings is null or jsonb_typeof(p_ratings) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_ratings)) <> array_length(keys, 1) then return false; end if;
  foreach k in array keys loop
    v := p_ratings -> k;
    if v is null or jsonb_typeof(v) <> 'number' then return false; end if;
    if (v::text)::numeric not in (1, 2, 3, 4, 5) then return false; end if;
  end loop;
  return true;
end $function$;

ALTER FUNCTION "public"."bk_valid_ratings"(p_side text, p_ratings jsonb) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/66
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bk_withdraw_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := public.bk_uid(); o bk_offers;
begin
  select * into o from bk_offers where id = p_offer_id for update;
  if not found or not public.bk_is_member(o.business_id, v_uid) then perform public.bk_err('not_found'); end if;
  if o.status <> 'sent' then perform public.bk_err('bad_transition'); end if;
  update bk_offers set status = 'withdrawn', responded_at = now() where id = o.id;
  perform public.bk_audit_log(v_uid, 'withdraw_offer', o.id);
  return jsonb_build_object('id', o.id, 'status', 'withdrawn');
end $function$;

ALTER FUNCTION "public"."bk_withdraw_offer"(p_offer_id uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/67
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.partner_discount_code(p_partner text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_p     public.bakplanla_partners%rowtype;
  v_now   timestamp := (now() at time zone 'Europe/Istanbul');
  v_day   date := v_now::date;
  v_row   public.bakplanla_partner_codes%rowtype;
  v_code  text;
  v_try   int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  end if;

  select * into v_p from public.bakplanla_partners where id = p_partner and active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Bugün zaten kod alınmış mı?
  select * into v_row from public.bakplanla_partner_codes
   where partner_id = v_p.id and user_id = v_uid and day = v_day;
  if found then
    if v_row.redeemed_at is not null then
      return jsonb_build_object('ok', false, 'error', 'used_today', 'redeemed_at', v_row.redeemed_at);
    end if;
    if now() >= v_row.expires_at then
      return jsonb_build_object('ok', false, 'error', 'closed',
        'opens', to_char(v_p.window_start, 'HH24:MI'), 'closes', to_char(v_p.window_end, 'HH24:MI'));
    end if;
    return jsonb_build_object('ok', true, 'code', v_row.code, 'expires_at', v_row.expires_at,
      'partner', v_p.name, 'percent', v_p.discount_percent,
      'offer', jsonb_build_object('tr', v_p.offer_tr, 'en', v_p.offer_en, 'de', v_p.offer_de), 'already', true);
  end if;

  -- Saat aralığı (Türkiye saati)
  if v_now::time < v_p.window_start or v_now::time >= v_p.window_end then
    return jsonb_build_object('ok', false, 'error', 'closed',
      'opens', to_char(v_p.window_start, 'HH24:MI'), 'closes', to_char(v_p.window_end, 'HH24:MI'));
  end if;

  -- 6 haneli, o gün o işletmede benzersiz kod
  loop
    v_try := v_try + 1;
    v_code := (100000 + floor(random() * 900000))::int::text;
    begin
      insert into public.bakplanla_partner_codes (partner_id, user_id, day, code, expires_at)
      values (v_p.id, v_uid, v_day, v_code, ((v_day + v_p.window_end) at time zone 'Europe/Istanbul'))
      returning * into v_row;
      exit;
    exception when unique_violation then
      -- aynı anda iki istek geldiyse kişinin bugünkü kodu zaten oluşmuştur
      select * into v_row from public.bakplanla_partner_codes
       where partner_id = v_p.id and user_id = v_uid and day = v_day;
      if found then exit; end if;
      if v_try >= 20 then
        return jsonb_build_object('ok', false, 'error', 'other');
      end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'code', v_row.code, 'expires_at', v_row.expires_at,
    'partner', v_p.name, 'percent', v_p.discount_percent,
    'offer', jsonb_build_object('tr', v_p.offer_tr, 'en', v_p.offer_en, 'de', v_p.offer_de), 'already', false);
end $function$;

ALTER FUNCTION "public"."partner_discount_code"(p_partner text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/68
-- Raw function ACL: ["postgres=X/postgres", "anon=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.partner_redeem_code(p_partner text, p_pin text, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p          public.bakplanla_partners%rowtype;
  v_now        timestamp := (now() at time zone 'Europe/Istanbul');
  v_day        date := v_now::date;
  v_code       text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  v_row        public.bakplanla_partner_codes%rowtype;
  v_pin_fails  int;
  v_code_fails int;
begin
  select * into v_p from public.bakplanla_partners where id = p_partner and active;
  if not found or v_p.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_partner');
  end if;

  delete from public.bakplanla_partner_fails where at < now() - interval '1 day';

  -- 1) PIN kilidi: yalnızca yanlış PIN denemeleri sayılır.
  select count(*) into v_pin_fails from public.bakplanla_partner_fails
   where partner_id = v_p.id and kind = 'pin' and at > now() - interval '15 minutes';
  if v_pin_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if encode(sha256(convert_to(coalesce(p_pin, '') || ':' || v_p.id, 'UTF8')), 'hex') <> v_p.pin_hash then
    insert into public.bakplanla_partner_fails (partner_id, kind) values (v_p.id, 'pin');
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;

  -- 2) PIN doğru. Yanlış kodlar kasayı kilitlemez; yalnızca aşırı denemede kod girişi kısa süre durur.
  select count(*) into v_code_fails from public.bakplanla_partner_fails
   where partner_id = v_p.id and kind = 'code' and at > now() - interval '15 minutes';
  if v_code_fails >= 60 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_row from public.bakplanla_partner_codes
   where partner_id = v_p.id and day = v_day and code = v_code
   for update;
  if not found then
    insert into public.bakplanla_partner_fails (partner_id, kind) values (v_p.id, 'code');
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_row.redeemed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'used', 'redeemed_at', v_row.redeemed_at);
  end if;
  if now() >= v_row.expires_at or v_now::time < v_p.window_start then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update public.bakplanla_partner_codes set redeemed_at = now() where id = v_row.id;
  return jsonb_build_object('ok', true, 'code', v_row.code, 'partner', v_p.name,
    'percent', v_p.discount_percent, 'offer', v_p.offer_tr, 'redeemed_at', now());
end $function$;

ALTER FUNCTION "public"."partner_redeem_code"(p_partner text, p_pin text, p_code text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/69
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bakplanla_is_pro(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.bakplanla_entitlements e
    where e.user_id = p_user
      and e.plan in ('pro_monthly', 'pro_yearly')
      and (
        (e.status = 'active'   and (e.current_period_end is null or e.current_period_end > now()))
        or (e.status = 'canceled' and e.current_period_end is not null and e.current_period_end > now())
      )
  );
$function$;

ALTER FUNCTION "public"."bakplanla_is_pro"(p_user uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/70
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.ai_usage_take(p_user uuid, p_pro_daily integer DEFAULT 25, p_pro_monthly integer DEFAULT 300, p_free_daily integer DEFAULT 25, p_free_monthly integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day   date := (now() at time zone 'Europe/Istanbul')::date;
  v_month date := date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date;
  v_pro   boolean;
  v_dl    int;
  v_ml    int;
  v_today int;
  v_mon   int;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  v_pro := public.bakplanla_is_pro(p_user);
  v_dl  := greatest(0, case when v_pro then p_pro_daily   else p_free_daily   end);
  v_ml  := greatest(0, case when v_pro then p_pro_monthly else p_free_monthly end);

  insert into public.bakplanla_ai_usage (user_id, day, used) values (p_user, v_day, 0)
  on conflict (user_id, day) do nothing;
  select used into v_today from public.bakplanla_ai_usage
   where user_id = p_user and day = v_day for update;
  select coalesce(sum(used), 0) into v_mon from public.bakplanla_ai_usage
   where user_id = p_user and day >= v_month and day <= v_day;

  if v_today >= v_dl then
    return jsonb_build_object('ok', false, 'error', 'daily', 'pro', v_pro,
      'day_used', v_today, 'day_limit', v_dl, 'month_used', v_mon, 'month_limit', v_ml);
  end if;
  if v_mon >= v_ml then
    return jsonb_build_object('ok', false, 'error', 'monthly', 'pro', v_pro,
      'day_used', v_today, 'day_limit', v_dl, 'month_used', v_mon, 'month_limit', v_ml);
  end if;

  update public.bakplanla_ai_usage set used = used + 1 where user_id = p_user and day = v_day;
  return jsonb_build_object('ok', true, 'pro', v_pro,
    'day_used', v_today + 1, 'day_limit', v_dl, 'month_used', v_mon + 1, 'month_limit', v_ml);
end $function$;

ALTER FUNCTION "public"."ai_usage_take"(p_user uuid, p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/71
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.ai_usage_refund(p_user uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.bakplanla_ai_usage set used = greatest(used - 1, 0)
   where user_id = p_user and day = (now() at time zone 'Europe/Istanbul')::date;
$function$;

ALTER FUNCTION "public"."ai_usage_refund"(p_user uuid) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/72
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.ai_usage_status(p_pro_daily integer DEFAULT 25, p_pro_monthly integer DEFAULT 300, p_free_daily integer DEFAULT 25, p_free_monthly integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_day   date := (now() at time zone 'Europe/Istanbul')::date;
  v_month date := date_trunc('month', (now() at time zone 'Europe/Istanbul'))::date;
  v_pro   boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  v_pro := public.bakplanla_is_pro(v_uid);
  return jsonb_build_object('ok', true, 'pro', v_pro,
    'day_used',   coalesce((select used from public.bakplanla_ai_usage where user_id = v_uid and day = v_day), 0),
    'day_limit',  case when v_pro then p_pro_daily else p_free_daily end,
    'month_used', coalesce((select sum(used) from public.bakplanla_ai_usage where user_id = v_uid and day >= v_month and day <= v_day), 0),
    'month_limit', case when v_pro then p_pro_monthly else p_free_monthly end);
end $function$;

ALTER FUNCTION "public"."ai_usage_status"(p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/73
-- Raw function ACL: null
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.bakplanla_business_requests_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    new.reviewed_at := now();
  end if;
  return new;
end $function$;

ALTER FUNCTION "public"."bakplanla_business_requests_touch"() OWNER TO "postgres";

-- NULL proacl: built-in default includes PUBLIC EXECUTE; no explicit ACL array exported.

-- /rows/0/technical_definitions/functions/74
-- Raw function ACL: ["postgres=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.business_request_submit(p_business_name text, p_category text, p_contact_name text, p_phone text, p_email text, p_district text, p_address text, p_website text, p_instagram text, p_description text, p_offer text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'GIRIS_GEREKLI';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'EPOSTA_DOGRULANMALI';
  end if;
  -- Kötüye kullanım sınırı: bekleyen en fazla 2 başvuru, günde en fazla 3 başvuru.
  if (select count(*) from bakplanla_business_requests where user_id = v_uid and status = 'pending') >= 2 then
    raise exception 'BEKLEYEN_BASVURU_VAR';
  end if;
  if (select count(*) from bakplanla_business_requests where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'GUNLUK_SINIR';
  end if;

  insert into bakplanla_business_requests
    (user_id, business_name, category, contact_name, phone, email, district, address,
     website, instagram, description, offer)
  values
    (v_uid, btrim(p_business_name), btrim(p_category), btrim(p_contact_name), btrim(p_phone), lower(btrim(p_email)),
     btrim(p_district), btrim(p_address), nullif(btrim(p_website), ''), nullif(btrim(p_instagram), ''),
     btrim(p_description), nullif(btrim(p_offer), ''))
  returning id into v_id;

  return v_id;
end $function$;

ALTER FUNCTION "public"."business_request_submit"(p_business_name text, p_category text, p_contact_name text, p_phone text, p_email text, p_district text, p_address text, p_website text, p_instagram text, p_description text, p_offer text) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/75
-- Raw function ACL: ["postgres=X/postgres", "anon=X/postgres", "authenticated=X/postgres"]
-- Owner: postgres; config: ["search_path=public"]
CREATE OR REPLACE FUNCTION public.business_list_approved()
 RETURNS TABLE(id uuid, business_name text, category text, district text, address text, website text, instagram text, description text, offer text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, business_name, category, district, address, website, instagram, description, offer
  from bakplanla_business_requests
  where status = 'approved'
  order by reviewed_at desc nulls last
  limit 100;
$function$;

ALTER FUNCTION "public"."business_list_approved"() OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/functions/76
-- Raw function ACL: null
-- Owner: postgres; config: ["search_path=public, extensions"]
CREATE OR REPLACE FUNCTION public.bakplanla_business_requests_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
      perform net.http_post(
            url := 'https://tlizbrhmwaesfjmtxcgh.supabase.co/functions/v1/isletme-karar',
                  body := jsonb_build_object('id', new.id),
                        headers := jsonb_build_object('Content-Type', 'application/json')
                            );
                              end if;
                                return new;
                                end $function$;

ALTER FUNCTION "public"."bakplanla_business_requests_notify"() OWNER TO "postgres";

-- NULL proacl: built-in default includes PUBLIC EXECUTE; no explicit ACL array exported.

-- /rows/0/technical_definitions/functions/77
-- Raw function ACL: ["postgres=X/postgres", "service_role=X/postgres"]
-- Owner: postgres; config: ["search_path=public, pg_temp"]
CREATE OR REPLACE FUNCTION public.bakplanla_claim_due_shopping_plans(p_limit integer DEFAULT 200)
 RETURNS SETOF bakplanla_shopping_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 30 dakikadan uzun "sending" kalanlar geri alınır; 2 günden eski bekleyenler kapatılır.
  update public.bakplanla_shopping_plans
     set status = case when attempts >= 3 then 'failed' else 'scheduled' end
   where status = 'sending' and updated_at < now() - interval '30 minutes';
  update public.bakplanla_shopping_plans
     set status = 'failed', last_message = 'süresi geçti'
   where status = 'scheduled' and remind_at < now() - interval '2 days';

  return query
  update public.bakplanla_shopping_plans p
     set status = 'sending', attempts = p.attempts + 1
   where p.user_id in (
     select q.user_id from public.bakplanla_shopping_plans q
      where q.status = 'scheduled' and q.remind_at <= now()
      order by q.remind_at
      limit greatest(1, least(coalesce(p_limit, 200), 500))
      for update skip locked
   )
  returning p.*;
end;
$function$;

ALTER FUNCTION "public"."bakplanla_claim_due_shopping_plans"(p_limit integer) OWNER TO "postgres";

-- grantor=postgres

-- /rows/0/technical_definitions/triggers/8
CREATE TRIGGER bakplanla_backups_touch BEFORE INSERT OR UPDATE ON public.bakplanla_backups FOR EACH ROW EXECUTE FUNCTION bakplanla_backups_touch();

-- Exported tgenabled=O

-- /rows/0/technical_definitions/triggers/9
CREATE TRIGGER bakplanla_business_requests_touch BEFORE UPDATE ON public.bakplanla_business_requests FOR EACH ROW EXECUTE FUNCTION bakplanla_business_requests_touch();

-- Exported tgenabled=O

-- /rows/0/technical_definitions/triggers/10
CREATE TRIGGER bakplanla_business_requests_notify AFTER UPDATE OF status ON public.bakplanla_business_requests FOR EACH ROW EXECUTE FUNCTION bakplanla_business_requests_notify();

-- Exported tgenabled=O

-- /rows/0/technical_definitions/triggers/11
CREATE TRIGGER bakplanla_shopping_plan_touch BEFORE INSERT OR UPDATE ON public.bakplanla_shopping_plans FOR EACH ROW EXECUTE FUNCTION bakplanla_shopping_plan_touch();

-- /rows/0/technical_definitions/policies/0
CREATE POLICY "isbasi_progress_own" ON "public"."bakplanla_isbasi_progress" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

-- /rows/0/technical_definitions/policies/1
CREATE POLICY "isbasi_shifts_own" ON "public"."bakplanla_isbasi_shifts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

-- /rows/0/technical_definitions/policies/2
CREATE POLICY "isbasi_coupons_own" ON "public"."bakplanla_isbasi_coupons" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

-- /rows/0/technical_definitions/policies/3
CREATE POLICY "bk_candidates_own" ON "public"."bk_candidates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

-- /rows/0/technical_definitions/policies/4
CREATE POLICY "bk_events_own" ON "public"."bk_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

-- /rows/0/technical_definitions/policies/5
CREATE POLICY "backup_select_own" ON "public"."bakplanla_backups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/6
CREATE POLICY "backup_insert_own" ON "public"."bakplanla_backups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/7
CREATE POLICY "backup_update_own" ON "public"."bakplanla_backups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/9
CREATE POLICY "backup_delete_own" ON "public"."bakplanla_backups" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/10
CREATE POLICY "bakplanla_docs_select_own" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'bakplanla-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- /rows/0/technical_definitions/policies/11
CREATE POLICY "bakplanla_docs_insert_own" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'bakplanla-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- /rows/0/technical_definitions/policies/12
CREATE POLICY "bakplanla_docs_update_own" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'bakplanla-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) WITH CHECK (((bucket_id = 'bakplanla-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- /rows/0/technical_definitions/policies/13
CREATE POLICY "bakplanla_docs_delete_own" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'bakplanla-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- /rows/0/technical_definitions/policies/15
CREATE POLICY "entitlement_select_own" ON "public"."bakplanla_entitlements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/16
CREATE POLICY "trials_select_own" ON "public"."bakplanla_feature_trials" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/17
CREATE POLICY "devices_select_own" ON "public"."bakplanla_devices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/18
CREATE POLICY "devices_insert_own" ON "public"."bakplanla_devices" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/19
CREATE POLICY "devices_update_own" ON "public"."bakplanla_devices" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/20
CREATE POLICY "devices_delete_own" ON "public"."bakplanla_devices" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/21
CREATE POLICY "kendi basvurularini gorur" ON "public"."bakplanla_business_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

-- /rows/0/technical_definitions/policies/22
CREATE POLICY "shopping_plans_select_own" ON "public"."bakplanla_shopping_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/23
CREATE POLICY "shopping_plans_insert_own" ON "public"."bakplanla_shopping_plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/24
CREATE POLICY "shopping_plans_update_own" ON "public"."bakplanla_shopping_plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/25
CREATE POLICY "shopping_plans_delete_own" ON "public"."bakplanla_shopping_plans" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/26
CREATE POLICY "push_tokens_select_own" ON "public"."bakplanla_push_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/27
CREATE POLICY "push_tokens_insert_own" ON "public"."bakplanla_push_tokens" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/28
CREATE POLICY "push_tokens_update_own" ON "public"."bakplanla_push_tokens" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/policies/29
CREATE POLICY "push_tokens_delete_own" ON "public"."bakplanla_push_tokens" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

-- /rows/0/technical_definitions/grants/266 grantor=postgres
GRANT INSERT ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/267 grantor=postgres
GRANT SELECT ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/268 grantor=postgres
GRANT UPDATE ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/269 grantor=postgres
GRANT DELETE ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/270 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/271 grantor=postgres
GRANT REFERENCES ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/272 grantor=postgres
GRANT TRIGGER ON TABLE "public"."rate_limit_counters" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/273 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."rate_limit_counters" TO "service_role";

-- /rows/0/technical_definitions/grants/274 grantor=postgres
GRANT REFERENCES ON TABLE "public"."rate_limit_counters" TO "service_role";

-- /rows/0/technical_definitions/grants/275 grantor=postgres
GRANT TRIGGER ON TABLE "public"."rate_limit_counters" TO "service_role";

-- /rows/0/technical_definitions/grants/276 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/277 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/278 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/279 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/280 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/281 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/282 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_progress" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/283 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/284 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/285 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/286 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/287 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/288 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/289 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_progress" TO "service_role";

-- /rows/0/technical_definitions/grants/290 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_progress" TO "authenticated";

-- /rows/0/technical_definitions/grants/291 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/292 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/293 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/294 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/295 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/296 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/297 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/298 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/299 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/300 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/301 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/302 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/303 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/304 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/305 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_shifts" TO "authenticated";

-- /rows/0/technical_definitions/grants/306 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/307 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/308 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/309 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/310 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/311 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/312 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/313 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/314 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/315 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/316 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/317 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/318 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/319 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/320 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/321 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/322 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/323 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/324 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/325 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/326 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_coupons" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/327 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/328 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/329 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/330 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/331 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/332 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/333 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_isbasi_coupons" TO "service_role";

-- /rows/0/technical_definitions/grants/334 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_isbasi_coupons" TO "authenticated";

-- /rows/0/technical_definitions/grants/335 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/336 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/337 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/338 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/339 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/340 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/341 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_businesses" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/342 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/343 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/344 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/345 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/346 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/347 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/348 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_businesses" TO "service_role";

-- /rows/0/technical_definitions/grants/349 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/350 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/351 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/352 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/353 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/354 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/355 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_business_members" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/356 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/357 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/358 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/359 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/360 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/361 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/362 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_business_members" TO "service_role";

-- /rows/0/technical_definitions/grants/363 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/364 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/365 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/366 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/367 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/368 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/369 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_shifts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/370 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/371 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/372 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/373 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/374 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/375 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/376 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_shifts" TO "service_role";

-- /rows/0/technical_definitions/grants/377 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/378 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/379 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/380 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/381 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/382 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/383 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_applications" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/384 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/385 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/386 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/387 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/388 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/389 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/390 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_applications" TO "service_role";

-- /rows/0/technical_definitions/grants/391 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/392 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/393 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/394 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/395 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/396 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/397 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_attendance" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/398 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/399 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/400 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/401 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/402 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/403 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/404 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_attendance" TO "service_role";

-- /rows/0/technical_definitions/grants/405 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/406 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/407 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/408 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/409 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/410 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/411 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_reviews" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/412 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/413 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/414 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/415 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/416 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/417 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/418 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_reviews" TO "service_role";

-- /rows/0/technical_definitions/grants/419 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/420 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/421 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/422 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/423 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/424 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/425 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_offers" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/426 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/427 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/428 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/429 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/430 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/431 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/432 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_offers" TO "service_role";

-- /rows/0/technical_definitions/grants/433 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/434 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/435 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/436 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/437 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/438 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/439 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_reports" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/440 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/441 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/442 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/443 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/444 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/445 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/446 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_reports" TO "service_role";

-- /rows/0/technical_definitions/grants/447 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/448 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/449 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/450 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/451 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/452 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/453 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_audit" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/454 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/455 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/456 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/457 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/458 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/459 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/460 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_audit" TO "service_role";

-- /rows/0/technical_definitions/grants/461 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/462 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/463 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/464 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/465 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/466 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/467 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_candidates" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/468 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/469 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/470 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/471 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/472 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/473 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/474 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_candidates" TO "service_role";

-- /rows/0/technical_definitions/grants/475 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_candidates" TO "authenticated";

-- /rows/0/technical_definitions/grants/476 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/477 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/478 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/479 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/480 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/481 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/482 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_events" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/483 grantor=postgres
GRANT INSERT ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/484 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/485 grantor=postgres
GRANT UPDATE ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/486 grantor=postgres
GRANT DELETE ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/487 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/488 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/489 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bk_events" TO "service_role";

-- /rows/0/technical_definitions/grants/490 grantor=postgres
GRANT SELECT ON TABLE "public"."bk_events" TO "authenticated";

-- /rows/0/technical_definitions/grants/491 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/492 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/493 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/494 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/495 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/496 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/497 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_feature_trials" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/498 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_feature_trials" TO "service_role";

-- /rows/0/technical_definitions/grants/499 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_feature_trials" TO "service_role";

-- /rows/0/technical_definitions/grants/500 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_feature_trials" TO "service_role";

-- /rows/0/technical_definitions/grants/501 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_feature_trials" TO "authenticated";

-- /rows/0/technical_definitions/grants/502 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/503 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/504 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/505 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/506 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/507 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/508 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_backups" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/509 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_backups" TO "service_role";

-- /rows/0/technical_definitions/grants/510 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_backups" TO "service_role";

-- /rows/0/technical_definitions/grants/511 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_backups" TO "service_role";

-- /rows/0/technical_definitions/grants/512 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_backups" TO "authenticated";

-- /rows/0/technical_definitions/grants/513 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_backups" TO "authenticated";

-- /rows/0/technical_definitions/grants/514 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_backups" TO "authenticated";

-- /rows/0/technical_definitions/grants/515 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_backups" TO "authenticated";

-- /rows/0/technical_definitions/grants/516 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/517 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/518 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/519 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/520 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/521 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/522 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_devices" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/523 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_devices" TO "service_role";

-- /rows/0/technical_definitions/grants/524 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_devices" TO "service_role";

-- /rows/0/technical_definitions/grants/525 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_devices" TO "service_role";

-- /rows/0/technical_definitions/grants/526 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_devices" TO "authenticated";

-- /rows/0/technical_definitions/grants/527 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_devices" TO "authenticated";

-- /rows/0/technical_definitions/grants/528 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_devices" TO "authenticated";

-- /rows/0/technical_definitions/grants/529 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_devices" TO "authenticated";

-- /rows/0/technical_definitions/grants/530 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/531 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/532 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/533 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/534 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/535 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/536 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_entitlements" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/537 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_entitlements" TO "service_role";

-- /rows/0/technical_definitions/grants/538 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_entitlements" TO "service_role";

-- /rows/0/technical_definitions/grants/539 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_entitlements" TO "service_role";

-- /rows/0/technical_definitions/grants/540 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_entitlements" TO "authenticated";

-- /rows/0/technical_definitions/grants/541 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/542 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/543 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/544 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/545 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/546 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/547 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_promo_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/548 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_promo_codes" TO "service_role";

-- /rows/0/technical_definitions/grants/549 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_promo_codes" TO "service_role";

-- /rows/0/technical_definitions/grants/550 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_promo_codes" TO "service_role";

-- /rows/0/technical_definitions/grants/551 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/552 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/553 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/554 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/555 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/556 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/557 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_pairings" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/558 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_pairings" TO "service_role";

-- /rows/0/technical_definitions/grants/559 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_pairings" TO "service_role";

-- /rows/0/technical_definitions/grants/560 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_pairings" TO "service_role";

-- /rows/0/technical_definitions/grants/561 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/562 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/563 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/564 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/565 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/566 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/567 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_promo_attempts" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/568 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_promo_attempts" TO "service_role";

-- /rows/0/technical_definitions/grants/569 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_promo_attempts" TO "service_role";

-- /rows/0/technical_definitions/grants/570 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_promo_attempts" TO "service_role";

-- /rows/0/technical_definitions/grants/571 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/572 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/573 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/574 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/575 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/576 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/577 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_deletion_log" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/578 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_deletion_log" TO "service_role";

-- /rows/0/technical_definitions/grants/579 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_deletion_log" TO "service_role";

-- /rows/0/technical_definitions/grants/580 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_deletion_log" TO "service_role";

-- /rows/0/technical_definitions/grants/581 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/582 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/583 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/584 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/585 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/586 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/587 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_partners" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/588 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_partners" TO "service_role";

-- /rows/0/technical_definitions/grants/589 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_partners" TO "service_role";

-- /rows/0/technical_definitions/grants/590 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_partners" TO "service_role";

-- /rows/0/technical_definitions/grants/591 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/592 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/593 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/594 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/595 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/596 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/597 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_partner_codes" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/598 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_partner_codes" TO "service_role";

-- /rows/0/technical_definitions/grants/599 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_partner_codes" TO "service_role";

-- /rows/0/technical_definitions/grants/600 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_partner_codes" TO "service_role";

-- /rows/0/technical_definitions/grants/601 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/602 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/603 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/604 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/605 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/606 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/607 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_ai_usage" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/608 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_ai_usage" TO "service_role";

-- /rows/0/technical_definitions/grants/609 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_ai_usage" TO "service_role";

-- /rows/0/technical_definitions/grants/610 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_ai_usage" TO "service_role";

-- /rows/0/technical_definitions/grants/611 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/612 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/613 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/614 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/615 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/616 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/617 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_business_requests" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/618 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_business_requests" TO "anon";

-- /rows/0/technical_definitions/grants/619 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_business_requests" TO "anon";

-- /rows/0/technical_definitions/grants/620 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_business_requests" TO "anon";

-- /rows/0/technical_definitions/grants/621 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_business_requests" TO "authenticated";

-- /rows/0/technical_definitions/grants/622 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_business_requests" TO "authenticated";

-- /rows/0/technical_definitions/grants/623 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_business_requests" TO "authenticated";

-- /rows/0/technical_definitions/grants/624 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_business_requests" TO "authenticated";

-- /rows/0/technical_definitions/grants/625 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_business_requests" TO "service_role";

-- /rows/0/technical_definitions/grants/626 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_business_requests" TO "service_role";

-- /rows/0/technical_definitions/grants/627 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_business_requests" TO "service_role";

-- /rows/0/technical_definitions/grants/628 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_business_requests" TO "service_role";

-- /rows/0/technical_definitions/grants/629 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_business_requests" TO "service_role";

-- /rows/0/technical_definitions/grants/630 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/631 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/632 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/633 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/634 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/635 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/636 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_partner_fails" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/637 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_partner_fails" TO "service_role";

-- /rows/0/technical_definitions/grants/638 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_partner_fails" TO "service_role";

-- /rows/0/technical_definitions/grants/639 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_partner_fails" TO "service_role";

-- /rows/0/technical_definitions/grants/640 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/641 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/642 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/643 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/644 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/645 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/646 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_shopping_plans" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/647 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_shopping_plans" TO "service_role";

-- /rows/0/technical_definitions/grants/648 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_shopping_plans" TO "service_role";

-- /rows/0/technical_definitions/grants/649 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_shopping_plans" TO "service_role";

-- /rows/0/technical_definitions/grants/650 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_shopping_plans" TO "authenticated";

-- /rows/0/technical_definitions/grants/651 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_shopping_plans" TO "authenticated";

-- /rows/0/technical_definitions/grants/652 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/653 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/654 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/655 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/656 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/657 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/658 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_push_tokens" TO "postgres" WITH GRANT OPTION;

-- /rows/0/technical_definitions/grants/659 grantor=postgres
GRANT TRUNCATE ON TABLE "public"."bakplanla_push_tokens" TO "service_role";

-- /rows/0/technical_definitions/grants/660 grantor=postgres
GRANT REFERENCES ON TABLE "public"."bakplanla_push_tokens" TO "service_role";

-- /rows/0/technical_definitions/grants/661 grantor=postgres
GRANT TRIGGER ON TABLE "public"."bakplanla_push_tokens" TO "service_role";

-- /rows/0/technical_definitions/grants/662 grantor=postgres
GRANT INSERT ON TABLE "public"."bakplanla_push_tokens" TO "authenticated";

-- /rows/0/technical_definitions/grants/663 grantor=postgres
GRANT SELECT ON TABLE "public"."bakplanla_push_tokens" TO "authenticated";

-- /rows/0/technical_definitions/grants/664 grantor=postgres
GRANT UPDATE ON TABLE "public"."bakplanla_push_tokens" TO "authenticated";

-- /rows/0/technical_definitions/grants/665 grantor=postgres
GRANT DELETE ON TABLE "public"."bakplanla_push_tokens" TO "authenticated";

REVOKE ALL ON FUNCTION "public"."bk_admin_hide_review"(p_review_id uuid, p_hidden boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_admin_hide_review"(p_review_id uuid, p_hidden boolean) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_admin_hide_review"(p_review_id uuid, p_hidden boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_admin_resolve_report"(p_report_id uuid, p_status text, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_admin_resolve_report"(p_report_id uuid, p_status text, p_note text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_admin_resolve_report"(p_report_id uuid, p_status text, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_roles"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_roles"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_roles"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_save_candidate"(p_display_name text, p_adult_confirmed boolean, p_city text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_save_candidate"(p_display_name text, p_adult_confirmed boolean, p_city text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_save_candidate"(p_display_name text, p_adult_confirmed boolean, p_city text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_seats_taken"(p_shift uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_seats_taken"(p_shift uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_seats_taken"(p_shift uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_respond_offer"(p_offer_id uuid, p_accept boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_respond_offer"(p_offer_id uuid, p_accept boolean) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_respond_offer"(p_offer_id uuid, p_accept boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_uid"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_uid"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_uid"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."check_rate_limit"(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."check_rate_limit"(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."check_rate_limit"(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_get_shift"(p_shift_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_get_shift"(p_shift_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_get_shift"(p_shift_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."isbasi_commit"(p_user_id uuid, p_shift_id uuid, p_old_version integer, p_progress jsonb, p_score integer, p_max_score integer, p_stars integer, p_coupon jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."isbasi_commit"(p_user_id uuid, p_shift_id uuid, p_old_version integer, p_progress jsonb, p_score integer, p_max_score integer, p_stars integer, p_coupon jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."isbasi_commit"(p_user_id uuid, p_shift_id uuid, p_old_version integer, p_progress jsonb, p_score integer, p_max_score integer, p_stars integer, p_coupon jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."isbasi_claim_shift"(p_shift_id uuid, p_user_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."isbasi_claim_shift"(p_shift_id uuid, p_user_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."isbasi_claim_shift"(p_shift_id uuid, p_user_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_admin_review_shift"(p_shift_id uuid, p_approve boolean, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_admin_review_shift"(p_shift_id uuid, p_approve boolean, p_note text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_admin_review_shift"(p_shift_id uuid, p_approve boolean, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_audit_log"(p_actor uuid, p_action text, p_target uuid, p_detail jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_audit_log"(p_actor uuid, p_action text, p_target uuid, p_detail jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_audit_log"(p_actor uuid, p_action text, p_target uuid, p_detail jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_badge_level"(p_user uuid, p_role text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_badge_level"(p_user uuid, p_role text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_badge_level"(p_user uuid, p_role text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_badges_of"(p_user uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_badges_of"(p_user uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_badges_of"(p_user uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_err"(p_code text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_err"(p_code text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_err"(p_code text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_is_member"(p_business uuid, p_user uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_is_member"(p_business uuid, p_user uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_is_member"(p_business uuid, p_user uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_role_max_level"(p_role text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_role_max_level"(p_role text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_role_max_level"(p_role text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_notify"(p_user uuid, p_kind text, p_ref uuid, p_data jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_notify"(p_user uuid, p_kind text, p_ref uuid, p_data jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_notify"(p_user uuid, p_kind text, p_ref uuid, p_data jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_notify_business"(p_business uuid, p_kind text, p_ref uuid, p_data jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_notify_business"(p_business uuid, p_kind text, p_ref uuid, p_data jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_notify_business"(p_business uuid, p_kind text, p_ref uuid, p_data jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_num"(p jsonb, k text, mn numeric, mx numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_num"(p jsonb, k text, mn numeric, mx numeric) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_num"(p jsonb, k text, mn numeric, mx numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_shift_end"(p_shift bk_shifts) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_shift_end"(p_shift bk_shifts) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_shift_end"(p_shift bk_shifts) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_shift_fields"(p jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_shift_fields"(p jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_shift_fields"(p jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_shift_public"(p_shift bk_shifts, p_uid uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_shift_public"(p_shift bk_shifts, p_uid uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_shift_public"(p_shift bk_shifts, p_uid uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_shift_start"(p_shift bk_shifts) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_shift_start"(p_shift bk_shifts) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_shift_start"(p_shift bk_shifts) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_today"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_today"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_today"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_get_me"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_get_me"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_get_me"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refund_feature_trial"(p_feature text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."refund_feature_trial"(p_feature text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."refund_feature_trial"(p_feature text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."consume_feature_trial"(p_feature text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."consume_feature_trial"(p_feature text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."consume_feature_trial"(p_feature text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_pairing_code"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_pairing_code"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."create_pairing_code"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."redeem_pairing_code"(p_code text, p_device_id text, p_name text, p_platform text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."redeem_pairing_code"(p_code text, p_device_id text, p_name text, p_platform text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."redeem_pairing_code"(p_code text, p_device_id text, p_name text, p_platform text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."bk_submit_review"(p_application_id uuid, p_side text, p_ratings jsonb, p_comment text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_submit_review"(p_application_id uuid, p_side text, p_ratings jsonb, p_comment text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_submit_review"(p_application_id uuid, p_side text, p_ratings jsonb, p_comment text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_promo_code"(p_email text, p_days integer, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_promo_code"(p_email text, p_days integer, p_note text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."bk_transition_ok"(p_from text, p_to text, p_actor text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_transition_ok"(p_from text, p_to text, p_actor text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_transition_ok"(p_from text, p_to text, p_actor text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."redeem_promo_code"(p_code text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."redeem_promo_code"(p_code text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."redeem_promo_code"(p_code text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_custom_promo_code"(p_code text, p_email text, p_days integer, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_custom_promo_code"(p_code text, p_email text, p_days integer, p_note text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."bk_report"(p_target_type text, p_target_id uuid, p_reason text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_report"(p_target_type text, p_target_id uuid, p_reason text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_report"(p_target_type text, p_target_id uuid, p_reason text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bakplanla__delete_where"(p_rel regclass, p_cond text, p_depth integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bakplanla__delete_where"(p_rel regclass, p_cond text, p_depth integer) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bakplanla__delete_where"(p_rel regclass, p_cond text, p_depth integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bakplanla_delete_user_data"(p_user uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bakplanla_delete_user_data"(p_user uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bakplanla_delete_user_data"(p_user uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_admin_set_business_status"(p_business_id uuid, p_status text, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_admin_set_business_status"(p_business_id uuid, p_status text, p_note text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_admin_set_business_status"(p_business_id uuid, p_status text, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_apply"(p_shift_id uuid, p_message text, p_share_history boolean, p_contact_phone text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_apply"(p_shift_id uuid, p_message text, p_share_history boolean, p_contact_phone text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_apply"(p_shift_id uuid, p_message text, p_share_history boolean, p_contact_phone text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_business_shifts"(p_business_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_business_shifts"(p_business_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_business_shifts"(p_business_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_cancel_application"(p_application_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_cancel_application"(p_application_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_cancel_application"(p_application_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_cancel_shift"(p_shift_id uuid, p_reason text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_cancel_shift"(p_shift_id uuid, p_reason text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_cancel_shift"(p_shift_id uuid, p_reason text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_confirm_legal"(p_application_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_confirm_legal"(p_application_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_confirm_legal"(p_application_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_create_shift"(p_business_id uuid, p jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_create_shift"(p_business_id uuid, p jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_create_shift"(p_business_id uuid, p jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_decide_application"(p_application_id uuid, p_status text, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_decide_application"(p_application_id uuid, p_status text, p_note text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_decide_application"(p_application_id uuid, p_status text, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_txt"(p jsonb, k text, mn integer, mx integer, required boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_txt"(p jsonb, k text, mn integer, mx integer, required boolean) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_txt"(p jsonb, k text, mn integer, mx integer, required boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_issue_checkin_token"(p_application_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_issue_checkin_token"(p_application_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_issue_checkin_token"(p_application_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_list_open_shifts"(p_role text, p_from date, p_to date, p_min_pay numeric, p_only_eligible boolean, p_only_open_seats boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_list_open_shifts"(p_role text, p_from date, p_to date, p_min_pay numeric, p_only_eligible boolean, p_only_open_seats boolean) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_list_open_shifts"(p_role text, p_from date, p_to date, p_min_pay numeric, p_only_eligible boolean, p_only_open_seats boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_manual_attendance"(p_application_id uuid, p_action text, p_note text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_manual_attendance"(p_application_id uuid, p_action text, p_note text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_manual_attendance"(p_application_id uuid, p_action text, p_note text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_mark_events_read"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_mark_events_read"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_mark_events_read"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_my_applications"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_my_applications"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_my_applications"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_my_businesses"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_my_businesses"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_my_businesses"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_my_events"(p_limit integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_my_events"(p_limit integer) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_my_events"(p_limit integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_my_passport"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_my_passport"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_my_passport"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_redeem_checkin"(p_payload text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_redeem_checkin"(p_payload text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_redeem_checkin"(p_payload text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_register_business"(p jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_register_business"(p jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_register_business"(p jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_send_offer"(p_application_id uuid, p jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_send_offer"(p_application_id uuid, p jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_send_offer"(p_application_id uuid, p jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_shift_applicants"(p_shift_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_shift_applicants"(p_shift_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_shift_applicants"(p_shift_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bakplanla_check_cron_secret"(p_secret text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bakplanla_check_cron_secret"(p_secret text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bakplanla_check_cron_secret"(p_secret text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_update_shift"(p_shift_id uuid, p jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_update_shift"(p_shift_id uuid, p jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_update_shift"(p_shift_id uuid, p jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_valid_ratings"(p_side text, p_ratings jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_valid_ratings"(p_side text, p_ratings jsonb) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_valid_ratings"(p_side text, p_ratings jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."bk_withdraw_offer"(p_offer_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bk_withdraw_offer"(p_offer_id uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bk_withdraw_offer"(p_offer_id uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."partner_discount_code"(p_partner text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."partner_discount_code"(p_partner text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."partner_discount_code"(p_partner text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."partner_redeem_code"(p_partner text, p_pin text, p_code text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."partner_redeem_code"(p_partner text, p_pin text, p_code text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."partner_redeem_code"(p_partner text, p_pin text, p_code text) TO "anon";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."partner_redeem_code"(p_partner text, p_pin text, p_code text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."bakplanla_is_pro"(p_user uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bakplanla_is_pro"(p_user uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bakplanla_is_pro"(p_user uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."ai_usage_take"(p_user uuid, p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."ai_usage_take"(p_user uuid, p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."ai_usage_take"(p_user uuid, p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."ai_usage_refund"(p_user uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."ai_usage_refund"(p_user uuid) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."ai_usage_refund"(p_user uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."ai_usage_status"(p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."ai_usage_status"(p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."ai_usage_status"(p_pro_daily integer, p_pro_monthly integer, p_free_daily integer, p_free_monthly integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."business_request_submit"(p_business_name text, p_category text, p_contact_name text, p_phone text, p_email text, p_district text, p_address text, p_website text, p_instagram text, p_description text, p_offer text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."business_request_submit"(p_business_name text, p_category text, p_contact_name text, p_phone text, p_email text, p_district text, p_address text, p_website text, p_instagram text, p_description text, p_offer text) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."business_request_submit"(p_business_name text, p_category text, p_contact_name text, p_phone text, p_email text, p_district text, p_address text, p_website text, p_instagram text, p_description text, p_offer text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."business_list_approved"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."business_list_approved"() TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."business_list_approved"() TO "anon";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."business_list_approved"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."bakplanla_claim_due_shopping_plans"(p_limit integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."bakplanla_claim_due_shopping_plans"(p_limit integer) TO "postgres";

-- grantor=postgres
GRANT EXECUTE ON FUNCTION "public"."bakplanla_claim_due_shopping_plans"(p_limit integer) TO "service_role";
