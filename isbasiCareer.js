/*
===========================================================
  BAKPLANLA — İŞ BAŞI / ORTAK KARİYER SİSTEMİ
  Saf JavaScript → uygulamada ve sunucuda (Edge Function) aynı kod çalışır.

  - Performans değerlendirmesi (not: S/A/B/C/D, doğruluk, hız, memnuniyet, ipuçları)
  - Deneyim puanı (XP) ve oyuncu seviyesi / unvan
  - Başarımlar (kalıcı, bir kez açılır, XP ödülü verir)
  - Günlük görevler (her gün tarihe göre aynı 3 görev; tamamlanınca XP)
  - Performans geçmişi (son 30 vardiya)

  Sunucu modunda bunların hepsi SUNUCUDA, doğrulanmış vardiya özetinden hesaplanır;
  uygulama kendine XP ya da başarım yazamaz.
===========================================================
*/

const clampInt = (v, min, max, fallback = min) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

/* ---------------- Performans değerlendirmesi ---------------- */

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
  // Müşteri memnuniyeti düşükse not B'yi geçemez.
  const sat = typeof summary.satisfaction === 'number' ? summary.satisfaction : null;
  if (sat !== null && sat < 60 && (grade === 'S' || grade === 'A')) grade = 'B';

  const ranked = Object.entries(summary.mistakes || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  let tips = ranked.slice(0, 2).map(([k]) => k);
  if (summary.missed > 0) tips = ['slow', ...tips].slice(0, 2);
  if (tips.length === 0) tips = [grade === 'S' ? 'great' : 'faster'];
  return { grade, ratio: Math.round(ratio * 100), accuracy, avgTaskSec, satisfaction: sat, tips };
};

// İpuçları: en sık yapılan hataya göre gerçek iş hayatından kısa öneri.
export const TIPS = {
  size: { tr: 'Bardak boyunu siparişte duyduğun anda seç; kasada boy en sık karışan detaydır.', en: 'Pick the cup size as soon as you hear the order; size is the most common mix-up.', de: 'Wähle die Bechergröße sofort beim Bestellen.' },
  order: { tr: 'Tarif sırası önemli: önce şurup/sos, sonra espresso, en son süt ve köpük.', en: 'Order matters: syrup/sauce first, then espresso, then milk and foam.', de: 'Reihenfolge zählt: erst Sirup/Sauce, dann Espresso, dann Milch und Schaum.' },
  ingredients: { tr: 'Servis etmeden önce bardaktaki malzemeleri tarifle karşılaştır.', en: 'Compare the cup with the recipe before serving.', de: 'Vergleiche den Becher vor dem Servieren mit dem Rezept.' },
  missing: { tr: 'Ödeme almadan önce banttaki her ürünün ✓ aldığından emin ol.', en: 'Before taking payment, make sure every item on the belt has a ✓.', de: 'Vor dem Bezahlen: Hat jede Ware ein ✓?' },
  double: { tr: 'Aynı ürünü iki kez okuttuysan "İptal" ile son okutmayı geri al.', en: 'If you scanned an item twice, use "Void" to undo the last scan.', de: 'Doppelt gescannt? Mit "Storno" die letzte Buchung entfernen.' },
  discountMissing: { tr: 'Sarı İNDİRİM etiketli ürünlerde okuttuktan sonra "%" ile indirimi uygula.', en: 'For items with a yellow DISCOUNT sticker, tap "%" after scanning.', de: 'Bei gelben RABATT-Etiketten nach dem Scannen "%" tippen.' },
  noDiscount: { tr: 'İndirim yalnızca etiketi olan ürüne uygulanır; etiket yoksa tam fiyat.', en: 'Only items with a sticker get a discount; no sticker, full price.', de: 'Rabatt nur bei Etikett, sonst voller Preis.' },
  bagMissing: { tr: 'Müşterinin söylediğini dinle: poşet istediyse kasaya eklemeyi unutma.', en: 'Listen to the customer: if they asked for a bag, add it.', de: 'Hör zu: Wollte der Kunde eine Tüte, buche sie.' },
  bagExtra: { tr: 'Poşet istemeyen müşteriden poşet ücreti alınmaz.', en: 'Do not charge a bag to a customer who did not ask for one.', de: 'Keine Tüte berechnen, wenn keine gewünscht.' },
  change: { tr: 'Para üstünü hesapla (verilen − tutar), sonra en büyük banknottan başlayarak say.', en: 'Work out the change (paid − total), then count from the largest note down.', de: 'Wechselgeld berechnen (gegeben − Betrag), dann vom größten Schein abwärts zählen.' },
  wrongSlot: { tr: 'Raf etiketindeki ürün adıyla elindeki ürünü karşılaştır.', en: 'Match the item in your hand to the name on the shelf label.', de: 'Vergleiche die Ware mit dem Regaletikett.' },
  expiredOnShelf: { tr: 'Rafa koymadan önce SKT\'ye bak: bugünden önceki tarih satılmaz.', en: 'Check the expiry date first: anything before today cannot be sold.', de: 'Erst das MHD prüfen: alles vor heute ist nicht verkäuflich.' },
  freshDiscarded: { tr: 'Tarihi geçmemiş ürünü atmak israftır; SKT bugün ya da sonrasıysa rafa koy.', en: 'Throwing away good stock is waste; if the date is today or later, shelve it.', de: 'Gute Ware wegwerfen ist Verschwendung.' },
  expiredToStorage: { tr: 'SKT\'si geçmiş ürün depoya değil, imha kutusuna gider.', en: 'Expired items go to the disposal box, not back to storage.', de: 'Abgelaufenes gehört in die Entsorgung, nicht ins Lager.' },
  neededOnShelf: { tr: 'Önce rafı etiketteki adede kadar doldur; yalnızca fazlası depoya döner.', en: 'Fill the shelf to the labelled quantity first; only the surplus goes back.', de: 'Erst das Regal auffüllen, nur der Überschuss geht zurück.' },
  falseShortage: { tr: 'Eksik stok bildirmeden önce arabada o üründen kalıp kalmadığına bak.', en: 'Before reporting a shortage, check the trolley for that item.', de: 'Vor der Fehlmeldung den Wagen prüfen.' },
  wrongAisle: { tr: 'Reyonları öğren: süt-ayran İçecek, makarna-bakliyat Kuru Gıda, deterjan Temizlik.', en: 'Learn the aisles: drinks, dry food, cleaning, breakfast.', de: 'Lerne die Gänge: Getränke, Trockenwaren, Reinigung, Frühstück.' },
  slow: { tr: 'Müşteri beklerken önce en hızlı işleri bitir; sırada kimseyi unutma.', en: 'Do the quick tasks first so nobody waits too long.', de: 'Schnelle Aufgaben zuerst, damit niemand zu lange wartet.' },
  faster: { tr: 'Hatasızsın; şimdi hızlanma zamanı. Hız bonusu puanı ciddi artırır.', en: 'No mistakes — now speed up. The speed bonus adds a lot.', de: 'Fehlerfrei — jetzt schneller werden.' },
  great: { tr: 'Kusursuz vardiya! Bir üst seviyeyi dene.', en: 'Flawless shift! Try the next level.', de: 'Makellose Schicht! Probier die nächste Stufe.' },
  other: { tr: 'Hata yaptığın adımları yavaşça tekrar et.', en: 'Repeat the steps where you made mistakes slowly.', de: 'Wiederhole die fehlerhaften Schritte langsam.' },
};

/* ---------------- XP ve oyuncu seviyesi ---------------- */

export const xpForShift = (summary, evaluation) =>
  Math.round(Math.max(0, summary.score) / 10) + clampInt(summary.stars, 0, 3) * 15 + (GRADE_XP[evaluation.grade] || 0);

// n. seviyeye ulaşmak için gereken toplam XP: 50·n·(n−1) → 0, 100, 300, 600, 1000, 1500…
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

/* ---------------- Başarımlar ---------------- */

export const ACHIEVEMENTS = [
  { id: 'first_shift', icon: '🎬', xp: 20, test: (c) => c.totals.shifts >= 1,
    tr: ['İlk Mesai', 'İlk vardiyanı tamamla.'], en: ['First Day', 'Finish your first shift.'], de: ['Erster Tag', 'Erste Schicht abschließen.'] },
  { id: 'all_roles', icon: '🔄', xp: 50, test: (c) => c.roles.length >= 3,
    tr: ['Çok Yönlü', 'Barista, kasiyer ve reyon rollerinin hepsini dene.'], en: ['All-Rounder', 'Try barista, cashier and shelf roles.'], de: ['Allrounder', 'Alle drei Rollen ausprobieren.'] },
  { id: 'three_star', icon: '⭐', xp: 25, test: (c) => c.totals.threeStars >= 1,
    tr: ['Yıldız Çalışan', 'İlk 3 yıldızlı vardiyan.'], en: ['Star Worker', 'Your first 3-star shift.'], de: ['Sternschicht', 'Erste 3-Sterne-Schicht.'] },
  { id: 'three_star_10', icon: '🏅', xp: 75, test: (c) => c.totals.threeStars >= 10,
    tr: ['Ayın Elemanı', '10 kez 3 yıldız al.'], en: ['Employee of the Month', 'Get 3 stars 10 times.'], de: ['Mitarbeiter des Monats', '10-mal 3 Sterne.'] },
  { id: 'flawless', icon: '💎', xp: 40, test: (c) => c.totals.flawless >= 1,
    tr: ['Kusursuz Vardiya', 'Hiç hata yapmadan ve kimseyi kaçırmadan bir vardiya bitir.'], en: ['Flawless', 'Finish a shift with no mistakes and no one lost.'], de: ['Makellos', 'Schicht ohne Fehler und ohne Verluste.'] },
  { id: 'cash_master', icon: '💵', xp: 50, test: (c) => c.totals.changeCorrect >= 25,
    tr: ['Para Ustası', '25 kez doğru para üstü ver.'], en: ['Change Master', 'Give correct change 25 times.'], de: ['Wechselgeld-Profi', '25-mal richtig herausgeben.'] },
  { id: 'discount_hunter', icon: '🏷️', xp: 40, test: (c) => c.totals.discountsApplied >= 10,
    tr: ['İndirim Avcısı', '10 indirimi doğru uygula.'], en: ['Discount Hunter', 'Apply 10 discounts correctly.'], de: ['Rabattjäger', '10 Rabatte richtig anwenden.'] },
  { id: 'friendly_till', icon: '😊', xp: 40, test: (c, s) => s.role === 'cashier' && typeof s.satisfaction === 'number' && s.satisfaction >= 90 && s.served === s.total,
    tr: ['Güler Yüzlü Kasa', 'Bir kasiyer vardiyasını %90+ memnuniyetle bitir.'], en: ['Friendly Till', 'Finish a cashier shift with 90%+ satisfaction.'], de: ['Freundliche Kasse', 'Kassenschicht mit 90 %+ Zufriedenheit.'] },
  { id: 'expiry_detective', icon: '🔍', xp: 50, test: (c) => c.totals.expiredRemoved >= 30,
    tr: ['SKT Dedektifi', '30 tarihi geçmiş ürünü raftan ayıkla.'], en: ['Expiry Detective', 'Remove 30 expired items.'], de: ['MHD-Detektiv', '30 abgelaufene Waren aussortieren.'] },
  { id: 'stock_keeper', icon: '📋', xp: 40, test: (c) => c.totals.shortageReports >= 5,
    tr: ['Stok Bekçisi', '5 eksik stoku doğru bildir.'], en: ['Stock Keeper', 'Report 5 real shortages.'], de: ['Bestandswächter', '5 echte Fehlbestände melden.'] },
  { id: 'coffee_master', icon: '☕', xp: 50, test: (c) => c.totals.drinks >= 50,
    tr: ['Kahve Ustası', '50 içeceği doğru servis et.'], en: ['Coffee Master', 'Serve 50 correct drinks.'], de: ['Kaffeemeister', '50 Getränke richtig servieren.'] },
  { id: 'hundred_customers', icon: '👥', xp: 60, test: (c) => c.totals.customers >= 100,
    tr: ['Müdavim Dostu', '100 müşteriye hizmet et.'], en: ['People Person', 'Serve 100 customers.'], de: ['Kundenfreund', '100 Kunden bedienen.'] },
  { id: 'top_level', icon: '👑', xp: 75, test: (c, s, p) => !!p && Object.values(p.roles || {}).some((r) => r.unlockedLevel >= 4),
    tr: ['Vardiya Şefi', 'Bir rolde en üst seviyeyi aç.'], en: ['Shift Lead', 'Unlock the top level in a role.'], de: ['Schichtleitung', 'Höchste Stufe einer Rolle freischalten.'] },
  { id: 'steady', icon: '📅', xp: 40, test: (c) => c.days >= 3,
    tr: ['İstikrar', '3 farklı günde vardiya yap.'], en: ['Steady', 'Work shifts on 3 different days.'], de: ['Beständig', 'An 3 verschiedenen Tagen arbeiten.'] },
  { id: 'xp_1000', icon: '🚀', xp: 0, test: (c) => c.xp >= 1000,
    tr: ['Deneyimli', 'Toplam 1000 XP topla.'], en: ['Seasoned', 'Collect 1000 XP in total.'], de: ['Routiniert', 'Insgesamt 1000 XP sammeln.'] },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) || null;

/* ---------------- Günlük görevler ---------------- */

export const MISSION_XP = 40;
export const DAILY_MISSION_COUNT = 3;

export const MISSIONS = [
  { id: 'shifts2', icon: '🕐', target: 2, inc: () => 1,
    tr: '2 vardiya tamamla', en: 'Finish 2 shifts', de: '2 Schichten abschließen' },
  { id: 'stars3', icon: '⭐', target: 1, inc: (s) => (s.stars === 3 ? 1 : 0),
    tr: '3 yıldızlı bir vardiya', en: 'One 3-star shift', de: 'Eine 3-Sterne-Schicht' },
  { id: 'cashierPass', icon: '🧾', target: 1, inc: (s) => (s.role === 'cashier' && s.stars >= 2 ? 1 : 0),
    tr: 'Kasada 2+ yıldızlı vardiya', en: '2+ star cashier shift', de: 'Kassenschicht mit 2+ Sternen' },
  { id: 'shelfPass', icon: '📦', target: 1, inc: (s) => (s.role === 'shelf' && s.stars >= 2 ? 1 : 0),
    tr: 'Reyonda 2+ yıldızlı vardiya', en: '2+ star shelf shift', de: 'Regalschicht mit 2+ Sternen' },
  { id: 'baristaPass', icon: '☕', target: 1, inc: (s) => (s.role === 'barista' && s.stars >= 2 ? 1 : 0),
    tr: 'Kafede 2+ yıldızlı vardiya', en: '2+ star barista shift', de: 'Barista-Schicht mit 2+ Sternen' },
  { id: 'flawless', icon: '💎', target: 1, inc: (s) => (s.wrong === 0 && s.missed === 0 && s.served === s.total ? 1 : 0),
    tr: 'Hatasız bir vardiya', en: 'One mistake-free shift', de: 'Eine fehlerfreie Schicht' },
  { id: 'expired5', icon: '🔍', target: 5, inc: (s) => (s.stats && s.stats.expiredRemoved) || 0,
    tr: '5 SKT\'si geçmiş ürünü ayıkla', en: 'Remove 5 expired items', de: '5 abgelaufene Waren aussortieren' },
  { id: 'change5', icon: '💵', target: 5, inc: (s) => (s.stats && s.stats.changeCorrect) || 0,
    tr: '5 kez doğru para üstü ver', en: 'Give correct change 5 times', de: '5-mal richtig herausgeben' },
  { id: 'customers10', icon: '👥', target: 10, inc: (s) => (s.role !== 'shelf' ? s.served : 0),
    tr: '10 müşteriye hizmet et', en: 'Serve 10 customers', de: '10 Kunden bedienen' },
  { id: 'happy', icon: '😊', target: 1, inc: (s) => (typeof s.satisfaction === 'number' && s.satisfaction >= 85 ? 1 : 0),
    tr: '%85+ memnuniyetli bir vardiya', en: 'A shift with 85%+ satisfaction', de: 'Schicht mit 85 %+ Zufriedenheit' },
];
export const MISSION_IDS = MISSIONS.map((m) => m.id);
export const missionById = (id) => MISSIONS.find((m) => m.id === id) || null;

// Tarihe göre her gün aynı 3 görev (herkes için aynı; sunucu ve uygulama aynı sonucu bulur).
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

/* ---------------- Kariyer kaydı ---------------- */

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

/*
  Doğrulanmış bir vardiyayı kariyere işler. progressAfter: rol seviyeleri güncellenmiş ilerleme
  (başarım kontrolü için). Dönüş: yeni kariyer + ekranda gösterilecek ayrıntılar.
*/
export const applyCareer = (careerRaw, summary, dateISO, progressAfter = null) => {
  const c = normalizeCareer(careerRaw);
  const day = isoDay(dateISO);
  const evaluation = evaluateShift(summary);
  const levelBefore = playerLevel(c.xp).level;
  const stats = summary.stats || {};

  // Toplamlar
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

  // XP: vardiya
  const baseXp = xpForShift(summary, evaluation);
  c.xp += baseXp;

  // Günlük görevler
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

  // Başarımlar (XP başarımı da açılabilsin diye birkaç tur)
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
