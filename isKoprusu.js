/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — kurallar, metinler, yardımcılar
  "Oyundan gerçek hayata, deneyimden işe."

  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilir.
  ÖNEMLİ: Buradaki kontroller yalnızca kullanıcıya erken ve anlaşılır uyarı içindir.
  ASIL kontrol sunucudadır (supabase/migrations/20261022_02_is_koprusu.sql).
===========================================================
*/

import { ROLES, roleLevelInfo, roleLevels } from './isbasi.js';

export const IK_QR_PREFIX = 'BAKPLANLA:VRD:';
export const IK_TZ_OFFSET = '+03:00'; // Türkiye 2016'dan beri sabit UTC+3
export const IK_TOKEN_SECONDS = 300; // sunucudaki QR süresiyle aynı (5 dk)
export const IK_MIN_AGE = 18;

const pick = (lang, tr, en, de) => (lang === 'en' ? en : lang === 'de' ? de : tr);
export const L3 = (lang, o) => pick(lang, o.tr, o.en, o.de);

/* ---------------- Meslekler (İş Başı rolleri) ---------------- */
export const IK_ROLE_KEYS = ['barista', 'cashier', 'shelf'];
export const roleName = (role, lang = 'tr') => (ROLES[role] ? pick(lang, ROLES[role].tr, ROLES[role].en, ROLES[role].de) : role);
export const roleIcon = (role) => (ROLES[role] ? ROLES[role].icon : '💼');
export const roleMaxLevel = (role) => (IK_ROLE_KEYS.includes(role) ? roleLevels(role).length : 0);
export const levelTitle = (role, level, lang = 'tr') => {
  const info = roleLevelInfo(role, level);
  return info ? pick(lang, info.tr, info.en, info.de) : '';
};
// Rozet adı: "KASİYER ROZETİ · Seviye 3"
export const badgeName = (role, level, lang = 'tr') => {
  const up = roleName(role, lang).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US');
  return `${up} ${pick(lang, 'ROZETİ', 'BADGE', 'ABZEICHEN')} · ${pick(lang, 'Seviye', 'Level', 'Stufe')} ${level}`;
};

/* ---------------- Akış ---------------- */
export const FLOW = [
  { key: 'compass', icon: '🧭', tr: 'PUSULA', en: 'COMPASS', de: 'KOMPASS', subTr: 'Meslek keşfi', subEn: 'Find your field', subDe: 'Beruf entdecken' },
  { key: 'practice', icon: '🎮', tr: 'Meslek Provası', en: 'Job Rehearsal', de: 'Berufsprobe', subTr: 'İş Başı oyunu', subEn: 'On the Job game', subDe: 'Im-Job-Spiel' },
  { key: 'badge', icon: '🏅', tr: 'Meslek Rozeti', en: 'Job Badge', de: 'Berufsabzeichen', subTr: 'Sunucuda doğrulanır', subEn: 'Verified on server', subDe: 'Serverseitig geprüft' },
  { key: 'try', icon: '🤝', tr: 'Gerçekte Dene', en: 'Try It for Real', de: 'Echt ausprobieren', subTr: 'Ücretli deneme vardiyası', subEn: 'Paid trial shift', subDe: 'Bezahlte Probeschicht' },
  { key: 'apply', icon: '📝', tr: 'Başvuru', en: 'Application', de: 'Bewerbung', subTr: 'İşletme onaylar', subEn: 'Business approves', subDe: 'Betrieb bestätigt' },
  { key: 'shift', icon: '📲', tr: 'Ücretli Deneyim', en: 'Paid Experience', de: 'Bezahlte Erfahrung', subTr: 'QR ile giriş-çıkış', subEn: 'QR check-in/out', subDe: 'QR Ein-/Auschecken' },
  { key: 'review', icon: '⭐', tr: 'Değerlendirme', en: 'Review', de: 'Bewertung', subTr: 'İki taraf da puanlar', subEn: 'Both sides rate', subDe: 'Beide Seiten bewerten' },
  { key: 'offer', icon: '💼', tr: 'İş Teklifi', en: 'Job Offer', de: 'Jobangebot', subTr: 'Karar senin', subEn: 'Your decision', subDe: 'Du entscheidest' },
];

/* ---------------- Durumlar ---------------- */
export const APP_STATUS = {
  received: { tr: 'Başvuru alındı', en: 'Received', de: 'Eingegangen', color: '#3F7FD6', bg: '#E4EEFB' },
  reviewing: { tr: 'Değerlendiriliyor', en: 'Under review', de: 'In Prüfung', color: '#B7791F', bg: '#FCF1DC' },
  approved: { tr: 'Onaylandı', en: 'Approved', de: 'Bestätigt', color: '#0E6B45', bg: '#DDF5E8' },
  rejected: { tr: 'Reddedildi', en: 'Rejected', de: 'Abgelehnt', color: '#B23A30', bg: '#FBE4E1' },
  cancelled_by_user: { tr: 'Sen iptal ettin', en: 'Cancelled by you', de: 'Von dir storniert', color: '#6E7F7A', bg: '#EEF2EF' },
  cancelled_by_business: { tr: 'İşletme iptal etti', en: 'Cancelled by business', de: 'Vom Betrieb storniert', color: '#B23A30', bg: '#FBE4E1' },
  completed: { tr: 'Tamamlandı', en: 'Completed', de: 'Abgeschlossen', color: '#0A3D33', bg: '#F5E6BF' },
  no_show: { tr: 'Gelmedi', en: 'No-show', de: 'Nicht erschienen', color: '#B23A30', bg: '#FBE4E1' },
};
export const SHIFT_STATUS = {
  pending_review: { tr: 'İncelemede', en: 'In review', de: 'In Prüfung', color: '#B7791F', bg: '#FCF1DC' },
  rejected: { tr: 'Yayına alınmadı', en: 'Not published', de: 'Nicht veröffentlicht', color: '#B23A30', bg: '#FBE4E1' },
  published: { tr: 'Yayında', en: 'Published', de: 'Veröffentlicht', color: '#0E6B45', bg: '#DDF5E8' },
  full: { tr: 'Dolu', en: 'Full', de: 'Voll', color: '#6E7F7A', bg: '#EEF2EF' },
  cancelled: { tr: 'İptal edildi', en: 'Cancelled', de: 'Storniert', color: '#B23A30', bg: '#FBE4E1' },
  completed: { tr: 'Tamamlandı', en: 'Completed', de: 'Abgeschlossen', color: '#0A3D33', bg: '#F5E6BF' },
};
export const BIZ_STATUS = {
  pending: { tr: 'Onay bekliyor', en: 'Awaiting verification', de: 'Wartet auf Prüfung', color: '#B7791F', bg: '#FCF1DC' },
  verified: { tr: 'Doğrulandı', en: 'Verified', de: 'Verifiziert', color: '#0E6B45', bg: '#DDF5E8' },
  rejected: { tr: 'Reddedildi', en: 'Rejected', de: 'Abgelehnt', color: '#B23A30', bg: '#FBE4E1' },
  suspended: { tr: 'Askıya alındı', en: 'Suspended', de: 'Gesperrt', color: '#B23A30', bg: '#FBE4E1' },
};
export const statusInfo = (table, key) => table[key] || { tr: key, en: key, de: key, color: '#6E7F7A', bg: '#EEF2EF' };

// Sunucudaki bk_transition_ok ile AYNI tablo (yalnızca hangi düğmelerin gösterileceği için).
export const TRANSITIONS = {
  candidate: { received: ['cancelled_by_user'], reviewing: ['cancelled_by_user'], approved: ['cancelled_by_user'] },
  business: { received: ['reviewing', 'approved', 'rejected'], reviewing: ['approved', 'rejected'], approved: ['cancelled_by_business', 'no_show'] },
};
export const canTransition = (from, to, actor) => ((TRANSITIONS[actor] || {})[from] || []).includes(to);
export const ACTIVE_APP = ['received', 'reviewing', 'approved'];

/* ---------------- Değerlendirme ---------------- */
export const RATING_KEYS = {
  candidate: [ // gencin işletmeyi değerlendirmesi
    { key: 'communication', tr: 'İletişim', en: 'Communication', de: 'Kommunikation' },
    { key: 'conditions_match', tr: 'Koşullar ilanla uyumluydu', en: 'Conditions matched the listing', de: 'Bedingungen wie angegeben' },
    { key: 'guidance', tr: 'Eğitim ve yönlendirme', en: 'Training and guidance', de: 'Einweisung und Anleitung' },
    { key: 'pay_clarity', tr: 'Ücret ve ödeme açıklığı', en: 'Pay clarity', de: 'Klarheit der Bezahlung' },
  ],
  business: [ // işletmenin genci değerlendirmesi (işe dair somut ölçütler)
    { key: 'punctuality', tr: 'Dakiklik', en: 'Punctuality', de: 'Pünktlichkeit' },
    { key: 'task_completion', tr: 'Görevleri tamamlama', en: 'Task completion', de: 'Aufgabenerledigung' },
    { key: 'following_instructions', tr: 'Talimatlara uyma', en: 'Following instructions', de: 'Anweisungen befolgen' },
    { key: 'customer_communication', tr: 'Müşteriyle iletişim', en: 'Customer communication', de: 'Kundenkommunikation' },
  ],
};
export const validRatings = (side, ratings) => {
  const keys = (RATING_KEYS[side] || []).map((k) => k.key);
  if (!keys.length || !ratings || typeof ratings !== 'object') return false;
  if (Object.keys(ratings).length !== keys.length) return false;
  return keys.every((k) => Number.isInteger(ratings[k]) && ratings[k] >= 1 && ratings[k] <= 5);
};
export const averageOf = (obj) => {
  const vals = Object.values(obj || {}).map(Number).filter((n) => Number.isFinite(n));
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
};

export const OFFER_TYPES = [
  { key: 'interview', tr: 'Görüşme daveti', en: 'Interview invitation', de: 'Einladung zum Gespräch' },
  { key: 'part_time', tr: 'Yarı zamanlı iş', en: 'Part-time job', de: 'Teilzeitjob' },
  { key: 'full_time', tr: 'Tam zamanlı iş', en: 'Full-time job', de: 'Vollzeitjob' },
  { key: 'seasonal', tr: 'Sezonluk iş', en: 'Seasonal job', de: 'Saisonjob' },
];
export const offerTypeName = (key, lang = 'tr') => {
  const o = OFFER_TYPES.find((x) => x.key === key);
  return o ? L3(lang, o) : key;
};
export const PAYMENT_METHODS = [
  { key: 'bank_transfer', tr: 'Banka havalesi', en: 'Bank transfer', de: 'Überweisung' },
  { key: 'cash', tr: 'Nakit', en: 'Cash', de: 'Bar' },
  { key: 'other', tr: 'Diğer', en: 'Other', de: 'Andere' },
];
export const paymentMethodName = (key, lang = 'tr') => {
  const o = PAYMENT_METHODS.find((x) => x.key === key);
  return o ? L3(lang, o) : key;
};

/* ---------------- Zaman ve ücret ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');
export const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};
export const shiftStartMs = (shift) => Date.parse(`${shift.shift_date}T${String(shift.start_time).slice(0, 5)}:00${IK_TZ_OFFSET}`);
export const shiftEndMs = (shift) => Date.parse(`${shift.shift_date}T${String(shift.end_time).slice(0, 5)}:00${IK_TZ_OFFSET}`);
export const durationMinutes = (shift) => {
  const a = toMinutes(String(shift.start_time).slice(0, 5)); const b = toMinutes(String(shift.end_time).slice(0, 5));
  return a == null || b == null ? 0 : Math.max(0, b - a);
};
export const durationLabel = (minutes, lang = 'tr') => {
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  const hs = pick(lang, 'sa', 'h', 'Std.'); const ms = pick(lang, 'dk', 'min', 'Min.');
  return m ? `${h} ${hs} ${m} ${ms}` : `${h} ${hs}`;
};
export const formatTL = (amount) => {
  const n = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(n)) return '—';
  const [i, d] = n.toFixed(2).split('.');
  const withDots = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return d === '00' ? `${withDots} ₺` : `${withDots},${d} ₺`;
};
// Toplam ücret (saatlik ilanlarda süre × saatlik ücret)
export const totalPay = (shift) => (shift.pay_type === 'hourly'
  ? Math.round(Number(shift.pay_amount) * (durationMinutes(shift) / 60) * 100) / 100
  : Number(shift.pay_amount));
export const payLabel = (shift, lang = 'tr') => (shift.pay_type === 'hourly'
  ? `${formatTL(shift.pay_amount)}/${pick(lang, 'saat', 'hour', 'Std.')} · ${pick(lang, 'toplam', 'total', 'gesamt')} ${formatTL(totalPay(shift))}`
  : `${formatTL(shift.pay_amount)} ${pick(lang, 'toplam', 'total', 'gesamt')}`);

const MONTHS = {
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
};
const DAYS = {
  tr: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
};
export const formatDay = (isoDate, lang = 'tr') => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  if (!m) return '—';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const k = MONTHS[lang] ? lang : 'tr';
  return `${Number(m[3])} ${MONTHS[k][d.getUTCMonth()]} ${DAYS[k][d.getUTCDay()]}`;
};
export const formatDateTime = (iso, lang = 'tr') => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const local = new Date(ms + 3 * 3600 * 1000); // İstanbul saati
  const k = MONTHS[lang] ? lang : 'tr';
  return `${local.getUTCDate()} ${MONTHS[k][local.getUTCMonth()]} ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
};
// İstanbul'a göre bugünün tarihi (YYYY-MM-DD), gün eklenebilir
export const istanbulDay = (nowMs = Date.now(), addDays = 0) => {
  const d = new Date(nowMs + 3 * 3600 * 1000 + addDays * 86400 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

// Sunucudaki pencerelerle aynı: giriş QR'ı vardiyadan 60 dk önce açılır, bitişten 3 saat sonra kapanır.
export const qrWindow = (shift, nowMs = Date.now()) => {
  const start = shiftStartMs(shift); const end = shiftEndMs(shift);
  if (!Number.isFinite(start)) return 'unknown';
  if (nowMs < start - 60 * 60000) return 'early';
  if (nowMs > end + 3 * 3600000) return 'late';
  return 'open';
};
export const canCancelApplication = (app, shift, nowMs = Date.now()) =>
  canTransition(app.status, 'cancelled_by_user', 'candidate') && !(app.status === 'approved' && nowMs >= shiftStartMs(shift));

/* ---------------- QR ---------------- */
export const parseCheckinPayload = (raw) => {
  const m = /^BAKPLANLA:VRD:([0-9a-f-]{36}):([0-9a-f]{32})$/.exec(String(raw || '').trim());
  return m ? { applicationId: m[1], token: m[2] } : null;
};

/* ---------------- Form doğrulama ---------------- */
const str = (v) => String(v == null ? '' : v).trim();
const lenOk = (v, mn, mx) => str(v).length >= mn && str(v).length <= mx;

export const EMPTY_SHIFT_FORM = () => ({
  title: '', role: 'cashier', description: '', shift_date: '', start_time: '10:00', end_time: '14:00',
  capacity: '1', pay_amount: '', pay_type: 'total', payment_method: 'bank_transfer', payment_timing: '',
  min_level: '1', address: '', district: '', city: 'İstanbul', safety_info: '', cancel_policy: '', legal_declared: false,
});

export const validateShiftForm = (f, nowMs = Date.now()) => {
  const errors = {};
  if (!lenOk(f.title, 3, 80)) errors.title = 'len';
  if (!IK_ROLE_KEYS.includes(f.role)) errors.role = 'invalid';
  if (!lenOk(f.description, 10, 1000)) errors.description = 'len';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(f.shift_date))) errors.shift_date = 'invalid';
  else if (str(f.shift_date) < istanbulDay(nowMs) || str(f.shift_date) > istanbulDay(nowMs, 120)) errors.shift_date = 'range';
  const a = toMinutes(f.start_time); const b = toMinutes(f.end_time);
  if (a == null) errors.start_time = 'invalid';
  if (b == null || (a != null && (b <= a || b - a > 720))) errors.end_time = 'invalid';
  if (!errors.shift_date && a != null) {
    const start = Date.parse(`${str(f.shift_date)}T${str(f.start_time).padStart(5, '0')}:00${IK_TZ_OFFSET}`);
    if (!(start > nowMs + 2 * 3600000)) errors.start_time = 'too_soon';
  }
  const cap = Number(f.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) errors.capacity = 'invalid';
  const pay = Number(String(f.pay_amount).replace(',', '.'));
  if (!Number.isFinite(pay) || pay < 1 || pay > 100000) errors.pay_amount = 'invalid';
  if (!['total', 'hourly'].includes(f.pay_type)) errors.pay_type = 'invalid';
  if (!PAYMENT_METHODS.some((p) => p.key === f.payment_method)) errors.payment_method = 'invalid';
  if (!lenOk(f.payment_timing, 3, 120)) errors.payment_timing = 'len';
  const lvl = Number(f.min_level);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > roleMaxLevel(f.role)) errors.min_level = 'invalid';
  if (!lenOk(f.address, 5, 200)) errors.address = 'len';
  if (!lenOk(f.district, 2, 60)) errors.district = 'len';
  if (!lenOk(f.city, 2, 60)) errors.city = 'len';
  if (!lenOk(f.safety_info, 10, 1000)) errors.safety_info = 'len';
  if (!lenOk(f.cancel_policy, 10, 500)) errors.cancel_policy = 'len';
  if (f.legal_declared !== true) errors.legal_declared = 'required';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    payload: ok ? {
      title: str(f.title), role: f.role, description: str(f.description), shift_date: str(f.shift_date),
      start_time: str(f.start_time).padStart(5, '0'), end_time: str(f.end_time).padStart(5, '0'),
      capacity: cap, pay_amount: Math.round(pay * 100) / 100, pay_type: f.pay_type, payment_method: f.payment_method,
      payment_timing: str(f.payment_timing), min_level: lvl, min_age: IK_MIN_AGE, address: str(f.address),
      district: str(f.district), city: str(f.city), safety_info: str(f.safety_info), cancel_policy: str(f.cancel_policy),
      legal_declared: true,
    } : null,
  };
};

export const EMPTY_BIZ_FORM = () => ({
  name: '', contact_person: '', contact_phone: '', contact_email: '', address: '', district: '', city: 'İstanbul', sector: '', tax_number: '',
});
export const validateBusinessForm = (f) => {
  const errors = {};
  if (!lenOk(f.name, 2, 80)) errors.name = 'len';
  if (!lenOk(f.contact_person, 2, 60)) errors.contact_person = 'len';
  const phone = str(f.contact_phone).replace(/[^0-9+]/g, '');
  if (phone.length < 10 || phone.length > 15) errors.contact_phone = 'invalid';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(f.contact_email)) || str(f.contact_email).length > 120) errors.contact_email = 'invalid';
  if (!lenOk(f.address, 5, 200)) errors.address = 'len';
  if (!lenOk(f.district, 2, 60)) errors.district = 'len';
  if (!lenOk(f.city, 2, 60)) errors.city = 'len';
  if (!lenOk(f.sector, 2, 60)) errors.sector = 'len';
  const tax = str(f.tax_number).replace(/\s/g, '');
  if (tax && !/^[0-9]{10,11}$/.test(tax)) errors.tax_number = 'invalid';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    payload: ok ? {
      name: str(f.name), contact_person: str(f.contact_person), contact_phone: phone, contact_email: str(f.contact_email),
      address: str(f.address), district: str(f.district), city: str(f.city), sector: str(f.sector), tax_number: tax || null,
    } : null,
  };
};

/* ---------------- Hatalar ---------------- */
// Supabase RPC hatasını tek bir koda çevirir.
export const errorCode = (error) => {
  if (!error) return 'unknown';
  const msg = String(error.message || error || '');
  const m = /bk:([a-z_:]+)/.exec(msg);
  if (m) return m[1];
  if (error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(msg)) return 'not_installed';
  if (error.code === '42501' || /permission denied/i.test(msg)) return 'not_allowed';
  if (/network|fetch|timeout|abort/i.test(msg)) return 'network';
  return 'unknown';
};

const FIELD = {
  title: ['Başlık', 'Title', 'Titel'], role: ['Meslek', 'Job', 'Beruf'], description: ['Açıklama', 'Description', 'Beschreibung'],
  shift_date: ['Tarih', 'Date', 'Datum'], start_time: ['Başlangıç saati', 'Start time', 'Beginn'], end_time: ['Bitiş saati', 'End time', 'Ende'],
  capacity: ['Kontenjan', 'Capacity', 'Plätze'], pay_amount: ['Ücret', 'Pay', 'Lohn'], pay_type: ['Ücret türü', 'Pay type', 'Lohnart'],
  payment_method: ['Ödeme yöntemi', 'Payment method', 'Zahlungsart'], payment_timing: ['Ödeme zamanı', 'Payment timing', 'Zahlungszeitpunkt'],
  min_level: ['Gereken seviye', 'Required level', 'Benötigte Stufe'], min_age: ['Yaş sınırı', 'Minimum age', 'Mindestalter'],
  address: ['Adres', 'Address', 'Adresse'], district: ['İlçe', 'District', 'Bezirk'], city: ['Şehir', 'City', 'Stadt'],
  safety_info: ['İş güvenliği bilgisi', 'Safety information', 'Sicherheitsinfo'], cancel_policy: ['İptal koşulları', 'Cancellation policy', 'Stornobedingungen'],
  apply_deadline: ['Başvuru son tarihi', 'Application deadline', 'Bewerbungsfrist'], name: ['İşletme adı', 'Business name', 'Betriebsname'],
  contact_person: ['Yetkili kişi', 'Contact person', 'Ansprechpartner'], contact_phone: ['Telefon', 'Phone', 'Telefon'],
  contact_email: ['E-posta', 'Email', 'E-Mail'], sector: ['Faaliyet alanı', 'Sector', 'Branche'], tax_number: ['Vergi no', 'Tax number', 'Steuernummer'],
  display_name: ['Görünen ad', 'Display name', 'Anzeigename'], message: ['Mesaj', 'Message', 'Nachricht'], ratings: ['Puanlar', 'Ratings', 'Bewertungen'],
  comment: ['Yorum', 'Comment', 'Kommentar'], reason: ['Açıklama', 'Reason', 'Begründung'], note: ['Not', 'Note', 'Notiz'],
  details: ['Detaylar', 'Details', 'Details'], pay_info: ['Ücret bilgisi', 'Pay info', 'Lohninfo'], conditions: ['Çalışma koşulları', 'Conditions', 'Bedingungen'],
  offer_type: ['Teklif türü', 'Offer type', 'Angebotsart'], city_: ['Şehir', 'City', 'Stadt'],
};
export const fieldName = (key, lang = 'tr') => {
  const f = FIELD[key];
  return f ? pick(lang, f[0], f[1], f[2]) : key;
};

const ERR = {
  not_signed_in: ['Bu işlem için giriş yapmalısın.', 'Please sign in first.', 'Bitte melde dich an.'],
  not_installed: ['İş Köprüsü sunucuda henüz kurulmamış. Yönetici kurulum adımlarını tamamlamalı (KURULUM-IS-KOPRUSU.md).', 'Job Bridge is not set up on the server yet.', 'Die Job-Brücke ist auf dem Server noch nicht eingerichtet.'],
  network: ['Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.', 'Could not reach the server. Check your connection.', 'Server nicht erreichbar. Prüfe deine Verbindung.'],
  not_allowed: ['Bu işlem için yetkin yok.', 'You are not allowed to do this.', 'Dafür fehlt dir die Berechtigung.'],
  not_found: ['Kayıt bulunamadı ya da görme yetkin yok.', 'Not found or no access.', 'Nicht gefunden oder kein Zugriff.'],
  not_adult: ['İlk sürümde ücretli deneyimler yalnızca 18 yaş ve üzeri içindir.', 'Paid experiences are for 18+ in this version.', 'Bezahlte Erfahrungen nur ab 18.'],
  profile_required: ['Önce İş Köprüsü profilini oluştur.', 'Create your Job Bridge profile first.', 'Erstelle zuerst dein Profil.'],
  demo_shift: ['Bu bir DEMO ilandır, başvuru yapılamaz.', 'This is a DEMO listing; you cannot apply.', 'DEMO-Anzeige, keine Bewerbung möglich.'],
  shift_full: ['Kontenjan dolu.', 'No seats left.', 'Keine Plätze frei.'],
  not_published: ['Bu ilan şu an başvuruya açık değil.', 'This listing is not open.', 'Diese Anzeige ist nicht offen.'],
  business_not_verified: ['İşletme henüz doğrulanmadı.', 'The business is not verified yet.', 'Der Betrieb ist noch nicht verifiziert.'],
  own_business: ['Kendi işletmenin ilanına başvuramazsın.', 'You cannot apply to your own business.', 'Nicht beim eigenen Betrieb bewerben.'],
  deadline_passed: ['Başvuru süresi doldu.', 'The application deadline has passed.', 'Die Bewerbungsfrist ist abgelaufen.'],
  badge_required: ['Bu ilan için gereken meslek rozetine henüz sahip değilsin. İş Başı\'nda ilgili seviyeyi en az 2 yıldızla, sunucuya bağlıyken tamamla.', 'You do not have the required badge yet. Finish the level in On the Job with at least 2 stars while online.', 'Dir fehlt das nötige Abzeichen.'],
  already_applied: ['Bu ilana zaten başvurdun.', 'You already applied.', 'Du hast dich bereits beworben.'],
  too_many_active: ['Aynı anda en fazla 5 açık başvurun olabilir.', 'At most 5 open applications at a time.', 'Höchstens 5 offene Bewerbungen.'],
  rate_limited: ['Çok fazla işlem yaptın. Biraz sonra tekrar dene.', 'Too many requests. Try again later.', 'Zu viele Anfragen. Später erneut.'],
  bad_transition: ['Bu işlem başvurunun şu anki durumunda yapılamaz.', 'Not possible in the current status.', 'Im aktuellen Status nicht möglich.'],
  shift_started: ['Vardiya başladı; bu işlem artık yapılamaz.', 'The shift has started.', 'Die Schicht hat begonnen.'],
  shift_not_started: ['Vardiya henüz başlamadı.', 'The shift has not started yet.', 'Die Schicht hat noch nicht begonnen.'],
  not_approved: ['Başvuru onaylı değil.', 'The application is not approved.', 'Bewerbung nicht bestätigt.'],
  shift_cancelled: ['Vardiya iptal edildi.', 'The shift was cancelled.', 'Die Schicht wurde storniert.'],
  wrong_time: ['QR yalnızca vardiyadan 1 saat önce ile bitişten 3 saat sonrası arasında kullanılabilir.', 'QR works from 1 hour before to 3 hours after the shift.', 'QR nur von 1 Std. vorher bis 3 Std. nach der Schicht.'],
  already_done: ['Bu vardiyanın giriş ve çıkışı tamamlandı.', 'Check-in and check-out are done.', 'Ein- und Auschecken erledigt.'],
  bad_code: ['Bu bir BAKPLANLA vardiya kodu değil.', 'This is not a BAKPLANLA shift code.', 'Kein BAKPLANLA-Schichtcode.'],
  wrong_business: ['Bu kod senin işletmenin vardiyasına ait değil.', 'This code belongs to another business.', 'Dieser Code gehört zu einem anderen Betrieb.'],
  token_used: ['Kod geçersiz ya da daha önce kullanılmış. Gençten yeni kod açmasını iste.', 'Code invalid or already used. Ask for a new code.', 'Code ungültig oder benutzt.'],
  token_expired: ['Kodun süresi doldu (5 dk). Gençten yeni kod açmasını iste.', 'The code expired (5 min).', 'Code abgelaufen (5 Min.).'],
  legal_not_confirmed: ['Giriş için önce bu kişi için yasal işlemleri (ör. SGK işe giriş bildirimi) yaptığını onaylamalısın.', 'Confirm the legal registration first.', 'Bestätige zuerst die gesetzliche Anmeldung.'],
  already_checked_in: ['Bu kişi zaten giriş yaptı.', 'Already checked in.', 'Bereits eingecheckt.'],
  not_checked_in: ['Önce giriş yapılmalı.', 'Check in first.', 'Zuerst einchecken.'],
  candidate_busy: ['Aday aynı saatlerde başka bir onaylı vardiyada.', 'The candidate has another approved shift at that time.', 'Kandidat hat zu der Zeit eine andere Schicht.'],
  not_completed: ['Bu işlem yalnızca tamamlanmış vardiyadan sonra yapılabilir.', 'Only after a completed shift.', 'Erst nach abgeschlossener Schicht.'],
  review_exists: ['Bu vardiya için değerlendirmen zaten kayıtlı. Değerlendirmeler değiştirilemez.', 'Review already submitted.', 'Bewertung bereits abgegeben.'],
  offer_exists: ['Bu kişiye açık bir teklifin zaten var.', 'An open offer already exists.', 'Es gibt schon ein offenes Angebot.'],
  not_editable: ['Yayındaki ilan düzenlenemez; gerekirse iptal edip yenisini oluştur.', 'Published listings cannot be edited.', 'Veröffentlichte Anzeigen sind nicht bearbeitbar.'],
  legal_declaration_required: ['Yasal yükümlülük beyanını işaretlemelisin.', 'Please tick the legal declaration.', 'Bitte bestätige die Erklärung.'],
  too_many_businesses: ['En fazla 3 işletme kaydedebilirsin.', 'At most 3 businesses.', 'Höchstens 3 Betriebe.'],
  unknown: ['Beklenmeyen bir hata oluştu. Tekrar dene.', 'Unexpected error. Please try again.', 'Unerwarteter Fehler.'],
};
export const errorText = (code, lang = 'tr') => {
  const c = String(code || 'unknown');
  if (c.startsWith('invalid:')) {
    const f = fieldName(c.slice(8), lang);
    return pick(lang, `Lütfen kontrol et: ${f}`, `Please check: ${f}`, `Bitte prüfen: ${f}`);
  }
  const e = ERR[c] || ERR.unknown;
  return pick(lang, e[0], e[1], e[2]);
};

/* ---------------- Bildirim metinleri (uygulama içi) ---------------- */
export const eventText = (ev, lang = 'tr') => {
  const d = (ev && ev.data) || {};
  const t = d.shift_title ? `“${d.shift_title}”` : '';
  switch (ev && ev.kind) {
    case 'application_received': return pick(lang, `${t} ilanına yeni başvuru geldi.`, `New application for ${t}.`, `Neue Bewerbung für ${t}.`);
    case 'application_cancelled': return pick(lang, `${t} için bir aday başvurusunu iptal etti.`, `A candidate cancelled for ${t}.`, `Ein Kandidat hat für ${t} storniert.`);
    case 'app_reviewing': return pick(lang, `${t} başvurun değerlendiriliyor.`, `Your application for ${t} is under review.`, `Deine Bewerbung für ${t} wird geprüft.`);
    case 'app_approved': return pick(lang, `🎉 ${t} başvurun onaylandı!`, `🎉 Approved for ${t}!`, `🎉 Bestätigt für ${t}!`);
    case 'app_rejected': return pick(lang, `${t} başvurun bu sefer olumlu sonuçlanmadı.`, `Your application for ${t} was not accepted.`, `Bewerbung für ${t} nicht angenommen.`);
    case 'app_cancelled_by_business': return pick(lang, `${t} vardiyandaki yerin işletme tarafından iptal edildi.`, `The business cancelled your place for ${t}.`, `Der Betrieb hat deinen Platz für ${t} storniert.`);
    case 'app_no_show': return pick(lang, `${t} vardiyası için "gelmedi" kaydı yapıldı. Yanlışsa itiraz edebilirsin.`, `Marked as no-show for ${t}. You can dispute it.`, `Als nicht erschienen markiert (${t}).`);
    case 'app_completed': return pick(lang, `✅ ${t} vardiyan tamamlandı. Değerlendirme yapabilirsin.`, `✅ ${t} completed. You can leave a review.`, `✅ ${t} abgeschlossen.`);
    case 'shift_cancelled': return pick(lang, `${t} vardiyası işletme tarafından iptal edildi.${d.reason ? ` Neden: ${d.reason}` : ''}`, `${t} was cancelled by the business.`, `${t} wurde storniert.`);
    case 'review_received': return pick(lang, `${t} için yeni bir değerlendirme aldın.`, `You received a review for ${t}.`, `Neue Bewertung für ${t}.`);
    case 'offer_received': return pick(lang, `💼 ${d.business || 'Bir işletme'} sana iş teklifi gönderdi.`, `💼 ${d.business || 'A business'} sent you a job offer.`, `💼 ${d.business || 'Ein Betrieb'} hat dir ein Angebot geschickt.`);
    case 'offer_answered': return pick(lang, `İş teklifin ${d.accepted ? 'kabul edildi ✅' : 'reddedildi'}.`, `Your offer was ${d.accepted ? 'accepted ✅' : 'declined'}.`, `Angebot ${d.accepted ? 'angenommen ✅' : 'abgelehnt'}.`);
    case 'shift_published': return pick(lang, `${t} ilanın yayına alındı.`, `${t} is now published.`, `${t} ist veröffentlicht.`);
    case 'shift_rejected': return pick(lang, `${t} ilanın yayına alınmadı.${d.note ? ` Not: ${d.note}` : ''}`, `${t} was not published.`, `${t} wurde nicht veröffentlicht.`);
    case 'business_verified': return pick(lang, '✅ İşletmen doğrulandı. Artık ilan açabilirsin.', '✅ Your business is verified.', '✅ Dein Betrieb ist verifiziert.');
    case 'business_rejected': return pick(lang, `İşletme başvurun onaylanmadı.${d.note ? ` Not: ${d.note}` : ''}`, 'Your business was not verified.', 'Betrieb nicht verifiziert.');
    case 'business_suspended': return pick(lang, `İşletmen askıya alındı.${d.note ? ` Not: ${d.note}` : ''}`, 'Your business was suspended.', 'Dein Betrieb wurde gesperrt.');
    default: return pick(lang, 'Yeni bir gelişme var.', 'There is an update.', 'Es gibt ein Update.');
  }
};

/* ---------------- Liste filtresi (istemci tarafı ek filtre) ---------------- */
export const sortShifts = (list) => [...(list || [])].sort((a, b) => (a.shift_date + a.start_time).localeCompare(b.shift_date + b.start_time));
export const seatsLeft = (shift) => Math.max(0, Number(shift.capacity) - Number(shift.seats_taken || 0));
export const eligibleFor = (shift) => Number(shift.my_badge_level || 0) >= Number(shift.min_level || 1);
