import { createClient } from "npm:@supabase/supabase-js@2";
import { runDeletionSteps, reconcileDeletionReceipt } from "./deletionWorkflow.mjs";
import { hashReceiptCredential, isValidReceiptCredential } from "./receiptCredential.mjs";
import { readBoundedJsonBody } from "./requestBody.mjs";

const BUCKET = "bakplanla-documents";
const MAX_BODY_BYTES = 4096;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim().replace(/\/+$/, "")).filter((s) => s && s !== "*");

const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
  }
  return { "Vary": "Origin" };
};

const reply = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(req) },
  });

// deno-lint-ignore no-explicit-any
async function emptyUserFolder(admin: any, uid: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 50; round += 1) {
    const { data, error } = await admin.storage.from(BUCKET).list(uid, { limit: 1000, offset: 0 });
    if (error) throw new Error("storage_list_failed");
    const names = (data ?? []).map((o: { name?: string }) => o && o.name).filter(Boolean) as string[];
    if (!names.length) return removed;
    const { error: rmError } = await admin.storage.from(BUCKET).remove(names.map((n) => `${uid}/${n}`));
    if (rmError) throw new Error("storage_remove_failed");
    removed += names.length;
  }
  throw new Error("storage_limit_reached");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return reply(req, { error: "Method not supported." }, 405);

  let body: Record<string, unknown> | null;
  try { body = await readBoundedJsonBody(req, MAX_BODY_BYTES); } catch { body = null; }
  if (!body) return reply(req, { state: "not_started", error: "Invalid request." }, 400);
  if (body.action !== undefined && body.action !== "status" && body.action !== "delete") {
    return reply(req, { state: "not_started", error: "Invalid request." }, 400);
  }
  const operationCredential = body.operationCredential;
  if (!isValidReceiptCredential(operationCredential)) {
    return reply(req, { state: "not_started", error: "Invalid request." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(req, { state: "not_started", error: "Service unavailable." }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const credentialHash = await hashReceiptCredential(operationCredential);
  const receipt = {
    begin: async (hash: string, owner: string) => {
      const { data, error } = await admin.rpc("bakplanla_deletion_receipt_begin", { p_hash: hash, p_owner: owner });
      if (error) throw new Error("receipt_unavailable");
      return data;
    },
    mark: async (hash: string, owner: string, step: string, state: string) => {
      const { data, error } = await admin.rpc("bakplanla_deletion_receipt_mark", {
        p_hash: hash, p_owner: owner, p_step: step, p_result: state,
      });
      if (error) throw new Error("receipt_update_failed");
      return data;
    },
    get: async (hash: string) => {
      const { data, error } = await admin.rpc("bakplanla_deletion_receipt_get", { p_hash: hash });
      if (error) throw new Error("receipt_unavailable");
      return data;
    },
  };

  if (body.action === "status") {
    try {
      const operation = await receipt.get(credentialHash);
      if (!operation) return reply(req, { state: "unknown" }, 404);
      if (operation.state === "expired") return reply(req, { state: "expired" }, 410);
      const result = await reconcileDeletionReceipt({
        operation,
        credentialHash,
        receipt,
        authUserExists: async (owner: string) => {
          const { data, error } = await admin.auth.admin.getUserById(owner);
          if (!error && data?.user?.id === owner) return true;
          if (error?.status === 404 || (!error && !data?.user)) return false;
          return null;
        },
      });
      return reply(req, result, result.state === "unknown" ? 503 : 200);
    } catch {
      return reply(req, { state: "unknown" }, 503);
    }
  }

  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m) return reply(req, { state: "not_started", error: "Authentication required." }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(m[1]);
  const user = userData?.user;
  if (userError || !user?.id) return reply(req, { state: "not_started", error: "Authentication failed." }, 401);
  const uid = user.id;

  const result = await runDeletionSteps({
    uid,
    credentialHash,
    receipt,
    removeStorage: (owner: string) => emptyUserFolder(admin, owner),
    deleteDatabase: async (owner: string) => {
      const { data, error } = await admin.rpc("bakplanla_delete_user_data", { p_user: owner });
      if (error) throw new Error("database_failed");
      return data;
    },
    deleteAuth: async (owner: string) => {
      const { error } = await admin.auth.admin.deleteUser(owner);
      if (error) throw new Error("auth_delete_failed");
    },
    authUserExists: async (owner: string) => {
      const { data, error } = await admin.auth.admin.getUserById(owner);
      if (!error && data?.user?.id === owner) return true;
      if (error?.status === 404 || (!error && !data?.user)) return false;
      return null;
    },
  });

  if (result.state === "completed") return reply(req, result);
  console.error("delete_account_incomplete");
  return reply(req, result, result.state === "partial" ? 409 : result.state === "not_started" ? 404 : 503);
});
