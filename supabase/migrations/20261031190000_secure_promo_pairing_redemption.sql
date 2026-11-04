-- ENG-12: serialize promo guesses per authenticated account and throttle
-- pairing-code guesses with the existing atomic rate-limit counter.

ALTER TABLE public.rate_limit_counters
  DROP CONSTRAINT rate_limit_counters_bucket_check;

ALTER TABLE public.rate_limit_counters
  ADD CONSTRAINT rate_limit_counters_bucket_check
  CHECK (bucket = ANY (ARRAY['ai'::text, 'places'::text, 'pairing'::text]));

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_window timestamptz;
  v_count integer;
BEGIN
  IF p_user IS NULL
     OR p_bucket NOT IN ('ai', 'places', 'pairing')
     OR p_limit < 1
     OR p_window_seconds < 1 THEN
    RETURN FALSE;
  END IF;

  v_window := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_counters (user_id, bucket, window_start, request_count)
  VALUES (p_user, p_bucket, v_window, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET request_count = public.rate_limit_counters.request_count + 1
  WHERE public.rate_limit_counters.request_count < p_limit
  RETURNING request_count INTO v_count;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_pairing_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := '';
  v_bytes bytea;
  v_expires timestamptz := now() + interval '5 minutes';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  -- Serialize concurrent code creation so one account has only one open code.
  PERFORM 1 FROM auth.users AS u WHERE u.id = v_uid FOR UPDATE;

  DELETE FROM public.bakplanla_pairings WHERE expires_at < now() - interval '1 day';
  DELETE FROM public.bakplanla_pairings WHERE user_id = v_uid AND used_at IS NULL;

  -- 32-symbol alphabet maps each byte's low 5 bits without modulo bias.
  v_bytes := extensions.gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  END LOOP;

  INSERT INTO public.bakplanla_pairings (code_hash, user_id, expires_at)
  VALUES (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_uid, v_expires);

  RETURN jsonb_build_object('code', v_code, 'expires_at', v_expires);
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_pairing_code(
  p_code text,
  p_device_id text,
  p_name text,
  p_platform text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.bakplanla_pairings%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF p_device_id IS NULL OR char_length(p_device_id) NOT BETWEEN 4 AND 64 THEN
    RAISE EXCEPTION 'invalid device' USING errcode = '22023';
  END IF;

  SELECT * INTO v_row
    FROM public.bakplanla_pairings
   WHERE code_hash = encode(sha256(convert_to(upper(coalesce(p_code, '')), 'UTF8')), 'hex')
   FOR UPDATE;

  IF NOT FOUND THEN
    IF NOT public.check_rate_limit(v_uid, 'pairing', 10, 300) THEN
      RETURN jsonb_build_object('paired', false, 'reason', 'too_many');
    END IF;
    RETURN jsonb_build_object('paired', false, 'reason', 'unknown');
  END IF;
  IF v_row.used_at IS NOT NULL THEN
    IF NOT public.check_rate_limit(v_uid, 'pairing', 10, 300) THEN
      RETURN jsonb_build_object('paired', false, 'reason', 'too_many');
    END IF;
    RETURN jsonb_build_object('paired', false, 'reason', 'used');
  END IF;
  IF v_row.expires_at < now() THEN
    IF NOT public.check_rate_limit(v_uid, 'pairing', 10, 300) THEN
      RETURN jsonb_build_object('paired', false, 'reason', 'too_many');
    END IF;
    RETURN jsonb_build_object('paired', false, 'reason', 'expired');
  END IF;
  -- Keep the established same-account pairing contract; count cross-account guesses.
  IF v_row.user_id <> v_uid THEN
    IF NOT public.check_rate_limit(v_uid, 'pairing', 10, 300) THEN
      RETURN jsonb_build_object('paired', false, 'reason', 'too_many');
    END IF;
    RETURN jsonb_build_object('paired', false, 'reason', 'self');
  END IF;

  UPDATE public.bakplanla_pairings SET used_at = now() WHERE code_hash = v_row.code_hash;

  INSERT INTO public.bakplanla_devices (user_id, device_id, name, platform, last_seen_at)
  VALUES (
    v_uid,
    p_device_id,
    coalesce(nullif(left(coalesce(p_name, ''), 60), ''), 'Cihaz'),
    CASE WHEN p_platform IN ('ios', 'android', 'web') THEN p_platform ELSE 'unknown' END,
    now()
  )
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET name = excluded.name, platform = excluded.platform, last_seen_at = now();

  RETURN jsonb_build_object('paired', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_email text;
  v_confirmed timestamptz;
  v_promo public.bakplanla_promo_codes%rowtype;
  v_ent public.bakplanla_entitlements%rowtype;
  v_has_ent boolean := false;
  v_active boolean := false;
  v_plan text;
  v_until timestamptz;
  v_fails integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  -- Serialize this user's attempts before checking the rolling one-hour count.
  SELECT lower(u.email), u.email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users AS u WHERE u.id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT count(*) INTO v_fails
    FROM public.bakplanla_promo_attempts AS a
   WHERE a.user_id = v_uid AND a.success = false
     AND a.attempted_at > now() - interval '1 hour';
  IF v_fails >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  SELECT * INTO v_promo FROM public.bakplanla_promo_codes AS c
   WHERE c.code = v_code FOR UPDATE;

  IF NOT FOUND OR v_promo.revoked THEN
    INSERT INTO public.bakplanla_promo_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF v_promo.redeemed_by = v_uid THEN
    SELECT * INTO v_ent FROM public.bakplanla_entitlements AS e WHERE e.user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'already', true, 'until', v_ent.current_period_end);
  END IF;

  IF v_promo.redeemed_by IS NOT NULL THEN
    INSERT INTO public.bakplanla_promo_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;

  IF v_email IS NULL OR v_email <> lower(v_promo.email) THEN
    INSERT INTO public.bakplanla_promo_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'not_yours');
  END IF;

  IF v_confirmed IS NULL THEN
    INSERT INTO public.bakplanla_promo_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  END IF;

  SELECT * INTO v_ent FROM public.bakplanla_entitlements AS e WHERE e.user_id = v_uid FOR UPDATE;
  v_has_ent := FOUND;
  IF v_has_ent THEN
    v_active := v_ent.plan IN ('pro_monthly', 'pro_yearly')
      AND v_ent.status IN ('active', 'canceled')
      AND ((v_ent.current_period_end IS NULL AND v_ent.status = 'active') OR v_ent.current_period_end > now());
  END IF;

  IF v_active AND v_ent.current_period_end IS NULL THEN
    v_plan := v_ent.plan;
    v_until := NULL;
  ELSIF v_promo.duration_days IS NULL THEN
    v_plan := CASE WHEN v_active THEN v_ent.plan ELSE 'pro_yearly' END;
    v_until := NULL;
  ELSE
    v_plan := CASE WHEN v_active THEN v_ent.plan
                    WHEN v_promo.duration_days > 31 THEN 'pro_yearly'
                    ELSE 'pro_monthly' END;
    v_until := (CASE WHEN v_active THEN greatest(v_ent.current_period_end, now()) ELSE now() END)
               + make_interval(days => v_promo.duration_days);
  END IF;

  INSERT INTO public.bakplanla_entitlements AS e
    (user_id, plan, status, current_period_end, auto_renew, source, updated_at)
  VALUES (v_uid, v_plan, 'active', v_until, false, 'promo', now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan = excluded.plan,
        status = 'active',
        current_period_end = excluded.current_period_end,
        auto_renew = CASE WHEN v_active THEN e.auto_renew ELSE false END,
        source = CASE WHEN v_active THEN e.source ELSE 'promo' END,
        updated_at = now();

  UPDATE public.bakplanla_promo_codes AS c SET redeemed_by = v_uid, redeemed_at = now()
   WHERE c.code = v_code;
  INSERT INTO public.bakplanla_promo_attempts (user_id, success) VALUES (v_uid, true);

  RETURN jsonb_build_object('ok', true, 'until', v_until);
END;
$function$;

-- Preserve the least-privilege RPC grants established by the existing grant migration.
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.create_pairing_code() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_pairing_code() TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_pairing_code(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_pairing_code(text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_promo_code(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO authenticated;
