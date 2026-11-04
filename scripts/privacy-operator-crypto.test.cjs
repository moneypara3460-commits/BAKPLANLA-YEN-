const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptPackage, decryptPackage, FORMAT, EXPORT_TTL_MS } = require('./privacy-operator-crypto.cjs');

test('encrypted rights package decrypts only with passphrase and stays within 24-hour lifetime', () => {
  const source = { schema: 'bakplanla-rights-export-v1', subject: { id: 'synthetic' }, payload: 'synthetic data' };
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  const envelope = encryptPackage(source, 'correct horse battery staple', now);
  assert.equal(envelope.format, FORMAT);
  assert.equal(Date.parse(envelope.expiresAt) - Date.parse(envelope.createdAt), EXPORT_TTL_MS);
  assert.deepEqual(decryptPackage(envelope, 'correct horse battery staple', now + 1), source);
  assert.throws(() => decryptPackage(envelope, 'incorrect passphrase!!', now + 1), /decrypt_failed/);
  assert.throws(() => decryptPackage(envelope, 'correct horse battery staple', now + EXPORT_TTL_MS + 1), /expired/);
});

test('ciphertext tampering and invalid KDF metadata fail closed', () => {
  const envelope = encryptPackage({ content: 'synthetic' }, 'a long enough passphrase', Date.now());
  const changed = { ...envelope, ciphertext: Buffer.from('tampered').toString('base64') };
  assert.throws(() => decryptPackage(changed, 'a long enough passphrase'), /integrity/);
  const unsupported = { ...envelope, kdf: { ...envelope.kdf, N: 1024 } };
  assert.throws(() => decryptPackage(unsupported, 'a long enough passphrase'), /unsupported_kdf/);
});

test('weak passphrases cannot produce an export artifact', () => {
  assert.throws(() => encryptPackage({ data: 1 }, 'short'), /passphrase_too_short/);
});
