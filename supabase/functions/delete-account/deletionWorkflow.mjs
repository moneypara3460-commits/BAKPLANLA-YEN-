/**
 * Cross-service deletion is not atomic. A private receipt is created before
 * effects begin; each confirmed step is recorded so status lookup can safely
 * reconcile a lost response without treating a missing Auth user as proof.
 */
export async function runDeletionSteps({ uid, credentialHash, receipt, removeStorage, deleteDatabase, deleteAuth, authUserExists }) {
  let operation;
  try {
    operation = await receipt.begin(credentialHash, uid);
  } catch {
    return { state: "not_started" };
  }
  if (!operation || operation.state === "unavailable" || operation.state === "expired") return { state: "not_started" };
  if (operation.state === "completed") return { state: "completed", expires_at: operation.expires_at };
  const expiresAt = Date.parse(operation.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000) {
    return { state: "not_started" };
  }

  let images = 0;
  if (!operation.storage_done) {
    try {
      images = await removeStorage(uid);
      operation = await receipt.mark(credentialHash, uid, "storage", "completed");
      if (operation?.state === "unavailable") return { state: "unknown", stage: "storage" };
    } catch {
      await markFailure(receipt, credentialHash, uid, "storage", "unknown");
      return { state: "unknown", stage: "storage" };
    }
  }

  let database = { deleted_rows: 0 };
  if (!operation.database_done) {
    try {
      database = await deleteDatabase(uid);
      operation = await receipt.mark(credentialHash, uid, "database", "completed");
      if (operation?.state === "unavailable") return { state: "unknown", stage: "database", deleted: { images } };
    } catch {
      await markFailure(receipt, credentialHash, uid, "database", "unknown");
      return { state: "unknown", stage: "database", deleted: { images } };
    }
  }

  if (!operation.auth_done) {
    try {
      await deleteAuth(uid);
    } catch {
      let exists;
      try { exists = await authUserExists(uid); } catch { exists = null; }
      if (exists === false) {
        try {
          operation = await receipt.mark(credentialHash, uid, "auth", "completed");
        } catch {
          return { state: "unknown", stage: "auth", deleted: { images, rows: database?.deleted_rows ?? 0 } };
        }
        if (operation?.state === "completed") return { state: "completed", expires_at: operation.expires_at };
        return { state: "unknown", stage: "auth", deleted: { images, rows: database?.deleted_rows ?? 0 } };
      }
      const state = exists === true ? "partial" : "unknown";
      await markFailure(receipt, credentialHash, uid, "auth", state);
      return { state, stage: "auth", deleted: { images, rows: database?.deleted_rows ?? 0 } };
    }
    try {
      operation = await receipt.mark(credentialHash, uid, "auth", "completed");
    } catch {
      return { state: "unknown", stage: "auth", deleted: { images, rows: database?.deleted_rows ?? 0 } };
    }
  }

  if (operation?.state !== "completed" || !operation.storage_done || !operation.database_done || !operation.auth_done) {
    return { state: "unknown", stage: "auth", deleted: { images, rows: database?.deleted_rows ?? 0 } };
  }
  return { state: "completed", expires_at: operation.expires_at };
}

async function markFailure(receipt, hash, uid, step, state) {
  try { await receipt.mark(hash, uid, step, state); } catch { /* Status reconciliation remains authoritative. */ }
}

/**
 * Status lookup may infer Auth completion only when Storage and SQL completion
 * were already durably recorded for this exact receipt.
 */
export async function reconcileDeletionReceipt({ operation, credentialHash, receipt, authUserExists }) {
  if (!operation || operation.state === "expired") return { state: "expired" };
  if (operation.state === "completed" && operation.storage_done && operation.database_done && operation.auth_done) {
    return { state: "completed", expires_at: operation.expires_at };
  }
  if (!operation.storage_done || !operation.database_done || operation.auth_done) {
    return { state: operation.state || "unknown", stage: operation.stage, expires_at: operation.expires_at };
  }
  let exists;
  try { exists = await authUserExists(operation.owner_user_id); } catch { exists = null; }
  if (exists === false) {
    try {
      const marked = await receipt.mark(credentialHash, operation.owner_user_id, "auth", "completed");
      if (marked?.state === "completed" && marked.storage_done && marked.database_done && marked.auth_done) {
        return { state: "completed", expires_at: marked.expires_at };
      }
    } catch { /* Do not infer completion when the durable receipt cannot be updated. */ }
    return { state: "unknown", stage: "auth" };
  }
  if (exists === null) return { state: "unknown", stage: "auth" };
  return { state: "partial", stage: "auth", expires_at: operation.expires_at };
}
