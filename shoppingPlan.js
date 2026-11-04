/* =============================================================
   BAKPLANLA — Alışveriş planı (27 Ekim)
   Kullanıcı "şu gün alışverişe gideceğim" der → plan kaydedilir → alışverişten 1 gün önce
   hatırlatma gelir: listesi, geçen sefer ödediği fiyatlar ve (fiyat kaynağı bağlanınca)
   hangi markette daha ucuz olduğu.

   İki katman:
   - delivery 'push'  : uygulama sunucudan bildirim alabiliyorsa (mağaza sürümü). Sunucu
                        (shopping-reminder) hatırlatma anında fiyatlara bakıp bildirimi gönderir.
   - delivery 'local' : Snack / Expo Go gibi push alamayan ortamlar. Telefon bildirimi kendisi
                        kurar; metin plan kaydedildiği andaki listeden oluşur.
   Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.
   ============================================================= */

import { formatTL, receiptDocsOf } from './receipts';

export const SHOPPING_PLAN_KEY = 'PLAN_SHOPPING_PLAN_V1';
export const SHOPPING_PLAN_TABLE = 'bakplanla_shopping_plans';
export const PUSH_TOKENS_TABLE = 'bakplanla_push_tokens';
export const DEFAULT_REMIND_HOUR = 19; // alışverişten bir önceki gün 19:00 (Türkiye saati)

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Türkiye saati sabit UTC+3 (yaz saati uygulaması yok).
export const istanbulTodayISO = (now = Date.now()) => {
  const d = new Date(now + 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const addDays = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

// Alışveriş gününden bir gün önce saat HH:00 (Türkiye) → ISO (UTC).
export const defaultRemindAt = (shopDate, hour = DEFAULT_REMIND_HOUR) =>
  new Date(`${addDays(shopDate, -1)}T${pad(hour)}:00:00+03:00`).toISOString();

/*
  Planı doğrular. Dönüş: { ok: true, plan } | { ok: false, reason }
  reason: 'date' (geçersiz tarih) | 'past' (alışveriş günü geçmiş) | 'far' (60 günden uzak)
  Hatırlatma zamanı geçmişte kalıyorsa (örn. alışveriş yarın, saat 19:00'u geçmiş) 15 dk sonrasına çekilir.
*/
export const buildPlan = ({ shopDate, remindAt }, now = Date.now()) => {
  if (!DATE_RE.test(String(shopDate || ''))) return { ok: false, reason: 'date' };
  const today = istanbulTodayISO(now);
  if (shopDate < today) return { ok: false, reason: 'past' };
  if (shopDate > addDays(today, 60)) return { ok: false, reason: 'far' };
  let at = remindAt ? Date.parse(remindAt) : NaN;
  const shopStart = Date.parse(`${shopDate}T00:00:00+03:00`);
  const shopEnd = shopStart + 24 * 3600 * 1000;
  if (!Number.isFinite(at) || at >= shopEnd) at = Date.parse(defaultRemindAt(shopDate));
  let adjusted = false;
  if (at < now + 60 * 1000) {
    at = now + 15 * 60 * 1000;
    adjusted = true;
  }
  return { ok: true, plan: { shopDate, remindAt: new Date(at).toISOString(), adjusted } };
};

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// "1 Kasım Cumartesi"
export const formatShopDate = (iso) => {
  if (!DATE_RE.test(String(iso || ''))) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${MONTH_NAMES[m - 1]} ${DAY_NAMES[wd]}`;
};

// "31 Ekim Cuma 19:00" (Türkiye saati)
export const formatRemindAt = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3 * 3600 * 1000);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${formatShopDate(date)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

// Sunucuya giden kısa liste (yalnızca alınmamış ürünler; ad, adet, son fiyat, son mağaza).
export const planItemsFromList = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((it) => it && !it.checked && String(it.name || '').trim())
    .slice(0, 60)
    .map((it) => ({
      name: String(it.name).trim().slice(0, 80),
      quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
      unit: String(it.unit || 'adet').slice(0, 10),
      last_price: Number.isFinite(Number(it.lastPrice)) && it.lastPrice !== null ? Number(it.lastPrice) : null,
      last_store: it.lastStore ? String(it.lastStore).slice(0, 40) : null,
      size: it.size ? String(it.size).slice(0, 20) : null,
      comparable: it.comparable !== false,
    }));

// Fiyat aramasında kullanılacak ilçe: son market fişinin ilçesi.
export const homeDistrict = (documents) => {
  const docs = receiptDocsOf(documents).filter((d) => d.analysis.receipt.store && d.analysis.receipt.store.type === 'market');
  const r = docs.length ? docs[0].analysis.receipt : null;
  return { district: r ? r.store.district : null, city: r ? r.store.city : null };
};

/*
  Hatırlatma metni (fiyat karşılaştırması olmadan). Sunucu fiyat kaynağı bağlandığında kendi
  metnini üretir; bu metin telefonun kendi kurduğu bildirim ve yedek içindir.
*/
export const buildReminderText = (planItems, shopDate, remindAt) => {
  const items = Array.isArray(planItems) ? planItems : [];
  // Hatırlatma alışveriş gününe denk geliyorsa "Bugün", değilse "Yarın".
  const remindDay = remindAt && Number.isFinite(Date.parse(remindAt)) ? istanbulTodayISO(Date.parse(remindAt)) : null;
  const when = remindDay && remindDay === shopDate ? 'Bugün' : 'Yarın';
  const title = `🛒 ${when} alışveriş günün${shopDate ? ` (${formatShopDate(shopDate)})` : ''}`;
  if (!items.length) {
    return { title, body: 'Alışveriş listen boş. Almak istediklerini Akıllı Alışveriş\'e eklemeyi unutma.' };
  }
  const names = items.slice(0, 4).map((it) => it.name).join(', ');
  const more = items.length > 4 ? ` ve ${items.length - 4} ürün daha` : '';
  const priced = items.filter((it) => it.last_price !== null);
  const lastTotal = priced.reduce((sum, it) => sum + it.last_price * it.quantity, 0);
  let body = `Listende ${items.length} ürün var: ${names}${more}.`;
  if (priced.length) body += ` Geçen sefer bunlara yaklaşık ${formatTL(Math.round(lastTotal * 100) / 100)} ödedin.`;
  return { title, body: body.slice(0, 230) };
};

// A local reminder is device-owned. Recreate it only for an eligible local plan
// and cancel it if the account scope changes while the native schedule is pending.
export const restoreLocalShoppingReminder = async ({ plan, permission, supported, isCurrent, schedule, cancel }) => {
  if (!plan || plan.delivery !== 'local') return { ok: false, reason: 'delivery' };
  if (!supported) return { ok: false, reason: 'unsupported' };
  if (permission !== 'granted') return { ok: false, reason: 'permission' };
  if (typeof isCurrent !== 'function' || !isCurrent()) return { ok: false, reason: 'stale' };
  const text = buildReminderText(plan.items, plan.shopDate, plan.remindAt);
  let result;
  try {
    result = await schedule({ title: text.title, body: text.body, at: plan.remindAt });
  } catch {
    result = { ok: false, reason: 'error' };
  }
  if (!isCurrent()) {
    try { await cancel(); } catch { /* The next account transition retries global cleanup. */ }
    return { ok: false, reason: 'stale' };
  }
  return result || { ok: false, reason: 'schedule' };
};

// Ekranda gösterilecek "geçen sefer" özeti: mağaza bazında.
export const lastStoreSummary = (planItems) => {
  const byStore = new Map();
  (planItems || []).forEach((it) => {
    if (!it.last_store || it.last_price === null) return;
    const cur = byStore.get(it.last_store) || { store: it.last_store, count: 0, total: 0 };
    cur.count += 1;
    cur.total += it.last_price * it.quantity;
    byStore.set(it.last_store, cur);
  });
  return [...byStore.values()].map((x) => ({ ...x, total: Math.round(x.total * 100) / 100 }));
};

/* ---------- sunucu ---------- */

const withTimeout = (promise, ms = 12000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// Planı sunucuya yazar (kullanıcı başına tek satır). Giriş yoksa sessizce atlanır.
export const reservePlanWriteRevision = async (supabase, uid) => {
  if (!supabase || !uid) return { ok: false, reason: 'auth' };
  try {
    const res = await withTimeout(supabase.rpc('bakplanla_reserve_shopping_plan_revision', { p_expected_user: uid }));
    if (res && res.error) return { ok: false, reason: 'server' };
    const revision = Number(res?.data);
    if (!Number.isSafeInteger(revision) || revision < 1) return { ok: false, reason: 'server' };
    return { ok: true, revision };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
};

export const savePlanToServer = async (supabase, uid, { plan, items, district, city, delivery, revision }) => {
  if (!supabase || !uid) return { ok: false, reason: 'auth' };
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) return { ok: false, reason: 'revision' };
  try {
    const res = await withTimeout(supabase.rpc('bakplanla_save_shopping_plan', {
      p_expected_user: uid,
      p_revision: Number(revision),
      p_shop_date: plan.shopDate,
      p_remind_at: plan.remindAt,
      p_district: district || null,
      p_city: city || null,
      p_items: items,
      p_delivery: delivery,
    }));
    if (res && res.error) return { ok: false, reason: 'server' };
    if (res?.data !== true) return { ok: false, reason: 'stale' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
};

export const deletePlanFromServer = async (supabase, uid) => {
  if (!supabase || !uid) return { ok: false, reason: 'auth' };
  try {
    const res = await withTimeout(supabase.rpc('bakplanla_cancel_shopping_plan', { p_expected_user: uid }));
    if (res && res.error) return { ok: false, reason: 'server' };
    if (res?.data !== true) return { ok: false, reason: 'server' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
};

export const savePushToken = async (supabase, uid, token, platform) => {
  if (!supabase || !uid || !token) return { ok: false, reason: 'auth' };
  try {
    const res = await withTimeout(
      supabase.rpc('bakplanla_register_push_token', { p_token: token, p_platform: platform })
    );
    if (res?.error || res?.data !== true) return { ok: false, reason: 'server' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
};

export const deletePushToken = async (supabase, uid, token) => {
  if (!supabase || !uid || !token) return { ok: false, reason: 'auth' };
  try {
    const res = await withTimeout(
      supabase.from(PUSH_TOKENS_TABLE).delete().eq('user_id', uid).eq('token', token)
    );
    if (res && res.error) return { ok: false, reason: 'server' };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
};

export const hasPushTokenRegistration = async (supabase, uid) => {
  if (!supabase || !uid) return { ok: false, reason: 'auth' };
  try {
    // RLS scopes this existence check to auth.uid(); only the same user_id is
    // selected, never the push token value.
    const res = await withTimeout(
      supabase.from(PUSH_TOKENS_TABLE).select('user_id').eq('user_id', uid).limit(1)
    );
    if (res?.error || !Array.isArray(res?.data)) return { ok: false, reason: 'server' };
    return { ok: true, hasToken: res.data.length > 0 };
  } catch (error) {
    return { ok: false, reason: 'network' };
  }
};
