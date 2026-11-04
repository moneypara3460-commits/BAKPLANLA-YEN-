-- ENG-19: private, case-scoped rights operations and separately retained disposal evidence.
-- Operator membership is provisioned out-of-band by a trusted project administrator.
-- No operator is enrolled by this migration and no user-facing/API role receives table access.

CREATE TABLE app_private.privacy_operator_members (
  operator_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  enrolled_by uuid
);

CREATE TABLE app_private.privacy_rights_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference text NOT NULL UNIQUE CHECK (case_reference ~ '^[A-Z0-9][A-Z0-9._/-]{2,63}$'),
  subject_user_id uuid,
  request_kind text NOT NULL CHECK (request_kind IN ('access', 'correction', 'erasure', 'objection', 'other')),
  requested_actions text[] NOT NULL CHECK (
    cardinality(requested_actions) > 0 AND
    requested_actions <@ ARRAY['inventory','export','correct_candidate','verify_erasure','retention_review','record_disposal']::text[]
  ),
  identity_check_method text NOT NULL CHECK (identity_check_method IN ('authenticated_session','manual_document_check','verified_contact')),
  identity_evidence_reference text NOT NULL CHECK (identity_evidence_reference ~ '^(VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$'),
  request_authority_reference text CHECK (request_authority_reference IS NULL OR request_authority_reference ~ '^(VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$'),
  opened_by uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  response_due_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closure_status text CHECK (closure_status IS NULL OR closure_status IN ('responded','partial','referred','withdrawn','unable_to_verify')),
  closure_reference text CHECK (closure_reference IS NULL OR closure_reference ~ '^(VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$'),
  closed_at timestamptz,
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((status = 'closed') = (closure_status IS NOT NULL AND closure_reference IS NOT NULL)),
  CHECK ((status = 'closed') OR subject_user_id IS NOT NULL),
  CHECK ((status <> 'closed') OR subject_user_id IS NULL)
);

CREATE TABLE app_private.privacy_rights_case_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES app_private.privacy_rights_cases(id) ON DELETE RESTRICT,
  operator_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('case_opened','inventory','export','correction_dry_run','correction_applied','correction_already_satisfied','erasure_verified','retention_review','disposal_dry_run','disposal_recorded','case_closed')),
  source_category text CHECK (source_category IS NULL OR source_category ~ '^[a-z][a-z0-9_]{1,63}$'),
  result text NOT NULL CHECK (result IN ('started','verified','partial','blocked','applied','failed')),
  affected_count integer CHECK (affected_count IS NULL OR affected_count >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Independent of the 72-hour deletion reconciliation receipt and deliberately
-- not FK-linked to a case or Auth user, so it survives their cleanup.
CREATE TABLE app_private.privacy_disposal_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference text NOT NULL CHECK (case_reference ~ '^[A-Z0-9][A-Z0-9._/-]{2,63}$'),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action = 'account_erasure'),
  scope_category text NOT NULL CHECK (scope_category = 'app_owned_database_and_storage'),
  result text NOT NULL CHECK (result = 'verified'),
  operator_user_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL DEFAULT (now() + interval '3 years'),
  CONSTRAINT privacy_disposal_minimum_retention CHECK (retain_until >= occurred_at + interval '3 years'),
  CONSTRAINT privacy_disposal_one_erasure_per_case UNIQUE (case_reference, action)
);

ALTER TABLE app_private.privacy_operator_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_operator_members FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_rights_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_rights_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_rights_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_rights_case_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_disposal_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.privacy_disposal_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.privacy_operator_members, app_private.privacy_rights_cases,
  app_private.privacy_rights_case_events, app_private.privacy_disposal_operations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE app_private.privacy_rights_case_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.privacy_operator_case_open(
  p_operator uuid, p_case_reference text, p_subject uuid, p_request_kind text,
  p_actions text[], p_identity_method text, p_identity_reference text, p_authority_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_case uuid; v_inserted boolean := false; v_existing app_private.privacy_rights_cases%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_operator IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_private.privacy_operator_members m WHERE m.operator_user_id=p_operator AND m.active) THEN RAISE EXCEPTION 'operator unavailable' USING errcode='42501'; END IF;
  IF p_case_reference IS NULL OR p_case_reference !~ '^[A-Z0-9][A-Z0-9._/-]{2,63}$' OR p_subject IS NULL
     OR p_request_kind NOT IN ('access','correction','erasure','objection','other')
     OR p_actions IS NULL OR cardinality(p_actions)=0
     OR NOT (p_actions <@ ARRAY['inventory','export','correct_candidate','verify_erasure','retention_review','record_disposal']::text[])
     OR p_identity_method NOT IN ('authenticated_session','manual_document_check','verified_contact')
     OR p_identity_reference IS NULL OR p_identity_reference !~ '^(VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$'
     OR (p_authority_reference IS NOT NULL AND p_authority_reference !~ '^(VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$')
     OR (p_actions && ARRAY['correct_candidate','record_disposal']::text[] AND p_authority_reference IS NULL)
     OR ('record_disposal'=ANY(p_actions) AND NOT ('verify_erasure'=ANY(p_actions))) THEN
    RAISE EXCEPTION 'invalid case scope' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_subject) THEN RAISE EXCEPTION 'verified subject unavailable' USING errcode='22023'; END IF;
  INSERT INTO app_private.privacy_rights_cases(case_reference,subject_user_id,request_kind,requested_actions,
      identity_check_method,identity_evidence_reference,request_authority_reference,opened_by)
    VALUES (p_case_reference,p_subject,p_request_kind,p_actions,p_identity_method,p_identity_reference,p_authority_reference,p_operator)
    ON CONFLICT (case_reference) DO NOTHING RETURNING id INTO v_case;
  v_inserted:=FOUND;
  IF NOT v_inserted THEN
    SELECT * INTO v_existing FROM app_private.privacy_rights_cases WHERE case_reference=p_case_reference FOR UPDATE;
    IF NOT FOUND OR v_existing.opened_by IS DISTINCT FROM p_operator OR v_existing.subject_user_id IS DISTINCT FROM p_subject
       OR v_existing.request_kind IS DISTINCT FROM p_request_kind OR v_existing.requested_actions IS DISTINCT FROM p_actions
       OR v_existing.identity_check_method IS DISTINCT FROM p_identity_method
       OR v_existing.identity_evidence_reference IS DISTINCT FROM p_identity_reference
       OR v_existing.request_authority_reference IS DISTINCT FROM p_authority_reference OR v_existing.status<>'open' THEN
      RAISE EXCEPTION 'case reference conflict' USING errcode='23505';
    END IF;
    v_case:=v_existing.id;
  ELSE
    INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,result)
      VALUES (v_case,p_operator,'case_opened','verified');
  END IF;
  RETURN v_case;
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_case_subject(p_operator uuid,p_case uuid,p_action text)
RETURNS TABLE(subject_user_id uuid,case_reference text,request_authority_reference text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR NOT EXISTS (
    SELECT 1 FROM app_private.privacy_operator_members m WHERE m.operator_user_id=p_operator AND m.active
  ) THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  RETURN QUERY SELECT c.subject_user_id,c.case_reference,c.request_authority_reference
    FROM app_private.privacy_rights_cases c
    WHERE c.id=p_case AND c.opened_by=p_operator AND c.status='open'
      AND p_action=ANY(c.requested_actions) AND c.subject_user_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'case scope unavailable' USING errcode='42501'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_case_event(
  p_operator uuid,p_case uuid,p_action text,p_source text,p_result text,p_affected_count integer DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_authorized boolean; v_required_action text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR NOT EXISTS (
    SELECT 1 FROM app_private.privacy_operator_members m WHERE m.operator_user_id=p_operator AND m.active
  ) THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  v_required_action:=CASE p_action
    WHEN 'inventory' THEN 'inventory' WHEN 'export' THEN 'export'
    WHEN 'correction_dry_run' THEN 'correct_candidate' WHEN 'correction_applied' THEN 'correct_candidate'
    WHEN 'correction_already_satisfied' THEN 'correct_candidate'
    WHEN 'erasure_verified' THEN 'verify_erasure' WHEN 'retention_review' THEN 'retention_review'
    WHEN 'disposal_dry_run' THEN 'record_disposal'
    WHEN 'disposal_recorded' THEN 'record_disposal' ELSE NULL END;
  SELECT EXISTS (SELECT 1 FROM app_private.privacy_rights_cases c WHERE c.id=p_case AND c.status='open'
    AND c.opened_by=p_operator AND v_required_action=ANY(c.requested_actions)) INTO v_authorized;
  IF NOT v_authorized OR p_action NOT IN ('inventory','export','correction_dry_run','correction_applied','erasure_verified','retention_review','disposal_dry_run','disposal_recorded')
     OR p_result NOT IN ('started','verified','partial','blocked','applied','failed')
     OR (p_source IS NOT NULL AND p_source !~ '^[a-z][a-z0-9_]{1,63}$')
     OR (p_affected_count IS NOT NULL AND p_affected_count<0) THEN RAISE EXCEPTION 'invalid event scope' USING errcode='22023'; END IF;
  INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
    VALUES (p_case,p_operator,p_action,p_source,p_result,p_affected_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_case_close(p_operator uuid,p_case uuid,p_resolution text,p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR NOT EXISTS (
    SELECT 1 FROM app_private.privacy_operator_members m WHERE m.operator_user_id=p_operator AND m.active
  ) THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  IF p_resolution NOT IN ('responded','partial','referred','withdrawn','unable_to_verify') OR p_reference IS NULL
     OR p_reference !~ '^(VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$' THEN RAISE EXCEPTION 'invalid close disposition' USING errcode='22023'; END IF;
  UPDATE app_private.privacy_rights_cases SET status='closed',closed_at=clock_timestamp(),subject_user_id=NULL,
      closure_status=p_resolution,closure_reference=p_reference
    WHERE id=p_case AND opened_by=p_operator AND status='open';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=0 AND EXISTS (SELECT 1 FROM app_private.privacy_rights_cases WHERE id=p_case AND opened_by=p_operator AND status='closed'
      AND subject_user_id IS NULL AND closure_status=p_resolution AND closure_reference=p_reference) THEN RETURN true; END IF;
  IF v_count<>1 THEN RAISE EXCEPTION 'case scope unavailable' USING errcode='42501'; END IF;
  INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,result)
    VALUES (p_case,p_operator,'case_closed','verified');
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_correct_candidate(
  p_operator uuid,p_case uuid,p_expected_updated_at timestamptz,p_display_name text,p_city text,
  p_change_display_name boolean,p_change_city boolean,p_dry_run boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_subject uuid; v_authority text; v_row public.bk_candidates%ROWTYPE; v_count integer;
BEGIN
  SELECT c.subject_user_id,c.request_authority_reference INTO v_subject,v_authority
    FROM app_private.privacy_rights_cases c JOIN app_private.privacy_operator_members m ON m.operator_user_id=c.opened_by
    WHERE c.id=p_case AND c.opened_by=p_operator AND c.status='open' AND 'correct_candidate'=ANY(c.requested_actions)
      AND m.active FOR UPDATE OF c;
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL OR v_authority IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  IF p_expected_updated_at IS NULL OR (NOT p_change_display_name AND NOT p_change_city)
     OR (p_change_display_name AND (p_display_name IS NULL OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 120))
     OR (p_change_city AND (p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 1 AND 120)) THEN
    RAISE EXCEPTION 'invalid correction' USING errcode='22023';
  END IF;
  SELECT * INTO v_row FROM public.bk_candidates WHERE user_id=v_subject FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction conflict' USING errcode='40001'; END IF;
  IF (NOT p_change_display_name OR v_row.display_name IS NOT DISTINCT FROM btrim(p_display_name))
     AND (NOT p_change_city OR v_row.city IS NOT DISTINCT FROM btrim(p_city)) THEN
    INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
      VALUES (p_case,p_operator,'correction_already_satisfied','bk_candidates','verified',0);
    RETURN jsonb_build_object('state','already_satisfied','updated_at',v_row.updated_at);
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'correction conflict' USING errcode='40001'; END IF;
  IF p_dry_run THEN
    INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
      VALUES (p_case,p_operator,'correction_dry_run','bk_candidates','verified',1);
    RETURN jsonb_build_object('state','dry_run','user_id',v_subject,'current',jsonb_build_object('display_name',v_row.display_name,'city',v_row.city,'updated_at',v_row.updated_at),'proposed_fields',jsonb_build_array(CASE WHEN p_change_display_name THEN 'display_name' END,CASE WHEN p_change_city THEN 'city' END));
  END IF;
  UPDATE public.bk_candidates SET
    display_name=CASE WHEN p_change_display_name THEN btrim(p_display_name) ELSE display_name END,
    city=CASE WHEN p_change_city THEN btrim(p_city) ELSE city END,
    updated_at=clock_timestamp()
    WHERE user_id=v_subject AND updated_at=p_expected_updated_at;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'correction conflict' USING errcode='40001'; END IF;
  INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
    VALUES (p_case,p_operator,'correction_applied','bk_candidates','applied',1);
  RETURN jsonb_build_object('state','applied','updated_at',(SELECT updated_at FROM public.bk_candidates WHERE user_id=v_subject));
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_verify_erasure(p_operator uuid,p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_subject uuid; v_case_ref text; v_auth_exists boolean; v_log_exists boolean; v_storage_count integer;
        v_residuals jsonb := '[]'::jsonb; v_candidate record; v_exists boolean; v_sql text; v_receipt_count integer;
BEGIN
  SELECT c.subject_user_id,c.case_reference INTO v_subject,v_case_ref
    FROM app_private.privacy_rights_cases c JOIN app_private.privacy_operator_members m ON m.operator_user_id=p_operator
    WHERE c.id=p_case AND c.status='open' AND p_operator=c.opened_by AND m.active AND 'verify_erasure'=ANY(c.requested_actions);
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_subject) INTO v_auth_exists;
  SELECT EXISTS(SELECT 1 FROM public.bakplanla_deletion_log d WHERE d.user_hash=encode(sha256(convert_to(v_subject::text,'UTF8')),'hex')) INTO v_log_exists;
  SELECT count(*)::integer INTO v_storage_count FROM storage.objects o WHERE o.bucket_id='bakplanla-documents' AND (o.name=v_subject::text OR o.name LIKE v_subject::text||'/%');
  IF v_auth_exists THEN v_residuals:=v_residuals||jsonb_build_array('auth_user_present'); END IF;
  IF NOT v_log_exists THEN v_residuals:=v_residuals||jsonb_build_array('deletion_log_missing'); END IF;
  IF v_storage_count>0 THEN v_residuals:=v_residuals||jsonb_build_array('storage_objects_present'); END IF;
  FOR v_candidate IN SELECT table_name,column_name,data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name NOT IN ('bakplanla_deletion_log')
      AND column_name IN ('user_id','owner_id','owner_user_id','created_by','author_id','actor_id','reporter_id','updated_by')
      AND data_type IN ('uuid','text','character varying') ORDER BY table_name,column_name
  LOOP
    v_sql:=format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I::text=$1)', 'public',v_candidate.table_name,v_candidate.column_name);
    EXECUTE v_sql INTO v_exists USING v_subject::text;
    IF v_exists THEN v_residuals:=v_residuals||jsonb_build_array(v_candidate.table_name||'.'||v_candidate.column_name); END IF;
  END LOOP;
  SELECT count(*)::integer INTO v_receipt_count FROM app_private.account_deletion_receipts r WHERE r.owner_user_id=v_subject AND r.expires_at>now();
  -- The 72-hour receipt still contains the subject UUID and is not part of the
  -- minimum-three-year disposal audit. Do not report complete erasure until it
  -- expires and the existing purge removes it.
  IF v_receipt_count>0 THEN v_residuals:=v_residuals||jsonb_build_array('active_deletion_reconciliation_receipts'); END IF;
  IF v_residuals='[]'::jsonb THEN
    INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
      VALUES (p_case,p_operator,'erasure_verified','app_owned_database_and_storage','verified',0);
  ELSE
    INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
      VALUES (p_case,p_operator,'erasure_verified','app_owned_database_and_storage','partial',jsonb_array_length(v_residuals));
  END IF;
  RETURN jsonb_build_object('state',CASE WHEN v_residuals='[]'::jsonb THEN 'verified' ELSE 'partial' END,
    'subject_auth_present',v_auth_exists,'deletion_log_present',v_log_exists,'storage_objects_remaining',v_storage_count,
    'active_72_hour_receipts',v_receipt_count,'residual_sources',v_residuals,
    'external_provider_and_device_copies','unverified');
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_record_disposal(p_operator uuid,p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_subject uuid; v_case_ref text; v_authority text; v_check jsonb; v_id uuid; v_until timestamptz;
BEGIN
  SELECT c.subject_user_id,c.case_reference,c.request_authority_reference INTO v_subject,v_case_ref,v_authority
    FROM app_private.privacy_rights_cases c JOIN app_private.privacy_operator_members m ON m.operator_user_id=p_operator
    WHERE c.id=p_case AND c.status='open' AND c.opened_by=p_operator AND m.active AND 'record_disposal'=ANY(c.requested_actions)
    FOR UPDATE OF c;
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL OR v_authority IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  v_check:=public.privacy_operator_verify_erasure(p_operator,p_case);
  IF v_check->>'state' IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'erasure evidence incomplete' USING errcode='55000'; END IF;
  INSERT INTO app_private.privacy_disposal_operations(case_reference,subject_hash,action,scope_category,result,operator_user_id)
    VALUES (v_case_ref,encode(sha256(convert_to(v_subject::text,'UTF8')),'hex'),'account_erasure','app_owned_database_and_storage','verified',p_operator)
    ON CONFLICT (case_reference,action) DO NOTHING;
  SELECT id,retain_until INTO v_id,v_until FROM app_private.privacy_disposal_operations WHERE case_reference=v_case_ref AND action='account_erasure';
  INSERT INTO app_private.privacy_rights_case_events(case_id,operator_user_id,action,source_category,result,affected_count)
    VALUES (p_case,p_operator,'disposal_recorded','app_owned_database_and_storage','verified',1);
  RETURN jsonb_build_object('state','recorded','record_id',v_id,'retain_until',v_until);
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_retention_inventory(p_operator uuid,p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_subject uuid;
BEGIN
  SELECT c.subject_user_id INTO v_subject FROM app_private.privacy_rights_cases c
    JOIN app_private.privacy_operator_members m ON m.operator_user_id=c.opened_by
    WHERE c.id=p_case AND c.opened_by=p_operator AND c.status='open' AND m.active AND 'retention_review'=ANY(c.requested_actions);
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  RETURN jsonb_build_object('subject_user_id',v_subject,'policies',jsonb_build_array(
    jsonb_build_object('source','app_private.account_deletion_receipts','retention','72 hours','purge','existing pg_cron job','automatic',true),
    jsonb_build_object('source','public.bakplanla_deletion_log','retention','minimum 3 years by existing cleanup predicate','purge','opportunistic during account deletion','automatic',false),
    jsonb_build_object('source','app_private.privacy_disposal_operations','retention','minimum 3 years','purge','none; privileged manual review required','automatic',false),
    jsonb_build_object('source','user_content_and_storage','retention','no approved category schedule encoded','purge','no automatic candidate eligible','automatic',false)
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.privacy_operator_private_records(p_operator uuid,p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_subject uuid;
BEGIN
  SELECT c.subject_user_id INTO v_subject FROM app_private.privacy_rights_cases c
    JOIN app_private.privacy_operator_members m ON m.operator_user_id=c.opened_by
    WHERE c.id=p_case AND c.opened_by=p_operator AND c.status='open' AND m.active AND 'export'=ANY(c.requested_actions);
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_subject IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;
  RETURN jsonb_build_object(
    'aiConsent', COALESCE((SELECT jsonb_agg(jsonb_build_object('consent_version',a.consent_version,'consented_at',a.consented_at,'withdrawn_at',a.withdrawn_at,'updated_at',a.updated_at)) FROM public.bakplanla_ai_consents a WHERE a.user_id=v_subject),'[]'::jsonb),
    'aiPurposeAuthorizations', COALESCE((SELECT jsonb_agg(jsonb_build_object('purpose',a.purpose,'purpose_version',a.purpose_version,'authorized_at',a.authorized_at,'withdrawn_at',a.withdrawn_at,'updated_at',a.updated_at)) FROM app_private.bakplanla_ai_purpose_authorizations a WHERE a.user_id=v_subject),'[]'::jsonb),
    'deletionReceipts', COALESCE((SELECT jsonb_agg(jsonb_build_object('state',r.state,'stage',r.stage,'storage_done',r.storage_done,'database_done',r.database_done,'auth_done',r.auth_done,'created_at',r.created_at,'updated_at',r.updated_at,'expires_at',r.expires_at)) FROM app_private.account_deletion_receipts r WHERE r.owner_user_id=v_subject),'[]'::jsonb),
    'deletionOperations', COALESCE((SELECT jsonb_agg(jsonb_build_object('deleted_rows',d.deleted_rows,'details',d.details,'deleted_at',d.deleted_at)) FROM public.bakplanla_deletion_log d WHERE d.user_hash=encode(sha256(convert_to(v_subject::text,'UTF8')),'hex')),'[]'::jsonb)
  );
END;
$function$;

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
    jsonb_build_object('category','ai_consent_records','count',(SELECT count(*) FROM public.bakplanla_ai_consents WHERE user_id=v_subject)),
    jsonb_build_object('category','purpose_authorization_records','count',(SELECT count(*) FROM app_private.bakplanla_ai_purpose_authorizations WHERE user_id=v_subject)),
    jsonb_build_object('category','active_deletion_reconciliation_receipts','count',(SELECT count(*) FROM app_private.account_deletion_receipts WHERE owner_user_id=v_subject AND expires_at>now())),
    jsonb_build_object('category','deletion_disposal_records','count',(SELECT count(*) FROM public.bakplanla_deletion_log WHERE user_hash=v_hash)),
    jsonb_build_object('category','privacy_case_disposal_audits','count',(SELECT count(*) FROM app_private.privacy_disposal_operations WHERE subject_hash=v_hash))
  );
END;
$function$;

-- Existing account deletion already logs minimal table counts for three years,
-- but it missed several actor-author columns that are not named user_id/owner_id.
-- Erase authored user content; null actor references on retained shared records.
CREATE OR REPLACE FUNCTION public.bakplanla_delete_user_data(p_user uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t record; n bigint; total bigint := 0; details jsonb := '{}'::jsonb; errors jsonb := '{}'::jsonb;
begin
  if p_user is null then raise exception 'p_user bos olamaz'; end if;
  for t in
    select distinct c.conrelid::regclass as rel, a.attname::text as col, 'uuid' as typ
    from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace ns on ns.oid=r.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='auth.users'::regclass and ns.nspname='public' and array_length(c.conkey,1)=1
    union
    select (quote_ident(cl.table_schema)||'.'||quote_ident(cl.table_name))::regclass,cl.column_name::text,
      case when cl.data_type='uuid' then 'uuid' else 'text' end
    from information_schema.columns cl join information_schema.tables tb on tb.table_schema=cl.table_schema
      and tb.table_name=cl.table_name and tb.table_type='BASE TABLE'
    where cl.table_schema='public' and cl.column_name in ('user_id','owner_id','owner_user_id')
      and cl.data_type in ('uuid','text','character varying') and cl.table_name<>'bakplanla_deletion_log'
  loop
    begin
      n:=public.bakplanla__delete_where(t.rel,case when t.typ='uuid' then format('%I = %L::uuid',t.col,p_user) else format('%I = %L',t.col,p_user::text) end);
      total:=total+n;
      if n>0 then details:=details||jsonb_build_object(t.rel::text||'.'||t.col,n); end if;
    exception when others then errors:=errors||jsonb_build_object(t.rel::text||'.'||t.col,sqlerrm);
    end;
  end loop;
  IF errors<>'{}'::jsonb THEN RAISE EXCEPTION 'bakplanla_delete_user_data hatasi: %',errors::text; END IF;

  DELETE FROM public.bk_reviews WHERE author_id=p_user;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n; IF n>0 THEN details:=details||jsonb_build_object('public.bk_reviews.author_id',n); END IF;
  DELETE FROM public.bk_reports WHERE reporter_id=p_user;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n; IF n>0 THEN details:=details||jsonb_build_object('public.bk_reports.reporter_id',n); END IF;
  DELETE FROM public.bk_audit WHERE actor_id=p_user;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n; IF n>0 THEN details:=details||jsonb_build_object('public.bk_audit.actor_id',n); END IF;
  UPDATE public.bk_attendance SET updated_by=NULL WHERE updated_by=p_user;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n; IF n>0 THEN details:=details||jsonb_build_object('public.bk_attendance.updated_by_anonymized',n); END IF;
  UPDATE public.bk_shifts SET created_by=NULL WHERE created_by=p_user;
  GET DIAGNOSTICS n=ROW_COUNT; total:=total+n; IF n>0 THEN details:=details||jsonb_build_object('public.bk_shifts.created_by_anonymized',n); END IF;

  DELETE FROM public.bakplanla_deletion_log WHERE deleted_at<now()-interval '3 years';
  INSERT INTO public.bakplanla_deletion_log(user_hash,deleted_rows,details)
    VALUES (encode(sha256(convert_to(p_user::text,'UTF8')),'hex'),total,details);
  RETURN jsonb_build_object('deleted_rows',total,'tables',details);
END;
$function$;

ALTER FUNCTION public.privacy_operator_case_open(uuid,text,uuid,text,text[],text,text,text) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_case_subject(uuid,uuid,text) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_case_event(uuid,uuid,text,text,text,integer) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_case_close(uuid,uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_correct_candidate(uuid,uuid,timestamptz,text,text,boolean,boolean,boolean) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_verify_erasure(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_record_disposal(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_retention_inventory(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_private_records(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.privacy_operator_private_inventory(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.bakplanla_delete_user_data(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.privacy_operator_case_open(uuid,text,uuid,text,text[],text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_case_subject(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_case_event(uuid,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_case_close(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_correct_candidate(uuid,uuid,timestamptz,text,text,boolean,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_verify_erasure(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_record_disposal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_retention_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_private_records(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.privacy_operator_private_inventory(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_case_open(uuid,text,uuid,text,text[],text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_case_subject(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_case_event(uuid,uuid,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_case_close(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_correct_candidate(uuid,uuid,timestamptz,text,text,boolean,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_verify_erasure(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_record_disposal(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_retention_inventory(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_private_records(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.privacy_operator_private_inventory(uuid,uuid) TO service_role;

-- No new direct EXECUTE grant is added for the existing account deletion RPC.
