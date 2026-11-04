const PREFIX = 'PLAN_ACCOUNT_DELETION_RECEIPT:';
const KEY_PATTERN = /^[0-9a-f]{64}$/;

const receiptKeyFor = (owner) => `${PREFIX}${encodeURIComponent(owner)}`;

const createDeletionReceiptStore = ({ platform, asyncStorage, secureStore }) => ({
  get: async (owner) => {
    const key = receiptKeyFor(owner);
    return platform === 'web' ? asyncStorage.getItem(key) : secureStore.getItemAsync(key);
  },
  set: async (owner, value) => {
    const key = receiptKeyFor(owner);
    if (!KEY_PATTERN.test(value)) throw new Error('invalid_deletion_receipt');
    if (platform === 'web') return asyncStorage.setItem(key, value);
    return secureStore.setItemAsync(key, value);
  },
  remove: async (owner) => {
    const key = receiptKeyFor(owner);
    if (platform === 'web') return asyncStorage.removeItem(key);
    return secureStore.deleteItemAsync(key);
  },
});

const credentialFromRandomBytes = (bytes) => {
  if (!bytes || bytes.length !== 32) throw new Error('secure_random_unavailable');
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

async function getOrCreateDeletionReceipt({ owner, store, generate }) {
  if (!owner) throw new Error('deletion_owner_missing');
  const stored = await store.get(owner);
  if (stored !== null && stored !== undefined) {
    if (!KEY_PATTERN.test(stored)) throw new Error('deletion_receipt_corrupt');
    return stored;
  }
  const credential = await generate();
  if (!KEY_PATTERN.test(credential)) throw new Error('secure_random_unavailable');
  await store.set(owner, credential);
  return credential;
}

module.exports = {
  KEY_PATTERN,
  createDeletionReceiptStore,
  credentialFromRandomBytes,
  getOrCreateDeletionReceipt,
  receiptKeyFor,
};
