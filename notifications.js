/*
===========================================================
  BAKPLANLA — yerel bildirimler ve Expo push token erişimi (expo-notifications)
  Bu dosya cihaz içi zamanlamayı yönetir; mağaza sürümünde alışveriş push'u shopping-reminder gönderir.
  Web'de desteklenmez. Hiçbir işlev istisna fırlatmaz; sonuçlar { ok, ... } biçimindedir.

  NOT: Bu dosya gerçek bir cihazda/emülatörde denenmemiştir (geliştirme ortamında cihaz yok).
  Zamanlama mantığı (reminders.js) Node testleriyle doğrulanmıştır.
===========================================================
*/
import { Platform, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { planReminders, diffReminders, ID_PREFIX } from './reminders';

export const notificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';
const CHANNEL_ID = 'bakplanla-reminders';

let handlerSet = false;
let channelSet = false;

// Uygulama açıkken de bildirimin görünmesi için (bir kez).
export const initNotifications = () => {
  if (!notificationsSupported || handlerSet) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    handlerSet = true;
  } catch (error) {
    // sessizce geç
  }
};

const ensureChannel = async () => {
  if (Platform.OS !== 'android' || channelSet) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Hatırlatmalar',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    channelSet = true;
  } catch (error) {
    // kanal yoksa Android varsayılanı kullanılır
  }
};

// 'granted' | 'denied' (sistem artık sormaz; ayarlardan açılmalı) | 'undetermined' | 'unsupported'
export const getPermissionState = async () => {
  if (!notificationsSupported) return 'unsupported';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    if (p.canAskAgain === false) return 'denied';
    return 'undetermined';
  } catch (error) {
    return 'unsupported';
  }
};

export const requestPermission = async () => {
  if (!notificationsSupported) return 'unsupported';
  try {
    await ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false ? 'denied' : 'undetermined';
  } catch (error) {
    return 'unsupported';
  }
};

export const openSystemSettings = () => {
  try {
    Linking.openSettings();
  } catch (error) {
    // sessizce geç
  }
};

const listOurs = async () => {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return (all || [])
    .filter((n) => n && typeof n.identifier === 'string' && n.identifier.startsWith(ID_PREFIX))
    .map((n) => ({ identifier: n.identifier, data: (n.content && n.content.data) || {} }));
};

// Bizim planladığımız tüm hatırlatmaları iptal eder (başka bildirimlere dokunmaz).
export const cancelAllReminders = async () => {
  if (!notificationsSupported) return { ok: false, reason: 'unsupported' };
  try {
    const ours = await listOurs();
    await Promise.all(ours.map((o) => Notifications.cancelScheduledNotificationAsync(o.identifier)));
    return { ok: true, cancelled: ours.length };
  } catch (error) {
    return { ok: false, reason: 'error' };
  }
};

/*
  Görev listesine göre cihazdaki hatırlatmaları eşitler (farkı uygular).
  İzin yoksa hiçbir şey planlanmaz ve eskileri temizlenir.
*/
export const syncTaskReminders = async ({ tasks, prefs, lang }) => {
  if (!notificationsSupported) return { ok: false, reason: 'unsupported' };
  try {
    const permission = await getPermissionState();
    const planned = permission === 'granted' ? planReminders(tasks, prefs, Date.now(), lang) : [];
    const existing = await listOurs();
    const { toCancel, toSchedule } = diffReminders(existing, planned);
    await Promise.all(toCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    if (toSchedule.length) await ensureChannel();
    for (const item of toSchedule) {
      await Notifications.scheduleNotificationAsync({
        identifier: item.identifier,
        content: {
          title: item.title,
          body: item.body,
          sound: false,
          data: { fireAt: item.fireAt, body: item.body, taskId: item.taskId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(item.fireAt),
          channelId: CHANNEL_ID,
        },
      });
    }
    return { ok: true, scheduled: toSchedule.length, cancelled: toCancel.length, permission };
  } catch (error) {
    console.log('BAKPLANLA reminder sync error:', error && error.message ? error.message : 'unknown');
    return { ok: false, reason: 'error' };
  }
};

// Kullanıcının bildirimlerin çalıştığını gözle görmesi için: birkaç saniye sonra tek bildirim.
export const sendTestNotification = async ({ title, body, seconds = 5 }) => {
  if (!notificationsSupported) return { ok: false, reason: 'unsupported' };
  try {
    const permission = await getPermissionState();
    if (permission !== 'granted') return { ok: false, reason: 'permission' };
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'error' };
  }
};

/*
  PLAN AI HATIRLATMALARI (25 Ekim)
  Yapay zekâya "saat 18:50'de hatırlat" denince dakikası dakikasına TEK bir bildirim kurulur.
  Kimlik öneki görev hatırlatmalarından (ID_PREFIX) farklıdır; bu yüzden syncTaskReminders bunlara dokunmaz.
  Görev hatırlatmaları kapalı olsa bile çalışır (kullanıcı açıkça istediği için); izin yoksa izin istenir.
*/
export const AI_REMINDER_PREFIX = 'bakplanla-ai-';

export const scheduleAiReminder = async ({ taskId, title, body, at }) => {
  if (!notificationsSupported) return { ok: false, reason: 'unsupported' };
  try {
    const fireAt = new Date(at);
    if (!Number.isFinite(fireAt.getTime())) return { ok: false, reason: 'time' };
    if (fireAt.getTime() < Date.now() + 5000) return { ok: false, reason: 'past' };
    let permission = await getPermissionState();
    if (permission === 'undetermined') permission = await requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'permission', permission };
    await ensureChannel();
    const identifier = `${AI_REMINDER_PREFIX}${taskId}`;
    try { await Notifications.cancelScheduledNotificationAsync(identifier); } catch (e) { /* yoksa sorun değil */ }
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: String(title || 'BAKPLANLA').slice(0, 80),
        body: String(body || title || '').slice(0, 200),
        sound: true,
        data: { taskId, fireAt: fireAt.getTime(), kind: 'ai' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: CHANNEL_ID,
      },
    });
    return { ok: true, identifier };
  } catch (error) {
    console.log('BAKPLANLA ai reminder error:', error && error.message ? error.message : 'unknown');
    return { ok: false, reason: 'error' };
  }
};

export const cancelAiReminder = async (taskId) => {
  if (!notificationsSupported || taskId == null) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(`${AI_REMINDER_PREFIX}${taskId}`);
  } catch (error) {
    // sessizce geç
  }
};

/*
  ALIŞVERİŞ PLANI HATIRLATMASI (27 Ekim)
  Kullanıcı başına tek plan → tek sabit kimlik. Yeni plan eskisinin yerine geçer.
  Sunucudan bildirim (push) alabilen cihazlarda bu yerel bildirim KURULMAZ; sunucu gönderir.
*/
export const SHOPPING_REMINDER_ID = 'bakplanla-shopping-plan';

export const scheduleShoppingReminder = async ({ title, body, at }) => {
  if (!notificationsSupported) return { ok: false, reason: 'unsupported' };
  try {
    const fireAt = new Date(at);
    if (!Number.isFinite(fireAt.getTime())) return { ok: false, reason: 'time' };
    if (fireAt.getTime() < Date.now() + 5000) return { ok: false, reason: 'past' };
    let permission = await getPermissionState();
    if (permission === 'undetermined') permission = await requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'permission', permission };
    await ensureChannel();
    try { await Notifications.cancelScheduledNotificationAsync(SHOPPING_REMINDER_ID); } catch (e) { /* yoksa sorun değil */ }
    await Notifications.scheduleNotificationAsync({
      identifier: SHOPPING_REMINDER_ID,
      content: {
        title: String(title || 'BAKPLANLA').slice(0, 80),
        body: String(body || '').slice(0, 240),
        sound: true,
        data: { kind: 'shopping', fireAt: fireAt.getTime() },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: CHANNEL_ID,
      },
    });
    return { ok: true };
  } catch (error) {
    console.log('BAKPLANLA shopping reminder error:', error && error.message ? error.message : 'unknown');
    return { ok: false, reason: 'error' };
  }
};

export const cancelShoppingReminder = async () => {
  if (!notificationsSupported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(SHOPPING_REMINDER_ID);
  } catch (error) {
    // sessizce geç
  }
};

/*
  Sunucudan bildirim (push) anahtarı. Yalnızca EAS projesi olan (mağaza/geliştirme) sürümlerde
  alınabilir; Snack / Expo Go'da null döner ve uygulama yerel bildirime düşer.
*/
export const getPushTokenSafe = async (projectId) => {
  if (!notificationsSupported || !projectId) return null;
  try {
    const permission = await getPermissionState();
    if (permission !== 'granted') return null;
    const res = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    const token = res && typeof res.data === 'string' ? res.data : null;
    return token && /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token) ? token : null;
  } catch (error) {
    return null;
  }
};
