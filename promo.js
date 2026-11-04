/*
===========================================================
  BAKPLANLA — Promosyon kodu (kişiye özel, e-postaya bağlı)
  Saf JavaScript → Node ile test edilebilir. Supabase istemcisi dışarıdan verilir.

  Sunucu tarafı: supabase/20261022_03_promo_kodlari.sql çalıştırılmış olmalıdır
  (bakplanla_promo_codes tablosu + redeem_promo_code fonksiyonu).

  GÜVENLİK: Kodun geçerli olup olmadığına, kime ait olduğuna ve Pro'nun açılmasına
  YALNIZCA SUNUCU karar verir. Uygulama kod listesini göremez, kendini Pro yapamaz.
===========================================================
*/
import { classifyError } from './backup.js';

export const PROMO_RPC = 'redeem_promo_code';
export const PROMO_TIMEOUT_MS = 15000;

// Türkçe harfleri sunucuyla aynı şekilde çevirir (İ→I, Ş→S, Ğ→G, Ç→C, Ö→O, Ü→U).
const TR_MAP = { 'İ': 'I', 'ı': 'I', 'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G', 'Ç': 'C', 'ç': 'C', 'Ö': 'O', 'ö': 'O', 'Ü': 'U', 'ü': 'U' };
const PROMO_MIN = 4;
const PROMO_MAX = 20;

// Kullanıcının yazdığını düzeltir: Türkçe harf çevrilir, boşluk/tire kaldırılır, BÜYÜK harf. Sunucu da aynısını yapar.
export const normalizePromoInput = (text) =>
  String(text || '')
    .replace(/[İıŞşĞğÇçÖöÜü]/g, (ch) => TR_MAP[ch])
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

// Yazarken: büyük harfe çevirir; harf, rakam ve tire kalır (BAK-XXXX-XXXX-XXXX ya da DENIZ2026 gibi).
export const formatPromoInput = (text) =>
  String(text || '')
    .replace(/[İıŞşĞğÇçÖöÜü]/g, (ch) => TR_MAP[ch])
    .replace(/[^A-Za-z0-9-]/g, '')
    .toUpperCase()
    .slice(0, 30);

// Hem üretilen (BAK + 12) hem de elle seçilen (4–20 harf/rakam) kodlar kabul edilir.
export const looksLikePromo = (text) => {
  const n = normalizePromoInput(text);
  return n.length >= PROMO_MIN && n.length <= Math.max(PROMO_MAX, 15);
};

const withTimeout = (promise, ms = PROMO_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ kind: 'timeout', message: 'timeout' }), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

const SERVER_ERRORS = ['invalid', 'used', 'not_yours', 'email_not_confirmed', 'too_many'];

// Dönüş: { ok:true, until, already } | { ok:false, error } — error: invalid | used | not_yours |
// email_not_confirmed | too_many | network | setup | auth | other
export const redeemPromo = async (supabase, code) => {
  try {
    const res = await withTimeout(supabase.rpc(PROMO_RPC, { p_code: normalizePromoInput(code) }));
    if (res && res.error) return { ok: false, error: classifyError(res.error) };
    const d = (res && res.data) || {};
    if (d.ok === true) return { ok: true, until: d.until || null, already: d.already === true };
    return { ok: false, error: SERVER_ERRORS.includes(d.error) ? d.error : 'other' };
  } catch (error) {
    return { ok: false, error: classifyError(error) };
  }
};

// Hata mesajları (tx: (tr, en, de) => metin)
export const promoErrorText = (tx, error) => {
  switch (error) {
    case 'invalid':
      return tx('Bu kod geçerli değil. Harfleri ve rakamları kontrol et.', 'This code is not valid. Check the letters and numbers.', 'Dieser Code ist ungültig. Prüfe Buchstaben und Zahlen.');
    case 'used':
      return tx('Bu kod daha önce başka bir hesapta kullanılmış.', 'This code has already been used by another account.', 'Dieser Code wurde bereits von einem anderen Konto verwendet.');
    case 'not_yours':
      return tx('Bu kod bu hesaba ait değil. Kod, kendisi için oluşturulan e-posta ile kullanılabilir.', 'This code does not belong to this account. It only works with the e-mail it was created for.', 'Dieser Code gehört nicht zu diesem Konto. Er funktioniert nur mit der E-Mail, für die er erstellt wurde.');
    case 'email_not_confirmed':
      return tx('Önce e-posta adresini doğrulaman gerekiyor. Gelen kutundaki doğrulama bağlantısına tıkla.', 'Please confirm your e-mail address first using the link in your inbox.', 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.');
    case 'too_many':
      return tx('Çok fazla hatalı deneme yapıldı. Biraz sonra tekrar dene.', 'Too many wrong attempts. Please try again later.', 'Zu viele Fehlversuche. Bitte versuche es später erneut.');
    case 'network':
      return tx('İnternet bağlantısı yok ya da sunucuya ulaşılamadı.', 'No internet connection or the server could not be reached.', 'Keine Internetverbindung oder Server nicht erreichbar.');
    case 'setup':
      return tx('Promosyon sistemi sunucuda henüz kurulmamış.', 'The promo system is not set up on the server yet.', 'Das Promo-System ist auf dem Server noch nicht eingerichtet.');
    case 'auth':
      return tx('Oturumun sona ermiş olabilir. Çıkış yapıp tekrar giriş yap.', 'Your session may have expired. Sign out and sign in again.', 'Deine Sitzung ist evtl. abgelaufen. Ab- und wieder anmelden.');
    default:
      return tx('Beklenmeyen bir hata oluştu. Tekrar dene.', 'Something went wrong. Please try again.', 'Unerwarteter Fehler. Bitte erneut versuchen.');
  }
};
