-- ENG-14 DEV-only scheduler configuration.
-- The job is created inactive. This migration never invokes the Edge Function.
-- Rollback (DEV only): first verify this exact job is still inactive, call
-- cron.unschedule(jobid) for its exact name, then drop the function and empty
-- private schema. Do not use CASCADE. Remove only the two named Vault entries
-- through the Dashboard after the job is unscheduled and no request is queued.

CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;

DO $schema_owner_check$
BEGIN
  IF (SELECT n.nspowner <> 'postgres'::regrole
      FROM pg_namespace AS n
      WHERE n.nspname = 'private') THEN
    RAISE EXCEPTION 'private schema must be owned by postgres';
  END IF;
END;
$schema_owner_check$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO postgres;

CREATE OR REPLACE FUNCTION private.bakplanla_dispatch_shopping_reminder()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $dispatch$
DECLARE
  v_cron_secret text;
  v_gateway_apikey text;
BEGIN
  SELECT ds.decrypted_secret
    INTO v_cron_secret
    FROM vault.decrypted_secrets AS ds
    WHERE ds.name = 'bakplanla_shopping_cron_secret';

  SELECT ds.decrypted_secret
    INTO v_gateway_apikey
    FROM vault.decrypted_secrets AS ds
    WHERE ds.name = 'bakplanla_shopping_gateway_apikey';

  IF v_cron_secret IS NULL OR v_gateway_apikey IS NULL THEN
    RAISE EXCEPTION 'shopping reminder scheduler configuration is incomplete';
  END IF;

  PERFORM net.http_post(
    url := 'https://tlizbrhmwaesfjmtxcgh.supabase.co/functions/v1/shopping-reminder',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_gateway_apikey,
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
END;
$dispatch$;

ALTER FUNCTION private.bakplanla_dispatch_shopping_reminder() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.bakplanla_dispatch_shopping_reminder()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.bakplanla_dispatch_shopping_reminder() TO postgres;

DO $inactive_job$
DECLARE
  v_existing_count bigint;
  v_existing_matches boolean;
  v_job_name constant text := 'bakplanla-shopping-reminder-dev';
  v_schedule constant text := '*/10 * * * *';
  v_command constant text := 'SELECT private.bakplanla_dispatch_shopping_reminder();';
BEGIN
  SELECT count(*),
         coalesce(bool_and(
           schedule = v_schedule
           AND command = v_command
           AND database = current_database()
           AND username = current_user
           AND active = false
         ), false)
    INTO v_existing_count, v_existing_matches
    FROM cron.job
    WHERE jobname = v_job_name;

  IF v_existing_count > 0 THEN
    IF v_existing_count = 1 AND v_existing_matches THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'a shopping reminder job with unexpected configuration already exists';
  END IF;

  PERFORM cron.schedule_in_database(
    v_job_name,
    v_schedule,
    v_command,
    current_database(),
    NULL,
    false
  );
END;
$inactive_job$;
