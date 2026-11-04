import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { BodyTooLarge, readBodyLimited } from "../smart-endpoint/requestBody.mjs";
import { handlePrivacyOperator } from "./privacyOperatorHandler.mjs";

const PROJECT_REF = "tlizbrhmwaesfjmtxcgh";
const MAX_BODY_BYTES = 12_000;
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter((origin) => origin.length > 0 && origin !== "*");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handlePrivacyOperator(req, "", { admin: null, allowedOrigins });
  let body: string;
  try {
    body = await readBodyLimited(req, MAX_BODY_BYTES);
  } catch (error) {
    const status = error instanceof BodyTooLarge ? 413 : 400;
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || new URL(url).hostname !== `${PROJECT_REF}.supabase.co` || !serviceKey) {
    return new Response(JSON.stringify({ error: "operator_tool_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return await handlePrivacyOperator(req, body, { admin, allowedOrigins });
});
