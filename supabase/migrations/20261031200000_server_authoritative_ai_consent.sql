-- ENG-11: keep the existing notice version, but move provider authorization to
-- a durable server-owned record. Legacy metadata/local keys are not migrated.

CREATE TABLE public.bakplanla_ai_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_version text NOT NULL,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bakplanla_ai_consents_state_check
    CHECK (consented_at IS NULL OR withdrawn_at IS NULL)
);

ALTER TABLE public.bakplanla_ai_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.bakplanla_ai_consents FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_consent_is_active(p_user uuid DEFAULT NULL)
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
  ELSIF p_user IS NOT NULL AND p_user <> v_uid THEN
    -- Authenticated clients can inspect only their own state, even when they
    -- supply a different UUID. The supplied id is never the authority.
    RETURN FALSE;
  END IF;

  PERFORM 1
    FROM public.bakplanla_ai_consents AS c
   WHERE c.user_id = v_uid
     AND c.consent_version = '2026-10-v1'
     AND c.consented_at IS NOT NULL
     AND c.withdrawn_at IS NULL
   FOR SHARE;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_ai_consent(p_version text, p_expected_user uuid)
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
  IF p_version IS DISTINCT FROM '2026-10-v1' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_mismatch');
  END IF;

  INSERT INTO public.bakplanla_ai_consents AS c
    (user_id, consent_version, consented_at, withdrawn_at, updated_at)
  VALUES (v_uid, p_version, clock_timestamp(), NULL, clock_timestamp())
  ON CONFLICT (user_id) DO UPDATE
    SET consent_version = excluded.consent_version,
        consented_at = clock_timestamp(),
        withdrawn_at = NULL,
        updated_at = clock_timestamp();

  RETURN jsonb_build_object('ok', true, 'version', p_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_ai_consent(p_expected_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_expected_user IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_mismatch');
  END IF;

  INSERT INTO public.bakplanla_ai_consents AS c
    (user_id, consent_version, consented_at, withdrawn_at, updated_at)
  VALUES (v_uid, '2026-10-v1', NULL, v_now, v_now)
  ON CONFLICT (user_id) DO UPDATE
    SET consented_at = NULL,
        withdrawn_at = clock_timestamp(),
        updated_at = clock_timestamp();

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_consent_is_active(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_ai_consent(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.withdraw_ai_consent(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ai_consent_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_ai_consent(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_ai_consent(uuid) TO authenticated;
