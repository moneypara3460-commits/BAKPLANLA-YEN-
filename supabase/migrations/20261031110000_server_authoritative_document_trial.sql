-- ENG-12: the Edge Function is authoritative for document-analysis trial use.
-- Client-side trial reads are only a UI preview; they never grant the paid request.

CREATE OR REPLACE FUNCTION public.consume_feature_trial_for_user(p_user uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'user is required' USING ERRCODE = '22023';
  END IF;
  IF p_feature IS DISTINCT FROM 'documentAnalysis' THEN
    RAISE EXCEPTION 'unknown feature' USING ERRCODE = '22023';
  END IF;

  IF public.bakplanla_is_pro(p_user) THEN
    RETURN jsonb_build_object('allowed', true, 'pro', true);
  END IF;

  INSERT INTO public.bakplanla_feature_trials AS t
    (user_id, feature, used_count, first_used_at, last_used_at)
  VALUES (p_user, p_feature, 1, now(), now())
  ON CONFLICT (user_id, feature) DO UPDATE
    SET used_count = t.used_count + 1,
        last_used_at = now()
    WHERE t.used_count < 1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('allowed', v_rows = 1, 'pro', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_feature_trial_for_user(p_user uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF p_user IS NULL OR p_feature IS DISTINCT FROM 'documentAnalysis' THEN
    RAISE EXCEPTION 'invalid trial refund' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bakplanla_feature_trials AS t
     SET used_count = greatest(t.used_count - 1, 0),
         refunds = t.refunds + 1
   WHERE t.user_id = p_user
     AND t.feature = p_feature
     AND t.used_count > 0
     AND t.last_used_at > now() - interval '10 minutes'
     AND t.refunds < 5;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('refunded', v_rows = 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_feature_trial_for_user(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_feature_trial_for_user(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.refund_feature_trial_for_user(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_feature_trial_for_user(uuid, text) TO service_role;

-- A client could otherwise alternate consume/refund and repeatedly reset its own trial.
-- The current app now previews trial status read-only; the Edge Function owns refunds.
REVOKE ALL ON FUNCTION public.refund_feature_trial(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_feature_trial(text) TO postgres;

COMMENT ON FUNCTION public.consume_feature_trial_for_user(uuid, text) IS
  'Server-only atomic feature trial reservation for an authenticated Edge Function identity.';
COMMENT ON FUNCTION public.refund_feature_trial_for_user(uuid, text) IS
  'Server-only bounded refund for a known pre-provider failure; never callable by app clients.';
