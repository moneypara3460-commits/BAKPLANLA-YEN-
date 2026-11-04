CREATE OR REPLACE FUNCTION public.bakplanla_business_requests_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  callback_token text;
BEGIN
  IF new.status IS DISTINCT FROM old.status
     AND new.status IN ('approved', 'rejected') THEN
    SELECT decrypted_secret
      INTO callback_token
      FROM vault.decrypted_secrets
     WHERE name = 'bakplanla_business_decision_callback';

    IF callback_token IS NULL OR callback_token = '' THEN
      RAISE WARNING 'Business decision callback secret is unavailable';
      RETURN new;
    END IF;

    PERFORM net.http_post(
      url := 'https://tlizbrhmwaesfjmtxcgh.supabase.co/functions/v1/isletme-karar',
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || callback_token
      )
    );
  END IF;

  RETURN new;
END;
$function$;

ALTER FUNCTION public.bakplanla_business_requests_notify() OWNER TO postgres;
