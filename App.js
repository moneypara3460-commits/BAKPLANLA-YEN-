import React, {
createContext,
useContext,
useEffect,
useMemo,
useRef,
useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from './fileSystemCompat';

import { createIsbasiApi } from './isbasiApi';
// import { IsKoprusuScreen } from './IsKoprusuScreens'; // ESKİ İş Köprüsü (eşleştirmeli) — kullanılmıyor, dosyalar yerinde duruyor
import { MeslekPasaportuScreen } from './MeslekPasaportuScreen'; // İŞ KÖPRÜSÜ: meslek pasaportu + işletme tanıtımı
import {
  normalizeReceipt, receiptAnalysis, receiptTitle, receiptFingerprint, receiptDocsOf, isReceiptDoc,
  receiptStoreName, receiptStoreType, receiptBranch, receiptDateText, formatTL, formatQty,
  comparableCount, docForAi, shoppingContextForAi, mergeReceiptIntoList, CATEGORY_LABELS,
  fitDocsForAi, isShoppingQuestion,
} from './receipts'; // AKILLI ALIŞVERİŞ: fiş kaydı (27 Ekim)
import { MeslekProvasiScreen } from './MeslekProvasiScreen'; // MESLEK PROVASI
import { PromoKodScreen } from './PromoKodScreen'; // PROMOSYON KODU
import { IsletmeTanitScreen } from './IsletmeTanitScreen'; // İŞLETMENİ TANIT (25 Ekim)
import { CompassScreen } from './CompassScreen';
import CalendarScreen from './CalendarScreen';
import IsBasiScreen from './IsBasiScreen';
import HomeScreenView from './HomeScreen';
import ProScreenView from './ProScreen';
import ProfileScreenView from './ProfileScreen';
import CloudScreenView from './CloudScreen';
import OpportunitiesScreenView from './OpportunitiesScreen';
import TodayScreenView from './TodayScreen';
import AiScreenView from './AiScreen';
import DocumentDetailScreenView from './DocumentDetailScreen';
import DocumentsScreenView from './DocumentsScreen';
import QrScreenView from './QrScreen';
import NotificationsScreen from './NotificationsScreen';
import TaskRow from './TaskRow';
import { openCalendarList } from './calendar';
import { createReminderTask, deleteTaskRecord, persistTaskDraft, toggleTaskRecord } from './taskWorkflow';
import {
  SHOPPING_PLAN_KEY,
  buildPlan,
  planItemsFromList,
  homeDistrict,
  buildReminderText,
  reservePlanWriteRevision,
  savePlanToServer,
  deletePlanFromServer,
  formatShopDate,
  formatRemindAt,
  lastStoreSummary,
  restoreLocalShoppingReminder,
  istanbulTodayISO,
} from './shoppingPlan';
import { backupMetaKey, buildPayload, checkCloudBackupWritePolicy, deleteBackup, fetchBackup, fetchBackupMeta, planRestore, uploadBackup, validateBackupRow } from './backup';
import { createSupabaseBackupStore } from './backupStoreSupabase';
import { deleteAllCloudImages, imageCleanupKey, isOwnImagePath, parseImageCleanupJournal, removeCloudImagePaths, uploadDocumentImages } from './cloudImages';
import { deleteCloudImageBackup, localDataResetStorageKeys, reconcileCloudImageCommit } from './documentImageLifecycle';
import {
  notificationsSupported,
  initNotifications,
  getPermissionState,
  requestPermission,
  openSystemSettings,
  syncTaskReminders,
  sendTestNotification,
  scheduleAiReminder,
  cancelAiReminder,
  scheduleShoppingReminder,
  cancelShoppingReminder,
  getPushTokenSafe,
} from './notifications';
import {
  DEVICE_ID_KEY,
  makeDeviceId,
  listDevices,
  upsertOwnDevice,
  removeDevice,
  createPairingCode,
  redeemPairingCode,
} from './devices';

const { getSupabaseConfig } = require('./supabaseConfig');
const { createAuthSessionStorage } = require('./authSessionStorage');
const { createDeletionReceiptStore, credentialFromRandomBytes, getOrCreateDeletionReceipt } = require('./accountDeletionReceipts');
const { accountDeletionKeyFor, analyzeAndAddReceiptForCurrentScope, createScopeBoundSave, deleteLocalAccountScope, isScopeGenerationReady, PENDING_ACCOUNT_DELETION_PREFIX, readScopeBoundValue, removeLocalDataScope, runLocalDataOperation, runScopeBoundOperation, switchLocalDataScope, writeOwnerScopedValue } = require('./localDataScope');
const { commitRestoreData, restoreFailureReason } = require('./restoreDataTransaction');
const { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY } = getSupabaseConfig({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

// Native auth sessions stay in Keychain/Keystore; there is deliberately no plaintext fallback.
const secureAuthStorage = createAuthSessionStorage({
  platform: Platform.OS,
  asyncStorage: AsyncStorage,
  secureStore: SecureStore,
});
const deletionReceiptStore = createDeletionReceiptStore({
  platform: Platform.OS,
  asyncStorage: AsyncStorage,
  secureStore: SecureStore,
});

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: secureAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);
const backupStore = createSupabaseBackupStore(supabase);

const SMART_ENDPOINT = `${SUPABASE_URL}/functions/v1/smart-endpoint`;
const DELETE_ACCOUNT_ENDPOINT = `${SUPABASE_URL}/functions/v1/delete-account`;

const getDeletionReceiptStatus = async (operationCredential) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(DELETE_ACCOUNT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: 'status', operationCredential }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  let result = null;
  try { result = await response.json(); } catch (error) { result = null; }
  return result && ['pending', 'partial', 'completed', 'unknown', 'expired'].includes(result.state)
    ? { ...result, httpStatus: response.status }
    : { state: 'unknown', httpStatus: response.status };
};

// Destek ve KVKK başvuru adresi (gizlilik metinlerindeki adresle aynı olmalı).
const SUPPORT_EMAIL = 'bakplanla.destek@gmail.com';

/* ---------- Yasal metinler (GitHub Pages: bakplanla-yasal deposu) ---------- */
const LEGAL_BASE_URL = 'https://moneypara3460-commits.github.io/bakplanla-yasal/';
const LEGAL_URLS = {
  privacy: `${LEGAL_BASE_URL}gizlilik.html`,
  kvkk: `${LEGAL_BASE_URL}kvkk.html`,
  terms: `${LEGAL_BASE_URL}kosullar.html`,
  subscription: `${LEGAL_BASE_URL}abonelik.html`,
  security: `${LEGAL_BASE_URL}guvenlik.html`,
  deletion: `${LEGAL_BASE_URL}hesap-silme.html`,
  verified: `${LEGAL_BASE_URL}dogrulandi.html`,
};
const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
const LEGAL_VERSION = '2026-10-23';
const openLegal = (url) => {
  Linking.openURL(url).catch(() => {});
};

/* İş Köprüsü (24 Ekim yeni senaryo): eşleştirme YOK. Yalnızca meslek pasaportu (kullanıcı kendisi paylaşır)
   + işletme tanıtım kartları (işletmenin kendi kariyer sayfası bağlantısı). İlan/başvuru/aday/onay/teklif yok.
   ISLETME_PANELI_AKTIF: eski eşleştirmeli İşletme Paneli — İŞKUR izni gerektirebileceği için KAPALI kalmalı. */
const IS_KOPRUSU_AKTIF = true;
const ISLETME_PANELI_AKTIF = false;

/* ---------- Yapay zekâ için açık rıza (KVKK m.6 ve m.9) ----------
   Notice is versioned; the authoritative record remains server-side. Metadata and device copies are non-authoritative legacy mirrors.
   Eski yerel/metadata izinleri kanıt sayılmaz ve yeni sunucu kaydı yoksa notice yeniden gösterilir. */
const AI_CONSENT_VERSION = '2026-11-v1';
let aiConsentLang = 'tr';
const aiConsentKey = (uid) => `BAKPLANLA_AI_CONSENT:${uid}`;
const tAi = (tr, en, de) => (aiConsentLang === 'en' ? en : aiConsentLang === 'de' ? de : aiConsentLang === 'ar' ? toArabic(en) : tr);

const askAiConsent = () =>
  new Promise((resolve) => {
    const title = tAi('Yapay zekâ için iznin', 'Your permission for AI', 'Deine Zustimmung für KI');
    const message = tAi(
      'Bu özellik; gönderdiğin belge veya fiş fotoğrafını, belge bilgilerini ya da sorunu analiz edilmesi için yapılandırılmış OpenAI API uç noktasına iletir. OpenAI, API içeriklerinin varsayılan olarak modellerini eğitmek için kullanılmadığını bildirir. Kötüye kullanım izleme kayıtları istem ve yanıt içeriğini içerebilir ve varsayılan olarak 30 güne kadar saklanabilir; hukuki veya güvenlik gereklilikleri bu süreyi etkileyebilir. BAKPLANLA hesabının ve kullanılan uç noktanın veri kontrolleri doğrulanmamıştır.\n\nBelgende sağlık bilgisi gibi özel nitelikli veri varsa o da iletilir. Kimlik kartı, pasaport veya banka kartı fotoğrafı yükleme.\n\n"İzin veriyorum" seçeneği bu açıklanan isteğe bağlı işleme yönelik tercihini kaydeder. Bu seçim tek başına yurt dışı aktarımının hukuken uygun olduğunu göstermez; ilgili hukuki koşullar ve hizmet ayarları ayrıca doğrulanmalıdır. Tercihini istediğin zaman Profil → Gizlilik ve Güvenlik\'ten geri alabilirsin.',
      'This feature sends the document or receipt photo, document details or your question to the configured OpenAI API endpoint for analysis. OpenAI states that API content is not used to train its models by default. Abuse-monitoring logs may include prompt and response content and may be retained for up to 30 days by default; legal or safety requirements can affect retention. The data controls for the BAKPLANLA account and configured endpoint have not been verified.\n\nIf your document contains sensitive data such as health information, it is sent too. Do not upload ID cards, passports or bank cards.\n\nSelecting "I agree" records your choice for the optional processing described here. This choice alone does not establish that an international transfer is legally permitted; applicable legal requirements and service settings must be separately verified. You can withdraw your choice anytime in Profile → Privacy & Security.',
      'Diese Funktion sendet das Dokument- oder Kassenbonfoto, Dokumentdaten oder deine Frage zur Analyse an den konfigurierten OpenAI-API-Endpunkt. OpenAI gibt an, dass API-Inhalte standardmäßig nicht zum Training seiner Modelle verwendet werden. Missbrauchsüberwachungsprotokolle können Prompt- und Antwortinhalte enthalten und standardmäßig bis zu 30 Tage gespeichert werden; gesetzliche oder sicherheitsbedingte Anforderungen können die Aufbewahrung beeinflussen. Die Datenkontrollen für das BAKPLANLA-Konto und den konfigurierten Endpunkt sind nicht verifiziert.\n\nEnthält dein Dokument sensible Daten wie Gesundheitsinfos, werden diese mitgesendet. Lade keine Ausweise oder Bankkarten hoch.\n\nMit "Ich stimme zu" wird deine Entscheidung für die hier beschriebene optionale Verarbeitung gespeichert. Diese Auswahl allein belegt nicht, dass eine internationale Übermittlung rechtlich zulässig ist; die geltenden rechtlichen Anforderungen und Diensteinstellungen müssen separat geprüft werden. Du kannst deine Entscheidung jederzeit unter Profil → Datenschutz & Sicherheit widerrufen.'
    );
    if (Platform.OS === 'web') {
      // react-native-web Alert düğme desteklemez.
      try {
        // eslint-disable-next-line no-alert
        resolve(window.confirm(`${title}\n\n${message}`) ? 'yes' : 'no');
      } catch (e) {
        resolve('no');
      }
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: tAi('Metni oku', 'Read notice', 'Hinweis lesen'), onPress: () => resolve('read') },
        { text: tAi('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel', onPress: () => resolve('no') },
        { text: tAi('İzin veriyorum', 'I agree', 'Ich stimme zu'), onPress: () => resolve('yes') },
      ],
      { cancelable: true, onDismiss: () => resolve('no') }
    );
  });

const hasAiConsent = async (user) => {
  if (!user?.id) return { available: false, allowed: false };
  try {
    const purpose = await supabase.rpc('ai_provider_authorization_active', { p_user: user.id });
    if (purpose.error || typeof purpose.data !== 'boolean') return { available: false, allowed: false };
    // A previous combined AI choice is never promoted into this purpose record.
    // Do not show the legacy prompt when the approved purpose is not active.
    if (!purpose.data) return { available: true, allowed: false, purposeClosed: true };
    const { data, error } = await supabase.rpc('ai_consent_is_active', { p_user: user.id });
    if (error || typeof data !== 'boolean') return { available: false, allowed: false };
    return { available: true, allowed: data };
  } catch (e) {
    return { available: false, allowed: false };
  }
};

// allowed = devam; denied = kullanıcının kararı; unavailable = kayıt sunucuda doğrulanamadı.
const ensureAiConsent = async () => {
  let user = null;
  try {
    const { data } = await supabase.auth.getSession();
    user = data?.session?.user || null;
  } catch (e) {
    user = null;
  }
  if (!user) return 'allowed'; // oturum yoksa istek zaten 'auth' hatasıyla durur
  const status = await hasAiConsent(user);
  if (!status.available) return 'unavailable';
  if (status.purposeClosed) return 'unavailable';
  if (status.allowed) return 'allowed';
  const answer = await askAiConsent();
  if (answer === 'read') {
    openLegal(LEGAL_URLS.kvkk);
    return 'denied';
  }
  if (answer !== 'yes') return 'denied';
  let granted;
  try {
    const { data, error } = await supabase.rpc('grant_ai_consent', {
      p_version: AI_CONSENT_VERSION,
      p_expected_user: user.id,
    });
    granted = !error && data?.ok === true;
  } catch (e) {
    granted = false;
  }
  if (!granted) return 'unavailable';
  // Keep only the legacy user-scoped local marker; it is not an authorization source.
  try { await AsyncStorage.setItem(aiConsentKey(user.id), AI_CONSENT_VERSION); } catch (e) { /* server record is authoritative */ }
  return 'allowed';
};

const withdrawAiConsent = async () => {
  let user = null;
  try {
    const { data } = await supabase.auth.getSession();
    user = data?.session?.user || null;
  } catch (e) {
    user = null;
  }
  if (!user) return false;
  let purposeWithdrawn = false;
  let consentWithdrawn = false;
  try {
    const { data, error } = await supabase.rpc('withdraw_ai_provider_authorization', { p_expected_user: user.id });
    purposeWithdrawn = !error && data?.ok === true;
  } catch (e) {
    purposeWithdrawn = false;
  }
  try {
    const { data, error } = await supabase.rpc('withdraw_ai_consent', { p_expected_user: user.id });
    consentWithdrawn = !error && data?.ok === true;
  } catch (e) {
    consentWithdrawn = false;
  }
  if (!purposeWithdrawn || !consentWithdrawn) return false;
  try { await AsyncStorage.removeItem(aiConsentKey(user.id)); } catch (e) { /* server record is authoritative */ }
  return true;
};

/* Belge görsellerinin bulut yedeği (cloudImages.js) için dosya sistemi bağdaştırıcısı. */
const fsAdapter = {
  docDir: FileSystem.documentDirectory,
  readBase64: (uri) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
  sha256: async (bytes) => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)))
    .map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  downloadTo: async (url, dest) => {
    const res = await FileSystem.downloadAsync(url, dest);
    return !!res && res.status === 200;
  },
};

const deleteBackupImagesForOwner = async (uid, isCurrent = () => true) => {
const meta = await fetchBackupMeta(backupStore, uid);
if (!meta.ok) return { deleted: false, reason: meta.reason };
let previousPaths = [];
if (meta.meta) {
const currentBackup = await fetchBackup(backupStore, uid);
if (!currentBackup.ok || !currentBackup.row || currentBackup.row.updated_at !== meta.meta.updated_at) {
return { deleted: false, reason: currentBackup.ok ? 'conflict' : currentBackup.reason };
}
const verified = validateBackupRow(currentBackup.row);
if (!verified.ok) return { deleted: false, reason: verified.reason };
previousPaths = verified.payload.documents.map((doc) => doc && doc.imagePath).filter((path) => isOwnImagePath(uid, path));
}
let pendingPaths = [];
let raw = null;
try { raw = await AsyncStorage.getItem(imageCleanupKey(uid)); } catch (error) { return { deleted: false, reason: 'journal' }; }
const parsedJournal = parseImageCleanupJournal(uid, raw);
if (!parsedJournal.ok) return { deleted: false, reason: 'journal' };
pendingPaths = parsedJournal.paths;
const deletion = await deleteCloudImageBackup({
uid, previousPaths, pendingPaths, isCurrent,
persistJournal: async (paths) => {
try { await AsyncStorage.setItem(imageCleanupKey(uid), JSON.stringify(paths)); return true; } catch (error) { return false; }
},
deleteBackup: () => deleteBackup(backupStore, uid, meta.meta ? meta.meta.updated_at : null),
removePaths: (paths) => removeCloudImagePaths({ supabase, uid, paths }),
});
if (deletion.deleted) {
try { await AsyncStorage.removeItem(backupMetaKey(uid)); } catch (error) { /* Remote deletion is authoritative. */ }
}
return deletion;
};

/* Yapay zekâ fonksiyonuna yapılan tüm istekler giriş yapmış kullanıcının
   oturum token'ı ile gider. Oturum yoksa istek hiç gönderilmez. */
const callSmartEndpoint = async (body, signal, isCurrent = () => true) => {
  let token;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token;
  } catch (error) {
    throw makeSmartError('auth');
  }
  if (!isCurrent()) throw makeSmartError('stale');
  if (!token) throw makeSmartError('auth');
  return fetch(SMART_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });
};

/* Tüm yapay zekâ çağrıları bunun üzerinden gider: istek gövdesi ve backend sözleşmesi aynıdır
   (callSmartEndpoint'e giden body değişmez); ek olarak zaman aşımı, ağ/HTTP hata sınıflandırması
   ve JSON doğrulaması uygulanır. Başarılıysa ayrıştırılmış JSON nesnesini döndürür, aksi halde
   `.kind` alanı olan bir hata fırlatır (mesaj için smartErrorMessage kullanılır). */
const callSmartJson = async (body, isCurrent = () => true) => {
  if (!isCurrent()) return { stale: true };
  // "Bugün Ne Yapsak?" yalnızca semt adı gönderir (kişisel veri yok); diğer modlar için açık rıza gerekir.
  if (!(body && body.mode === 'places')) {
    const consent = await ensureAiConsent();
    if (!isCurrent()) return { stale: true };
    if (consent === 'unavailable') throw makeSmartError('server');
    if (consent === 'denied') {
      throw makeSmartError('local', null, tAi(
        'Yapay zekâ özelliği için izin vermediğin için istek gönderilmedi. Ücretsiz hakkın harcanmadı.',
        'The request was not sent because you did not give permission for the AI feature. Your free use was not spent.',
        'Die Anfrage wurde nicht gesendet, da du der KI-Funktion nicht zugestimmt hast. Deine Gratisnutzung wurde nicht verbraucht.'
      ));
    }
  }
  const timeoutMs = body && body.image
    ? AI_TIMEOUT_MS.image
    : AI_TIMEOUT_MS[body && body.mode] || AI_TIMEOUT_MS.default;
  if (!isCurrent()) return { stale: true };
  return requestJsonWithTimeout((signal) => callSmartEndpoint(body, signal, isCurrent), timeoutMs);
};

// Konsola yalnızca hata türü ve HTTP kodu yazılır; istek/yanıt gövdesi, token veya belge verisi yazılmaz.
const SAFE_SMART_ERROR_KINDS = new Set(['auth', 'stale', 'server', 'local', 'timeout', 'network', 'http', 'format', 'parse', 'quota', 'rate', 'placesUnavailable', 'aiConsent', 'featureTrial', 'featureTrialRetryLimit']);
const logSmartError = (label, error) => {
  const kind = SAFE_SMART_ERROR_KINDS.has(error?.kind) ? error.kind : 'unknown';
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : '';
  console.log(label, kind, status);
};

/*
===========================================================
BAKPLANLA  v1.2.0
Hayatını Seninle Planlar.
===========================================================
TEK DOSYA SÜRÜMÜ

Çalışan:
- Ana Sayfa (Hayat Skoru, Bugün), Belgeler, Belge Detay
- Takvim (aylık görünüm + liste), görev ekle/düzenle/sil
- Kamera / Galeri / Görselsiz belge ekleme
- Yerel kayıt (AsyncStorage), TR / EN / DE, koyu tema

Arayüzü hazır, gerçek bağlantısı HAZIRLANIYOR:
- PLAN AI, Fırsat Motoru, QR Merkezi
- Bildirimler, PLAN Pro aboneliği

Kodu yazıldı, ancak sunucu kurulumu (supabase/KURULUM.md) yapılıp gerçek hesapla denenmeden
"çalışıyor" sayılmaz:
- Bulut yedekleme / geri yükleme, Profil > Planım (ad + tercihler)

GİZLİ ANAHTARLARI BU DOSYAYA KOYMA.
===========================================================
*/

/* ------------------------------------------------------- */
/*                      ORTAK BAĞLAM                       */
/* ------------------------------------------------------- */

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

/* ------------------------------------------------------- */
/*                  KÜÇÜK ORTAK BİLEŞENLER                 */
/* ------------------------------------------------------- */

const Screen = ({ children, flush, light }) => {
const { s, dark } = useApp();
return (
<View style={[s.screen, flush && { paddingTop: 0 }]}>
<StatusBar barStyle={dark || light ? 'light-content' : 'dark-content'} />
<ScrollView
showsVerticalScrollIndicator={false}
keyboardShouldPersistTaps="handled"
contentContainerStyle={flush ? { paddingBottom: 30 } : s.content}
>
{children}
</ScrollView>
</View>
);
};

const LogoBadge = ({ size = 40 }) => {
const { s } = useApp();
return (
<View style={[s.logoBadge, { width: size, height: size, borderRadius: size * 0.3 }]}>
<Text style={[s.logoText, { fontSize: size * 0.55 }]}>P</Text>
</View>
);
};

const ComingSoonScreen = ({ title, text }) => (
<Screen>
<ScreenHeader title={title} />
<View style={{ padding: 24, alignItems: 'center' }}>
<Text style={{ fontSize: 40, marginBottom: 12 }}>🛠️</Text>
<Text style={{ fontSize: 16, textAlign: 'center', color: '#5C6B67', lineHeight: 22 }}>{text}</Text>
</View>
</Screen>
);

const ScreenHeader = ({ title, subtitle }) => {
const { s, c, tx, canGoBack, goBack } = useApp();
return (
<View>
{canGoBack && (
<TouchableOpacity style={s.backBtn} onPress={goBack}>
<Ionicons name="chevron-back" size={18} color={c.green} />
<Text style={s.backText}>{tx('Geri', 'Back', 'Zurück')}</Text>
</TouchableOpacity>
)}
<View style={s.headerRow}>
<View style={[s.flex1, { paddingRight: 12 }]}>
<Text style={s.h1}>{title}</Text>
{!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
</View>
<LogoBadge size={42} />
</View>
</View>
);
};

const Chip = ({ label, active, onPress }) => {
const { s } = useApp();
return (
<TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress}>
<Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
</TouchableOpacity>
);
};

const EmptyCard = ({ badge, title, text, buttonLabel, onPress }) => {
const { s } = useApp();
return (
<View style={s.emptyCard}>
<View style={s.emptyIconBox}>
<Text style={s.emptyIconText}>{badge}</Text>
</View>
<Text style={s.emptyTitle}>{title}</Text>
{!!text && <Text style={s.emptyText}>{text}</Text>}
{!!buttonLabel && (
<TouchableOpacity style={s.emptyBtn} onPress={onPress}>
<Text style={s.emptyBtnText}>{buttonLabel}</Text>
</TouchableOpacity>
)}
</View>
);
};

/* Fiş kartı: mağaza, şube, tarih, ürün ürün adet/fiyat ve toplam kontrolü.
   Akıllı Alışveriş ve Belge Detay ekranlarında aynı görünür. */
const ReceiptCard = ({ receipt }) => {
const { s, c, tx } = useApp();
if (!receipt || !Array.isArray(receipt.items)) return null;
const branch = receiptBranch(receipt);
const when = receiptDateText(receipt);
const notComparable = receipt.items.filter((it) => !it.comparable).length;
return (
<View style={s.card}>
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
<View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
<Ionicons name={receipt.store && receipt.store.type === 'akaryakit' ? 'car-outline' : 'cart-outline'} size={20} color={c.green} />
</View>
<View style={{ flex: 1 }}>
<Text style={{ color: c.text, fontSize: 16, fontWeight: '900' }}>{receiptStoreName(receipt)}</Text>
<Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{receiptStoreType(receipt)}{when ? ` · ${when}` : ''}</Text>
</View>
</View>
{!!branch && (
<View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 }}>
<Ionicons name="location-outline" size={14} color={c.sub} style={{ marginTop: 2 }} />
<Text style={{ color: c.sub, fontSize: 12, flex: 1, lineHeight: 18 }}>{branch}</Text>
</View>
)}

<View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />

{receipt.items.map((it, index) => (
<View key={`${it.raw_name || it.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
<View style={{ flex: 1 }}>
<Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{it.name}</Text>
<Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
{formatQty(it.quantity)} {it.unit}{it.unit_price !== null && it.quantity !== 1 ? ` × ${formatTL(it.unit_price)}` : ''} · {CATEGORY_LABELS[it.category] || CATEGORY_LABELS.diger}
{it.raw_name && it.raw_name !== it.name ? `\n${tx('Fişte', 'On receipt', 'Auf Bon')}: ${it.raw_name}` : ''}
</Text>
</View>
<Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{formatTL(it.line_total)}</Text>
</View>
))}

<View style={{ height: 1, backgroundColor: c.border, marginTop: 2, marginBottom: 10 }} />
{receipt.discount_total ? (
<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
<Text style={{ color: c.sub, fontSize: 13 }}>{tx('İndirim', 'Discount', 'Rabatt')}</Text>
<Text style={{ color: c.sub, fontSize: 13 }}>-{formatTL(receipt.discount_total)}</Text>
</View>
) : null}
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
<Text style={{ color: c.text, fontSize: 15, fontWeight: '900' }}>{tx('Toplam', 'Total', 'Summe')}</Text>
<Text style={{ color: c.text, fontSize: 17, fontWeight: '900' }}>{formatTL(receipt.total ?? receipt.items_total)}</Text>
</View>

{receipt.totals_match === true && (
<Text style={{ color: c.green, fontSize: 12, marginTop: 8, fontWeight: '700' }}>✓ {tx('Ürünlerin toplamı fiş toplamıyla tutuyor.', 'Item total matches the receipt total.', 'Artikelsumme stimmt mit dem Bonbetrag überein.')}</Text>
)}
{receipt.totals_match === false && (
<Text style={{ color: c.orange, fontSize: 12, marginTop: 8, lineHeight: 18, fontWeight: '700' }}>⚠️ {tx(
`Ürünlerin toplamı ${formatTL(receipt.items_total)}, fiş toplamı ${formatTL(receipt.total)}. Bazı satırlar okunamamış olabilir; daha net bir fotoğrafla tekrar okutabilirsin.`,
`Item total ${formatTL(receipt.items_total)}, receipt total ${formatTL(receipt.total)}. Some lines may not have been read.`,
`Artikelsumme ${formatTL(receipt.items_total)}, Bonbetrag ${formatTL(receipt.total)}. Einige Zeilen wurden evtl. nicht erkannt.`
)}</Text>
)}
{notComparable > 0 && (
<Text style={{ color: c.sub, fontSize: 11, marginTop: 8, lineHeight: 16 }}>{receipt.store && receipt.store.type !== 'market'
? tx('Bu fiş market fişi olmadığı için fiyat karşılaştırmasına dahil edilmez.', 'This is not a supermarket receipt, so it is not included in price comparison.', 'Kein Supermarkt-Bon; nicht im Preisvergleich.')
: tx(`${notComparable} kalem (sigara, poşet gibi fiyatı her yerde aynı olanlar) fiyat karşılaştırmasına dahil edilmez.`, `${notComparable} items with fixed prices (e.g. tobacco, bags) are not included in price comparison.`, `${notComparable} Artikel mit Festpreis sind nicht im Vergleich.`)}</Text>
)}
</View>
);
};

const backupErrorText = (tx, reason) => {
switch (reason) {
case 'network': return tx('İnternet bağlantısı yok ya da sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.', 'No internet connection or the server is unreachable. Check your connection and try again.', 'Keine Internetverbindung oder Server nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.');
case 'unavailable': return tx('Bulut yedekleme şu anda kullanılamıyor. Cihazındaki veriler ve varsa mevcut bulut yedeği değiştirilmedi.', 'Cloud backup is currently unavailable. Your local data and any existing cloud backup were not changed.', 'Cloud-Backups sind derzeit nicht verfügbar. Deine lokalen Daten und vorhandene Cloud-Backups wurden nicht geändert.');
case 'auth': return tx('Bu işlem için yetkin yok ya da oturumun süresi dolmuş. Çıkış yapıp tekrar giriş yapmayı dene.', 'You are not authorized or your session expired. Try signing out and in again.', 'Keine Berechtigung oder Sitzung abgelaufen. Melde dich ab und wieder an.');
case 'setup': return tx('Yedekleme sunucuda henüz kurulmamış (veritabanı tablosu bulunamadı). Yönetici kurulumu tamamlamalı.', 'Backup is not set up on the server yet (database table not found). The administrator must finish the setup.', 'Das Backup ist auf dem Server noch nicht eingerichtet (Tabelle nicht gefunden). Die Einrichtung muss abgeschlossen werden.');
case 'conflict': return tx('Yedek, sen işlem yaparken başka bir cihazdan değişti. Hiçbir şey ezilmedi; lütfen tekrar dene.', 'The backup changed from another device meanwhile. Nothing was overwritten; please try again.', 'Das Backup wurde inzwischen von einem anderen Gerät geändert. Nichts wurde überschrieben; bitte erneut versuchen.');
case 'verify': return tx('Yedek gönderildi ama doğrulanamadı. Lütfen tekrar yedekle.', 'The backup was sent but could not be verified. Please back up again.', 'Das Backup wurde gesendet, aber nicht verifiziert. Bitte erneut sichern.');
case 'toolarge': return tx('Verilerin yedek için çok büyük.', 'Your data is too large to back up.', 'Deine Daten sind zu groß für ein Backup.');
case 'checksum': return tx('Buluttaki yedek bozuk görünüyor (sağlama uyuşmadı). Cihazındaki verilere dokunulmadı.', 'The cloud backup looks corrupted (checksum mismatch). Your local data was not touched.', 'Das Cloud-Backup scheint beschädigt (Prüfsumme stimmt nicht). Lokale Daten wurden nicht verändert.');
case 'version': return tx('Yedek, bu uygulama sürümüyle uyumlu değil. Uygulamayı güncelle.', 'The backup is not compatible with this app version. Please update the app.', 'Das Backup ist mit dieser App-Version nicht kompatibel. Bitte aktualisiere die App.');
case 'invalid': return tx('Buluttaki yedek okunamadı. Cihazındaki verilere dokunulmadı.', 'The cloud backup could not be read. Your local data was not touched.', 'Das Cloud-Backup konnte nicht gelesen werden. Lokale Daten wurden nicht verändert.');
case 'owner': return tx('Bu cihazdaki veriler başka bir hesaba ait görünüyor. Karışmaması için yedekleme/geri yükleme kapalı. Önce Profil > Verilerimi Sil ile cihaz verilerini temizle.', 'Data on this device seems to belong to another account. Backup/restore is disabled to avoid mixing. First clear device data via Profile > Delete my data.', 'Die Daten auf diesem Gerät gehören scheinbar zu einem anderen Konto. Backup/Wiederherstellung ist gesperrt. Lösche zuerst die Gerätedaten unter Profil > Meine Daten löschen.');
case 'blocked': return tx('Kayıtlı görevlerin okunamadığı için güvenlik amacıyla yedekleme/geri yükleme bu oturumda kapalı. Uygulamayı yeniden aç.', 'Because saved tasks could not be read, backup/restore is disabled in this session for safety. Reopen the app.', 'Da gespeicherte Aufgaben nicht gelesen werden konnten, ist Backup/Wiederherstellung in dieser Sitzung gesperrt. Öffne die App neu.');
case 'storage': return tx('Veriler cihaza yazılamadı. Depolama alanını kontrol et. Mevcut verilerin korunuyor.', 'Data could not be written to the device. Check storage. Your existing data is preserved.', 'Daten konnten nicht auf das Gerät geschrieben werden. Prüfe den Speicher. Bestehende Daten bleiben erhalten.');
default: return tx('İşlem tamamlanamadı. Lütfen tekrar dene.', 'The operation could not be completed. Please try again.', 'Der Vorgang konnte nicht abgeschlossen werden. Bitte erneut versuchen.');
}
};

const confirmAsync = (title, message, confirmText, cancelText, destructive) =>
  new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

const removeStorageKey = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
};

/* ---------- İŞ BAŞI — meslek deneyimi oyunu (Kafe: Barista · Market: Kasiyer, Reyon Görevlisi) ---------- */
/* Aşama 3: sunucu doğrulaması (isbasi Edge Function), gerçek kupon sistemi, yenilenmiş görseller. */

const ibApi = createIsbasiApi({
baseUrl: SUPABASE_URL,
apiKey: SUPABASE_PUBLISHABLE_KEY,
getToken: async () => {
const { data } = await supabase.auth.getSession();
return data?.session?.access_token || null;
},
fetchImpl: (...args) => fetch(...args),
});

const MenuRow = ({ icon, title, subtitle, onPress, tag }) => {
const { s, c } = useApp();
return (
<TouchableOpacity style={s.menuRow} onPress={onPress}>
<View style={s.menuIcon}>
<Ionicons name={icon} size={22} color={c.green} />
</View>
<View style={s.flex1}>
<Text style={s.menuTitle}>{title}</Text>
{!!subtitle && <Text style={s.menuSub}>{subtitle}</Text>}
</View>
{tag ? (
<View style={s.tag}>
<Text style={s.tagText}>{tag}</Text>
</View>
) : (
<Ionicons name="chevron-forward" size={18} color={c.muted} />
)}
</TouchableOpacity>
);
};
/* ------------------------------------------------------- */
/*                          MODALLAR                       */
/* ------------------------------------------------------- */

const Sheet = ({ visible, onClose, children }) => {
const { s } = useApp();
return (
<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
<View style={s.overlay}>
<TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
<View style={s.sheet}>
<View style={s.handle} />
<ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
{children}
</ScrollView>
</View>
</View>
</KeyboardAvoidingView>
</Modal>
);
};

const Method = ({ icon, title, subtitle, onPress }) => {
const { s, c } = useApp();
return (
<TouchableOpacity style={s.methodCard} onPress={onPress}>
<View style={s.methodIcon}>
<Ionicons name={icon} size={22} color={c.green} />
</View>
<View style={s.flex1}>
<Text style={s.cardTitle}>{title}</Text>
<Text style={s.cardMeta}>{subtitle}</Text>
</View>
<Ionicons name="chevron-forward" size={18} color={c.muted} />
</TouchableOpacity>
);
};

const AddSheet = () => {
const { s, tx, showAddSheet, setShowAddSheet, pickFromCamera, pickFromGallery, addManualDocument, openNewTask } = useApp();
const run = (fn) => {
setShowAddSheet(false);
setTimeout(fn, 300);
};
return (
<Sheet visible={showAddSheet} onClose={() => setShowAddSheet(false)}>
<Text style={s.sheetTitle}>{tx('Ne eklemek istersin?', 'What do you want to add?', 'Was möchtest du hinzufügen?')}</Text>
<Method icon="camera-outline" title={tx('Kamera ile Tara', 'Scan with Camera', 'Mit Kamera scannen')} subtitle={tx('Belgenin fotoğrafını çek', 'Take a photo of the document', 'Foto vom Dokument aufnehmen')} onPress={() => run(pickFromCamera)} />
<Method icon="image-outline" title={tx('Galeriden Seç', 'Choose from Gallery', 'Aus Galerie wählen')} subtitle={tx('Kayıtlı bir görsel seç', 'Pick a saved image', 'Gespeichertes Bild wählen')} onPress={() => run(pickFromGallery)} />
<Method icon="create-outline" title={tx('Görselsiz Belge', 'Document without image', 'Dokument ohne Bild')} subtitle={tx('Sadece başlık ve not ile', 'With title and notes only', 'Nur mit Titel und Notiz')} onPress={() => run(addManualDocument)} />
<Method icon="checkmark-circle-outline" title={tx('Görev Ekle', 'Add Task', 'Aufgabe hinzufügen')} subtitle={tx('Tarihli bir görev oluştur', 'Create a task with a date', 'Aufgabe mit Datum erstellen')} onPress={() => run(() => openNewTask())} />
<TouchableOpacity style={s.secondaryBtn} onPress={() => setShowAddSheet(false)}>
<Text style={s.secondaryBtnText}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text>
</TouchableOpacity>
</Sheet>
);
};

const TaskModal = () => {
const { s, tx, today, taskModal, setTaskModal, saveTask, deleteTask } = useApp();
const visible = !!taskModal;
const editing = !!(taskModal && taskModal.taskId);
const close = () => setTaskModal(null);
const setField = (key, value) => setTaskModal((cur) => (cur ? { ...cur, [key]: value } : cur));

return (
<Sheet visible={visible} onClose={close}>
{visible && (
<>
<Text style={s.sheetTitle}>
{editing ? tx('Görevi Düzenle', 'Edit Task', 'Aufgabe bearbeiten') : tx('Yeni Görev', 'New Task', 'Neue Aufgabe')}
</Text>

<Text style={s.label}>{tx('GÖREV', 'TASK', 'AUFGABE')}</Text>
<TextInput value={taskModal.title} onChangeText={(text) => setField('title', text)} placeholder={tx('Ne yapılacak?', 'What needs to be done?', 'Was ist zu tun?')} placeholderTextColor="#9BA7A3" style={s.input} />

<Text style={s.label}>{tx('TARİH (YYYY-AA-GG)', 'DATE (YYYY-MM-DD)', 'DATUM (JJJJ-MM-TT)')}</Text>
<TextInput value={taskModal.date} onChangeText={(text) => setField('date', text)} placeholder="YYYY-MM-DD" placeholderTextColor="#9BA7A3" keyboardType="numbers-and-punctuation" maxLength={10} style={s.input} />
<View style={[s.chipRow, { marginTop: 10 }]}>
<Chip label={tx('Bugün', 'Today', 'Heute')} active={taskModal.date === today} onPress={() => setField('date', today)} />
<Chip label={tx('Yarın', 'Tomorrow', 'Morgen')} active={taskModal.date === addDaysISO(today, 1)} onPress={() => setField('date', addDaysISO(today, 1))} />
<Chip label={tx('1 Hafta', '1 week', '1 Woche')} active={taskModal.date === addDaysISO(today, 7)} onPress={() => setField('date', addDaysISO(today, 7))} />
</View>

<View style={s.btnRow}>
<TouchableOpacity style={[s.secondaryBtn, s.btnHalf, { marginTop: 0 }]} onPress={close}>
<Text style={s.secondaryBtnText}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text>
</TouchableOpacity>
<TouchableOpacity style={[s.primaryBtn, s.btnHalf, { marginTop: 0 }]} onPress={saveTask}>
<Text style={s.primaryBtnText}>{tx('Kaydet', 'Save', 'Speichern')}</Text>
</TouchableOpacity>
</View>

{editing && (
<TouchableOpacity
style={s.dangerBtn}
onPress={() => {
deleteTask(taskModal.taskId);
close();
}}
>
<Text style={s.dangerBtnText}>{tx('Görevi Sil', 'Delete Task', 'Aufgabe löschen')}</Text>
</TouchableOpacity>
)}
</>
)}
</Sheet>
);
};

const AppearanceModal = () => {
const { s, c, tx, lang, dark, showAppearanceModal, setShowAppearanceModal, changeLanguage, toggleDarkTheme } = useApp();
return (
<Sheet visible={showAppearanceModal} onClose={() => setShowAppearanceModal(false)}>
<Text style={s.sheetTitle}>{tx('Dil ve Görünüm', 'Language & Appearance', 'Sprache & Design')}</Text>
{LANGUAGES.map((item) => (
<TouchableOpacity key={item.code} style={[s.languageOption, lang === item.code && s.languageOptionActive]} onPress={() => changeLanguage(item.code)}>
<Text style={s.flag}>{item.flag}</Text>
<Text style={[s.cardTitle, s.flex1]}>{item.label}</Text>
{lang === item.code && <Ionicons name="checkmark" size={20} color={c.green} />}
</TouchableOpacity>
))}
<View style={s.switchRow}>
<Text style={s.cardTitle}>🌙 {tx('Koyu Tema', 'Dark Theme', 'Dunkles Design')}</Text>
<Switch value={dark} onValueChange={toggleDarkTheme} trackColor={{ true: c.green }} />
</View>
<TouchableOpacity style={s.secondaryBtn} onPress={() => setShowAppearanceModal(false)}>
<Text style={s.secondaryBtnText}>{tx('Kapat', 'Close', 'Schließen')}</Text>
</TouchableOpacity>
</Sheet>
);
};

const PlanModal = () => {
const { s, c, tx, lang, userName, saveUserName, showPlanModal, setShowPlanModal, setShowAuthModal, documents, tasks, session, showToast, todayPreferences, setTodayPreferences } = useApp();
const [name, setName] = useState(userName);
const [location, setLocation] = useState('');
const [budget, setBudget] = useState('');
const [people, setPeople] = useState(DEFAULT_TODAY_PREFERENCES.peopleCount);
const [errors, setErrors] = useState({});
const [saving, setSaving] = useState(false);
const savingRef = useRef(false);
const email = session?.user?.email || '';
const signedIn = !!session?.user?.id;
const memberSince = formatMemberSince(session?.user?.created_at, lang);

useEffect(() => {
if (showPlanModal) {
setName(userName);
setLocation(String(todayPreferences.location || ''));
setBudget(/^\d+$/.test(String(todayPreferences.budget || '')) ? String(todayPreferences.budget) : '');
setPeople(PEOPLE_OPTIONS.includes(todayPreferences.peopleCount) ? todayPreferences.peopleCount : DEFAULT_TODAY_PREFERENCES.peopleCount);
setErrors({});
}
}, [showPlanModal, userName]);

const clearError = (key) => { if (errors[key]) setErrors((cur) => ({ ...cur, [key]: undefined })); };

const nameErrorText = (reason) => {
switch (reason) {
case 'empty': return tx('Lütfen adını yaz.', 'Please enter your name.', 'Bitte gib deinen Namen ein.');
case 'short': return tx('Ad en az 2 karakter olmalı.', 'Name must be at least 2 characters.', 'Der Name muss mindestens 2 Zeichen haben.');
case 'long': return tx('Ad en fazla 30 karakter olabilir.', 'Name can be at most 30 characters.', 'Der Name darf höchstens 30 Zeichen haben.');
case 'chars': return tx('Ad geçersiz karakter içeriyor.', 'Name contains invalid characters.', 'Der Name enthält ungültige Zeichen.');
case 'letters': return tx('Ad en az bir harf içermeli.', 'Name must contain at least one letter.', 'Der Name muss mindestens einen Buchstaben enthalten.');
case 'auth': return tx('Kaydetmek için giriş yapmalısın.', 'You need to sign in to save.', 'Zum Speichern musst du angemeldet sein.');
case 'busy': return tx('Kayıt işlemi sürüyor.', 'Saving is in progress.', 'Speichern läuft bereits.');
default: return tx('Bilgiler kaydedilemedi. Lütfen tekrar dene.', 'Your info could not be saved. Please try again.', 'Die Angaben konnten nicht gespeichert werden. Bitte versuche es erneut.');
}
};

const locationErrorText = (reason) => (reason === 'long'
? tx(`Şehir/semt en fazla ${LOCATION_MAX} karakter olabilir.`, `City/district can be at most ${LOCATION_MAX} characters.`, `Stadt/Viertel darf höchstens ${LOCATION_MAX} Zeichen haben.`)
: tx('Şehir/semt geçersiz karakter içeriyor.', 'City/district contains invalid characters.', 'Stadt/Viertel enthält ungültige Zeichen.'));

const budgetErrorText = (reason) => (reason === 'long'
? tx(`Bütçe en fazla ${BUDGET_MAX_DIGITS} haneli olabilir.`, `Budget can have at most ${BUDGET_MAX_DIGITS} digits.`, `Das Budget darf höchstens ${BUDGET_MAX_DIGITS} Stellen haben.`)
: tx('Bütçe yalnızca rakam içermeli.', 'Budget must contain digits only.', 'Das Budget darf nur Ziffern enthalten.'));

const openSignIn = () => {
setShowPlanModal(false);
setShowAuthModal(true);
};

const handleSave = async () => {
if (savingRef.current) return;
// Önce tercihler doğrulanır; hata varsa hiçbir şey kaydedilmez.
const prefs = validatePlanPrefs({ location, budget, peopleCount: people });
if (!prefs.ok) {
setErrors({
location: prefs.errors.location ? locationErrorText(prefs.errors.location) : undefined,
budget: prefs.errors.budget ? budgetErrorText(prefs.errors.budget) : undefined,
});
return;
}
const nameChanged = String(name).replace(/\s+/g, ' ').trim() !== userName;
const prefsChanged = !arePlanPrefsEqual(prefs.value, todayPreferences);
if (!nameChanged && !prefsChanged) {
setShowPlanModal(false);
return;
}
savingRef.current = true;
setSaving(true);
setErrors({});
try {
let synced = true;
if (nameChanged) {
const result = await saveUserName(name);
if (!result.ok) {
setErrors({ name: nameErrorText(result.reason) });
return;
}
synced = result.synced;
}
// Ad kaydı başarılıysa (ya da değişmediyse) tercihler uygulanır; kalıcı yazma mevcut kayıt akışıyla yapılır.
if (prefsChanged) {
const nextPrefs = { ...todayPreferences, location: prefs.value.location, budget: prefs.value.budget, peopleCount: prefs.value.peopleCount };
      const stored = await saveInRenderedScope(STORAGE_KEYS.todayPreferences, nextPrefs);
      if (!isReadyDataScope(renderDataScopeGeneration)) return;
if (!stored) {
setErrors({ general: tx('Tercihler cihaza kaydedilemedi. Depolama alanını kontrol edip tekrar dene.', 'Preferences could not be saved to the device. Check storage and try again.', 'Einstellungen konnten nicht auf dem Gerät gespeichert werden. Prüfe den Speicher und versuche es erneut.') });
return;
}
setTodayPreferences((cur) => ({ ...cur, ...nextPrefs }));
}
setShowPlanModal(false);
showToast(
synced
? tx('Bilgilerin kaydedildi.', 'Your info was saved.', 'Deine Angaben wurden gespeichert.')
: tx('Bilgilerin cihaza kaydedildi. Hesapla eşitlenemedi.', 'Saved on this device. Could not sync with your account.', 'Auf dem Gerät gespeichert. Abgleich mit dem Konto nicht möglich.')
);
} finally {
savingRef.current = false;
setSaving(false);
}
};

const fieldError = (key) => (errors[key] ? <Text style={{ color: c.red, fontSize: 12, marginTop: 6 }}>{errors[key]}</Text> : null);

return (
<Sheet visible={showPlanModal} onClose={() => !saving && setShowPlanModal(false)}>
<Text style={s.sheetTitle}>{tx('Planım', 'My Plan', 'Mein Plan')}</Text>

{!signedIn ? (
<View style={s.softCard}>
<Text style={s.cardTitle}>{tx('Giriş yapılmadı', 'Not signed in', 'Nicht angemeldet')}</Text>
<Text style={s.cardMeta}>{tx('Kişisel bilgilerini ve tercihlerini kaydetmek için giriş yap ya da hesap oluştur.', 'Sign in or create an account to save your personal info and preferences.', 'Melde dich an oder erstelle ein Konto, um deine Angaben und Einstellungen zu speichern.')}</Text>
<TouchableOpacity style={s.primaryBtn} onPress={openSignIn}>
<Text style={s.primaryBtnText}>{tx('Giriş Yap / Kayıt Ol', 'Sign In / Sign Up', 'Anmelden / Registrieren')}</Text>
</TouchableOpacity>
</View>
) : (
<>
<Text style={s.sectionTitle}>{tx('Kişisel bilgiler', 'Personal info', 'Persönliche Angaben')}</Text>
<Text style={s.label}>{tx('ADIN', 'YOUR NAME', 'DEIN NAME')}</Text>
<TextInput value={name} onChangeText={(v) => { setName(v); clearError('name'); }} placeholder={tx('Adını yaz', 'Enter your name', 'Namen eingeben')} placeholderTextColor="#9BA7A3" style={s.input} maxLength={USER_NAME_MAX} editable={!saving} returnKeyType="done" />
{fieldError('name')}

{!!email && (
<>
<Text style={[s.label, { marginTop: 14 }]}>{tx('E-POSTA', 'EMAIL', 'E-MAIL')}</Text>
<View style={[s.input, { justifyContent: 'center' }]}>
<Text style={{ color: c.sub }} numberOfLines={1}>{email}</Text>
</View>
</>
)}

<Text style={[s.label, { marginTop: 14 }]}>{tx('HESAP', 'ACCOUNT', 'KONTO')}</Text>
<View style={[s.input, { justifyContent: 'center' }]}>
<Text style={{ color: c.sub }} numberOfLines={1}>
{tx('Ücretsiz plan', 'Free plan', 'Kostenloser Plan')}{memberSince ? ` · ${tx('Üyelik', 'Member since', 'Mitglied seit')}: ${memberSince}` : ''}
</Text>
</View>
{false && (<>
<Text style={[s.sectionTitle, { marginTop: 18 }]}>{tx('Tercihlerim', 'My preferences', 'Meine Einstellungen')}</Text>
<Text style={s.cardMeta}>{tx('Bu tercihler “Bugün Ne Yapsak?” ekranında da kullanılır ve bulut yedeğine dahildir.', 'These preferences are also used on the “What should we do today?” screen and are included in the cloud backup.', 'Diese Einstellungen werden auch im Bildschirm „Was machen wir heute?“ verwendet und sind im Cloud-Backup enthalten.')}</Text>

<Text style={[s.label, { marginTop: 12 }]}>{tx('ŞEHİR / SEMT', 'CITY / DISTRICT', 'STADT / VIERTEL')}</Text>
<TextInput value={location} onChangeText={(v) => { setLocation(v); clearError('location'); }} placeholder={tx('Şehir veya semt', 'City or district', 'Stadt oder Viertel')} placeholderTextColor="#9BA7A3" style={s.input} maxLength={LOCATION_MAX} editable={!saving} returnKeyType="done" />
{fieldError('location')}

<Text style={[s.label, { marginTop: 14 }]}>{tx('BÜTÇE (TL)', 'BUDGET (TRY)', 'BUDGET (TRY)')}</Text>
<TextInput value={budget} onChangeText={(v) => { setBudget(v.replace(/[^\d]/g, '')); clearError('budget'); }} placeholder={tx('Örn. 350', 'e.g. 350', 'z. B. 350')} placeholderTextColor="#9BA7A3" style={s.input} keyboardType="number-pad" maxLength={BUDGET_MAX_DIGITS} editable={!saving} />
{fieldError('budget')}

<Text style={[s.label, { marginTop: 14 }]}>{tx('KAÇ KİŞİ', 'PEOPLE', 'PERSONEN')}</Text>
<View style={s.chipRow}>
{PEOPLE_OPTIONS.map((p) => (
<Chip key={p} label={p} active={people === p} onPress={() => { if (!saving) setPeople(p); }} />
))}
</View>

<View style={[s.statsRow, { marginTop: 16 }]}>
<View style={s.statCard}>
<Text style={s.statNumber}>{documents.length}</Text>
<Text style={s.statLabel}>{tx('Belge', 'Documents', 'Dokumente')}</Text>
</View>
<View style={s.statCard}>
<Text style={s.statNumber}>{tasks.filter((t) => !t.completed).length}</Text>
<Text style={s.statLabel}>{tx('Aktif', 'Active', 'Aktiv')}</Text>
</View>
<View style={s.statCard}>
<Text style={s.statNumber}>{tasks.filter((t) => t.completed).length}</Text>
<Text style={s.statLabel}>{tx('Biten', 'Done', 'Erledigt')}</Text>
</View>
</View>
</>)}
{fieldError('general')}
<View style={s.btnRow}>
<TouchableOpacity disabled={saving} style={[s.secondaryBtn, s.btnHalf, { marginTop: 0 }]} onPress={() => setShowPlanModal(false)}>
<Text style={s.secondaryBtnText}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text>
</TouchableOpacity>
<TouchableOpacity disabled={saving} style={[s.primaryBtn, s.btnHalf, { marginTop: 0, opacity: saving ? 0.6 : 1 }]} onPress={handleSave}>
{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>{tx('Kaydet', 'Save', 'Speichern')}</Text>}
</TouchableOpacity>
</View>
</>
)}
</Sheet>
);
};

/* ------------------------------------------------------- */
/*                        ALT MENÜ                         */
/* ------------------------------------------------------- */

const BottomNavigation = () => {
const { s, c, tx, screen, goTab, openAddSheet } = useApp();

const tabFor = {
home: 'home', ai: 'home', opportunities: 'home', today: 'home', isbasi: 'home', compass: 'home', shopping: 'home', koprusu: 'home', prova: 'home',
documents: 'documents', documentDetail: 'documents',
calendar: 'calendar',
profile: 'profile', cloud: 'profile', pro: 'profile', qr: 'profile', notifications: 'profile', koprusuBiz: 'profile', promo: 'profile', isletmeTanit: 'profile',
};
const current = tabFor[screen] || 'home';

const renderTab = (key, icon, iconActive, label) => {
const active = current === key;
return (
<TouchableOpacity key={key} style={s.navItem} onPress={() => goTab(key)}>
<Ionicons name={active ? iconActive : icon} size={22} color={active ? c.dark : c.muted} />
<Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
</TouchableOpacity>
);
};

return (
<View style={s.navWrap}>
<View style={s.nav}>
{renderTab('home', 'home-outline', 'home', tx('Ana Sayfa', 'Home', 'Start'))}
{renderTab('documents', 'document-text-outline', 'document-text-outline', tx('Belgeler', 'Documents', 'Dokumente'))}
<View style={s.navItem}>
<TouchableOpacity style={s.navPlus} onPress={openAddSheet}>
<Ionicons name="add" size={32} color="#F5B83D" />
</TouchableOpacity>
</View>
{renderTab('calendar', 'calendar-outline', 'calendar', tx('Takvim', 'Calendar', 'Kalender'))}
{renderTab('profile', 'person-outline', 'person', tx('Profil', 'Profile', 'Profil'))}
</View>
</View>
);
};

/* ------------------------------------------------------- */
/*                          ANA UYGULAMA                   */
/* ------------------------------------------------------- */
const WelcomeScreen = () => {
const {
s,
setShowAuthModal,
setAuthMode,
} = useApp();

return (
<ScrollView
style={{ flex: 1, backgroundColor: '#064E43' }}
contentContainerStyle={{ flexGrow: 1 }}
showsVerticalScrollIndicator={false}
>
<View
style={{

backgroundColor: '#064E43',
paddingTop: 35,
paddingHorizontal: 24,
}}
>

{/* LOGO */}
<View
style={{
flexDirection: 'row',
alignItems: 'center',
marginBottom: 28,
}}
>
<View
style={{
width: 64,
height: 64,
borderRadius: 17,
backgroundColor: '#FDBD3F',
alignItems: 'center',
justifyContent: 'center',
}}
>
<Text
style={{
fontSize: 38,
fontWeight: '900',
color: '#064E43',
}}
>
P
</Text>
</View>

<View style={{ marginLeft: 16 }}>
<Text
style={{
color: '#FFFFFF',
fontSize: 28,
fontWeight: '900',
}}
>
BAKPLANLA
</Text>

<Text
style={{
color: '#D9E8E4',
fontSize: 15,
marginTop: -3,
}}
>
Hayatını Seninle Planlar.
</Text>
</View>
</View>

{/* ANA BAŞLIK */}
<Text
style={{
color: '#FFFFFF',
fontSize: 29,
lineHeight: 35,
fontWeight: '900',
}}
>
Belgelerini anla,
</Text>

<Text
style={{
color: '#FFFFFF',
fontSize: 34,
lineHeight: 41,
fontWeight: '900',
}}
>
görevlerini planla,
</Text>

<Text
style={{
color: '#FDBD3F',
fontSize: 34,
lineHeight: 41,
fontWeight: '900',
marginBottom: 28,
}}
>
hayatını kolaylaştır.
</Text>

{/* ÖZELLİKLER */}

<View style={{ marginBottom: 25 }}>

<WelcomeFeature
icon="📄"
title="Belgelerini analiz et"
text="Resim çek, yükle, anlamlandır."
/>

<WelcomeFeature
icon="✨"
title="PLAN AI ile sor"
text="Belgelerin hakkında anında cevap al."
/>

<WelcomeFeature
icon="✓"
title="Görevlerini planla"
text="Önceliklerini belirle, takip et."
/>

<WelcomeFeature
icon="⚡"
title="Fırsatları keşfet"
text="Sana özel fırsatları yakala."
/>

<WelcomeFeature
icon="🧭"
title="Bugün Ne Yapsak?"
text="Konum ve bütçene göre planla."
/>

</View>

{/* BUTONLAR */}

<View
style={{
backgroundColor: '#F8F6EF',
marginHorizontal: -24,
paddingHorizontal: 24,
paddingTop: 20,
paddingBottom: 24,
borderTopLeftRadius: 38,
borderTopRightRadius: 38,
}}
>

<TouchableOpacity
onPress={() => {
setAuthMode('login');
setShowAuthModal(true);
}}
style={{
height: 56,
borderRadius: 18,
backgroundColor: '#075B4E',
alignItems: 'center',
justifyContent: 'center',
marginBottom: 13,
}}
>
<Text
style={{
color: '#FFFFFF',
fontSize: 18,
fontWeight: '900',
}}
>
✉  Giriş Yap
</Text>
</TouchableOpacity>

<TouchableOpacity
onPress={() => {
setAuthMode('signup');
setShowAuthModal(true);
}}
style={{
height: 56,
borderRadius: 18,
backgroundColor: '#FDBD3F',
alignItems: 'center',
justifyContent: 'center',
marginBottom: 20,
}}
>
<Text
style={{
color: '#064E43',
fontSize: 18,
fontWeight: '900',
}}
>
👤  Kayıt Ol
</Text>
</TouchableOpacity>

{/* Google/Apple ile giriş hazır olana kadar gizli (çalışmayan düğme mağaza incelemesinde reddedilebilir). */}
{false && (<>
<View
style={{
flexDirection: 'row',
alignItems: 'center',
marginBottom: 18,
}}
>
<View style={{ flex: 1, height: 1, backgroundColor: '#D5D5D5' }} />
<Text
style={{
marginHorizontal: 15,
color: '#777',
fontSize: 14,
}}
>
Ya da
</Text>
<View style={{ flex: 1, height: 1, backgroundColor: '#D5D5D5' }} />
</View>

<TouchableOpacity
style={{
height: 50,
borderRadius: 16,
borderWidth: 1,
borderColor: '#CCCCCC',
alignItems: 'center',
justifyContent: 'center',
marginBottom: 12,
backgroundColor: '#FFFFFF',
}}
onPress={() => Alert.alert('PLAN', 'Google ile giriş yakında aktif olacak.')}
>
<Text
style={{
color: '#222',
fontSize: 16,
fontWeight: '700',
}}
>
Google ile devam et
</Text>
</TouchableOpacity>

<TouchableOpacity
style={{
height: 50,
borderRadius: 16,
borderWidth: 1,
borderColor: '#CCCCCC',
alignItems: 'center',
justifyContent: 'center',
backgroundColor: '#FFFFFF',
}}
onPress={() => Alert.alert('PLAN', 'Apple ile giriş yakında aktif olacak.')}
>
<Text
style={{
color: '#222',
fontSize: 16,
fontWeight: '700',
}}
>
Apple ile devam et
</Text>
</TouchableOpacity>
</>)}

<Text
style={{
textAlign: 'center',
color: '#777',
fontSize: 12,
lineHeight: 18,
marginTop: 20,
}}
>
<Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL_URLS.terms)}>Kullanım Koşulları</Text>
{'  ·  '}
<Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL_URLS.privacy)}>Gizlilik Politikası</Text>
{'  ·  '}
<Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL_URLS.kvkk)}>KVKK</Text>
</Text>

</View>
</View>
</ScrollView>
);
};

const WelcomeFeature = ({ icon, title, text }) => {
return (
<View
style={{
flexDirection: 'row',
alignItems: 'center',
marginBottom: 7,
}}
>
<View
style={{
width: 48,
height: 48,
borderRadius: 17,
backgroundColor: '#086657',
alignItems: 'center',
justifyContent: 'center',
}}
>
<Text style={{ fontSize: 24 }}>{icon}</Text>
</View>

<View style={{ marginLeft: 15, flex: 1 }}>
<Text
style={{
color: '#FFFFFF',
fontSize: 16,
fontWeight: '900',
}}
>
{title}
</Text>

<Text
style={{
color: '#C9DDD8',
fontSize: 13,
marginTop: 3,
}}
>
{text}
</Text>
</View>
</View>
);
};


const App = () => {
const [stack, setStack] = useState(['home']);
const [lang, setLang] = useState('tr');
useEffect(() => { aiConsentLang = lang; }, [lang]);
const [dark, setDark] = useState(false);
const [isLoading, setIsLoading] = useState(true);
const [today, setToday] = useState(getTodayISO());
const [userName, setUserName] = useState('');
const [session, setSession] = useState(null);
const [authChecking, setAuthChecking] = useState(true);
const [authMode, setAuthMode] = useState('login');
const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
const [authEmail, setAuthEmail] = useState('');
const [newPassword, setNewPassword] = useState('');
const [confirmNewPassword, setConfirmNewPassword] = useState('');
const [recoveryCode, setRecoveryCode] = useState('');
const [recoveryInfo, setRecoveryInfo] = useState('');
const [authPassword, setAuthPassword] = useState('');
const [authLoading, setAuthLoading] = useState(false);
const [authMessage, setAuthMessage] = useState('');
const [showAuthModal, setShowAuthModal] = useState(false);
const [signupConsent, setSignupConsent] = useState(false);
// Kayıttan sonra doğrulama bekleyen e-posta (doluysa giriş penceresinde yeşil bilgi kutusu görünür).
const [verifyEmail, setVerifyEmail] = useState('');
const [resendBusy, setResendBusy] = useState(false);
const [resendNote, setResendNote] = useState('');
const resendAtRef = useRef(0);

const runAuthRequest = async (request) => {
try {
return await request();
} catch {
return { data: null, error: { code: 'request_failed' } };
}
};

const handleResendVerification = async () => {
const email = (verifyEmail || authEmail).trim();
if (!email || resendBusy) return;
const wait = Math.ceil((resendAtRef.current + 60000 - Date.now()) / 1000);
if (wait > 0) {
setResendNote(`Yeni bir e-posta için ${wait} saniye bekle.`);
return;
}
setResendBusy(true);
setResendNote('');
const { error } = await runAuthRequest(() => supabase.auth.resend({
type: 'signup',
email,
options: { emailRedirectTo: LEGAL_URLS.verified },
}));
setResendBusy(false);
if (error) {
setResendNote(/rate|limit|seconds/i.test(error.message || '') ? 'Çok sık denendi. Biraz bekleyip tekrar dene.' : 'E-posta gönderilemedi. Biraz sonra tekrar dene.');
return;
}
resendAtRef.current = Date.now();
setResendNote('Doğrulama e-postası tekrar gönderildi. Spam / Gereksiz klasörüne de bak.');
};
const handleSignUp = async () => {
if (!authEmail.trim() || !authPassword) {
setAuthMessage('E-posta ve şifre gerekli.');
return;
}

if (!signupConsent) {
setAuthMessage('Devam etmek için 18 yaşından büyük olduğunu ve Kullanım Koşulları\'nı kabul ettiğini onaylamalısın.');
return;
}

if (authPassword.length < 8) {
setAuthMessage('Şifre en az 8 karakter olmalı.');
return;
}

setAuthLoading(true);
setAuthMessage('');

const { data: signUpData, error } = await runAuthRequest(() => supabase.auth.signUp({
email: authEmail.trim(),
password: authPassword,
options: {
emailRedirectTo: LEGAL_URLS.verified,
data: {
terms_version: LEGAL_VERSION,
terms_accepted_at: new Date().toISOString(),
privacy_notice_version: LEGAL_VERSION,
adult_confirmed: true,
},
},
}));



setAuthLoading(false);

if (error) {
setAuthMessage(tx('Hesap oluşturulamadı. Bilgileri kontrol edip tekrar dene.', 'Could not create the account. Check the details and try again.', 'Konto konnte nicht erstellt werden. Überprüfe die Angaben und versuche es erneut.'));
return;
}

// E-posta doğrulaması kapalıysa Supabase hemen oturum açar.
if (signUpData && signUpData.session) {
setShowAuthModal(false);
setAuthMessage('');
setVerifyEmail('');
return;
}

// Doğrulama gerekiyor: net yönlendirme göster, giriş moduna geç (e-posta yazılı kalır).
setVerifyEmail(authEmail.trim());
setResendNote('');
resendAtRef.current = Date.now();
setAuthPassword('');
setAuthMode('login');
setAuthMessage('');
};

const handleSignIn = async () => {
if (!authEmail.trim() || !authPassword) {
setAuthMessage('E-posta ve şifre gerekli.');
return;
}

setAuthLoading(true);
setAuthMessage('');

const { data, error } = await runAuthRequest(() => supabase.auth.signInWithPassword({
email: authEmail.trim(),
password: authPassword,
}));

setAuthLoading(false);

if (error) {
const msg = String(error.message || '');
if (error.code === 'email_not_confirmed' || /not confirmed/i.test(msg)) {
setVerifyEmail(authEmail.trim());
setResendNote('');
setAuthMessage('');
return;
}
if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
setAuthMessage('E-posta veya şifre hatalı.');
return;
}
setAuthMessage(tx('Giriş yapılamadı. Bağlantını kontrol edip tekrar dene.', 'Could not sign in. Check your connection and try again.', 'Anmeldung fehlgeschlagen. Prüfe die Verbindung und versuche es erneut.'));
return;
}

setShowAuthModal(false);
setAuthMessage('');
setVerifyEmail('');
};

const handleSignOut = async () => {
const currentUid = userIdRef.current;
const finishSignOut = async (allowUnresolved = false) => {
const tokenCleanup = await pushRegistrationQueueRef.current?.prepareSignOut(currentUid, {
requireToken: shoppingPlan?.delivery === 'push',
allowUnresolved,
});
if (currentUid !== userIdRef.current) {
pushRegistrationQueueRef.current?.cancelSignOut(currentUid);
return;
}
if (currentUid && !tokenCleanup?.ok) {
if (tokenCleanup.reason === 'registered-token' || tokenCleanup.reason === 'registration-check') {
Alert.alert(
tx('Bildirim bağlantısı doğrulanamadı', 'Push link could not be verified', 'Push-Verknüpfung konnte nicht geprüft werden'),
tx(
'Bu hesapta bir bildirim bağlantısı kalmış olabilir. Cihaz tokenı güvenle bulunamadığı için silmedim. Bildirim iznini açıp yeniden dene veya bağlantıyı temizlemeden çıkış yap.',
'A push link may remain on this account. I could not safely identify this device token, so I left it untouched. Re-enable notification permission and retry, or sign out while leaving the remote binding in place.',
'Für dieses Konto könnte eine Push-Verknüpfung bestehen. Das Gerätetoken ließ sich nicht sicher bestimmen und wurde deshalb nicht gelöscht. Aktiviere Mitteilungen und versuche es erneut oder melde dich ab, ohne die entfernte Verknüpfung zu entfernen.'
),
[
{ text: tx('Oturumda kal', 'Stay signed in', 'Angemeldet bleiben'), style: 'cancel' },
{ text: tx('Yine de çıkış yap', 'Sign out anyway', 'Trotzdem abmelden'), style: 'destructive', onPress: () => { void finishSignOut(true); } },
]
);
return;
}
setAuthMessage(tokenCleanup.reason === 'token'
? tx('Bildirim hesabı güvenli biçimde kaldırılamadı. Bildirim iznini açıp tekrar dene.', 'Could not safely remove this device’s notification link. Enable notifications and try again.', 'Die Geräteverknüpfung für Mitteilungen konnte nicht sicher entfernt werden. Aktiviere Mitteilungen und versuche es erneut.')
: tx('Oturum kapatılamadı. Tekrar dene.', 'Could not sign out. Please try again.', 'Abmeldung fehlgeschlagen. Bitte versuche es erneut.'));
return;
}
if (currentUid !== userIdRef.current) {
pushRegistrationQueueRef.current?.cancelSignOut(currentUid);
return;
}
const { error } = await runAuthRequest(() => supabase.auth.signOut());

if (error) {
pushRegistrationQueueRef.current?.cancelSignOut(currentUid);
setAuthMessage(tx('Oturum kapatılamadı. Tekrar dene.', 'Could not sign out. Please try again.', 'Abmeldung fehlgeschlagen. Bitte versuche es erneut.'));
return;
}
};
await finishSignOut();

};

const handleResetPassword = async () => {
if (!authEmail.trim()) {
setAuthMessage('Önce e-posta adresini yaz.');
return;
}

setAuthLoading(true);
setAuthMessage('');

const { error } = await runAuthRequest(() => supabase.auth.resetPasswordForEmail(
authEmail.trim()
));

setAuthLoading(false);

if (error) {
setAuthMessage(tx('Şifre sıfırlama isteği gönderilemedi. Tekrar dene.', 'Could not send the password-reset request. Please try again.', 'Die Anfrage zum Zurücksetzen des Passworts konnte nicht gesendet werden. Bitte versuche es erneut.'));
return;
}

setRecoveryCode('');
setRecoveryInfo('Doğrulama kodu e-posta adresine gönderildi.');
setAuthMode('recoveryCode');
};
/* ---------- şifre sıfırlama: e-postadaki kod ile ---------- */

const handleVerifyRecoveryCode = async () => {
const code = recoveryCode.replace(/\s/g, '');

if (!authEmail.trim()) {
setAuthMessage('E-posta adresi eksik. Lütfen baştan başla.');
return;
}

if (code.length < 6) {
setAuthMessage('E-postadaki kodu eksiksiz yaz.');
return;
}

setAuthLoading(true);
setAuthMessage('');
setRecoveryInfo('');

const { data, error } = await runAuthRequest(() => supabase.auth.verifyOtp({
email: authEmail.trim(),
token: code,
type: 'recovery',
}));

setAuthLoading(false);

if (error || !data?.session) {
setAuthMessage(tx('Kod doğrulanamadı. Süresi dolmuş veya hatalı olabilir. Yeni kod isteyebilirsin.', 'The code could not be verified. It may be invalid or expired; you can request a new one.', 'Der Code konnte nicht bestätigt werden. Er ist möglicherweise ungültig oder abgelaufen; du kannst einen neuen anfordern.'));
return;
}

setRecoveryCode('');
setNewPassword('');
setConfirmNewPassword('');
setAuthMessage('');
setIsPasswordRecovery(true);
};

const handleUpdatePassword = async () => {
if (newPassword.length < 8) {
setAuthMessage('Şifre en az 8 karakter olmalı.');
return;
}

if (newPassword !== confirmNewPassword) {
setAuthMessage('İki şifre birbiriyle aynı değil.');
return;
}

setAuthLoading(true);
setAuthMessage('');

const { error } = await runAuthRequest(() => supabase.auth.updateUser({ password: newPassword }));

setAuthLoading(false);

if (error) {
setAuthMessage(tx('Şifre güncellenemedi. Tekrar dene.', 'Could not update the password. Please try again.', 'Das Passwort konnte nicht aktualisiert werden. Bitte versuche es erneut.'));
return;
}

setNewPassword('');
setConfirmNewPassword('');
setAuthPassword('');
setAuthMessage('');
setRecoveryInfo('');
setAuthMode('login');
setIsPasswordRecovery(false);
setShowAuthModal(false);
showToast('Şifren güncellendi.');
};

const handleCancelRecovery = async () => {
if (isPasswordRecovery) {
// Kod doğrulandı ama yeni şifre belirlenmedi: geçici oturumu kapat.
const { error } = await runAuthRequest(() => supabase.auth.signOut());

if (error) {
setAuthMessage(tx('Oturum kapatılamadı. Tekrar dene.', 'Could not sign out. Please try again.', 'Abmeldung fehlgeschlagen. Bitte versuche es erneut.'));
return;
}

}

setIsPasswordRecovery(false);
setRecoveryCode('');
setNewPassword('');
setConfirmNewPassword('');
setAuthPassword('');
setAuthMessage('');
setRecoveryInfo('');
setAuthMode('login');
setShowAuthModal(false);
};

const dataScopeGenerationRef = useRef(0);
const activeDataScopeRef = useRef(null);
const activeDataScopeGenerationRef = useRef(null);
const isReadyDataScope = (generation) => isScopeGenerationReady(
generation,
dataScopeGenerationRef.current,
activeDataScopeGenerationRef.current
);
const renderDataScopeGeneration = dataScopeGenerationRef.current;
const saveInRenderedScope = createScopeBoundSave(
renderDataScopeGeneration,
isReadyDataScope,
(key, value) => saveValue(key, value)
);
useEffect(() => {
let mounted = true;
const activateSession = async (nextSession) => {
const owner = nextSession?.user?.id || null;
const nextScope = owner || 'guest';
let restoredShoppingPlan = null;
    let pendingDeletions = [];
    try {
      const keys = await AsyncStorage.getAllKeys();
      for (const key of keys.filter((value) => value.startsWith(PENDING_ACCOUNT_DELETION_PREFIX))) {
        try {
          const raw = await AsyncStorage.getItem(key);
          const pending = raw ? JSON.parse(raw) : null;
          if (pending?.owner && ['pending', 'remote_complete'].includes(pending?.state)) pendingDeletions.push(pending);
        } catch (error) { /* Ignore one damaged marker; keep all account data isolated. */ }
      }
    } catch (error) {
      pendingDeletions = [];
    }
    for (const pendingDeletion of pendingDeletions) {
      if (pendingDeletion.state !== 'remote_complete') {
        let operationCredential = null;
        try { operationCredential = await deletionReceiptStore.get(pendingDeletion.owner); } catch (error) { operationCredential = null; }
        if (!operationCredential) continue;
        let remoteStatus;
        try { remoteStatus = await getDeletionReceiptStatus(operationCredential); } catch (error) { remoteStatus = { state: 'unknown' }; }
        if (remoteStatus.state !== 'completed') continue;
        pendingDeletion.state = 'remote_complete';
        try { await AsyncStorage.setItem(accountDeletionKeyFor(pendingDeletion.owner), JSON.stringify(pendingDeletion)); } catch (error) { continue; }
      }
      if (owner !== pendingDeletion.owner) {
        try { await switchLocalDataScope(AsyncStorage, owner); } catch (error) { continue; }
      }
      const recovered = await deleteLocalAccountScope(AsyncStorage, pendingDeletion.owner, removeImage, [
        backupMetaKey(pendingDeletion.owner),
        imageCleanupKey(pendingDeletion.owner),
        preRestoreKey(pendingDeletion.owner),
        userNameKeyFor(pendingDeletion.owner),
        `PLAN_FEATURE_TRIALS:${pendingDeletion.owner}`,
      ]);
      if (recovered) {
        let receiptRemoved = false;
        try { await deletionReceiptStore.remove(pendingDeletion.owner); receiptRemoved = true; } catch (error) { /* Keep the marker until the capability is removed. */ }
        if (receiptRemoved) {
          try { await AsyncStorage.removeItem(accountDeletionKeyFor(pendingDeletion.owner)); } catch (error) { /* Retry on the next launch. */ }
        }
      }
      if (owner === pendingDeletion.owner) {
        try { await supabase.auth.signOut({ scope: 'local' }); } catch (error) { /* The account may already be gone. */ }
        setSession(null);
        setTasks([]);
        setDocuments([]);
        setSelectedDocumentId(null);
        setShoppingPlanState(null);
        setAuthChecking(false);
        setIsLoading(false);
        return;
      }
    }
if (activeDataScopeRef.current === nextScope && activeDataScopeGenerationRef.current === dataScopeGenerationRef.current) {
setSession(nextSession);
setAuthChecking(false);
return;
}
const generation = ++dataScopeGenerationRef.current;
if (shoppingSyncTimerRef.current) clearTimeout(shoppingSyncTimerRef.current);
shoppingSyncTimerRef.current = null;
setSession(null);
setAuthChecking(true);
setIsLoading(true);
setTasks([]);
setDocuments([]);
setTodayPreferences(DEFAULT_TODAY_PREFERENCES);
setSelectedDocumentId(null);
setAnalyzingId(null);
setShoppingPlanState(null);
setNotifPrefs(DEFAULT_NOTIF_PREFS);
setNotifLoaded(false);
tasksPersistBlockedRef.current = false;
try {
      await runLocalDataOperation(async () => {
        await syncTaskReminders({ tasks: [], prefs: DEFAULT_NOTIF_PREFS, lang });
        await cancelShoppingReminder();
      });
await switchLocalDataScope(AsyncStorage, owner);
const [savedLang, savedDark, savedTasks, savedDocs, savedPrefs, savedNotifPrefs, savedShoppingPlanRaw] = await Promise.all([
loadValue(STORAGE_KEYS.language, 'tr'),
loadValue(STORAGE_KEYS.darkTheme, false),
loadValueStrict(STORAGE_KEYS.tasks, []),
loadValueStrict(STORAGE_KEYS.documents, []),
loadValueStrict(STORAGE_KEYS.todayPreferences, DEFAULT_TODAY_PREFERENCES),
loadValueStrict(NOTIF_PREFS_KEY, DEFAULT_NOTIF_PREFS),
AsyncStorage.getItem(SHOPPING_PLAN_KEY),
]);
if (!mounted || generation !== dataScopeGenerationRef.current) return;
if (LANGUAGE_CODES.includes(savedLang)) setLang(savedLang);
setDark(savedDark === true);
if (savedTasks?.reason === 'read' || savedDocs?.reason === 'read' || savedPrefs?.reason === 'read' || savedNotifPrefs?.reason === 'read') tasksPersistBlockedRef.current = true;
if (savedTasks?.reason === 'corrupt' || savedDocs?.reason === 'corrupt') {
Alert.alert('PLAN', pick(savedLang,
'Kaydedilmiş veriler bozuk görünüyor; bozuk kayıtlar yedeklendi.',
'Stored data looked corrupt; a copy of the damaged records was saved.',
'Gespeicherte Daten waren beschädigt; eine Kopie der beschädigten Einträge wurde gesichert.'
));
}
if (savedTasks?.ok && Array.isArray(savedTasks.value)) setTasks(normalizeStoredTasks(savedTasks.value, OLD_DEMO_TASK_IDS));
if (savedDocs?.ok && Array.isArray(savedDocs.value)) setDocuments(savedDocs.value.filter(Boolean));
if (savedPrefs?.ok && savedPrefs.value && typeof savedPrefs.value === 'object') setTodayPreferences({ ...DEFAULT_TODAY_PREFERENCES, ...savedPrefs.value });
if (savedNotifPrefs?.ok) setNotifPrefs(normalizeNotifPrefs(savedNotifPrefs.value));
const permissionState = await getPermissionState();
if (!mounted || generation !== dataScopeGenerationRef.current) return;
setNotifPermission(permissionState);
setNotifLoaded(true);
try {
const plan = savedShoppingPlanRaw ? JSON.parse(savedShoppingPlanRaw) : null;
if (plan && plan.shopDate && plan.shopDate >= istanbulTodayISO()) {
  restoredShoppingPlan = plan;
  setShoppingPlanState(plan);
}
} catch (error) { console.log('PLAN shopping plan read failed:', 'corrupt'); }
activeDataScopeRef.current = nextScope;
activeDataScopeGenerationRef.current = generation;
if (restoredShoppingPlan?.delivery === 'local') {
  void runScopeBoundOperation(generation, isReadyDataScope, () => restoreLocalShoppingReminder({
    plan: restoredShoppingPlan,
    permission: permissionState,
    supported: notificationsSupported,
    isCurrent: () => isReadyDataScope(generation),
    schedule: scheduleShoppingReminder,
    cancel: cancelShoppingReminder,
  })).catch(() => {});
}
setSession(nextSession);
setAuthChecking(false);
setIsLoading(false);
} catch (error) {
if (!mounted || generation !== dataScopeGenerationRef.current) return;
tasksPersistBlockedRef.current = true;
setAuthChecking(false);
setIsLoading(false);
console.log('PLAN local account isolation failed');
Alert.alert('BAKPLANLA', pick(lang,
'Cihaz verileri güvenli biçimde ayrılamadı. Verilerini korumak için hesabın açılmadı. Uygulamayı yeniden başlatıp tekrar dene.',
'Device data could not be safely separated. Your account was not opened to protect your data. Restart the app and try again.',
'Gerätedaten konnten nicht sicher getrennt werden. Zum Schutz deiner Daten wurde das Konto nicht geöffnet. Starte die App neu und versuche es erneut.'
));
}
};

const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
if (event === 'PASSWORD_RECOVERY') {
setIsPasswordRecovery(true);
setShowAuthModal(true);
}
void activateSession(nextSession);
});
return () => {
mounted = false;
dataScopeGenerationRef.current += 1;
authListener?.subscription?.unsubscribe();
};
}, []);


const [documents, setDocuments] = useState([]);
const [tasks, setTasks] = useState([]);
const [todayPreferences, setTodayPreferences] = useState(DEFAULT_TODAY_PREFERENCES);

const [selectedDocumentId, setSelectedDocumentId] = useState(null);
const [analyzingId, setAnalyzingId] = useState(null);
const [documentAnalysisInFlight, setDocumentAnalysisInFlight] = useState(false);
const analyzeInFlightRef = useRef(false);
const [calendarMode, setCalendarMode] = useState('calendar');

const [showAddSheet, setShowAddSheet] = useState(false);
const [showAppearanceModal, setShowAppearanceModal] = useState(false);
const [showPlanModal, setShowPlanModal] = useState(false);
const [taskModal, setTaskModal] = useState(null);

const [toastMessage, setToastMessage] = useState('');
const toastTimer = useRef(null);
// Görev kaydı: çift dokunmada yinelenen kayıt oluşmasın; okunamayan görev verisi boş listeyle ezilmesin.
const taskSaveInFlightRef = useRef(false);
const tasksPersistBlockedRef = useRef(false);

const screen = stack[stack.length - 1];
const canGoBack = stack.length > 1;

const tx = (trText, enText, deText) => pick(lang, trText, enText, deText);
const c = useMemo(() => ({ ...BRAND, ...(dark ? DARK : LIGHT) }), [dark]);
const s = useMemo(() => makeStyles(c), [c]);
const lifeScore = useMemo(() => computeLifeScore(tasks, documents, today), [tasks, documents, today]);

/* ---------- gezinme ---------- */

const navigate = (to) => setStack((cur) => (cur[cur.length - 1] === to ? cur : [...cur, to]));
const goTab = (to) => setStack([to]);
const goBack = () => setStack((cur) => (cur.length > 1 ? cur.slice(0, -1) : cur));

/* ---------- toast ---------- */

const showToast = (message) => {
setToastMessage(message);
if (toastTimer.current) clearTimeout(toastTimer.current);
toastTimer.current = setTimeout(() => setToastMessage(''), 2200);
};

const showSoon = () => showToast(tx('Bu özellik yakında.', 'Coming soon.', 'Bald verfügbar.'));

useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

/* ---------- ilk yükleme ---------- */

useEffect(() => {
const init = async () => {
try {
const [savedLang, savedDark] = await Promise.all([
loadValue(STORAGE_KEYS.language, 'tr'),
loadValue(STORAGE_KEYS.darkTheme, false),
]);

if (LANGUAGE_CODES.includes(savedLang)) setLang(savedLang);
setDark(savedDark === true);

} catch (error) {
console.log('PLAN init failed');
}
};
init();
}, []);

/* ---------- kalıcı kayıt ---------- */

useEffect(() => {
if (isLoading || tasksPersistBlockedRef.current) return;
saveInRenderedScope(STORAGE_KEYS.tasks, tasks).then((ok) => {
if (!ok) {
showToast(
tx(
'Görevler cihaza kaydedilemedi. Depolama alanını kontrol et.',
'Tasks could not be saved to the device. Check your storage.',
'Aufgaben konnten nicht auf dem Gerät gespeichert werden. Prüfe den Speicher.'
)
);
}
});
}, [tasks, isLoading, renderDataScopeGeneration]);

useEffect(() => {
if (!isLoading && !tasksPersistBlockedRef.current) saveInRenderedScope(STORAGE_KEYS.documents, documents);
}, [documents, isLoading, renderDataScopeGeneration]);

useEffect(() => {
if (!isLoading && !tasksPersistBlockedRef.current) saveInRenderedScope(STORAGE_KEYS.todayPreferences, todayPreferences);
}, [todayPreferences, isLoading, renderDataScopeGeneration]);

/* ---------- gün değişimi ---------- */

useEffect(() => {
const refresh = () => setToday(getTodayISO());
const sub = AppState.addEventListener('change', (state) => {
if (state === 'active') refresh();
});
const interval = setInterval(refresh, 60 * 1000);
return () => {
sub.remove();
clearInterval(interval);
};
}, []);

/* ---------- Android geri tuşu ---------- */

useEffect(() => {
const sub = BackHandler.addEventListener('hardwareBackPress', () => {
if (stack.length > 1) {
setStack((cur) => cur.slice(0, -1));
return true;
}
return false;
});
return () => sub.remove();
}, [stack]);

/* ---------- dil / tema / isim ---------- */

const changeLanguage = async (code) => {
setLang(code);
await saveValue(STORAGE_KEYS.language, code);
};

const toggleDarkTheme = async (value) => {
const next = typeof value === 'boolean' ? value : !dark;
setDark(next);
await saveValue(STORAGE_KEYS.darkTheme, next);
};

const userId = session?.user?.id || null;
const userIdRef = useRef(userId);
userIdRef.current = userId;
const pushRegistrationQueueRef = useRef(null);
const nameSaveInFlightRef = useRef(false);

// Ad bilgisi oturum açan hesaba göre yüklenir; hesap değişince önceki hesabın adı gösterilmez.
useEffect(() => {
let cancelled = false;
setUserName('');
if (!userId) return undefined;
const loadName = async () => {
const key = userNameKeyFor(userId);
let name = await loadValue(key, '');
if (typeof name !== 'string') name = '';
let canClearLegacy = !!name;
if (!name) {
const meta = session?.user?.user_metadata?.full_name;
if (typeof meta === 'string' && validateDisplayName(meta).ok) {
name = validateDisplayName(meta).value;
} else {
// Eski sürümde tek ortak anahtarla saklanan ad, bu cihazda ilk giriş yapan hesaba bir kez taşınır.
const legacy = await loadValue(STORAGE_KEYS.userName, '');
if (typeof legacy === 'string' && legacy.trim()) name = legacy.trim().slice(0, USER_NAME_MAX);
}
if (name) canClearLegacy = await saveValue(key, name);
}
if (canClearLegacy) {
try { await AsyncStorage.removeItem(STORAGE_KEYS.userName); } catch (error) { /* sessizce geç */ }
}
if (!cancelled) setUserName(name);
};
loadName();
return () => { cancelled = true; };
}, [userId]);

// Sonuç: { ok, reason?, synced? }. Önce cihaza kaydedilir; hesap (Supabase auth) senkronu ek ve en iyi çabadır.
const saveUserName = async (name) => {
if (!userId) return { ok: false, reason: 'auth' };
if (nameSaveInFlightRef.current) return { ok: false, reason: 'busy' };
const check = validateDisplayName(name);
if (!check.ok) return { ok: false, reason: check.reason };
nameSaveInFlightRef.current = true;
try {
const saved = await saveValue(userNameKeyFor(userId), check.value);
if (!saved) return { ok: false, reason: 'storage' };
if (userIdRef.current !== userId) return { ok: true, synced: false };
setUserName(check.value);
let synced = false;
try {
const { error } = await supabase.auth.updateUser({ data: { full_name: check.value } });
synced = !error;
} catch (error) {
synced = false;
}
return { ok: true, synced };
} finally {
nameSaveInFlightRef.current = false;
}
};

/* ---------- bu cihazın kimliği (QR Merkezi / cihaz listesi için) ----------
   Yalnızca bu cihazda üretilir ve saklanır; kişisel bilgi içermez. */

const [deviceId, setDeviceId] = useState(null);
const deviceName = useMemo(
() => `${describePlatform(Platform.OS)}${Platform.OS === 'web' ? '' : ''}`,
[]
);

useEffect(() => {
let cancelled = false;
const ensureDeviceId = async () => {
let id = await loadValue(DEVICE_ID_KEY, null);
if (typeof id !== 'string' || !id) {
id = makeDeviceId();
await saveValue(DEVICE_ID_KEY, id);
}
if (!cancelled) setDeviceId(id);
};
ensureDeviceId();
return () => { cancelled = true; };
}, []);

/* ---------- Pro yetkisi ve ücretsiz kullanım hakları ----------
   Pro yetkisi yalnızca sunucudaki kayıttan okunur (supabase/bakplanla_pro.sql). Gerçek ödeme
   altyapısı bağlı olmadığı için hiçbir hesap kendiliğinden Pro olmaz. */

const [entitlement, setEntitlement] = useState({ state: 'idle', row: null, reason: null });
const entitlementRowRef = useRef(null);
entitlementRowRef.current = entitlement.row;

const refreshEntitlement = async () => {
const uid = userIdRef.current;
if (!uid) {
setEntitlement({ state: 'idle', row: null, reason: null });
return;
}
setEntitlement((cur) => ({ ...cur, state: 'loading' }));
const res = await fetchEntitlement(supabase, uid);
if (userIdRef.current !== uid) return;
setEntitlement(res.ok ? { state: 'ready', row: res.row, reason: null } : { state: 'error', row: null, reason: res.reason });
};

useEffect(() => {
refreshEntitlement();
}, [userId]);

const proActive = isProActive(entitlement.row);
const proInfo = describeEntitlement(entitlement.row);

const featureGateRef = useRef(null);
featureGateRef.current = createFeatureGate({
supabase,
getUid: () => userIdRef.current,
});
// Dönüş, yalnızca UI önizlemesidir; atomik trial kararı smart-endpoint'te verilir.
const gateFeature = (feature) => featureGateRef.current(feature);

const showGateBlocked = (gate, featureLabel) => {
if (gate.mode === 'blocked') {
Alert.alert(
'BAKPLANLA Pro',
tx(
`${featureLabel} için ücretsiz kullanım hakkını kullandın. Devam etmek için BAKPLANLA Pro'ya geçebilirsin.`,
`You have used your free use of ${featureLabel}. You can upgrade to BAKPLANLA Pro to continue.`,
`Du hast deine kostenlose Nutzung von ${featureLabel} verbraucht. Mit BAKPLANLA Pro kannst du weitermachen.`
),
[
{ text: tx('Pro’ya Bak', 'See Pro', 'Pro ansehen'), onPress: () => navigate('pro') },
{ text: tx('Tamam', 'OK', 'OK'), style: 'cancel' },
]
);
return;
}
Alert.alert('BAKPLANLA', backupErrorText(tx, gate.mode === 'auth' ? 'auth' : gate.reason || 'other'));
};

/* ---------- bildirimler (cihaz içi hatırlatmalar) ---------- */

const [notifPrefs, setNotifPrefs] = useState(DEFAULT_NOTIF_PREFS);
const [notifLoaded, setNotifLoaded] = useState(false);
const [notifPermission, setNotifPermission] = useState('undetermined');

// Görevler okunamadıysa (boş liste) mevcut hatırlatmalar silinmesin.
useEffect(() => {
if (isLoading || !notifLoaded || tasksPersistBlockedRef.current) return;
initNotifications();
void runScopeBoundOperation(renderDataScopeGeneration, isReadyDataScope, () => syncTaskReminders({ tasks, prefs: notifPrefs, lang }));
}, [tasks, notifPrefs, lang, isLoading, notifLoaded, notifPermission, renderDataScopeGeneration]);

const refreshNotifPermission = async () => setNotifPermission(await getPermissionState());

const updateNotifPrefs = async (patch) => {
if (!isReadyDataScope(renderDataScopeGeneration)) return;
const next = normalizeNotifPrefs({ ...notifPrefs, ...patch });
setNotifPrefs(next);
const ok = await saveInRenderedScope(NOTIF_PREFS_KEY, next);
if (!isReadyDataScope(renderDataScopeGeneration)) return;
if (!ok) showToast(tx('Bildirim ayarı kaydedilemedi.', 'The notification setting could not be saved.', 'Die Benachrichtigungseinstellung konnte nicht gespeichert werden.'));
};

const toggleTaskReminders = async (on) => {
if (!on) {
await updateNotifPrefs({ taskReminders: false });
return;
}
if (!notificationsSupported) {
Alert.alert('BAKPLANLA', tx('Bildirimler bu cihazda (web) desteklenmiyor. Android veya iOS uygulamasında çalışır.', 'Notifications are not supported on this device (web). They work in the Android or iOS app.', 'Benachrichtigungen werden auf diesem Gerät (Web) nicht unterstützt. Sie funktionieren in der Android- oder iOS-App.'));
return;
}
let perm = await getPermissionState();
if (perm !== 'granted') perm = await requestPermission();
setNotifPermission(perm);
if (perm !== 'granted') {
Alert.alert(
'BAKPLANLA',
tx('Hatırlatma için bildirim izni gerekiyor. İzni telefonun ayarlarından açabilirsin.', 'Notification permission is required for reminders. You can enable it in your phone settings.', 'Für Erinnerungen wird die Benachrichtigungsberechtigung benötigt. Du kannst sie in den Telefoneinstellungen aktivieren.'),
[
{ text: tx('Ayarlar', 'Settings', 'Einstellungen'), onPress: openSystemSettings },
{ text: tx('Tamam', 'OK', 'OK'), style: 'cancel' },
]
);
return;
}
await updateNotifPrefs({ taskReminders: true });
};

const sendTestNotif = async () => {
const r = await sendTestNotification({
title: 'BAKPLANLA',
body: tx('Test: bildirimler çalışıyor.', 'Test: notifications are working.', 'Test: Benachrichtigungen funktionieren.'),
seconds: 5,
});
showToast(
r.ok
? tx('5 saniye içinde bir test bildirimi gelecek.', 'A test notification will arrive in 5 seconds.', 'In 5 Sekunden kommt eine Testbenachrichtigung.')
: r.reason === 'permission'
? tx('Önce bildirim izni ver.', 'Grant notification permission first.', 'Erteile zuerst die Benachrichtigungsberechtigung.')
: tx('Test bildirimi gönderilemedi.', 'The test notification could not be sent.', 'Die Testbenachrichtigung konnte nicht gesendet werden.')
);
};

/* ---------- belgeler ---------- */

const addDocument = (partial) => {
const now = new Date().toISOString();
const doc = {
id: createId('document'),
title: partial.title || tx('Yeni Belge', 'New Document', 'Neues Dokument'),
type: partial.type || 'manual',
uri: partial.uri || null,
createdAt: now,
updatedAt: now,
analyzed: false,
status: 'new',
notes: '',
analysis: null,
};
setDocuments((cur) => [doc, ...cur]);
setSelectedDocumentId(doc.id);
navigate('documentDetail');
};

const updateDocument = (id, updates, expectedGeneration = dataScopeGenerationRef.current) => {
if (!isReadyDataScope(expectedGeneration)) return { stale: true };
setDocuments((cur) => isReadyDataScope(expectedGeneration)
? cur.map((d) => (d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d))
: cur);
return { stale: false };
};

/* Akıllı Alışveriş'te okunan fiş Belgeler'e "Alışveriş fişi" olarak düşer (analiz edilmiş halde).
   Aynı fiş (mağaza + şube + tarih + saat + toplam) zaten varsa ikinci kez eklenmez. */
const addReceiptDocument = (receipt, uri, expectedGeneration = dataScopeGenerationRef.current) => {
if (!isReadyDataScope(expectedGeneration)) return { stale: true };
const fp = receiptFingerprint(receipt);
const existing = documents.find((d) => isReceiptDoc(d) && receiptFingerprint(d.analysis.receipt) === fp);
if (existing) return { duplicate: true, id: existing.id };
const now = new Date().toISOString();
const doc = {
id: createId('document'),
title: receiptTitle(receipt),
type: 'receipt',
uri: uri || null,
createdAt: now,
updatedAt: now,
analyzed: true,
status: 'analyzed',
notes: '',
analysis: receiptAnalysis(receipt),
};
setDocuments((cur) => [doc, ...cur]);
return { duplicate: false, id: doc.id };
};

// Onay penceresi Belge Detay ekranında zaten gösteriliyor; burada tekrar sorulmaz.
const deleteDocument = (id, expectedGeneration = dataScopeGenerationRef.current) => {
if (!isReadyDataScope(expectedGeneration)) return { stale: true };
const doc = documents.find((d) => d.id === id);
if (doc) removeImage(doc.uri);
setDocuments((cur) => isReadyDataScope(expectedGeneration) ? cur.filter((d) => d.id !== id) : cur);
setSelectedDocumentId(null);
goTab('documents');
return { stale: false };
};

const openDocument = (id) => {
setSelectedDocumentId(id);
navigate('documentDetail');
};

const openAddSheet = () => setShowAddSheet(true);

const pickFromGallery = async () => {
try {
const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
if (!permission.granted) {
Alert.alert('PLAN', tx('Galeri izni gerekiyor.', 'Gallery permission is required.', 'Galeriezugriff ist erforderlich.'));
return;
}
const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
if (result.canceled || !result.assets || !result.assets.length) return;
const uri = await persistImage(result.assets[0].uri);
addDocument({ title: tx('Yeni Belge', 'New Document', 'Neues Dokument'), type: 'image', uri });
} catch (error) {
console.log('Gallery operation failed');
Alert.alert('PLAN', tx('Görsel seçilemedi.', 'The image could not be selected.', 'Das Bild konnte nicht ausgewählt werden.'));
}
};

const pickFromCamera = async () => {
try {
const permission = await ImagePicker.requestCameraPermissionsAsync();
if (!permission.granted) {
Alert.alert('PLAN', tx('Kamera izni gerekiyor.', 'Camera permission is required.', 'Kamerazugriff ist erforderlich.'));
return;
}
const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 });
if (result.canceled || !result.assets || !result.assets.length) return;
const uri = await persistImage(result.assets[0].uri);
addDocument({ title: tx('Taranan Belge', 'Scanned Document', 'Gescanntes Dokument'), type: 'scan', uri });
} catch (error) {
console.log('Camera operation failed');
Alert.alert('PLAN', tx('Belge taranamadı.', 'The document could not be scanned.', 'Das Dokument konnte nicht gescannt werden.'));
}
};

const addManualDocument = () => addDocument({ type: 'manual' });

const analyzeDocument = async (id, expectedGeneration = dataScopeGenerationRef.current) => {
// Zaten bir analiz sürüyorsa ikinci isteği gönderme (çift dokunma / yarışan istekler).
if (!isReadyDataScope(expectedGeneration) || analyzeInFlightRef.current || isLoading) return;
const requestScopeGeneration = expectedGeneration;
const isCurrent = () => isReadyDataScope(requestScopeGeneration);
analyzeInFlightRef.current = true;
setAnalyzingId(id);
setDocumentAnalysisInFlight(true);

const markFeatureUsedForScope = async (featureKey) => {
if (!isCurrent()) return false;
const usage = await loadValue(STORAGE_KEYS.featureUsage, {});
if (!isCurrent()) return false;
const saveScoped = createScopeBoundSave(requestScopeGeneration, () => isCurrent(), (key, value) => saveValue(key, value));
return saveScoped(STORAGE_KEYS.featureUsage, { ...usage, [featureKey]: true });
};

/* Ücretsiz kullanım hakkı sunucuda (bakplanla_pro.sql) tutulur; sunucu kurulu değilse
   cihaz sayacına düşer. Analiz başarısız olursa hak iade edilir (aşağıdaki catch). */
let gate = null;

try {
gate = await gateFeature('documentAnalysis');
if (!isCurrent()) return;
if (!gate.allowed) {
showGateBlocked(gate, tx('Belge Analizi', 'Document Analysis', 'Dokumentenanalyse'));
return;
}

const document = documents.find((item) => item.id === id);

if (!document || !document.uri) {
throw makeSmartError(
'local',
null,
tx('Belge görseli bulunamadı.', 'The document image was not found.', 'Das Dokumentbild wurde nicht gefunden.')
);
}

let base64Image;
try {
const imageResponse = await fetch(document.uri);
const imageBlob = await imageResponse.blob();

base64Image = await new Promise((resolve, reject) => {
const reader = new FileReader();

reader.onloadend = () => {
if (typeof reader.result !== 'string') {
reject(new Error('Belge görseli okunamadı.'));
return;
}

resolve(reader.result);
};

reader.onerror = () => {
reject(new Error('Belge görseli dönüştürülemedi.'));
};

reader.readAsDataURL(imageBlob);
});
} catch (readError) {
throw makeSmartError(
'local',
null,
tx(
'Belge görseli okunamadı. Görsel silinmiş olabilir; belgeyi yeniden eklemeyi dene.',
'The document image could not be read. It may have been deleted; try adding the document again.',
'Das Dokumentbild konnte nicht gelesen werden. Es wurde evtl. gelöscht; füge das Dokument erneut hinzu.'
)
);
}

if (!isCurrent()) {
return;
}

const data = await callSmartJson({
image: base64Image,
}, isCurrent);

if (!isCurrent()) {
return;
}

if (!data.analysis || typeof data.analysis !== 'object' || Array.isArray(data.analysis)) {
// Sahte "başarılı" analiz üretme: yanıtta analiz yoksa bu bir hatadır ve ücretsiz hak harcanmaz.
if (typeof data.error === 'string' && data.error.trim()) {
throw makeSmartError('http', null, data.error.trim().slice(0, 200));
}
throw makeSmartError('format');
}

// Beklenmeyen tipteki alanlar (nesne, dizi vb.) metne "[object Object]" olarak basılmasın diye ayıklanır.
const rawAnalysis = data.analysis;
const ai = {};
[
'document_type', 'title', 'product_name', 'date', 'purchase_date', 'amount', 'currency',
'payment_deadline', 'return_period', 'warranty_period', 'important_deadline', 'required_action',
].forEach((key) => {
const value = rawAnalysis[key];
ai[key] =
typeof value === 'string'
? value.trim() || null
: typeof value === 'number' && Number.isFinite(value)
? value
: null;
});
ai.urgency = typeof rawAnalysis.urgency === 'string' && rawAnalysis.urgency ? rawAnalysis.urgency : 'low';

const summaryParts = [];

if (ai.document_type) {
summaryParts.push(`Belge türü: ${ai.document_type}`);
}

if (ai.title) {
summaryParts.push(`Başlık: ${ai.title}`);
}

if (ai.product_name) {
summaryParts.push(`Ürün/Hizmet: ${ai.product_name}`);
}

if (ai.date) {
summaryParts.push(`Tarih: ${ai.date}`);
}

if (ai.purchase_date) {
summaryParts.push(
`Satın alma tarihi: ${ai.purchase_date}`
);
}

if (ai.amount !== null && ai.amount !== undefined) {
summaryParts.push(
`Tutar: ${ai.amount}${ai.currency ? ` ${ai.currency}` : ''}`
);
}

if (ai.payment_deadline) {
summaryParts.push(
`Son ödeme tarihi: ${ai.payment_deadline}`
);
}

if (ai.return_period) {
summaryParts.push(`İade süresi: ${ai.return_period}`);
}

if (ai.warranty_period) {
summaryParts.push(`Garanti süresi: ${ai.warranty_period}`);
}

if (ai.important_deadline) {
summaryParts.push(
`Önemli son tarih: ${ai.important_deadline}`
);
}

if (ai.required_action) {
summaryParts.push(
`Yapılması gereken: ${ai.required_action}`
);
}

if (!summaryParts.length) {
summaryParts.push(
'Belge analiz edildi ancak okunabilir bilgi bulunamadı.'
);
}

const actions = [];

if (ai.required_action) {
actions.push(ai.required_action);
}

if (ai.payment_deadline) {
actions.push(
`Son ödeme tarihini takip et: ${ai.payment_deadline}`
);
}

if (ai.return_period) {
actions.push(
`İade süresini kontrol et: ${ai.return_period}`
);
}

if (ai.warranty_period) {
actions.push(
`Garanti süresini sakla: ${ai.warranty_period}`
);
}

if (!actions.length) {
actions.push('Belge bilgilerini kontrol et.');
}

// Fiş Belgeler'den yüklendiyse: Akıllı Alışveriş'teki fiş kaydıyla aynı yapı kullanılır
// (ürün ürün market, şube, adet ve fiyat). Böylece PLAN AI ve Fırsat Motoru ürünleri görür.
const receiptData = normalizeReceipt(rawAnalysis.receipt);
if (receiptData) {
const defaultTitles = ['Yeni Belge', 'New Document', 'Neues Dokument', 'Taranan Belge', 'Scanned Document', 'Gescanntes Dokument'];
updateDocument(id, {
analyzed: true,
status: 'analyzed',
analysis: receiptAnalysis(receiptData),
...(defaultTitles.includes(document.title) ? { title: receiptTitle(receiptData) } : {}),
}, requestScopeGeneration);
if (!isCurrent()) return;
await markFeatureUsedForScope('documentAnalysis');
if (!isCurrent()) return;
if (gate && gate.mode === 'trial') {
showToast(tx('Ücretsiz belge analizi hakkını kullandın.', 'You have used your free document analysis.', 'Du hast deine kostenlose Dokumentenanalyse genutzt.'));
}
// Fişin ürünleri Akıllı Alışveriş listesine de eklenir; aktif alışveriş planı varsa o da güncellenir.
try {
const rawList = await AsyncStorage.getItem('PLAN_SHOPPING_LIST_V1');
if (!isCurrent()) return;
const savedList = rawList ? JSON.parse(rawList) : null;
const merged = mergeReceiptIntoList(savedList && Array.isArray(savedList.items) ? savedList.items : [], receiptData, (i) => `${Date.now()}-${i}`);
const saveScoped = createScopeBoundSave(requestScopeGeneration, () => isCurrent(), (key, value) => AsyncStorage.setItem(key, value));
await saveScoped('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: merged.items, version: 2 }));
if (!isCurrent()) return;
refreshShoppingPlanItems(merged.items, requestScopeGeneration);
} catch (listError) {
if (!isCurrent()) return;
console.log('Receipt items could not be added to the shopping list');
}
if (!isCurrent()) return;
showToast(tx(
`Fiş okundu: ${receiptData.items.length} ürün. Ürünler alışveriş listene eklendi.`,
`Receipt read: ${receiptData.items.length} items, added to your shopping list.`,
`Kassenbon gelesen: ${receiptData.items.length} Artikel, zur Einkaufsliste hinzugefügt.`
));
return;
}

const analysis = {
demo: false,
createdAt: new Date().toISOString(),
summary: summaryParts.join('\n'),
actions,
document_type: ai.document_type ?? null,
title: ai.title ?? null,
product_name: ai.product_name ?? null,
date: ai.date ?? null,
purchase_date: ai.purchase_date ?? null,
amount: ai.amount ?? null,
currency: ai.currency ?? null,
payment_deadline: ai.payment_deadline ?? null,
return_period: ai.return_period ?? null,
warranty_period: ai.warranty_period ?? null,
important_deadline: ai.important_deadline ?? null,
required_action: ai.required_action ?? null,
urgency: ai.urgency ?? 'low',
};

updateDocument(id, {
analyzed: true,
status: 'analyzed',
analysis,
}, requestScopeGeneration);
if (!isCurrent()) return;
// Eski sürümlerle uyum: cihazdaki eski sayaç da işaretlenir.
await markFeatureUsedForScope('documentAnalysis');
if (!isCurrent()) return;
if (gate && gate.mode === 'trial') {
showToast(tx('Ücretsiz belge analizi hakkını kullandın.', 'You have used your free document analysis.', 'Du hast deine kostenlose Dokumentenanalyse genutzt.'));
}
showToast(
tx(
'Belge AI ile analiz edildi.',
'Document analyzed with AI.',
'Dokument wurde mit KI analysiert.'
)
);
} catch (error) {
if (!isCurrent()) return;
logSmartError('Analysis error:', error);

if (error?.kind === 'featureTrial') {
showGateBlocked({ mode: 'blocked' }, tx('Belge Analizi', 'Document Analysis', 'Dokumentenanalyse'));
return;
}

Alert.alert(
'PLAN',
smartErrorMessage(error, lang, {
tr: 'Belge analiz edilemedi.',
en: 'The document could not be analyzed.',
de: 'Das Dokument konnte nicht analysiert werden.',
})
);
} finally {
analyzeInFlightRef.current = false;
setDocumentAnalysisInFlight(false);
if (isCurrent()) setAnalyzingId(null);
}
};

const createTaskFromDocument = (doc, action, expectedGeneration = dataScopeGenerationRef.current) => {
if (!doc || !isReadyDataScope(expectedGeneration)) return { stale: true };
const base = doc.title || tx('Belge', 'Document', 'Dokument');
const next = { taskId: null, title: action ? `${base}: ${action}` : base, date: today };
setTaskModal((current) => isReadyDataScope(expectedGeneration) ? next : current);
return { stale: false };
};

/* ---------- görevler ---------- */

const openNewTask = (date) =>
setTaskModal({ taskId: null, title: '', date: typeof date === 'string' && isValidISO(date) ? date : today });

const openTask = (task) => setTaskModal({ taskId: task.id, title: task.title, date: task.dueDate });

const openTasksList = () => {
openCalendarList(setCalendarMode, goTab);
};

const saveTask = async () => {
const result = await persistTaskDraft({
taskModal,
tasks,
isLoading,
saveLock: taskSaveInFlightRef,
getScopeGeneration: () => dataScopeGenerationRef.current,
isPersistenceBlocked: () => tasksPersistBlockedRef.current,
  saveTasks: (nextTasks) => saveInRenderedScope(STORAGE_KEYS.tasks, nextTasks),
normalizeDate: normalizeDateInput,
normalizeTitle: normalizeTaskTitle,
createId,
now: () => new Date().toISOString(),
});

if (result.status === 'ignored' || result.status === 'stale') return;
if (result.status === 'invalid' && result.field === 'title') {
Alert.alert('PLAN', tx('Lütfen bir görev gir.', 'Please enter a task.', 'Bitte gib eine Aufgabe ein.'));
return;
}
if (result.status === 'invalid' && result.field === 'date') {
Alert.alert('PLAN', tx('Lütfen bir tarih gir.', 'Please enter a date.', 'Bitte gib ein Datum ein.'));
return;
}
if (result.status === 'invalid-date') {
Alert.alert(
'PLAN',
tx('Geçerli bir tarih gir: YYYY-AA-GG biçiminde (örn. 2026-10-05).', 'Enter a valid date in YYYY-MM-DD format (e.g. 2026-10-05).', 'Gib ein gültiges Datum im Format JJJJ-MM-TT ein (z. B. 2026-10-05).')
);
return;
}
if (result.status === 'duplicate') {
Alert.alert('PLAN', tx('Bu tarihte aynı görev zaten var.', 'The same task already exists on this date.', 'Dieselbe Aufgabe existiert an diesem Datum bereits.'));
return;
}
if (result.status === 'missing') {
Alert.alert('PLAN', tx('Bu görev artık mevcut değil.', 'This task no longer exists.', 'Diese Aufgabe existiert nicht mehr.'));
setTaskModal(null);
return;
}
if (result.status === 'storage') {
Alert.alert(
'PLAN',
tx(
'Görev kaydedilemedi. Depolama alanını kontrol edip tekrar dene.',
'The task could not be saved. Check your storage and try again.',
'Die Aufgabe konnte nicht gespeichert werden. Prüfe den Speicher und versuche es erneut.'
)
);
return;
}

// The task module persists first; App retains the active owner-scoped React state.
if (result.editingId) {
setTasks((cur) => cur.map((task) => (task.id === result.editingId ? { ...task, title: result.title, dueDate: result.date } : task)));
} else {
setTasks((cur) => (cur.some((task) => task.id === result.newTask.id) ? cur : [result.newTask, ...cur]));
}
setTaskModal(null);
showToast(tx('Görev kaydedildi.', 'Task saved.', 'Aufgabe gespeichert.'));
};

const toggleTask = (id) => {
toggleTaskRecord({ id, tasks, setTasks, cancelReminder: cancelAiReminder, scheduleReminder: scheduleAiReminder });
};
const deleteTask = (id) => {
deleteTaskRecord({ id, setTasks, cancelReminder: cancelAiReminder });
};

/* PLAN AI HATIRLATMASI (25 Ekim): yapay zekâ cevabındaki { title, body, at } →
   Takvim'e görev + o dakikaya telefonda bildirim. Görev kaydedilemezse bildirim de kurulmaz. */
const createAiReminder = async (reminder, expectedGeneration = dataScopeGenerationRef.current) => {
const isCurrent = isReadyDataScope;
if (!isCurrent(expectedGeneration)) return { ok: false, reason: 'stale' };
return createReminderTask({
reminder,
tasks,
isPersistenceBlocked: () => tasksPersistBlockedRef.current,
saveTasks: createScopeBoundSave(expectedGeneration, isCurrent, (key, value) => saveValue(key, value)),
setTasks: (update) => setTasks((current) => isCurrent(expectedGeneration) ? update(current) : current),
createId,
toISO,
scheduleReminder: scheduleAiReminder,
onPermission: setNotifPermission,
fallbackTitle: tx('Hatırlatma', 'Reminder', 'Erinnerung'),
isCurrent: () => isCurrent(expectedGeneration),
});
};

/* ---------- alışveriş planı (27 Ekim) ---------- */

// Plan cihazda (anında gösterim) ve giriş yapılmışsa sunucuda tutulur. Geçmiş plan otomatik düşer.
const [shoppingPlan, setShoppingPlanState] = useState(null);
const shoppingSyncTimerRef = useRef(null);
const shoppingPlanMutationRevisionRef = useRef(new Map());

const readShoppingItems = async () => {
try {
const raw = await AsyncStorage.getItem('PLAN_SHOPPING_LIST_V1');
const saved = raw ? JSON.parse(raw) : null;
return saved && Array.isArray(saved.items) ? saved.items : [];
} catch (error) {
return [];
}
};

const pushProjectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || null;
const PUSH_TOKEN_STORAGE_KEY = 'PLAN_EXPO_PUSH_TOKEN_V1';
const loadStoredPushToken = async () => {
try {
return Platform.OS === 'web'
? await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY)
: await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
} catch (error) { return null; }
};
const storePushToken = async (token) => {
try {
if (Platform.OS === 'web') await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
else await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token);
return true;
} catch (error) { return false; }
};
const removeStoredPushToken = async () => {
if (Platform.OS === 'web') await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
else await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
};

if (!pushRegistrationQueueRef.current) {
pushRegistrationQueueRef.current = createPushTokenRegistrationQueue({
getCurrentUid: () => userIdRef.current,
getToken: () => getPushTokenSafe(pushProjectId),
loadStoredToken: loadStoredPushToken,
storeToken: storePushToken,
removeStoredToken: removeStoredPushToken,
hasRegisteredToken: (uid) => hasPushTokenRegistration(supabase, uid),
saveToken: (uid, token) => savePushToken(supabase, uid, token, Platform.OS),
removeToken: (uid, token) => deletePushToken(supabase, uid, token),
});
}

const registerPushTokenForUser = (uid) => pushRegistrationQueueRef.current.register(uid);

// Rebind an already-authorized installation token after an account transition.
// Token lookup does not prompt; without permission, registration stays untouched.
useEffect(() => {
pushRegistrationQueueRef.current.sessionChanged(userId);
}, [userId]);

useEffect(() => {
if (!userId || !pushProjectId || notifPermission !== 'granted') return undefined;
void registerPushTokenForUser(userId);
return undefined;
}, [userId, pushProjectId, notifPermission]);

// Planı kaydeder ve hatırlatmayı kurar. items verilmezse cihazdaki alışveriş listesi okunur.
const saveShoppingPlan = async ({ shopDate, remindAt, items, expectedGeneration } = {}) => {
const operationGeneration = expectedGeneration ?? renderDataScopeGeneration;
const isExpectedScope = () => isReadyDataScope(operationGeneration);
if (!isExpectedScope()) return { ok: false, reason: 'stale' };
const operationOwnerScope = activeDataScopeRef.current;
const built = buildPlan({ shopDate, remindAt });
if (!built.ok) return built;
const operationRevision = (shoppingPlanMutationRevisionRef.current.get(operationOwnerScope) || 0) + 1;
shoppingPlanMutationRevisionRef.current.set(operationOwnerScope, operationRevision);
const isLatestOwnerPlanMutation = () => shoppingPlanMutationRevisionRef.current.get(operationOwnerScope) === operationRevision;
const plan = built.plan;
const operationUserId = userIdRef.current;
let sourceItems = items;
if (!sourceItems) {
sourceItems = await readShoppingItems();
if (!isExpectedScope()) return { ok: false, reason: 'stale' };
}
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
const planItems = planItemsFromList(sourceItems);
const { district, city } = homeDistrict(documents);

// Sunucudan bildirim alabiliyorsa (mağaza sürümü) sunucu gönderir; alamıyorsa telefon kendisi kurar.
let delivery = 'local';
let serverOk = false;
let serverRevision = null;
const preserveStalePlan = async () => {
  if (isLatestOwnerPlanMutation()) {
    const ownerPlan = { ...plan, delivery, serverOk, items: planItems, district, city, savedAt: new Date().toISOString() };
    await writeOwnerScopedValue(AsyncStorage, operationOwnerScope, SHOPPING_PLAN_KEY, JSON.stringify(ownerPlan)).catch(() => false);
  }
  return { ok: false, reason: 'stale' };
};
if (operationUserId) {
const reserved = await reservePlanWriteRevision(supabase, operationUserId);
if (!isExpectedScope()) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
if (reserved.ok) serverRevision = reserved.revision;
}
if (operationUserId && serverRevision !== null) {
const tokenSaved = await registerPushTokenForUser(operationUserId);
if (!isExpectedScope()) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
if (tokenSaved.ok) delivery = 'push';
const res = await savePlanToServer(supabase, operationUserId, { plan, items: planItems, district, city, delivery, revision: serverRevision });
serverOk = res.ok;
if (!res.ok) delivery = 'local'; // sunucuya yazılamadıysa bildirimi garantiye al
if (!isExpectedScope()) {
  return preserveStalePlan();
}
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
}

let notif = { ok: true };
if (delivery === 'local') {
const text = buildReminderText(planItems, plan.shopDate, plan.remindAt);
if (!notificationsSupported) {
notif = await scheduleShoppingReminder({ title: text.title, body: text.body, at: plan.remindAt });
} else {
let permission = await getPermissionState();
if (!isExpectedScope()) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
if (permission === 'undetermined') permission = await requestPermission();
if (!isExpectedScope()) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
if (permission !== 'granted') {
notif = { ok: false, reason: 'permission', permission };
} else {
const scheduled = await runScopeBoundOperation(operationGeneration, isReadyDataScope, () =>
  isLatestOwnerPlanMutation()
    ? scheduleShoppingReminder({ title: text.title, body: text.body, at: plan.remindAt })
    : { ok: false, reason: 'stale' });
if (!scheduled.executed) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
notif = scheduled.result;
}
}
if (notif.reason === 'permission') setNotifPermission(notif.permission || 'denied');
} else {
const cancelled = await runScopeBoundOperation(operationGeneration, isReadyDataScope, () =>
  isLatestOwnerPlanMutation() ? cancelShoppingReminder() : { ok: false, reason: 'stale' });
if (!cancelled.executed) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
}

const stored = { ...plan, delivery, serverOk, items: planItems, district, savedAt: new Date().toISOString() };
if (!isExpectedScope()) return preserveStalePlan();
if (!isLatestOwnerPlanMutation()) return { ok: false, reason: 'stale' };
setShoppingPlanState((current) => isExpectedScope() ? stored : current);
const saveScoped = createScopeBoundSave(operationGeneration, isReadyDataScope, (key, value) => AsyncStorage.setItem(key, value));
await saveScoped(SHOPPING_PLAN_KEY, JSON.stringify(stored)).catch(() => {});
return { ok: true, plan: stored, notif };
};

// Liste değişince aktif planın ürünleri güncellenir (sunucu + yerel bildirim metni). 2 sn bekleyip toplu yazar.
const refreshShoppingPlanItems = (items, expectedGeneration) => {
if (expectedGeneration != null && !isReadyDataScope(expectedGeneration)) return;
if (!shoppingPlan || shoppingPlan.shopDate < istanbulTodayISO()) return;
if (Date.parse(shoppingPlan.remindAt) < Date.now()) return; // hatırlatma geçtiyse dokunma
if (shoppingSyncTimerRef.current) clearTimeout(shoppingSyncTimerRef.current);
shoppingSyncTimerRef.current = setTimeout(() => {
saveShoppingPlan({ shopDate: shoppingPlan.shopDate, remindAt: shoppingPlan.remindAt, items, expectedGeneration }).catch(() => {});
}, 2000);
};

const cancelShoppingPlan = async (expectedGeneration = renderDataScopeGeneration) => {
const isCurrent = () => isReadyDataScope(expectedGeneration);
if (!isCurrent()) return false;
if (shoppingSyncTimerRef.current) clearTimeout(shoppingSyncTimerRef.current);
const ownerScope = activeDataScopeRef.current;
shoppingPlanMutationRevisionRef.current.set(ownerScope, (shoppingPlanMutationRevisionRef.current.get(ownerScope) || 0) + 1);
const operationUserId = userIdRef.current;
if (operationUserId) {
const deleted = await deletePlanFromServer(supabase, operationUserId);
if (!isCurrent()) return false;
if (!deleted.ok) {
showToast(tx('Hatırlatma kaldırılamadı. Bağlantını kontrol edip tekrar dene.', 'Could not remove the reminder. Check your connection and try again.', 'Die Erinnerung konnte nicht entfernt werden. Prüfe die Verbindung und versuche es erneut.'));
return false;
}
}
const cancelled = await runScopeBoundOperation(expectedGeneration, isReadyDataScope, () => cancelShoppingReminder());
if (!cancelled.executed) return false;
setShoppingPlanState((current) => isCurrent() ? null : current);
await runScopeBoundOperation(expectedGeneration, isReadyDataScope, () => AsyncStorage.removeItem(SHOPPING_PLAN_KEY)).catch(() => {});
return true;
};

/* ---------- tüm veriyi sil ---------- */

/* ---------- bulut yedekleme / geri yükleme ---------- */

const [backupBusy, setBackupBusy] = useState(null);
const [backupStatus, setBackupStatus] = useState(null);
const [backupInfo, setBackupInfo] = useState(null);
const backupInFlightRef = useRef(false);
// Geri yükleme sırasında (ağ/onay penceresi) kullanıcı veri değiştirebilir; yazmadan hemen önce güncel veri buradan okunur.
const latestDataRef = useRef(null);
latestDataRef.current = { tasks, documents, todayPreferences };

// Sunucudaki yedeğin gerçek durumu (yalnızca üst veri: sayılar ve sunucu zamanı). Yük (payload) indirilmez.
// state: 'loading' | 'ok' | 'error'. Bu bilgi her zaman sunucudan okunur; cihazda önbelleğe alınmaz.
const [cloudMeta, setCloudMeta] = useState(null);
const refreshCloudMeta = async () => {
const uid = userIdRef.current;
const expectedGeneration = renderDataScopeGeneration;
if (!uid) { setCloudMeta(null); return; }
setCloudMeta({ state: 'loading' });
const res = await fetchBackupMeta(backupStore, uid);
if (userIdRef.current !== uid || !isReadyDataScope(expectedGeneration)) return;
if (!res.ok) { setCloudMeta({ state: 'error', reason: res.reason }); return; }
setCloudMeta({
state: 'ok',
exists: !!res.meta,
updatedAt: res.meta ? res.meta.updated_at : null,
taskCount: res.meta ? res.meta.task_count || 0 : 0,
documentCount: res.meta ? res.meta.document_count || 0 : 0,
});
};
useEffect(() => { setCloudMeta(null); }, [userId]);

// Cihazdaki görev/belge verisi hesaba bağlı saklanmadığı için sahibi kaydedilir; başka hesabın verisi yedeklenmesin.
useEffect(() => {
if (!userId) return;
(async () => {
const owner = await loadValue(DATA_OWNER_KEY, null);
if (!owner) await saveValue(DATA_OWNER_KEY, userId);
})();
}, [userId]);

const isDataOwner = async (uid) => {
const owner = await loadValue(DATA_OWNER_KEY, null);
if (!owner) return saveValue(DATA_OWNER_KEY, uid);
return owner === uid;
};

const refreshBackupInfo = async () => {
if (!userId) { setBackupInfo(null); return; }
const uid = userId;
const expectedGeneration = renderDataScopeGeneration;
const meta = await loadValue(backupMetaKey(uid), null);
if (!isReadyDataScope(expectedGeneration) || userIdRef.current !== uid) return;
const snap = await loadValue(preRestoreKey(uid), null);
if (!isReadyDataScope(expectedGeneration) || userIdRef.current !== uid) return;
setBackupInfo({
lastBackupAt: meta && meta.lastBackupAt ? meta.lastBackupAt : null,
taskCount: meta && meta.taskCount ? meta.taskCount : 0,
documentCount: meta && meta.documentCount ? meta.documentCount : 0,
hasPreRestore: !!snap,
});
};

// Ortak ön kontroller; başarısızsa { reason } döner.
const backupPreflight = async () => {
if (!userId) return 'auth';
if (tasksPersistBlockedRef.current) return 'blocked';
if (!(await isDataOwner(userId))) return 'owner';
return null;
};

const runBackup = async () => {
if (backupInFlightRef.current) return;
backupInFlightRef.current = true;
setBackupBusy('backup');
setBackupStatus(null);
const uid = userId;
const expectedGeneration = renderDataScopeGeneration;
const isCurrentBackup = (generation) => isReadyDataScope(generation) && userIdRef.current === uid;
try {
const pre = await backupPreflight();
if (pre) { setBackupStatus({ type: 'error', text: backupErrorText(tx, pre) }); return; }
if (!isCurrentBackup(expectedGeneration)) return;

const writePolicy = await checkCloudBackupWritePolicy(backupStore);
if (!isCurrentBackup(expectedGeneration)) return;
if (!writePolicy.ok) { setBackupStatus({ type: 'error', text: backupErrorText(tx, writePolicy.reason) }); return; }

const metaRes = await fetchBackupMeta(backupStore, uid);
if (!isCurrentBackup(expectedGeneration)) return;
if (!metaRes.ok) { setBackupStatus({ type: 'error', text: backupErrorText(tx, metaRes.reason) }); return; }
const cloud = metaRes.meta;
const local = await loadValue(backupMetaKey(uid), null);
if (!isCurrentBackup(expectedGeneration)) return;

const cleanupKey = imageCleanupKey(uid);
let pendingImageCleanup = [];
try {
const rawCleanup = await AsyncStorage.getItem(cleanupKey);
const parsedJournal = parseImageCleanupJournal(uid, rawCleanup);
if (!parsedJournal.ok) throw new Error('invalid_image_cleanup_journal');
pendingImageCleanup = parsedJournal.paths;
} catch (error) {
setBackupStatus({ type: 'error', text: tx('Görsel yedekleme kayıt defteri okunamadı. Veriyi korumak için yedekleme durduruldu; tekrar dene.', 'The image backup recovery journal could not be read. Backup stopped to protect data; please retry.', 'Das Wiederherstellungsprotokoll für Bilder konnte nicht gelesen werden. Das Backup wurde zum Schutz der Daten gestoppt; bitte erneut versuchen.') });
return;
}

let previousPayload = { documents: [] };
if (cloud) {
const previous = await fetchBackup(backupStore, uid);
if (!isCurrentBackup(expectedGeneration)) return;
if (!previous.ok || !previous.row || previous.row.updated_at !== cloud.updated_at) {
setBackupStatus({ type: 'error', text: backupErrorText(tx, previous.ok ? 'conflict' : previous.reason) });
return;
}
const verifiedPrevious = validateBackupRow(previous.row);
if (!verifiedPrevious.ok) {
setBackupStatus({ type: 'error', text: backupErrorText(tx, verifiedPrevious.reason) });
return;
}
previousPayload = verifiedPrevious.payload;
}
const previousPathsByDoc = {};
const previousImagePaths = [];
for (const doc of Array.isArray(previousPayload.documents) ? previousPayload.documents : []) {
if (!doc || doc.id == null || !isOwnImagePath(uid, doc.imagePath)) continue;
previousPathsByDoc[doc.id] = doc.imagePath;
previousImagePaths.push(doc.imagePath);
}
const documentsForBackup = documents.map((doc) => {
if (!doc || !doc.imagePath || previousPathsByDoc[doc.id] === doc.imagePath) return doc;
return { ...doc, imagePath: undefined };
});

/* Belge görselleri: ayrı bir alanda (Supabase Storage) saklanır, yedek kaydının içine konmaz.
   Görsel yüklenemezse yedeğin geri kalanı yine de alınır; sonuç mesajında kaç görselin
   yedeklenemediği açıkça söylenir. */
setBackupStatus({ type: 'info', text: tx('Belge görselleri yedekleniyor...', 'Backing up document images...', 'Dokumentbilder werden gesichert...') });
const allocatedImagePaths = [];
const imageResult = await uploadDocumentImages({
supabase, fs: fsAdapter, uid, documents: documentsForBackup, existingPaths: previousPathsByDoc,
createUploadId: () => Crypto.randomUUID(),
onPathAllocated: async (path) => {
try {
allocatedImagePaths.push(path);
const journal = [...new Set([...previousImagePaths, ...pendingImageCleanup, ...allocatedImagePaths])];
await AsyncStorage.setItem(cleanupKey, JSON.stringify(journal));
return true;
} catch (error) { return false; }
},
});
const stagedJournal = [...new Set([...previousImagePaths, ...pendingImageCleanup, ...allocatedImagePaths, ...imageResult.orphanCandidates, ...Object.values(imageResult.paths)])];
try { await AsyncStorage.setItem(cleanupKey, JSON.stringify(stagedJournal)); } catch (error) {
if (isCurrentBackup(expectedGeneration)) setBackupStatus({ type: 'error', text: tx('Görsel temizleme durumu güvenle kaydedilemedi. Yedekleme tamamlanmadı; tekrar dene.', 'Image cleanup could not be safely recorded. Backup was not completed; please retry.', 'Die Bildbereinigung konnte nicht sicher gespeichert werden. Das Backup wurde nicht abgeschlossen; bitte erneut versuchen.') });
return;
}
if (!isCurrentBackup(expectedGeneration)) return;

const payload = buildPayload({ tasks, documents: documentsForBackup, todayPreferences, imagePaths: imageResult.paths });

if (cloud) {
const known = !!local && local.serverUpdatedAt === cloud.updated_at;
const localCount = payload.tasks.length + payload.documents.length;
const cloudCount = (cloud.task_count || 0) + (cloud.document_count || 0);
if (!known || (localCount === 0 && cloudCount > 0)) {
const go = await confirmAsync(
'BAKPLANLA',
localCount === 0 && cloudCount > 0
? tx(`Bu cihazda hiç veri yok ama bulutta ${cloud.task_count} görev ve ${cloud.document_count} belge içeren bir yedek var. Yedeklersen bulut yedeği boş verilerle değiştirilir. Önce "Yedekten Geri Yükle"yi denemelisin. Yine de üzerine yazılsın mı?`, `This device has no data, but the cloud holds a backup with ${cloud.task_count} tasks and ${cloud.document_count} documents. Backing up would replace it with empty data. Try "Restore from Backup" first. Overwrite anyway?`, `Dieses Gerät hat keine Daten, aber in der Cloud liegt ein Backup mit ${cloud.task_count} Aufgaben und ${cloud.document_count} Dokumenten. Ein Backup würde es durch leere Daten ersetzen. Versuche zuerst die Wiederherstellung. Trotzdem überschreiben?`)
: tx(`Bulutta bu cihazdan alınmamış bir yedek var (${cloud.task_count} görev, ${cloud.document_count} belge). Yedeklersen o yedek bu cihazdaki verilerle değiştirilir. Devam edilsin mi?`, `The cloud holds a backup not made from this device (${cloud.task_count} tasks, ${cloud.document_count} documents). Backing up replaces it with this device's data. Continue?`, `In der Cloud liegt ein Backup, das nicht von diesem Gerät stammt (${cloud.task_count} Aufgaben, ${cloud.document_count} Dokumente). Ein Backup ersetzt es durch die Daten dieses Geräts. Fortfahren?`),
tx('Üzerine Yaz', 'Overwrite', 'Überschreiben'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
true
);
if (!go) { setBackupStatus({ type: 'info', text: tx('Yedekleme iptal edildi. Hiçbir şey değişmedi.', 'Backup cancelled. Nothing changed.', 'Backup abgebrochen. Nichts wurde geändert.') }); return; }
if (!isCurrentBackup(expectedGeneration)) return;
}
}

let res = null;
let backupMetaSaved = true;
const currentImagePaths = payload.documents.map((doc) => doc && doc.imagePath).filter((path) => isOwnImagePath(uid, path));
const stagedImagePaths = [...imageResult.orphanCandidates, ...Object.values(imageResult.paths)];
const imageCommit = await reconcileCloudImageCommit({
uid,
previousPaths: previousImagePaths,
pendingPaths: pendingImageCleanup,
stagedPaths: stagedImagePaths,
currentPaths: currentImagePaths,
isCurrent: () => isCurrentBackup(expectedGeneration),
persistJournal: async (paths) => {
try { await AsyncStorage.setItem(cleanupKey, JSON.stringify(paths)); return true; } catch (error) { return false; }
},
commitBackup: async () => {
if (!isCurrentBackup(expectedGeneration)) return { ok: false, reason: 'stale' };
res = await uploadBackup(backupStore, uid, payload, cloud ? cloud.updated_at : null, APP_VERSION);
if (!res.ok) return { ok: false, reason: res.reason, code: res.code };
try {
const nowIso = new Date().toISOString();
await AsyncStorage.setItem(backupMetaKey(uid), JSON.stringify({ serverUpdatedAt: res.serverUpdatedAt, lastBackupAt: nowIso, taskCount: res.taskCount, documentCount: res.documentCount }));
} catch (error) { backupMetaSaved = false; }
return { ok: true, serverUpdatedAt: res.serverUpdatedAt };
},
removePaths: (paths) => removeCloudImagePaths({ supabase, uid, paths }),
});
if (!imageCommit.committed) {
if (!isCurrentBackup(expectedGeneration)) return;
if (imageCommit.reason === 'stale') return;
if (imageCommit.reason === 'journal') {
setBackupStatus({ type: 'error', text: tx('Görsel temizleme durumu güvenle kaydedilemedi. Yedekleme tamamlanmadı; tekrar dene.', 'Image cleanup could not be safely recorded. Backup was not completed; please retry.', 'Die Bildbereinigung konnte nicht sicher gespeichert werden. Das Backup wurde nicht abgeschlossen; bitte erneut versuchen.') });
return;
}
if (res && !res.ok) {
console.log('BAKPLANLA backup error:', res.reason, res.code || '');
setBackupStatus({ type: 'error', text: backupErrorText(tx, res.reason) });
return;
}
setBackupStatus({ type: 'error', text: backupErrorText(tx, imageCommit.reason) });
return;
}
if (!isCurrentBackup(expectedGeneration)) return;
await refreshBackupInfo();
refreshCloudMeta();

const savedImages = imageResult.uploaded + imageResult.reused;
const cleanupText = imageCommit.cleanup === 'pending'
? tx(' Eski belge görsellerinin silinmesi tamamlanamadı; bir sonraki yedeklemede yeniden denenecek.', ' Some obsolete document images could not be removed; cleanup will retry with the next backup.', 'Einige veraltete Dokumentbilder konnten nicht entfernt werden; die Bereinigung wird beim nächsten Backup wiederholt.')
: !backupMetaSaved
? tx(' Yerel yedek durumu kaydedilemedi; bulut yedeği doğrulandı.', ' Local backup status could not be saved; the cloud backup was verified.', 'Der lokale Backupstatus konnte nicht gespeichert werden; das Cloud-Backup wurde überprüft.')
: '';
const imageText = imageResult.setupMissing
? tx(' Belge görselleri yedeklenemedi: sunucuda görsel deposu kurulu değil (supabase/bakplanla_storage.sql).', ' Document images could not be backed up: image storage is not set up on the server (supabase/bakplanla_storage.sql).', ' Dokumentbilder konnten nicht gesichert werden: Bildspeicher ist auf dem Server nicht eingerichtet.')
: imageResult.failed > 0
? tx(` ${savedImages} belge görseli yedeklendi, ${imageResult.failed} tanesi yedeklenemedi.`, ` ${savedImages} document images backed up, ${imageResult.failed} could not be.`, ` ${savedImages} Dokumentbilder gesichert, ${imageResult.failed} nicht.`)
: savedImages > 0
? tx(` ${savedImages} belge görseli de yedeklendi.`, ` ${savedImages} document images were backed up too.`, ` ${savedImages} Dokumentbilder wurden ebenfalls gesichert.`)
: '';

setBackupStatus({
type: imageResult.failed > 0 || imageResult.setupMissing || imageCommit.cleanup !== 'complete' || !backupMetaSaved ? 'info' : 'success',
text: tx(`Yedeklendi ve doğrulandı: ${res.taskCount} görev, ${res.documentCount} belge.${imageText}${cleanupText}`, `Backed up and verified: ${res.taskCount} tasks, ${res.documentCount} documents.${imageText}${cleanupText}`, `Gesichert und verifiziert: ${res.taskCount} Aufgaben, ${res.documentCount} Dokumente.${imageText}${cleanupText}`),
});
} finally {
backupInFlightRef.current = false;
setBackupBusy(null);
}
};

const runRestore = async () => {
if (backupInFlightRef.current) return;
backupInFlightRef.current = true;
setBackupBusy('restore');
setBackupStatus(null);
const uid = userId;
const expectedGeneration = renderDataScopeGeneration;
const isCurrentRestore = (generation) => isReadyDataScope(generation) && userIdRef.current === uid;
try {
const pre = await backupPreflight();
if (pre) { setBackupStatus({ type: 'error', text: backupErrorText(tx, pre) }); return; }
if (!isCurrentRestore(expectedGeneration)) return;

const res = await fetchBackup(backupStore, uid);
if (!isCurrentRestore(expectedGeneration)) return;
if (!res.ok) { setBackupStatus({ type: 'error', text: backupErrorText(tx, res.reason) }); return; }
if (!res.row) { setBackupStatus({ type: 'info', text: tx('Bulutta bu hesaba ait yedek bulunamadı.', 'No backup was found for this account.', 'Für dieses Konto wurde kein Backup gefunden.') }); return; }
const valid = validateBackupRow(res.row);
if (!valid.ok) { setBackupStatus({ type: 'error', text: backupErrorText(tx, valid.reason) }); return; }

const plan = planRestore({ tasks, documents, todayPreferences }, valid.payload, DEFAULT_TODAY_PREFERENCES);
const sm = plan.summary;
if (sm.addedTasks === 0 && sm.addedDocs === 0 && sm.updatedDocs === 0 && !sm.prefsRestored) {
setBackupStatus({ type: 'info', text: tx('Yedekteki her şey zaten bu cihazda. Değişiklik yapılmadı.', 'Everything in the backup is already on this device. No changes made.', 'Alles im Backup ist bereits auf diesem Gerät. Keine Änderungen.') });
return;
}
const go = await confirmAsync(
'BAKPLANLA',
tx(`Yedekten eklenecek: ${sm.addedTasks} görev, ${sm.addedDocs} yeni belge${sm.updatedDocs ? `, ${sm.updatedDocs} belge güncellenecek` : ''}. Zaten var olan ${sm.skippedTasks + sm.skippedDocs} kayıt atlanır. Mevcut verilerin silinmez; öncesinde cihaz verilerinin kopyası alınır ve geri alabilirsin. Belge görselleri yedekte yoktur.`, `From the backup: ${sm.addedTasks} tasks and ${sm.addedDocs} new documents will be added${sm.updatedDocs ? `, ${sm.updatedDocs} documents updated` : ''}. ${sm.skippedTasks + sm.skippedDocs} records that already exist are skipped. Your data is not deleted; a copy is saved first so you can undo. Document images are not in the backup.`, `Aus dem Backup werden ${sm.addedTasks} Aufgaben und ${sm.addedDocs} neue Dokumente hinzugefügt${sm.updatedDocs ? `, ${sm.updatedDocs} Dokumente aktualisiert` : ''}. ${sm.skippedTasks + sm.skippedDocs} bereits vorhandene Einträge werden übersprungen. Nichts wird gelöscht; vorher wird eine Kopie gespeichert, damit du es rückgängig machen kannst. Dokumentbilder sind nicht im Backup.`),
tx('Geri Yükle', 'Restore', 'Wiederherstellen'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
false
);
if (!go) { setBackupStatus({ type: 'info', text: tx('Geri yükleme iptal edildi. Hiçbir şey değişmedi.', 'Restore cancelled. Nothing changed.', 'Wiederherstellung abgebrochen. Nichts wurde geändert.') }); return; }
// Onay ve ağ beklerken hesap değiştiyse hiçbir şey yazılmaz.
if (!isCurrentRestore(expectedGeneration)) return;

// Snapshot, restore ve rollback account switch ile aynı kuyruğa alınır.
let committedPlan = null;
let nextTasks = null;
const keyCurrent = () => ({
  [STORAGE_KEYS.tasks]: latestDataRef.current.tasks,
  [STORAGE_KEYS.documents]: latestDataRef.current.documents,
  [STORAGE_KEYS.todayPreferences]: latestDataRef.current.todayPreferences,
});
const transaction = await commitRestoreData({
  runScopeBoundOperation,
  expectedGeneration,
  isCurrent: isCurrentRestore,
  write: saveValue,
  snapshotEntry: {
    key: preRestoreKey(uid),
    value: (currentValues) => ({
      tasks: currentValues[STORAGE_KEYS.tasks],
      documents: currentValues[STORAGE_KEYS.documents],
      todayPreferences: currentValues[STORAGE_KEYS.todayPreferences],
      createdAt: new Date().toISOString(),
    }),
  },
  current: keyCurrent,
  next: (currentValues) => {
    committedPlan = planRestore({
      tasks: currentValues[STORAGE_KEYS.tasks],
      documents: currentValues[STORAGE_KEYS.documents],
      todayPreferences: currentValues[STORAGE_KEYS.todayPreferences],
    }, valid.payload, DEFAULT_TODAY_PREFERENCES);
    nextTasks = normalizeStoredTasks(committedPlan.tasks, []);
    return {
      [STORAGE_KEYS.tasks]: nextTasks,
      [STORAGE_KEYS.documents]: committedPlan.documents,
      [STORAGE_KEYS.todayPreferences]: committedPlan.todayPreferences,
    };
  },
});
if (!transaction.executed || !isCurrentRestore(expectedGeneration)) return;
if (!transaction.result.ok) {
setBackupStatus({ type: 'error', text: backupErrorText(tx, restoreFailureReason(transaction.result)) });
return;
}
setTasks(nextTasks);
setDocuments(committedPlan.documents);
setTodayPreferences(committedPlan.todayPreferences);

/* Görselleri indirme: veri zaten kaydedildi; görsel inemezse belge görselsiz kalır, veri kaybolmaz. */
let imageText = '';
const needsImages = committedPlan.documents.some((d) => d && !d.uri && typeof d.imagePath === 'string' && d.imagePath);
if (needsImages) {
setBackupStatus({ type: 'info', text: tx('Belge görselleri indiriliyor...', 'Downloading document images...', 'Dokumentbilder werden geladen...') });
const imgRes = await restoreDocumentImages({ supabase, fs: fsAdapter, uid, documents: committedPlan.documents });
if (!isCurrentRestore(expectedGeneration)) {
  const newlyRestored = imgRes.documents.filter((document, index) => !committedPlan.documents[index]?.uri && document?.uri);
  await Promise.all(newlyRestored.map((document) => removeImage(document.uri)));
  return;
}
if (imgRes.downloaded > 0) {
const savedDocs = await saveInRenderedScope(STORAGE_KEYS.documents, imgRes.documents);
if (savedDocs && isCurrentRestore(expectedGeneration)) setDocuments(imgRes.documents);
else if (!isCurrentRestore(expectedGeneration)) {
  const newlyRestored = imgRes.documents.filter((document, index) => !committedPlan.documents[index]?.uri && document?.uri);
  await Promise.all(newlyRestored.map((document) => removeImage(document.uri)));
  return;
}
}
imageText = imgRes.downloaded > 0
? tx(` ${imgRes.downloaded} belge görseli de geri yüklendi.`, ` ${imgRes.downloaded} document images were restored too.`, ` ${imgRes.downloaded} Dokumentbilder wurden ebenfalls wiederhergestellt.`)
: '';
if (imgRes.failed > 0) {
imageText += tx(` ${imgRes.failed} görsel indirilemedi.`, ` ${imgRes.failed} images could not be downloaded.`, ` ${imgRes.failed} Bilder konnten nicht geladen werden.`);
}
}

const prevMeta = await loadValue(backupMetaKey(uid), null);
if (!isCurrentRestore(expectedGeneration)) return;
await saveValue(backupMetaKey(uid), { ...(prevMeta || {}), serverUpdatedAt: res.row.updated_at });
await refreshBackupInfo();
if (!isCurrentRestore(expectedGeneration)) return;
setBackupStatus({
type: 'success',
text: tx(`Geri yüklendi: ${committedPlan.summary.addedTasks} görev, ${committedPlan.summary.addedDocs} belge eklendi.${imageText}`, `Restored: ${committedPlan.summary.addedTasks} tasks and ${committedPlan.summary.addedDocs} documents added.${imageText}`, `Wiederhergestellt: ${committedPlan.summary.addedTasks} Aufgaben und ${committedPlan.summary.addedDocs} Dokumente hinzugefügt.${imageText}`),
});
} finally {
backupInFlightRef.current = false;
setBackupBusy(null);
}
};

const undoRestore = async () => {
if (backupInFlightRef.current || !userId) return;
backupInFlightRef.current = true;
setBackupBusy('restore');
setBackupStatus(null);
const uid = userId;
const expectedGeneration = renderDataScopeGeneration;
const isCurrentUndo = (generation) => isReadyDataScope(generation) && userIdRef.current === uid;
try {
const pre = await backupPreflight();
if (pre) { setBackupStatus({ type: 'error', text: backupErrorText(tx, pre) }); return; }
const snap = await loadValue(preRestoreKey(uid), null);
if (!isCurrentUndo(expectedGeneration)) return;
if (!snap || !Array.isArray(snap.tasks) || !Array.isArray(snap.documents)) {
setBackupStatus({ type: 'error', text: tx('Geri alınacak kayıt bulunamadı.', 'Nothing to undo.', 'Nichts zum Rückgängigmachen.') });
await refreshBackupInfo();
return;
}
const go = await confirmAsync(
'BAKPLANLA',
tx('Cihaz verilerin son geri yüklemeden önceki hâline döndürülecek. Geri yüklemeden sonra yaptığın değişiklikler de kaybolur. Devam edilsin mi?', 'Your device data will return to its state before the last restore. Changes made after the restore will also be lost. Continue?', 'Deine Gerätedaten werden auf den Stand vor der letzten Wiederherstellung zurückgesetzt. Änderungen danach gehen ebenfalls verloren. Fortfahren?'),
tx('Geri Al', 'Undo', 'Rückgängig'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
true
);
if (!go) return;
if (!isCurrentUndo(expectedGeneration)) return;
const prefs = snap.todayPreferences && typeof snap.todayPreferences === 'object' ? snap.todayPreferences : DEFAULT_TODAY_PREFERENCES;
const transaction = await commitRestoreData({
  runScopeBoundOperation,
  expectedGeneration,
  isCurrent: isCurrentUndo,
  write: saveValue,
  current: () => ({
    [STORAGE_KEYS.tasks]: latestDataRef.current.tasks,
    [STORAGE_KEYS.documents]: latestDataRef.current.documents,
    [STORAGE_KEYS.todayPreferences]: latestDataRef.current.todayPreferences,
  }),
  next: {
    [STORAGE_KEYS.tasks]: snap.tasks,
    [STORAGE_KEYS.documents]: snap.documents,
    [STORAGE_KEYS.todayPreferences]: prefs,
  },
});
if (!transaction.executed || !isCurrentUndo(expectedGeneration)) return;
if (!transaction.result.ok) { setBackupStatus({ type: 'error', text: backupErrorText(tx, restoreFailureReason(transaction.result)) }); return; }
setTasks(normalizeStoredTasks(snap.tasks, []));
setDocuments(snap.documents.filter(Boolean));
setTodayPreferences({ ...DEFAULT_TODAY_PREFERENCES, ...prefs });
const removedSnapshot = await runScopeBoundOperation(expectedGeneration, (generation) => isCurrentUndo(generation), () => removeStorageKey(preRestoreKey(uid)));
if (!removedSnapshot.executed || !isCurrentUndo(expectedGeneration)) return;
await refreshBackupInfo();
if (!isCurrentUndo(expectedGeneration)) return;
setBackupStatus({ type: 'success', text: tx('Geri yükleme geri alındı.', 'Restore undone.', 'Wiederherstellung rückgängig gemacht.') });
} finally {
backupInFlightRef.current = false;
setBackupBusy(null);
}
};

// Yalnızca oturumdaki hesabın bulut yedeğini siler (RLS: sadece kendi satırı). Cihaz verilerine dokunmaz.
const deleteCloudBackup = async () => {
if (backupInFlightRef.current || !userId) return;
const uid = userId;
const expectedGeneration = renderDataScopeGeneration;
const isCurrentDelete = () => isReadyDataScope(expectedGeneration) && userIdRef.current === uid;
const go = await confirmAsync(
'BAKPLANLA',
tx('Bulut yedeğin kalıcı olarak silinecek ve geri getirilemez. Cihazındaki veriler ve hesabın silinmez.', 'Your cloud backup will be permanently deleted and cannot be recovered. Data on this device and your account are not deleted.', 'Dein Cloud-Backup wird dauerhaft gelöscht und kann nicht wiederhergestellt werden. Gerätedaten und Konto bleiben erhalten.'),
tx('Yedeği Sil', 'Delete Backup', 'Backup löschen'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
true
);
if (!go) return;
if (!isCurrentDelete()) return;
backupInFlightRef.current = true;
setBackupBusy('delete');
setBackupStatus(null);
try {
const imageDeletion = await deleteBackupImagesForOwner(uid, isCurrentDelete);
if (!imageDeletion.deleted) {
if (!isCurrentDelete()) return;
if (imageDeletion.reason === 'journal') {
setBackupStatus({ type: 'error', text: tx('Görsel temizleme durumu güvenle kaydedilemedi. Bulut yedeği silinmedi; tekrar dene.', 'Image cleanup could not be safely recorded. The cloud backup was not deleted; please retry.', 'Die Bildbereinigung konnte nicht sicher gespeichert werden. Das Cloud-Backup wurde nicht gelöscht; bitte erneut versuchen.') });
return;
}
setBackupStatus({ type: 'error', text: backupErrorText(tx, imageDeletion.reason) });
return;
}
if (!isCurrentDelete()) return;
await refreshBackupInfo();
refreshCloudMeta();
setBackupStatus({ type: imageDeletion.cleanup === 'pending' ? 'info' : 'success', text: imageDeletion.cleanup === 'pending'
? tx('Bulut yedeği silindi; bazı görseller kaldı ve sonraki yedeklemede tekrar temizlenecek.', 'The cloud backup was deleted, but some images remain and cleanup will retry with the next backup.', 'Das Cloud-Backup wurde gelöscht; einige Bilder sind noch vorhanden und werden beim nächsten Backup erneut bereinigt.')
: imageDeletion.deletion.deleted > 0
? tx('Bulut yedeğin silindi.', 'Your cloud backup was deleted.', 'Dein Cloud-Backup wurde gelöscht.')
: tx('Bulutta silinecek yedek yoktu.', 'There was no cloud backup to delete.', 'Es gab kein Cloud-Backup zu löschen.') });
} finally {
backupInFlightRef.current = false;
setBackupBusy(null);
}
};

/* ---------- verilerimi sil ----------
   Bu işlem HESABI silmez ve oturumu kapatmaz. Kapsam:
   - Cihaz: görevler, belgeler (kayıtlı görseller dahil), Bugün tercihleri, alışveriş listesi, yedek kopyası/yedek bilgisi.
   - İsteğe bağlı: bu hesabın bulut yedeği.
   Dil, tema, ad ve ücretsiz kullanım sayaçları korunur. */

const deleteLocalData = async (uid, expectedGeneration) => {
const result = await runScopeBoundOperation(expectedGeneration, isReadyDataScope, async () => {
const localResetKeys = localDataResetStorageKeys(uid, [
'PLAN_SHOPPING_LIST_V1', SHOPPING_PLAN_KEY, 'PLAN_COMPASS_RESULT',
'BAKPLANLA_MESLEK_PROVASI', 'BAKPLANLA_ISBASI_PROGRESS',
'BAKPLANLA_ISBASI_SERVER_CACHE', 'BAKPLANLA_ISBASI_PENDING_FINISH',
...(uid ? [preRestoreKey(uid), backupMetaKey(uid)] : []),
]);
const results = await Promise.all([
saveValue(STORAGE_KEYS.tasks, []),
saveValue(STORAGE_KEYS.documents, []),
saveValue(STORAGE_KEYS.todayPreferences, DEFAULT_TODAY_PREFERENCES),
...localResetKeys.map(removeStorageKey),
]);
if (results.some((ok) => !ok)) return false;
let archived = null;
try { archived = await removeLocalDataScope(AsyncStorage, uid || 'guest'); } catch (error) { return false; }
let archivedDocs = [];
try { archivedDocs = JSON.parse(archived?.PLAN_DOCUMENTS || '[]'); } catch (error) { archivedDocs = []; }
await Promise.all([...documents, ...(Array.isArray(archivedDocs) ? archivedDocs : [])].map((d) => removeImage(d?.uri)));
tasksPersistBlockedRef.current = false;
if (uid) await saveValue(DATA_OWNER_KEY, uid);
await cancelShoppingReminder();
return true;
});
if (!result.executed || !result.result) return false;
if (expectedGeneration !== dataScopeGenerationRef.current) return true;
setDocuments([]);
setTasks([]);
setShoppingPlanState(null);
setTodayPreferences(DEFAULT_TODAY_PREFERENCES);
setSelectedDocumentId(null);
setBackupInfo(null);
setBackupStatus(null);
setStack(['home']);
return true;
};

const resetData = async () => {
if (backupInFlightRef.current) return;
const targetUserId = userIdRef.current;
const expectedGeneration = renderDataScopeGeneration;
const isCurrentReset = () => isReadyDataScope(expectedGeneration) && userIdRef.current === targetUserId;
const choice = await new Promise((resolve) => {
Alert.alert(
tx('Verilerimi Sil', 'Delete my data', 'Meine Daten löschen'),
tx(
'Bu cihazdan SİLİNECEK: tüm görevlerin, belgelerin ve kayıtlı belge görselleri, Bugün tercihlerin, alışveriş listen, PUSULA sonucun, Meslek Provası ve İş Başı ilerlemen ve yedek kopyaların.\n\nSİLİNMEYECEK: hesabın (oturumun açık kalır), adın, dil/tema ayarların ve daha önce aldığın bulut yedeği.\n\nBu işlem geri alınamaz. Hesabını silmez.',
'DELETED from this device: all your tasks, documents and saved document images, Today preferences, shopping list, COMPASS result, job rehearsal and On the Job progress, and restore copies.\n\nNOT deleted: your account (you stay signed in), your name, language/theme settings and any cloud backup you made earlier.\n\nThis cannot be undone. It does not delete your account.',
'Von diesem Gerät GELÖSCHT: alle Aufgaben, Dokumente und gespeicherten Dokumentbilder, Heute-Einstellungen, Einkaufsliste und Wiederherstellungskopien.\n\nNICHT gelöscht: dein Konto (du bleibst angemeldet), dein Name, Sprach-/Design-Einstellungen und ein früher erstelltes Cloud-Backup.\n\nDas kann nicht rückgängig gemacht werden. Dein Konto wird nicht gelöscht.'
),
[
{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel', onPress: () => resolve('cancel') },
{ text: tx('Cihazdaki verileri sil', 'Delete device data', 'Gerätedaten löschen'), style: 'destructive', onPress: () => resolve('local') },
{ text: tx('Cihaz + bulut yedeği', 'Device + cloud backup', 'Gerät + Cloud-Backup'), style: 'destructive', onPress: () => resolve('both') },
],
{ cancelable: true, onDismiss: () => resolve('cancel') }
);
});
if (choice === 'cancel') return;
if (!isCurrentReset()) return;

if (choice === 'both') {
const sure = await confirmAsync(
tx('Bulut yedeği de silinsin mi?', 'Delete the cloud backup too?', 'Auch das Cloud-Backup löschen?'),
tx('Cihaz verilerinle birlikte bulut yedeğin de kalıcı olarak silinecek. Bu verileri sonradan geri yükleyemezsin.', 'Your cloud backup will be permanently deleted along with your device data. You will not be able to restore it later.', 'Dein Cloud-Backup wird zusammen mit den Gerätedaten dauerhaft gelöscht. Eine spätere Wiederherstellung ist nicht möglich.'),
tx('Hepsini Sil', 'Delete All', 'Alles löschen'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
true
);
if (!sure) return;
if (!isCurrentReset()) return;
}

if (!targetUserId && choice === 'both') {
Alert.alert('BAKPLANLA', backupErrorText(tx, 'auth'));
return;
}

backupInFlightRef.current = true;
setBackupBusy('delete');
let cloudImageCleanupPending = false;
try {
// Önce bulut: başarısız olursa cihaz verilerine dokunulmaz, kullanıcı tutarsız durumda kalmaz.
if (choice === 'both') {
const imageDeletion = await deleteBackupImagesForOwner(targetUserId, isCurrentReset);
if (!isCurrentReset()) return;
if (!imageDeletion.deleted) {
console.log('BAKPLANLA cloud delete error:', imageDeletion.reason || '', '');
Alert.alert('BAKPLANLA', `${tx('Bulut yedeği silinemedi; cihazındaki verilere dokunulmadı.', 'The cloud backup could not be deleted; your device data was left untouched.', 'Das Cloud-Backup konnte nicht gelöscht werden; Gerätedaten blieben unverändert.')}\n\n${backupErrorText(tx, imageDeletion.reason)}`);
return;
}
cloudImageCleanupPending = imageDeletion.cleanup === 'pending';
}
const ok = await deleteLocalData(targetUserId, expectedGeneration);
if (!isCurrentReset()) return;
if (!ok) {
Alert.alert('BAKPLANLA', tx('Veriler cihazdan silinemedi. Depolama alanını kontrol edip tekrar dene.', 'Data could not be deleted from the device. Check storage and try again.', 'Daten konnten nicht vom Gerät gelöscht werden. Prüfe den Speicher und versuche es erneut.'));
return;
}
showToast(choice === 'both'
? cloudImageCleanupPending
? tx('Cihaz verilerin ve bulut yedeğin silindi; bazı bulut görselleri sonraki yedeklemede temizlenecek.', 'Device data and cloud backup were deleted; some cloud images will be cleaned on the next backup.', 'Gerätedaten und Cloud-Backup wurden gelöscht; einige Cloud-Bilder werden beim nächsten Backup entfernt.')
: tx('Cihaz verilerin ve bulut yedeğin silindi.', 'Device data and cloud backup deleted.', 'Gerätedaten und Cloud-Backup gelöscht.')
: tx('Cihaz verilerin silindi.', 'Device data deleted.', 'Gerätedaten gelöscht.'));
} finally {
backupInFlightRef.current = false;
setBackupBusy(null);
}
};

/* ---------- hesabı tamamen sil ----------
   "Verilerimi Sil"den farkı: bu işlem HESABI da siler ve geri alınamaz.
   Sunucu tarafı: supabase/functions/delete-account (deploy edilmiş olmalı).
   Sunucu işlemi önce tamamlanır; cihaz verisi ancak sunucu tamamlandıktan sonra temizlenir. */

const [accountDeleting, setAccountDeleting] = useState(false);

const deleteAccount = async () => {
if (backupInFlightRef.current || accountDeleting) return;
const uid = userIdRef.current;
if (!uid) {
Alert.alert('BAKPLANLA', backupErrorText(tx, 'auth'));
return;
}

let pendingDeletion = null;
const deletionKey = accountDeletionKeyFor(uid);
try {
const raw = await AsyncStorage.getItem(deletionKey);
pendingDeletion = raw ? JSON.parse(raw) : null;
} catch (error) {
pendingDeletion = null;
}
const retryLocalCleanup = pendingDeletion?.owner === uid && pendingDeletion?.state === 'remote_complete';
const hadPriorAttempt = pendingDeletion?.owner === uid && pendingDeletion?.state === 'pending';

const first = retryLocalCleanup || await confirmAsync(
tx('Hesabımı Sil', 'Delete my account', 'Mein Konto löschen'),
tx(
'Hesabın ve ona bağlı HER ŞEY kalıcı olarak silinecek:\n\n• Hesabın (e-posta ve şifren)\n• Buluttaki yedeğin\n• Buluttaki belge görsellerin\n• Bu cihazdaki görevlerin, belgelerin ve ayarların\n\nBu işlem GERİ ALINAMAZ. Verilerini saklamak istiyorsan önce yedeğini bir yere not et.',
'Your account and EVERYTHING linked to it will be permanently deleted:\n\n• Your account (e-mail and password)\n• Your cloud backup\n• Your cloud document images\n• Tasks, documents and settings on this device\n\nThis CANNOT be undone. If you want to keep your data, save it somewhere first.',
'Dein Konto und ALLES, was damit verbunden ist, wird dauerhaft gelöscht:\n\n• Dein Konto (E-Mail und Passwort)\n• Dein Cloud-Backup\n• Deine Dokumentbilder in der Cloud\n• Aufgaben, Dokumente und Einstellungen auf diesem Gerät\n\nDies kann NICHT rückgängig gemacht werden.'
),
tx('Devam', 'Continue', 'Weiter'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
true
);
if (!first) return;

const sure = retryLocalCleanup || await confirmAsync(
tx('Emin misin?', 'Are you sure?', 'Bist du sicher?'),
tx('Son uyarı: hesabın silinecek ve bir daha bu e-postayla eski verilerine ulaşamayacaksın.', 'Final warning: your account will be deleted and you will not be able to reach your old data with this e-mail again.', 'Letzte Warnung: Dein Konto wird gelöscht und du kommst mit dieser E-Mail nicht mehr an deine alten Daten.'),
tx('Hesabımı Sil', 'Delete my account', 'Konto löschen'),
tx('Vazgeç', 'Cancel', 'Abbrechen'),
true
);
if (!sure) return;

setAccountDeleting(true);
backupInFlightRef.current = true;
try {
if (retryLocalCleanup) {
const localClean = await deleteLocalAccountScope(AsyncStorage, uid, removeImage, [backupMetaKey(uid), imageCleanupKey(uid), preRestoreKey(uid), userNameKeyFor(uid), `PLAN_FEATURE_TRIALS:${uid}`]);
if (!localClean) {
Alert.alert('BAKPLANLA', tx('Hesap sunucudan silindi, ancak cihazdaki bazı veriler temizlenemedi. Uygulama açıldığında yeniden denenecek.', 'The account was deleted on the server, but some data on this device could not be cleared. The app will retry when opened.', 'Das Konto wurde auf dem Server gelöscht, aber einige Gerätedaten konnten nicht entfernt werden. Die App versucht es beim nächsten Öffnen erneut.'));
return;
}
let receiptRemoved = false;
try { await deletionReceiptStore.remove(uid); receiptRemoved = true; } catch (error) { /* Remote-complete marker keeps retry safe. */ }
if (receiptRemoved) {
  try { await AsyncStorage.removeItem(deletionKey); } catch (error) { /* Retry on next launch. */ }
}
try { await supabase.auth.signOut({ scope: 'local' }); } catch (error) { /* Auth may already be gone. */ }
setSession(null);
setUserName('');
setEntitlement({ state: 'idle', row: null, reason: null });
Alert.alert('BAKPLANLA', tx('Hesabın ve verilerin silindi.', 'Your account and data have been deleted.', 'Dein Konto und deine Daten wurden gelöscht.'));
return;
}

let token = null;
try {
const { data } = await supabase.auth.getSession();
token = data?.session?.access_token || null;
} catch (error) {
token = null;
}
if (!token) {
if (!hadPriorAttempt) {
  try { await AsyncStorage.removeItem(deletionKey); } catch (error) { /* No request was sent. */ }
  Alert.alert('BAKPLANLA', backupErrorText(tx, 'auth'));
} else {
  Alert.alert('BAKPLANLA', tx('Silme işleminin önceki denemesinin sonucu doğrulanamadı; bazı veriler silinmiş olabilir.', 'The result of the previous deletion attempt could not be confirmed; some data may already have been removed.', 'Das Ergebnis des vorherigen Löschversuchs konnte nicht bestätigt werden; einige Daten könnten bereits entfernt sein.'));
}
return;
}

let operationCredential;
try {
  const storedCredential = await deletionReceiptStore.get(uid);
  operationCredential = await getOrCreateDeletionReceipt({
    owner: uid,
    store: deletionReceiptStore,
    generate: async () => credentialFromRandomBytes(await Crypto.getRandomBytesAsync(32)),
  });
  let knownStatus = await getDeletionReceiptStatus(operationCredential).catch(() => null);
  if (storedCredential && knownStatus?.httpStatus === 404 && knownStatus.state === 'unknown') {
    await deletionReceiptStore.remove(uid);
    operationCredential = await getOrCreateDeletionReceipt({
      owner: uid,
      store: deletionReceiptStore,
      generate: async () => credentialFromRandomBytes(await Crypto.getRandomBytesAsync(32)),
    });
    knownStatus = await getDeletionReceiptStatus(operationCredential).catch(() => null);
  }
  const canStartWithReceipt = knownStatus?.httpStatus === 404 && knownStatus.state === 'unknown';
  const canContinueReceipt = [200, 503].includes(knownStatus?.httpStatus) && ['pending', 'partial', 'unknown'].includes(knownStatus.state);
  if (!canStartWithReceipt && !canContinueReceipt && knownStatus?.state !== 'completed' && knownStatus?.state !== 'expired') {
    throw new Error('deletion_receipt_service_unavailable');
  }
  if (knownStatus?.state === 'completed') {
    await AsyncStorage.setItem(deletionKey, JSON.stringify({ owner: uid, state: 'remote_complete' }));
    const recovered = await deleteLocalAccountScope(AsyncStorage, uid, removeImage, [backupMetaKey(uid), imageCleanupKey(uid), preRestoreKey(uid), userNameKeyFor(uid), `PLAN_FEATURE_TRIALS:${uid}`]);
    if (!recovered) throw new Error('local_cleanup_pending');
    await deletionReceiptStore.remove(uid);
    await AsyncStorage.removeItem(deletionKey);
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (error) { /* Auth may already be gone. */ }
    setSession(null);
    setUserName('');
    setEntitlement({ state: 'idle', row: null, reason: null });
    Alert.alert('BAKPLANLA', tx('Hesabın ve verilerin silindi.', 'Your account and data have been deleted.', 'Dein Konto und deine Daten wurden gelöscht.'));
    return;
  }
  const receiptExpiring = Number.isFinite(Date.parse(knownStatus?.expires_at))
    && Date.parse(knownStatus.expires_at) <= Date.now() + 5 * 60 * 1000;
  if (knownStatus?.state === 'expired' || receiptExpiring) {
    await deletionReceiptStore.remove(uid);
    operationCredential = await getOrCreateDeletionReceipt({
      owner: uid,
      store: deletionReceiptStore,
      generate: async () => credentialFromRandomBytes(await Crypto.getRandomBytesAsync(32)),
    });
  }
} catch (error) {
  Alert.alert('BAKPLANLA', error?.message === 'local_cleanup_pending'
    ? tx('Hesap sunucudan silindi, ancak cihazdaki bazı veriler temizlenemedi. Uygulama açıldığında yeniden denenecek.', 'The account was deleted on the server, but some data on this device could not be cleared. The app will retry when opened.', 'Das Konto wurde auf dem Server gelöscht, aber einige Gerätedaten konnten nicht entfernt werden. Die App versucht es beim nächsten Öffnen erneut.')
    : backupErrorText(tx, 'storage'));
  return;
}

try {
await AsyncStorage.setItem(deletionKey, JSON.stringify({ owner: uid, state: 'pending', attempts: (pendingDeletion?.attempts || 0) + 1 }));
} catch (error) {
Alert.alert('BAKPLANLA', backupErrorText(tx, 'storage'));
return;
}

let response;
try {
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
try {
response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${token}`,
apikey: SUPABASE_PUBLISHABLE_KEY,
},
body: JSON.stringify({ operationCredential }),
signal: controller.signal,
});
} finally {
clearTimeout(timer);
}
} catch (error) {
Alert.alert('BAKPLANLA', tx('Silme işleminin sonucu doğrulanamadı; bazı veriler silinmiş olabilir. Oturumun açıksa tekrar dene.', 'The deletion outcome could not be confirmed; some data may already have been removed. If you are still signed in, try again.', 'Der Löschstatus konnte nicht bestätigt werden; einige Daten könnten bereits entfernt sein. Wenn du noch angemeldet bist, versuche es erneut.'));
return;
}

if (!response.ok) {
let failure = null;
try { failure = await response.json(); } catch (error) { failure = null; }
const noOperationStarted = (response.status === 404 || failure?.state === 'not_started') && !hadPriorAttempt;
const missingFunction = response.status === 404 && !failure;
if (noOperationStarted && failure?.state === 'not_started') {
  try { await AsyncStorage.removeItem(deletionKey); } catch (error) { /* Harmless stale intent. */ }
  try { await deletionReceiptStore.remove(uid); } catch (error) { /* No operation started; cleanup can retry. */ }
}
Alert.alert(
'BAKPLANLA',
missingFunction && !hadPriorAttempt
? tx('Hesap silme sunucu fonksiyonu bu projede henüz kurulu değil; hesabın SİLİNMEDİ. (supabase/functions/delete-account dağıtılmalı.)', 'The account deletion server function is not set up in this project yet; your account was NOT deleted. (supabase/functions/delete-account must be deployed.)', 'Die Server-Funktion zum Löschen des Kontos ist noch nicht eingerichtet; dein Konto wurde NICHT gelöscht.')
: noOperationStarted
? tx('Hesap silme işlemi başlamadı. Oturumunu kontrol edip tekrar dene.', 'Account deletion did not start. Check your session and try again.', 'Die Kontolöschung wurde nicht gestartet. Prüfe deine Sitzung und versuche es erneut.')
: tx('Silme işlemi tamamlanmadı; bazı hesap verileri silinmiş olabilir. Oturumun açıksa tekrar dene.', 'Deletion did not finish; some account data may already have been removed. If you are still signed in, try again.', 'Die Löschung wurde nicht abgeschlossen; einige Kontodaten könnten bereits entfernt sein. Wenn du noch angemeldet bist, versuche es erneut.')
);
return;
}

let result = null;
try { result = await response.json(); } catch (error) { result = null; }
if (result?.state !== 'completed') {
Alert.alert('BAKPLANLA', result?.state === 'partial'
  ? tx('Silme işlemi kısmen tamamlandı. Verilerin korunuyor; tekrar deneyebilirsin.', 'Deletion is partially complete. Your local data is preserved; you can retry.', 'Die Löschung ist teilweise abgeschlossen. Deine lokalen Daten bleiben erhalten; du kannst es erneut versuchen.')
  : tx('Silme işleminin sonucu doğrulanamadı; bazı veriler silinmiş olabilir. Verilerin korunuyor, uygulama sonucu yeniden kontrol edecek.', 'The deletion outcome could not be confirmed; some data may already have been removed. Your local data is preserved, and the app will check the receipt again.', 'Der Löschstatus konnte nicht bestätigt werden; einige Daten könnten bereits entfernt sein. Deine lokalen Daten bleiben erhalten; die App prüft den Status erneut.'));
return;
}

let recoveryMarkerSaved = true;
try { await AsyncStorage.setItem(deletionKey, JSON.stringify({ owner: uid, state: 'remote_complete' })); } catch (error) { recoveryMarkerSaved = false; }
if (!recoveryMarkerSaved) {
Alert.alert('BAKPLANLA', tx('Hesap sunucudan silindi, ancak yerel temizleme durumu kaydedilemedi. Cihaz verileri korundu; cihaz ayarlarından temizle.', 'The account was deleted on the server, but its local cleanup status could not be saved. Device data was preserved; clear it from device settings.', 'Das Konto wurde auf dem Server gelöscht, aber der Status für die lokale Bereinigung konnte nicht gespeichert werden. Gerätedaten wurden erhalten; lösche sie in den Geräteeinstellungen.'));
try { await supabase.auth.signOut({ scope: 'local' }); } catch (error) { /* Auth may already be gone. */ }
return;
}
const localClean = await deleteLocalAccountScope(AsyncStorage, uid, removeImage, [backupMetaKey(uid), imageCleanupKey(uid), preRestoreKey(uid), userNameKeyFor(uid), `PLAN_FEATURE_TRIALS:${uid}`]);
if (!localClean) {
Alert.alert('BAKPLANLA', tx('Hesap sunucudan silindi, ancak cihazdaki bazı veriler temizlenemedi. Uygulama açıldığında yeniden denenecek.', 'The account was deleted on the server, but some data on this device could not be cleared. The app will retry when opened.', 'Das Konto wurde auf dem Server gelöscht, aber einige Gerätedaten konnten nicht entfernt werden. Die App versucht es beim nächsten Öffnen erneut.'));
try { await supabase.auth.signOut({ scope: 'local' }); } catch (error) { /* Auth may already be gone. */ }
return;
}
let receiptRemoved = false;
try { await deletionReceiptStore.remove(uid); receiptRemoved = true; } catch (error) { /* Remote-complete marker retries safe cleanup. */ }
if (receiptRemoved) {
  try { await AsyncStorage.removeItem(deletionKey); } catch (error) { /* An empty retry is safe. */ }
}
try { await supabase.auth.signOut({ scope: 'local' }); } catch (error) { /* Auth may already be gone. */ }
setSession(null);
setUserName('');
setEntitlement({ state: 'idle', row: null, reason: null });
Alert.alert('BAKPLANLA', tx('Hesabın ve verilerin silindi.', 'Your account and data have been deleted.', 'Dein Konto und deine Daten wurden gelöscht.'));
} finally {
backupInFlightRef.current = false;
setAccountDeleting(false);
}
};

/* ---------- bağlam ---------- */

const ctx = {
s, c, tx, lang, dark, today, lifeScore, userName,
screen, canGoBack, navigate, goTab, goBack,
documents, tasks, selectedDocumentId, analyzingId, documentAnalysisInFlight,
dataScopeGeneration: dataScopeGenerationRef.current,
dataScopeReady: isReadyDataScope(dataScopeGenerationRef.current),
isCurrentDataScope: isReadyDataScope,
todayPreferences, setTodayPreferences,
calendarMode, setCalendarMode,
showAddSheet, setShowAddSheet,
showAppearanceModal, setShowAppearanceModal,
showPlanModal, setShowPlanModal,
setShowAuthModal,
taskModal, setTaskModal,
changeLanguage, toggleDarkTheme, saveUserName,
authMode, setAuthMode,
authEmail, setAuthEmail,
authPassword, setAuthPassword,
authLoading, setAuthLoading,
authMessage, setAuthMessage,
handleSignUp, handleSignIn,
handleSignOut, handleResetPassword,
session,
resetData, showSoon, showToast,
backupBusy, backupStatus, backupInfo, refreshBackupInfo, cloudMeta, refreshCloudMeta, runBackup, runRestore, undoRestore, deleteCloudBackup,
openDocument, openAddSheet, updateDocument, deleteDocument, addReceiptDocument,
shoppingPlan, saveShoppingPlan, refreshShoppingPlanItems, cancelShoppingPlan,
pickFromCamera, pickFromGallery, addManualDocument,
analyzeDocument, createTaskFromDocument,
openNewTask, openTask, openTasksList, saveTask, toggleTask, deleteTask, createAiReminder,
gateFeature, showGateBlocked, entitlement, refreshEntitlement, proActive, proInfo,
notifPrefs, notifPermission, updateNotifPrefs, toggleTaskReminders, refreshNotifPermission, sendTestNotif,
deleteAccount, accountDeleting,
deviceId, deviceName,
};

const ShoppingListScreen = () => {
const { s, c, tx, lang, documents, addReceiptDocument, dataScopeGeneration, dataScopeReady, isCurrentDataScope, openDocument, shoppingPlan, saveShoppingPlan, refreshShoppingPlanItems, cancelShoppingPlan } = useApp();
const [items, setItems] = useState([]);
const [planPicking, setPlanPicking] = useState(false);
const [planBusy, setPlanBusy] = useState(false);
const listChangedByUserRef = useRef(false);
const [newItem, setNewItem] = useState('');
const [loading, setLoading] = useState(false);
const receiptInFlightRef = useRef(false);
const [loaded, setLoaded] = useState(false);
const [loadedScopeGeneration, setLoadedScopeGeneration] = useState(null);
const [selectedReceiptId, setSelectedReceiptId] = useState(null);

// Fişler Belgeler'de tutulur (tek kaynak); bu ekran oradan okur.
const receiptDocs = receiptDocsOf(documents);
const shownDoc = receiptDocs.find((d) => d.id === selectedReceiptId) || receiptDocs[0] || null;
const scopedItems = dataScopeReady && loadedScopeGeneration === dataScopeGeneration ? items : [];
const listScopeReady = dataScopeReady && loaded && loadedScopeGeneration === dataScopeGeneration && isCurrentDataScope(dataScopeGeneration);

useEffect(() => {
  const expectedGeneration = dataScopeGeneration;
  let active = true;
  listChangedByUserRef.current = false;
  setItems([]);
  setNewItem('');
  setSelectedReceiptId(null);
  setLoaded(false);
  setLoadedScopeGeneration(null);
  if (!dataScopeReady) {
    return () => { active = false; };
  }
  readScopeBoundValue(expectedGeneration, isCurrentDataScope, () => AsyncStorage.getItem('PLAN_SHOPPING_LIST_V1'))
    .then((result) => {
      if (!active || result.stale || !isCurrentDataScope(expectedGeneration)) return;
      const saved = result.value ? JSON.parse(result.value) : null;
      if (Array.isArray(saved?.items)) setItems(saved.items);
      setLoadedScopeGeneration(expectedGeneration);
      setLoaded(true);
    })
    .catch((error) => {
      if (!active || !isCurrentDataScope(expectedGeneration)) return;
      console.log('Shopping list load failed');
      setLoadedScopeGeneration(expectedGeneration);
      setLoaded(true);
    });
  return () => { active = false; };
}, [dataScopeGeneration, dataScopeReady]);

useEffect(() => {
  if (!dataScopeReady || !loaded || loadedScopeGeneration !== dataScopeGeneration || !isCurrentDataScope(dataScopeGeneration)) return;
  const saveList = createScopeBoundSave(dataScopeGeneration, isCurrentDataScope, (key, value) => AsyncStorage.setItem(key, value));
  saveList('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items, version: 2 }))
    .catch(() => console.log('Shopping list save failed'));
  // Liste ilk yüklemeden sonra değiştiyse aktif alışveriş planı da güncellenir.
  if (listChangedByUserRef.current) refreshShoppingPlanItems(items, dataScopeGeneration);
  listChangedByUserRef.current = true;
}, [items, loaded, loadedScopeGeneration, dataScopeGeneration, dataScopeReady]);

const choosePlanDate = async (shopDate) => {
  if (planBusy || !listScopeReady) return;
  setPlanBusy(true);
  try {
    const res = await saveShoppingPlan({ shopDate, items, expectedGeneration: dataScopeGeneration });
    if (!isCurrentDataScope(dataScopeGeneration)) return;
    if (!res.ok) {
      Alert.alert('BAKPLANLA', res.reason === 'past'
        ? tx('Bu tarih geçmiş.', 'This date is in the past.', 'Dieses Datum liegt in der Vergangenheit.')
        : tx('Plan kaydedilemedi.', 'The plan could not be saved.', 'Der Plan konnte nicht gespeichert werden.'));
      return;
    }
    setPlanPicking(false);
    const p = res.plan;
    const lines = [tx(
      `Alışveriş günün: ${formatShopDate(p.shopDate)}.\nHatırlatma: ${formatRemindAt(p.remindAt)}.`,
      `Shopping day: ${p.shopDate}. Reminder: ${formatRemindAt(p.remindAt)}.`,
      `Einkaufstag: ${p.shopDate}. Erinnerung: ${formatRemindAt(p.remindAt)}.`
    )];
    if (res.notif && res.notif.reason === 'permission') {
      lines.push(tx('Bildirim izni kapalı olduğu için hatırlatma gelmeyecek. Ayarlar > Bildirimler\'den açabilirsin.', 'Notifications are off, so the reminder will not arrive.', 'Benachrichtigungen sind aus.'));
    }
    lines.push(p.items.length === 0
      ? tx('⚠️ Alışveriş listen şu an boş. Fiş okut ya da ürünleri elle ekle; eklediğin her ürün hatırlatmaya otomatik dahil olur.', '⚠️ Your shopping list is empty. Add items; they are included automatically.', '⚠️ Deine Einkaufsliste ist leer. Neue Artikel werden automatisch berücksichtigt.')
      : tx('Listene eklediğin her ürün hatırlatmaya otomatik dahil olur.', 'Items you add to your list are included automatically.', 'Neue Artikel werden automatisch berücksichtigt.'));
    Alert.alert(tx('Alışveriş planı kaydedildi', 'Shopping plan saved', 'Einkaufsplan gespeichert'), lines.join('\n\n'));
  } finally {
    setPlanBusy(false);
  }
};

const askCancelPlan = () => Alert.alert(
  'BAKPLANLA',
  tx('Alışveriş planını ve hatırlatmasını iptal etmek istiyor musun?', 'Cancel the shopping plan and its reminder?', 'Einkaufsplan und Erinnerung löschen?'),
  [{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' }, { text: tx('İptal et', 'Delete', 'Löschen'), style: 'destructive', onPress: () => { cancelShoppingPlan(dataScopeGeneration); } }]
);

const shopToday = istanbulTodayISO();
const dayChoices = Array.from({ length: 8 }, (_, i) => addDays(shopToday, i + 1));
const planActive = shoppingPlan && shoppingPlan.shopDate >= shopToday;
const planStores = planActive ? lastStoreSummary(shoppingPlan.items) : [];

const imageToBase64 = async (uri) => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Fiş görseli okunamadı.'));
    reader.onerror = () => reject(new Error('Fiş görseli dönüştürülemedi.'));
    reader.readAsDataURL(blob);
  });
};

const selectReceipt = async (source) => {
  if (loading || receiptInFlightRef.current || !listScopeReady) return;
  const requestScopeGeneration = dataScopeGeneration;
  receiptInFlightRef.current = true;
  try {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('BAKPLANLA', source === 'camera'
        ? tx('Fiş çekmek için kamera izni gerekiyor.', 'Camera permission is needed to photograph a receipt.', 'Für das Foto des Kassenbons ist die Kameraberechtigung nötig.')
        : tx('Fiş seçmek için galeri izni gerekiyor.', 'Gallery permission is needed to choose a receipt.', 'Für die Auswahl ist die Galerieberechtigung nötig.'));
      return;
    }
    // Fiş uzun olabilir: kırpma ekranı açılmaz (kırpınca üst/alt satırlar kayboluyordu).
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 });
    if (result.canceled || !result.assets?.length) return;

    setLoading(true);
    let image;
    try {
      image = await imageToBase64(result.assets[0].uri);
    } catch (readError) {
      throw makeSmartError('local', null, tx('Fiş görseli okunamadı. Lütfen tekrar dene.', 'The receipt image could not be read. Please try again.', 'Das Bild des Kassenbons konnte nicht gelesen werden. Bitte versuche es erneut.'));
    }
    const saved = await analyzeAndAddReceiptForCurrentScope({
      expectedGeneration: requestScopeGeneration,
      isCurrent: isCurrentDataScope,
      analyzeReceipt: async () => {
        const data = await callSmartJson({ mode: 'receipt', image }, () => isCurrentDataScope(requestScopeGeneration));
        if (!data.success) {
          const serverMessage = typeof data.error === 'string' ? data.error.trim().slice(0, 200) : '';
          throw serverMessage ? makeSmartError('http', null, serverMessage) : makeSmartError('format');
        }
        // Newer functions return a receipt object; older ones return the legacy fields.
        const receipt = normalizeReceipt(data.receipt || {
          items: data.items,
          total: data.receipt_total,
          date: data.receipt_date,
        });
        if (!receipt) throw makeSmartError('local', null, tx('Fişte okunabilir ürün bulunamadı. Daha net bir fotoğraf deneyebilirsin.', 'No readable products were found on the receipt. Try a clearer photo.', 'Auf dem Kassenbon wurden keine lesbaren Produkte gefunden. Versuche ein deutlicheres Foto.'));
        return receipt;
      },
      sourceUri: result.assets[0].uri,
      persistImage,
      removeImage,
      addDocument: addReceiptDocument,
    });
    if (saved.stale) return;
    const receipt = saved.receipt;
    setSelectedReceiptId(saved.id);

    setItems((current) => mergeReceiptIntoList(current, receipt, (i) => `${Date.now()}-${i}`).items);

    const store = receiptStoreName(receipt);
    const lines = [
      saved.duplicate
        ? tx('Bu fiş daha önce eklenmiş; Belgeler\'e tekrar eklenmedi.', 'This receipt was already added; it was not added to Documents again.', 'Dieser Kassenbon wurde bereits hinzugefügt.')
        : tx(`${store} fişi Belgeler'e kaydedildi.`, `${store} receipt saved to Documents.`, `${store}-Kassenbon unter Dokumente gespeichert.`),
      tx(`${receipt.items.length} ürün okundu.`, `${receipt.items.length} items read.`, `${receipt.items.length} Artikel erkannt.`),
    ];
    if (receipt.totals_match === false) {
      lines.push(tx(
        `Dikkat: ürünlerin toplamı (${formatTL(receipt.items_total)}) fiş toplamıyla (${formatTL(receipt.total)}) tutmuyor; bazı satırlar okunamamış olabilir.`,
        `Note: item total (${formatTL(receipt.items_total)}) does not match the receipt total (${formatTL(receipt.total)}).`,
        `Hinweis: Die Artikelsumme stimmt nicht mit dem Bonbetrag überein.`
      ));
    }
    lines.push(tx('Ürün adlarını ve fiyatları kontrol etmeyi unutma.', 'Please check the item names and prices.', 'Bitte prüfe Artikelnamen und Preise.'));
    Alert.alert(tx('Fiş analiz edildi', 'Receipt analyzed', 'Kassenbon analysiert'), lines.join('\n\n'));
  } catch (error) {
    if (!isCurrentDataScope(requestScopeGeneration)) return;
    logSmartError('Receipt error:', error);
    Alert.alert(
      tx('Fiş analiz edilemedi', 'Receipt could not be analyzed', 'Kassenbon konnte nicht analysiert werden'),
      smartErrorMessage(error, lang, { tr: 'Bir hata oluştu.', en: 'Something went wrong.', de: 'Es ist ein Fehler aufgetreten.' })
    );
  } finally {
    receiptInFlightRef.current = false;
    setLoading(false);
  }
};

const addItem = () => {
  if (!listScopeReady) return;
  const name = newItem.trim();
  if (!name) return;
  setItems((current) => [...current, { id: `${Date.now()}`, name, quantity: 1, unit: 'adet', checked: false, source: 'manual', estimatedPrice: null }]);
  setNewItem('');
};

const changeQuantity = (id, delta) => { if (listScopeReady) setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, (Number(item.quantity) || 1) + delta) } : item)); };
const removeItem = (id) => { if (listScopeReady) setItems((current) => current.filter((item) => item.id !== id)); };
const checkedCount = scopedItems.filter((item) => item.checked).length;
const readyForCompare = receiptDocs.reduce((sum, d) => sum + comparableCount(d.analysis.receipt), 0);

const itemSubtitle = (item) => {
  const parts = [item.source === 'receipt' ? tx('Fişten', 'From receipt', 'Aus Bon') : tx('Elle eklendi', 'Added manually', 'Manuell')];
  if (item.lastStore) parts.push(item.lastStore);
  if (item.lastPrice !== null && item.lastPrice !== undefined) parts.push(`${formatTL(item.lastPrice)}${item.unit && item.unit !== 'adet' ? ` / ${item.unit}` : ''}`);
  return parts.join(' · ');
};

return (
<Screen>
  <ScreenHeader title={tx('Akıllı Alışveriş', 'Smart Shopping', 'Intelligenter Einkauf')} subtitle={tx('Fişinden gelecek haftanın listesine', 'From receipt to next week’s list', 'Vom Bon zur Wochenliste')} />
  <View style={s.card}>
    <Text style={s.cardTitle}>{tx('Fişini ekle', 'Add your receipt', 'Kassenbon hinzufügen')}</Text>
    <Text style={{ color: c.sub, lineHeight: 20, marginTop: 6 }}>{tx('Market, şube, tarih ve ürünleri fiyatlarıyla okur; fişi Belgeler\'e kaydeder ve ürünleri listene ekler. Fişin tamamı görünecek şekilde, düz çek.', 'Reads the store, branch, date and items with prices; saves the receipt to Documents and adds items to your list. Photograph the whole receipt, flat.', 'Liest Markt, Filiale, Datum und Artikel mit Preisen; speichert den Bon und ergänzt deine Liste.')}</Text>
    <TouchableOpacity style={[s.primaryBtn, { marginTop: 14 }]} disabled={loading} onPress={() => selectReceipt('camera')}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>📷 {tx('Fişin fotoğrafını çek', 'Take receipt photo', 'Kassenbon fotografieren')}</Text>}
    </TouchableOpacity>
    <TouchableOpacity style={[s.secondaryBtn, { marginTop: 9 }]} disabled={loading} onPress={() => selectReceipt('gallery')}>
      <Text style={s.secondaryBtnText}>🖼️ {tx('Galeriden fiş seç', 'Choose receipt from gallery', 'Kassenbon aus Galerie wählen')}</Text>
    </TouchableOpacity>
  </View>

  <View style={s.card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="calendar-outline" size={20} color={c.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{tx('Alışveriş planı', 'Shopping plan', 'Einkaufsplan')}</Text>
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{planActive
          ? `${formatShopDate(shoppingPlan.shopDate)}`
          : tx('Alışverişten 1 gün önce hatırlatayım', 'I will remind you 1 day before', 'Ich erinnere dich 1 Tag vorher')}</Text>
      </View>
    </View>

    {planActive && !planPicking && (
      <>
        <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: c.soft }}>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>⏰ {tx('Hatırlatma', 'Reminder', 'Erinnerung')}: {formatRemindAt(shoppingPlan.remindAt)}</Text>
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
            {shoppingPlan.items.length
              ? tx(`Listendeki ${shoppingPlan.items.length} ürün hatırlatmaya dahil.`, `${shoppingPlan.items.length} items from your list are included.`, `${shoppingPlan.items.length} Artikel enthalten.`)
              : ''}
            {planStores.length ? ` ${tx('Geçen sefer', 'Last time', 'Zuletzt')}: ${planStores.map((x) => `${x.store} ${formatTL(x.total)}`).join(', ')}.` : ''}
          </Text>
          {shoppingPlan.items.length === 0 && (
            <Text style={{ color: c.orange, fontSize: 12, marginTop: 4, lineHeight: 18, fontWeight: '700' }}>⚠️ {tx('Alışveriş listen boş. Aşağıdan ürün ekle ya da fiş okut; hatırlatma otomatik güncellenir.', 'Your shopping list is empty. Add items below; the reminder updates automatically.', 'Deine Einkaufsliste ist leer. Füge unten Artikel hinzu.')}</Text>
          )}
          <Text style={{ color: c.sub, fontSize: 11, marginTop: 6, lineHeight: 16 }}>{tx(
            'Hangi markette daha ucuz olduğu bilgisi, resmî fiyat verisi bağlandığında bu hatırlatmaya otomatik eklenecek.',
            'Which store is cheaper will be added automatically once official price data is connected.',
            'Günstigere Märkte werden ergänzt, sobald offizielle Preisdaten angebunden sind.'
          )}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setPlanPicking(true)}>
            <Text style={s.secondaryBtnText}>{tx('Tarihi değiştir', 'Change date', 'Datum ändern')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.secondaryBtn, { flex: 1 }]} onPress={askCancelPlan}>
            <Text style={[s.secondaryBtnText, { color: c.red }]}>{tx('İptal et', 'Cancel', 'Löschen')}</Text>
          </TouchableOpacity>
        </View>
      </>
    )}

    {(!planActive || planPicking) && (
      <>
        <Text style={{ color: c.sub, lineHeight: 20, marginTop: 10 }}>{tx('Ne zaman alışverişe gideceksin? Bir gün önce akşam 19:00\'da listeni ve geçen sefer ödediğin fiyatları hatırlatırım.', 'When will you go shopping? I will remind you at 19:00 the day before.', 'Wann gehst du einkaufen? Ich erinnere dich am Vortag um 19:00.')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
          {dayChoices.map((d, i) => {
            const active = planActive && shoppingPlan.shopDate === d;
            const parts = formatShopDate(d).split(' ');
            return (
              <TouchableOpacity key={d} disabled={planBusy} onPress={() => choosePlanDate(d)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: active ? c.green : c.border, backgroundColor: active ? c.soft : c.card, alignItems: 'center', minWidth: 74 }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 13 }}>{i === 0 ? tx('Yarın', 'Tomorrow', 'Morgen') : parts[2]}</Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{parts[0]} {parts[1]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {planBusy && <ActivityIndicator color={c.green} style={{ marginTop: 10 }} />}
        {planPicking && (
          <TouchableOpacity onPress={() => setPlanPicking(false)} style={{ marginTop: 10 }}><Text style={s.link}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text></TouchableOpacity>
        )}
      </>
    )}
  </View>

  {shownDoc && (
    <>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>{tx('Fişlerim', 'My receipts', 'Meine Kassenbons')}</Text>
          <Text style={s.sectionSub}>{receiptDocs.length} {tx('fiş', 'receipts', 'Bons')}</Text>
        </View>
        <TouchableOpacity onPress={() => openDocument(shownDoc.id)}><Text style={s.link}>{tx('Belgede aç', 'Open document', 'Dokument öffnen')}</Text></TouchableOpacity>
      </View>
      {receiptDocs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
          {receiptDocs.slice(0, 12).map((d) => {
            const r = d.analysis.receipt;
            const active = d.id === shownDoc.id;
            return (
              <TouchableOpacity key={d.id} onPress={() => setSelectedReceiptId(d.id)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: active ? c.green : c.border, backgroundColor: active ? c.soft : c.card }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 13 }}>{receiptStoreName(r)}</Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{r.date ? receiptDateText({ date: r.date }) : '—'} · {formatTL(r.total)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      <ReceiptCard receipt={shownDoc.analysis.receipt} />
    </>
  )}

  <View style={s.sectionHeader}>
    <View style={{ flex: 1 }}>
      <Text style={s.sectionTitle}>{tx('Alışveriş listem', 'My shopping list', 'Meine Einkaufsliste')}</Text>
       <Text style={s.sectionSub}>{scopedItems.length} {tx('ürün', 'items', 'Artikel')} · {checkedCount} {tx('alındı', 'checked', 'erledigt')}</Text>
    </View>
    {scopedItems.length > 0 && <TouchableOpacity onPress={() => Alert.alert('BAKPLANLA', tx('Listedeki tüm ürünleri silmek istiyor musun? Fişlerin Belgeler\'de kalır.', 'Delete all items from the list? Your receipts stay in Documents.', 'Alle Artikel löschen? Deine Bons bleiben unter Dokumente.'), [{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' }, { text: tx('Temizle', 'Clear', 'Leeren'), style: 'destructive', onPress: () => { if (listScopeReady) setItems([]); } }])}><Text style={s.link}>{tx('Temizle', 'Clear', 'Leeren')}</Text></TouchableOpacity>}
  </View>

  <View style={[s.card, { marginBottom: 12 }]}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <TextInput value={newItem} onChangeText={setNewItem} placeholder={tx('Ürün ekle (örn. süt)', 'Add item (e.g. milk)', 'Artikel hinzufügen (z. B. Milch)')} placeholderTextColor={c.muted} returnKeyType="done" onSubmitEditing={addItem} style={{ flex: 1, backgroundColor: c.input, color: c.text, borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: c.border }} />
      <TouchableOpacity onPress={addItem} style={{ height: 48, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.green, justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>+ {tx('Ekle', 'Add', 'Hinzufügen')}</Text></TouchableOpacity>
    </View>
  </View>

  {scopedItems.length === 0 ? (
    <View style={s.card}><Text style={s.cardTitle}>{tx('Listen henüz boş', 'Your list is empty', 'Deine Liste ist leer')}</Text><Text style={{ color: c.sub, marginTop: 6 }}>{tx('Fiş fotoğrafı ekle veya ürünleri kendin yaz.', 'Add a receipt photo or enter products manually.', 'Füge einen Kassenbon hinzu oder gib Produkte manuell ein.')}</Text></View>
  ) : scopedItems.map((item) => (
    <View key={item.id} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9, padding: 13 }]}>
      <TouchableOpacity onPress={() => { if (listScopeReady) setItems((current) => current.map((x) => x.id === item.id ? { ...x, checked: !x.checked } : x)); }} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: item.checked ? c.green : c.border, backgroundColor: item.checked ? c.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{item.checked ? '✓' : ''}</Text></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 15, fontWeight: '700', textDecorationLine: item.checked ? 'line-through' : 'none' }}>{item.name}</Text><Text style={{ color: c.sub, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{itemSubtitle(item)}</Text></View>
      <TouchableOpacity onPress={() => changeQuantity(item.id, -1)} style={{ width: 28, height: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 20 }}>−</Text></TouchableOpacity>
      <Text style={{ color: c.text, fontWeight: '800', minWidth: 18, textAlign: 'center' }}>{formatQty(item.quantity)}</Text>
      <TouchableOpacity onPress={() => changeQuantity(item.id, 1)} style={{ width: 28, height: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.text, fontSize: 20 }}>+</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => removeItem(item.id)} style={{ paddingLeft: 4 }}><Ionicons name="trash-outline" size={19} color={c.red} /></TouchableOpacity>
    </View>
  ))}
  <View style={[s.card, { marginTop: 8, marginBottom: 20 }]}>
    <Text style={s.cardTitle}>{tx('Market fiyat karşılaştırması', 'Supermarket price comparison', 'Supermarkt-Preisvergleich')}</Text>
    <Text style={{ color: c.sub, marginTop: 6, lineHeight: 20 }}>{readyForCompare > 0
      ? tx(`Fişlerinden ${readyForCompare} ürün karşılaştırmaya hazır. Gerçek market fiyatları ve tasarruf hesabı, izinli ve güncel bir fiyat veri kaynağı bağlandıktan sonra açılacak; şu anda başka marketlerin fiyatı veya tasarruf tahmini gösterilmiyor.`, `${readyForCompare} items from your receipts are ready for comparison. Live supermarket prices will be enabled once an authorized price source is connected; no estimates are shown yet.`, `${readyForCompare} Artikel sind bereit für den Vergleich. Aktuelle Preise folgen nach Anbindung einer autorisierten Preisquelle.`)
      : tx('Gerçek market fiyatları ve tasarruf hesabı, izinli ve güncel bir fiyat veri kaynağı bağlandıktan sonra açılacak; şu anda fiyat veya tasarruf tahmini gösterilmiyor.', 'Live supermarket prices and savings will be enabled after an authorized, current price source is connected; no price or savings estimate is shown yet.', 'Aktuelle Supermarktpreise und Ersparnisse folgen nach Anbindung einer autorisierten Preisquelle; derzeit werden keine Preise geschätzt.')}</Text>
  </View>
</Screen>
);
};

const renderScreen = () => {
switch (screen) {
case 'documents':
return <DocumentsScreenView
s={s}
c={c}
tx={tx}
lang={lang}
documents={documents}
openDocument={openDocument}
openAddSheet={openAddSheet}
Screen={Screen}
ScreenHeader={ScreenHeader}
EmptyCard={EmptyCard}
/>
case 'documentDetail':
return <DocumentDetailScreenView document={documents.find((d) => d.id === selectedDocumentId)} dataScopeGeneration={ctx.dataScopeGeneration} isCurrentDataScope={ctx.isCurrentDataScope} isAnalysisInFlight={ctx.documentAnalysisInFlight} s={ctx.s} c={ctx.c} tx={ctx.tx} lang={ctx.lang} analyzeDocument={ctx.analyzeDocument} deleteDocument={ctx.deleteDocument} createTaskFromDocument={ctx.createTaskFromDocument} Screen={Screen} ScreenHeader={ScreenHeader} EmptyCard={EmptyCard} ReceiptCard={ReceiptCard} />;
case 'calendar':
return (
<CalendarScreen
calendar={{ s, c, tx, lang, tasks, today, taskRow: { s, c, tx, lang, today, openTask, toggleTask }, calendarMode, setCalendarMode, openNewTask, shoppingPlan, navigate }}
components={{ Screen, ScreenHeader, EmptyCard, TaskRow }}
/>
);
case 'ai':
return <AiScreenView s={ctx.s} c={ctx.c} tx={ctx.tx} lang={ctx.lang} documents={ctx.documents} userId={session?.user?.id || null} dataScopeGeneration={ctx.dataScopeGeneration} isCurrentDataScope={ctx.isCurrentDataScope} readShoppingList={() => AsyncStorage.getItem('PLAN_SHOPPING_LIST_V1')} requestChat={(body, isCurrent) => callSmartJson(body, isCurrent)} createAiReminder={ctx.createAiReminder} saveShoppingPlan={ctx.saveShoppingPlan} logSmartError={logSmartError} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'opportunities':
return <OpportunitiesScreenView s={ctx.s} c={ctx.c} tx={ctx.tx} lang={ctx.lang} documents={ctx.documents} dataScopeGeneration={ctx.dataScopeGeneration} isCurrentDataScope={ctx.isCurrentDataScope} requestOpportunities={(analyzedDocuments, isCurrent) => callSmartJson({ mode: 'opportunities', documents: analyzedDocuments }, isCurrent)} logSmartError={logSmartError} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'qr':
return <QrScreenView s={ctx.s} c={ctx.c} tx={ctx.tx} lang={ctx.lang} userId={session?.user?.id || null} setShowAuthModal={setShowAuthModal} deviceId={deviceId} deviceName={deviceName} dataScopeGeneration={ctx.dataScopeGeneration} isCurrentDataScope={ctx.isCurrentDataScope} services={{ listDevices: (uid) => listDevices(supabase, uid), upsertOwnDevice: (input) => upsertOwnDevice(supabase, input), removeDevice: (uid, id) => removeDevice(supabase, uid, id), createPairingCode: () => createPairingCode(supabase), redeemPairingCode: (input) => redeemPairingCode(supabase, input) }} backupErrorText={backupErrorText} Screen={Screen} ScreenHeader={ScreenHeader} EmptyCard={EmptyCard} />;
case 'cloud':
return <CloudScreenView
s={s} c={c} tx={tx} lang={lang} session={session} setShowAuthModal={setShowAuthModal}
backupBusy={backupBusy} backupStatus={backupStatus} backupInfo={backupInfo} refreshBackupInfo={refreshBackupInfo}
cloudMeta={cloudMeta} refreshCloudMeta={refreshCloudMeta} runBackup={runBackup} runRestore={runRestore} undoRestore={undoRestore}
deleteCloudBackup={deleteCloudBackup} backupErrorText={backupErrorText} Screen={Screen} ScreenHeader={ScreenHeader}
/>;
case 'notifications':
return <NotificationsScreen s={s} c={c} tx={tx} tasks={tasks} today={today} notifPrefs={notifPrefs} notifPermission={notifPermission} updateNotifPrefs={updateNotifPrefs} toggleTaskReminders={toggleTaskReminders} refreshNotifPermission={refreshNotifPermission} sendTestNotif={sendTestNotif} Screen={Screen} ScreenHeader={ScreenHeader} Chip={Chip} />;
case 'promo':
return <PromoKodScreen app={ctx} supabase={supabase} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'isletmeTanit':
return <IsletmeTanitScreen app={ctx} supabase={supabase} supabaseUrl={SUPABASE_URL} publishableKey={SUPABASE_PUBLISHABLE_KEY} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'compass':
return <CompassScreen app={{ s, c, tx, lang, showToast, navigate }} Screen={Screen} ScreenHeader={ScreenHeader} Chip={Chip} isKoprusuActive={IS_KOPRUSU_AKTIF} />;
case 'isbasi':
return <IsBasiScreen s={ctx.s} c={ctx.c} tx={ctx.tx} lang={ctx.lang} showToast={ctx.showToast} navigate={ctx.navigate} dataScopeGeneration={ctx.dataScopeGeneration} isCurrentDataScope={ctx.isCurrentDataScope} Screen={Screen} ScreenHeader={ScreenHeader} ibApi={ibApi} isKoprusuActive={IS_KOPRUSU_AKTIF} />;
case 'prova':
return <MeslekProvasiScreen app={ctx} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'koprusu':
if (!IS_KOPRUSU_AKTIF) return <ComingSoonScreen title={tx('İş Köprüsü', 'Job Bridge', 'Job-Brücke')} text={tx('İş Köprüsü çok yakında açılacak.', 'Job Bridge is coming soon.', 'Die Job-Brücke kommt bald.')} />;
return <MeslekPasaportuScreen app={ctx} supabase={supabase} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'koprusuBiz':
// Eski eşleştirmeli İşletme Paneli kapalı (ISLETME_PANELI_AKTIF = false). Eski bağlantı gelirse pasaport açılır.
return <MeslekPasaportuScreen app={ctx} supabase={supabase} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'pro':
return <ProScreenView
s={s} c={c} tx={tx} lang={lang} goBack={goBack}
entitlement={entitlement} proActive={proActive} proInfo={proInfo} refreshEntitlement={refreshEntitlement}
backupErrorText={backupErrorText} Screen={Screen} ScreenHeader={ScreenHeader}
/>;
case 'today':
return <TodayScreenView s={ctx.s} c={ctx.c} tx={ctx.tx} lang={ctx.lang} todayPreferences={ctx.todayPreferences} setTodayPreferences={ctx.setTodayPreferences} dataScopeGeneration={ctx.dataScopeGeneration} isCurrentDataScope={ctx.isCurrentDataScope} requestPlaces={(params, isCurrent) => callSmartJson({ mode: 'places', ...params }, isCurrent)} openLegal={openLegal} logSmartError={logSmartError} Chip={Chip} Screen={Screen} ScreenHeader={ScreenHeader} />;
case 'shopping':
return <ShoppingListScreen />;
case 'profile':
return <ProfileScreenView
s={s} c={c} tx={tx} userName={userName} session={session} navigate={navigate}
setShowPlanModal={setShowPlanModal} setShowAppearanceModal={setShowAppearanceModal} setShowAuthModal={setShowAuthModal}
resetData={resetData} deleteAccount={deleteAccount} accountDeleting={accountDeleting} proActive={proActive} proInfo={proInfo} notifPrefs={notifPrefs}
isletmePanelActive={ISLETME_PANELI_AKTIF} appVersion={APP_VERSION} supportEmail={SUPPORT_EMAIL} legalUrls={LEGAL_URLS}
openLegal={openLegal} withdrawAiConsent={withdrawAiConsent} Screen={Screen} ScreenHeader={ScreenHeader} MenuRow={MenuRow}
/>;
case 'home':
default:
return (
<HomeScreenView
s={s} c={c} tx={tx} lang={lang} today={today} userName={userName} lifeScore={lifeScore} tasks={tasks}
goTab={goTab} navigate={navigate} openAddSheet={openAddSheet} openNewTask={openNewTask}
openTask={openTask} openTasksList={openTasksList} toggleTask={toggleTask}
isKoprusuActive={IS_KOPRUSU_AKTIF} Screen={Screen} LogoBadge={LogoBadge} EmptyCard={EmptyCard} TaskRow={TaskRow}
/>
);
}
};

return (
<AppContext.Provider value={ctx}>
<View style={s.root}>
{session && !isPasswordRecovery ? (
<>
{renderScreen()}
<BottomNavigation />
</>
) : (
<WelcomeScreen />
)}


{!!toastMessage && (
<View style={s.toast} pointerEvents="none">
<Text style={s.toastText}>{toastMessage}</Text>
</View>
)}

<AddSheet />
<TaskModal />
<AppearanceModal />
<PlanModal />
{showAuthModal && !isPasswordRecovery && authMode !== 'recoveryCode' && (
<View onStartShouldSetResponder={() => true} onResponderRelease={() => { Keyboard.dismiss(); setShowAuthModal(false); setAuthMessage(''); }}
style={{
position: 'absolute',
top: 0,
left: 0,
right: 0,
bottom: 0,
backgroundColor: 'rgba(0,0,0,0.55)',
justifyContent: 'flex-end',
zIndex: 9999,
}}
>
<KeyboardAvoidingView
behavior="padding"
style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}
>

<View onStartShouldSetResponder={() => true} onResponderRelease={() => Keyboard.dismiss()}
style={{
backgroundColor: '#F9F7EF',
borderTopLeftRadius: 28,
borderTopRightRadius: 28,
padding: 24,
paddingBottom: 30,
}}
>
<View
style={{
width: 45,
height: 5,
borderRadius: 5,
backgroundColor: '#D0D0D0',
alignSelf: 'center',
marginBottom: 22,
}}
/>

<Text
style={{
fontSize: 25,
fontWeight: '800',
color: '#063F3A',
marginBottom: 8,
}}
>
{authMode === 'login' ? 'BAKPLANLA’ya Giriş Yap' : 'BAKPLANLA’ya Kayıt Ol'}
</Text>

<Text
style={{
fontSize: 14,
color: '#68706D',
marginBottom: 20,
}}
>
{authMode === 'login'
? 'Belgelerine ve BAKPLANLA özelliklerine devam etmek için giriş yap.'
: 'BAKPLANLA hesabını oluştur ve tüm özelliklerini kullanmaya başla.'}
</Text>

<TextInput
value={authEmail}
onChangeText={setAuthEmail}
placeholder="E-posta adresin"
placeholderTextColor="#9A9A9A"
keyboardType="email-address"
autoCapitalize="none"
style={{
backgroundColor: '#FFFFFF',
borderWidth: 1,
borderColor: '#D9DDD8',
borderRadius: 14,
paddingHorizontal: 16,
height: 54,
marginBottom: 12,
color: '#163F3B',
fontSize: 15,
}}
/>

<TextInput
value={authPassword}
onChangeText={setAuthPassword}
placeholder="Şifren"
placeholderTextColor="#9A9A9A"
secureTextEntry
style={{
backgroundColor: '#FFFFFF',
borderWidth: 1,
borderColor: '#D9DDD8',
borderRadius: 14,
paddingHorizontal: 16,
height: 54,
marginBottom: 12,
color: '#163F3B',
fontSize: 15,
}}
/>
{authMode === 'login' && (
<TouchableOpacity
onPress={handleResetPassword}
disabled={authLoading}
style={{
alignSelf: 'flex-end',
paddingVertical: 8,
marginBottom: 8,
}}
>
<Text
style={{
color: '#087A66',
fontSize: 14,
fontWeight: '700',
}}
>
Şifremi unuttum?
</Text>
</TouchableOpacity>
)}

{authMode !== 'login' && (
<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
<TouchableOpacity
onPress={() => setSignupConsent(!signupConsent)}
hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
style={{
width: 24,
height: 24,
borderRadius: 6,
borderWidth: 2,
borderColor: '#087A66',
backgroundColor: signupConsent ? '#087A66' : '#FFFFFF',
alignItems: 'center',
justifyContent: 'center',
marginRight: 10,
marginTop: 1,
}}
>
{signupConsent && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
</TouchableOpacity>
<Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: '#40504C' }}>
18 yaşından büyüğüm.{' '}
<Text style={{ color: '#087A66', fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL_URLS.terms)}>Kullanım Koşulları</Text>
'nı kabul ediyorum;{' '}
<Text style={{ color: '#087A66', fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL_URLS.privacy)}>Gizlilik Politikası</Text>
{' '}ve{' '}
<Text style={{ color: '#087A66', fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL_URLS.kvkk)}>KVKK Aydınlatma Metni</Text>
'ni okudum.
</Text>
</View>
)}

{!!verifyEmail && (
<View
style={{
backgroundColor: '#E8F5EF',
borderWidth: 1,
borderColor: '#0A9F7A',
borderRadius: 14,
padding: 14,
marginBottom: 12,
}}
>
<Text style={{ color: '#063F3A', fontSize: 15, fontWeight: '800', marginBottom: 6 }}>
📧 E-postanı doğrula
</Text>
<Text style={{ color: '#2F4A45', fontSize: 13, lineHeight: 19 }}>
{verifyEmail} adresine bir doğrulama linki gönderdik. Linke tıkla, sonra buraya dönüp şifrenle giriş yap. Mail gelmediyse Spam / Gereksiz klasörüne bak.
</Text>
<TouchableOpacity
onPress={handleResendVerification}
disabled={resendBusy}
style={{ alignSelf: 'flex-start', paddingVertical: 8, marginTop: 4 }}
>
<Text style={{ color: '#087A66', fontSize: 14, fontWeight: '800' }}>
{resendBusy ? 'Gönderiliyor...' : 'Doğrulama e-postasını tekrar gönder'}
</Text>
</TouchableOpacity>
{!!resendNote && (
<Text style={{ color: '#40504C', fontSize: 12, lineHeight: 17 }}>{resendNote}</Text>
)}
</View>
)}

{!!authMessage && (
<Text
style={{
color: '#B3261E',
fontSize: 13,
marginBottom: 12,
}}
>
{authMessage}
</Text>
)}

<TouchableOpacity
disabled={authLoading}
onPress={authMode === 'login' ? handleSignIn : handleSignUp}
style={{
height: 54,
borderRadius: 15,
backgroundColor: '#0A9F7A',
justifyContent: 'center',
alignItems: 'center',
marginBottom: 12,
}}
>
<Text
style={{
color: '#FFFFFF',
fontSize: 16,
fontWeight: '800',
}}
>
{authLoading
? 'Lütfen bekle...'
: authMode === 'login'
? 'Giriş Yap'
: 'Kayıt Ol'}
</Text>
</TouchableOpacity>

<TouchableOpacity
onPress={() => {
setAuthMode(authMode === 'login' ? 'signup' : 'login');
setAuthMessage('');
}}
style={{
alignItems: 'center',
paddingVertical: 10,
}}
>
<Text
style={{
color: '#087A66',
fontSize: 14,
fontWeight: '700',
}}
>
{authMode === 'login'
? 'Hesabın yok mu? Kayıt ol'
: 'Zaten hesabın var mı? Giriş yap'}
</Text>
</TouchableOpacity>

<TouchableOpacity
onPress={() => {
setShowAuthModal(false);
setAuthMessage('');
setVerifyEmail('');
}}
style={{
alignItems: 'center',
paddingVertical: 8,
}}
>
<Text
style={{
color: '#777777',
fontSize: 14,
}}
>
Vazgeç
</Text>
</TouchableOpacity>
</View>
</KeyboardAvoidingView>
</View>
)}

{showAuthModal && (isPasswordRecovery || authMode === 'recoveryCode') && (
<View
style={{
position: 'absolute',
top: 0,
left: 0,
right: 0,
bottom: 0,
backgroundColor: 'rgba(0,0,0,0.55)',
justifyContent: 'flex-end',
zIndex: 9999,
}}
>
<KeyboardAvoidingView
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}
>
<View
style={{
backgroundColor: '#F9F7EF',
borderTopLeftRadius: 28,
borderTopRightRadius: 28,
padding: 24,
paddingBottom: 30,
}}
>
<View
style={{
width: 45,
height: 5,
borderRadius: 5,
backgroundColor: '#D0D0D0',
alignSelf: 'center',
marginBottom: 22,
}}
/>

<Text style={{ fontSize: 25, fontWeight: '800', color: '#063F3A', marginBottom: 8 }}>
{isPasswordRecovery ? 'Yeni Şifre Belirle' : 'Doğrulama Kodu'}
</Text>

<Text style={{ fontSize: 14, color: '#68706D', marginBottom: 20 }}>
{isPasswordRecovery
? 'BAKPLANLA hesabın için yeni bir şifre yaz.'
: authEmail.trim() + ' adresine gelen kodu yaz.'}
</Text>

{isPasswordRecovery ? (
<>
<TextInput
value={newPassword}
onChangeText={setNewPassword}
placeholder="Yeni şifre"
placeholderTextColor="#9A9A9A"
secureTextEntry
autoCapitalize="none"
style={{
backgroundColor: '#FFFFFF',
borderWidth: 1,
borderColor: '#D9DDD8',
borderRadius: 14,
paddingHorizontal: 16,
height: 54,
marginBottom: 12,
color: '#163F3B',
fontSize: 15,
}}
/>
<TextInput
value={confirmNewPassword}
onChangeText={setConfirmNewPassword}
placeholder="Yeni şifre (tekrar)"
placeholderTextColor="#9A9A9A"
secureTextEntry
autoCapitalize="none"
style={{
backgroundColor: '#FFFFFF',
borderWidth: 1,
borderColor: '#D9DDD8',
borderRadius: 14,
paddingHorizontal: 16,
height: 54,
marginBottom: 12,
color: '#163F3B',
fontSize: 15,
}}
/>
</>
) : (
<TextInput
value={recoveryCode}
onChangeText={setRecoveryCode}
placeholder="E-postadaki kod"
placeholderTextColor="#9A9A9A"
keyboardType="number-pad"
maxLength={10}
autoCapitalize="none"
style={{
backgroundColor: '#FFFFFF',
borderWidth: 1,
borderColor: '#D9DDD8',
borderRadius: 14,
paddingHorizontal: 16,
height: 54,
marginBottom: 12,
color: '#163F3B',
fontSize: 15,
}}
/>
)}

{!!recoveryInfo && !authMessage && (
<Text style={{ color: '#087A66', fontSize: 13, marginBottom: 12 }}>
{recoveryInfo}
</Text>
)}

{!!authMessage && (
<Text style={{ color: '#B3261E', fontSize: 13, marginBottom: 12 }}>
{authMessage}
</Text>
)}

<TouchableOpacity
disabled={authLoading}
onPress={isPasswordRecovery ? handleUpdatePassword : handleVerifyRecoveryCode}
style={{
height: 54,
borderRadius: 15,
backgroundColor: '#0A9F7A',
justifyContent: 'center',
alignItems: 'center',
marginBottom: 12,
}}
>
<Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
{authLoading
? 'Lütfen bekle...'
: isPasswordRecovery
? 'Şifreyi Kaydet'
: 'Kodu Doğrula'}
</Text>
</TouchableOpacity>

{!isPasswordRecovery && (
<TouchableOpacity
disabled={authLoading}
onPress={handleResetPassword}
style={{ alignItems: 'center', paddingVertical: 10 }}
>
<Text style={{ color: '#087A66', fontSize: 14, fontWeight: '700' }}>
Kodu tekrar gönder
</Text>
</TouchableOpacity>
)}

<TouchableOpacity
disabled={authLoading}
onPress={handleCancelRecovery}
style={{ alignItems: 'center', paddingVertical: 8 }}
>
<Text style={{ color: '#777777', fontSize: 14 }}>Vazgeç</Text>
</TouchableOpacity>
</View>
</KeyboardAvoidingView>
</View>
)}

{isLoading && (
<View style={s.loadingOverlay}>
<ActivityIndicator size="large" color={c.green} />
<Text style={s.loadingText}>{tx('PLAN çalışıyor...', 'PLAN is working...', 'PLAN arbeitet...')}</Text>
</View>
)}
</View>
</AppContext.Provider>
);
};

export default App;
