// Build the OpenAI-compatible Responses request. fetchImpl is injectable so tests can
// exercise success and timeout behavior without a network endpoint or real credential.
// Leave room for the existing receipt-analysis contract (up to 100 sanitized items).
export const DEFAULT_OUTPUT_TOKEN_LIMIT = 6144;
export const MAX_OUTPUT_TOKEN_LIMIT = 8192;

export function boundedOutputTokenLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_OUTPUT_TOKEN_LIMIT;
  return Math.min(parsed, MAX_OUTPUT_TOKEN_LIMIT);
}

export function requestOpenAiResponses({
  baseUrl,
  apiKey,
  model,
  content,
  timeoutMs,
  maxOutputTokens = DEFAULT_OUTPUT_TOKEN_LIMIT,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation required");
  return fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      store: false,
      max_output_tokens: boundedOutputTokenLimit(maxOutputTokens),
    }),
  });
}
