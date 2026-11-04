/*
===========================================================
  BAKPLANLA — İŞ BAŞI / ÖRNEK MARKET (Aşama 2)
  Saf JavaScript → Node ile test edilebilir.

  KASİYER
  - Müşterinin sepetindeki her ürün BİR KEZ okutulur. Meyve-sebzenin barkodu yoktur:
    önce "Tartı" açılır, sonra ürün okutulur.
  - Uzman seviyeden itibaren bazı müşteriler poşet ister; poşet ücreti kasaya eklenmelidir.
  - "Ödeme Al": sepet eksik / fazla okutulmuşsa ya da poşet yanlışsa yanlış sayılır (−25).
  - Nakit ödemede para üstü banknot/bozuk para düğmeleriyle verilir; yanlışsa −25.
  - Son ürünü iptal etmek −5 puan.

  REYON GÖREVLİSİ
  - Arabadaki ürünler planograma (raf planı) göre doğru rafa dizilir (+10).
  - Son kullanma tarihi (SKT) geçmiş ürünler imha kutusuna atılır (+15).
  - Yanlış rafa koymak −10; SKT'si geçmiş ürünü rafa koymak ya da sağlam ürünü atmak −25.
  - Uzman seviyeden itibaren planogram yalnızca birkaç saniye görünür (ezberle);
    tekrar bakmak −20. Bir müşteri bir ürünün hangi reyonda olduğunu sorar (+20 / −10).

  Para hep KURUŞ (tam sayı) olarak tutulur; ondalık hatası olmaz.
  Fiyatlar oyun içi TEMSİLİ fiyatlardır, gerçek market fiyatı değildir.
===========================================================
*/

import {
  createRng,
  roleLevelInfo,
  POINTS,
  nextTask,
  noteMistake,
  bumpStat,
  TRACKING_FIELDS,
} from './isbasi.js';

const pickFrom = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
const shuffle = (rng, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

const CUSTOMER_NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak', 'Selin', 'Emre', 'Deniz', 'Ece', 'Murat', 'Derya', 'Kerem', 'İrem', 'Okan', 'Seda'];

export const MARKET_POINTS = {
  correct: POINTS.correct,
  speedBonusMax: POINTS.speedBonusMax,
  wrong: POINTS.wrongServe,
  voidItem: 5,
  place: 10,
  removeExpired: 15,
  wrongSlot: 10,
  badShelfAction: 25,
  questionRight: 20,
  questionWrong: 10,
  peek: POINTS.peek,
  discount: 10,
  wrongDiscount: 10,
  storage: 5,
  shortage: 15,
  falseShortage: 10,
};

/* ---------------- Para ---------------- */

// Banknot ve bozuk paralar (kuruş).
export const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25];

export const formatMoney = (kurus) => {
  const k = Math.round(Number(kurus) || 0);
  const sign = k < 0 ? '−' : '';
  const abs = Math.abs(k);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} ₺`;
};

export const denominationLabel = (kurus) => (kurus >= 100 ? `${kurus / 100} ₺` : `${kurus} kr`);

const roundTo = (value, step) => Math.max(step, Math.round(value / step) * step);
const ceilTo = (value, step) => Math.ceil(value / step) * step;

/* ---------------- Kasa ürünleri ---------------- */

export const BAG_PRICE = 100; // 1,00 ₺ (temsili)

// price: kuruş. kg: true → meyve-sebze, kilo fiyatı; tartıyla okutulur.
export const CASHIER_PRODUCTS = [
  { key: 'milk', icon: '🥛', price: 4475, tr: 'Süt 1 L', en: 'Milk 1 L', de: 'Milch 1 L' },
  { key: 'bread', icon: '🍞', price: 1550, tr: 'Ekmek', en: 'Bread', de: 'Brot' },
  { key: 'eggs', icon: '🥚', price: 9450, tr: 'Yumurta 10\'lu', en: 'Eggs (10)', de: 'Eier (10)' },
  { key: 'cheese', icon: '🧀', price: 17925, tr: 'Beyaz peynir', en: 'White cheese', de: 'Weißkäse' },
  { key: 'pasta', icon: '🍝', price: 2475, tr: 'Makarna', en: 'Pasta', de: 'Nudeln' },
  { key: 'rice', icon: '🍚', price: 6950, tr: 'Pirinç 1 kg', en: 'Rice 1 kg', de: 'Reis 1 kg' },
  { key: 'water', icon: '💧', price: 1225, tr: 'Su 1,5 L', en: 'Water 1.5 L', de: 'Wasser 1,5 L' },
  { key: 'tea', icon: '🍵', price: 13950, tr: 'Çay 500 g', en: 'Tea 500 g', de: 'Tee 500 g' },
  { key: 'detergent', icon: '🧴', price: 10975, tr: 'Bulaşık deterjanı', en: 'Dish soap', de: 'Spülmittel' },
  { key: 'biscuit', icon: '🍪', price: 1950, tr: 'Bisküvi', en: 'Biscuits', de: 'Kekse' },
  { key: 'yogurt', icon: '🥣', price: 7425, tr: 'Yoğurt 1 kg', en: 'Yogurt 1 kg', de: 'Joghurt 1 kg' },
  { key: 'olives', icon: '🫒', price: 11950, tr: 'Zeytin', en: 'Olives', de: 'Oliven' },
  { key: 'tomato', icon: '🍅', price: 4000, kg: true, tr: 'Domates', en: 'Tomatoes', de: 'Tomaten' },
  { key: 'banana', icon: '🍌', price: 8550, kg: true, tr: 'Muz', en: 'Bananas', de: 'Bananen' },
  { key: 'apple', icon: '🍎', price: 5000, kg: true, tr: 'Elma', en: 'Apples', de: 'Äpfel' },
  { key: 'potato', icon: '🥔', price: 2550, kg: true, tr: 'Patates', en: 'Potatoes', de: 'Kartoffeln' },
];
export const cashierProduct = (key) => CASHIER_PRODUCTS.find((p) => p.key === key) || null;

const WEIGHTS = [0.5, 1, 1.5, 2];

const itemPrice = (product, weightKg, step) => {
  const raw = product.kg ? product.price * weightKg : product.price;
  return roundTo(raw, step);
};

export const basketTotal = (items) => items.reduce((sum, it) => sum + it.price, 0);

export const DISCOUNT_OPTIONS = [10, 20, 25, 50];

// İndirim uygulanmış fiyat (kuruş). İndirim yuvarlaması seviyenin fiyat adımına göre yapılır.
export const discountedPrice = (item, step = 25) =>
  (item.discountPct ? roundTo(Math.round((item.price * (100 - item.discountPct)) / 100), step) : item.price);

const buildCashierOrders = (level, seed) => {
  const info = roleLevelInfo('cashier', level);
  const rng = createRng(seed);
  const packaged = CASHIER_PRODUCTS.filter((p) => !p.kg);
  const produce = CASHIER_PRODUCTS.filter((p) => p.kg);
  const orders = [];
  for (let i = 0; i < info.orders; i += 1) {
    const count = randInt(rng, info.items[0], info.items[1]);
    const produceCount = info.produce ? Math.min(2, randInt(rng, 1, 2)) : 0;
    const chosen = [
      ...shuffle(rng, produce).slice(0, produceCount),
      ...shuffle(rng, packaged).slice(0, count - produceCount),
    ];
    const items = shuffle(rng, chosen).map((p, idx) => {
      const weightKg = p.kg ? pickFrom(rng, WEIGHTS) : null;
      return { id: `c${i + 1}i${idx + 1}`, product: p.key, weightKg, price: itemPrice(p, weightKg, info.priceStep), discountPct: 0 };
    });
    // Çalışan seviyesinden itibaren bazı paketli ürünlerde "İNDİRİM" etiketi olur; kasiyer uygulamalıdır.
    if (info.discounts && rng() < info.discounts) {
      const candidates = items.filter((it) => !cashierProduct(it.product).kg);
      if (candidates.length) pickFrom(rng, candidates).discountPct = pickFrom(rng, DISCOUNT_OPTIONS);
    }
    const wantsBag = info.bag ? rng() < 0.6 : false;
    const total = items.reduce((sum, it) => sum + discountedPrice(it, info.priceStep), 0) + (wantsBag ? BAG_PRICE : 0);
    let method = rng() < info.cashRatio ? 'cash' : 'card';
    // Uzman seviyesinden itibaren bazı kartlar reddedilir; müşteri nakit öder.
    const cardDeclined = method === 'card' && info.declines ? rng() < info.declines : false;
    let given = total;
    if (method === 'cash' || cardDeclined) {
      const options = [...new Set([ceilTo(total, 1000), ceilTo(total, 5000), ceilTo(total, 10000), ceilTo(total, 20000)])]
        .filter((x) => x >= total);
      given = pickFrom(rng, options);
    }
    orders.push({ id: `c${i + 1}`, customer: pickFrom(rng, CUSTOMER_NAMES), items, wantsBag, method, cardDeclined, given, total });
  }
  return orders;
};

const CASHIER_BLANK = { scanned: [], discounted: [], bag: false, scale: false, phase: 'scan', change: [], declined: false };

const baseState = (role, level, orders, patienceMs, blankWork, maxScore) => ({
  role,
  level,
  orders,
  index: 0,
  work: JSON.parse(JSON.stringify(blankWork)),
  blankWork,
  patienceMs,
  remainingMs: patienceMs,
  elapsedMs: 0,
  taskStartMs: 0,
  score: 0,
  served: 0,
  wrong: 0,
  missed: 0,
  discards: 0,
  peeks: 0,
  finished: false,
  lastEvent: null,
  maxScore,
  ...TRACKING_FIELDS(),
});

export const createCashierShift = (level = 1, seed = Date.now()) => {
  const info = roleLevelInfo('cashier', level);
  const orders = buildCashierOrders(info.level, seed);
  const discounts = orders.reduce((n, o) => n + o.items.filter((it) => it.discountPct).length, 0);
  const maxScore = orders.length * (MARKET_POINTS.correct + MARKET_POINTS.speedBonusMax) + discounts * MARKET_POINTS.discount;
  return baseState('cashier', info.level, orders, info.patienceMs, CASHIER_BLANK, maxScore);
};

const currentTask = (state) => (state && !state.finished ? state.orders[state.index] || null : null);

const nextTaskLocal = nextTask;

const completeTask = (state, extra = {}) => {
  const task = currentTask(state);
  const speed = Math.max(0, Math.min(1, state.remainingMs / state.patienceMs));
  const gained = MARKET_POINTS.correct + Math.round(MARKET_POINTS.speedBonusMax * speed);
  return nextTaskLocal(
    { ...state, served: state.served + 1, score: state.score + gained },
    { type: 'correct', points: gained, customer: task.customer || '', ...extra },
  );
};

const penalize = (state, points, event) => ({
  ...noteMistake(state, event.reason || 'other'),
  wrong: state.wrong + 1,
  score: Math.max(0, state.score - points),
  lastEvent: event,
});

const isCashier = (state) => state && state.role === 'cashier' && !state.finished;

export const toggleScale = (state) => {
  if (!isCashier(state) || state.work.phase !== 'scan') return state;
  return { ...state, work: { ...state.work, scale: !state.work.scale }, lastEvent: null };
};

export const scanItem = (state, itemId) => {
  if (!isCashier(state)) return state;
  if (state.work.phase !== 'scan') return { ...state, lastEvent: { type: 'paying' } };
  const task = currentTask(state);
  const item = task.items.find((x) => x.id === itemId);
  if (!item) return state;
  const product = cashierProduct(item.product);
  if (product.kg && !state.work.scale) return { ...state, lastEvent: { type: 'needScale' } };
  if (!product.kg && state.work.scale) {
    return { ...state, work: { ...state.work, scale: false }, lastEvent: { type: 'scaleNotNeeded' } };
  }
  return {
    ...state,
    work: { ...state.work, scanned: [...state.work.scanned, itemId], scale: false },
    lastEvent: { type: 'beep' },
  };
};

// Okutulmuş bir ürüne etiketteki indirimi uygular. Etiketsiz ürüne indirim yapmak hatadır.
export const applyDiscount = (state, itemId) => {
  if (!isCashier(state) || state.work.phase !== 'scan') return state;
  if (!roleLevelInfo('cashier', state.level).discounts) return state;
  const task = currentTask(state);
  const item = task.items.find((x) => x.id === itemId);
  if (!item || !state.work.scanned.includes(itemId)) return { ...state, lastEvent: { type: 'scanFirst' } };
  if (state.work.discounted.includes(itemId)) return { ...state, lastEvent: { type: 'alreadyDiscounted' } };
  if (!item.discountPct) {
    return penalize(state, MARKET_POINTS.wrongDiscount, { type: 'wrong', reason: 'noDiscount', customer: task.customer });
  }
  return bumpStat({
    ...state,
    score: state.score + MARKET_POINTS.discount,
    work: { ...state.work, discounted: [...state.work.discounted, itemId] },
    lastEvent: { type: 'discounted', pct: item.discountPct, points: MARKET_POINTS.discount },
  }, 'discountsApplied');
};

export const voidLast = (state) => {
  if (!isCashier(state) || state.work.phase !== 'scan' || state.work.scanned.length === 0) return state;
  const last = state.work.scanned[state.work.scanned.length - 1];
  const stillScanned = state.work.scanned.slice(0, -1);
  // Ürünün son kopyası iptal edilirse ona uygulanan indirim de kalkar.
  const discounted = stillScanned.includes(last) ? state.work.discounted : state.work.discounted.filter((id) => id !== last);
  return {
    ...state,
    work: { ...state.work, scanned: stillScanned, discounted },
    discards: state.discards + 1,
    taskVoids: (state.taskVoids || 0) + 1,
    score: Math.max(0, state.score - MARKET_POINTS.voidItem),
    lastEvent: { type: 'void' },
  };
};

export const toggleBag = (state) => {
  if (!isCashier(state) || state.work.phase !== 'scan') return state;
  if (!roleLevelInfo('cashier', state.level).bag) return state;
  return { ...state, work: { ...state.work, bag: !state.work.bag }, lastEvent: null };
};

// Ekrandaki (kasadaki) toplam: okutulanlar (uygulanan indirimlerle) + poşet.
export const registerTotal = (state) => {
  const task = currentTask(state);
  if (!task) return 0;
  const step = roleLevelInfo('cashier', state.level).priceStep;
  const byId = Object.fromEntries(task.items.map((x) => [x.id, x]));
  const sum = state.work.scanned.reduce((acc, id) => {
    const it = byId[id];
    if (!it) return acc;
    return acc + (state.work.discounted.includes(id) ? discountedPrice(it, step) : it.price);
  }, 0);
  return sum + (state.work.bag ? BAG_PRICE : 0);
};

export const checkBasket = (task, work) => {
  const counts = {};
  for (const id of work.scanned) counts[id] = (counts[id] || 0) + 1;
  if (task.items.some((x) => !counts[x.id])) return { ok: false, reason: 'missing' };
  if (Object.values(counts).some((n) => n > 1)) return { ok: false, reason: 'double' };
  if (task.items.some((x) => x.discountPct && !(work.discounted || []).includes(x.id))) return { ok: false, reason: 'discountMissing' };
  if (task.wantsBag && !work.bag) return { ok: false, reason: 'bagMissing' };
  if (!task.wantsBag && work.bag) return { ok: false, reason: 'bagExtra' };
  return { ok: true, reason: null };
};

export const changeDue = (task) => (task ? Math.max(0, task.given - task.total) : 0);

// Müşterinin bu an ödeme şekli (kart reddedildiyse nakit).
export const paymentMethod = (task, work) => (task.method === 'card' && !(task.cardDeclined && work.declined) ? 'card' : 'cash');

export const takePayment = (state) => {
  if (!isCashier(state) || state.work.phase !== 'scan') return state;
  const task = currentTask(state);
  if (state.work.scanned.length === 0) return { ...state, lastEvent: { type: 'empty' } };
  const result = checkBasket(task, state.work);
  if (!result.ok) {
    return penalize(state, MARKET_POINTS.wrong, { type: 'wrong', reason: result.reason, customer: task.customer });
  }
  if (task.method === 'card' && task.cardDeclined && !state.work.declined) {
    // Kart reddedildi: kasiyerin hatası değil, müşteri nakit öder.
    const next = bumpStat({ ...state, work: { ...state.work, declined: true } }, 'cardDeclines');
    if (changeDue(task) === 0) return completeTask(next);
    return { ...next, work: { ...next.work, phase: 'change', change: [] }, lastEvent: { type: 'declined', given: task.given } };
  }
  if (task.method === 'card' || changeDue(task) === 0) return completeTask(state);
  return { ...state, work: { ...state.work, phase: 'change', change: [] }, lastEvent: { type: 'cash', given: task.given } };
};

export const addChange = (state, denom) => {
  if (!isCashier(state) || state.work.phase !== 'change' || !DENOMINATIONS.includes(denom)) return state;
  if (state.work.change.length >= 20) return state;
  return { ...state, work: { ...state.work, change: [...state.work.change, denom] }, lastEvent: null };
};

export const clearChange = (state) => {
  if (!isCashier(state) || state.work.phase !== 'change') return state;
  return { ...state, work: { ...state.work, change: [] }, lastEvent: null };
};

export const changeSum = (state) => (state && state.work ? state.work.change.reduce((a, b) => a + b, 0) : 0);

export const giveChange = (state) => {
  if (!isCashier(state) || state.work.phase !== 'change') return state;
  const task = currentTask(state);
  if (changeSum(state) !== changeDue(task)) {
    return {
      ...penalize(state, MARKET_POINTS.wrong, { type: 'wrong', reason: 'change', customer: task.customer }),
      work: { ...state.work, change: [] },
    };
  }
  return completeTask(bumpStat(state, 'changeCorrect'));
};

/* ---------------- Reyon ---------------- */

export const AISLES = [
  { key: 'breakfast', icon: '🍳', tr: 'Kahvaltılık', en: 'Breakfast', de: 'Frühstück' },
  { key: 'drinks', icon: '🥤', tr: 'İçecek', en: 'Drinks', de: 'Getränke' },
  { key: 'cleaning', icon: '🧽', tr: 'Temizlik', en: 'Cleaning', de: 'Reinigung' },
  { key: 'dry', icon: '🌾', tr: 'Kuru Gıda', en: 'Dry Food', de: 'Trockenwaren' },
];
export const aisleByKey = (key) => AISLES.find((a) => a.key === key) || null;

export const SHELF_PRODUCTS = [
  { key: 'whiteCheese', aisle: 'breakfast', icon: '🧀', tr: 'Beyaz peynir', en: 'White cheese', de: 'Weißkäse' },
  { key: 'kasar', aisle: 'breakfast', icon: '🧀', tr: 'Kaşar', en: 'Kashar cheese', de: 'Kaschkaval' },
  { key: 'olives', aisle: 'breakfast', icon: '🫒', tr: 'Zeytin', en: 'Olives', de: 'Oliven' },
  { key: 'jam', aisle: 'breakfast', icon: '🍓', tr: 'Reçel', en: 'Jam', de: 'Marmelade' },
  { key: 'honey', aisle: 'breakfast', icon: '🍯', tr: 'Bal', en: 'Honey', de: 'Honig' },
  { key: 'butter', aisle: 'breakfast', icon: '🧈', tr: 'Tereyağı', en: 'Butter', de: 'Butter' },
  { key: 'eggs', aisle: 'breakfast', icon: '🥚', tr: 'Yumurta', en: 'Eggs', de: 'Eier' },
  { key: 'halva', aisle: 'breakfast', icon: '🍬', tr: 'Helva', en: 'Halva', de: 'Halva' },

  { key: 'water', aisle: 'drinks', icon: '💧', tr: 'Su', en: 'Water', de: 'Wasser' },
  { key: 'soda', aisle: 'drinks', icon: '🫧', tr: 'Maden suyu', en: 'Mineral water', de: 'Mineralwasser' },
  { key: 'juice', aisle: 'drinks', icon: '🧃', tr: 'Meyve suyu', en: 'Fruit juice', de: 'Fruchtsaft' },
  { key: 'ayran', aisle: 'drinks', icon: '🥛', tr: 'Ayran', en: 'Ayran', de: 'Ayran' },
  { key: 'pop', aisle: 'drinks', icon: '🥤', tr: 'Gazoz', en: 'Soda pop', de: 'Limo' },
  { key: 'icedTea', aisle: 'drinks', icon: '🧋', tr: 'Soğuk çay', en: 'Iced tea', de: 'Eistee' },
  { key: 'lemonade', aisle: 'drinks', icon: '🍋', tr: 'Limonata', en: 'Lemonade', de: 'Limonade' },
  { key: 'milk', aisle: 'drinks', icon: '🍼', tr: 'Süt', en: 'Milk', de: 'Milch' },

  { key: 'dishSoap', aisle: 'cleaning', icon: '🧴', tr: 'Bulaşık deterjanı', en: 'Dish soap', de: 'Spülmittel' },
  { key: 'laundry', aisle: 'cleaning', icon: '🧺', tr: 'Çamaşır deterjanı', en: 'Laundry detergent', de: 'Waschmittel' },
  { key: 'sponge', aisle: 'cleaning', icon: '🧽', tr: 'Sünger', en: 'Sponge', de: 'Schwamm' },
  { key: 'trashBags', aisle: 'cleaning', icon: '🗑️', tr: 'Çöp poşeti', en: 'Trash bags', de: 'Müllbeutel' },
  { key: 'softener', aisle: 'cleaning', icon: '🌸', tr: 'Yumuşatıcı', en: 'Softener', de: 'Weichspüler' },
  { key: 'paperTowel', aisle: 'cleaning', icon: '🧻', tr: 'Kâğıt havlu', en: 'Paper towels', de: 'Küchenrolle' },
  { key: 'soap', aisle: 'cleaning', icon: '🧼', tr: 'Sabun', en: 'Soap', de: 'Seife' },
  { key: 'bleach', aisle: 'cleaning', icon: '🫙', tr: 'Çamaşır suyu', en: 'Bleach', de: 'Bleichmittel' },

  { key: 'pasta', aisle: 'dry', icon: '🍝', tr: 'Makarna', en: 'Pasta', de: 'Nudeln' },
  { key: 'rice', aisle: 'dry', icon: '🍚', tr: 'Pirinç', en: 'Rice', de: 'Reis' },
  { key: 'bulgur', aisle: 'dry', icon: '🌾', tr: 'Bulgur', en: 'Bulgur', de: 'Bulgur' },
  { key: 'lentils', aisle: 'dry', icon: '🫘', tr: 'Mercimek', en: 'Lentils', de: 'Linsen' },
  { key: 'flour', aisle: 'dry', icon: '🥖', tr: 'Un', en: 'Flour', de: 'Mehl' },
  { key: 'sugar', aisle: 'dry', icon: '🧂', tr: 'Şeker', en: 'Sugar', de: 'Zucker' },
  { key: 'chickpeas', aisle: 'dry', icon: '🟤', tr: 'Nohut', en: 'Chickpeas', de: 'Kichererbsen' },
  { key: 'beans', aisle: 'dry', icon: '⚪', tr: 'Kuru fasulye', en: 'Dried beans', de: 'Weiße Bohnen' },
];
export const shelfProduct = (key) => SHELF_PRODUCTS.find((p) => p.key === key) || null;

const pad2 = (n) => String(n).padStart(2, '0');
export const addDaysISO = (iso, days) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};
export const formatDateTR = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
// SKT bugünden önceyse geçmiştir. SKT bugünse o gün hâlâ satılabilir.
export const isExpired = (sktISO, todayISO) => String(sktISO) < String(todayISO);

/*
  Reyon görevi (bir raf):
  - slots: [{ product, need }] → raf etiketinde ürün ve olması gereken ADET yazar.
  - trolley: arabadaki birimler. Her birinin kendi SKT'si vardır.
      * ihtiyaç kadar sağlam birim (eksik stoklu rafta daha az),
      * fazla (fazla stok) birimler → raf dolunca DEPOYA geri gönderilir,
      * SKT'si geçmiş birimler → İMHA kutusuna.
  - shortage: arabada yeterli birim olmayan raf (Uzman+). Oyuncu "Eksik stok bildir" demelidir.
*/
const buildShelfOrders = (level, seed, todayISO) => {
  const info = roleLevelInfo('shelf', level);
  const rng = createRng(seed);
  const aisleOrder = shuffle(rng, AISLES);
  const orders = [];
  for (let i = 0; i < info.orders; i += 1) {
    const aisle = aisleOrder[i % aisleOrder.length];
    const products = shuffle(rng, SHELF_PRODUCTS.filter((p) => p.aisle === aisle.key)).slice(0, info.slots);
    const slots = products.map((p) => ({ product: p.key, need: randInt(rng, info.need[0], info.need[1]) }));
    const shortageSlot = info.shortage ? randInt(rng, 0, slots.length - 1) : -1;
    const available = slots.map((s, idx) => (idx === shortageSlot ? s.need - randInt(rng, 1, s.need) : s.need));

    const fresh = [];
    let nearLeft = info.nearExpiry ? 2 : 0;
    slots.forEach((s, idx) => {
      for (let k = 0; k < available[idx]; k += 1) {
        const near = nearLeft > 0 && rng() < 0.4;
        if (near) nearLeft -= 1;
        fresh.push({ id: `s${i + 1}f${idx + 1}_${k + 1}`, product: s.product, skt: addDaysISO(todayISO, near ? randInt(rng, 0, 2) : randInt(rng, 7, 90)) });
      }
    });
    const extras = [];
    const extraCandidates = slots.filter((_, idx) => idx !== shortageSlot);
    for (let e = 0; e < info.extras && extraCandidates.length; e += 1) {
      const s = pickFrom(rng, extraCandidates);
      extras.push({ id: `s${i + 1}e${e + 1}`, product: s.product, skt: addDaysISO(todayISO, randInt(rng, 7, 90)) });
    }
    const expired = [];
    for (let e = 0; e < info.expired; e += 1) {
      const s = pickFrom(rng, slots);
      expired.push({ id: `s${i + 1}x${e + 1}`, product: s.product, skt: addDaysISO(todayISO, -randInt(rng, 1, 20)) });
    }
    let question = null;
    if (info.question) {
      const otherAisles = AISLES.filter((a) => a.key !== aisle.key);
      const qAisle = pickFrom(rng, otherAisles);
      const qProduct = pickFrom(rng, SHELF_PRODUCTS.filter((p) => p.aisle === qAisle.key));
      const wrongOptions = shuffle(rng, AISLES.filter((a) => a.key !== qAisle.key)).slice(0, 2).map((a) => a.key);
      question = { customer: pickFrom(rng, CUSTOMER_NAMES), product: qProduct.key, answer: qAisle.key, options: shuffle(rng, [qAisle.key, ...wrongOptions]) };
    }
    orders.push({
      id: `s${i + 1}`,
      aisle: aisle.key,
      slots,
      shortage: shortageSlot,
      trolley: shuffle(rng, [...fresh, ...extras, ...expired]),
      question,
    });
  }
  return orders;
};

export const SHELF_MEMORIZE_MS_PER_SLOT = 1000; // 6 raf → 6 sn, 8 raf → 8 sn
export const SHELF_PEEK_MS = 4000;

export const slotAvailable = (task, idx) =>
  task.trolley.filter((x) => x.product === task.slots[idx].product && !x.id.includes('x') && !x.id.includes('e')).length;

const shelfTaskMax = (task) => {
  const placeable = task.slots.reduce((n, _, idx) => n + slotAvailable(task, idx), 0);
  return placeable * MARKET_POINTS.place
    + task.trolley.filter((x) => x.id.includes('x')).length * MARKET_POINTS.removeExpired
    + task.trolley.filter((x) => x.id.includes('e')).length * MARKET_POINTS.storage
    + (task.shortage >= 0 ? MARKET_POINTS.shortage : 0)
    + (task.question ? MARKET_POINTS.questionRight : 0)
    + MARKET_POINTS.correct + MARKET_POINTS.speedBonusMax;
};

export const createShelfShift = (level = 1, seed = Date.now(), todayISO = '2026-10-20') => {
  const info = roleLevelInfo('shelf', level);
  const orders = buildShelfOrders(info.level, seed, todayISO);
  const blank = {
    placed: Array.from({ length: info.slots }, () => []),
    removed: [],
    stored: [],
    reported: [],
    selected: null,
    answered: null,
    revealMs: info.memorize ? info.slots * SHELF_MEMORIZE_MS_PER_SLOT : 0,
  };
  const maxScore = orders.reduce((sum, t) => sum + shelfTaskMax(t), 0);
  return { ...baseState('shelf', info.level, orders, info.patienceMs, blank, maxScore), todayISO };
};

const isShelf = (state) => state && state.role === 'shelf' && !state.finished;

const itemOf = (state, id) => {
  const task = currentTask(state);
  return task ? task.trolley.find((x) => x.id === id) || null : null;
};

export const itemUsed = (work, id) =>
  work.placed.some((list) => list.includes(id)) || work.removed.includes(id) || (work.stored || []).includes(id);

export const slotFull = (task, work, idx) => work.placed[idx].length >= task.slots[idx].need;

export const shelfLabelsVisible = (state) => {
  if (!state || !state.work) return false;
  return !roleLevelInfo('shelf', state.level).memorize || state.work.revealMs > 0;
};

export const shelfDone = (state) => {
  const task = currentTask(state);
  if (!task) return false;
  const w = state.work;
  return task.trolley.every((x) => itemUsed(w, x.id))
    && task.slots.every((_, idx) => slotFull(task, w, idx) || w.reported.includes(idx))
    && (!task.question || w.answered !== null);
};

const finishIfDone = (state) => (shelfDone(state) ? completeTask(state, { aisle: currentTask(state).aisle }) : state);

export const selectItem = (state, id) => {
  if (!isShelf(state)) return state;
  const item = itemOf(state, id);
  if (!item || itemUsed(state.work, id)) return state;
  const selected = state.work.selected === id ? null : id;
  return { ...state, work: { ...state.work, selected }, lastEvent: null };
};

export const placeSelected = (state, slotIndex) => {
  if (!isShelf(state)) return state;
  const task = currentTask(state);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= task.slots.length) return state;
  const id = state.work.selected;
  if (!id) return { ...state, lastEvent: { type: 'selectFirst' } };
  const item = itemOf(state, id);
  if (isExpired(item.skt, state.todayISO)) {
    return { ...penalize(state, MARKET_POINTS.badShelfAction, { type: 'wrong', reason: 'expiredOnShelf' }), work: { ...state.work, selected: null } };
  }
  if (task.slots[slotIndex].product !== item.product) {
    return penalize(state, MARKET_POINTS.wrongSlot, { type: 'wrong', reason: 'wrongSlot' });
  }
  if (slotFull(task, state.work, slotIndex)) return { ...state, lastEvent: { type: 'slotFull' } };
  const placed = state.work.placed.map((list, idx) => (idx === slotIndex ? [...list, id] : list));
  return finishIfDone(bumpStat({
    ...state,
    score: state.score + MARKET_POINTS.place,
    work: { ...state.work, placed, selected: null },
    lastEvent: { type: 'placed', points: MARKET_POINTS.place },
  }, 'unitsPlaced'));
};

export const discardSelected = (state) => {
  if (!isShelf(state)) return state;
  const id = state.work.selected;
  if (!id) return { ...state, lastEvent: { type: 'selectFirst' } };
  const item = itemOf(state, id);
  if (!isExpired(item.skt, state.todayISO)) {
    return { ...penalize(state, MARKET_POINTS.badShelfAction, { type: 'wrong', reason: 'freshDiscarded' }), work: { ...state.work, selected: null } };
  }
  return finishIfDone(bumpStat({
    ...state,
    score: state.score + MARKET_POINTS.removeExpired,
    work: { ...state.work, removed: [...state.work.removed, id], selected: null },
    lastEvent: { type: 'removed', points: MARKET_POINTS.removeExpired },
  }, 'expiredRemoved'));
};

// Fazla stok: rafı zaten dolu olan ürünün fazlası depoya geri gönderilir.
export const returnToStorage = (state) => {
  if (!isShelf(state)) return state;
  const task = currentTask(state);
  const id = state.work.selected;
  if (!id) return { ...state, lastEvent: { type: 'selectFirst' } };
  const item = itemOf(state, id);
  if (isExpired(item.skt, state.todayISO)) {
    return { ...penalize(state, MARKET_POINTS.badShelfAction, { type: 'wrong', reason: 'expiredToStorage' }), work: { ...state.work, selected: null } };
  }
  const slotIdx = task.slots.findIndex((s) => s.product === item.product);
  if (slotIdx >= 0 && !slotFull(task, state.work, slotIdx)) {
    return { ...penalize(state, MARKET_POINTS.wrongSlot, { type: 'wrong', reason: 'neededOnShelf' }), work: { ...state.work, selected: null } };
  }
  return finishIfDone(bumpStat({
    ...state,
    score: state.score + MARKET_POINTS.storage,
    work: { ...state.work, stored: [...state.work.stored, id], selected: null },
    lastEvent: { type: 'stored', points: MARKET_POINTS.storage },
  }, 'storageReturns'));
};

// Eksik stok bildirimi: raf dolmamış VE arabada o üründen sağlam birim kalmamışsa doğrudur.
export const reportShortage = (state, slotIndex) => {
  if (!isShelf(state) || !roleLevelInfo('shelf', state.level).shortage) return state;
  const task = currentTask(state);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= task.slots.length) return state;
  const w = state.work;
  if (w.reported.includes(slotIndex)) return { ...state, lastEvent: { type: 'alreadyReported' } };
  const product = task.slots[slotIndex].product;
  const left = task.trolley.some((x) => x.product === product && !itemUsed(w, x.id) && !isExpired(x.skt, state.todayISO));
  if (slotFull(task, w, slotIndex) || left) {
    return penalize(state, MARKET_POINTS.falseShortage, { type: 'wrong', reason: 'falseShortage' });
  }
  return finishIfDone(bumpStat({
    ...state,
    score: state.score + MARKET_POINTS.shortage,
    work: { ...w, reported: [...w.reported, slotIndex] },
    lastEvent: { type: 'reported', points: MARKET_POINTS.shortage },
  }, 'shortageReports'));
};

export const answerQuestion = (state, aisleKey) => {
  if (!isShelf(state)) return state;
  const task = currentTask(state);
  if (!task.question || state.work.answered !== null) return state;
  const right = aisleKey === task.question.answer;
  let next = {
    ...state,
    score: right ? state.score + MARKET_POINTS.questionRight : Math.max(0, state.score - MARKET_POINTS.questionWrong),
    wrong: right ? state.wrong : state.wrong + 1,
    work: { ...state.work, answered: aisleKey },
    lastEvent: right
      ? { type: 'answerRight', points: MARKET_POINTS.questionRight }
      : { type: 'answerWrong', answer: task.question.answer },
  };
  next = right ? bumpStat(next, 'questionsRight') : noteMistake(next, 'wrongAisle');
  return finishIfDone(next);
};

export const peekPlanogram = (state) => {
  if (!isShelf(state) || !roleLevelInfo('shelf', state.level).memorize) return state;
  if (state.work.revealMs > 0) return state;
  return {
    ...state,
    peeks: state.peeks + 1,
    score: Math.max(0, state.score - MARKET_POINTS.peek),
    work: { ...state.work, revealMs: SHELF_PEEK_MS },
    lastEvent: { type: 'peek' },
  };
};
