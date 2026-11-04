-- Keep authenticated clients from creating or changing token ownership directly.
-- The identity-checked registration RPC is created later, together with its
-- no-transfer ownership guard, so a clean migration replay never exposes a
-- cross-account token transfer.
REVOKE INSERT, UPDATE ON TABLE public.bakplanla_push_tokens FROM authenticated;
