// Keep only the user content needed by current AI prompts. This runs on the
// server boundary so older or direct clients cannot forward local/account
// metadata to the provider by adding arbitrary document properties.
const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function pickScalars(value, keys) {
  if (!isRecord(value)) return null;
  const result = {};
  for (const key of keys) {
    const item = value[key];
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) result[key] = item;
  }
  return Object.keys(result).length ? result : null;
}

const RECEIPT_STORE_FIELDS = ["chain", "legal_name", "type", "address", "district", "city"];
const RECEIPT_ITEM_FIELDS = ["raw_name", "name", "brand", "size", "quantity", "unit", "unit_price", "line_total", "category"];
const RECEIPT_FIELDS = ["store", "store_type", "branch", "date", "time", "total", "totals_match", "items", "discount_total", "items_total", "payment_method", "currency"];
const OPPORTUNITY_RECEIPT_FIELDS = RECEIPT_FIELDS.filter((key) => key !== "time" && key !== "payment_method");

function minimizeReceipt(value, { includeTransactionDetails = false } = {}) {
  if (!isRecord(value)) return value === null ? null : undefined;
  const allowedFields = includeTransactionDetails ? RECEIPT_FIELDS : OPPORTUNITY_RECEIPT_FIELDS;
  const receipt = pickScalars(value, allowedFields) || {};
  if (isRecord(value.store)) receipt.store = pickScalars(value.store, RECEIPT_STORE_FIELDS);
  if (Array.isArray(value.items)) {
    receipt.items = value.items.slice(0, 60).map((item) => pickScalars(item, RECEIPT_ITEM_FIELDS)).filter(Boolean);
  }
  return receipt;
}

const ANALYSIS_FIELDS = [
  "summary", "actions", "document_type", "title", "product_name", "date", "purchase_date",
  "amount", "currency", "payment_deadline", "return_period", "warranty_period",
  "important_deadline", "required_action", "urgency",
];

function minimizeAnalysis(value, options) {
  if (!isRecord(value)) return value === null ? null : undefined;
  const analysis = pickScalars(value, ANALYSIS_FIELDS) || {};
  if (Array.isArray(value.actions)) analysis.actions = value.actions.filter((item) => typeof item === "string");
  if (hasOwn(value, "receipt")) {
    const receipt = minimizeReceipt(value.receipt, options);
    if (receipt !== undefined) analysis.receipt = receipt;
  }
  return analysis;
}

/** Strip storage paths, owner IDs, local URIs, status flags and timestamps. */
export function minimizeAiDocuments(value, { includeNotes = false, includeTransactionDetails = false } = {}) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).filter(isRecord).map((document) => {
    const result = {};
    for (const key of ["title", "type"]) {
      if (document[key] === null || ["string", "number"].includes(typeof document[key])) result[key] = document[key];
    }
    if (includeNotes && (document.notes === null || typeof document.notes === "string")) result.notes = document.notes;
    if (hasOwn(document, "analysis")) {
      const analysis = minimizeAnalysis(document.analysis, { includeTransactionDetails });
      if (analysis !== undefined) result.analysis = analysis;
    }
    return result;
  });
}

/** Keep the current PLAN AI shopping contract, dropping arbitrary metadata. */
export function minimizeShoppingContext(value) {
  if (!isRecord(value)) return null;
  const result = {};
  if (Array.isArray(value.list)) {
    result.list = value.list.slice(0, 60).filter(isRecord).map((item) => {
      const row = pickScalars(item, ["name", "quantity", "unit", "checked", "last_price", "last_store"]);
      return row || {};
    });
  }
  if (Array.isArray(value.recent_receipts)) {
    result.recent_receipts = value.recent_receipts.slice(0, 5).filter(isRecord).map((receipt) =>
      pickScalars(receipt, ["store", "date", "total", "item_count"]) || {}
    );
  }
  return result;
}

export function buildChatContext(documents, shopping) {
  const minimizedDocuments = minimizeAiDocuments(documents, { includeNotes: true, includeTransactionDetails: true });
  const minimizedShopping = minimizeShoppingContext(shopping);
  return {
    documentContext: minimizedDocuments.length
      ? JSON.stringify(minimizedDocuments, null, 2)
      : "Kullanıcının analiz edilmiş bir belgesi bulunmuyor.",
    shoppingContext: minimizedShopping && Object.keys(minimizedShopping).length
      ? JSON.stringify(minimizedShopping, null, 2)
      : "Alışveriş listesi bilgisi gönderilmedi.",
  };
}

export function buildOpportunitiesContext(documents) {
  return JSON.stringify(minimizeAiDocuments(documents), null, 2);
}

/** Image modes intentionally retain the source image; callers use this only for explicit analysis. */
export function openAiImageContent(prompt, imageDataUrl) {
  return [
    { type: "input_text", text: prompt },
    { type: "input_image", image_url: imageDataUrl },
  ];
}
