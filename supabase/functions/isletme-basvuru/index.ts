// BAKPLANLA — isletme-basvuru
// "İşletmeni Tanıt" başvurusunu kaydeder ve dev-disabled@invalid'a bildirim maili atar.
// Kayıt, veritabanındaki business_request_submit() ile yapılır: giriş + doğrulanmış e-posta + günlük sınır orada kontrol edilir.
// Mail gönderilemese bile başvuru kaydedilmiş olur (notified_at boş kalır).
// Secrets: GMAIL_APP_PASSWORD (zorunlu). İsteğe bağlı: GMAIL_USER, BUSINESS_NOTIFY_TO.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { readAuthorizedJsonObject } from "../_shared/business-request-input.mjs";
import { providerProcessingEnabled } from "../_shared/provider-processing.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const HATALAR: Record<string, string> = {
  GIRIS_GEREKLI: "Başvuru için önce giriş yapmalısın.",
  EPOSTA_DOGRULANMALI: "Başvuru için önce e-posta adresini doğrulamalısın.",
  BEKLEYEN_BASVURU_VAR: "Zaten incelenmeyi bekleyen başvuruların var. Sonuçlanınca yeni başvuru yapabilirsin.",
  GUNLUK_SINIR: "Bugün için başvuru sınırına ulaştın. Yarın tekrar deneyebilirsin.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Yalnızca POST." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  // Yeni anahtar sistemi (SUPABASE_SECRET_KEYS) varsa onu, yoksa eski service role anahtarını kullan.
  let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const first = keys && typeof keys === "object" ? Object.values(keys).find((v) => typeof v === "string" && v) : null;
    if (typeof first === "string") serviceKey = first;
  } catch { /* eski anahtar kalır */ }
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const requestInput = await readAuthorizedJsonObject(req, () => userClient.auth.getUser());
  if (!requestInput.ok) {
    const message = requestInput.status === 401
      ? HATALAR.GIRIS_GEREKLI
      : requestInput.error;
    return json({ error: message }, requestInput.status);
  }
  const body = requestInput.body;

  const f = {
    business_name: str(body.businessName, 80),
    category: str(body.category, 40),
    contact_name: str(body.contactName, 80),
    phone: str(body.phone, 20),
    email: str(body.email, 120),
    district: str(body.district, 60),
    address: str(body.address, 200),
    website: str(body.website, 200),
    instagram: str(body.instagram, 60),
    description: str(body.description, 500),
    offer: str(body.offer, 200),
  };

  // Basit kontroller (asıl kontroller veritabanında).
  const eksik: string[] = [];
  if (f.business_name.length < 2) eksik.push("işletme adı");
  if (f.category.length < 2) eksik.push("kategori");
  if (f.contact_name.length < 2) eksik.push("yetkili adı");
  if (f.phone.replace(/\D/g, "").length < 10) eksik.push("telefon");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) eksik.push("e-posta");
  if (f.district.length < 2) eksik.push("ilçe");
  if (f.address.length < 5) eksik.push("adres");
  if (f.description.length < 10) eksik.push("tanıtım yazısı (en az 10 karakter)");
  if (eksik.length) return json({ error: "Eksik veya hatalı: " + eksik.join(", ") + "." }, 400);

  // Oturum ve doğrulanmış e-posta veritabanında tekrar kontrol edilir.
  const { data: id, error } = await userClient.rpc("business_request_submit", {
    p_business_name: f.business_name, p_category: f.category, p_contact_name: f.contact_name,
    p_phone: f.phone, p_email: f.email, p_district: f.district, p_address: f.address,
    p_website: f.website, p_instagram: f.instagram, p_description: f.description, p_offer: f.offer,
  });

  if (error) {
    const kod = Object.keys(HATALAR).find((k) => (error.message ?? "").includes(k));
    if (kod) return json({ error: HATALAR[kod], code: kod }, kod === "GIRIS_GEREKLI" ? 401 : 400);
    console.error("business_request_submit_failed");
    return json({ error: "Başvuru şu anda kaydedilemedi. Biraz sonra tekrar dene." }, 500);
  }

  // Bildirim maili (başarısız olursa başvuru yine kayıtlı kalır).
  let mailed = false;
  const password = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const gmailUser = Deno.env.get("GMAIL_USER") ?? "dev-disabled@invalid";
  const notifyTo = Deno.env.get("BUSINESS_NOTIFY_TO") ?? gmailUser;

  const businessEmailEnabled = providerProcessingEnabled("businessEmail", (name) => Deno.env.get(name));
  if (password && businessEmailEnabled) {
    const satir = (k: string, v: string) =>
      v ? `<tr><td style="padding:4px 12px 4px 0;color:#555"><b>${esc(k)}</b></td><td style="padding:4px 0">${esc(v)}</td></tr>` : "";
    const htmlRaw = `
<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
  <h2 style="color:#1f4d3a;margin:0 0 12px">Yeni işletme başvurusu</h2>
  <table style="border-collapse:collapse">
    ${satir("İşletme", f.business_name)}
    ${satir("Kategori", f.category)}
    ${satir("Yetkili", f.contact_name)}
    ${satir("Telefon", f.phone)}
    ${satir("E-posta", f.email)}
    ${satir("İlçe", f.district)}
    ${satir("Adres", f.address)}
    ${satir("Web sitesi", f.website)}
    ${satir("Instagram", f.instagram)}
    ${satir("Tanıtım", f.description)}
    ${satir("Kullanıcılara indirim", f.offer)}
  </table>
  <p style="margin-top:16px">Onaylamak için Supabase → SQL Editor:</p>
  <pre style="background:#f3f3f3;padding:10px;border-radius:6px;white-space:pre-wrap">update public.bakplanla_business_requests set status='approved' where id='${esc(String(id))}';</pre>
  <p>Reddetmek için <code>status='rejected'</code> yaz.</p>
</div>`;
    // Boş satırlar ve satır başı/sonu boşlukları mailde "=20" gibi görünmesin diye temizlenir.
    const html = htmlRaw.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password } },
    });
    try {
      await client.send({
        from: `BAKPLANLA <${gmailUser}>`,
        to: notifyTo,
        subject: ("Yeni işletme başvurusu: " + f.business_name).replace(/[\r\n]+/g, " "),
        content: `Yeni işletme başvurusu: ${f.business_name} (${f.district}). Başvuru no: ${id}`,
        html,
      });
      mailed = true;
    } catch (e) {
      console.error("business_request_notification_failed");
    } finally {
      try { await client.close(); } catch { /* yoksay */ }
    }

    if (mailed) {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { error: upErr } = await admin.from("bakplanla_business_requests").update({ notified_at: new Date().toISOString() }).eq("id", id);
      if (upErr) console.error("business_request_notification_receipt_write_failed");
    }
  } else if (password) {
    console.error("business_request_notification_disabled");
  } else {
    console.error("GMAIL_APP_PASSWORD tanımlı değil; bildirim maili atlanıyor.");
  }

  return json({
    success: true,
    id,
    mailed,
    message: "Başvurun alındı. İnceledikten sonra seninle iletişime geçeceğiz.",
  });
});
