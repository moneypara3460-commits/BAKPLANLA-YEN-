export const OPERATOR_ACTIONS = Object.freeze([
  "inventory",
  "export",
  "correct_candidate",
  "verify_erasure",
  "retention_review",
  "record_disposal",
]);

export const EXPORT_SOURCES = Object.freeze([
  { key: "backups", table: "bakplanla_backups", owner: "user_id", fields: "payload,checksum,schema_version,task_count,document_count,app_version,created_at,updated_at" },
  { key: "businessRequests", table: "bakplanla_business_requests", owner: "user_id", fields: "id,business_name,category,contact_name,phone,email,district,address,website,instagram,description,offer,status,created_at,reviewed_at,notified_at,decision_mailed_status,decision_mailed_at" },
  { key: "devices", table: "bakplanla_devices", owner: "user_id", fields: "device_id,name,platform,created_at,last_seen_at" },
  { key: "entitlements", table: "bakplanla_entitlements", owner: "user_id", fields: "plan,status,current_period_end,auto_renew,source,updated_at" },
  { key: "isbasiCoupons", table: "bakplanla_isbasi_coupons", owner: "user_id", fields: "id,shift_id,venue,offer_id,is_demo,partner_name,title_tr,title_en,title_de,issued_at,expires_at,redeemed_at" },
  { key: "isbasiProgress", table: "bakplanla_isbasi_progress", owner: "user_id", fields: "data,version,updated_at" },
  { key: "isbasiShifts", table: "bakplanla_isbasi_shifts", owner: "user_id", fields: "id,role,level,game_date,started_at,status,score,max_score,stars,reject_reason,finished_at" },
  { key: "pairings", table: "bakplanla_pairings", owner: "user_id", fields: "created_at,expires_at,used_at" },
  { key: "partnerCodes", table: "bakplanla_partner_codes", owner: "user_id", fields: "id,partner_id,day,created_at,expires_at,redeemed_at" },
  { key: "pushBindings", table: "bakplanla_push_tokens", owner: "user_id", fields: "platform,updated_at" },
  { key: "shoppingPlans", table: "bakplanla_shopping_plans", owner: "user_id", fields: "shop_date,remind_at,district,city,items,delivery,status,last_message,sent_at,attempts,created_at,updated_at" },
  { key: "applications", table: "bk_applications", owner: "user_id", fields: "id,shift_id,status,message,share_history,contact_phone,badge_snapshot,decision_note,legal_confirmed_at,created_at,updated_at,decided_at" },
  { key: "businessMemberships", table: "bk_business_members", owner: "user_id", fields: "business_id,role,created_at" },
  { key: "candidateProfile", table: "bk_candidates", owner: "user_id", fields: "display_name,adult_confirmed,adult_confirmed_at,city,terms_accepted_at,created_at,updated_at" },
  { key: "authoredReviews", table: "bk_reviews", owner: "author_id", fields: "application_id,side,ratings,comment,hidden,created_at" },
]);

export const MANUAL_REVIEW_SOURCES = Object.freeze([
  { source: "bakplanla_business_requests.admin_note", reason: "internal decision notes require third-party/confidentiality review" },
  { source: "bk_businesses", reason: "owner records contain contact data about other people" },
  { source: "bk_events.data", reason: "unstructured event JSON may reference other people" },
  { source: "bk_offers", reason: "offer details can include business and third-party data" },
  { source: "bk_reports", reason: "free-form safety/report text may include other people" },
  { source: "bk_shifts.created_by", reason: "created shifts contain business/third-party operational data" },
  { source: "bk_audit.detail", reason: "unstructured audit JSON is not safely classifiable for automated disclosure" },
  { source: "provider_copies_and_device_local_data", reason: "not available to this hosted project tool" },
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASE_REF = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const EVIDENCE_REF = /^(?:VERIFY|REQ|AUTH)-[A-Z0-9._/-]{2,92}$/;
const REQUEST_KINDS = new Set(["access", "correction", "erasure", "objection", "other"]);
const IDENTITY_METHODS = new Set(["authenticated_session", "manual_document_check", "verified_contact"]);

export function parseOperatorRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, code: "invalid_request" };
  const action = value.action;
  if (action === "open_case") {
    if (Object.keys(value).some((key) => !["action","caseReference","subjectUserId","requestKind","requestedActions","identityCheckMethod","identityEvidenceReference","requestAuthorityReference"].includes(key))) return { ok: false, code: "invalid_case" };
    if (!CASE_REF.test(value.caseReference ?? "") || !UUID.test(value.subjectUserId ?? "")
      || !REQUEST_KINDS.has(value.requestKind) || !Array.isArray(value.requestedActions)
      || value.requestedActions.length < 1 || value.requestedActions.length > OPERATOR_ACTIONS.length
      || new Set(value.requestedActions).size !== value.requestedActions.length
      || value.requestedActions.some((item) => !OPERATOR_ACTIONS.includes(item))
      || !IDENTITY_METHODS.has(value.identityCheckMethod)
      || !EVIDENCE_REF.test(value.identityEvidenceReference ?? "")
      || (value.requestAuthorityReference != null && !EVIDENCE_REF.test(value.requestAuthorityReference))) {
      return { ok: false, code: "invalid_case" };
    }
    if (value.requestedActions.some((item) => ["correct_candidate", "record_disposal"].includes(item))
      && !EVIDENCE_REF.test(value.requestAuthorityReference ?? "")) return { ok: false, code: "authorization_reference_required" };
    if (value.requestedActions.includes("record_disposal") && !value.requestedActions.includes("verify_erasure")) return { ok: false, code: "erasure_verification_scope_required" };
    return { ok: true, value: { ...value } };
  }
  if (action === "close_case" || action === "inventory" || action === "export" || action === "verify_erasure"
    || action === "retention_review" || action === "record_disposal" || action === "correct_candidate") {
    const allowedKeys = action === "correct_candidate"
      ? ["action","caseId","patch","expectedUpdatedAt","dryRun","confirm"]
      : action === "record_disposal"
        ? ["action","caseId","dryRun","confirm"]
        : action === "close_case"
          ? ["action","caseId","resolution","resolutionReference"]
        : ["action","caseId"];
    if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return { ok: false, code: "invalid_request" };
    if (!UUID.test(value.caseId ?? "")) return { ok: false, code: "invalid_case" };
    if (action === "record_disposal" && (typeof value.dryRun !== "boolean" || (!value.dryRun && value.confirm !== true))) return { ok: false, code: "confirmation_required" };
    if (action === "close_case" && (!new Set(["responded","partial","referred","withdrawn","unable_to_verify"]).has(value.resolution)
      || !EVIDENCE_REF.test(value.resolutionReference ?? ""))) return { ok: false, code: "invalid_close_disposition" };
    if (action === "correct_candidate") {
      const patch = value.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, code: "invalid_correction" };
      const keys = Object.keys(patch);
      if (!keys.length || keys.some((key) => !["display_name", "city"].includes(key))) return { ok: false, code: "invalid_correction" };
      if (keys.some((key) => typeof patch[key] !== "string" || patch[key].trim().length < 1 || patch[key].trim().length > 120)) return { ok: false, code: "invalid_correction" };
      if (typeof value.dryRun !== "boolean" || (!value.dryRun && value.confirm !== true)
        || typeof value.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(value.expectedUpdatedAt))) return { ok: false, code: "confirmation_required" };
    }
    return { ok: true, value: { ...value } };
  }
  return { ok: false, code: "invalid_action" };
}

export function exportDisclosureEnvelope({ generatedAt, subject, records, media, partialSources, manualReview = MANUAL_REVIEW_SOURCES }) {
  return {
    schema: "bakplanla-rights-export-v1",
    generatedAt,
    subject,
    completeness: partialSources.length || manualReview.length ? "partial" : "source-bounded",
    records,
    media,
    manualReviewRequired: manualReview,
    limitations: [
      "This package covers only the explicitly listed BAKPLANLA DEV sources.",
      "It does not include provider-held copies, offline device data, or unclassifiable third-party records.",
      "It is an operator response package, not a legal determination or a claim of a complete statutory response.",
    ],
    partialSources,
  };
}

export const isSafeReference = (value) => typeof value === "string" && EVIDENCE_REF.test(value);
