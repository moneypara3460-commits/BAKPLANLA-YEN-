import { Platform, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from './fileSystemCompat';
import { toArabic } from './arabic';
import { pad2, toISO, parseISO, buildMonthCells } from './dateUtils';
export { pad2, toISO, parseISO, buildMonthCells } from './dateUtils';


/*
===========================================================
  BAKPLANLA — ortak sabitler, yardımcı fonksiyonlar, stiller
  (App.js dosyasından ayrıldı; Snack tek dosyada yaklaşık
  100.000 karakterden uzun yapıştırmayı kesiyor)
===========================================================
*/

/* ------------------------------------------------------- */
/*                        SABİTLER                         */
/* ------------------------------------------------------- */

export const APP_VERSION = '1.2.0';

export const STORAGE_KEYS = {
  tasks: 'PLAN_TASKS',
  documents: 'PLAN_DOCUMENTS',
  language: 'PLAN_LANGUAGE',
  darkTheme: 'PLAN_THEME',
  todayPreferences: 'PLAN_TODAY_PREFERENCES',
  userName: 'PLAN_USER_NAME',
  featureUsage: 'PLAN_FEATURE_USAGE',
};

export const USER_NAME_MIN = 2;
export const USER_NAME_MAX = 30;

// Ad bilgisi hesaplar arasında karışmasın diye oturum açan kullanıcının kimliğiyle ayrı anahtarda saklanır.
export const userNameKeyFor = (userId) => `${STORAGE_KEYS.userName}:${userId}`;

// Görünen ad doğrulaması: boşlukları sadeleştirir, uzunluk/harf/HTML karakteri kontrol eder.
export const validateDisplayName = (raw) => {
  const value = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!value) return { ok: false, reason: 'empty', value };
  if (value.length < USER_NAME_MIN) return { ok: false, reason: 'short', value };
  if (value.length > USER_NAME_MAX) return { ok: false, reason: 'long', value };
  if (/[<>]/.test(value) || /[\u0000-\u001F\u007F]/.test(value)) return { ok: false, reason: 'chars', value };
  if (value.toLowerCase() === value.toUpperCase()) return { ok: false, reason: 'letters', value };
  return { ok: true, value };
};

export const OLD_DEMO_TASK_IDS = ['dyson-return', 'electricity', 'insurance'];

export const BRAND = {
  green: '#1FA36F',
  dark: '#0A3D33',
  dark2: '#12524A',
  gold: '#F5B83D',
  red: '#E5534B',
  orange: '#EE9F2C',
  blue: '#3F7FD6',
  purple: '#7654C7',
};

export const LIGHT = {
  bg: '#FBF7EC',
  card: '#FFFFFF',
  text: '#0E2F28',
  sub: '#6E7F7A',
  muted: '#A5B0AC',
  border: '#E7ECE8',
  input: '#F5F7F5',
  chip: '#EEF2EF',
  soft: '#E6F3EC',
  nav: '#FFFFFF',
};

export const DARK = {
  bg: '#0B1F1B',
  card: '#12302A',
  text: '#F2F6F4',
  sub: '#9BA7A3',
  muted: '#6F8580',
  border: '#1F4A41',
  input: '#0E2924',
  chip: '#173A33',
  soft: '#153B32',
  nav: '#0F2A25',
};

export const LANGUAGES = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'ar', label: 'العربية', flag: '🇶🇦' },
];

/* Uygulamanın tanıdığı dil kodları (kayıtlı dil okunurken kullanılır) */
export const LANGUAGE_CODES = ['tr', 'en', 'de', 'ar'];

export const MONTHS = {
  tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

export const WEEKDAYS = {
  tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  ar: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'],
};

export const DEFAULT_TODAY_PREFERENCES = {
  location: '',
  budget: '',
  peopleCount: '2',
  withWho: 'friends',
  activityType: 'restaurant',
  transport: 'car',
};

export const BUDGET_OPTIONS = [
  { value: '0-500', label: '0–500₺' },
  { value: '500-1000', label: '500–1.000₺' },
  { value: '1000-2000', label: '1.000–2.000₺' },
  { value: '2000+', label: '2.000₺+' },
];

export const PEOPLE_OPTIONS = ['1', '2', '3', '4', '5+'];

export const ACTIVITY_OPTIONS = [
  { key: 'restaurant', tr: 'Restoran', en: 'Restaurant', de: 'Restaurant', icon: '🍽️' },
  { key: 'cafe', tr: 'Kafe', en: 'Cafe', de: 'Café', icon: '☕' },
  { key: 'cinema', tr: 'Sinema', en: 'Cinema', de: 'Kino', icon: '🎬' },
  { key: 'event', tr: 'Etkinlik', en: 'Event', de: 'Event', icon: '🎟️' },
  { key: 'nightlife', tr: 'Gece Hayatı', en: 'Nightlife', de: 'Nachtleben', icon: '🌃' },
  { key: 'activity', tr: 'Aktivite', en: 'Activity', de: 'Aktivität', icon: '🎯' },
  { key: 'shopping', tr: 'Alışveriş', en: 'Shopping', de: 'Shopping', icon: '🛍️' },
  { key: 'outdoor', tr: 'Açık Hava', en: 'Outdoor', de: 'Outdoor', icon: '🌳' },
];

export const WITH_WHO_OPTIONS = [
  { key: 'alone', tr: 'Yalnız', en: 'Alone', de: 'Allein', icon: '🧍' },
  { key: 'partner', tr: 'Sevgilimle', en: 'Partner', de: 'Partner', icon: '❤️' },
  { key: 'friends', tr: 'Arkadaşlarla', en: 'Friends', de: 'Freunde', icon: '👥' },
  { key: 'family', tr: 'Aileyle', en: 'Family', de: 'Familie', icon: '👨‍👩‍👧‍👦' },
];

export const TRANSPORT_OPTIONS = [
  { key: 'walk', tr: 'Yürüyerek', en: 'Walking', de: 'Zu Fuß', icon: '🚶' },
  { key: 'car', tr: 'Arabayla', en: 'Car', de: 'Auto', icon: '🚗' },
  { key: 'public', tr: 'Toplu Taşıma', en: 'Public transport', de: 'ÖPNV', icon: '🚌' },
  { key: 'taxi', tr: 'Taksi', en: 'Taxi', de: 'Taxi', icon: '🚕' },
];

/* ------------------------------------------------------- */
/*                     YARDIMCI FONKSİYONLAR               */
/* ------------------------------------------------------- */

export const getTodayISO = () => toISO(new Date());

export const addDaysISO = (iso, days) => {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
};

export const daysBetween = (fromISO, toISOValue) =>
  Math.round((parseISO(toISOValue) - parseISO(fromISO)) / 86400000);

export const isValidISO = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = parseISO(value);
  return !Number.isNaN(date.getTime()) && toISO(date) === value;
};

export const formatDate = (iso, lang = 'tr') => {
  if (!iso) return '';
  try {
    const date = String(iso).length <= 10 ? parseISO(iso) : new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    const d = pad2(date.getDate());
    const m = pad2(date.getMonth() + 1);
    const y = date.getFullYear();
    return lang === 'en' ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
  } catch (error) {
    return String(iso);
  }
};

export const formatLongDate = (iso, lang = 'tr') => {
  if (!isValidISO(iso)) return String(iso || '');
  const date = parseISO(iso);
  return `${date.getDate()} ${(MONTHS[lang] || MONTHS.tr)[date.getMonth()]} ${date.getFullYear()}`;
};

/* Kullanıcının elle yazdığı tarihi YYYY-MM-DD biçimine çevirir.
   Boş giriş için '' , geçersiz giriş için null döner. Kabul edilen biçimler:
   YYYY-MM-DD, YYYY-M-D, YYYY/MM/DD, YYYY.MM.DD, DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY. */
export const normalizeDateInput = (value) => {
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return '';
  let year;
  let month;
  let day;
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    [, year, month, day] = match;
  } else {
    match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!match) return null;
    [, day, month, year] = match;
  }
  const yearNumber = Number(year);
  if (yearNumber < 1970 || yearNumber > 2100) return null;
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  return isValidISO(iso) ? iso : null;
};

/* Kayıtlı (eski sürümlerden gelen olabilir) bir tarih değerini YYYY-MM-DD'ye çevirir.
   Çevrilemezse null döner; çağıran taraf neyin yapılacağına karar verir. */
export const normalizeStoredDate = (value) => {
  if (isValidISO(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value > 1e11) {
    return toISO(new Date(value));
  }
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return null;
  const loose = normalizeDateInput(raw);
  if (loose) return loose;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return toISO(parsed); // yerel takvim günü
  }
  return null;
};

/* Açılışta kayıtlı görevleri temizler: eksik/yinelenen id, boş başlık ve bozuk tarih
   uygulamayı bozmasın. Geçerli görevlerin diğer alanları olduğu gibi korunur. */
export const normalizeStoredTasks = (list, excludeIds = []) => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  return list
    .filter((t) => t && typeof t === 'object' && !excludeIds.includes(t.id))
    .map((t) => {
      let id = t.id;
      const idUsable = (typeof id === 'string' && id !== '') || typeof id === 'number';
      if (!idUsable || seenIds.has(id)) id = createId('task');
      seenIds.add(id);
      return {
        ...t,
        id,
        title: String(t.title || ''),
        dueDate: normalizeStoredDate(t.dueDate) || getTodayISO(),
        completed: Boolean(t.completed),
      };
    });
};

export const normalizeTaskTitle = (title) =>
  String(title || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

export const createId = (prefix = 'plan') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const safeParse = (value, fallback) => {
  try {
    if (value === null || value === undefined || value === '') return fallback;
    return JSON.parse(value);
  } catch (error) {
    // Eski sürümde düz metin olarak kaydedilmiş değerleri (dil, isim) kaybetme.
    return typeof value === 'string' && typeof fallback === 'string' ? value : fallback;
  }
};

// Başarılıysa true, yazılamadıysa false döner (eski çağrılar dönüş değerini yok sayabilir).
export const saveValue = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.log('PLAN storage error:', error);
    return false;
  }
};

// loadValue gibi okur, ama okuma hatasını ve bozuk JSON'ı varsayılan değerden ayırt eder.
// Böylece okunamayan veri, boş listeyle üzerine yazılarak sessizce kaybedilmez.
// Bozuk kayıt silinmeden önce `${key}_CORRUPT_BACKUP` anahtarına yedeklenir.
export const loadValueStrict = async (key, fallback) => {
  let raw;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      raw = await AsyncStorage.getItem(key);
      break;
    } catch (error) {
      if (attempt === 1) {
        console.log('PLAN strict load error:', error);
        return { ok: false, value: fallback, reason: 'read' };
      }
    }
  }
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    try {
      await AsyncStorage.setItem(`${key}_CORRUPT_BACKUP`, raw);
    } catch (backupError) {
      // yedek alınamadı; yine de uygulama açılsın
    }
    return { ok: false, value: fallback, reason: 'corrupt' };
  }
};

export const loadValue = async (key, fallback) => {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value === null || value === undefined) return fallback;
    return safeParse(value, fallback);
  } catch (error) {
    console.log('PLAN load error:', error);
    return fallback;
  }
};
export const FEATURE_KEYS = {
  documentAnalysis: 'documentAnalysis',
  planAI: 'planAI',
  opportunities: 'opportunities',
  today: 'today',
  qr: 'qr',
};

export const hasUsedFeature = async (featureKey) => {
  try {
    const usage = await loadValue(STORAGE_KEYS.featureUsage, {});
    return usage?.[featureKey] === true;
  } catch (error) {
    console.log('PLAN feature usage read error:', error);
    return false;
  }
};

export const markFeatureUsed = async (featureKey) => {
  try {
    const usage = await loadValue(STORAGE_KEYS.featureUsage, {});
    const updatedUsage = {
      ...usage,
      [featureKey]: true,
    };

    await saveValue(STORAGE_KEYS.featureUsage, updatedUsage);
    return true;
  } catch (error) {
    console.log('PLAN feature usage save error:', error);
    return false;
  }
};
export const persistImage = async (uri) => {
  try {
    const dir = FileSystem.documentDirectory;
    if (!dir || !uri) return uri;
    const rawExt = uri.split('?')[0].split('.').pop() || '';
    const ext = /^[a-zA-Z0-9]{2,5}$/.test(rawExt) ? rawExt : 'jpg';
    const dest = `${dir}plan-${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (error) {
    return uri;
  }
};

export const removeImage = async (uri) => {
  try {
    const dir = FileSystem.documentDirectory;
    if (dir && uri && uri.startsWith(dir)) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
    return true;
  } catch (error) {
    return false;
  }
};

export const getTaskState = (task, today) => {
  if (task.completed) return 'completed';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
};

export const pick = (lang, tr, en, de) => (lang === 'en' ? en : lang === 'de' ? de : lang === 'ar' ? toArabic(en) : tr);

/* Tarih/saat biçimi için dil kodu */
export const dateLocaleFor = (lang) => (lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : lang === 'ar' ? 'ar' : 'tr-TR');

/* ------------------------------------------------------- */
/*          YAPAY ZEKÂ (smart-endpoint) İSTEK YARDIMCILARI   */
/* ------------------------------------------------------- */

// Milisaniye. Görselli istekler (belge / fiş) yükleme nedeniyle daha uzun sürebilir.
export const AI_TIMEOUT_MS = {
  default: 45000,
  chat: 45000,
  opportunities: 45000,
  places: 30000,
  image: 90000,
};

// kind: 'timeout' | 'network' | 'auth' | 'rate' | 'quota' | 'placesUnavailable' | 'server' | 'http' | 'parse' | 'format' | 'local'
// Not: `instanceof` yerine `.kind` kontrol edilir (Hermes + Error alt sınıfı sorunlarından kaçınmak için).
export const makeSmartError = (kind, status = null, serverMessage = '') => {
  const error = new Error(`smart-request:${kind}${status ? `:${status}` : ''}`);
  error.name = 'SmartRequestError';
  error.kind = kind;
  error.status = status;
  error.serverMessage = serverMessage;
  return error;
};

const extractServerMessage = (data) => {
  const candidate =
    typeof data?.error === 'string'
      ? data.error
      : typeof data?.error?.message === 'string'
        ? data.error.message
        : typeof data?.message === 'string'
          ? data.message
          : '';
  return candidate.trim().slice(0, 200);
};

/*
  makeRequest(signal) bir fetch Response'u döndüren fonksiyondur.
  - timeoutMs sonunda istek iptal edilir (yanıt gövdesinin okunması dahil).
  - Başarılı yanıt, boş olmayan bir JSON NESNESİ değilse hata fırlatılır.
  - HTTP hata kodları kind'a çevrilir; gövde ve anahtarlar loglanmaz.
*/
export const requestJsonWithTimeout = async (makeRequest, timeoutMs = AI_TIMEOUT_MS.default) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  let timer = null;

  const run = (async () => {
    const response = await makeRequest(controller ? controller.signal : undefined);
    const text = await response.text();
    return { response, text };
  })();
  run.catch(() => {}); // zaman aşımı kazanırsa geç gelen hata "unhandled" olmasın

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      if (controller) controller.abort();
      reject(makeSmartError('timeout'));
    }, timeoutMs);
  });

  let result;
  try {
    result = await Promise.race([run, timeout]);
  } catch (error) {
    if (error && error.kind) throw error;
    throw makeSmartError(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  const { response, text } = result;
  const trimmed = String(text || '').trim();
  let data = null;
  let parsed = false;
  if (trimmed) {
    try {
      data = JSON.parse(trimmed);
      parsed = true;
    } catch (error) {
      parsed = false;
    }
  }

  if (!response.ok) {
    const status = response.status || 0;
    const message = parsed ? extractServerMessage(data) : '';
    if (parsed && data?.code === 'places_provider_unavailable') {
      throw makeSmartError('placesUnavailable', status);
    }
    if (status === 403 && parsed && data?.code === 'ai_consent_required') {
      throw makeSmartError('aiConsent', status);
    }
    if (status === 403 && parsed && data?.code === 'feature_trial_exhausted') {
      throw makeSmartError('featureTrial', status);
    }
    if (status === 429 && parsed && data?.code === 'feature_trial_retry_limit') {
      throw makeSmartError('featureTrialRetryLimit', status);
    }
    if (status === 401 || status === 403) throw makeSmartError('auth', status);
    if (status === 429 && parsed && (data?.quota === 'daily' || data?.quota === 'monthly')) {
      // Yapay zekâ kullanım limiti doldu (sunucu: ai_usage_take). Limit sayısı mesajda gösterilir.
      const err = makeSmartError('quota', status, message);
      err.quota = data.quota;
      err.limit = Number(data.quota === 'daily' ? data.day_limit : data.month_limit) || null;
      throw err;
    }
    if (status === 429) throw makeSmartError('rate', status);
    if (status === 408 || status === 504) throw makeSmartError('timeout', status);
    if (status >= 500) throw makeSmartError('server', status);
    throw makeSmartError('http', status, message);
  }

  if (!trimmed || !parsed) throw makeSmartError('parse', response.status || 200);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw makeSmartError('format', response.status || 200);
  }
  return data;
};

// Kullanıcıya gösterilecek anlaşılır mesaj. `fallback` { tr, en, de } veya düz metin olabilir.
export const smartErrorMessage = (error, lang = 'tr', fallback = null) => {
  const fb =
    fallback && typeof fallback === 'object'
      ? pick(lang, fallback.tr, fallback.en, fallback.de)
      : fallback;
  switch (error && error.kind) {
    case 'timeout':
      return pick(
        lang,
        'İstek çok uzun sürdü ve zaman aşımına uğradı. Bağlantını kontrol edip tekrar dene.',
        'The request took too long and timed out. Check your connection and try again.',
        'Die Anfrage hat zu lange gedauert. Prüfe deine Verbindung und versuche es erneut.'
      );
    case 'network':
      return pick(
        lang,
        'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.',
        'Could not reach the internet. Check your connection and try again.',
        'Keine Internetverbindung. Prüfe deine Verbindung und versuche es erneut.'
      );
    case 'auth':
      return pick(
        lang,
        'Oturum bulunamadı veya süresi dolmuş. Lütfen tekrar giriş yap.',
        'Your session was not found or has expired. Please sign in again.',
        'Sitzung nicht gefunden oder abgelaufen. Bitte melde dich erneut an.'
      );
    case 'aiConsent':
      return pick(
        lang,
        'Yapay zekâ özelliği için izin vermediğin için istek gönderilmedi. Ücretsiz hakkın harcanmadı.',
        'The request was not sent because you did not give permission for the AI feature. Your free use was not spent.',
        'Die Anfrage wurde nicht gesendet, da du der KI-Funktion nicht zugestimmt hast. Deine Gratisnutzung wurde nicht verbraucht.'
      );
    case 'rate':
      return pick(
        lang,
        'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.',
        'Too many requests. Please wait a moment and try again.',
        'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.'
      );
    case 'quota': {
      const n = error.limit ? `${error.limit} ` : '';
      return error.quota === 'monthly'
        ? pick(lang,
          `Bu ayki ${n}yapay zekâ kullanım hakkını doldurdun. Hakkın gelecek ay yenilenir.`,
          `You have used this month's ${n}AI requests. Your allowance renews next month.`,
          `Du hast dein monatliches KI-Kontingent (${n.trim() || '—'}) aufgebraucht. Es erneuert sich nächsten Monat.`)
        : pick(lang,
          `Bugünkü ${n}yapay zekâ kullanım hakkını doldurdun. Hakkın yarın yenilenir.`,
          `You have used today's ${n}AI requests. Your allowance renews tomorrow.`,
          `Du hast dein heutiges KI-Kontingent (${n.trim() || '—'}) aufgebraucht. Es erneuert sich morgen.`);
    }
    case 'featureTrial':
      return pick(
        lang,
        'Ücretsiz belge analizi hakkını kullandın. Devam etmek için BAKPLANLA Pro’ya geçebilirsin.',
        'You have used your free document analysis. You can upgrade to BAKPLANLA Pro to continue.',
        'Du hast deine kostenlose Dokumentenanalyse genutzt. Mit BAKPLANLA Pro kannst du fortfahren.'
      );
    case 'featureTrialRetryLimit':
      return pick(
        lang,
        'Tekrarlanan sunucu hataları ücretsiz belge analizi denemeni durdurdu. Denemen kullanılmadı; destek ekibimizle iletişime geç.',
        'Repeated server errors paused your free document analysis trial. It was not consumed; contact support for help.',
        'Wiederholte Serverfehler haben deinen kostenlosen Dokumententest pausiert. Er wurde nicht verbraucht; wende dich an den Support.'
      );
    case 'server':
      return pick(
        lang,
        'PLAN sunucusu şu anda yanıt veremiyor. Lütfen biraz sonra tekrar dene.',
        'The PLAN server cannot respond right now. Please try again later.',
        'Der PLAN-Server antwortet gerade nicht. Bitte versuche es später erneut.'
      );
    case 'placesUnavailable':
      return pick(
        lang,
        'Mekan sağlayıcıları şu anda kullanılamıyor. Lütfen biraz sonra tekrar dene.',
        'Place search providers are temporarily unavailable. Please try again later.',
        'Die Anbieterdienste für Orte sind gerade nicht verfügbar. Bitte versuche es später erneut.'
      );
    case 'parse':
    case 'format':
      return pick(
        lang,
        'Sunucudan beklenmeyen bir yanıt geldi. Lütfen tekrar dene.',
        'The server sent an unexpected response. Please try again.',
        'Der Server hat eine unerwartete Antwort gesendet. Bitte versuche es erneut.'
      );
    case 'http':
    case 'local':
      return (error.serverMessage && String(error.serverMessage)) || fb ||
        pick(lang, 'İşlem tamamlanamadı.', 'The operation could not be completed.', 'Der Vorgang konnte nicht abgeschlossen werden.');
    default:
      return fb ||
        pick(lang, 'Beklenmeyen bir hata oluştu.', 'An unexpected error occurred.', 'Ein unerwarteter Fehler ist aufgetreten.');
  }
};

export const buildAnalysis = (lang) => ({
  demo: true,
  createdAt: new Date().toISOString(),
  summary: pick(
    lang,
    'Belgen incelenmeye hazır. (Örnek analiz — gerçek AI henüz bağlı değil.)',
    'Your document is ready to review. (Sample analysis — real AI is not connected yet.)',
    'Dein Dokument ist bereit. (Beispielanalyse — echte KI noch nicht verbunden.)'
  ),
  actions: [
    pick(lang, 'Belgeyi incele', 'Review the document', 'Dokument überprüfen'),
    pick(lang, 'Gerekirse hatırlatma oluştur', 'Create a reminder if needed', 'Bei Bedarf Erinnerung erstellen'),
    pick(lang, 'Önemli tarihleri PLAN’da tut', 'Keep important dates in PLAN', 'Wichtige Termine in PLAN speichern'),
  ],
});

// Hayat Skoru: yalnızca cihazdaki görev ve belge verisinden hesaplanan yerel gösterge.
export const computeLifeScore = (tasks, documents, today) => {
  const active = tasks.filter((t) => !t.completed);
  const overdue = active.filter((t) => t.dueDate < today).length;
  const done = tasks.length - active.length;
  let score = 50;
  if (tasks.length) score += Math.round((done / tasks.length) * 25);
  if (documents.length) {
    score += Math.round((documents.filter((d) => d.analyzed).length / documents.length) * 15);
  }
  score -= Math.min(overdue * 10, 30);
  if (tasks.length && overdue === 0) score += 10;
  return Math.max(0, Math.min(100, score));
};

// Önizleme amaçlı, taranamayan örnek QR deseni.
export const buildQrPattern = (size = 25) => {
  let seed = 20261;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const inFinder = (r, c, r0, c0) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  const finderDark = (r, c, r0, c0) => {
    const rr = r - r0;
    const cc = c - c0;
    const ring = Math.max(Math.abs(rr - 3), Math.abs(cc - 3));
    return ring === 3 || ring <= 1;
  };
  const rows = [];
  for (let r = 0; r < size; r += 1) {
    const row = [];
    for (let c = 0; c < size; c += 1) {
      let dark;
      if (inFinder(r, c, 0, 0)) dark = finderDark(r, c, 0, 0);
      else if (inFinder(r, c, 0, size - 7)) dark = finderDark(r, c, 0, size - 7);
      else if (inFinder(r, c, size - 7, 0)) dark = finderDark(r, c, size - 7, 0);
      else if (Math.abs(r - 12) <= 3 && Math.abs(c - 12) <= 3) dark = false;
      else dark = rand() > 0.52;
      row.push(dark);
    }
    rows.push(row);
  }
  return rows;
};

/* ------------------------------------------------------- */
/*                          STİLLER                        */
/* ------------------------------------------------------- */

export const TOP_PADDING =
  Platform.OS === 'android' ? StatusBar.currentHeight || 24 : Platform.OS === 'ios' ? 54 : 16;

export const makeStyles = (c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    screen: { flex: 1, backgroundColor: c.bg, paddingTop: TOP_PADDING },
    content: { padding: 20, paddingBottom: 30 },
    centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    flex1: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center' },

    headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
    h1: { fontSize: 30, fontWeight: '900', color: c.text },
    subtitle: { fontSize: 14, color: c.sub, marginTop: 4, lineHeight: 20 },
    backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginBottom: 4, alignSelf: 'flex-start' },
    backText: { color: c.green, fontWeight: '800', fontSize: 15, marginLeft: 2 },

    logoBadge: { backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
    logoText: { color: c.dark, fontWeight: '900' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
    sectionTitle: { fontSize: 20, fontWeight: '900', color: c.text },
    sectionSub: { fontSize: 12, color: c.sub, marginTop: 2 },
    link: { fontSize: 13, fontWeight: '800', color: c.green },

    card: { backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    cardTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    cardMeta: { fontSize: 12, color: c.sub, marginTop: 3 },
    note: { fontSize: 12, color: c.sub, lineHeight: 18, marginTop: 6 },
    softCard: { backgroundColor: c.soft, borderRadius: 16, padding: 14, marginTop: 6, marginBottom: 10 },

    /* ana sayfa */
    homeHeader: { backgroundColor: c.dark, paddingTop: TOP_PADDING + 8, paddingHorizontal: 20, paddingBottom: 56, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
    homeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    homeBrand: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginLeft: 10 },
    homeTagline: { fontSize: 12, color: '#B9D4CB', marginLeft: 10 },
    homeAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.dark2, alignItems: 'center', justifyContent: 'center' },
    homeHello: { fontSize: 26, fontWeight: '900', color: c.gold, marginTop: 20 },
    homeDesc: { fontSize: 14, color: '#D3E6DF', marginTop: 6, lineHeight: 20 },    flowStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.dark2, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, marginTop: 16 },
    /* flowStrip, smallButton ve smallButtonText kullanılıyordu ama tanımlı değildi
       (bu yüzden o öğeler stilsiz görünüyordu). Mevcut tasarım diliyle uyumlu eklendi. */
    flowStrip: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 16 },
    flowItem: { alignItems: 'center', flex: 1 },
    flowText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
    smallButton: { backgroundColor: c.chip, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: c.green },
    smallButtonText: { color: c.green, fontWeight: '800', fontSize: 13 },
    goldBtn: { backgroundColor: c.gold, borderRadius: 16, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
    goldBtnText: { color: c.dark, fontWeight: '900', fontSize: 15, marginLeft: 6 },
    homeBody: { paddingHorizontal: 20, marginTop: -34 },

    scoreCard: { backgroundColor: c.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border },
    scoreLabel: { fontSize: 11, fontWeight: '900', color: c.green, letterSpacing: 0.5 },
    scoreLevel: { fontSize: 20, fontWeight: '900', color: c.text, marginTop: 4 },
    scoreNote: { fontSize: 12, color: c.sub, marginTop: 4, lineHeight: 17 },
    scoreCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
    scoreNumber: { fontSize: 26, fontWeight: '900', color: c.text },
    scoreMax: { fontSize: 11, color: c.sub, marginTop: -2 },

    exploreGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    exploreTile: { width: '48.5%', backgroundColor: c.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    exploreIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: c.dark, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    exploreTitle: { fontSize: 14, fontWeight: '900', color: c.text },
    exploreSub: { fontSize: 11, color: c.sub, marginTop: 2, lineHeight: 15 },

    /* görev satırı */
    taskRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    taskIconBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    taskTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    taskTitleDone: { textDecorationLine: 'line-through', color: c.muted },
    taskCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
    taskCircleDone: { backgroundColor: c.green, borderColor: c.green },
    taskStatus: { fontSize: 12, fontWeight: '800', marginTop: 3 },

    /* ortak */
    primaryBtn: { backgroundColor: c.green, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
    primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
    darkBtn: { backgroundColor: c.dark, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
    darkBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
    secondaryBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: c.green },
    secondaryBtnText: { color: c.green, fontWeight: '800', fontSize: 14 },
    dangerBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: c.red },
    dangerBtnText: { color: c.red, fontWeight: '800', fontSize: 14 },
    disabled: { opacity: 0.6 },

    input: { backgroundColor: c.input, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, height: 48, color: c.text, fontSize: 14 },
    inputMulti: { height: 100, paddingTop: 12, textAlignVertical: 'top' },
    label: { fontSize: 12, fontWeight: '800', color: c.sub, marginBottom: 6, marginTop: 14 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
    chip: { backgroundColor: c.chip, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
    chipActive: { backgroundColor: c.green, borderColor: c.green },
    chipText: { fontSize: 13, fontWeight: '700', color: c.text },
    chipTextActive: { color: '#FFFFFF' },

    pill: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 12 },
    pillText: { fontSize: 10, fontWeight: '900', color: c.dark, letterSpacing: 0.4 },
    tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: c.chip },
    tagText: { fontSize: 10, fontWeight: '900', color: c.sub, letterSpacing: 0.3 },
    badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },

    emptyCard: { backgroundColor: c.card, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: c.border, marginTop: 12, marginBottom: 10 },
    emptyIconBox: { width: 62, height: 62, borderRadius: 18, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    emptyIconText: { fontSize: 15, fontWeight: '900', color: c.sub },
    emptyTitle: { fontSize: 17, fontWeight: '900', color: c.text, textAlign: 'center' },
    emptyText: { fontSize: 13, color: c.sub, textAlign: 'center', marginTop: 6, lineHeight: 19 },
    emptyBtn: { backgroundColor: c.chip, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 14 },
    emptyBtnText: { fontWeight: '900', color: c.text, fontSize: 13 },

    statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 },

    /* belgeler */
    docThumb: { width: 54, height: 54, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
    docThumbImage: { width: 54, height: 54 },
    detailImage: { width: '100%', height: 220, borderRadius: 18, backgroundColor: c.chip, marginBottom: 6 },
    analysisTitle: { fontSize: 15, fontWeight: '900', color: c.text, marginBottom: 8 },
    analysisSummary: { fontSize: 14, color: c.text, lineHeight: 21 },
    actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    actionNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    actionNumberText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
    actionText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 18 },

    /* takvim */
    segment: { flexDirection: 'row', backgroundColor: c.chip, borderRadius: 16, padding: 4, marginBottom: 14 },
    segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13 },
    segmentItemActive: { backgroundColor: c.dark },
    segmentText: { fontSize: 13, fontWeight: '800', color: c.sub },
    segmentTextActive: { color: '#FFFFFF' },
    calCard: { backgroundColor: c.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: c.border },
    calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    calMonth: { fontSize: 17, fontWeight: '900', color: c.text },
    calNav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chip },
    calWeekRow: { flexDirection: 'row' },
    calWeekText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.muted, paddingVertical: 6 },
    calCell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
    calDay: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    calDayToday: { backgroundColor: c.dark },
    calDaySelected: { borderWidth: 2, borderColor: c.gold },
    calDayText: { fontSize: 13, fontWeight: '700', color: c.text },
    calDayTextToday: { color: '#FFFFFF' },
    calDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },

    /* PLAN AI / fırsat / qr / bulut / pro */
    heroCard: { backgroundColor: c.dark, borderRadius: 24, padding: 20, alignItems: 'center', marginBottom: 14 },
    heroIconBox: { width: 62, height: 62, borderRadius: 18, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    heroEmoji: { fontSize: 38, marginBottom: 8 },
    heroTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
    heroDesc: { fontSize: 13, color: '#CFE3DC', textAlign: 'center', marginTop: 8, lineHeight: 19 },
    chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: c.dark, borderRadius: 16, padding: 12, marginTop: 10, maxWidth: '85%' },
    chatBubbleUserText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18 },
    chatBubbleBot: { alignSelf: 'flex-start', backgroundColor: c.chip, borderRadius: 16, padding: 12, marginTop: 10, maxWidth: '90%' },
    chatBubbleBotText: { color: c.text, fontSize: 13, lineHeight: 18 },
    askRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    sendBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    checkText: { flex: 1, fontSize: 14, color: c.text, marginLeft: 10 },
    oppCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    oppIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    stepText: { fontSize: 12, color: c.sub, marginTop: 4, lineHeight: 17 },

    qrCard: { backgroundColor: c.card, borderRadius: 22, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: c.border },
    qrBox: { padding: 10, backgroundColor: '#FFFFFF', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    qrLogo: { position: 'absolute', width: 46, height: 46, borderRadius: 12, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.chip, borderRadius: 14, paddingVertical: 14, alignSelf: 'stretch', marginTop: 14 },
    shareText: { fontWeight: '800', color: c.text, marginLeft: 8 },

    proTabs: { flexDirection: 'row', backgroundColor: c.chip, borderRadius: 16, padding: 4, marginBottom: 6 },
    planCard: { backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 2, borderColor: c.border, marginTop: 12 },
    planCardActive: { borderColor: c.gold },
    radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.muted, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    radioActive: { borderColor: c.green },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.green },
    planName: { fontSize: 14, fontWeight: '800', color: c.text },
    planPrice: { fontSize: 24, fontWeight: '900', color: c.text },
    strike: { fontSize: 13, color: c.red, textDecorationLine: 'line-through', marginRight: 10 },
    popularTag: { position: 'absolute', top: -12, right: 14, backgroundColor: c.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    popularText: { fontSize: 11, fontWeight: '900', color: c.dark },
    saveTag: { backgroundColor: c.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },

    /* profil */
    userCard: { backgroundColor: c.dark, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    userAvatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    userName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
    userSub: { fontSize: 12, color: '#B9D4CB', marginTop: 2 },
    proPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.gold, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', marginTop: 10 },
    proPillText: { fontSize: 12, fontWeight: '900', color: c.dark, marginLeft: 6 },
    menuRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    menuIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    menuTitle: { fontSize: 14, fontWeight: '900', color: c.text },
    menuSub: { fontSize: 12, color: c.sub, marginTop: 2 },
    versionText: { textAlign: 'center', color: c.muted, fontSize: 12, marginTop: 14 },
    statsRow: { flexDirection: 'row', marginBottom: 6 },
    statCard: { flex: 1, backgroundColor: c.card, borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: c.border, marginHorizontal: 4 },
    statNumber: { fontSize: 24, fontWeight: '900', color: c.text },
    statLabel: { fontSize: 11, color: c.sub, marginTop: 2, fontWeight: '700' },

    /* sonuç kartları (bugün ne yapsak) */
    resultCard: { backgroundColor: c.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
    resultTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    resultDesc: { fontSize: 13, color: c.sub, marginTop: 4, lineHeight: 18 },
    resultMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    resultMetaText: { fontSize: 12, color: c.text, fontWeight: '700', marginRight: 14 },

    /* alt menü */
    navWrap: { backgroundColor: c.bg, paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 22 : 10, paddingTop: 6 },
    nav: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.nav, borderRadius: 26, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 10, borderWidth: 1, borderColor: c.border },
    navItem: { flex: 1, alignItems: 'center' },
    navLabel: { fontSize: 10, color: c.muted, marginTop: 3, fontWeight: '700' },
    navLabelActive: { color: c.dark, fontWeight: '900' },
    navPlus: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.dark, alignItems: 'center', justifyContent: 'center', marginTop: -26, borderWidth: 4, borderColor: c.bg },

    /* pencereler */
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30, maxHeight: '90%' },
    handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 14 },
    sheetTitle: { fontSize: 20, fontWeight: '900', color: c.text },
    sheetSub: { fontSize: 13, color: c.sub, marginTop: 4, marginBottom: 6 },
    methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.input, borderRadius: 16, padding: 14, marginTop: 10, borderWidth: 1, borderColor: c.border },
    methodIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    languageOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginTop: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.input },
    languageOptionActive: { borderColor: c.green, backgroundColor: c.soft },
    flag: { fontSize: 26, marginRight: 12 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, marginTop: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.input },
    btnRow: { flexDirection: 'row', marginTop: 16 },
    btnHalf: { flex: 1, marginHorizontal: 4 },

    toast: { position: 'absolute', left: 20, right: 20, bottom: 110, backgroundColor: c.dark, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
    toastText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, color: c.sub, fontWeight: '700' },
  });
