/*
===========================================================
  BAKPLANLA — İŞ BAŞI / UYGULAMA ↔ SUNUCU İSTEMCİSİ (Aşama 3)
  Saf JavaScript → Node ile sahte fetch kullanılarak test edilir.

  Çalışma modları (ekranda kullanıcıya açıkça yazılır):
   - online   : Sunucu kurulu ve erişilebilir. Vardiyalar sunucuda doğrulanır, kupon kazanılabilir.
   - local    : Sunucu fonksiyonu bu projede henüz dağıtılmamış (404). Oyun Aşama 2'deki gibi
                cihazda çalışır; ilerleme cihazda tutulur, kupon verilmez.
   - offline  : İnternet/sunucu geçici olarak yok. "Antrenman" oynanabilir; ilerlemeye ve ödüle sayılmaz.
===========================================================
*/

export const ISBASI_FUNCTION = 'isbasi';
export const ISBASI_TIMEOUT_MS = 15000;
export const ISBASI_SERVER_CACHE_KEY = 'BAKPLANLA_ISBASI_SERVER_CACHE';
export const ISBASI_PENDING_KEY = 'BAKPLANLA_ISBASI_PENDING_FINISH';

/*
  Dönüş: { ok: true, data } | { ok: false, kind, error, reason, status }
  kind: 'not_deployed' | 'network' | 'auth' | 'rejected' | 'locked' | 'rate_limited' | 'expired' | 'not_found' | 'server'
*/
export const classifyResponse = (status, body) => {
  if (status >= 200 && status < 300 && body && body.ok) return { ok: true, data: body };
  const error = body && body.error ? body.error : null;
  const base = { ok: false, status, error, reason: body && body.reason ? body.reason : null };
  // Supabase, dağıtılmamış fonksiyon için 404 ve gövdesinde bizim biçimimiz olmayan bir yanıt döner.
  if (status === 404 && error !== 'shift_not_found') return { ...base, kind: 'not_deployed' };
  if (status === 401) return { ...base, kind: 'auth' };
  if (error === 'rejected') return { ...base, kind: 'rejected' };
  if (error === 'level_locked') return { ...base, kind: 'locked' };
  if (status === 429 || error === 'rate_limited') return { ...base, kind: 'rate_limited' };
  if (error === 'shift_expired') return { ...base, kind: 'expired' };
  if (error === 'shift_not_found') return { ...base, kind: 'not_found' };
  return { ...base, kind: 'server' };
};

export const createIsbasiApi = ({ baseUrl, apiKey, getToken, fetchImpl, timeoutMs = ISBASI_TIMEOUT_MS }) => {
  const call = async (body) => {
    let token = null;
    try {
      token = await getToken();
    } catch (e) {
      token = null;
    }
    if (!token) return { ok: false, kind: 'auth', status: 0, error: 'no_session', reason: null };

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer;
    try {
      const request = (async () => {
        const response = await fetchImpl(`${baseUrl}/functions/v1/${ISBASI_FUNCTION}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: apiKey },
          body: JSON.stringify(body),
          signal: controller ? controller.signal : undefined,
        });
        let json = null;
        try {
          json = await response.json();
        } catch (e) {
          json = null;
        }
        return classifyResponse(response.status, json);
      });
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          resolve({ ok: false, kind: 'network', status: 0, error: 'network', reason: null });
        }, timeoutMs);
      });
      return await Promise.race([request(), timeout]);
    } catch (e) {
      return { ok: false, kind: 'network', status: 0, error: 'network', reason: null };
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    state: () => call({ mode: 'state' }),
    start: (role, level) => call({ mode: 'start', role, level }),
    finish: (shiftId, log, endT) => call({ mode: 'finish', shiftId, log, endT }),
  };
};

// Gönderilemeyen bir sonucun saklanıp sonra yeniden denenip denenmeyeceği.
export const isPendingUsable = (pending) =>
  !!pending
  && typeof pending.shiftId === 'string'
  && Array.isArray(pending.log)
  && Number.isFinite(pending.endT);

// Bir hata türünde aynı sonucu tekrar göndermenin anlamı var mı?
export const shouldKeepPending = (result) => !result.ok && ['auth', 'network', 'server'].includes(result.kind);

export const selectPendingForRecovery = (storedPending, memoryPending) => {
  const hasStored = storedPending !== null && storedPending !== undefined;
  if (hasStored && !isPendingUsable(storedPending)) return { ok: false, kind: 'invalid_pending' };
  if (hasStored && memoryPending && storedPending.shiftId !== memoryPending.shiftId) {
    return { ok: false, kind: 'pending_conflict' };
  }
  const pending = hasStored ? storedPending : memoryPending;
  if (pending && !isPendingUsable(pending)) return { ok: false, kind: 'invalid_pending' };
  return { ok: true, pending: pending || null };
};

// Tamamlama verisini önce kalıcılaştır; yazılamazsa ağ isteği hiç gönderilmez.
export const finishWithDurablePending = async (pending, { persist, submit, clear }) => {
  let stored = false;
  try { stored = await persist(pending); } catch { stored = false; }
  if (!stored) return { ok: false, kind: 'pending_storage', status: 0, error: 'pending_storage', reason: null };

  let result;
  try {
    result = await submit(pending.shiftId, pending.log, pending.endT);
  } catch {
    result = { ok: false, kind: 'network', status: 0, error: 'network', reason: null };
  }
  if (result.ok || !shouldKeepPending(result)) {
    try { await clear(); } catch { /* A retained pending receipt is safe to replay idempotently. */ }
  }
  return result;
};

export const startAfterPendingRecovery = async (pending, { retry, start, onRecovered }) => {
  if (isPendingUsable(pending)) {
    let result;
    try { result = await retry(pending); }
    catch { return { ok: false, kind: 'pending', status: 0, error: 'pending' }; }
    if (!result.ok) return { ok: false, kind: 'pending', status: result.status || 0, error: result.error || 'pending' };
    if (onRecovered) await onRecovered(result);
  }
  return start();
};

export const mergeCoupon = (coupons, coupon) => {
  const current = Array.isArray(coupons) ? coupons : [];
  if (!coupon) return current;
  const duplicate = current.some((item) =>
    (coupon.id && item && item.id === coupon.id)
    || (coupon.code && item && item.code === coupon.code)
  );
  return duplicate ? current : [coupon, ...current];
};

export const modeForError = (result) => {
  if (result.ok) return 'online';
  if (result.kind === 'not_deployed') return 'local';
  if (result.kind === 'network' || result.kind === 'server' || result.kind === 'auth') return 'offline';
  return 'online';
};
