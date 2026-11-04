-- ENG-07: short-lived opaque receipt for deletion status reconciliation.
-- The receipt credential is never stored here; only its SHA-256 hash is kept.
CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION postgres;
ALTER SCHEMA app_private OWNER TO postgres;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE app_private.account_deletion_receipts (
  credential_hash text PRIMARY KEY CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  owner_user_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'partial', 'completed', 'unknown')),
  stage text CHECK (stage IN ('storage', 'database', 'auth')),
  storage_done boolean NOT NULL DEFAULT false,
  database_done boolean NOT NULL DEFAULT false,
  auth_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  CHECK (expires_at <= created_at + interval '72 hours'),
  CHECK (NOT database_done OR storage_done),
  CHECK (NOT auth_done OR (storage_done AND database_done)),
  CHECK (state <> 'completed' OR (storage_done AND database_done AND auth_done))
);

ALTER TABLE app_private.account_deletion_receipts OWNER TO postgres;
ALTER TABLE app_private.account_deletion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.account_deletion_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.account_deletion_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bakplanla_deletion_receipt_begin(p_hash text, p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
DECLARE
  v_row app_private.account_deletion_receipts%ROWTYPE;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_owner IS NULL THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;

  INSERT INTO app_private.account_deletion_receipts (credential_hash, owner_user_id)
  VALUES (p_hash, p_owner)
  ON CONFLICT (credential_hash) DO NOTHING;

  SELECT * INTO v_row
  FROM app_private.account_deletion_receipts
  WHERE credential_hash = p_hash
  FOR UPDATE;

  IF NOT FOUND OR v_row.owner_user_id <> p_owner OR v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;

  IF v_row.state <> 'completed' THEN
    UPDATE app_private.account_deletion_receipts
    SET state = 'pending', stage = NULL, updated_at = now()
    WHERE credential_hash = p_hash
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'state', v_row.state, 'stage', v_row.stage,
    'storage_done', v_row.storage_done, 'database_done', v_row.database_done,
    'auth_done', v_row.auth_done, 'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bakplanla_deletion_receipt_mark(
  p_hash text, p_owner uuid, p_step text, p_result text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
DECLARE
  v_row app_private.account_deletion_receipts%ROWTYPE;
BEGIN
  IF p_hash IS NULL OR p_owner IS NULL OR p_step IS NULL OR p_result IS NULL
     OR p_hash !~ '^[0-9a-f]{64}$'
     OR p_step NOT IN ('storage', 'database', 'auth')
     OR p_result NOT IN ('completed', 'partial', 'unknown') THEN
    RETURN jsonb_build_object('state', 'unavailable');
  END IF;

  SELECT * INTO v_row
  FROM app_private.account_deletion_receipts
  WHERE credential_hash = p_hash AND owner_user_id = p_owner AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'unavailable'); END IF;
  IF v_row.state = 'completed' THEN
    RETURN jsonb_build_object('state', 'completed', 'storage_done', true, 'database_done', true, 'auth_done', true);
  END IF;

  IF p_result = 'completed' THEN
    IF p_step = 'storage' THEN
      UPDATE app_private.account_deletion_receipts
      SET storage_done = true, state = 'pending', stage = NULL, updated_at = now()
      WHERE credential_hash = p_hash RETURNING * INTO v_row;
    ELSIF p_step = 'database' AND v_row.storage_done THEN
      UPDATE app_private.account_deletion_receipts
      SET database_done = true, state = 'pending', stage = NULL, updated_at = now()
      WHERE credential_hash = p_hash RETURNING * INTO v_row;
    ELSIF p_step = 'auth' AND v_row.storage_done AND v_row.database_done THEN
      UPDATE app_private.account_deletion_receipts
      SET auth_done = true, state = 'completed', stage = NULL, updated_at = now()
      WHERE credential_hash = p_hash RETURNING * INTO v_row;
    ELSE
      RAISE EXCEPTION 'deletion receipt step out of order';
    END IF;
  ELSE
    UPDATE app_private.account_deletion_receipts
    SET state = p_result, stage = p_step, updated_at = now()
    WHERE credential_hash = p_hash RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'state', v_row.state, 'stage', v_row.stage,
    'storage_done', v_row.storage_done, 'database_done', v_row.database_done,
    'auth_done', v_row.auth_done, 'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bakplanla_deletion_receipt_get(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
DECLARE v_row app_private.account_deletion_receipts%ROWTYPE;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_row
  FROM app_private.account_deletion_receipts
  WHERE credential_hash = p_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_row.expires_at <= now() THEN RETURN jsonb_build_object('state', 'expired'); END IF;
  RETURN jsonb_build_object(
    'owner_user_id', v_row.owner_user_id,
    'state', v_row.state, 'stage', v_row.stage,
    'storage_done', v_row.storage_done, 'database_done', v_row.database_done,
    'auth_done', v_row.auth_done, 'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bakplanla_deletion_receipt_purge_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM app_private.account_deletion_receipts WHERE expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.bakplanla_deletion_receipt_begin(text, uuid) OWNER TO postgres;
ALTER FUNCTION public.bakplanla_deletion_receipt_mark(text, uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.bakplanla_deletion_receipt_get(text) OWNER TO postgres;
ALTER FUNCTION public.bakplanla_deletion_receipt_purge_expired() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.bakplanla_deletion_receipt_begin(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bakplanla_deletion_receipt_mark(text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bakplanla_deletion_receipt_get(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bakplanla_deletion_receipt_purge_expired() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_deletion_receipt_begin(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_deletion_receipt_mark(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_deletion_receipt_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_deletion_receipt_purge_expired() TO postgres;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname = 'bakplanla-deletion-receipt-purge' LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'bakplanla-deletion-receipt-purge',
    '*/5 * * * *',
    'SELECT public.bakplanla_deletion_receipt_purge_expired();'
  );
END;
$$;
