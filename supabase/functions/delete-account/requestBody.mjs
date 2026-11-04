/**
 * Parse a JSON object while bounding bytes consumed from an untrusted request.
 * Content-Length is only a fast path; the stream limit is authoritative.
 */
export async function readBoundedJsonBody(request, maxBytes) {
  const contentLength = request.headers.get("content-length");
  if (/^\d+$/.test(contentLength ?? "") && Number(contentLength) > maxBytes) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    void reader.cancel().catch(() => {});
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
