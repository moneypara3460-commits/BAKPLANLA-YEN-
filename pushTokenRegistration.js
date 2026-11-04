// Serializes installation-token lookups and writes with account sign-out.
export const createPushTokenRegistrationQueue = ({ getCurrentUid, getToken, loadStoredToken, storeToken, removeStoredToken, hasRegisteredToken, saveToken, removeToken }) => {
  let pending = Promise.resolve();
  let blockedUid = null;
  let generation = 0;
  let currentToken = null;

  const register = (uid) => {
    const requestGeneration = generation;
    const request = pending.catch(() => {}).then(async () => {
      if (!uid || getCurrentUid() !== uid || blockedUid === uid || requestGeneration !== generation) {
        return { ok: false, reason: 'auth' };
      }
      const token = await getToken();
      if (!token) return { ok: false, reason: 'token' };
      if (getCurrentUid() !== uid || blockedUid === uid || requestGeneration !== generation) {
        return { ok: false, reason: 'auth' };
      }
      const stored = await storeToken(token);
      if (!stored) return { ok: false, reason: 'storage' };
      if (getCurrentUid() !== uid || blockedUid === uid || requestGeneration !== generation) {
        return { ok: false, reason: 'auth' };
      }
      currentToken = token;
      return saveToken(uid, token);
    });
    pending = request.catch(() => ({ ok: false, reason: 'network' }));
    return request;
  };

  const prepareSignOut = async (uid, { requireToken = false, allowUnresolved = false } = {}) => {
    blockedUid = uid;
    const signOutGeneration = ++generation;
    const isCurrentSignOut = () => Boolean(uid)
      && getCurrentUid() === uid
      && blockedUid === uid
      && generation === signOutGeneration;
    await pending.catch(() => {});
    if (!isCurrentSignOut()) return { ok: false, reason: 'auth' };
    const token = currentToken || await loadStoredToken() || await getToken();
    if (!isCurrentSignOut()) return { ok: false, reason: 'auth' };
    if (!token) {
      if (!requireToken && allowUnresolved) return { ok: true, unresolved: true };
      if (!requireToken) {
        let registration;
        try { registration = await hasRegisteredToken(uid); }
        catch (error) { registration = { ok: false, reason: 'network' }; }
        if (!isCurrentSignOut()) return { ok: false, reason: 'auth' };
        if (registration?.ok && !registration.hasToken) return { ok: true };
        if (registration?.ok) {
          blockedUid = null;
          generation += 1;
          return { ok: false, reason: 'registered-token' };
        }
        blockedUid = null;
        generation += 1;
        return { ok: false, reason: 'registration-check' };
      }
      blockedUid = null;
      generation += 1;
      return { ok: false, reason: 'token' };
    }
    const result = await removeToken(uid, token);
    if (!isCurrentSignOut()) return { ok: false, reason: 'auth' };
    if (!result.ok) {
      blockedUid = null;
      generation += 1;
      return result;
    }
    currentToken = null;
    await Promise.resolve(removeStoredToken()).catch(() => {});
    return { ok: true };
  };

  const sessionChanged = (uid) => {
    if (blockedUid && blockedUid !== uid) blockedUid = null;
    generation += 1;
  };

  const cancelSignOut = (uid) => {
    if (blockedUid === uid) blockedUid = null;
    generation += 1;
  };

  return { register, prepareSignOut, sessionChanged, cancelSignOut };
};
