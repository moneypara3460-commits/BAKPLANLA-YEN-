import {
  EXPORT_SOURCES,
  MANUAL_REVIEW_SOURCES,
  exportDisclosureEnvelope,
  parseOperatorRequest,
} from "./privacyOperatorPolicy.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "bakplanla-documents";
const PAGE_SIZE = 500;
const MAX_ROWS_PER_SOURCE = 2_000;
const MAX_EXPORT_ROW_BYTES = 1 * 1024 * 1024;
const MAX_EXPORT_RECORD_BYTES = 6 * 1024 * 1024;
const MAX_EXPORT_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_MEDIA_COUNT = 300;
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MAX_MEDIA_DEPTH = 8;
const RESTRICTED_EXPORT_SOURCES = new Set(["backups", "devices", "entitlements", "pairings", "partnerCodes", "pushBindings", "shoppingPlans"]);
const SAFE_ERROR = { error: "privacy_operation_unavailable" };

const json = (body, status, cors) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
});

function corsHeaders(req, allowedOrigins) {
  const origin = req.headers.get("origin");
  if (!origin) return { headers: { Vary: "Origin" }, allowed: true };
  if (!allowedOrigins.includes(origin)) return { headers: { Vary: "Origin" }, allowed: false };
  return { allowed: true, headers: {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  } };
}

function authToken(req) {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

async function rpc(admin, name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error("operator_rpc_unavailable");
  return data;
}

async function caseSubject(admin, operatorId, caseId, action) {
  if (!UUID.test(caseId ?? "")) return null;
  try {
    const rows = await rpc(admin, "privacy_operator_case_subject", {
      p_operator: operatorId, p_case: caseId, p_action: action,
    });
    return Array.isArray(rows) ? rows[0] ?? null : rows?.subject_user_id ? rows : null;
  } catch { return null; }
}

async function recordEvent(admin, operatorId, caseId, action, source, result, count = null) {
  await rpc(admin, "privacy_operator_case_event", {
    p_operator: operatorId, p_case: caseId, p_action: action,
    p_source: source, p_result: result, p_affected_count: count,
  });
}

const INVENTORY_SOURCES = Object.freeze([
  ["business_requests", "bakplanla_business_requests", "user_id"],
  ["isbasi_coupons", "bakplanla_isbasi_coupons", "user_id"],
  ["isbasi_progress", "bakplanla_isbasi_progress", "user_id"],
  ["isbasi_shifts", "bakplanla_isbasi_shifts", "user_id"],
  ["work_applications", "bk_applications", "user_id"],
  ["business_memberships", "bk_business_members", "user_id"],
  ["candidate_profile", "bk_candidates", "user_id"],
  ["candidate_events", "bk_events", "user_id"],
  ["received_offers", "bk_offers", "user_id"],
  ["owned_businesses", "bk_businesses", "owner_id"],
  ["authored_reviews", "bk_reviews", "author_id"],
  ["authored_reports", "bk_reports", "reporter_id"],
  ["created_shifts", "bk_shifts", "created_by"],
  ["audit_actor_refs", "bk_audit", "actor_id"],
  ["attendance_operator_refs", "bk_attendance", "updated_by"],
]);

async function exactCount(admin, table, column, subjectId) {
  const { count, error } = await admin.from(table).select(column, { count: "exact", head: true }).eq(column, subjectId);
  if (error) throw new Error("inventory_source_unavailable");
  return count ?? 0;
}

async function inventory(admin, subjectId, operatorId, caseId) {
  const sources = [];
  const partial = [];
  for (const [category, table, column] of INVENTORY_SOURCES) {
    try { sources.push({ category, count: await exactCount(admin, table, column, subjectId) }); }
    catch { sources.push({ category, status: "unavailable" }); partial.push(`${table}.${column}`); }
  }
  try {
    // Attendance must be joined through this subject's own applications; the
    // explicit join is kept separate to avoid accidental peer-account reads.
    const apps = await admin.from("bk_applications").select("id").eq("user_id", subjectId).range(0, 1_999);
    if (apps.error) throw apps.error;
    const ids = (apps.data ?? []).map((row) => row.id);
    let count = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const result = await admin.from("bk_attendance").select("application_id", { count: "exact", head: true }).in("application_id", ids.slice(i, i + 100));
      if (result.error) throw result.error;
      count += result.count ?? 0;
    }
    sources.push({ category: "attendance_records", count });
  } catch { sources.push({ category: "attendance_records", status: "unavailable" }); partial.push("bk_attendance via bk_applications"); }
  const storage = await listMedia(admin, subjectId, false);
  if (storage.partialSources.length) partial.push(...storage.partialSources);
  sources.push({ category: "document_and_receipt_images", count: storage.mediaCount, status: storage.complete ? "verified" : "partial" });
  try {
    const privateCounts = await rpc(admin, "privacy_operator_private_inventory", { p_operator: operatorId, p_case: caseId });
    sources.push(...(privateCounts ?? []));
  } catch { partial.push("app_private_case_bound_sources"); }
  const auth = await admin.auth.admin.getUserById(subjectId);
  if (auth.error) partial.push("auth.users");
  return {
    subject: auth.data?.user ? { id: subjectId, email: auth.data.user.email ?? null, createdAt: auth.data.user.created_at, confirmedAt: auth.data.user.email_confirmed_at, lastSignInAt: auth.data.user.last_sign_in_at } : { id: subjectId, status: "auth_user_absent" },
    sources,
    coverage: "Schema-backed source count inventory; no row content included.",
    limitations: ["Provider-held copies and device-local/offline records are unavailable.", "Unstructured fields and indirect business records require human review before a subject response."],
    partialSources: [...new Set(partial)],
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function listMedia(admin, subjectId, download) {
  const media = [];
  const partialSources = [];
  let bytesTotal = 0;
  let seen = 0;
  const exportObject = async (objectPath, entry) => {
    seen += 1;
    if (seen > MAX_MEDIA_COUNT) { partialSources.push("storage_object_limit"); return; }
    if (!download) { media.push({ path: objectPath, size: Number(entry.metadata?.size ?? 0) }); return; }
    const estimated = Number(entry.metadata?.size ?? 0);
    if (!Number.isFinite(estimated) || estimated < 0 || bytesTotal + estimated > MAX_MEDIA_BYTES) { partialSources.push("storage_export_byte_limit"); return; }
    const { data: blob, error } = await admin.storage.from(BUCKET).download(objectPath);
    if (error || !blob) { partialSources.push("storage_download_failed"); return; }
    const buffer = new Uint8Array(await blob.arrayBuffer());
    if (buffer.byteLength > MAX_MEDIA_BYTES - bytesTotal) { buffer.fill(0); partialSources.push("storage_export_byte_limit"); return; }
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const sha256 = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
    bytesTotal += buffer.byteLength;
    media.push({ path: objectPath, size: buffer.byteLength, contentType: blob.type || entry.metadata?.mimetype || "application/octet-stream", sha256, contentBase64: bytesToBase64(buffer) });
    buffer.fill(0);
  };
  async function walk(folder, depth) {
    if (depth > MAX_MEDIA_DEPTH) { partialSources.push("storage_depth_limit"); return; }
    let offset = 0;
    while (seen < MAX_MEDIA_COUNT) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 100, offset });
      if (error) { partialSources.push("storage_list_failed"); return; }
      const entries = data ?? [];
      for (const entry of entries) {
        const objectPath = `${folder}/${entry.name}`;
        if (!objectPath.startsWith(`${subjectId}/`) || objectPath.split("/").some((part) => part === ".." || part === ".")) {
          partialSources.push("storage_path_validation_failed"); continue;
        }
        if (entry.id == null && entry.metadata == null) await walk(objectPath, depth + 1);
        else await exportObject(objectPath, entry);
        if (seen >= MAX_MEDIA_COUNT) { partialSources.push("storage_object_limit"); return; }
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }
  await walk(subjectId, 0);
  if (seen >= MAX_MEDIA_COUNT) partialSources.push("storage_object_limit");
  return { media, mediaCount: seen, complete: partialSources.length === 0, partialSources: [...new Set(partialSources)] };
}

async function selectRows(admin, source, subjectId, partialSources, budget) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS_PER_SOURCE; offset += PAGE_SIZE) {
    if (budget.bytes >= MAX_EXPORT_RECORD_BYTES) {
      partialSources.push(`${source.table}.export_byte_limit`);
      return rows;
    }
    const { data, error } = await admin.from(source.table).select(source.fields)
      .eq(source.owner, subjectId).range(offset, offset + PAGE_SIZE - 1);
    if (error) { partialSources.push(`${source.table}.unavailable`); return rows; }
    for (const row of data ?? []) {
      const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
      if (bytes > MAX_EXPORT_ROW_BYTES || budget.bytes + bytes > MAX_EXPORT_RECORD_BYTES) {
        partialSources.push(`${source.table}.export_byte_limit`);
        continue;
      }
      rows.push(row);
      budget.bytes += bytes;
    }
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
  partialSources.push(`${source.table}.row_limit`);
  return rows;
}

async function selectRestrictedRows(admin, source, operatorId, caseId, partialSources, budget) {
  const rows = [];
  const pageSize = source.key === "backups" ? 1 : 8;
  let offset = 0;
  while (offset < MAX_ROWS_PER_SOURCE) {
    const { data, error } = await admin.rpc("privacy_operator_export_page", {
      p_operator: operatorId, p_case: caseId, p_source: source.key, p_offset: offset, p_limit: pageSize,
    });
    if (error || !data || !Array.isArray(data.rows) || !Number.isInteger(data.nextOffset) || typeof data.hasMore !== "boolean") {
      partialSources.push(`${source.table}.unavailable`);
      return rows;
    }
    if (data.oversized === true) partialSources.push(`${source.table}.export_byte_limit`);
    for (const row of data.rows) {
      const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
      if (bytes > MAX_EXPORT_ROW_BYTES || budget.bytes + bytes > MAX_EXPORT_RECORD_BYTES) {
        partialSources.push(`${source.table}.export_byte_limit`);
        return rows;
      }
      rows.push(row);
      budget.bytes += bytes;
    }
    if (!data.hasMore) return rows;
    if (data.nextOffset <= offset || data.nextOffset > MAX_ROWS_PER_SOURCE) {
      partialSources.push(`${source.table}.row_limit`);
      return rows;
    }
    offset = data.nextOffset;
    if (offset === MAX_ROWS_PER_SOURCE) {
      partialSources.push(`${source.table}.row_limit`);
      return rows;
    }
  }
  partialSources.push(`${source.table}.row_limit`);
  return rows;
}

async function prepareExport(admin, caseContext, caseId) {
  const subjectId = caseContext.subject_user_id;
  const partialSources = [];
  const budget = { bytes: 0 };
  const userResult = await admin.auth.admin.getUserById(subjectId);
  if (userResult.error || !userResult.data?.user) throw new Error("subject_unavailable");
  const records = {};
  for (const source of EXPORT_SOURCES) {
    records[source.key] = RESTRICTED_EXPORT_SOURCES.has(source.key)
      ? await selectRestrictedRows(admin, source, caseContext.operator_user_id, caseId, partialSources, budget)
      : await selectRows(admin, source, subjectId, partialSources, budget);
  }
  const applicationIds = (records.applications ?? []).map((row) => row.id).filter(Boolean);
  records.attendance = [];
  for (let i = 0; i < applicationIds.length; i += 100) {
    const { data, error } = await admin.from("bk_attendance").select("application_id,token_expires_at,check_in_at,check_in_method,check_out_at,check_out_method,manual_note,updated_at")
      .in("application_id", applicationIds.slice(i, i + 100)).range(0, 999);
    if (error) partialSources.push("bk_attendance.unavailable"); else records.attendance.push(...(data ?? []));
  }
  const privateResult = await rpc(admin, "privacy_operator_private_records", { p_operator: caseContext.operator_user_id, p_case: caseId });
  records.authorizationAndDeletionHistory = privateResult;
  const media = await listMedia(admin, subjectId, true);
  partialSources.push(...media.partialSources);
  const manualReview = [];
  for (const source of MANUAL_REVIEW_SOURCES) manualReview.push(source);
  return exportDisclosureEnvelope({
    generatedAt: new Date().toISOString(),
    subject: { id: subjectId, email: userResult.data.user.email ?? null, createdAt: userResult.data.user.created_at, confirmedAt: userResult.data.user.email_confirmed_at },
    records,
    media: media.media,
    partialSources: [...new Set(partialSources)],
    manualReview,
  });
}

export function serializeBoundedExport(value) {
  const body = JSON.stringify(value);
  const bytes = new TextEncoder().encode(body).byteLength;
  return bytes <= MAX_EXPORT_RESPONSE_BYTES ? body : null;
}

export async function handlePrivacyOperator(req, rawBody, { admin, allowedOrigins = [] }) {
  const cors = corsHeaders(req, allowedOrigins);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors.headers });
  if (!cors.allowed) return json({ error: "origin_not_allowed" }, 403, cors.headers);
  if (req.method !== "POST") return json({ error: "method_not_supported" }, 405, cors.headers);
  if (typeof rawBody !== "string" || new TextEncoder().encode(rawBody).length > 12_000) return json({ error: "invalid_request" }, 413, cors.headers);
  const token = authToken(req);
  if (!token) return json({ error: "authentication_required" }, 401, cors.headers);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const operator = authData?.user;
  if (authError || !operator?.id) return json({ error: "authentication_required" }, 401, cors.headers);
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "invalid_request" }, 400, cors.headers); }
  const parsed = parseOperatorRequest(body);
  if (!parsed.ok) return json({ error: parsed.code }, 400, cors.headers);
  body = parsed.value;

  try {
    if (body.action === "open_case") {
      const caseId = await rpc(admin, "privacy_operator_case_open", {
        p_operator: operator.id,
        p_case_reference: body.caseReference,
        p_subject: body.subjectUserId,
        p_request_kind: body.requestKind,
        p_actions: body.requestedActions,
        p_identity_method: body.identityCheckMethod,
        p_identity_reference: body.identityEvidenceReference,
        p_authority_reference: body.requestAuthorityReference ?? null,
      });
      return json({ caseId, caseReference: body.caseReference, responseDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), status: "open" }, 201, cors.headers);
    }
    if (body.action === "close_case") {
      await rpc(admin, "privacy_operator_case_close", {
        p_operator: operator.id, p_case: body.caseId,
        p_resolution: body.resolution, p_reference: body.resolutionReference,
      });
      return json({ caseId: body.caseId, status: "closed", subjectIdentifierCleared: true, resolution: body.resolution }, 200, cors.headers);
    }
    const required = body.action === "correct_candidate" ? "correct_candidate" : body.action;
    const context = await caseSubject(admin, operator.id, body.caseId, required);
    if (!context?.subject_user_id) return json({ error: "case_scope_unavailable" }, 403, cors.headers);
    context.operator_user_id = operator.id;
    if (body.action === "inventory") {
      const result = await inventory(admin, context.subject_user_id, operator.id, body.caseId);
      await recordEvent(admin, operator.id, body.caseId, "inventory", "subject_sources", result.partialSources.length ? "partial" : "verified", result.sources.reduce((n, source) => n + (source.count ?? 0), 0));
      return json(result, 200, cors.headers);
    }
    if (body.action === "export") {
      const result = await prepareExport(admin, context, body.caseId);
      const serialized = serializeBoundedExport(result);
      const affected = Object.values(result.records).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 1), 0);
      await recordEvent(admin, operator.id, body.caseId, "export", "subject_data_export", serialized && result.completeness !== "partial" ? "verified" : "partial", affected);
      if (!serialized) return json({ error: "export_response_limit_exceeded", partial: true, retryAfterScopeReview: true }, 413, cors.headers);
      return new Response(serialized, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors.headers } });
    }
    if (body.action === "correct_candidate") {
      const patch = body.patch;
      const args = {
        p_operator: operator.id,
        p_case: body.caseId,
        p_expected_updated_at: body.expectedUpdatedAt,
        p_display_name: patch.display_name ?? null,
        p_city: patch.city ?? null,
        p_change_display_name: Object.hasOwn(patch, "display_name"),
        p_change_city: Object.hasOwn(patch, "city"),
        p_dry_run: true,
      };
      const { data: preview, error: previewError } = await admin.rpc("privacy_operator_correct_candidate", args);
      if (previewError) return json({ error: "correction_conflict_or_unavailable" }, 409, cors.headers);
      if (body.dryRun) return json(preview, 200, cors.headers);
      if (preview?.state === "already_satisfied") return json(preview, 200, cors.headers);
      if (body.confirm !== true || preview?.state !== "dry_run") return json({ error: "correction_preview_required" }, 409, cors.headers);
      const { data, error } = await admin.rpc("privacy_operator_correct_candidate", { ...args, p_dry_run: false });
      if (error) return json({ error: "correction_conflict_or_unavailable" }, 409, cors.headers);
      return json(data, 200, cors.headers);
    }
    if (body.action === "verify_erasure") {
      const result = await rpc(admin, "privacy_operator_verify_erasure", { p_operator: operator.id, p_case: body.caseId });
      return json(result, result?.state === "verified" ? 200 : 409, cors.headers);
    }
    if (body.action === "retention_review") {
      const result = await rpc(admin, "privacy_operator_retention_inventory", { p_operator: operator.id, p_case: body.caseId });
      await recordEvent(admin, operator.id, body.caseId, "retention_review", "retention_inventory", "verified", result?.policies?.length ?? 0);
      return json({ ...result, subject_user_id: undefined, retentionControl: {
        scheduleState: "owner_approval_required",
        candidatePurgeEnabled: false,
        candidateDryRun: { state: "blocked_no_approved_category_schedule", candidates: [] },
      } }, 200, cors.headers);
    }
    if (body.action === "record_disposal") {
      if (body.dryRun) {
        const check = await rpc(admin, "privacy_operator_verify_erasure", { p_operator: operator.id, p_case: body.caseId });
        await recordEvent(admin, operator.id, body.caseId, "disposal_dry_run", "app_owned_database_and_storage", check?.state === "verified" ? "verified" : "partial", check?.residual_sources?.length ?? 0);
        return json({ state: "dry_run", erasureCheck: check, noDisposalRecordCreated: true }, check?.state === "verified" ? 200 : 409, cors.headers);
      }
      const result = await rpc(admin, "privacy_operator_record_disposal", { p_operator: operator.id, p_case: body.caseId });
      return json(result, 200, cors.headers);
    }
    return json({ error: "invalid_action" }, 400, cors.headers);
  } catch {
    return json(SAFE_ERROR, 503, cors.headers);
  }
}
