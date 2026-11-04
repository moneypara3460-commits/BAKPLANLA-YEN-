const PROCESSING_FLAGS = Object.freeze({
  ai: "AI_PROVIDER_PROCESSING_ENABLED",
  aiSensitiveContent: "AI_SENSITIVE_DATA_PROCESSING_ENABLED",
  places: "PLACES_PROVIDER_PROCESSING_ENABLED",
  businessEmail: "BUSINESS_EMAIL_PROCESSING_ENABLED",
  shoppingReminderWorker: "SHOPPING_REMINDER_WORKER_ENABLED",
});

// Outbound processing stays disabled unless an operator explicitly enables the
// exact processor path. This is an operational circuit breaker, not legal proof.
export function providerProcessingEnabled(processor, readEnv) {
  const flag = PROCESSING_FLAGS[processor];
  if (!flag || typeof readEnv !== "function") return false;
  try {
    return readEnv(flag) === "true";
  } catch {
    return false;
  }
}

export { PROCESSING_FLAGS };
