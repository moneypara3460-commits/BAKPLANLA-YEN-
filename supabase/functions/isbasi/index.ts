// BAKPLANLA — İŞ BAŞI sunucusu (Supabase Edge Function: isbasi)
// Oyun mantığı uygulamadaki dosyaların aynısıdır (isbasiServer.js + isbasiReplay.js ...).
// Kullanıcı kimliği yalnızca giriş anahtarından (JWT) alınır; istek gövdesindeki kimliğe güvenilmez.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRequest } from "./isbasiServer.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_BODY_BYTES = 200_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const T_PROGRESS = "bakplanla_isbasi_progress";
const T_SHIFTS = "bakplanla_isbasi_shifts";
const T_COUPONS = "bakplanla_isbasi_coupons";
const T_OFFERS = "bakplanla_isbasi_offers";

const must = <T>(res: { data: T; error: unknown }) => {
  if (res.error) throw res.error;
  return res.data;
};

const db = {
  getProgress: async (userId: string) =>
    must(await admin.from(T_PROGRESS).select("user_id, data, version").eq("user_id", userId).maybeSingle()),
  listCoupons: async (userId: string) =>
    must(await admin.from(T_COUPONS).select("*").eq("user_id", userId).order("issued_at", { ascending: false }).limit(50)) || [],
  countShiftsSince: async (userId: string, sinceISO: string) => {
    const { count, error } = await admin.from(T_SHIFTS).select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("started_at", sinceISO);
    if (error) throw error;
    return count || 0;
  },
  abandonOpenShifts: async (userId: string) => {
    must(await admin.from(T_SHIFTS).update({ status: "abandoned", finished_at: new Date().toISOString() })
      .eq("user_id", userId).eq("status", "started"));
  },
  insertShift: async (row: Record<string, unknown>) =>
    must(await admin.from(T_SHIFTS).insert(row).select("*").single()),
  claimShift: async (shiftId: string, userId: string, submission: Record<string, unknown>) => {
    const rows = must(await admin.rpc("isbasi_claim_shift", {
      p_shift_id: shiftId, p_user_id: userId, p_submission: submission,
    })) as unknown[];
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  },
  rejectShift: async (shiftId: string, reason: string) => {
    must(await admin.from(T_SHIFTS).update({ status: "rejected", reject_reason: String(reason).slice(0, 60), finished_at: new Date().toISOString() })
      .eq("id", shiftId).eq("status", "claimed"));
  },
  getActiveOffer: async (venue: string) =>
    must(await admin.from(T_OFFERS).select("*").eq("venue", venue).eq("active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()),
  commit: async (a: any) =>
    must(await admin.rpc("isbasi_commit", {
      p_user_id: a.userId, p_shift_id: a.shiftId, p_old_version: a.oldVersion, p_progress: a.progress,
      p_score: a.score, p_max_score: a.maxScore, p_stars: a.stars, p_coupon: a.coupon,
      p_completion: a.completion,
    })),
};

const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { ok: false, error: "no_session" });
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json(401, { ok: false, error: "no_session" });
  const userId = auth.user.id;

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "too_large" });
  let body: any = null;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: "bad_request" }); }
  if (body && body.mode === "finish" && body.shiftId != null && !isUuid(body.shiftId)) {
    return json(404, { ok: false, error: "shift_not_found" });
  }

  try {
    const res = await handleRequest({
      db, userId, body, now: Date.now(),
      randomInt: (min: number, max: number) => {
        const b = new Uint32Array(1); crypto.getRandomValues(b);
        return min + (b[0] % (max - min));
      },
      randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
    });
    return json(res.status, res.body);
  } catch {
    console.error("isbasi_request_failed");
    return json(500, { ok: false, error: "server" });
  }
});
