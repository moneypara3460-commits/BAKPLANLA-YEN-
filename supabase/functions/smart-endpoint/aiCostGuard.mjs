export const sharedRateLimitDecision = (allowed) => {
  if (allowed === true) return "allowed";
  if (allowed === false) return "limited";
  return "unavailable";
};

export const aiConsentDecision = (active) => {
  if (active === true) return "allowed";
  if (active === false) return "denied";
  return "unavailable";
};

export const combineAiAuthorizations = (legacyConsent, purposeAuthorization) => {
  if (legacyConsent === "unavailable" || purposeAuthorization === "unavailable") return "unavailable";
  return legacyConsent === "allowed" && purposeAuthorization === "allowed" ? "allowed" : "denied";
};

export async function checkAiConsent(readConsent, userId) {
  try {
    return aiConsentDecision(await readConsent(userId));
  } catch {
    return "unavailable";
  }
}

export async function checkSharedRateLimit(checkRateLimit, userId, kind) {
  try {
    return sharedRateLimitDecision(await checkRateLimit(userId, kind));
  } catch {
    return "unavailable";
  }
}

export const aiQuotaDecision = (quota) => {
  if (quota && typeof quota === "object" && !Array.isArray(quota)) {
    if (quota.ok === true) return { state: "reserved", quota };
    if (quota.error === "daily" || quota.error === "monthly") {
      return { state: "limited", quota };
    }
  }
  return { state: "unavailable", quota: null };
};

export async function reserveAiQuota(takeQuota, userId) {
  try {
    return aiQuotaDecision(await takeQuota(userId));
  } catch {
    return { state: "unavailable", quota: null };
  }
}

export async function runReservedAiProvider(reservation, invoke) {
  if (!reservation || typeof invoke !== "function") {
    throw new Error("AI quota reservation required");
  }
  reservation.providerStarted = true;
  return invoke();
}

export const shouldRefundPreProviderReservations = (status, reservation) =>
  Number.isInteger(status) && status >= 400 && reservation?.providerStarted === false;

export const featureForSmartMode = (mode) => {
  if (mode === "places" || mode === "chat" || mode === "opportunities" || mode === "receipt") return null;
  return "documentAnalysis";
};

export const featureTrialDecision = (result) => {
  if (!result || typeof result !== "object" || Array.isArray(result)) return { state: "unavailable" };
  if (result.allowed === false && result.pro === false && result.retry_limited === true) return { state: "retry_limited" };
  if (result.allowed === false && result.pro === false) return { state: "limited" };
  if (result.allowed === true && result.pro === true) return { state: "pro" };
  if (result.allowed === true && result.pro === false) return { state: "trial" };
  return { state: "unavailable" };
};

export async function reserveFeatureTrial(authorize, userId, feature) {
  try {
    return featureTrialDecision(await authorize(userId, feature));
  } catch {
    return { state: "unavailable" };
  }
}
