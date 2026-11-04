// =============================================================
// BAKPLANLA - shopping-reminder (27 Ekim)
// Alışveriş planı hatırlatmaları. Veritabanındaki zamanlayıcı (pg_cron) her 10 dakikada bir çağırır.
//
// Akış:
//  1) Çağrıyı doğrula: x-cron-secret başlığı, veritabanı kasasındaki (vault) anahtarla eşleşmeli.
//     Anahtar veritabanından hiç çıkmaz; karşılaştırmayı bakplanla_check_cron_secret yapar.
//  2) Zamanı gelen planları sahiplen (bakplanla_claim_due_shopping_plans) — aynı plan iki kez gönderilmez.
//  3) delivery = 'local' → bildirimi telefon kendisi kurdu; plan "gönderildi" işaretlenir.
//     delivery = 'push'  → mesaj oluşturulur (fiyat kaynağı bağlıysa karşılaştırmalı) ve Expo ile gönderilir.
//  4) Sonuç yazılır: sent / tekrar denenecek / failed (3 denemeden sonra).
//
// FİYAT KARŞILAŞTIRMASI: findBetterPrices() şu an HER ZAMAN null döner. Resmî fiyat verisi
// (marketfiyati / TÜBİTAK BİLGEM) izni gelince yalnızca bu fonksiyon doldurulacak.
// İzinsiz kaynak kullanılmaz, tahmini fiyat üretilmez.
// =============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { decideExpoPushResponse } from "./expoPushDecision.mjs";
import { providerProcessingEnabled } from "../_shared/provider-processing.mjs";

// deno-lint-ignore no-explicit-any
type Json = any;

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_ATTEMPTS = 3;

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

const formatShopDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${d} ${MONTHS[mo - 1]} ${DAYS[wd]}`;
};

const formatTL = (n: number): string => {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} TL`;
};

type PlanItem = { name: string; quantity: number; unit: string; last_price: number | null; last_store: string | null; comparable?: boolean };
type Plan = { user_id: string; shop_date: string; remind_at: string; updated_at: string; district: string | null; city: string | null; items: PlanItem[]; delivery: string; attempts: number };

// İleride: { store, total, savings, lines: ["Su 5 L: A101 29,00 TL (geçen sefer BİM 36,00 TL)"] }
// deno-lint-ignore require-await
async function findBetterPrices(_plan: Plan): Promise<null | { store: string; savings: number; lines: string[] }> {
  return null; // Fiyat kaynağı henüz bağlı değil (izin bekleniyor).
}

async function buildMessage(plan: Plan): Promise<{ title: string; body: string }> {
  const items = Array.isArray(plan.items) ? plan.items.filter((it) => it && it.name) : [];
  const remindDay = new Date(Date.parse(plan.remind_at) + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const when = remindDay === plan.shop_date ? "Bugün" : "Yarın";
  const title = `🛒 ${when} alışveriş günün (${formatShopDate(plan.shop_date)})`;
  if (!items.length) {
    return { title, body: "Alışveriş listen boş. Almak istediklerini Akıllı Alışveriş'e eklemeyi unutma." };
  }
  const better = await findBetterPrices(plan).catch(() => null);
  if (better && better.savings > 0) {
    const body = `${better.store}'den alırsan yaklaşık ${formatTL(better.savings)} kârlı çıkarsın. ${better.lines.slice(0, 2).join(" ")}`;
    return { title, body: body.slice(0, 230) };
  }
  const names = items.slice(0, 4).map((it) => it.name).join(", ");
  const more = items.length > 4 ? ` ve ${items.length - 4} ürün daha` : "";
  const priced = items.filter((it) => typeof it.last_price === "number");
  const lastTotal = priced.reduce((sum, it) => sum + (it.last_price as number) * (Number(it.quantity) || 1), 0);
  let body = `Listende ${items.length} ürün var: ${names}${more}.`;
  if (priced.length) body += ` Geçen sefer bunlara yaklaşık ${formatTL(Math.round(lastTotal * 100) / 100)} ödedin.`;
  return { title, body: body.slice(0, 230) };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Yöntem desteklenmiyor." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Sunucu yapılandırması eksik." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Çağrı doğrulama
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length > 200) return json({ error: "Yetkisiz." }, 401);
  const { data: secretOk, error: secretError } = await admin.rpc("bakplanla_check_cron_secret", { p_secret: secret });
  if (secretError || secretOk !== true) return json({ error: "Yetkisiz." }, 401);

  // Do not claim or mutate any due plans until this worker is explicitly enabled.
  if (!providerProcessingEnabled("shoppingReminderWorker", (name) => Deno.env.get(name))) {
    return json({ error: "İşlem şu anda kullanılamıyor.", code: "provider_processing_disabled" }, 503);
  }

  // 2) Zamanı gelen planları sahiplen
  const { data: plans, error: claimError } = await admin.rpc("bakplanla_claim_due_shopping_plans", { p_limit: 200 });
  if (claimError) {
    console.error("shopping_reminder_claim_failed");
    return json({ error: "Planlar alınamadı." }, 500);
  }
  const due: Plan[] = Array.isArray(plans) ? plans : [];
  const results = { claimed: due.length, local: 0, sent: 0, retry: 0, failed: 0 };

  for (const plan of due) {
    const finish = async (status: "sent" | "scheduled" | "failed", message: string | null) => {
      await admin.from("bakplanla_shopping_plans")
        .update({ status, last_message: message ? message.slice(0, 500) : null, sent_at: status === "sent" ? new Date().toISOString() : null })
        // Claim-time updated_at is a fencing version. A user edit or a recovered
        // later worker changes it; an older provider result must not finish that plan.
        .eq("user_id", plan.user_id)
        .eq("status", "sending")
        .eq("updated_at", plan.updated_at);
    };

    try {
      // 3a) Telefon kendi bildirimini kurdu
      if (plan.delivery !== "push") {
        await finish("sent", "yerel bildirim (cihaz)");
        results.local += 1;
        continue;
      }

      // 3b) Sunucudan bildirim
      const { data: tokens } = await admin.from("bakplanla_push_tokens").select("token").eq("user_id", plan.user_id).limit(10);
      const list = (tokens ?? []).map((t: { token: string }) => t.token).filter(Boolean);
      if (!list.length) {
        await finish("failed", "bildirim anahtarı yok");
        results.failed += 1;
        continue;
      }

      const msg = await buildMessage(plan);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(list.map((to) => ({
          to,
          title: msg.title,
          body: msg.body,
          sound: "default",
          channelId: "bakplanla-reminders",
          data: { kind: "shopping", shopDate: plan.shop_date },
        }))),
        signal: AbortSignal.timeout(10_000),
      });
      const delivery = await decideExpoPushResponse(res, list.length, plan.attempts, MAX_ATTEMPTS);

      // Ticket order follows the request order; remove only mapped, owner-scoped invalid tokens.
      for (const index of delivery.invalidTokenIndexes) {
        await admin.from("bakplanla_push_tokens").delete().eq("user_id", plan.user_id).eq("token", list[index]);
      }

      if (delivery.status === "sent") {
        await finish("sent", `${msg.title} — ${msg.body}`);
        results.sent += 1;
      } else if (delivery.status === "failed") {
        await finish("failed", `gönderilemedi (HTTP ${res.status})`);
        results.failed += 1;
      } else {
        await finish("scheduled", `tekrar denenecek (HTTP ${res.status})`);
        results.retry += 1;
      }
    } catch {
      console.error("shopping_reminder_plan_processing_failed");
      await finish(plan.attempts >= MAX_ATTEMPTS ? "failed" : "scheduled", "hata").catch(() => {});
      if (plan.attempts >= MAX_ATTEMPTS) results.failed += 1; else results.retry += 1;
    }
  }

  return json({ success: true, ...results });
});
