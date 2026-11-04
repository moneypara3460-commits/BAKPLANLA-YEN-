const CREDENTIAL_PATTERN = /^[0-9a-f]{64}$/;

export const isValidReceiptCredential = (value) =>
  typeof value === "string" && CREDENTIAL_PATTERN.test(value);

export async function hashReceiptCredential(value) {
  if (!isValidReceiptCredential(value)) throw new Error("invalid_receipt_credential");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
