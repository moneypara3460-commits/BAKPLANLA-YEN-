(() => {
  const DEV_REF = 'tlizbrhmwaesfjmtxcgh';
  const config = window.BAKPLANLA_CASHIER_DEV_CONFIG || {};
  const status = document.getElementById('status');
  const signInPanel = document.getElementById('sign-in-panel');
  const cashierPanel = document.getElementById('cashier-panel');
  const signInForm = document.getElementById('sign-in-form');
  const redeemForm = document.getElementById('redeem-form');
  const signInButton = document.getElementById('sign-in');
  const redeemButton = document.getElementById('redeem');
  const businessSelect = document.getElementById('partner');
  const codeInput = document.getElementById('code');
  const pinInput = document.getElementById('pin');
  const signedInAs = document.getElementById('signed-in-as');
  let supabase = null;
  let currentUserId = null;

  const setStatus = (message, kind = 'info') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };

  const isLegacyAnonKey = (key) => {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(payload + '='.repeat((4 - (payload.length % 4)) % 4));
      const claims = JSON.parse(json);
      return claims.role === 'anon' && claims.ref === DEV_REF;
    } catch {
      return false;
    }
  };

  const validDevConfig = () => {
    if (typeof config.supabaseUrl !== 'string' || typeof config.publishableKey !== 'string') return false;
    try {
      const url = new URL(config.supabaseUrl);
      const key = config.publishableKey.trim();
      return url.protocol === 'https:'
        && url.hostname === `${DEV_REF}.supabase.co`
        && url.origin === `https://${DEV_REF}.supabase.co`
        && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
        && ( /^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || isLegacyAnonKey(key) )
        && !key.startsWith('sb_secret_');
    } catch {
      return false;
    }
  };

  const showSignedOut = (message) => {
    currentUserId = null;
    cashierPanel.hidden = true;
    signInPanel.hidden = false;
    businessSelect.replaceChildren();
    signedInAs.textContent = '';
    if (message) setStatus(message);
  };

  const loadBusinesses = async (session) => {
    if (!session?.user?.id || session.user.id === currentUserId) return;
    currentUserId = session.user.id;
    signedInAs.textContent = session.user.email || 'Signed-in cashier';
    signInPanel.hidden = true;
    cashierPanel.hidden = false;
    businessSelect.replaceChildren();
    setStatus('Checking assigned business access…');

    const { data, error } = await supabase.rpc('partner_cashier_businesses');
    if (currentUserId !== session.user.id) return;
    if (error || !Array.isArray(data)) {
      businessSelect.replaceChildren();
      setStatus('Could not verify cashier assignments. Try signing in again.', 'error');
      return;
    }

    const businesses = data.filter((item) => item && typeof item.partner_id === 'string' && typeof item.partner_name === 'string');
    for (const business of businesses) {
      const option = document.createElement('option');
      option.value = business.partner_id;
      option.textContent = business.partner_name;
      businessSelect.append(option);
    }

    const prefilledPartner = new URLSearchParams(window.location.search).get('i');
    if (prefilledPartner && businesses.some((business) => business.partner_id === prefilledPartner)) {
      businessSelect.value = prefilledPartner;
    }

    if (businesses.length === 0) {
      setStatus('This verified account has no cashier business assignment.', 'error');
      businessSelect.disabled = true;
      redeemButton.disabled = true;
      return;
    }

    businessSelect.disabled = false;
    redeemButton.disabled = false;
    if (prefilledPartner && !businesses.some((business) => business.partner_id === prefilledPartner)) {
      setStatus('The QR business is not assigned to this cashier. Select an authorized business.', 'error');
    } else {
      setStatus('Signed in. Select an authorized business and enter its PIN.');
    }
  };

  if (!validDevConfig() || !window.supabase?.createClient) {
    currentUserId = null;
    cashierPanel.hidden = true;
    signInPanel.hidden = true;
    setStatus('DEV setup required. Copy cashier/config.example.js to .local/cashier-config.js and add only the DEV publishable key.', 'error');
    return;
  }

  supabase = window.supabase.createClient(config.supabaseUrl, config.publishableKey.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const query = new URLSearchParams(window.location.search);
  codeInput.value = query.get('k') || '';

  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    signInButton.disabled = true;
    setStatus('Signing in…');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    document.getElementById('password').value = '';
    signInButton.disabled = false;
    if (error || !data.session) {
      setStatus('Sign-in failed. Check the account and email verification, then try again.', 'error');
      return;
    }
    await loadBusinesses(data.session);
  });

  document.getElementById('sign-out').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setStatus('Sign-out failed. Close this development page and review the session.', 'error');
      return;
    }
    showSignedOut('Signed out.');
  });

  businessSelect.addEventListener('change', () => setStatus('Authorized business selected.'));

  redeemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const partner = businessSelect.value;
    const pin = pinInput.value;
    const code = codeInput.value.trim();
    if (!partner || !pin || !code) {
      setStatus('Choose an authorized business and enter both the PIN and code.', 'error');
      return;
    }
    redeemButton.disabled = true;
    pinInput.value = '';
    setStatus('Checking redemption…');
    const { data, error } = await supabase.rpc('partner_redeem_code_secure', {
      p_partner: partner,
      p_pin: pin,
      p_code: code,
    });
    redeemButton.disabled = false;
    if (error) {
      setStatus('The cashier request could not be completed. Check the session and try again.', 'error');
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.ok === true) {
      setStatus(`Redeemed: ${result.partner} · ${result.percent}%`, 'success');
      return;
    }
    const messages = {
      auth: 'Sign in again to continue.',
      email_not_confirmed: 'This cashier account must have a verified email.',
      unauthorized: 'This cashier is not assigned to the selected business.',
      invalid_partner: 'This business is not available for redemption.',
      bad_pin: 'The business PIN is incorrect.',
      invalid: 'The code is invalid.',
      used: 'This code has already been redeemed.',
      expired: 'This code is expired or outside the redemption window.',
      too_many: 'Too many attempts. Wait 15 minutes before trying again.',
    };
    setStatus(messages[result?.error] || 'The redemption was not completed.', 'error');
  });

  supabase.auth.onAuthStateChange((event, session) => {
    queueMicrotask(() => {
      if (!session) showSignedOut(event === 'SIGNED_OUT' ? 'Signed out.' : 'Sign in to continue.');
      else void loadBusinesses(session);
    });
  });

  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      showSignedOut('Could not restore this development session. Sign in again.');
    } else if (data.session) {
      void loadBusinesses(data.session);
    } else {
      showSignedOut('Sign in with an assigned, verified cashier account.');
    }
  });
})();
