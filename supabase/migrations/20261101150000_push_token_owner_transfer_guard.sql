-- A token already owned by another account cannot be transferred just because a
-- caller knows its string. The previous account must remove its own row before the
-- next authenticated account can register this installation.
CREATE OR REPLACE FUNCTION public.bakplanla_register_push_token(
  p_token text,
  p_platform text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_owner_count bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_token IS NULL
     OR length(p_token) > 220
     OR p_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$'
     OR p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'invalid push token';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_token, 0));

  SELECT min(user_id::text)::uuid, count(DISTINCT user_id)
    INTO v_owner, v_owner_count
    FROM public.bakplanla_push_tokens
   WHERE token = p_token;
  IF v_owner_count > 1 THEN
    RAISE EXCEPTION 'push token has conflicting account bindings';
  END IF;
  IF v_owner IS NOT NULL AND v_owner <> v_uid THEN
    RAISE EXCEPTION 'push token belongs to another account';
  END IF;

  INSERT INTO public.bakplanla_push_tokens (user_id, token, platform, updated_at)
  VALUES (v_uid, p_token, p_platform, now())
  ON CONFLICT (user_id, token) DO UPDATE
    SET platform = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$function$;

ALTER FUNCTION public.bakplanla_register_push_token(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bakplanla_register_push_token(text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_register_push_token(text, text) TO authenticated;
