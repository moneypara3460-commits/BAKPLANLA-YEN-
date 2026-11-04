// BAKPLANLA — isletme-karar
// Yönetici bir "İşletmeni Tanıt" başvurusunu onaylayınca/reddedince veritabanı tetikleyicisi bu fonksiyonu çağırır;
// başvuru sahibine sonuç maili gider. Gövdeden YALNIZCA başvuru id'si alınır; durum ve e-posta veritabanından okunur.
// Aynı karar için ikinci mail gitmez (decision_mailed_status). Yönetici notu (admin_note) maile KONMAZ.
// Secrets: GMAIL_APP_PASSWORD (zorunlu), isteğe bağlı GMAIL_USER.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { withInternalAuthorization } from "../_shared/internal-auth.mjs";
import { deliverCurrentDecision } from "./decisionMailWorkflow.mjs";
import { providerProcessingEnabled } from "../_shared/provider-processing.mjs";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleAuthorizedDecision(req: Request) {
  let id = "";
  try {
    const body = await req.json();
    id = typeof body?.id === "string" ? body.id : "";
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!UUID.test(id)) return json({ error: "bad_id" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const first = keys && typeof keys === "object" ? Object.values(keys).find((v) => typeof v === "string" && v) : null;
    if (typeof first === "string") serviceKey = first;
  } catch { /* eski anahtar kalır */ }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const password = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const gmailUser = Deno.env.get("GMAIL_USER") ?? "dev-disabled@invalid";
  const repository = {
    async readDecision(requestId: string) {
      const { data: row, error } = await admin
        .from("bakplanla_business_requests")
        .select("id, business_name, contact_name, email, status, reviewed_at, decision_mailed_status")
        .eq("id", requestId)
        .maybeSingle();
      return { row, error };
    },
    async claimDecision(requestId: string, status: string, reviewedAt: string) {
      const { data } = await admin
        .from("bakplanla_business_requests")
        .update({ decision_mailed_status: status })
        .eq("id", requestId)
        .eq("status", status)
        .eq("reviewed_at", reviewedAt)
        .or(`decision_mailed_status.is.null,decision_mailed_status.neq.${status}`)
        .select("id");
      return data;
    },
    async releaseClaim(requestId: string, status: string, reviewedAt: string) {
      await admin.from("bakplanla_business_requests")
        .update({ decision_mailed_status: null })
        .eq("id", requestId)
        .eq("status", status)
        .eq("reviewed_at", reviewedAt)
        .eq("decision_mailed_status", status);
    },
    async recordSent(requestId: string, status: string, reviewedAt: string, mailedAt: string) {
      await admin.from("bakplanla_business_requests")
        .update({ decision_mailed_at: mailedAt })
        .eq("id", requestId)
        .eq("status", status)
        .eq("reviewed_at", reviewedAt)
        .eq("decision_mailed_status", status);
    },
  };

  const result = await deliverCurrentDecision({
    id,
    repository,
    mailConfigured: Boolean(password) && providerProcessingEnabled("businessEmail", (name) => Deno.env.get(name)),
    async sendMail(row) {
      const name = esc(row.contact_name || "");
      const biz = esc(row.business_name || "");
      const approved = row.status === "approved";
      const subject = approved
        ? `BAKPLANLA başvurun onaylandı: ${row.business_name}`
        : `BAKPLANLA başvurun hakkında: ${row.business_name}`;
      const paragraphs = approved
        ? [
          `Merhaba ${name},`,
          `<b>${biz}</b> için BAKPLANLA'ya yaptığın başvuru <b>onaylandı</b>. 🎉`,
          `İşletmen artık BAKPLANLA uygulamasında <b>İş Köprüsü → İşletmeler</b> bölümünde kullanıcılarımıza görünüyor.`,
          `Bilgilerinde bir değişiklik istersen bu e-postaya yanıt vermen yeterli.`,
          `Aramıza hoş geldin!<br>BAKPLANLA Ekibi`,
        ]
        : [
          `Merhaba ${name},`,
          `<b>${biz}</b> için BAKPLANLA'ya yaptığın başvuruyu inceledik. Başvurunu şu an <b>onaylayamıyoruz</b>.`,
          `Bilgilerini kontrol edip uygulamadan (Profil → İşletmeni Tanıt) tekrar başvurabilirsin. Bir sorun olduğunu düşünüyorsan bu e-postaya yanıt vermen yeterli.`,
          `İlgin için teşekkür ederiz.<br>BAKPLANLA Ekibi`,
        ];
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.5">\n` +
        `<h2 style="color:#1f4d3a;margin:0 0 12px">BAKPLANLA</h2>\n` +
        paragraphs.map((p) => `<p style="margin:0 0 12px">${p}</p>`).join("\n") +
        `\n<p style="margin-top:18px;color:#888;font-size:12px">Bu e-posta, BAKPLANLA uygulamasındaki "İşletmeni Tanıt" başvurun hakkında gönderildi.</p>\n</div>`;
      const text = paragraphs.map((p) => p.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "")).join("\n\n");

      const client = new SMTPClient({
        connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password } },
      });
      try {
        await client.send({
          from: `BAKPLANLA <${gmailUser}>`,
          to: row.email,
          replyTo: gmailUser,
          subject: subject.replace(/[\r\n]+/g, " "),
          content: text,
          html,
        });
      } catch (error) {
        console.error("decision_email_delivery_failed");
        throw error;
      } finally {
        try { await client.close(); } catch { /* yoksay */ }
      }
    },
  });

  if (result.type === "read_error") {
    console.error("business_request_read_failed");
    return json({ error: "read" }, 500);
  }
  if (result.type === "skipped") return json({ skipped: result.reason });
  if (result.type === "error") {
    if (result.code === "no_mail_config") console.error("business_decision_email_disabled_or_unconfigured");
    return json({ error: result.code }, 500);
  }
  return json({ success: true, status: result.status });
}

Deno.serve((req) => withInternalAuthorization(
  req,
  Deno.env.get("BAKPLANLA_INTERNAL_CALLBACK_TOKEN"),
  handleAuthorizedDecision,
));
