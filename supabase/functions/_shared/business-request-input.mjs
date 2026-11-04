const MAX_REQUEST_BYTES = 8000;

const badRequest = () => ({ ok: false, status: 400, error: "Geçersiz istek." });
const tooLarge = () => ({ ok: false, status: 413, error: "Başvuru çok uzun." });

/** @typedef {{ ok: true, body: Record<string, unknown> } | { ok: false, status: 400 | 413, error: string }} ParseResult */

/** @param {Request} req @param {number} [maxBytes] @returns {Promise<ParseResult>} */
export async function readJsonObject(req, maxBytes = MAX_REQUEST_BYTES) {
  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader)) return badRequest();
    if (Number(lengthHeader) > maxBytes) return tooLarge();
  }

  const reader = req.body?.getReader();
  if (!reader) return badRequest();

  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch { /* over-limit response still takes precedence */ }
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return badRequest();
  } finally {
    try { reader.releaseLock(); } catch { /* already released or cancelled */ }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return badRequest();
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return badRequest();
  return { ok: true, body: parsed };
}

/**
 * @param {Request} req
 * @param {() => Promise<{ data?: { user?: unknown } | null, error?: { status?: number } | null }>} getUser
 * @returns {Promise<ParseResult | { ok: false, status: 401 | 503, error: string } | { ok: true, body: Record<string, unknown> }>}
 */
export async function readAuthorizedJsonObject(req, getUser) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed;

  let result;
  try {
    result = await getUser();
  } catch {
    return { ok: false, status: 503, error: "Kimlik doğrulaması şu anda yapılamıyor." };
  }
  if (!result?.data?.user) {
    const authStatus = result?.error?.status;
    const status = authStatus === undefined || authStatus >= 500 ? 503 : 401;
    const error = status === 401
      ? "unauthorized"
      : "Kimlik doğrulaması şu anda yapılamıyor.";
    return { ok: false, status, error };
  }

  return { ok: true, body: parsed.body };
}
