-- Restore the existing authenticated plan upsert contract after ENG-04's grant
-- reset. User-owned RLS policies still isolate rows; worker status columns remain
-- outside the client's column-level write grants.
GRANT INSERT (user_id, shop_date, remind_at, district, city, items, delivery, updated_at)
  ON TABLE public.bakplanla_shopping_plans TO authenticated;
GRANT UPDATE (user_id, shop_date, remind_at, district, city, items, delivery, updated_at)
  ON TABLE public.bakplanla_shopping_plans TO authenticated;
