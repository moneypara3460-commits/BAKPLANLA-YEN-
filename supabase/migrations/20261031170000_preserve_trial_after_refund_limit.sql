-- Keep a document-analysis trial unconsumed once its bounded pre-provider
-- refund budget is exhausted. The refund cap remains five per trial row.
CREATE OR REPLACE FUNCTION public.consume_feature_trial_for_user(p_user uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rows integer;
  v_used integer;
  v_refunds integer;
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
    WHERE t.used_count < 1
      AND t.refunds < 5;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    RETURN jsonb_build_object('allowed', true, 'pro', false);
  END IF;

  SELECT t.used_count, t.refunds
    INTO v_used, v_refunds
    FROM public.bakplanla_feature_trials AS t
   WHERE t.user_id = p_user
     AND t.feature = p_feature;

  IF v_used = 0 AND v_refunds >= 5 THEN
    RETURN jsonb_build_object('allowed', false, 'pro', false, 'retry_limited', true);
  END IF;

  RETURN jsonb_build_object('allowed', false, 'pro', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_feature_trial_for_user(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_feature_trial_for_user(uuid, text) TO service_role;

COMMENT ON FUNCTION public.consume_feature_trial_for_user(uuid, text) IS
  'Atomically reserves document-analysis trial; refuses a new reservation after five bounded pre-provider refunds without consuming the trial.';
