/*
===========================================================
  BAKPLANLA — İŞ BAŞI / SUNUCU MANTIĞI (Aşama 3)
  Saf JavaScript. Supabase Edge Function (supabase/functions/isbasi/index.ts) bu dosyayı
  kullanır; veritabanı erişimi dışarıdan "db" nesnesiyle verilir. Böylece aynı mantık Node'da
  sahte (bellek içi) veritabanıyla test edilir.

  Uç noktalar (mode):
   - state  : ilerleme + kuponlar
   - start  : yeni vardiya (sunucu tohumu üretir, seviye kilidini ve hız sınırını kontrol eder)
   - finish : hamle kaydını yeniden oynatır, puanı hesaplar, ilerlemeyi ve kuponu tek işlemde yazar

  Kullanıcı kimliği her zaman JWT'den gelir (index.ts); istek gövdesindeki hiçbir kimliğe güvenilmez.
===========================================================
*/

import { normalizeProgress, applyShiftResult, roleLevels, roleVenue } from './isbasi.js';
import { replayShift, ROLE_KEYS, SHIFT_TTL_MS } from './isbasiReplay.js';

export const STARTS_PER_HOUR = 40;
export const COUPON_VALID_DAYS_DEFAULT = 30;
export const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışan 0/O, 1/I yok

// İstanbul saatine göre bugünün tarihi (günlük ödül sınırı ve SKT için).
export const istanbulDate = (nowMs) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(nowMs));

export const makeCouponCode = (randomBytes) => {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i += 1) out += COUPON_ALPHABET[bytes[i] % COUPON_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
};

export const normalizeCouponCode = (raw) => {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 10 || [...s].some((ch) => !COUPON_ALPHABET.includes(ch))) return null;
  return `${s.slice(0, 5)}-${s.slice(5)}`;
};

export const COUPON_QR_PREFIX = 'BAKPLANLA:CPN:';
export const couponQrPayload = (code) => `${COUPON_QR_PREFIX}${code}`;

// Hiçbir teklif tanımlanmamışsa kullanılacak deneme teklifi (gerçek mağazada geçmez).
export const DEMO_OFFERS = {
  demoCafe: {
    id: null, partner_name: 'Örnek Kafe (deneme)', is_demo: true, valid_days: COUPON_VALID_DAYS_DEFAULT,
    title_tr: 'Kahvede %10 indirim', title_en: '10% off coffee', title_de: '10 % auf Kaffee',
  },
  demoMarket: {
    id: null, partner_name: 'Örnek Market (deneme)', is_demo: true, valid_days: COUPON_VALID_DAYS_DEFAULT,
    title_tr: 'Alışverişte 25 ₺ indirim', title_en: '25 ₺ off your shopping', title_de: '25 ₺ Rabatt auf den Einkauf',
  },
};

const ok = (data) => ({ status: 200, body: { ok: true, ...data } });
const err = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra } });

export const publicCoupon = (c) => ({
  id: c.id,
  code: c.code,
  venue: c.venue,
  partnerName: c.partner_name,
  title: { tr: c.title_tr, en: c.title_en, de: c.title_de },
  isDemo: !!c.is_demo,
  issuedAt: c.issued_at,
  expiresAt: c.expires_at,
  redeemedAt: c.redeemed_at || null,
});

export const handleState = async ({ db, userId }) => {
  const row = await db.getProgress(userId);
  const coupons = await db.listCoupons(userId);
  return ok({ progress: normalizeProgress(row ? row.data : null), coupons: coupons.map(publicCoupon) });
};

export const handleStart = async ({ db, userId, body, now, randomInt }) => {
  const role = body && body.role;
  const level = Math.floor(Number(body && body.level));
  if (!ROLE_KEYS.includes(role) || !roleLevels(role).some((l) => l.level === level)) return err(400, 'bad_request');

  const row = await db.getProgress(userId);
  const progress = normalizeProgress(row ? row.data : null);
  if (level > progress.roles[role].unlockedLevel) return err(403, 'level_locked');

  const recent = await db.countShiftsSince(userId, new Date(now - 3600 * 1000).toISOString());
  if (recent >= STARTS_PER_HOUR) return err(429, 'rate_limited');

  // Aynı anda tek açık vardiya: yenisi başlarken eskiler terk edilmiş sayılır.
  await db.abandonOpenShifts(userId);
  const shift = await db.insertShift({
    user_id: userId,
    role,
    level,
    seed: randomInt(1, 2147483646),
    game_date: istanbulDate(now),
    started_at: new Date(now).toISOString(),
    status: 'started',
  });
  return ok({ shift: { id: shift.id, role, level, seed: shift.seed, gameDate: shift.game_date } });
};

export const handleFinish = async ({ db, userId, body, now, randomBytes }) => {
  const shiftId = body && typeof body.shiftId === 'string' ? body.shiftId : null;
  if (!shiftId || shiftId.length > 64) return err(400, 'bad_request');

  // Vardiyayı yalnızca bir kez "sahiplen": aynı sonuç iki kez gönderilirse ikincisi reddedilir.
  const shift = await db.claimShift(shiftId, userId);
  if (!shift) return err(404, 'shift_not_found');

  const startedMs = Date.parse(shift.started_at);
  const wallMs = now - startedMs;
  if (!Number.isFinite(startedMs) || wallMs > SHIFT_TTL_MS) {
    await db.rejectShift(shiftId, 'expired');
    return err(410, 'shift_expired');
  }

  const replay = replayShift({
    role: shift.role, level: shift.level, seed: Number(shift.seed), gameDate: shift.game_date,
    log: body.log, endT: body.endT, wallMs,
  });
  if (!replay.ok) {
    await db.rejectShift(shiftId, replay.reason);
    return err(422, 'rejected', { reason: replay.reason });
  }
  const { summary } = replay;

  // İlerleme: iyimser eşzamanlılık (version) ile; çakışmada yeniden dene.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await db.getProgress(userId);
    const applied = applyShiftResult(row ? row.data : null, summary, istanbulDate(now));
    if (applied.ignored) {
      await db.rejectShift(shiftId, 'level_locked');
      return err(403, 'level_locked');
    }
    let coupon = null;
    if (applied.rewardEarned) {
      const venue = roleVenue(shift.role);
      const offer = (await db.getActiveOffer(venue)) || DEMO_OFFERS[venue];
      const validDays = Math.max(1, Math.min(365, Number(offer.valid_days) || COUPON_VALID_DAYS_DEFAULT));
      coupon = {
        code: makeCouponCode(randomBytes),
        venue,
        offer_id: offer.id || null,
        is_demo: !!offer.is_demo,
        partner_name: offer.partner_name,
        title_tr: offer.title_tr,
        title_en: offer.title_en,
        title_de: offer.title_de,
        expires_at: new Date(now + validDays * 86400 * 1000).toISOString(),
      };
    }
    const res = await db.commit({
      userId,
      shiftId,
      oldVersion: row ? row.version : null,
      progress: applied.progress,
      score: summary.score,
      maxScore: summary.maxScore,
      stars: summary.stars,
      coupon,
    });
    if (res.ok) {
      return ok({
        verified: true,
        summary,
        progress: applied.progress,
        levelUnlocked: applied.levelUnlocked,
        countedForReward: applied.countedForReward,
        rewardEarned: applied.rewardEarned,
        dailyCapReached: applied.dailyCapReached,
        career: applied.career,
        coupon: res.coupon ? publicCoupon(res.coupon) : null,
      });
    }
    // conflict: 'progress' (başka vardiya aynı anda yazdı) ya da 'code' (kupon kodu çakıştı) → tekrar dene
  }
  await db.rejectShift(shiftId, 'busy');
  return err(503, 'busy');
};

export const handleRequest = async (ctx) => {
  const mode = ctx.body && ctx.body.mode;
  if (mode === 'state') return handleState(ctx);
  if (mode === 'start') return handleStart(ctx);
  if (mode === 'finish') return handleFinish(ctx);
  return err(400, 'bad_request');
};
