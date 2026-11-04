-- Purpose-scoped technical authorization for optional AI provider processing.
-- This is not a legal basis or international-transfer mechanism. The purpose
-- stays disabled until a separately reviewed migration supplies approved copy,
-- version, controller decision, and legal/provider evidence.

CREATE TABLE app_private.bakplanla_ai_purpose_policy (
  purpose text PRIMARY KEY CHECK (purpose = 'ai_provider_processing'),
  active_version text,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bakplanla_ai_purpose_disabled_without_version
    CHECK (enabled = false OR active_version IS NOT NULL)
);

INSERT INTO app_private.bakplanla_ai_purpose_policy (purpose, active_version, enabled)
VALUES ('ai_provider_processing', NULL, false)
ON CONFLICT (purpose) DO NOTHING;

CREATE TABLE app_private.bakplanla_ai_purpose_authorizations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL REFERENCES app_private.bakplanla_ai_purpose_policy(purpose),
  purpose_version text NOT NULL,
  authorized_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose),
  CONSTRAINT bakplanla_ai_purpose_authorization_state_check
    CHECK (withdrawn_at IS NULL OR withdrawn_at >= authorized_at)
);

ALTER TABLE app_private.bakplanla_ai_purpose_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.bakplanla_ai_purpose_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE app_private.bakplanla_ai_purpose_policy
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE app_private.bakplanla_ai_purpose_authorizations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_provider_authorization_active(p_user uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' OR p_user IS NULL THEN
      RETURN FALSE;
    END IF;
    v_uid := p_user;
  ELSIF p_user IS NOT NULL AND p_user IS DISTINCT FROM v_uid THEN
    RETURN FALSE;
  END IF;

  PERFORM 1
    FROM app_private.bakplanla_ai_purpose_policy AS policy
    JOIN app_private.bakplanla_ai_purpose_authorizations AS grant_row
      ON grant_row.purpose = policy.purpose
   WHERE policy.purpose = 'ai_provider_processing'
     AND policy.enabled = TRUE
     AND policy.active_version IS NOT NULL
     AND grant_row.user_id = v_uid
     AND grant_row.purpose_version = policy.active_version
     AND grant_row.authorized_at IS NOT NULL
     AND grant_row.withdrawn_at IS NULL
   FOR SHARE OF grant_row;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_ai_provider_authorization(
  p_version text,
  p_expected_user uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active_version text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_expected_user IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_mismatch');
  END IF;

  SELECT active_version
    INTO v_active_version
    FROM app_private.bakplanla_ai_purpose_policy
   WHERE purpose = 'ai_provider_processing'
     AND enabled = TRUE
     AND active_version IS NOT NULL
   FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'purpose_unavailable');
  END IF;
  IF p_version IS DISTINCT FROM v_active_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_mismatch');
  END IF;

  INSERT INTO app_private.bakplanla_ai_purpose_authorizations AS grant_row
    (user_id, purpose, purpose_version, authorized_at, withdrawn_at, updated_at)
  VALUES (v_uid, 'ai_provider_processing', v_active_version, clock_timestamp(), NULL, clock_timestamp())
  ON CONFLICT (user_id, purpose) DO UPDATE
    SET purpose_version = EXCLUDED.purpose_version,
        authorized_at = clock_timestamp(),
        withdrawn_at = NULL,
        updated_at = clock_timestamp();

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_ai_provider_authorization(p_expected_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_expected_user IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_mismatch');
  END IF;

  UPDATE app_private.bakplanla_ai_purpose_authorizations
     SET withdrawn_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE user_id = v_uid
     AND purpose = 'ai_provider_processing'
     AND withdrawn_at IS NULL;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_provider_authorization_active(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_ai_provider_authorization(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.withdraw_ai_provider_authorization(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ai_provider_authorization_active(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_ai_provider_authorization(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_ai_provider_authorization(uuid)
  TO authenticated;
