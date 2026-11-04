export const BODY_READ_TIMEOUT_MS = 15_000;

export class BodyTooLarge extends Error {}

export async function readBodyLimited(req, maxBytes, timeoutMs = BODY_READ_TIMEOUT_MS) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLarge();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("request body read timed out");
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("request body read timed out")), remaining);
      });
      let chunk;
      try {
        chunk = await Promise.race([reader.read(), timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new BodyTooLarge();
      chunks.push(chunk.value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* best-effort cancellation */ }
    throw error;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
