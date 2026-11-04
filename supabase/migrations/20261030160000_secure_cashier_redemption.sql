-- ENG-05: authenticated cashier assignment, caller-scoped throttling and atomic redemption.
-- This is additive. The existing anonymous RPC remains available only until the separately
-- ordered cutover migration, so the new cashier can be tested before the legacy grant is removed.

CREATE TABLE public.bakplanla_partner_cashiers (
  partner_id text NOT NULL REFERENCES public.bakplanla_partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);

ALTER TABLE public.bakplanla_partner_cashiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY bakplanla_partner_cashiers_select_own
  ON public.bakplanla_partner_cashiers
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.bakplanla_partner_cashiers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.bakplanla_partner_cashiers TO authenticated;

CREATE TABLE public.bakplanla_partner_cashier_attempts (
  partner_id text NOT NULL REFERENCES public.bakplanla_partners(id) ON DELETE CASCADE,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pin', 'code')),
  window_started_at timestamptz NOT NULL,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, cashier_id, kind)
);

ALTER TABLE public.bakplanla_partner_cashier_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bakplanla_partner_cashier_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.partner_cashier_businesses()
RETURNS TABLE (partner_id text, partner_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id, p.name
  FROM public.bakplanla_partner_cashiers AS cashier
  JOIN public.bakplanla_partners AS p ON p.id = cashier.partner_id
  WHERE cashier.user_id = auth.uid()
    AND cashier.active
    AND p.active
    AND EXISTS (
      SELECT 1
      FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.email_confirmed_at IS NOT NULL
    )
  ORDER BY p.name, p.id;
$function$;

ALTER FUNCTION public.partner_cashier_businesses() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.partner_cashier_businesses() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_cashier_businesses() TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_redeem_code_secure(p_partner text, p_pin text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.bakplanla_partners%ROWTYPE;
  v_pin_attempt public.bakplanla_partner_cashier_attempts%ROWTYPE;
  v_code_attempt public.bakplanla_partner_cashier_attempts%ROWTYPE;
  v_row public.bakplanla_partner_codes%ROWTYPE;
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  v_now timestamptz;
  v_istanbul_now timestamp without time zone;
  v_day date;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth');
  END IF;

  IF p_partner IS NULL OR length(p_partner) > 120
     OR p_pin IS NULL OR length(p_pin) > 128
     OR p_code IS NULL OR length(p_code) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users AS u
    WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bakplanla_partner_cashiers AS cashier
    WHERE cashier.partner_id = p_partner
      AND cashier.user_id = v_uid
      AND cashier.active
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT p.* INTO v_p
  FROM public.bakplanla_partners AS p
  WHERE p.id = p_partner AND p.active AND p.pin_hash IS NOT NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_partner');
  END IF;

  -- Serialize attempts for this verified cashier and partner. The identity comes only from auth.uid().
  v_now := clock_timestamp();
  INSERT INTO public.bakplanla_partner_cashier_attempts
    (partner_id, cashier_id, kind, window_started_at, failed_count, updated_at)
  VALUES (v_p.id, v_uid, 'pin', v_now, 0, v_now)
  ON CONFLICT (partner_id, cashier_id, kind) DO NOTHING;

  SELECT a.* INTO v_pin_attempt
  FROM public.bakplanla_partner_cashier_attempts AS a
  WHERE a.partner_id = v_p.id AND a.cashier_id = v_uid AND a.kind = 'pin'
  FOR UPDATE;

  v_now := clock_timestamp();
  IF v_pin_attempt.locked_until IS NOT NULL AND v_now < v_pin_attempt.locked_until THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF v_pin_attempt.window_started_at <= v_now - interval '15 minutes' THEN
    UPDATE public.bakplanla_partner_cashier_attempts
    SET window_started_at = v_now, failed_count = 0, locked_until = NULL, updated_at = v_now
    WHERE partner_id = v_p.id AND cashier_id = v_uid AND kind = 'pin';
    v_pin_attempt.failed_count := 0;
  END IF;
  IF v_pin_attempt.failed_count >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;

  IF encode(sha256(convert_to(p_pin || ':' || v_p.id, 'UTF8')), 'hex') <> v_p.pin_hash THEN
    UPDATE public.bakplanla_partner_cashier_attempts
    SET failed_count = failed_count + 1,
        locked_until = CASE WHEN failed_count + 1 >= 10 THEN v_now + interval '15 minutes' ELSE NULL END,
        updated_at = v_now
    WHERE partner_id = v_p.id AND cashier_id = v_uid AND kind = 'pin';
    RETURN jsonb_build_object('ok', false, 'error', 'bad_pin');
  END IF;

  v_now := clock_timestamp();
  INSERT INTO public.bakplanla_partner_cashier_attempts
    (partner_id, cashier_id, kind, window_started_at, failed_count, updated_at)
  VALUES (v_p.id, v_uid, 'code', v_now, 0, v_now)
  ON CONFLICT (partner_id, cashier_id, kind) DO NOTHING;

  SELECT a.* INTO v_code_attempt
  FROM public.bakplanla_partner_cashier_attempts AS a
  WHERE a.partner_id = v_p.id AND a.cashier_id = v_uid AND a.kind = 'code'
  FOR UPDATE;

  v_now := clock_timestamp();
  IF v_code_attempt.locked_until IS NOT NULL AND v_now < v_code_attempt.locked_until THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF v_code_attempt.window_started_at <= v_now - interval '15 minutes' THEN
    UPDATE public.bakplanla_partner_cashier_attempts
    SET window_started_at = v_now, failed_count = 0, locked_until = NULL, updated_at = v_now
    WHERE partner_id = v_p.id AND cashier_id = v_uid AND kind = 'code';
    v_code_attempt.failed_count := 0;
  END IF;
  IF v_code_attempt.failed_count >= 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;

  IF length(v_code) <> 6 THEN
    UPDATE public.bakplanla_partner_cashier_attempts
    SET failed_count = failed_count + 1,
        locked_until = CASE WHEN failed_count + 1 >= 60 THEN v_now + interval '15 minutes' ELSE NULL END,
        updated_at = v_now
    WHERE partner_id = v_p.id AND cashier_id = v_uid AND kind = 'code';
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  v_istanbul_now := v_now AT TIME ZONE 'Europe/Istanbul';
  v_day := v_istanbul_now::date;
  SELECT c.* INTO v_row
  FROM public.bakplanla_partner_codes AS c
  WHERE c.partner_id = v_p.id AND c.day = v_day AND c.code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.bakplanla_partner_cashier_attempts
    SET failed_count = failed_count + 1,
        locked_until = CASE WHEN failed_count + 1 >= 60 THEN v_now + interval '15 minutes' ELSE NULL END,
        updated_at = v_now
    WHERE partner_id = v_p.id AND cashier_id = v_uid AND kind = 'code';
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  v_now := clock_timestamp();
  v_istanbul_now := v_now AT TIME ZONE 'Europe/Istanbul';
  IF v_row.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'used', 'redeemed_at', v_row.redeemed_at);
  END IF;
  IF v_istanbul_now::date <> v_day
     OR v_now >= v_row.expires_at
     OR v_istanbul_now::time < v_p.window_start
     OR v_istanbul_now::time >= v_p.window_end THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.bakplanla_partner_codes AS c
  SET redeemed_at = v_now
  WHERE c.id = v_row.id AND c.redeemed_at IS NULL
  RETURNING c.* INTO v_row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', v_row.code, 'partner', v_p.name,
    'percent', v_p.discount_percent, 'offer', v_p.offer_tr, 'redeemed_at', v_row.redeemed_at);
END;
$function$;

ALTER FUNCTION public.partner_redeem_code_secure(text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.partner_redeem_code_secure(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_redeem_code_secure(text, text, text) TO authenticated;
