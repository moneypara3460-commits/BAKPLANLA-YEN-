-- Keep rights operations usable under the effective least-privilege DEV grants.
-- Restricted tables remain unavailable to API roles and are queried only by
-- case-scoped SECURITY DEFINER routines after operator membership validation.

CREATE OR REPLACE FUNCTION public.privacy_operator_private_inventory(p_operator uuid,p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_subject uuid; v_hash text;
BEGIN
  SELECT c.subject_user_id INTO v_subject FROM app_private.privacy_rights_cases c
    JOIN app_private.privacy_operator_members m ON m.operator_user_id=c.opened_by
    WHERE c.id=p_case AND c.opened_by=p_operator AND c.status='open' AND m.active AND 'inventory'=ANY(c.requested_actions);
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  v_hash:=encode(sha256(convert_to(v_subject::text,'UTF8')),'hex');
  RETURN jsonb_build_array(
    jsonb_build_object('category','backup_payloads','count',(SELECT count(*) FROM public.bakplanla_backups WHERE user_id=v_subject)),
    jsonb_build_object('category','device_registrations','count',(SELECT count(*) FROM public.bakplanla_devices WHERE user_id=v_subject)),
    jsonb_build_object('category','entitlements','count',(SELECT count(*) FROM public.bakplanla_entitlements WHERE user_id=v_subject)),
    jsonb_build_object('category','trial_state_internal','count',(SELECT count(*) FROM public.bakplanla_feature_trials WHERE user_id=v_subject)),
    jsonb_build_object('category','pairing_records','count',(SELECT count(*) FROM public.bakplanla_pairings WHERE user_id=v_subject)),
    jsonb_build_object('category','cashier_account_binding','count',(SELECT count(*) FROM public.bakplanla_partner_cashiers WHERE user_id=v_subject)),
    jsonb_build_object('category','partner_codes','count',(SELECT count(*) FROM public.bakplanla_partner_codes WHERE user_id=v_subject)),
    jsonb_build_object('category','promo_attempts_internal','count',(SELECT count(*) FROM public.bakplanla_promo_attempts WHERE user_id=v_subject)),
    jsonb_build_object('category','push_bindings','count',(SELECT count(*) FROM public.bakplanla_push_tokens WHERE user_id=v_subject)),
    jsonb_build_object('category','shopping_plans','count',(SELECT count(*) FROM public.bakplanla_shopping_plans WHERE user_id=v_subject)),
    jsonb_build_object('category','ai_consent_records','count',(SELECT count(*) FROM public.bakplanla_ai_consents WHERE user_id=v_subject)),
    jsonb_build_object('category','purpose_authorization_records','count',(SELECT count(*) FROM app_private.bakplanla_ai_purpose_authorizations WHERE user_id=v_subject)),
    jsonb_build_object('category','active_deletion_reconciliation_receipts','count',(SELECT count(*) FROM app_private.account_deletion_receipts WHERE owner_user_id=v_subject AND expires_at>now())),
    jsonb_build_object('category','deletion_disposal_records','count',(SELECT count(*) FROM public.bakplanla_deletion_log WHERE user_hash=v_hash)),
    jsonb_build_object('category','privacy_case_disposal_audits','count',(SELECT count(*) FROM app_private.privacy_disposal_operations WHERE subject_hash=v_hash))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_export_page(
  p_operator uuid,p_case uuid,p_source text,p_offset integer DEFAULT 0,p_limit integer DEFAULT 8
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_subject uuid; v_relation regclass; v_columns text; v_owner text; v_order text;
  v_rows jsonb := '[]'::jsonb; v_row jsonb; v_seen integer := 0; v_oversized integer := 0; v_has_more boolean := false;
BEGIN
  SELECT c.subject_user_id INTO v_subject FROM app_private.privacy_rights_cases c
    JOIN app_private.privacy_operator_members m ON m.operator_user_id=c.opened_by
    WHERE c.id=p_case AND c.opened_by=p_operator AND c.status='open' AND m.active AND 'export'=ANY(c.requested_actions);
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 2000
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 8 THEN
    RAISE EXCEPTION 'not authorized or invalid page' USING errcode='42501';
  END IF;
  IF p_offset+p_limit>2000 THEN RAISE EXCEPTION 'page exceeds source row bound' USING errcode='22023'; END IF;
  CASE p_source
    WHEN 'backups' THEN v_relation:='public.bakplanla_backups'::regclass; v_columns:='payload,checksum,schema_version,task_count,document_count,app_version,created_at,updated_at'; v_owner:='user_id'; v_order:='user_id';
    WHEN 'devices' THEN v_relation:='public.bakplanla_devices'::regclass; v_columns:='device_id,name,platform,created_at,last_seen_at'; v_owner:='user_id'; v_order:='device_id';
    WHEN 'entitlements' THEN v_relation:='public.bakplanla_entitlements'::regclass; v_columns:='plan,status,current_period_end,auto_renew,source,updated_at'; v_owner:='user_id'; v_order:='user_id';
    WHEN 'pairings' THEN v_relation:='public.bakplanla_pairings'::regclass; v_columns:='created_at,expires_at,used_at'; v_owner:='user_id'; v_order:='code_hash';
    WHEN 'partnerCodes' THEN v_relation:='public.bakplanla_partner_codes'::regclass; v_columns:='id,partner_id,day,created_at,expires_at,redeemed_at'; v_owner:='user_id'; v_order:='id';
    WHEN 'pushBindings' THEN v_relation:='public.bakplanla_push_tokens'::regclass; v_columns:='platform,updated_at'; v_owner:='user_id'; v_order:='token';
    WHEN 'shoppingPlans' THEN v_relation:='public.bakplanla_shopping_plans'::regclass; v_columns:='shop_date,remind_at,district,city,items,delivery,status,last_message,sent_at,attempts,created_at,updated_at'; v_owner:='user_id'; v_order:='user_id';
    ELSE RAISE EXCEPTION 'source not allowed' USING errcode='22023';
  END CASE;
  FOR v_row IN EXECUTE format(
    'SELECT to_jsonb(source_row) FROM (SELECT %s FROM %s WHERE %I = $1 ORDER BY %I OFFSET $2 LIMIT $3) AS source_row',
    v_columns,v_relation,v_owner,v_order
  ) USING v_subject,p_offset,p_limit+1
  LOOP
    v_seen:=v_seen+1;
    IF v_seen>p_limit THEN v_has_more:=true; EXIT; END IF;
    IF octet_length(v_row::text)>1048576 THEN v_oversized:=v_oversized+1; ELSE v_rows:=v_rows||jsonb_build_array(v_row); END IF;
  END LOOP;
  RETURN jsonb_build_object('rows',v_rows,'nextOffset',p_offset+LEAST(v_seen,p_limit),'hasMore',v_has_more,'oversized',v_oversized>0);
END;
$function$;

ALTER FUNCTION public.privacy_operator_private_inventory(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_export_page(uuid,uuid,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.privacy_operator_private_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_export_page(uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_private_inventory(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_export_page(uuid,uuid,text,integer,integer) TO service_role;
