/*
===========================================================
  BAKPLANLA — cihaz eşleştirme (QR Merkezi) yardımcıları
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.

  Sunucu tarafı: supabase/bakplanla_devices.sql çalıştırılmış olmalıdır.

  NE YAPAR: Giriş yapmış bir cihaz, hesabındaki cihaz listesine başka bir cihazı ekler.
  NE YAPMAZ: QR ile OTURUM AKTARMAZ. Yani karşı cihaz şifresiz giriş yapmaz; orada da
  hesaba giriş yapılmış olmalıdır. Oturum aktarımı, çalınan bir QR'ın hesabı ele geçirmesine
  yol açabileceği için bilerek yapılmamıştır.
===========================================================
*/
import { classifyError } from './backup.js';

export const DEVICES_TABLE = 'bakplanla_devices';
export const PAIRING_CREATE_RPC = 'create_pairing_code';
export const PAIRING_REDEEM_RPC = 'redeem_pairing_code';
export const DEVICE_ID_KEY = 'PLAN_DEVICE_ID';
export const PAIRING_TIMEOUT_MS = 15000;
// Kod ömrü sunucuda da aynıdır (SQL'de 5 dakika). Buradaki değer yalnızca geri sayım içindir.
export const PAIRING_TTL_SECONDS = 300;

const PREFIX = 'BAKPLANLA:PAIR:';
const CODE_RE = /^[A-Z0-9]{8}$/;

/* ---------- QR içeriği ---------- */

// QR'a yazılan metin. Tarayan uygulama bunu tanır; başka bir uygulamada açılırsa anlamsız bir metindir.
export const buildPairingPayload = (code) => `${PREFIX}${String(code || '').toUpperCase()}`;

/*
  Taranan metinden eşleştirme kodunu çıkarır.
  Dönüş: { ok: true, code } | { ok: false, reason: 'format' }
  Yabancı QR'lar (adres, kartvizit vb.) sessizce reddedilir.
*/
export const parsePairingPayload = (raw) => {
  const text = String(raw == null ? '' : raw).trim();
  if (!text.startsWith(PREFIX)) return { ok: false, reason: 'format' };
  const code = text.slice(PREFIX.length).trim().toUpperCase();
  if (!CODE_RE.test(code)) return { ok: false, reason: 'format' };
  return { ok: true, code };
};

export const isValidCode = (code) => CODE_RE.test(String(code || '').toUpperCase());

/* ---------- cihaz kimliği ve adı ---------- */

// Cihaz kimliği yalnızca bu cihazda üretilir ve saklanır; kişisel bilgi içermez.
export const makeDeviceId = (random = Math.random) =>
  `dev-${Date.now().toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;

export const describePlatform = (os) => {
  if (os === 'ios') return 'iPhone / iPad';
  if (os === 'android') return 'Android';
  if (os === 'web') return 'Web';
  return 'Bilinmeyen cihaz';
};

export const formatLastSeen = (iso, lang = 'tr', now = Date.now()) => {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return lang === 'en' ? 'Unknown' : lang === 'de' ? 'Unbekannt' : lang === 'ar' ? 'غير معروف' : 'Bilinmiyor';
  const mins = Math.floor((now - t) / 60000);
  if (mins < 2) return lang === 'en' ? 'Just now' : lang === 'de' ? 'Gerade eben' : lang === 'ar' ? 'الآن' : 'Az önce';
  if (mins < 60) return lang === 'en' ? `${mins} min ago` : lang === 'de' ? `vor ${mins} Min.` : lang === 'ar' ? `منذ ${mins} دقيقة` : `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === 'en' ? `${hours} h ago` : lang === 'de' ? `vor ${hours} Std.` : lang === 'ar' ? `منذ ${hours} ساعة` : `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return lang === 'en' ? `${days} days ago` : lang === 'de' ? `vor ${days} Tagen` : lang === 'ar' ? `منذ ${days} يوم` : `${days} gün önce`;
};

export const secondsLeft = (expiresAt, now = Date.now()) => {
  const t = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((t - now) / 1000));
};

/* ---------- sunucu çağrıları ---------- */

const withTimeout = (promise, ms = PAIRING_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ kind: 'timeout', message: 'timeout' }), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

export const listDevices = async (supabase, uid) => {
  try {
    const res = await withTimeout(
      supabase.from(DEVICES_TABLE).select('device_id, name, platform, last_seen_at, created_at').eq('user_id', uid)
    );
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    const rows = Array.isArray(res && res.data) ? res.data.filter((r) => r && r.device_id) : [];
    rows.sort((a, b) => String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')));
    return { ok: true, devices: rows };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};

// Bu cihazı hesabın cihaz listesine yazar/günceller (giriş yapıldığında ve QR ekranı açıldığında).
export const upsertOwnDevice = async (supabase, { deviceId, name, platform }) => {
  try {
    const res = await withTimeout(
      supabase.from(DEVICES_TABLE).upsert(
        { device_id: deviceId, name, platform, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id,device_id' }
      )
    );
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};

export const removeDevice = async (supabase, uid, deviceId) => {
  try {
    const res = await withTimeout(
      supabase.from(DEVICES_TABLE).delete().eq('user_id', uid).eq('device_id', deviceId)
    );
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};

// Süreli, tek kullanımlık eşleştirme kodu üretir (sunucuda).
export const createPairingCode = async (supabase) => {
  try {
    const res = await withTimeout(supabase.rpc(PAIRING_CREATE_RPC));
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    const d = (res && res.data) || {};
    if (!isValidCode(d.code)) return { ok: false, reason: 'format' };
    return { ok: true, code: String(d.code).toUpperCase(), expiresAt: d.expires_at || null };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};

/*
  Taranan kodu kullanır. Sonuç:
    { ok: true, paired: true }                 → bu cihaz hesaba eklendi
    { ok: true, paired: false, reason: 'expired' | 'used' | 'unknown' | 'self' }
    { ok: false, reason }                      → sunucuya ulaşılamadı
*/
export const redeemPairingCode = async (supabase, { code, deviceId, name, platform }) => {
  if (!isValidCode(code)) return { ok: true, paired: false, reason: 'unknown' };
  try {
    const res = await withTimeout(
      supabase.rpc(PAIRING_REDEEM_RPC, {
        p_code: String(code).toUpperCase(),
        p_device_id: deviceId,
        p_name: name,
        p_platform: platform,
      })
    );
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    const d = (res && res.data) || {};
    if (d.paired === true) return { ok: true, paired: true };
    return { ok: true, paired: false, reason: typeof d.reason === 'string' ? d.reason : 'unknown' };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};
