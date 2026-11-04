/*
===========================================================
  BAKPLANLA — bulut yedekleme yardımcıları
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.
  Supabase istemcisi dışarıdan verilir; bu dosya ağ/Supabase ayarlarını bilmez.

  Sunucu tarafı: supabase/bakplanla_backup.sql (tablo + RLS) çalıştırılmış olmalıdır.
===========================================================
*/

export const BACKUP_TABLE = 'bakplanla_backups';
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_PAYLOAD_BYTES = 1500000;
export const BACKUP_TIMEOUT_MS = 20000;

// Cihaz tarafı anahtarlar (hesap kimliğiyle ayrılır).
export const DATA_OWNER_KEY = 'PLAN_DATA_OWNER';
export const backupMetaKey = (uid) => `PLAN_BACKUP_META:${uid}`;
export const preRestoreKey = (uid) => `PLAN_PRE_RESTORE:${uid}`;

/* ---------- bütünlük ---------- */

// Anahtar sırasından bağımsız (jsonb gidiş-dönüşünde sıra değişir) kararlı JSON.
export const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

// FNV-1a 32 bit: kazara bozulma/eksik aktarım kontrolü içindir, güvenlik amaçlı değildir.
export const checksumOf = (value) => {
  const str = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}-${str.length}`;
};

export const normalizeTitleKey = (title) =>
  String(title || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

/* ---------- yük (payload) ---------- */

// Görsel dosyaları cihaz yoluna bağlıdır ve yük (payload) içine konmaz: uri çıkarılır, hadImage işaretlenir.
// Görsel buluta (Storage) yüklendiyse imagePaths[doc.id] yolu belgeye imagePath olarak yazılır (ikili veri değil, yalnızca yol).
export const buildPayload = ({ tasks, documents, todayPreferences, imagePaths }) => {
  const cleanTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => t && typeof t === 'object');
  const paths = imagePaths && typeof imagePaths === 'object' ? imagePaths : {};
  const cleanDocs = (Array.isArray(documents) ? documents : [])
    .filter((d) => d && typeof d === 'object')
    .map((d) => {
      const { uri, ...rest } = d;
      const imagePath = paths[d.id] || rest.imagePath;
      const out = { ...rest, hadImage: Boolean(uri) };
      if (typeof imagePath === 'string' && imagePath) out.imagePath = imagePath;
      else delete out.imagePath;
      return out;
    });
  const payload = JSON.parse(
    JSON.stringify({
      tasks: cleanTasks,
      documents: cleanDocs,
      todayPreferences: todayPreferences && typeof todayPreferences === 'object' ? todayPreferences : {},
    })
  );
  return payload;
};

// UTF-8 bayt sayısı (Türkçe karakterler 2 bayt olabilir). TextEncoder'a bağlı değildir.
export const utf8Length = (str) => {
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i += 1; }
    else bytes += 3;
  }
  return bytes;
};

export const payloadBytes = (payload) => utf8Length(JSON.stringify(payload));

export const validateBackupRow = (row) => {
  if (!row || typeof row !== 'object') return { ok: false, reason: 'invalid' };
  if (row.schema_version !== BACKUP_SCHEMA_VERSION) return { ok: false, reason: 'version' };
  const p = row.payload;
  if (!p || typeof p !== 'object' || !Array.isArray(p.tasks) || !Array.isArray(p.documents)) {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof row.checksum !== 'string' || checksumOf(p) !== row.checksum) return { ok: false, reason: 'checksum' };
  return { ok: true, payload: p };
};

/* ---------- hata sınıflandırma ---------- */

export const classifyError = (error) => {
  if (!error) return 'other';
  if (error.kind === 'timeout') return 'network';
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  const status = Number(error.status || 0);
  if (code === 'PZ001' || msg.includes('cloud_backup_writes_disabled')) return 'unavailable';
  if (code === '23505') return 'conflict';
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || code === '42703' || /does not exist|schema cache/.test(msg)) return 'setup';
  if (status === 401 || status === 403 || code === '42501' || code === 'PGRST301' || /jwt|not authenticated|row-level security|permission denied/.test(msg)) return 'auth';
  if (/network|failed to fetch|fetch failed|timeout|timed out|offline|internet|connection/.test(msg)) return 'network';
  if (!status && !code && /typeerror/i.test(String(error.name || ''))) return 'network';
  return 'other';
};

const withTimeout = (promise, ms = BACKUP_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ kind: 'timeout', message: 'timeout' }), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

// Tüm sonuçlar { ok:true, ... } ya da { ok:false, reason } biçimindedir; istisna fırlatmaz, veri loglamaz.
const run = async (fn) => {
  try {
    return await withTimeout(fn());
  } catch (error) {
    return { ok: false, reason: classifyError(error), code: error && error.code ? String(error.code) : undefined };
  }
};

const BACKUP_STORE_ERROR_KINDS = new Set(['auth', 'conflict', 'network', 'setup', 'unavailable', 'other']);

const fromResult = (res) => {
  if (res && res.error) {
    const reason = BACKUP_STORE_ERROR_KINDS.has(res.error.kind) ? res.error.kind : classifyError(res.error);
    return { ok: false, reason, code: res.error.code ? String(res.error.code) : undefined };
  }
  return null;
};

/* ---------- backup persistence port ----------
  The application composition root supplies a BackupStore. Its methods return
  { data, error }; errors use the provider-neutral kind `auth`, `conflict`,
  `network`, `setup` or `other`, plus an optional diagnostic code.
  Every operation takes the requested owner explicitly and must preserve the
  current owner-scoped read/write contract. Implementations must also provide
  canWriteContentBackup(), returning an explicit server decision; absence or
  failure is closed. ---------- */

export const fetchBackup = (store, uid) =>
  run(async () => {
    const res = await store.fetchBackup(uid);
    const err = fromResult(res);
    if (err) return err;
    return { ok: true, row: res.data || null };
  });

export const fetchBackupMeta = (store, uid) =>
  run(async () => {
    const res = await store.fetchBackupMeta(uid);
    const err = fromResult(res);
    if (err) return err;
    return { ok: true, meta: res.data || null };
  });

// Fail closed if a store lacks the policy contract or the server does not
// explicitly authorize new content backups.
export const checkCloudBackupWritePolicy = (store) =>
  run(async () => {
    if (!store || typeof store.canWriteContentBackup !== 'function') {
      return { ok: false, reason: 'unavailable' };
    }
    const res = await store.canWriteContentBackup();
    const err = fromResult(res);
    if (err) return err;
    return res.data === true
      ? { ok: true }
      : { ok: false, reason: 'unavailable' };
  });

/*
  Yedekleme: kullanıcı başına tek satır (user_id birincil anahtar) → yinelenen kayıt oluşmaz.
  expectedUpdatedAt: bu cihazın en son gördüğü sunucu zamanı (yoksa null = bulutta kayıt beklenmiyor).
  Başka cihaz arada yedeklediyse güncelleme 0 satır etkiler → { reason:'conflict' }; sessizce ezilmez.
  Yazdıktan sonra geri okunup sağlama (checksum) doğrulanır.
*/
export const uploadBackup = (store, uid, payload, expectedUpdatedAt, appVersion) =>
  run(async () => {
    if (payloadBytes(payload) > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'toolarge' };
    const policy = await checkCloudBackupWritePolicy(store);
    if (!policy.ok) return policy;
    const checksum = checksumOf(payload);
    const body = {
      payload,
      checksum,
      schema_version: BACKUP_SCHEMA_VERSION,
      task_count: payload.tasks.length,
      document_count: payload.documents.length,
      app_version: appVersion || null,
    };
    let res;
    if (expectedUpdatedAt) {
      res = await store.updateBackupIfUnchanged(uid, expectedUpdatedAt, body);
      const err = fromResult(res);
      if (err) return err;
      if (!Array.isArray(res.data) || res.data.length === 0) return { ok: false, reason: 'conflict' };
      res = { data: res.data[0] };
    } else {
      res = await store.insertBackup(uid, body);
      const err = fromResult(res);
      if (err) return err;
    }
    const serverUpdatedAt = res.data && res.data.updated_at;
    const check = await store.verifyBackup(uid);
    const checkErr = fromResult(check);
    if (checkErr) return { ok: false, reason: 'verify', code: checkErr.code };
    if (!check.data || check.data.checksum !== checksum || checksumOf(check.data.payload) !== checksum) {
      return { ok: false, reason: 'verify' };
    }
    return { ok: true, serverUpdatedAt, taskCount: payload.tasks.length, documentCount: payload.documents.length };
  });

export const deleteBackup = (store, uid, expectedUpdatedAt) =>
  run(async () => {
    if (expectedUpdatedAt === null) {
      const current = await store.fetchBackupMeta(uid);
      const currentErr = fromResult(current);
      if (currentErr) return currentErr;
      return current.data ? { ok: false, reason: 'conflict' } : { ok: true, deleted: 0 };
    }
    const res = await store.deleteBackup(uid, expectedUpdatedAt);
    const err = fromResult(res);
    if (err) return err;
    // Satır yoksa zaten silinmiş sayılır. RLS satırı gizliyorsa da 0 döner; bu yüzden ardından doğrulanır.
    const check = await store.fetchBackupOwner(uid);
    const checkErr = fromResult(check);
    if (checkErr) return { ok: false, reason: 'verify' };
    if (check.data) return { ok: false, reason: expectedUpdatedAt ? 'conflict' : 'auth' };
    return { ok: true, deleted: Array.isArray(res.data) ? res.data.length : 0 };
  });

/* ---------- geri yükleme planı (birleştirme; mevcut veriyi silmez/ezmez) ---------- */

const isDefaultPrefs = (prefs, defaults) =>
  !prefs || stableStringify(prefs) === stableStringify(defaults);

/*
  Kurallar:
  - Görev: aynı id yerelde varsa yerel korunur. Aynı gün + aynı başlık + tamamlanmamış görev
    yerelde varsa (uygulamanın yinelenen görev kuralı) yedektekisi atlanır.
  - Belge: aynı id yerelde varsa updatedAt'i daha yeni olan kazanır, yerel görsel (uri) her zaman korunur.
    Yeni belgeler görselsiz (uri: null) eklenir.
  - Tercihler: yalnızca yerelde varsayılansa yedektekiler alınır.
*/
export const planRestore = ({ tasks, documents, todayPreferences }, payload, defaultPrefs) => {
  const localTasks = Array.isArray(tasks) ? tasks : [];
  const localDocs = Array.isArray(documents) ? documents : [];
  const taskIds = new Set(localTasks.map((t) => t && t.id));
  const dupKeys = new Set(
    localTasks.filter((t) => t && !t.completed).map((t) => `${t.dueDate}|${normalizeTitleKey(t.title)}`)
  );

  const addedTasks = [];
  let skippedTasks = 0;
  for (const t of payload.tasks) {
    if (!t || typeof t !== 'object' || !t.title) { skippedTasks += 1; continue; }
    if (taskIds.has(t.id)) { skippedTasks += 1; continue; }
    const key = `${t.dueDate}|${normalizeTitleKey(t.title)}`;
    if (!t.completed && dupKeys.has(key)) { skippedTasks += 1; continue; }
    taskIds.add(t.id);
    if (!t.completed) dupKeys.add(key);
    addedTasks.push(t);
  }

  const localById = new Map(localDocs.filter(Boolean).map((d) => [d.id, d]));
  const addedDocs = [];
  const updatedDocIds = new Set();
  let skippedDocs = 0;
  const seenBackupDocIds = new Set();
  for (const d of payload.documents) {
    if (!d || typeof d !== 'object' || !d.id || seenBackupDocIds.has(d.id)) { skippedDocs += 1; continue; }
    seenBackupDocIds.add(d.id);
    const { hadImage, ...rest } = d;
    const local = localById.get(d.id);
    if (!local) {
      addedDocs.push({ ...rest, uri: null });
    } else if (String(rest.updatedAt || '') > String(local.updatedAt || '')) {
      updatedDocIds.add(d.id);
    } else {
      skippedDocs += 1;
    }
  }

  const mergedDocs = [
    ...addedDocs,
    ...localDocs.map((d) => {
      if (!d || !updatedDocIds.has(d.id)) return d;
      const b = payload.documents.find((x) => x && x.id === d.id);
      const { hadImage, ...rest } = b;
      return { ...rest, uri: d.uri || null };
    }),
  ];

  const restorePrefs =
    payload.todayPreferences && Object.keys(payload.todayPreferences).length > 0 && isDefaultPrefs(todayPreferences, defaultPrefs);

  return {
    tasks: [...addedTasks, ...localTasks],
    documents: mergedDocs,
    todayPreferences: restorePrefs ? { ...defaultPrefs, ...payload.todayPreferences } : todayPreferences,
    summary: {
      addedTasks: addedTasks.length,
      skippedTasks,
      addedDocs: addedDocs.length,
      updatedDocs: updatedDocIds.size,
      skippedDocs,
      prefsRestored: Boolean(restorePrefs),
    },
  };
};
