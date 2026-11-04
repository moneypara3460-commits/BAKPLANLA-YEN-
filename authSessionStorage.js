const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 256;

const storedChunkCount = (value) => {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= MAX_CHUNKS ? count : null;
};

const cleanupChunkCount = (value) => {
  if (value === null || value === undefined) return 0;
  return storedChunkCount(value) ?? MAX_CHUNKS;
};

function createAuthSessionStorage({ platform, asyncStorage, secureStore }) {
  return {
    getItem: async (key) => {
      if (platform === 'web') return asyncStorage.getItem(key);
      try {
        const rawCount = await secureStore.getItemAsync(`${key}.n`);
        if (rawCount === null || rawCount === undefined) return null;
        const count = storedChunkCount(rawCount);
        if (count === null || count === 0) return null;
        let out = '';
        for (let i = 0; i < Number(count); i += 1) {
          const part = await secureStore.getItemAsync(`${key}.${i}`);
          if (part === null || part === undefined) return null;
          out += part;
        }
        return out;
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      if (platform === 'web') return asyncStorage.setItem(key, value);
      try {
        const old = cleanupChunkCount(await secureStore.getItemAsync(`${key}.n`));
        const parts = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) parts.push(value.slice(i, i + CHUNK_SIZE));
        if (!parts.length || parts.length > MAX_CHUNKS) {
          for (let i = 0; i < old; i += 1) await secureStore.deleteItemAsync(`${key}.${i}`);
          await secureStore.deleteItemAsync(`${key}.n`);
          return;
        }
        for (let i = 0; i < parts.length; i += 1) await secureStore.setItemAsync(`${key}.${i}`, parts[i]);
        await secureStore.setItemAsync(`${key}.n`, String(parts.length));
        for (let i = parts.length; i < old; i += 1) await secureStore.deleteItemAsync(`${key}.${i}`);
      } catch {
        // Never fall back to unencrypted storage when native secure storage fails.
      }
    },
    removeItem: async (key) => {
      if (platform === 'web') return asyncStorage.removeItem(key);
      try {
        const old = cleanupChunkCount(await secureStore.getItemAsync(`${key}.n`));
        for (let i = 0; i < old; i += 1) await secureStore.deleteItemAsync(`${key}.${i}`);
        await secureStore.deleteItemAsync(`${key}.n`);
      } catch {
        // Ignore storage cleanup errors; Supabase will treat a missing/corrupt session as invalid.
      }
    },
  };
}

module.exports = { createAuthSessionStorage };
