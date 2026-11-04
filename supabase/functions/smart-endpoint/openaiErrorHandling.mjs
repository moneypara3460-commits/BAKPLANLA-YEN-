const SAFE_OPERATIONS = new Set(["chat", "opportunities", "receipt", "documentAnalysis"]);

// Provider error bodies can echo credentials or customer input. Keep logs limited to
// allowlisted operation names and the numeric HTTP status; never read the body.
export function openAiNonOkResponse({ response, operation, errorMessage, jsonResponse, logger = console }) {
  if (!response || response.ok !== false) throw new TypeError("non-ok provider response required");
  if (typeof jsonResponse !== "function") throw new TypeError("JSON response factory required");

  const safeOperation = SAFE_OPERATIONS.has(operation) ? operation : "unknown";
  const status = Number.isInteger(response.status) && response.status >= 300 && response.status <= 599
    ? response.status
    : 0;
  logger.error("openai_provider_error", { operation: safeOperation, status });
  return jsonResponse({ error: errorMessage }, 502);
}
