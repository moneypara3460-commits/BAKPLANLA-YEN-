-- Restore only the service_role column/table rights used by shopping-reminder
-- after ENG-04's least-privilege table grant reset.
GRANT SELECT (user_id, status, updated_at)
  ON TABLE public.bakplanla_shopping_plans TO service_role;
GRANT UPDATE (status, last_message, sent_at)
  ON TABLE public.bakplanla_shopping_plans TO service_role;
GRANT SELECT (user_id, token)
  ON TABLE public.bakplanla_push_tokens TO service_role;
GRANT DELETE ON TABLE public.bakplanla_push_tokens TO service_role;
