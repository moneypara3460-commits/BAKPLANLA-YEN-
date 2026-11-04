const CLIENT_PRODUCTION_PROJECT_REF = 'bukbteqgzkytedhrmdgq';
const VERIFIED_DEV_PROJECT_REF = 'tlizbrhmwaesfjmtxcgh';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
const MAX_API_KEY_LENGTH = 8192;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function decodeBase64Url(segment) {
  if (typeof segment !== 'string' || !segment || !/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) {
    return null;
  }

  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const character of segment) {
    buffer = (buffer << 6) | BASE64URL_ALPHABET.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits && buffer !== 0) return null;
  return bytes;
}

function decodeJwtJson(segment) {
  const bytes = decodeBase64Url(segment);
  if (!bytes) return null;
  try {
    const utf8 = bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
    const value = JSON.parse(decodeURIComponent(utf8));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function isLegacyAnonKey(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const header = decodeJwtJson(parts[0]);
  const payload = decodeJwtJson(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  return header?.alg === 'HS256' && signature?.length === 32 && payload?.role === 'anon';
}

function isSupportedClientKey(value) {
  if (value.length > MAX_API_KEY_LENGTH) return false;
  if (value.startsWith('sb_secret_')) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  return isLegacyAnonKey(value);
}

function getSupabaseConfig({ url, publishableKey, expectedProjectRef = VERIFIED_DEV_PROJECT_REF } = {}) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL to the isolated BAKPLANLA DEV project.');
  }
  if (typeof publishableKey !== 'string' || !publishableKey.trim()) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the isolated DEV project key.');
  }

  const normalizedKey = publishableKey.trim();
  if (!isSupportedClientKey(normalizedKey)) {
    throw new Error('Use a Supabase publishable key or a legacy anon key in the Expo client.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid URL.');
  }

  if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must not contain credentials or URL parameters.');
  }
  if (parsedUrl.pathname !== '/') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must not include a path.');
  }

  if (parsedUrl.hostname === `${CLIENT_PRODUCTION_PROJECT_REF}.supabase.co`) {
    throw new Error('The client production Supabase project is blocked in this development repository.');
  }

  const isLocal = LOCAL_HOSTS.has(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !(isLocal && parsedUrl.protocol === 'http:')) {
    throw new Error('Use HTTPS for hosted Supabase projects; HTTP is allowed only for local development.');
  }
  if (!isLocal) {
    if (!parsedUrl.hostname.endsWith('.supabase.co')) {
      throw new Error('Use an isolated Supabase project URL or a supported local development host.');
    }
    if (!expectedProjectRef) {
      throw new Error('The verified DEV project reference has not been configured in this repository.');
    }
    if (parsedUrl.hostname !== `${expectedProjectRef}.supabase.co`) {
      throw new Error('The configured Supabase URL does not match the verified DEV project.');
    }
  }

  return { url: parsedUrl.origin, publishableKey: normalizedKey };
}

module.exports = { getSupabaseConfig };
