/*
===========================================================
  BAKPLANLA — belge görsellerinin bulut yedeği (Supabase Storage)
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.
  Supabase istemcisi ve dosya sistemi işlevleri (fs) dışarıdan verilir.

  Sunucu tarafı: supabase/bakplanla_storage.sql çalıştırılmış olmalıdır (özel kova + RLS).
  Her kullanıcı yalnızca kendi klasörüne ({user_id}/...) erişir.

  Sözleşme: hiçbir işlev istisna fırlatmaz; sonuçlar { ok, ... } / sayım nesneleridir.
  Görseller için hata, yedeğin geri kalanını (görev/belge kayıtları) engellemez; kullanıcıya sayı olarak bildirilir.
===========================================================
*/
import { classifyError } from './backup.js';

export const IMAGE_BUCKET = 'bakplanla-documents';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // SQL'deki kova sınırıyla aynı olmalı
export const IMAGE_TIMEOUT_MS = 60000;
export const SIGNED_URL_SECONDS = 120;
export const imageCleanupKey = (uid) => `PLAN_BACKUP_IMAGE_CLEANUP:${uid}`;
export const parseImageCleanupJournal = (uid, raw) => {
  if (raw == null) return { ok: true, paths: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, reason: 'format' };
    const paths = [...new Set(parsed)];
    if (paths.some((path) => !isOwnImagePath(uid, path))) return { ok: false, reason: 'owner' };
    return { ok: true, paths };
  } catch (error) {
    return { ok: false, reason: 'json' };
  }
};
const ALLOWED_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const safeSegment = (value) => String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);

export const extOf = (uri) => {
  const raw = String(uri || '').split('?')[0].split('.').pop().toLowerCase();
  return ALLOWED_EXT[raw] ? raw : 'jpg';
};

export const mimeOf = (ext) => ALLOWED_EXT[ext] || 'image/jpeg';

const baseNameOf = (uri) => {
  const file = String(uri || '').split('?')[0].split('/').pop() || '';
  return safeSegment(file.replace(/\.[^.]*$/, ''));
};

const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

// The digest identifies the bytes and the nonce prevents concurrent devices from
// overwriting an object that another backup may still be preparing to reference.
export const imagePathFor = (uid, docId, uri, digest, uploadId) => {
  if (!uid || docId == null || !validDigest(digest) || !uploadId) return null;
  return `${safeSegment(uid)}/${safeSegment(docId).slice(0, 40)}-${baseNameOf(uri).slice(0, 40)}-${digest.toLowerCase()}-${safeSegment(uploadId).slice(0, 36)}.${extOf(uri)}`;
};

export const imagePathMatchesContent = (uid, docId, uri, path, digest) => {
  if (!isOwnImagePath(uid, path) || !validDigest(digest)) return false;
  const prefix = `${safeSegment(uid)}/${safeSegment(docId).slice(0, 40)}-${baseNameOf(uri).slice(0, 40)}-${digest.toLowerCase()}-`;
  return path.startsWith(prefix) && path.endsWith(`.${extOf(uri)}`);
};

// Yol yalnızca bu kullanıcının klasöründe ve üst dizine çıkmadan geçerlidir.
export const isOwnImagePath = (uid, path) =>
  typeof path === 'string' &&
  !!uid &&
  path.startsWith(`${safeSegment(uid)}/`) &&
  !path.includes('..') &&
  path.split('/').length === 2 &&
  /\.(jpg|jpeg|png|webp)$/i.test(path);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Bağımlılıksız base64 → Uint8Array (atob/Buffer her ortamda yoktur).
export const base64ToBytes = (input) => {
  const clean = String(input || '').replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c !== -1) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1) out[o++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, o);
};

export const classifyStorageError = (error) => {
  const msg = String((error && error.message) || '').toLowerCase();
  if (/bucket not found|the resource was not found/.test(msg)) return 'setup';
  if (/exceeded the maximum allowed size|payload too large|too large/.test(msg)) return 'toolarge';
  return classifyError(error);
};

const withTimeout = (promise, ms = IMAGE_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ kind: 'timeout', message: 'timeout' }), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

const bucket = (supabase) => supabase.storage.from(IMAGE_BUCKET);

const listFolder = async (supabase, uid) => {
  const res = await withTimeout(bucket(supabase).list(safeSegment(uid), { limit: 1000 }));
  if (res && res.error) return { ok: false, reason: classifyStorageError(res.error) };
  const names = ((res && res.data) || []).map((o) => o && o.name).filter(Boolean);
  return { ok: true, names };
};

/*
  Yerel görseli olan belgeleri yükler.
  documents: uygulamadaki belge listesi ({ id, uri, ... }).
  fs: { readBase64(uri) -> Promise<string> }
  Dönüş: { paths: { [docId]: path }, uploaded, reused, failed, setupMissing }
  Başarısız görselin yolu paths'e EKLENMEZ (yedek, olmayan görsele işaret etmez).
*/
export const uploadDocumentImages = async ({ supabase, fs, uid, documents, existingPaths = {}, createUploadId, onPathAllocated }) => {
  const result = { paths: {}, uploaded: 0, reused: 0, failed: 0, setupMissing: false, orphanCandidates: [] };
  const withImage = (Array.isArray(documents) ? documents : []).filter((d) => d && d.id != null && typeof d.uri === 'string' && d.uri);
  if (!withImage.length) return result;

  for (const doc of withImage) {
    let path = null;
    try {
      const b64 = await fs.readBase64(doc.uri);
      const bytes = base64ToBytes(b64);
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) { result.failed += 1; continue; }
      if (typeof fs.sha256 !== 'function' || typeof createUploadId !== 'function') { result.failed += 1; continue; }
      const digest = await fs.sha256(bytes);
      if (!validDigest(digest)) { result.failed += 1; continue; }
      const existingPath = existingPaths && existingPaths[doc.id];
      if (imagePathMatchesContent(uid, doc.id, doc.uri, existingPath, digest)) {
        result.paths[doc.id] = existingPath;
        result.reused += 1;
        continue;
      }
      path = imagePathFor(uid, doc.id, doc.uri, digest, createUploadId());
      if (!path) { result.failed += 1; continue; }
      // Journal this unique path even if the upload result is ambiguous (for
      // example, a timeout after Storage accepted the bytes).
      result.orphanCandidates.push(path);
      if (typeof onPathAllocated === 'function' && await onPathAllocated(path) !== true) { result.failed += 1; continue; }
      const res = await withTimeout(bucket(supabase).upload(path, bytes, { contentType: mimeOf(extOf(doc.uri)), upsert: false }));
      if (res && res.error) {
        if (classifyStorageError(res.error) === 'setup') result.setupMissing = true;
        result.failed += 1;
        continue;
      }
      result.paths[doc.id] = path;
      result.orphanCandidates.pop();
      result.uploaded += 1;
    } catch (error) {
      if (path && !result.orphanCandidates.includes(path)) result.orphanCandidates.push(path);
      result.failed += 1;
    }
  }
  return result;
};

// Removes only explicitly journaled owner paths. Unlike pruneCloudImages, this
// never sweeps staged objects owned by another device or concurrent backup.
export const removeCloudImagePaths = async ({ supabase, uid, paths }) => {
  const unique = [...new Set((Array.isArray(paths) ? paths : []).filter(Boolean))];
  if (unique.some((path) => !isOwnImagePath(uid, path))) return { ok: false, reason: 'owner' };
  if (!unique.length) return { ok: true, removed: 0 };
  try {
    let removed = 0;
    for (let index = 0; index < unique.length; index += 100) {
      const batch = unique.slice(index, index + 100);
      const res = await withTimeout(bucket(supabase).remove(batch));
      if (res && res.error) return { ok: false, reason: classifyStorageError(res.error), removed };
      if (!res) return { ok: false, reason: 'unknown', removed };
      removed += batch.length;
    }
    return { ok: true, removed };
  } catch (error) {
    return { ok: false, reason: classifyStorageError(error), removed: 0 };
  }
};

/*
  Yedekte yolu olup cihazda görseli olmayan belgelerin görselini indirir.
  Dönüş: { documents (güncellenmiş liste), downloaded, failed }
*/
export const restoreDocumentImages = async ({ supabase, fs, uid, documents }) => {
  const list = Array.isArray(documents) ? documents : [];
  const out = { documents: list, downloaded: 0, failed: 0 };
  const next = [];
  for (const doc of list) {
    if (!doc || doc.uri || !isOwnImagePath(uid, doc.imagePath)) { next.push(doc); continue; }
    try {
      const signed = await withTimeout(bucket(supabase).createSignedUrl(doc.imagePath, SIGNED_URL_SECONDS));
      if (!signed || signed.error || !signed.data || !signed.data.signedUrl) { out.failed += 1; next.push(doc); continue; }
      const dest = `${fs.docDir}plan-restored-${safeSegment(doc.id)}-${Date.now()}.${extOf(doc.imagePath)}`;
      const ok = await fs.downloadTo(signed.data.signedUrl, dest);
      if (!ok) { out.failed += 1; next.push(doc); continue; }
      out.downloaded += 1;
      next.push({ ...doc, uri: dest });
    } catch (error) {
      out.failed += 1;
      next.push(doc);
    }
  }
  out.documents = next;
  return out;
};

// Artık hiçbir belgenin kullanmadığı bulut görsellerini siler (silinen belgelerin görselleri bulutta kalmasın).
export const pruneCloudImages = async ({ supabase, uid, keepPaths }) => {
  try {
    const listed = await listFolder(supabase, uid);
    if (!listed.ok) return { ok: false, reason: listed.reason };
    const keep = new Set((keepPaths || []).map((p) => String(p).split('/')[1]).filter(Boolean));
    const doomed = listed.names.filter((n) => !keep.has(n)).map((n) => `${safeSegment(uid)}/${n}`);
    if (!doomed.length) return { ok: true, removed: 0 };
    const res = await withTimeout(bucket(supabase).remove(doomed));
    if (res && res.error) return { ok: false, reason: classifyStorageError(res.error) };
    return { ok: true, removed: doomed.length };
  } catch (error) {
    return { ok: false, reason: classifyStorageError(error) };
  }
};

// Bu hesabın tüm bulut görsellerini siler ("Bulut Yedeğimi Sil" ve hesap silme için).
export const deleteAllCloudImages = async ({ supabase, uid }) => pruneCloudImages({ supabase, uid, keepPaths: [] });
