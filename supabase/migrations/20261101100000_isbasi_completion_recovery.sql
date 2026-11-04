-- Persist the first finish submission so a committed claim can be resumed after
-- a lost Edge Function response. The owner-readable shifts policy still applies;
-- this contains only that user's submitted game log and completion receipt.
ALTER TABLE public.bakplanla_isbasi_shifts
  ADD COLUMN completion_request jsonb,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN completion_result jsonb;

DROP FUNCTION public.isbasi_claim_shift(uuid, uuid);
DROP FUNCTION public.isbasi_commit(uuid, uuid, integer, jsonb, integer, integer, integer, jsonb);

CREATE FUNCTION public.isbasi_claim_shift(
  p_shift_id uuid,
  p_user_id uuid,
  p_submission jsonb
)
RETURNS SETOF public.bakplanla_isbasi_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_shift public.bakplanla_isbasi_shifts;
BEGIN
  SELECT * INTO v_shift
  FROM public.bakplanla_isbasi_shifts
  WHERE id = p_shift_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_shift.status = 'started' THEN
    UPDATE public.bakplanla_isbasi_shifts
    SET status = 'claimed',
        completion_request = COALESCE(p_submission, '{}'::jsonb),
        claimed_at = clock_timestamp()
    WHERE id = p_shift_id AND user_id = p_user_id;
  ELSIF v_shift.status = 'claimed' AND v_shift.completion_request IS NULL THEN
    -- Recover a legacy claim made before this migration when the client still
    -- has its submission. Completed old shifts without a stored result remain
    -- non-replayable; never infer a result from status alone.
    UPDATE public.bakplanla_isbasi_shifts
    SET completion_request = COALESCE(p_submission, '{}'::jsonb),
        claimed_at = COALESCE(claimed_at, clock_timestamp())
    WHERE id = p_shift_id AND user_id = p_user_id;
  ELSIF v_shift.status = 'claimed' THEN
    -- The persisted first submission is authoritative for every retry.
    NULL;
  ELSIF v_shift.status = 'verified' AND v_shift.completion_result IS NOT NULL THEN
    -- Return the durable receipt so the Edge Function can replay success
    -- after a timeout that occurred after SQL commit.
    NULL;
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.bakplanla_isbasi_shifts
  WHERE id = p_shift_id AND user_id = p_user_id;
END;
$function$;

CREATE FUNCTION public.isbasi_commit(
  p_user_id uuid,
  p_shift_id uuid,
  p_old_version integer,
  p_progress jsonb,
  p_score integer,
  p_max_score integer,
  p_stars integer,
  p_coupon jsonb,
  p_completion jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rows integer;
  v_shift public.bakplanla_isbasi_shifts;
  v_coupon public.bakplanla_isbasi_coupons;
  v_completion jsonb;
  v_response jsonb;
BEGIN
  SELECT * INTO v_shift
  FROM public.bakplanla_isbasi_shifts
  WHERE id = p_shift_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'conflict', 'shift');
  END IF;

  IF v_shift.status = 'verified' AND v_shift.completion_result IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'result', v_shift.completion_result, 'replayed', true);
  END IF;

  IF v_shift.status <> 'claimed' THEN
    RETURN jsonb_build_object('ok', false, 'conflict', 'shift');
  END IF;

  -- Keep progress, reward coupon, final shift state and replay receipt in one
  -- transaction. A unique coupon conflict rolls all of this block back.
  BEGIN
    IF p_old_version IS NULL THEN
      INSERT INTO public.bakplanla_isbasi_progress (user_id, data, version, updated_at)
      VALUES (p_user_id, p_progress, 1, clock_timestamp())
      ON CONFLICT (user_id) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    ELSE
      UPDATE public.bakplanla_isbasi_progress
      SET data = p_progress, version = version + 1, updated_at = clock_timestamp()
      WHERE user_id = p_user_id AND version = p_old_version;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    END IF;

    IF v_rows = 0 THEN
      RETURN jsonb_build_object('ok', false, 'conflict', 'progress');
    END IF;

    IF p_coupon IS NOT NULL THEN
      INSERT INTO public.bakplanla_isbasi_coupons
        (user_id, shift_id, code, venue, offer_id, is_demo, partner_name, title_tr, title_en, title_de, expires_at)
      VALUES
        (p_user_id, p_shift_id, p_coupon->>'code', p_coupon->>'venue', nullif(p_coupon->>'offer_id', '')::uuid,
         coalesce((p_coupon->>'is_demo')::boolean, true), p_coupon->>'partner_name',
         p_coupon->>'title_tr', p_coupon->>'title_en', p_coupon->>'title_de', (p_coupon->>'expires_at')::timestamptz)
      RETURNING * INTO v_coupon;
    END IF;

    v_completion := COALESCE(p_completion, '{}'::jsonb) || jsonb_build_object(
      'coupon', CASE WHEN p_coupon IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_coupon.id,
        'code', v_coupon.code,
        'venue', v_coupon.venue,
        'partnerName', v_coupon.partner_name,
        'title', jsonb_build_object('tr', v_coupon.title_tr, 'en', v_coupon.title_en, 'de', v_coupon.title_de),
        'isDemo', v_coupon.is_demo,
        'issuedAt', v_coupon.issued_at,
        'expiresAt', v_coupon.expires_at,
        'redeemedAt', v_coupon.redeemed_at
      ) END
    );
    v_response := v_completion || jsonb_build_object('progress', p_progress);

    UPDATE public.bakplanla_isbasi_shifts
    SET status = 'verified',
        score = p_score,
        max_score = p_max_score,
        stars = p_stars,
        finished_at = clock_timestamp(),
        completion_request = NULL,
        completion_result = v_completion
    WHERE id = p_shift_id AND user_id = p_user_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'conflict', 'code');
  END;

  RETURN jsonb_build_object('ok', true, 'result', v_response, 'replayed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.isbasi_claim_shift(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.isbasi_claim_shift(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.isbasi_commit(uuid, uuid, integer, jsonb, integer, integer, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.isbasi_commit(uuid, uuid, integer, jsonb, integer, integer, integer, jsonb, jsonb) TO service_role;
