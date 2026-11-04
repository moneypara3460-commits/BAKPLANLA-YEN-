/*
  BAKPLANLA — İŞ BAŞI / ORTAK KARİYER SİSTEMİ (sunucu kopyası; uygulamadaki isbasiCareer.js ile aynı mantık)
*/

const clampInt = (v, min, max, fallback = min) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

export const GRADES = ['S', 'A', 'B', 'C', 'D'];
export const GRADE_XP = { S: 40, A: 25, B: 10, C: 5, D: 0 };

export const evaluateShift = (summary) => {
  const max = summary.maxScore || 1;
  const ratio = Math.max(0, Math.min(1, summary.score / max));
  const attempts = summary.served + summary.wrong + summary.missed;
  const accuracy = attempts ? Math.round((100 * summary.served) / attempts) : 0;
  const avgTaskSec = summary.served ? Math.round(summary.elapsedMs / summary.served / 100) / 10 : null;
  let grade = 'D';
  if (ratio >= 0.9 && summary.wrong === 0 && summary.missed === 0) grade = 'S';
  else if (ratio >= 0.8) grade = 'A';
  else if (ratio >= 0.65) grade = 'B';
  else if (ratio >= 0.45) grade = 'C';
  const sat = typeof summary.satisfaction === 'number' ? summary.satisfaction : null;
  if (sat !== null && sat < 60 && (grade === 'S' || grade === 'A')) grade = 'B';

  const ranked = Object.entries(summary.mistakes || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  let tips = ranked.slice(0, 2).map(([k]) => k);
  if (summary.missed > 0) tips = ['slow', ...tips].slice(0, 2);
  if (tips.length === 0) tips = [grade === 'S' ? 'great' : 'faster'];
  return { grade, ratio: Math.round(ratio * 100), accuracy, avgTaskSec, satisfaction: sat, tips };
};

export const xpForShift = (summary, evaluation) =>
  Math.round(Math.max(0, summary.score) / 10) + clampInt(summary.stars, 0, 3) * 15 + (GRADE_XP[evaluation.grade] || 0);

export const xpForLevel = (n) => 50 * n * (n - 1);
export const MAX_PLAYER_LEVEL = 30;

export const PLAYER_TITLES = [
  { from: 1, tr: 'Çaylak', en: 'Rookie', de: 'Neuling' },
  { from: 3, tr: 'Stajyer', en: 'Intern', de: 'Praktikant' },
  { from: 5, tr: 'Takım Arkadaşı', en: 'Team Member', de: 'Teammitglied' },
  { from: 8, tr: 'Deneyimli', en: 'Experienced', de: 'Erfahren' },
  { from: 12, tr: 'Usta', en: 'Pro', de: 'Profi' },
  { from: 16, tr: 'Uzman', en: 'Expert', de: 'Experte' },
  { from: 20, tr: 'Efsane', en: 'Legend', de: 'Legende' },
];

export const playerLevel = (xp) => {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < MAX_PLAYER_LEVEL && x >= xpForLevel(level + 1)) level += 1;
  const base = xpForLevel(level);
  const next = level < MAX_PLAYER_LEVEL ? xpForLevel(level + 1) : null;
  const title = [...PLAYER_TITLES].reverse().find((t) => level >= t.from) || PLAYER_TITLES[0];
  return { level, title, xp: x, into: x - base, span: next ? next - base : 0, next };
};

export const ACHIEVEMENTS = [
  { id: 'first_shift', xp: 20, test: (c) => c.totals.shifts >= 1 },
  { id: 'all_roles', xp: 50, test: (c) => c.roles.length >= 3 },
  { id: 'three_star', xp: 25, test: (c) => c.totals.threeStars >= 1 },
  { id: 'three_star_10', xp: 75, test: (c) => c.totals.threeStars >= 10 },
  { id: 'flawless', xp: 40, test: (c) => c.totals.flawless >= 1 },
  { id: 'cash_master', xp: 50, test: (c) => c.totals.changeCorrect >= 25 },
  { id: 'discount_hunter', xp: 40, test: (c) => c.totals.discountsApplied >= 10 },
  { id: 'friendly_till', xp: 40, test: (c, s) => s.role === 'cashier' && typeof s.satisfaction === 'number' && s.satisfaction >= 90 && s.served === s.total },
  { id: 'expiry_detective', xp: 50, test: (c) => c.totals.expiredRemoved >= 30 },
  { id: 'stock_keeper', xp: 40, test: (c) => c.totals.shortageReports >= 5 },
  { id: 'coffee_master', xp: 50, test: (c) => c.totals.drinks >= 50 },
  { id: 'hundred_customers', xp: 60, test: (c) => c.totals.customers >= 100 },
  { id: 'top_level', xp: 75, test: (c, s, p) => !!p && Object.values(p.roles || {}).some((r) => r.unlockedLevel >= 4) },
  { id: 'steady', xp: 40, test: (c) => c.days >= 3 },
  { id: 'xp_1000', xp: 0, test: (c) => c.xp >= 1000 },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

export const MISSION_XP = 40;
export const DAILY_MISSION_COUNT = 3;

export const MISSIONS = [
  { id: 'shifts2', target: 2, inc: () => 1 },
  { id: 'stars3', target: 1, inc: (s) => (s.stars === 3 ? 1 : 0) },
  { id: 'cashierPass', target: 1, inc: (s) => (s.role === 'cashier' && s.stars >= 2 ? 1 : 0) },
  { id: 'shelfPass', target: 1, inc: (s) => (s.role === 'shelf' && s.stars >= 2 ? 1 : 0) },
  { id: 'baristaPass', target: 1, inc: (s) => (s.role === 'barista' && s.stars >= 2 ? 1 : 0) },
  { id: 'flawless', target: 1, inc: (s) => (s.wrong === 0 && s.missed === 0 && s.served === s.total ? 1 : 0) },
  { id: 'expired5', target: 5, inc: (s) => (s.stats && s.stats.expiredRemoved) || 0 },
  { id: 'change5', target: 5, inc: (s) => (s.stats && s.stats.changeCorrect) || 0 },
  { id: 'customers10', target: 10, inc: (s) => (s.role !== 'shelf' ? s.served : 0) },
  { id: 'happy', target: 1, inc: (s) => (typeof s.satisfaction === 'number' && s.satisfaction >= 85 ? 1 : 0) },
];
export const MISSION_IDS = MISSIONS.map((m) => m.id);
export const missionById = (id) => MISSIONS.find((m) => m.id === id) || null;

export const dailyMissionIds = (dateISO) => {
  let h = 2166136261;
  for (const ch of String(dateISO || '').slice(0, 10)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = [...MISSION_IDS];
  const out = [];
  while (out.length < DAILY_MISSION_COUNT && pool.length) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
};

export const HISTORY_MAX = 30;
const TOTAL_KEYS = ['shifts', 'threeStars', 'flawless', 'customers', 'drinks', 'changeCorrect', 'discountsApplied', 'cardDeclines',
  'expiredRemoved', 'storageReturns', 'shortageReports', 'unitsPlaced', 'questionsRight'];
const ROLE_KEYS = ['barista', 'cashier', 'shelf'];

export const emptyCareer = () => ({
  xp: 0,
  totals: Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0])),
  roles: [],
  days: 0,
  lastDay: '',
  achievements: {},
  daily: { date: '', progress: {}, done: [] },
  history: [],
});

const isoDay = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) ? v.slice(0, 10) : '');

export const normalizeCareer = (raw) => {
  const base = emptyCareer();
  if (!raw || typeof raw !== 'object') return base;
  base.xp = clampInt(raw.xp, 0, 1e9, 0);
  if (raw.totals && typeof raw.totals === 'object') for (const k of TOTAL_KEYS) base.totals[k] = clampInt(raw.totals[k], 0, 1e9, 0);
  base.roles = Array.isArray(raw.roles) ? [...new Set(raw.roles.filter((r) => ROLE_KEYS.includes(r)))] : [];
  base.days = clampInt(raw.days, 0, 1e6, 0);
  base.lastDay = isoDay(raw.lastDay);
  if (raw.achievements && typeof raw.achievements === 'object') {
    for (const id of ACHIEVEMENT_IDS) if (raw.achievements[id]) base.achievements[id] = isoDay(raw.achievements[id]) || base.lastDay || '';
  }
  if (raw.daily && typeof raw.daily === 'object' && isoDay(raw.daily.date)) {
    const ids = dailyMissionIds(raw.daily.date);
    const progress = {};
    for (const id of ids) progress[id] = clampInt(raw.daily.progress && raw.daily.progress[id], 0, missionById(id).target, 0);
    base.daily = { date: isoDay(raw.daily.date), progress, done: (Array.isArray(raw.daily.done) ? raw.daily.done : []).filter((id) => ids.includes(id)) };
  }
  if (Array.isArray(raw.history)) {
    base.history = raw.history.slice(-HISTORY_MAX).filter((h) => h && ROLE_KEYS.includes(h.r)).map((h) => ({
      d: isoDay(h.d),
      r: h.r,
      l: clampInt(h.l, 1, 4, 1),
      s: clampInt(h.s, 0, 1e5, 0),
      m: clampInt(h.m, 1, 1e5, 1),
      st: clampInt(h.st, 0, 3, 0),
      g: GRADES.includes(h.g) ? h.g : 'D',
      xp: clampInt(h.xp, 0, 1e5, 0),
      sat: h.sat === null || h.sat === undefined ? null : clampInt(h.sat, 0, 100, 0),
    }));
  }
  return base;
};

export const applyCareer = (careerRaw, summary, dateISO, progressAfter = null) => {
  const c = normalizeCareer(careerRaw);
  const day = isoDay(dateISO);
  const evaluation = evaluateShift(summary);
  const levelBefore = playerLevel(c.xp).level;
  const stats = summary.stats || {};

  c.totals.shifts += 1;
  if (summary.stars === 3) c.totals.threeStars += 1;
  if (summary.wrong === 0 && summary.missed === 0 && summary.served === summary.total) c.totals.flawless += 1;
  if (summary.role !== 'shelf') c.totals.customers += summary.served;
  if (summary.role === 'barista') c.totals.drinks += summary.served;
  for (const k of ['changeCorrect', 'discountsApplied', 'cardDeclines', 'expiredRemoved', 'storageReturns', 'shortageReports', 'unitsPlaced', 'questionsRight']) {
    c.totals[k] += clampInt(stats[k], 0, 1000, 0);
  }
  if (ROLE_KEYS.includes(summary.role) && !c.roles.includes(summary.role)) c.roles.push(summary.role);
  if (day && day !== c.lastDay) { c.days += 1; c.lastDay = day; }

  const baseXp = xpForShift(summary, evaluation);
  c.xp += baseXp;

  let missionXp = 0;
  const missionsCompleted = [];
  if (day) {
    if (c.daily.date !== day) c.daily = { date: day, progress: {}, done: [] };
    for (const id of dailyMissionIds(day)) {
      if (c.daily.done.includes(id)) continue;
      const m = missionById(id);
      const next = Math.min(m.target, (c.daily.progress[id] || 0) + clampInt(m.inc(summary), 0, 1000, 0));
      c.daily.progress[id] = next;
      if (next >= m.target) {
        c.daily.done.push(id);
        missionsCompleted.push(id);
        missionXp += MISSION_XP;
      }
    }
  }
  c.xp += missionXp;

  let achievementXp = 0;
  const newAchievements = [];
  for (let round = 0; round < 3; round += 1) {
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (c.achievements[a.id]) continue;
      if (a.test(c, summary, progressAfter)) {
        c.achievements[a.id] = day || '1970-01-01';
        newAchievements.push(a.id);
        achievementXp += a.xp;
        c.xp += a.xp;
        any = true;
      }
    }
    if (!any) break;
  }

  const xpGained = baseXp + missionXp + achievementXp;
  c.history = [...c.history, {
    d: day, r: summary.role, l: summary.level, s: summary.score, m: summary.maxScore || 1,
    st: summary.stars, g: evaluation.grade, xp: xpGained, sat: evaluation.satisfaction,
  }].slice(-HISTORY_MAX);

  const levelAfter = playerLevel(c.xp).level;
  return {
    career: c,
    result: {
      evaluation,
      xpGained,
      xpBreakdown: { shift: baseXp, missions: missionXp, achievements: achievementXp },
      newAchievements,
      missionsCompleted,
      levelBefore,
      levelAfter,
    },
  };
};
