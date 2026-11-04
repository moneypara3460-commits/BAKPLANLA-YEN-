-- ENG-16: require a fresh affirmative consent after the AI data-control notice
-- was corrected. Existing 2026-10-v1 records are not promoted or rewritten.

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
    RETURN FALSE;
  END IF;

  PERFORM 1
    FROM public.bakplanla_ai_consents AS c
   WHERE c.user_id = v_uid
     AND c.consent_version = '2026-11-v1'
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
  IF p_version IS DISTINCT FROM '2026-11-v1' THEN
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

REVOKE ALL ON FUNCTION public.ai_consent_is_active(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_ai_consent(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_consent_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_ai_consent(text, uuid) TO authenticated;
