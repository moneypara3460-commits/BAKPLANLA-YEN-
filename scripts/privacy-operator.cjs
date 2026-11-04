const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig } = require('../supabaseConfig');
const { encryptPackage, decryptPackage, OPEN_TTL_MS } = require('./privacy-operator-crypto.cjs');

const ROOT = path.resolve(__dirname, '..');
const CASE_ROOT = path.join(ROOT, '.local', 'privacy-cases');
const EXPECTED_URL = 'https://tlizbrhmwaesfjmtxcgh.supabase.co';

function withinRoot(candidate) {
  const resolved = path.resolve(candidate);
  const rel = path.relative(CASE_ROOT, resolved);
  if (!rel || rel === '.' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('case_file_must_be_inside_private_directory');
  return resolved;
}

async function secureCaseDirectory() {
  await fs.mkdir(CASE_ROOT, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const username = process.env.USERNAME;
    if (!username || /[\r\n]/.test(username)) throw new Error('windows_operator_identity_unavailable');
    const result = spawnSync('icacls.exe', [CASE_ROOT, '/inheritance:r', '/grant:r', `${username}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '/T', '/C'], { windowsHide: true, stdio: 'ignore' });
    if (result.error || result.status !== 0) throw new Error('private_case_directory_acl_failed');
  } else {
    await fs.chmod(CASE_ROOT, 0o700);
  }
}

async function readDevelopmentConfig() {
  const envPath = path.join(ROOT, '.env.development.local');
  const content = await fs.readFile(envPath, 'utf8');
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  if (values.EXPO_PUBLIC_SUPABASE_URL !== EXPECTED_URL) throw new Error('isolated_dev_configuration_required');
  const config = getSupabaseConfig({ url: values.EXPO_PUBLIC_SUPABASE_URL, publishableKey: values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
  return { url: config.url, key: config.publishableKey };
}

function prompt(label, hidden = false) {
  if (!process.stdin.isTTY || (hidden && typeof process.stdin.setRawMode !== 'function')) throw new Error('interactive_secure_terminal_required');
  process.stdout.write(`${label}: `);
  if (!hidden) {
    return new Promise((resolve, reject) => {
      let value = '';
      const onData = (chunk) => {
        const text = chunk.toString('utf8');
        for (const character of text) {
          if (character === '\u0003') { cleanup(); reject(new Error('cancelled')); return; }
          if (character === '\r' || character === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
          if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
          else if (character >= ' ') value += character;
        }
      };
      const cleanup = () => { process.stdin.off('data', onData); process.stdin.pause(); };
      process.stdin.setEncoding('utf8'); process.stdin.on('data', onData); process.stdin.resume();
    });
  }
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      for (const character of text) {
        if (character === '\u0003') { cleanup(); process.stdout.write('\n'); reject(new Error('cancelled')); return; }
        if (character === '\r' || character === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    const cleanup = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); };
    process.stdin.on('data', onData);
  });
}

async function createOperatorClient() {
  const config = await readDevelopmentConfig();
  const email = await prompt('Authorized operator email');
  let password = await prompt('Operator password (not echoed)', true);
  const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
  let data; let error;
  try { ({ data, error } = await client.auth.signInWithPassword({ email, password })); }
  finally { password = null; }
  if (error || !data?.session?.access_token) throw new Error('operator_authentication_failed');
  return client;
}

async function invoke(client, request) {
  const { data, error } = await client.functions.invoke('privacy-operator', { body: request });
  if (error) throw new Error('privacy_operator_request_failed');
  return data;
}

async function askApply(caseId, verb) {
  const answer = await prompt(`Review the ${verb} plan outside this process. Type APPLY ${caseId} to continue`);
  return answer === `APPLY ${caseId}`;
}

function ensureEncryptedPath(pathName) {
  const resolved = withinRoot(pathName);
  if (!resolved.toLowerCase().endsWith('.bpkvkk')) throw new Error('encrypted_export_extension_required');
  return resolved;
}

async function writeEncryptedExport(caseId, payload) {
  let passphrase = await prompt('Export passphrase (minimum 16 characters; not echoed)', true);
  let confirm = await prompt('Repeat export passphrase (not echoed)', true);
  try {
    if (passphrase !== confirm) throw new Error('passphrase_mismatch');
    const envelope = encryptPackage(payload, passphrase);
    const output = path.join(CASE_ROOT, `rights-${caseId}.bpkvkk`);
    try { await fs.writeFile(output, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 }); }
    catch { throw new Error('encrypted_export_write_failed_or_exists'); }
    if (process.platform === 'win32') {
      const username = process.env.USERNAME;
      const result = spawnSync('icacls.exe', [output, '/inheritance:r', '/grant:r', `${username}:(R,W)`, '*S-1-5-18:(F)'], { windowsHide: true, stdio: 'ignore' });
      if (result.error || result.status !== 0) { await fs.unlink(output).catch(() => {}); throw new Error('encrypted_export_acl_failed'); }
    } else await fs.chmod(output, 0o600);
    const stat = await fs.stat(output);
    console.log(JSON.stringify({ state: payload.completeness, encrypted: true, bytes: stat.size, sha256: crypto.createHash('sha256').update(await fs.readFile(output)).digest('hex'), expiresAt: envelope.expiresAt, path: output }));
  } finally { passphrase = null; confirm = null; }
}

async function runRequest(filePath) {
  await secureCaseDirectory();
  const inputPath = withinRoot(filePath);
  const stats = await fs.lstat(inputPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('case_input_must_be_regular_file');
  const raw = await fs.readFile(inputPath);
  let request;
  try { request = JSON.parse(raw.toString('utf8')); }
  catch { raw.fill(0); throw new Error('invalid_case_input'); }
  raw.fill(0);
  const { parseOperatorRequest } = await import('../supabase/functions/privacy-operator/privacyOperatorPolicy.mjs');
  const parsed = parseOperatorRequest(request);
  if (!parsed.ok) throw new Error(`case_input_${parsed.code}`);
  const client = await createOperatorClient();
  let completed = false;
  try {
    if (!process.stdout.isTTY) throw new Error('interactive_secure_terminal_required');
    if (request.action === 'correct_candidate') {
      const preview = await invoke(client, { ...request, dryRun: true, confirm: false });
      if (preview?.state === 'already_satisfied') {
        console.log(JSON.stringify({ state: 'already_satisfied', caseId: request.caseId, valuesOmitted: true }));
        completed = true;
        return;
      }
      if (preview?.state !== 'dry_run') throw new Error('correction_preview_unavailable');
      console.log(JSON.stringify({ state: 'dry_run', caseId: request.caseId, proposedFields: Object.keys(request.patch), currentVersion: preview.current?.updated_at, valuesOmitted: true }));
      if (!await askApply(request.caseId, 'correction')) { console.log('{"state":"cancelled"}'); return; }
      const result = await invoke(client, { ...request, dryRun: false, confirm: true });
      console.log(JSON.stringify({ state: result?.state ?? 'applied', caseId: request.caseId, valuesOmitted: true }));
      completed = true;
      return;
    }
    if (request.action === 'record_disposal') {
      const preview = await invoke(client, { ...request, dryRun: true, confirm: false });
      if (preview?.erasureCheck?.state !== 'verified') {
        console.log(JSON.stringify({ state: 'blocked', caseId: request.caseId, erasureCheck: preview?.erasureCheck ?? null }));
        return;
      }
      console.log(JSON.stringify({ state: 'dry_run', caseId: request.caseId, residualSources: 0, noDisposalRecordCreated: true }));
      if (!await askApply(request.caseId, 'disposal record')) { console.log('{"state":"cancelled"}'); return; }
      const result = await invoke(client, { ...request, dryRun: false, confirm: true });
      console.log(JSON.stringify(result));
      completed = true;
      return;
    }
    const result = await invoke(client, request);
    if (request.action === 'export') { await writeEncryptedExport(request.caseId, result); completed = true; return; }
    if (request.action === 'inventory') {
      console.log(JSON.stringify({ sources: result.sources, coverage: result.coverage, limitations: result.limitations, partialSources: result.partialSources }));
    } else console.log(JSON.stringify(result));
    completed = true;
  } finally {
    if (completed) await fs.unlink(inputPath).catch(() => {});
    await client.auth.signOut().catch(() => {});
  }
}

function schedulePlaintextExpiry(filePath) {
  const cleanupScript = path.join(__dirname, 'privacy-operator-expire-file.cjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cleanupScript, filePath, String(Date.now() + OPEN_TTL_MS)], {
      detached: true, windowsHide: true, stdio: 'ignore',
    });
    child.once('spawn', () => { child.unref(); resolve(); });
    child.once('error', () => reject(new Error('temporary_file_expiry_unavailable')));
  });
}

async function decryptFile(filePath) {
  await secureCaseDirectory();
  const inputPath = withinRoot(filePath);
  const stat = await fs.lstat(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('encrypted_export_must_be_regular_file');
  const envelope = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  let passphrase = await prompt('Export passphrase (not echoed)', true);
  try {
    const payload = decryptPackage(envelope, passphrase);
    const output = path.join(CASE_ROOT, `opened-${crypto.randomUUID()}.json`);
    await fs.writeFile(output, JSON.stringify(payload), { flag: 'wx', mode: 0o600 });
    if (process.platform === 'win32') {
      const result = spawnSync('icacls.exe', [output, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W)`, '*S-1-5-18:(F)'], { windowsHide: true, stdio: 'ignore' });
      if (result.error || result.status !== 0) { await fs.unlink(output).catch(() => {}); throw new Error('opened_export_acl_failed'); }
    }
    try { await schedulePlaintextExpiry(output); }
    catch (error) { await fs.unlink(output).catch(() => {}); throw error; }
    console.log(JSON.stringify({ state: 'decrypted_to_private_temporary_file', path: output, expiresAt: new Date(Date.now() + OPEN_TTL_MS).toISOString(), deleteAfterUse: true }));
  } finally { passphrase = null; }
}

async function purgeExpired() {
  await secureCaseDirectory();
  const now = Date.now();
  let removed = 0;
  for (const entry of await fs.readdir(CASE_ROOT, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(CASE_ROOT, entry.name);
    if (entry.name.startsWith('opened-') && entry.name.endsWith('.json')) {
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs >= OPEN_TTL_MS) { await fs.unlink(fullPath); removed += 1; }
    } else if (entry.name.startsWith('rights-') && entry.name.endsWith('.bpkvkk')) {
      try {
        const envelope = JSON.parse(await fs.readFile(fullPath, 'utf8'));
        if (Date.parse(envelope.expiresAt) <= now) { await fs.unlink(fullPath); removed += 1; }
      } catch { /* malformed encrypted evidence is retained for operator review */ }
    }
  }
  console.log(JSON.stringify({ expiredArtifactsRemoved: removed }));
}

async function main() {
  const [command, filePath] = process.argv.slice(2);
  if (command === 'run' && filePath) return await runRequest(filePath);
  if (command === 'decrypt' && filePath) return await decryptFile(filePath);
  if (command === 'purge') return await purgeExpired();
  throw new Error('usage: node scripts/privacy-operator.cjs run <case-file-in-.local/privacy-cases> | decrypt <encrypted-export-in-.local/privacy-cases> | purge');
}

main().catch((error) => { console.error(error?.message ?? 'privacy_operator_failed'); process.exitCode = 1; });
