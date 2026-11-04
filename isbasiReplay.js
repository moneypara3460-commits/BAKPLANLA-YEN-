/*
===========================================================
  BAKPLANLA — İŞ BAŞI / HAMLE KAYDI VE DOĞRULAMA (Aşama 3)
  Saf JavaScript → hem uygulamada hem sunucuda (Supabase Edge Function, Deno) AYNI kod çalışır.

  NASIL ÇALIŞIR
  1. Vardiyayı SUNUCU başlatır ve rastgele bir "tohum" (seed) verir. Müşteriler/sepetler/raflar
     bu tohumdan üretilir; oyuncu tohumu seçemez.
  2. Uygulama her hamleyi [milisaniye, hamle, parametreler] olarak kaydeder (dispatch).
  3. Vardiya bitince kayıt sunucuya gönderilir. Sunucu aynı tohumla vardiyayı baştan kurar ve
     hamleleri aynı milisaniyelerde yeniden oynatır (replayShift). Puanı SUNUCU hesaplar;
     uygulamanın söylediği puana güvenilmez.
  4. İnsan hızı kontrolü: iki hamle arası en az MIN_ACTION_GAP_MS, her yeni müşteri/rafta ilk hamle
     en az MIN_REACTION_MS sonra olmalıdır. Kayıt, sunucunun ölçtüğü gerçek süreden uzun olamaz.

  DÜRÜSTLÜK NOTU: Bu düzen uydurma puanı ve insan-üstü hızı engeller. Gerçek oyun kurallarına
  uyan ama otomatik oynayan kararlı bir botu tamamen engelleyemez; günlük ödül sınırı bu
  durumun etkisini sınırlar.
===========================================================
*/

import {
  createShift, chooseCup, addIngredient, discardCup, peekRecipe, serve,
  advance, summarizeShift, roleLevelInfo, roleLevels,
} from './isbasi.js';
import {
  createCashierShift, createShelfShift,
  toggleScale, scanItem, voidLast, toggleBag, takePayment, addChange, clearChange, giveChange,
  selectItem, placeSelected, discardSelected, answerQuestion, peekPlanogram,
  applyDiscount, returnToStorage, reportShortage,
} from './isbasiMarket.js';

export const MAX_LOG = 800;
export const MIN_ACTION_GAP_MS = 80;
export const MIN_REACTION_MS = 250;
export const CLOCK_TOLERANCE_MS = 5000;
export const SHIFT_TTL_MS = 30 * 60 * 1000;

// Hamle adları (kayıtta kısa kod olarak tutulur; sırası DEĞİŞTİRİLMEMELİ, yalnızca sona eklenir).
export const ACTION_NAMES = [
  'chooseCup', 'addIngredient', 'discardCup', 'peekRecipe', 'serve',
  'toggleScale', 'scanItem', 'voidLast', 'toggleBag', 'takePayment', 'addChange', 'clearChange', 'giveChange',
  'selectItem', 'placeSelected', 'discardSelected', 'answerQuestion', 'peekPlanogram',
  // Aşama 4 (yeni mekanikler) — yalnızca sona eklenir
  'applyDiscount', 'returnToStorage', 'reportShortage',
];

const ACTIONS = {
  chooseCup, addIngredient, discardCup, peekRecipe, serve,
  toggleScale, scanItem, voidLast, toggleBag, takePayment, addChange, clearChange, giveChange,
  selectItem, placeSelected, discardSelected, answerQuestion, peekPlanogram,
  applyDiscount, returnToStorage, reportShortage,
};

export const ROLE_ACTIONS = {
  barista: ['chooseCup', 'addIngredient', 'discardCup', 'peekRecipe', 'serve'],
  cashier: ['toggleScale', 'scanItem', 'voidLast', 'toggleBag', 'takePayment', 'addChange', 'clearChange', 'giveChange', 'applyDiscount'],
  shelf: ['selectItem', 'placeSelected', 'discardSelected', 'answerQuestion', 'peekPlanogram', 'returnToStorage', 'reportShortage'],
};

export const ROLE_KEYS = Object.keys(ROLE_ACTIONS);

// Rol için vardiya kurar. gameDate yalnızca reyonda (SKT hesabı) kullanılır.
export const createRoleShift = (role, level, seed, gameDate) => {
  if (role === 'cashier') return createCashierShift(level, seed);
  if (role === 'shelf') return createShelfShift(level, seed, gameDate);
  return createShift(level, seed);
};

const validParam = (p) =>
  (typeof p === 'number' && Number.isFinite(p) && Math.abs(p) <= 1e6)
  || (typeof p === 'string' && p.length <= 40);

/*
  Hamleyi uygular ve kayda ekler. Hiçbir şeyi değiştirmeyen hamle kaydedilmez.
  Bitmiş vardiyada hamle yapılamaz.
*/
export const dispatch = (state, name, ...params) => {
  if (!state || state.finished) return state;
  const fn = ACTIONS[name];
  if (!fn || !(ROLE_ACTIONS[state.role] || []).includes(name)) return state;
  if (!params.every(validParam)) return state;
  // İnsan hızı korumaları uygulamada da uygulanır: böylece dürüst bir oyuncunun kaydı sunucuda
  // asla "çok hızlı" diye reddedilmez (ör. kazara çift dokunuş yok sayılır).
  const log = state.log || [];
  const lastT = log.length ? log[log.length - 1][0] : -Infinity;
  if (state.elapsedMs - lastT < MIN_ACTION_GAP_MS) return state;
  if (state.elapsedMs - state.taskStartMs < MIN_REACTION_MS) return state;
  const next = fn(state, ...params);
  if (next === state) return state;
  const code = ACTION_NAMES.indexOf(name);
  return { ...next, log: [...(state.log || []), [state.elapsedMs, code, ...params]] };
};

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

/*
  Sunucu doğrulaması. Girdi: vardiya bilgisi (sunucunun kendi kaydından), oyuncunun gönderdiği
  hamle kaydı (log) ve bitiş anı (endT, oyun içi ms). wallMs: sunucunun ölçtüğü gerçek süre.
  Dönüş: { ok: true, state, summary } | { ok: false, reason }
*/
export const replayShift = ({ role, level, seed, gameDate, log, endT, wallMs = null }) => {
  if (!ROLE_KEYS.includes(role)) return fail('bad_role');
  const lv = Math.floor(Number(level));
  if (!roleLevels(role).some((l) => l.level === lv)) return fail('bad_level');
  if (!Array.isArray(log) || log.length > MAX_LOG) return fail('bad_log');
  const end = Math.floor(Number(endT));
  if (!Number.isFinite(end) || end < 0) return fail('bad_end');

  const info = roleLevelInfo(role, lv);
  const maxGameMs = info.orders * info.patienceMs;
  if (end > maxGameMs) return fail('bad_end');
  if (wallMs !== null && end > wallMs + CLOCK_TOLERANCE_MS) return fail('clock');

  let st = createRoleShift(role, lv, seed, gameDate);
  let prevT = -Infinity;
  for (const entry of log) {
    if (!Array.isArray(entry) || entry.length < 2 || entry.length > 4) return fail('bad_entry');
    const [t, code, ...params] = entry;
    if (!Number.isInteger(t) || t < 0 || t > end) return fail('bad_time');
    if (t < prevT) return fail('time_order');
    if (t - prevT < MIN_ACTION_GAP_MS) return fail('too_fast');
    const name = ACTION_NAMES[code];
    if (!name || !ROLE_ACTIONS[role].includes(name)) return fail('bad_action');
    if (!params.every(validParam)) return fail('bad_param');

    st = advance(st, t - st.elapsedMs);
    if (st.finished) return fail('after_finish');
    if (t - st.taskStartMs < MIN_REACTION_MS) return fail('too_fast');
    st = ACTIONS[name](st, ...params);
    prevT = t;
  }
  st = advance(st, end - st.elapsedMs);
  if (!st.finished) return fail('not_finished');
  if (st.elapsedMs !== end) return fail('bad_end');
  return { ok: true, state: st, summary: summarizeShift(st) };
};
