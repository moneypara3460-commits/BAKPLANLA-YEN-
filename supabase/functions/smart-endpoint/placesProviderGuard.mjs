export async function waitForProviderPermit(claimSlot, deadlineAt, options = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  try {
    while (now() < deadlineAt) {
      const waitMs = await claimSlot();
      if (!Number.isInteger(waitMs) || waitMs < 0) return "unavailable";
      if (waitMs === 0) return "allowed";
      const remaining = deadlineAt - now();
      if (remaining <= 0 || waitMs >= remaining) return "limited";
      await sleep(waitMs);
    }
  } catch {
    return "unavailable";
  }
  return "limited";
}

export const isPublicNominatim = (baseUrl) => {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "nominatim.openstreetmap.org";
  } catch {
    return false;
  }
};

export const shouldTryNextOverpassEndpoint = (status) => status !== 429 && status !== 504;

export const approvedPlacesProviderOrder = (configured) => {
  const extras = Array.isArray(configured)
    ? [...new Set(configured.map((name) => String(name).trim().toLowerCase()).filter((name) => name === "geoapify"))]
    : [];
  return ["overpass", ...extras];
};
