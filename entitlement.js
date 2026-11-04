/*
===========================================================
  BAKPLANLA — Pro yetkisi ve ücretsiz kullanım hakkı (deneme) sayaçları
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.
  Supabase istemcisi ve cihaz depolaması dışarıdan verilir.

  Sunucu tarafı: supabase/bakplanla_pro.sql çalıştırılmış olmalıdır
  (bakplanla_entitlements, bakplanla_feature_trials, consume_feature_trial, refund_feature_trial).

  GÜVENLİK İLKESİ: Pro yetkisini yalnızca SUNUCUDAKİ kayıt belirler. İstemci kendini Pro yapamaz
  (tabloya yazma izni yoktur; kayıt, ödeme sağlayıcısının sunucu bildirimiyle ya da yönetici
  tarafından yazılır). Gerçek ödeme altyapısı bağlanana kadar kimse "Pro aktif" görünmez.
===========================================================
*/
import { classifyError } from './backup.js';

export const ENTITLEMENT_TABLE = 'bakplanla_entitlements';
export const TRIALS_TABLE = 'bakplanla_feature_trials';
export const FREE_TRIAL_LIMIT = 1;
export const ENTITLEMENT_TIMEOUT_MS = 15000;

export const TRIAL_FEATURES = ['documentAnalysis', 'planAI', 'opportunities', 'today', 'qr'];

/*
  Hangi özelliklerde ücretsiz hak GERÇEKTEN sınırlanır?
  Şu an yalnızca uygulamada zaten sınırlı olan 'documentAnalysis'. Diğerlerini sınırlamak için
  ilgili anahtarı bu listeye eklemek yeterlidir (örn. 'planAI'); ekran tarafı hazırdır.
  Ödeme altyapısı çalışmadan hepsini sınırlamak, kullanıcıyı tek denemeden sonra kilitler.
*/
export const ENFORCED_FEATURES = ['documentAnalysis'];

export const PRO_PLANS = ['pro_monthly', 'pro_yearly'];

export const isProActive = (row, now = Date.now()) => {
  if (!row || typeof row !== 'object') return false;
  if (!PRO_PLANS.includes(row.plan)) return false;
  // 'canceled' = yenilenmeyecek ama dönem sonuna kadar erişim sürer.
  if (row.status !== 'active' && row.status !== 'canceled') return false;
  if (row.current_period_end == null) return row.status === 'active';
  const end = Date.parse(row.current_period_end);
  return Number.isFinite(end) && end > now;
};

// Ekranda gösterilecek durum: 'free' | 'pro' | 'pro_canceled' | 'expired'
export const describeEntitlement = (row, now = Date.now()) => {
  if (isProActive(row, now)) {
    return {
      state: row.status === 'canceled' ? 'pro_canceled' : 'pro',
      plan: row.plan,
      periodEnd: row.current_period_end || null,
      autoRenew: row.status === 'active' && row.auto_renew !== false,
    };
  }
  if (row && PRO_PLANS.includes(row.plan)) {
    return { state: 'expired', plan: row.plan, periodEnd: row.current_period_end || null, autoRenew: false };
  }
  return { state: 'free', plan: null, periodEnd: null, autoRenew: false };
};

const withTimeout = (promise, ms = ENTITLEMENT_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ kind: 'timeout', message: 'timeout' }), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });

/* ---------- sunucudan yetki okuma ---------- */

export const fetchEntitlement = async (supabase, uid) => {
  try {
    const res = await withTimeout(
      supabase
        .from(ENTITLEMENT_TABLE)
        .select('plan, status, current_period_end, auto_renew, source, updated_at')
        .eq('user_id', uid)
        .maybeSingle()
    );
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    return { ok: true, row: (res && res.data) || null };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};

// Bu hesabın sunucuda kullandığı ücretsiz haklar: { ok:true, used: { [feature]: sayı } }
export const fetchTrialUsage = async (supabase, uid) => {
  try {
    const res = await withTimeout(supabase.from(TRIALS_TABLE).select('feature, used_count').eq('user_id', uid));
    if (res && res.error) return { ok: false, reason: classifyError(res.error) };
    const used = {};
    for (const r of (res && res.data) || []) if (r && r.feature) used[r.feature] = Number(r.used_count) || 0;
    return { ok: true, used };
  } catch (error) {
    return { ok: false, reason: classifyError(error) };
  }
};

/*
  UI preflight only. The Edge Function makes the authoritative atomic trial decision.
  This read preserves the existing blocked/Pro presentation without consuming a trial twice.
*/
export const createFeatureGate = ({ supabase, getUid, enforced = ENFORCED_FEATURES, now = () => Date.now() }) =>
  async (feature) => {
    const noop = async () => {};
    if (!enforced.includes(feature)) return { allowed: true, mode: 'free', refund: noop };
    const uid = getUid();
    if (!uid) return { allowed: false, mode: 'auth', refund: noop };

    const entitlement = await fetchEntitlement(supabase, uid);
    if (!entitlement.ok) return { allowed: false, mode: 'error', reason: entitlement.reason, refund: noop };
    if (isProActive(entitlement.row, now())) return { allowed: true, mode: 'pro', refund: noop };

    const trials = await fetchTrialUsage(supabase, uid);
    if (!trials.ok) return { allowed: false, mode: 'error', reason: trials.reason, refund: noop };
    if ((Number(trials.used[feature]) || 0) >= FREE_TRIAL_LIMIT) {
      return { allowed: false, mode: 'blocked', refund: noop };
    }
    return { allowed: true, mode: 'trial', refund: noop };
  };
