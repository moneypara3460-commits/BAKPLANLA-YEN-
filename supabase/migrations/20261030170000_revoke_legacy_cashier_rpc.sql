-- ENG-05 coordinated cutover: legacy clients must move to the authenticated cashier contract first.
-- Keep the old function definition for audit/compatibility history, but remove every API-role grant.
REVOKE ALL ON FUNCTION public.partner_redeem_code(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
