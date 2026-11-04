const DATA_OWNER_KEY = 'PLAN_DATA_OWNER';
const PENDING_SWITCH_KEY = 'PLAN_DATA_OWNER_SWITCH_PENDING';
const PENDING_ACCOUNT_DELETION_PREFIX = 'PLAN_ACCOUNT_DELETION_PENDING:';
const SCOPE_PREFIX = 'PLAN_ACCOUNT_DATA:';

// These keys contain user-created or user-specific local state. App preferences and
// Supabase auth storage intentionally stay outside this account-scoped data set.
const PERSONAL_DATA_KEYS = [
  'PLAN_TASKS',
  'PLAN_TASKS_CORRUPT_BACKUP',
  'PLAN_DOCUMENTS',
  'PLAN_DOCUMENTS_CORRUPT_BACKUP',
  'PLAN_USER_NAME',
  'PLAN_TODAY_PREFERENCES',
  'PLAN_FEATURE_USAGE',
  'PLAN_SHOPPING_LIST_V1',
  'PLAN_SHOPPING_PLAN_V1',
  'PLAN_COMPASS_RESULT',
  'BAKPLANLA_MESLEK_PROVASI',
  'BAKPLANLA_ISBASI_PROGRESS',
  'BAKPLANLA_ISBASI_SERVER_CACHE',
  'BAKPLANLA_ISBASI_PENDING_FINISH',
  'PLAN_NOTIF_PREFS',
];

const scopeKey = (owner) => `${SCOPE_PREFIX}${encodeURIComponent(owner)}`;
const accountDeletionKeyFor = (owner) => `${PENDING_ACCOUNT_DELETION_PREFIX}${encodeURIComponent(owner)}`;
const isScopeGenerationReady = (expectedGeneration, currentGeneration, activeGeneration) =>
  expectedGeneration === currentGeneration && expectedGeneration === activeGeneration;

let localDataQueue = Promise.resolve();
const runLocalDataOperation = (operation) => {
  const result = localDataQueue.then(operation);
  localDataQueue = result.catch(() => {});
  return result;
};

// Serialize multi-key owner operations with account switching. The generation is
// checked after earlier queued work finishes and immediately before execution.
const runScopeBoundOperation = (expectedGeneration, isCurrent, operation) => runLocalDataOperation(async () => {
  if (!isCurrent(expectedGeneration)) return { executed: false, stale: true };
  return { executed: true, result: await operation() };
});

const createScopeBoundSave = (expectedGeneration, isCurrent, save) => (key, value) =>
  runScopeBoundOperation(expectedGeneration, isCurrent, () => save(key, value))
    .then((outcome) => outcome.executed ? outcome.result : false);

const readScopeBoundValue = async (expectedGeneration, isCurrent, read) => {
  const value = await read();
  if (!isCurrent(expectedGeneration)) return { stale: true };
  return { stale: false, value };
};

const parseJson = (raw, fallback) => {
  if (raw === null || raw === undefined) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};
const readOwner = async (storage) => {
  const raw = await storage.getItem(DATA_OWNER_KEY);
  return parseJson(raw, raw) || null;
};

const readSnapshot = async (storage, owner) => {
  if (!owner) return null;
  const raw = await storage.getItem(scopeKey(owner));
  if (raw === null || raw === undefined) return null;
  const snapshot = parseJson(raw, null);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('local_data_snapshot_corrupt');
  }
  return snapshot;
};

// Reconcile a late result only to an owner whose active data or retained snapshot
// still exists. The shared queue prevents a concurrent scope switch from moving
// the active keys between the owner check and write.
const writeOwnerScopedValue = (storage, owner, key, value) => runLocalDataOperation(async () => {
  if (!owner || !PERSONAL_DATA_KEYS.includes(key)) return false;
  const activeOwner = await readOwner(storage);
  if (activeOwner === owner) {
    await storage.setItem(key, String(value));
    return true;
  }
  const snapshot = await readSnapshot(storage, owner);
  if (!snapshot) return false;
  snapshot[key] = String(value);
  await storage.setItem(scopeKey(owner), JSON.stringify(snapshot));
  return true;
});

const captureActiveData = async (storage) => {
  const entries = await Promise.all(PERSONAL_DATA_KEYS.map(async (key) => [key, await storage.getItem(key)]));
  return Object.fromEntries(entries.filter(([, value]) => value !== null && value !== undefined));
};

const mergeDocumentLists = (...rawValues) => {
  const documents = [];
  const seen = new Set();
  for (const raw of rawValues) {
    if (raw === null || raw === undefined) continue;
    const parsed = parseJson(raw, null);
    if (!Array.isArray(parsed)) throw new Error('local_data_documents_corrupt');
    for (const document of parsed) {
      if (!document || typeof document !== 'object') continue;
      const key = `${document.id ?? ''}\u0000${document.uri ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      documents.push(document);
    }
  }
  return documents;
};

const writeActiveData = async (storage, data) => {
  const entries = PERSONAL_DATA_KEYS.map(async (key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) await storage.setItem(key, data[key]);
    else await storage.removeItem(key);
  });
  await Promise.all(entries);
};

const completePendingSwitch = async (storage, pending) => {
  await storage.setItem(scopeKey(pending.from), JSON.stringify(pending.currentData));
  await writeActiveData(storage, pending.targetData);
  await storage.setItem(DATA_OWNER_KEY, JSON.stringify(pending.to));
  await storage.removeItem(PENDING_SWITCH_KEY);
};

/**
 * Switch the active shared legacy keys to a guest or account-specific snapshot.
 * A journal makes interruption during key replacement recoverable on next launch.
 * The caller must keep personal UI and persistence disabled until this resolves.
 */
const switchLocalDataScopeNow = async (storage, requestedOwner) => {
  const nextOwner = requestedOwner || 'guest';
  const pendingRaw = await storage.getItem(PENDING_SWITCH_KEY);
  if (pendingRaw !== null && pendingRaw !== undefined) {
    const pending = parseJson(pendingRaw, null);
    if (!pending || !pending.from || !pending.to || !pending.currentData || !pending.targetData) {
      throw new Error('local_data_switch_journal_corrupt');
    }
    await completePendingSwitch(storage, pending);
  }

  let currentOwner = await readOwner(storage);
  if (!currentOwner) currentOwner = 'guest';
  if (currentOwner === nextOwner) {
    await storage.setItem(DATA_OWNER_KEY, JSON.stringify(currentOwner));
    return { owner: currentOwner, data: await captureActiveData(storage) };
  }

  const currentData = await captureActiveData(storage);
  const targetData = await readSnapshot(storage, nextOwner) || {};
  const deletion = parseJson(await storage.getItem(accountDeletionKeyFor(currentOwner)), null);
  const savedSnapshot = deletion?.state === 'remote_complete' && deletion.owner === currentOwner
    ? await readSnapshot(storage, currentOwner) || {}
    : {};
  const currentDataToArchive = Object.keys(savedSnapshot).length ? { ...currentData, ...savedSnapshot } : currentData;
  if (currentData.PLAN_DOCUMENTS !== undefined || savedSnapshot.PLAN_DOCUMENTS !== undefined) {
    currentDataToArchive.PLAN_DOCUMENTS = JSON.stringify(mergeDocumentLists(currentData.PLAN_DOCUMENTS, savedSnapshot.PLAN_DOCUMENTS));
  }
  const journal = { from: currentOwner, to: nextOwner, currentData: currentDataToArchive, targetData };
  await storage.setItem(PENDING_SWITCH_KEY, JSON.stringify(journal));
  await completePendingSwitch(storage, journal);
  return { owner: nextOwner, data: targetData };
};

const switchLocalDataScope = (storage, requestedOwner) =>
  runLocalDataOperation(() => switchLocalDataScopeNow(storage, requestedOwner));

const removeLocalDataScope = async (storage, owner) => {
  if (!owner) return null;
  const snapshot = parseJson(await storage.getItem(scopeKey(owner)), null);
  await storage.removeItem(scopeKey(owner));
  return snapshot;
};

const deleteLocalAccountScopeNow = async (storage, owner, removeImage, additionalKeys = []) => {
  if (!owner) return false;
  try {
    const pendingRaw = await storage.getItem(PENDING_SWITCH_KEY);
    if (pendingRaw !== null && pendingRaw !== undefined) {
      const pending = parseJson(pendingRaw, null);
      if (!pending || pending.from === owner || pending.to === owner) return false;
    }

    const activeOwner = await readOwner(storage);
    const activeIsOwner = activeOwner === owner;
    const archived = await readSnapshot(storage, owner) || {};
    const active = activeIsOwner ? await captureActiveData(storage) : {};
    const fullSnapshot = { ...archived, ...active };
    const docs = mergeDocumentLists(archived.PLAN_DOCUMENTS, active.PLAN_DOCUMENTS);
    if (archived.PLAN_DOCUMENTS !== undefined || active.PLAN_DOCUMENTS !== undefined) {
      fullSnapshot.PLAN_DOCUMENTS = JSON.stringify(docs);
    }

    // Keep a durable copy until referenced files and scoped keys are removed.
    if (Object.keys(fullSnapshot).length || activeIsOwner) {
      await storage.setItem(scopeKey(owner), JSON.stringify(fullSnapshot));
    }
    const imageUris = [...new Set(docs.map((doc) => doc?.uri).filter((uri) => typeof uri === 'string' && uri))];
    for (const uri of imageUris) {
      if (await removeImage(uri) === false) return false;
    }

    const keys = [...(activeIsOwner ? PERSONAL_DATA_KEYS : []), ...additionalKeys];
    for (const key of new Set(keys)) await storage.removeItem(key);
    if (activeIsOwner) await storage.removeItem(DATA_OWNER_KEY);
    await storage.removeItem(scopeKey(owner));
    return true;
  } catch {
    return false;
  }
};

const deleteLocalAccountScope = (storage, owner, removeImage, additionalKeys = []) =>
  runLocalDataOperation(() => deleteLocalAccountScopeNow(storage, owner, removeImage, additionalKeys));

const analyzeAndAddReceiptForCurrentScope = async ({ expectedGeneration, isCurrent, analyzeReceipt, sourceUri, persistImage, removeImage, addDocument }) => {
  if (!isCurrent(expectedGeneration)) return { stale: true };
  const receipt = await analyzeReceipt();
  if (!isCurrent(expectedGeneration)) return { stale: true };
  let storedUri = null;
  try { storedUri = await persistImage(sourceUri); } catch { /* Keep the receipt without an image if copying fails. */ }
  if (!isCurrent(expectedGeneration)) {
    if (storedUri) await removeImage(storedUri);
    return { stale: true };
  }
  const result = addDocument(receipt, storedUri, expectedGeneration);
  if (result.stale || result.duplicate) {
    if (storedUri) await removeImage(storedUri);
  }
  return { ...result, receipt, storedUri };
};

module.exports = {
  DATA_OWNER_KEY,
  PENDING_ACCOUNT_DELETION_PREFIX,
  PENDING_SWITCH_KEY,
  PERSONAL_DATA_KEYS,
  analyzeAndAddReceiptForCurrentScope,
  accountDeletionKeyFor,
  deleteLocalAccountScope,
  createScopeBoundSave,
  isScopeGenerationReady,
  removeLocalDataScope,
  readScopeBoundValue,
  runLocalDataOperation,
  runScopeBoundOperation,
  scopeKey,
  switchLocalDataScope,
  writeOwnerScopedValue,
};
