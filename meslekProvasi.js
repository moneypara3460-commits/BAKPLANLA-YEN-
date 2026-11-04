/*
===========================================================
  BAKPLANLA — MESLEK PROVASI (saf JavaScript, React Native bağımlılığı yok → Node ile test edilir)

  - PUSULA sonucundan "sana en yakın meslek" eşleşmesi
  - Ortak sahne oyunu: her vardiya = mesleğin 5 gerçek iş durumu, her biri süreli, 3 seçenek
  - İlerleme CİHAZDA tutulur (sunucuya gönderilmez). İş Köprüsü rozeti yalnızca sunucu
    doğrulamalı İş Başı oyunlarından (Barista, Kasiyer, Reyon) kazanılır; bu dosya rozet vermez.
===========================================================
*/
import { PROFESSIONS_RAW } from './meslekIcerik';
import { pickByLang } from './arabic';

export const PROVA_KEY = 'BAKPLANLA_MESLEK_PROVASI';
export const SCENE_SECONDS = 25;
export const POINTS_PER_SCENE = 2;
const AREA_KEYS = ['yapici', 'arastirmaci', 'sanatsal', 'sosyal', 'girisimci', 'duzenli'];

/* ---------------- katalog ---------------- */

const normWeights = (weights) => {
  const out = {};
  let sum = 0;
  for (const k of AREA_KEYS) { const v = Math.max(0, Number(weights && weights[k]) || 0); out[k] = v; sum += v; }
  if (sum <= 0) return out;
  for (const k of AREA_KEYS) out[k] = out[k] / sum;
  return out;
};

export const PROFESSIONS = PROFESSIONS_RAW.map((p) => ({ ...p, weights: normWeights(p.weights), scenes: p.scenes || [] }));
export const PROFESSION_KEYS = PROFESSIONS.map((p) => p.key);
export const professionByKey = (key) => PROFESSIONS.find((p) => p.key === key) || null;
export const professionName = (p, lang = 'tr') => (p ? pickByLang(p.name, lang) : '');
export const primaryArea = (p) => AREA_KEYS.reduce((best, k) => (p.weights[k] > p.weights[best] ? k : best), AREA_KEYS[0]);
export const professionsByArea = (area) => PROFESSIONS.filter((p) => primaryArea(p) === area);

/* ---------------- PUSULA eşleşmesi ---------------- */

/*
  scores: compass.js scoreCompass() sonucundaki { alan: 0-100 }.
  Uyum = mesleğin alan ağırlıklarıyla kişinin alan puanlarının ağırlıklı ortalaması (0-100).
  Eşitlikte katalog sırası korunur (her açılışta aynı sonuç).
*/
export const matchProfessions = (scores) => {
  if (!scores) return [];
  return PROFESSIONS
    .map((p, index) => {
      let m = 0;
      for (const k of AREA_KEYS) m += p.weights[k] * (Math.max(0, Math.min(100, Number(scores[k]) || 0)));
      return { key: p.key, match: Math.round(m), index };
    })
    .sort((a, b) => b.match - a.match || a.index - b.index)
    .map(({ key, match }) => ({ key, match }));
};

export const bestProfession = (scores) => {
  const list = matchProfessions(scores);
  return list.length ? list[0] : null;
};

/* PUSULA ekranından Prova ekranına "şu mesleği aç" bilgisini taşır (aynı oturum içinde). */
let pendingKey = null;
export const setPendingProfession = (key) => { pendingKey = professionByKey(key) ? key : null; };
export const takePendingProfession = () => { const k = pendingKey; pendingKey = null; return k; };

/* ---------------- oyun ---------------- */

export const createRng = (seed) => {
  let t = (Number(seed) >>> 0) || 1;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (arr, rnd) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Vardiya: sahneler ve seçenekler karıştırılır (her oyunda farklı sıra).
export const createProva = (key, seed = Date.now()) => {
  const p = professionByKey(key);
  if (!p || p.game !== 'prova' || !p.scenes.length) return null;
  const rnd = createRng(seed);
  const scenes = shuffle(p.scenes, rnd).map((s) => ({ e: s.e, q: s.q, o: shuffle(s.o, rnd) }));
  return { key, scenes, index: 0, answers: [], finished: false };
};

export const currentScene = (state) => (state && !state.finished ? state.scenes[state.index] || null : null);

// optionIndex: seçilen seçenek; null → süre doldu (0 puan).
export const answerScene = (state, optionIndex, msLeft = 0) => {
  if (!state || state.finished || state.answers.length > state.index) return state; // aynı sahne iki kez cevaplanmaz
  const scene = state.scenes[state.index];
  const opt = optionIndex === null || optionIndex === undefined ? null : scene.o[optionIndex] || null;
  const answers = [...state.answers, { pick: opt ? optionIndex : null, points: opt ? opt.p : 0, timeout: !opt, msLeft: Math.max(0, msLeft) }];
  return { ...state, answers };
};

export const nextScene = (state) => {
  if (!state || state.finished) return state;
  const index = state.index + 1;
  return { ...state, index, finished: index >= state.scenes.length };
};

export const isAnswered = (state) => !!state && state.answers.length > state.index;

export const starsFor = (points, max) => {
  if (!max) return 0;
  const r = points / max;
  if (r >= 0.9) return 3;
  if (r >= 0.6) return 2;
  if (r >= 0.3) return 1;
  return 0;
};

export const summarize = (state) => {
  const max = (state ? state.scenes.length : 0) * POINTS_PER_SCENE;
  const points = state ? state.answers.reduce((n, a) => n + a.points, 0) : 0;
  const best = state ? state.answers.filter((a) => a.points === POINTS_PER_SCENE).length : 0;
  const timeouts = state ? state.answers.filter((a) => a.timeout).length : 0;
  return { key: state ? state.key : null, points, max, best, timeouts, total: state ? state.scenes.length : 0, stars: starsFor(points, max) };
};

/* ---------------- ilerleme (cihazda) ---------------- */

export const emptyProvaProgress = () => ({ v: 1, xp: 0, plays: 0, jobs: {} });

const clampInt = (v, min, max, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const isoDay = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

export const normalizeProvaProgress = (raw) => {
  const base = emptyProvaProgress();
  if (!raw || typeof raw !== 'object') return base;
  base.xp = clampInt(raw.xp, 0, 1e9, 0);
  base.plays = clampInt(raw.plays, 0, 1e9, 0);
  if (raw.jobs && typeof raw.jobs === 'object') {
    for (const key of PROFESSION_KEYS) {
      const j = raw.jobs[key];
      if (!j || typeof j !== 'object') continue;
      base.jobs[key] = {
        plays: clampInt(j.plays, 0, 1e6, 0),
        bestStars: clampInt(j.bestStars, 0, 3, 0),
        bestPoints: clampInt(j.bestPoints, 0, 1e4, 0),
        last: isoDay(j.last),
      };
    }
  }
  return base;
};

// XP: her sahne puanı ×5, 3 yıldızda +10. İlk 3 yıldızda ek +15.
export const xpForProva = (summary, firstThreeStars = false) =>
  summary.points * 5 + (summary.stars === 3 ? 10 : 0) + (firstThreeStars ? 15 : 0);

export const applyProvaResult = (progressRaw, summary, dateISO) => {
  const pr = normalizeProvaProgress(progressRaw);
  if (!summary || !professionByKey(summary.key)) return { progress: pr, xp: 0, newBest: false };
  const prev = pr.jobs[summary.key] || { plays: 0, bestStars: 0, bestPoints: 0, last: '' };
  const firstThree = summary.stars === 3 && prev.bestStars < 3;
  const xp = xpForProva(summary, firstThree);
  const newBest = summary.points > prev.bestPoints;
  pr.jobs[summary.key] = {
    plays: prev.plays + 1,
    bestStars: Math.max(prev.bestStars, summary.stars),
    bestPoints: Math.max(prev.bestPoints, summary.points),
    last: isoDay(dateISO) || prev.last,
  };
  pr.plays += 1;
  pr.xp += xp;
  return { progress: pr, xp, newBest };
};

export const triedCount = (progressRaw) => Object.values(normalizeProvaProgress(progressRaw).jobs).filter((j) => j.plays > 0).length;
