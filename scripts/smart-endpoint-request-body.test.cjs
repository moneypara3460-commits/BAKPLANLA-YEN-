const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const test = require('node:test');

const moduleUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/requestBody.mjs')).href;

const requestWithStream = (stream, headers = new Headers()) => ({ headers, body: stream });

test('request body reader accepts bounded streamed content and enforces actual bytes without Content-Length', async () => {
  const { BodyTooLarge, readBodyLimited } = await import(moduleUrl);
  const valid = requestWithStream(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok":'));
      controller.enqueue(new TextEncoder().encode('true}'));
      controller.close();
    },
  }));
  assert.equal(await readBodyLimited(valid, 16), '{"ok":true}');

  let cancelled = false;
  const oversized = requestWithStream(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5));
      controller.enqueue(new Uint8Array(5));
    },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readBodyLimited(oversized, 8), BodyTooLarge);
  assert.equal(cancelled, true);
});

test('request body reader rejects declared oversize before reading and bounds stalled streams', async () => {
  const { BodyTooLarge, readBodyLimited } = await import(moduleUrl);
  let read = false;
  const declaredOversize = {
    headers: new Headers({ 'content-length': '9' }),
    body: { getReader() { read = true; throw new Error('body must not be read'); } },
  };
  await assert.rejects(readBodyLimited(declaredOversize, 8), BodyTooLarge);
  assert.equal(read, false);

  let cancelled = false;
  const stalled = requestWithStream(new ReadableStream({
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readBodyLimited(stalled, 8, 10), /request body read timed out/);
  assert.equal(cancelled, true);
});
