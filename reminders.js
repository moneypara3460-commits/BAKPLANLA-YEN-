/*
===========================================================
  BAKPLANLA — görev hatırlatma planlayıcısı
  Saf JavaScript (React Native / expo-notifications bağımlılığı yok) → Node ile test edilebilir.
  Ne zaman, hangi metinle bildirim planlanacağını hesaplar; gerçek zamanlama notifications.js'de yapılır.

  Yalnızca CİHAZ İÇİ (yerel) bildirimlerdir. Sunucudan anlık bildirim (push) yoktur.
===========================================================
*/

export const NOTIF_PREFS_KEY = 'PLAN_NOTIF_PREFS';
export const ID_PREFIX = 'bakplanla-task-';
// iOS aynı anda en fazla 64 yerel bildirim tutar; güvenli pay bırakılır.
export const MAX_SCHEDULED = 60;
export const MIN_LEAD_MS = 30 * 1000;
export const HOUR_OPTIONS = [8, 9, 12, 18];

export const DEFAULT_NOTIF_PREFS = {
  taskReminders: false, // kullanıcı bilerek açana kadar kapalı (izin de o sırada istenir)
  hour: 9,
  dayBefore: true,
};

export const normalizeNotifPrefs = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const hour = Number(r.hour);
  return {
    taskReminders: r.taskReminders === true,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_NOTIF_PREFS.hour,
    dayBefore: r.dayBefore === undefined ? DEFAULT_NOTIF_PREFS.dayBefore : r.dayBefore === true,
  };
};

// 'YYYY-MM-DD' → yerel saatle o günün verilen saatinde Date (ms). Geçersizse null.
export const localTimeMs = (iso, hour, dayOffset = 0) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d + dayOffset, hour, 0, 0, 0);
  // 2026-02-31 gibi taşan tarihleri reddet (Date sessizce Mart'a kaydırır).
  const check = new Date(y, mo - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
};

const clip = (text, max = 80) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const TEXTS = {
  tr: { due: 'Bugün: ', before: 'Yarın: ', title: 'BAKPLANLA' },
  en: { due: 'Today: ', before: 'Tomorrow: ', title: 'BAKPLANLA' },
  de: { due: 'Heute: ', before: 'Morgen: ', title: 'BAKPLANLA' },
  ar: { due: 'اليوم: ', before: 'غدًا: ', title: 'BAKPLANLA' },
};

/*
  Dönüş: [{ identifier, taskId, kind, fireAt, title, body }] — fireAt'e göre sıralı, en fazla MAX_SCHEDULED.
  - Tamamlanmış, geçersiz tarihli ve zamanı geçmiş hatırlatmalar planlanmaz.
  - Süresi geçmiş (gecikmiş) görevler için yeni bildirim üretilmez.
*/
export const planReminders = (tasks, prefsInput, now = Date.now(), lang = 'tr') => {
  const prefs = normalizeNotifPrefs(prefsInput);
  if (!prefs.taskReminders) return [];
  const tx = TEXTS[lang] || TEXTS.tr;
  const out = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || typeof t !== 'object' || t.completed || t.id == null) continue;
    const title = clip(t.title);
    if (!title) continue;
    const dueMs = localTimeMs(t.dueDate, prefs.hour, 0);
    if (dueMs != null && dueMs > now + MIN_LEAD_MS) {
      out.push({ identifier: `${ID_PREFIX}${t.id}-due`, taskId: t.id, kind: 'due', fireAt: dueMs, title: tx.title, body: `${tx.due}${title}` });
    }
    if (prefs.dayBefore) {
      const beforeMs = localTimeMs(t.dueDate, prefs.hour, -1);
      if (beforeMs != null && beforeMs > now + MIN_LEAD_MS) {
        out.push({ identifier: `${ID_PREFIX}${t.id}-before`, taskId: t.id, kind: 'before', fireAt: beforeMs, title: tx.title, body: `${tx.before}${title}` });
      }
    }
  }
  out.sort((a, b) => a.fireAt - b.fireAt || a.identifier.localeCompare(b.identifier));
  return out.slice(0, MAX_SCHEDULED);
};

/*
  Cihazda zaten planlı olanlarla yeni planı karşılaştırır.
  existing: [{ identifier, data: { fireAt, body } }]  (yalnızca bizim önekli olanlar dikkate alınır)
  Dönüş: { toCancel: [identifier], toSchedule: [planItem] }
  Aynı kimlik + aynı zaman + aynı metin ise dokunulmaz.
*/
export const diffReminders = (existing, planned) => {
  const ours = (Array.isArray(existing) ? existing : []).filter((e) => e && typeof e.identifier === 'string' && e.identifier.startsWith(ID_PREFIX));
  const plannedById = new Map(planned.map((p) => [p.identifier, p]));
  const existingById = new Map(ours.map((e) => [e.identifier, e]));
  const toCancel = [];
  for (const e of ours) {
    const p = plannedById.get(e.identifier);
    const same = p && e.data && Number(e.data.fireAt) === p.fireAt && e.data.body === p.body;
    if (!same) toCancel.push(e.identifier);
  }
  const toSchedule = planned.filter((p) => {
    const e = existingById.get(p.identifier);
    return !(e && e.data && Number(e.data.fireAt) === p.fireAt && e.data.body === p.body);
  });
  return { toCancel, toSchedule };
};
