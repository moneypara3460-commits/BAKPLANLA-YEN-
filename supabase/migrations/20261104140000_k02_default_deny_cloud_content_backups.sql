-- K02: block new user-content cloud backups until a separately approved policy
-- and reviewed configuration change exist. Historical reads/restores/deletes
-- remain available.

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.bakplanla_cloud_content_backup_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton IS TRUE),
  allow_content_backups boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE app_private.bakplanla_cloud_content_backup_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.bakplanla_cloud_content_backup_policy FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE app_private.bakplanla_cloud_content_backup_policy
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO app_private.bakplanla_cloud_content_backup_policy (singleton, allow_content_backups)
VALUES (true, false)
ON CONFLICT (singleton) DO UPDATE
SET allow_content_backups = false,
    changed_at = clock_timestamp();

CREATE OR REPLACE FUNCTION app_private.bakplanla_cloud_content_backup_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE((
    SELECT policy.allow_content_backups
      FROM app_private.bakplanla_cloud_content_backup_policy AS policy
     WHERE policy.singleton IS TRUE
  ), false);
$function$;

ALTER FUNCTION app_private.bakplanla_cloud_content_backup_enabled() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.bakplanla_cloud_content_backup_enabled()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bakplanla_cloud_backup_writes_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(auth.uid() IS NOT NULL AND app_private.bakplanla_cloud_content_backup_enabled(), false);
$function$;

ALTER FUNCTION public.bakplanla_cloud_backup_writes_allowed() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bakplanla_cloud_backup_writes_allowed()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_cloud_backup_writes_allowed() TO authenticated;

CREATE OR REPLACE FUNCTION public.bakplanla_require_cloud_content_backup_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT app_private.bakplanla_cloud_content_backup_enabled() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'PZ001',
      MESSAGE = 'cloud_backup_writes_disabled';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.bakplanla_require_cloud_content_backup_policy() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bakplanla_require_cloud_content_backup_policy()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bakplanla_backups_require_content_policy ON public.bakplanla_backups;
CREATE TRIGGER bakplanla_backups_require_content_policy
  BEFORE INSERT OR UPDATE ON public.bakplanla_backups
  FOR EACH ROW EXECUTE FUNCTION public.bakplanla_require_cloud_content_backup_policy();

-- Storage may finalize uploads (including previously signed uploads) through
-- its privileged database role. RLS alone cannot fence that path. Check both
-- sides of an update so moving an existing document object is also denied.
CREATE OR REPLACE FUNCTION public.bakplanla_require_cloud_image_backup_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.bucket_id = 'bakplanla-documents'
     OR (TG_OP = 'UPDATE' AND OLD.bucket_id = 'bakplanla-documents') THEN
    IF NOT app_private.bakplanla_cloud_content_backup_enabled() THEN
      RAISE EXCEPTION USING
        ERRCODE = 'PZ001',
        MESSAGE = 'cloud_backup_writes_disabled';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.bakplanla_require_cloud_image_backup_policy() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bakplanla_require_cloud_image_backup_policy()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS bakplanla_documents_require_content_policy ON storage.objects;
CREATE TRIGGER bakplanla_documents_require_content_policy
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.bakplanla_require_cloud_image_backup_policy();

-- Retain the existing permissive owner policies. Restrictive policies are
-- ANDed with every permissive policy, so an additional permissive policy
-- cannot bypass the closed-by-default state.
DROP POLICY IF EXISTS "bakplanla_backup_write_policy_gate" ON public.bakplanla_backups;
CREATE POLICY "bakplanla_backup_write_policy_gate" ON public.bakplanla_backups
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.bakplanla_cloud_backup_writes_allowed());

DROP POLICY IF EXISTS "bakplanla_backup_update_policy_gate" ON public.bakplanla_backups;
CREATE POLICY "bakplanla_backup_update_policy_gate" ON public.bakplanla_backups
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.bakplanla_cloud_backup_writes_allowed())
  WITH CHECK (public.bakplanla_cloud_backup_writes_allowed());

DROP POLICY IF EXISTS "bakplanla_docs_insert_policy_gate" ON storage.objects;
CREATE POLICY "bakplanla_docs_insert_policy_gate" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'bakplanla-documents'
    OR public.bakplanla_cloud_backup_writes_allowed()
  );

DROP POLICY IF EXISTS "bakplanla_docs_update_policy_gate" ON storage.objects;
CREATE POLICY "bakplanla_docs_update_policy_gate" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'bakplanla-documents'
    OR public.bakplanla_cloud_backup_writes_allowed()
  )
  WITH CHECK (
    bucket_id <> 'bakplanla-documents'
    OR public.bakplanla_cloud_backup_writes_allowed()
  );

COMMENT ON TABLE app_private.bakplanla_cloud_content_backup_policy IS
  'Server-owned fail-closed control for new unrestricted user-content cloud backups; no client toggle.';
