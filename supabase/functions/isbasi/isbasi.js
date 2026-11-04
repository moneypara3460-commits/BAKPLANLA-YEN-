/*
  BAKPLANLA — İŞ BAŞI (sunucu kopyası; uygulamadaki isbasi.js ile aynı oyun kuralları)
*/

import { emptyCareer, normalizeCareer, applyCareer } from './isbasiCareer.js';

export const PROGRESS_VERSION = 2;
export const SHIFTS_FOR_REWARD = 5;
export const REWARD_MIN_STARS = 2;
export const DAILY_REWARD_SHIFT_CAP = 3;

export const POINTS = {
  correct: 100,
  speedBonusMax: 50,
  wrongServe: 25,
  discard: 5,
  peek: 20,
};

export const MAX_CUP_ITEMS = 6;

export const INGREDIENT_KEYS = ['espresso', 'water', 'milk', 'foam', 'choc', 'caramel', 'ice', 'coldMilk'];

export const RECIPES = [
  { key: 'espresso', minLevel: 1, steps: ['espresso'] },
  { key: 'americano', minLevel: 1, steps: ['espresso', 'water'] },
  { key: 'latte', minLevel: 1, steps: ['espresso', 'milk'] },
  { key: 'cappuccino', minLevel: 1, steps: ['espresso', 'milk', 'foam'] },
  { key: 'mocha', minLevel: 2, steps: ['choc', 'espresso', 'milk'] },
  { key: 'caramelLatte', minLevel: 2, steps: ['caramel', 'espresso', 'milk'] },
  { key: 'icedLatte', minLevel: 2, steps: ['ice', 'espresso', 'coldMilk'] },
  { key: 'flatWhite', minLevel: 3, steps: ['espresso', 'espresso', 'milk'] },
  { key: 'icedAmericano', minLevel: 3, steps: ['ice', 'espresso', 'water'] },
  { key: 'caramelMacchiato', minLevel: 4, steps: ['caramel', 'milk', 'espresso', 'foam'] },
];

export const recipeByKey = (key) => RECIPES.find((r) => r.key === key) || null;

export const SIZE_KEYS = ['S', 'M', 'L'];

export const LEVELS = [
  { level: 1, orders: 5, patienceMs: 30000, showRecipe: true, sizes: false },
  { level: 2, orders: 6, patienceMs: 25000, showRecipe: true, sizes: false },
  { level: 3, orders: 7, patienceMs: 22000, showRecipe: false, sizes: true },
  { level: 4, orders: 8, patienceMs: 18000, showRecipe: false, sizes: true },
];
export const MAX_LEVEL = LEVELS.length;
export const levelInfo = (level) => LEVELS.find((l) => l.level === level) || LEVELS[0];

export const CASHIER_LEVELS = [
  { level: 1, orders: 4, patienceMs: 60000, items: [3, 4], produce: false, priceStep: 100, bag: false, cashRatio: 0.5, discounts: 0, declines: 0 },
  { level: 2, orders: 5, patienceMs: 60000, items: [4, 5], produce: true, priceStep: 50, bag: false, cashRatio: 0.6, discounts: 0.5, declines: 0 },
  { level: 3, orders: 5, patienceMs: 55000, items: [4, 6], produce: true, priceStep: 25, bag: true, cashRatio: 0.6, discounts: 0.6, declines: 0.35 },
  { level: 4, orders: 6, patienceMs: 50000, items: [5, 7], produce: true, priceStep: 25, bag: true, cashRatio: 0.6, discounts: 0.7, declines: 0.35 },
];

export const SHELF_LEVELS = [
  { level: 1, orders: 3, patienceMs: 50000, slots: 4, need: [1, 1], extras: 0, shortage: false, expired: 1, nearExpiry: false, memorize: false, question: false },
  { level: 2, orders: 3, patienceMs: 65000, slots: 6, need: [1, 2], extras: 1, shortage: false, expired: 2, nearExpiry: true, memorize: false, question: false },
  { level: 3, orders: 4, patienceMs: 75000, slots: 6, need: [1, 3], extras: 1, shortage: true, expired: 2, nearExpiry: true, memorize: true, question: true },
  { level: 4, orders: 4, patienceMs: 85000, slots: 8, need: [2, 3], extras: 2, shortage: true, expired: 3, nearExpiry: true, memorize: true, question: true },
];

const LEVEL_TABLES = { barista: LEVELS, cashier: CASHIER_LEVELS, shelf: SHELF_LEVELS };
export const roleLevels = (role) => LEVEL_TABLES[role] || LEVELS;
export const roleLevelInfo = (role, level) => {
  const table = roleLevels(role);
  return table.find((l) => l.level === level) || table[0];
};

export const menuForLevel = (level) => RECIPES.filter((r) => r.minLevel <= level);

const ROLE_VENUES = { barista: 'demoCafe', cashier: 'demoMarket', shelf: 'demoMarket' };
export const roleVenue = (role) => ROLE_VENUES[role] || 'demoCafe';

const CUSTOMER_NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak', 'Selin', 'Emre', 'Deniz', 'Ece', 'Murat', 'Derya', 'Kerem', 'İrem', 'Okan', 'Seda'];

export const createRng = (seed) => {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickFrom = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

export const buildOrders = (level, seed) => {
  const info = levelInfo(level);
  const rng = createRng(seed);
  const menu = menuForLevel(info.level);
  const fresh = menu.filter((r) => r.minLevel === info.level);
  const orders = [];
  let prev = null;
  for (let i = 0; i < info.orders; i += 1) {
    let recipe = i === 1 && fresh.length ? pickFrom(rng, fresh) : pickFrom(rng, menu);
    if (prev && recipe.key === prev && menu.length > 1) {
      recipe = menu[(menu.indexOf(recipe) + 1) % menu.length];
    }
    prev = recipe.key;
    orders.push({
      id: `o${i + 1}`,
      recipeKey: recipe.key,
      size: info.sizes ? pickFrom(rng, SIZE_KEYS) : null,
      customer: pickFrom(rng, CUSTOMER_NAMES),
    });
  }
  return orders;
};

export const createShift = (level = 1, seed = Date.now()) => {
  const info = levelInfo(level);
  return {
    role: 'barista',
    level: info.level,
    orders: buildOrders(info.level, seed),
    index: 0,
    cup: { size: null, items: [] },
    patienceMs: info.patienceMs,
    remainingMs: info.patienceMs,
    elapsedMs: 0,
    taskStartMs: 0,
    score: 0,
    served: 0,
    wrong: 0,
    missed: 0,
    discards: 0,
    peeks: 0,
    peekedCurrent: false,
    ...TRACKING_FIELDS(),
    finished: false,
    lastEvent: null,
  };
};

export const currentOrder = (state) => (state && !state.finished ? state.orders[state.index] || null : null);

export const TRACKING_FIELDS = () => ({ taskErrors: 0, taskVoids: 0, moods: [], mistakes: {}, stats: {} });

export const noteMistake = (state, reason) => ({
  ...state,
  taskErrors: (state.taskErrors || 0) + 1,
  mistakes: { ...(state.mistakes || {}), [reason]: ((state.mistakes || {})[reason] || 0) + 1 },
});

export const bumpStat = (state, key, n = 1) => ({
  ...state,
  stats: { ...(state.stats || {}), [key]: ((state.stats || {})[key] || 0) + n },
});

export const customerSatisfaction = (state) => {
  const waited = state.patienceMs > 0 ? 1 - state.remainingMs / state.patienceMs : 1;
  const v = 100 - Math.round(40 * Math.max(0, Math.min(1, waited))) - 15 * (state.taskErrors || 0) - 5 * (state.taskVoids || 0);
  return Math.max(0, Math.min(100, v));
};

export const averageSatisfaction = (moods) =>
  (Array.isArray(moods) && moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : null);

export const nextTask = (state, event) => {
  const moods = state.role === 'shelf' || !Array.isArray(state.moods)
    ? state.moods
    : [...state.moods, event && event.type === 'correct' ? customerSatisfaction(state) : 0];
  state = { ...state, moods, taskErrors: 0, taskVoids: 0 };
  const index = state.index + 1;
  const finished = index >= state.orders.length;
  const reset = state.blankWork
    ? { work: JSON.parse(JSON.stringify(state.blankWork)) }
    : { cup: { size: null, items: [] }, peekedCurrent: false };
  return {
    ...state,
    ...reset,
    index,
    remainingMs: finished ? 0 : state.patienceMs,
    taskStartMs: state.elapsedMs,
    finished,
    lastEvent: event,
  };
};
const nextCustomer = nextTask;

export const chooseCup = (state, size) => {
  if (!state || state.finished || !SIZE_KEYS.includes(size)) return state;
  if (!levelInfo(state.level).sizes) return state;
  if (state.cup.items.length > 0) return { ...state, lastEvent: { type: 'cupLocked' } };
  return { ...state, cup: { ...state.cup, size }, lastEvent: null };
};

export const addIngredient = (state, key) => {
  if (!state || state.finished || !INGREDIENT_KEYS.includes(key)) return state;
  if (levelInfo(state.level).sizes && !state.cup.size) return { ...state, lastEvent: { type: 'needCup' } };
  if (state.cup.items.length >= MAX_CUP_ITEMS) return { ...state, lastEvent: { type: 'cupFull' } };
  return { ...state, cup: { ...state.cup, items: [...state.cup.items, key] }, lastEvent: null };
};

export const discardCup = (state) => {
  if (!state || state.finished) return state;
  if (state.cup.items.length === 0 && !state.cup.size) return state;
  return {
    ...state,
    cup: { size: null, items: [] },
    taskVoids: (state.taskVoids || 0) + 1,
    discards: state.discards + 1,
    score: Math.max(0, state.score - POINTS.discard),
    lastEvent: { type: 'discard' },
  };
};

export const peekRecipe = (state) => {
  if (!state || state.finished || state.peekedCurrent) return state;
  if (levelInfo(state.level).showRecipe) return state;
  return {
    ...state,
    peekedCurrent: true,
    peeks: state.peeks + 1,
    score: Math.max(0, state.score - POINTS.peek),
    lastEvent: { type: 'peek' },
  };
};

export const checkCup = (order, cup) => {
  const recipe = recipeByKey(order && order.recipeKey);
  if (!recipe) return { ok: false, reason: 'unknown' };
  if (order.size && cup.size !== order.size) return { ok: false, reason: 'size' };
  const items = cup.items || [];
  if (items.length === 0) return { ok: false, reason: 'empty' };
  const sameSet = [...items].sort().join('|') === [...recipe.steps].sort().join('|');
  if (!sameSet) return { ok: false, reason: 'ingredients' };
  if (items.join('|') !== recipe.steps.join('|')) return { ok: false, reason: 'order' };
  return { ok: true, reason: null };
};

export const serve = (state) => {
  const order = currentOrder(state);
  if (!order) return state;
  if (state.cup.items.length === 0) return { ...state, lastEvent: { type: 'empty' } };
  const result = checkCup(order, state.cup);
  if (!result.ok) {
    return {
      ...noteMistake(state, result.reason),
      cup: { size: null, items: [] },
      wrong: state.wrong + 1,
      score: Math.max(0, state.score - POINTS.wrongServe),
      lastEvent: { type: 'wrong', reason: result.reason, customer: order.customer },
    };
  }
  const speed = Math.max(0, Math.min(1, state.remainingMs / state.patienceMs));
  const gained = POINTS.correct + Math.round(POINTS.speedBonusMax * speed);
  return nextCustomer(
    { ...state, served: state.served + 1, score: state.score + gained },
    { type: 'correct', points: gained, customer: order.customer },
  );
};

export const advance = (state, dtMs) => {
  let st = state;
  let dt = Math.max(0, Math.floor(Number(dtMs) || 0));
  while (st && !st.finished && dt > 0) {
    const step = Math.min(dt, st.remainingMs);
    st = { ...st, remainingMs: st.remainingMs - step, elapsedMs: st.elapsedMs + step };
    if (st.work && st.work.revealMs > 0) {
      st = { ...st, work: { ...st.work, revealMs: Math.max(0, st.work.revealMs - step) } };
    }
    dt -= step;
    if (st.remainingMs <= 0) {
      const order = st.orders[st.index];
      st = nextTask({ ...st, missed: st.missed + 1 }, { type: 'missed', customer: order && order.customer ? order.customer : '' });
    }
  }
  return st;
};

export const maxScoreFor = (level) => levelInfo(level).orders * (POINTS.correct + POINTS.speedBonusMax);

export const starsFor = ({ score, maxScore, missed }) => {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.8 && missed === 0) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio >= 0.4) return 1;
  return 0;
};

export const summarizeShift = (state) => {
  const maxScore = state.maxScore || maxScoreFor(state.level);
  const stars = starsFor({ score: state.score, maxScore, missed: state.missed });
  return {
    role: state.role,
    level: state.level,
    score: state.score,
    maxScore,
    stars,
    passed: stars >= REWARD_MIN_STARS,
    served: state.served,
    missed: state.missed,
    wrong: state.wrong,
    discards: state.discards,
    peeks: state.peeks,
    total: state.orders.length,
    elapsedMs: state.elapsedMs,
    satisfaction: state.role === 'shelf' ? null : averageSatisfaction(state.moods),
    mistakes: { ...(state.mistakes || {}) },
    stats: { ...(state.stats || {}) },
  };
};

export const PROGRESS_ROLES = ['barista', 'cashier', 'shelf'];
export const PROGRESS_VENUES = ['demoCafe', 'demoMarket'];

const emptyRole = () => ({ unlockedLevel: 1, bestStars: {}, shifts: 0, totalScore: 0 });
const emptyVenue = () => ({ rewardProgress: 0, rewardsEarned: 0, countedToday: { date: '', count: 0 } });

export const emptyProgress = () => ({
  version: 2,
  roles: Object.fromEntries(PROGRESS_ROLES.map((r) => [r, emptyRole()])),
  venues: Object.fromEntries(PROGRESS_VENUES.map((v) => [v, emptyVenue()])),
  career: emptyCareer(),
});

const clampInt = (v, min, max, fallback) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const normalizeVenue = (v) => {
  if (!v || typeof v !== 'object') return emptyVenue();
  const counted = v.countedToday && typeof v.countedToday === 'object' ? v.countedToday : {};
  return {
    rewardProgress: clampInt(v.rewardProgress, 0, SHIFTS_FOR_REWARD - 1, 0),
    rewardsEarned: clampInt(v.rewardsEarned, 0, 1e6, 0),
    countedToday: {
      date: typeof counted.date === 'string' ? counted.date.slice(0, 10) : '',
      count: clampInt(counted.count, 0, DAILY_REWARD_SHIFT_CAP, 0),
    },
  };
};

export const normalizeProgress = (raw) => {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object' || !raw.roles || typeof raw.roles !== 'object') return base;
  for (const roleKey of PROGRESS_ROLES) {
    const r = raw.roles[roleKey];
    if (!r || typeof r !== 'object') continue;
    const maxLevel = roleLevels(roleKey).length;
    const bestStars = {};
    if (r.bestStars && typeof r.bestStars === 'object') {
      for (const l of roleLevels(roleKey)) {
        const v = clampInt(r.bestStars[l.level], 0, 3, 0);
        if (v > 0) bestStars[l.level] = v;
      }
    }
    base.roles[roleKey] = {
      unlockedLevel: clampInt(r.unlockedLevel, 1, maxLevel, 1),
      bestStars,
      shifts: clampInt(r.shifts, 0, 1e7, 0),
      totalScore: clampInt(r.totalScore, 0, 1e9, 0),
    };
  }
  const venues = raw.venues && typeof raw.venues === 'object' ? raw.venues : null;
  for (const v of PROGRESS_VENUES) {
    if (venues && venues[v]) base.venues[v] = normalizeVenue(venues[v]);
  }
  base.career = normalizeCareer(raw.career);
  if (!venues && raw.roles.barista && typeof raw.roles.barista === 'object') {
    base.venues.demoCafe = normalizeVenue(raw.roles.barista);
  }
  return base;
};

export const applyShiftResult = (progress, summary, dateISO) => {
  const p = normalizeProgress(progress);
  const roleKey = PROGRESS_ROLES.includes(summary.role) ? summary.role : 'barista';
  const venueKey = roleVenue(roleKey);
  const r = { ...p.roles[roleKey], bestStars: { ...p.roles[roleKey].bestStars } };
  const v = { ...p.venues[venueKey], countedToday: { ...p.venues[venueKey].countedToday } };
  const maxLevel = roleLevels(roleKey).length;
  const level = clampInt(summary.level, 1, maxLevel, 1);
  const out = { levelUnlocked: null, countedForReward: false, rewardEarned: false, dailyCapReached: false, venue: venueKey };

  if (level > r.unlockedLevel) return { progress: p, ...out, ignored: true };

  const scoreCap = clampInt(summary.maxScore, 1, 100000, maxScoreFor(level));
  r.shifts += 1;
  r.totalScore += clampInt(summary.score, 0, scoreCap, 0);
  r.bestStars[level] = Math.max(r.bestStars[level] || 0, clampInt(summary.stars, 0, 3, 0));

  if (summary.stars >= REWARD_MIN_STARS) {
    if (level === r.unlockedLevel && level < maxLevel) {
      r.unlockedLevel = level + 1;
      out.levelUnlocked = level + 1;
    }
    const day = String(dateISO || '').slice(0, 10);
    const counted = v.countedToday.date === day ? v.countedToday.count : 0;
    if (counted < DAILY_REWARD_SHIFT_CAP) {
      v.countedToday = { date: day, count: counted + 1 };
      out.countedForReward = true;
      const next = v.rewardProgress + 1;
      if (next >= SHIFTS_FOR_REWARD) {
        v.rewardProgress = 0;
        v.rewardsEarned += 1;
        out.rewardEarned = true;
      } else {
        v.rewardProgress = next;
      }
    } else {
      v.countedToday = { date: day, count: counted };
      out.dailyCapReached = true;
    }
  }

  const withRoles = { ...p, roles: { ...p.roles, [roleKey]: r }, venues: { ...p.venues, [venueKey]: v } };
  const day = String(dateISO || '').slice(0, 10);
  const career = applyCareer(p.career, { ...summary, role: roleKey, level }, day, withRoles);

  return {
    progress: { ...withRoles, career: career.career },
    ...out,
    career: career.result,
    ignored: false,
  };
};
