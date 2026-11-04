-- Serialize authenticated shopping-plan intents and reject a save that was
-- superseded by a later reservation or cancellation. A single row per owner is
-- the existing data contract; worker-owned status remains service-role-only.

CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION postgres;

CREATE TABLE IF NOT EXISTS app_private.bakplanla_shopping_plan_write_revisions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

REVOKE ALL ON TABLE app_private.bakplanla_shopping_plan_write_revisions FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.bakplanla_shopping_plans
  ADD COLUMN IF NOT EXISTS client_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bakplanla_reserve_shopping_plan_revision(p_expected_user uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app_private
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_revision bigint;
BEGIN
  IF v_user IS NULL OR p_expected_user IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'shopping_plan_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  INSERT INTO app_private.bakplanla_shopping_plan_write_revisions AS revisions (user_id, revision)
  VALUES (v_user, 1)
  ON CONFLICT (user_id) DO UPDATE SET revision = revisions.revision + 1
  RETURNING revision INTO v_revision;

  RETURN v_revision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bakplanla_save_shopping_plan(
  p_expected_user uuid,
  p_revision bigint,
  p_shop_date date,
  p_remind_at timestamptz,
  p_district text,
  p_city text,
  p_items jsonb,
  p_delivery text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app_private
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_current_revision bigint;
  v_existing public.bakplanla_shopping_plans%ROWTYPE;
BEGIN
  IF v_user IS NULL OR p_expected_user IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'shopping_plan_identity_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_revision IS NULL OR p_revision < 1
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) > 100 OR pg_column_size(p_items) > 24000
     OR (p_district IS NOT NULL AND char_length(p_district) > 60)
     OR (p_city IS NOT NULL AND char_length(p_city) > 60)
     OR p_delivery NOT IN ('local', 'push') THEN
    RAISE EXCEPTION 'shopping_plan_invalid_payload' USING ERRCODE = '22023';
  END IF;

  SELECT revision INTO v_current_revision
  FROM app_private.bakplanla_shopping_plan_write_revisions
  WHERE user_id = v_user
  FOR UPDATE;
  IF v_current_revision IS DISTINCT FROM p_revision THEN
    RETURN false;
  END IF;

  SELECT * INTO v_existing
  FROM public.bakplanla_shopping_plans
  WHERE user_id = v_user
  FOR UPDATE;

  -- A same-revision retry after a lost response is accepted only when its
  -- payload exactly matches the already committed request.
  IF FOUND AND v_existing.client_revision = p_revision THEN
    RETURN v_existing.shop_date IS NOT DISTINCT FROM p_shop_date
       AND v_existing.remind_at IS NOT DISTINCT FROM p_remind_at
       AND v_existing.district IS NOT DISTINCT FROM p_district
       AND v_existing.city IS NOT DISTINCT FROM p_city
       AND v_existing.items IS NOT DISTINCT FROM p_items
       AND v_existing.delivery IS NOT DISTINCT FROM p_delivery;
  END IF;

  INSERT INTO public.bakplanla_shopping_plans
    (user_id, shop_date, remind_at, district, city, items, delivery, client_revision)
  VALUES
    (v_user, p_shop_date, p_remind_at, p_district, p_city, p_items, p_delivery, p_revision)
  ON CONFLICT (user_id) DO UPDATE SET
    shop_date = EXCLUDED.shop_date,
    remind_at = EXCLUDED.remind_at,
    district = EXCLUDED.district,
    city = EXCLUDED.city,
    items = EXCLUDED.items,
    delivery = EXCLUDED.delivery,
    client_revision = EXCLUDED.client_revision;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bakplanla_cancel_shopping_plan(p_expected_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app_private
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR p_expected_user IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'shopping_plan_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Increment before deletion in the same transaction. Any older pending save
  -- will observe the newer revision and cannot recreate the plan.
  INSERT INTO app_private.bakplanla_shopping_plan_write_revisions AS revisions (user_id, revision)
  VALUES (v_user, 1)
  ON CONFLICT (user_id) DO UPDATE SET revision = revisions.revision + 1;

  DELETE FROM public.bakplanla_shopping_plans WHERE user_id = v_user;
  RETURN true;
END;
$function$;

ALTER FUNCTION public.bakplanla_reserve_shopping_plan_revision(uuid) OWNER TO postgres;
ALTER FUNCTION public.bakplanla_save_shopping_plan(uuid, bigint, date, timestamptz, text, text, jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.bakplanla_cancel_shopping_plan(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.bakplanla_reserve_shopping_plan_revision(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bakplanla_save_shopping_plan(uuid, bigint, date, timestamptz, text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bakplanla_cancel_shopping_plan(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bakplanla_reserve_shopping_plan_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bakplanla_save_shopping_plan(uuid, bigint, date, timestamptz, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bakplanla_cancel_shopping_plan(uuid) TO authenticated;

-- Remove all previous client table-write grants; clients now use only the
-- identity-bound, revision-fenced functions. Worker grants are unchanged.
REVOKE INSERT (user_id, shop_date, remind_at, district, city, items, delivery, updated_at)
  ON TABLE public.bakplanla_shopping_plans FROM authenticated;
REVOKE UPDATE (user_id, shop_date, remind_at, district, city, items, delivery, updated_at)
  ON TABLE public.bakplanla_shopping_plans FROM authenticated;
REVOKE DELETE ON TABLE public.bakplanla_shopping_plans FROM authenticated;
