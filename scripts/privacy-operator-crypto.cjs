const crypto = require('node:crypto');

const FORMAT = 'BAKPLANLA-RIGHTS-ENCRYPTED-1';
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const OPEN_TTL_MS = 15 * 60 * 1000;
const SCRYPT = Object.freeze({ N: 32_768, r: 8, p: 1, keylen: 32, maxmem: 128 * 1024 * 1024 });

function derive(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 16) throw new Error('passphrase_too_short');
  return crypto.scryptSync(passphrase, salt, SCRYPT.keylen, SCRYPT);
}

function encryptPackage(payload, passphrase, now = Date.now()) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = derive(passphrase, salt);
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return {
      format: FORMAT,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPORT_TTL_MS).toISOString(),
      kdf: { name: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64') },
      cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
      ciphertext: ciphertext.toString('base64'),
      ciphertextSha256: crypto.createHash('sha256').update(ciphertext).digest('hex'),
    };
  } finally {
    plain.fill(0);
    key.fill(0);
  }
}

function decryptPackage(envelope, passphrase, now = Date.now()) {
  if (!envelope || envelope.format !== FORMAT || !envelope.kdf || !envelope.cipher) throw new Error('invalid_package');
  const createdAt = Date.parse(envelope.createdAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - createdAt > EXPORT_TTL_MS || createdAt > now + 5 * 60 * 1000) throw new Error('package_expired_or_invalid_time');
  if (envelope.kdf.name !== 'scrypt' || envelope.kdf.N !== SCRYPT.N || envelope.kdf.r !== SCRYPT.r || envelope.kdf.p !== SCRYPT.p) throw new Error('unsupported_kdf');
  if (envelope.cipher.name !== 'aes-256-gcm') throw new Error('unsupported_cipher');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const actualHash = crypto.createHash('sha256').update(ciphertext).digest('hex');
  if (actualHash !== envelope.ciphertextSha256) throw new Error('ciphertext_integrity_failed');
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  const iv = Buffer.from(envelope.cipher.iv, 'base64');
  const tag = Buffer.from(envelope.cipher.tag, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error('invalid_package');
  const key = derive(passphrase, salt);
  let plain;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch { throw new Error('decrypt_failed'); }
  finally { key.fill(0); if (plain) plain.fill(0); ciphertext.fill(0); }
}

module.exports = { FORMAT, EXPORT_TTL_MS, OPEN_TTL_MS, encryptPackage, decryptPackage };
