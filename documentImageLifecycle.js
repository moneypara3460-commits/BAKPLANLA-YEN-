import { imageCleanupKey, isOwnImagePath } from './cloudImages.js';

export const localDataResetStorageKeys = (uid, candidateKeys) => {
  const keep = imageCleanupKey(uid);
  return [...new Set(Array.isArray(candidateKeys) ? candidateKeys : [])]
    .filter((key) => typeof key === 'string' && key !== keep);
};

const uniqueOwnerPaths = (uid, ...groups) => {
  const paths = [...new Set(groups.flatMap((group) => Array.isArray(group) ? group : []))];
  if (paths.some((path) => !isOwnImagePath(uid, path))) return null;
  return paths;
};

// The journal is owner-scoped and must be persisted before the backup CAS write.
// Cleanup is restricted to paths recorded by this workflow and happens only after
// the new backup has passed its durable write/readback verification.
export const reconcileCloudImageCommit = async ({
  uid,
  previousPaths = [],
  pendingPaths = [],
  stagedPaths = [],
  currentPaths = [],
  persistJournal,
  commitBackup,
  removePaths,
  isCurrent = () => true,
}) => {
  const journalPaths = uniqueOwnerPaths(uid, previousPaths, pendingPaths, stagedPaths);
  const current = uniqueOwnerPaths(uid, currentPaths);
  if (!uid || !journalPaths || !current || typeof persistJournal !== 'function' || typeof commitBackup !== 'function' || typeof removePaths !== 'function') {
    return { committed: false, cleanup: 'not-run', reason: 'invalid_path' };
  }

  try {
    const persisted = await persistJournal(journalPaths);
    if (persisted !== true) return { committed: false, cleanup: 'not-run', reason: 'journal' };
  } catch (error) {
    return { committed: false, cleanup: 'not-run', reason: 'journal' };
  }

  let commit;
  try { commit = await commitBackup(); } catch (error) { commit = { ok: false, reason: 'exception' }; }
  if (!commit || commit.ok !== true) {
    return { committed: false, cleanup: 'not-run', reason: (commit && commit.reason) || 'backup', pendingPaths: journalPaths };
  }

  if (!isCurrent()) return { committed: true, cleanup: 'deferred', pendingPaths: journalPaths, commit };

  const keep = new Set(current);
  const obsolete = journalPaths.filter((path) => !keep.has(path));
  let removal = { ok: true, removed: 0 };
  if (obsolete.length) {
    try { removal = await removePaths(obsolete); } catch (error) { removal = { ok: false, reason: 'exception' }; }
  }

  if (!removal || removal.ok !== true) {
    let journalSaved = false;
    try { journalSaved = await persistJournal(obsolete) === true; } catch (error) { journalSaved = false; }
    return { committed: true, cleanup: 'pending', reason: (removal && removal.reason) || 'storage', pendingPaths: journalSaved ? obsolete : journalPaths, commit };
  }

  let cleared = false;
  try { cleared = await persistJournal([]) === true; } catch (error) { cleared = false; }
  return cleared
    ? { committed: true, cleanup: 'complete', removed: removal.removed || 0, commit }
    : { committed: true, cleanup: 'pending', reason: 'journal', pendingPaths: journalPaths, commit };
};

export const deleteCloudImageBackup = async ({
  uid,
  previousPaths = [],
  pendingPaths = [],
  persistJournal,
  deleteBackup,
  removePaths,
  isCurrent = () => true,
}) => {
  const candidates = uniqueOwnerPaths(uid, previousPaths, pendingPaths);
  if (!uid || !candidates || typeof persistJournal !== 'function' || typeof deleteBackup !== 'function' || typeof removePaths !== 'function') {
    return { deleted: false, cleanup: 'not-run', reason: 'invalid_path' };
  }
  try {
    if (await persistJournal(candidates) !== true) return { deleted: false, cleanup: 'not-run', reason: 'journal' };
  } catch (error) {
    return { deleted: false, cleanup: 'not-run', reason: 'journal' };
  }
  if (!isCurrent()) return { deleted: false, cleanup: 'not-run', reason: 'stale', pendingPaths: candidates };
  let deletion;
  try { deletion = await deleteBackup(); } catch (error) { deletion = { ok: false, reason: 'exception' }; }
  if (!deletion || deletion.ok !== true) return { deleted: false, cleanup: 'not-run', reason: (deletion && deletion.reason) || 'backup', deletion };
  if (!isCurrent()) return { deleted: true, cleanup: 'deferred', pendingPaths: candidates, deletion };

  let removal = { ok: true, removed: 0 };
  if (candidates.length) {
    try { removal = await removePaths(candidates); } catch (error) { removal = { ok: false, reason: 'exception' }; }
  }
  if (!removal || removal.ok !== true) {
    let saved = false;
    try { saved = await persistJournal(candidates) === true; } catch (error) { saved = false; }
    return { deleted: true, cleanup: 'pending', reason: (removal && removal.reason) || 'storage', pendingPaths: candidates, journalSaved: saved, deletion };
  }
  let cleared = false;
  try { cleared = await persistJournal([]) === true; } catch (error) { cleared = false; }
  return cleared
    ? { deleted: true, cleanup: 'complete', removed: removal.removed || 0, deletion }
    : { deleted: true, cleanup: 'pending', reason: 'journal', pendingPaths: candidates, deletion };
};
