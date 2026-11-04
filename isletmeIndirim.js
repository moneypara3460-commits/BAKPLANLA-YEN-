/*
===========================================================
  BAKPLANLA — Anlaşmalı işletme indirim kodu (saf JavaScript → Node ile test edilir)

  Sunucu: supabase/migrations/20261024_07_isletme_indirim.sql
  Kural: giriş yapmış + e-postası doğrulanmış her kullanıcı, işletme başına GÜNDE 1 kez,
         Türkiye saatiyle 10:00–22:00 arası tek kullanımlık 6 haneli kod alır.
  Kodun geçerliliğine ve "kullanıldı" yapılmasına YALNIZCA SUNUCU karar verir.
  Kasa, QR'ı telefon kamerasıyla okutunca kasa sayfası kod hazır yazılı olarak açılır.
===========================================================
*/
import { classifyError } from './backup.js';

export const DISCOUNT_RPC = 'partner_discount_code';
export const DISCOUNT_TIMEOUT_MS = 15000;
// Kasa doğrulama sayfası (bakplanla-yasal GitHub Pages)
export const KASA_URL = 'https://moneypara3460-commits.github.io/bakplanla-yasal/kasa.html';

const SERVER_ERRORS = ['auth', 'email_not_confirmed', 'invalid', 'closed', 'used_today'];

export const kasaLink = (partnerId, code) =>
  `${KASA_URL}?i=${encodeURIComponent(partnerId)}&k=${encodeURIComponent(code)}`;

// 482913 → "482 913" (kasada okunması kolay)
export const formatCode = (code) => {
  const d = String(code || '').replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
};

// Türkiye saati (UTC+3, 2016'dan beri sabit) — yalnızca ekrandaki bilgi için; asıl kontrol sunucuda.
export const istanbulHHMM = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ kind: 'timeout', message: 'timeout' }), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });

// Dönüş: { ok:true, code, expiresAt, partner, percent, offer, already } | { ok:false, error, opens?, closes? }
export const getDiscountCode = async (supabase, partnerId, timeoutMs = DISCOUNT_TIMEOUT_MS) => {
  if (!supabase) return { ok: false, error: 'setup' };
  try {
    const res = await withTimeout(supabase.rpc(DISCOUNT_RPC, { p_partner: partnerId }), timeoutMs);
    if (res && res.error) return { ok: false, error: classifyError(res.error) };
    const d = (res && res.data) || {};
    if (d.ok === true && /^\d{6}$/.test(String(d.code || ''))) {
      return {
        ok: true,
        code: String(d.code),
        expiresAt: d.expires_at || null,
        partner: d.partner || '',
        percent: Number(d.percent) || 0,
        offer: d.offer || null,
        already: d.already === true,
      };
    }
    return {
      ok: false,
      error: SERVER_ERRORS.includes(d.error) ? d.error : 'other',
      opens: d.opens || '10:00',
      closes: d.closes || '22:00',
    };
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
};

export const discountErrorText = (tx, r) => {
  switch (r && r.error) {
    case 'auth':
      return tx('İndirim kodu almak için giriş yapman gerekiyor.', 'Please sign in to get a discount code.', 'Bitte melde dich an, um einen Rabattcode zu erhalten.');
    case 'email_not_confirmed':
      return tx('Önce e-posta adresini doğrulaman gerekiyor. Gelen kutundaki doğrulama bağlantısına tıkla.', 'Please confirm your e-mail address first.', 'Bitte bestätige zuerst deine E-Mail-Adresse.');
    case 'closed':
      return tx(`İndirim kodları her gün ${r.opens}–${r.closes} arasında (Türkiye saati) alınır ve kullanılır.`, `Codes are available daily ${r.opens}–${r.closes} (Turkey time).`, `Codes gibt es täglich ${r.opens}–${r.closes} (türkische Zeit).`);
    case 'used_today':
      return tx('Bugünkü indirimini kullandın. Yarın 10:00\'dan sonra yeniden alabilirsin.', 'You already used today\'s discount. Come back tomorrow after 10:00.', 'Du hast den heutigen Rabatt genutzt. Morgen ab 10:00 wieder.');
    case 'invalid':
      return tx('Bu işletmenin indirimi şu an aktif değil.', 'This discount is not active right now.', 'Dieser Rabatt ist derzeit nicht aktiv.');
    case 'network':
      return tx('İnternet bağlantısı yok ya da sunucuya ulaşılamadı.', 'No internet connection or the server could not be reached.', 'Keine Internetverbindung.');
    case 'setup':
      return tx('İndirim sistemi sunucuda henüz kurulmamış.', 'The discount system is not set up on the server yet.', 'Das Rabattsystem ist noch nicht eingerichtet.');
    default:
      return tx('Beklenmeyen bir hata oluştu. Tekrar dene.', 'Something went wrong. Please try again.', 'Unerwarteter Fehler. Bitte erneut versuchen.');
  }
};
