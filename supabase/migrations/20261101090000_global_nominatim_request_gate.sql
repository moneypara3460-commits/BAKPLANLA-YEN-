-- ENG-11: enforce public Nominatim's application-wide 1 request/second limit
-- across all smart-endpoint instances. Stores only one provider timestamp.

CREATE TABLE public.provider_rate_limit_state (
  provider text PRIMARY KEY CHECK (provider = 'nominatim'),
  last_request_at timestamptz NOT NULL
);

ALTER TABLE public.provider_rate_limit_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.provider_rate_limit_state FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_nominatim_request_slot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_last timestamptz;
BEGIN
  INSERT INTO public.provider_rate_limit_state (provider, last_request_at)
  VALUES ('nominatim', v_now - interval '1 second')
  ON CONFLICT (provider) DO NOTHING;

  SELECT s.last_request_at
    INTO v_last
    FROM public.provider_rate_limit_state AS s
   WHERE s.provider = 'nominatim'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  IF v_last <= v_now - interval '1 second' THEN
    UPDATE public.provider_rate_limit_state AS s
       SET last_request_at = v_now
     WHERE s.provider = 'nominatim';
    RETURN 0;
  END IF;

  RETURN GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (v_last + interval '1 second' - v_now)) * 1000)::integer
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_nominatim_request_slot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_nominatim_request_slot() TO service_role;
