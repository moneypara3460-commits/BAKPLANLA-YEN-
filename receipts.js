/* =============================================================
   BAKPLANLA — Fiş kaydı (Akıllı Alışveriş) — 27 Ekim
   Fiş okununca tek bir "fiş kaydı" oluşur ve Belgeler'e "Alışveriş fişi" olarak düşer
   (document.analysis.receipt). Akıllı Alışveriş, PLAN AI ve Fırsat Motoru aynı kaydı okur.
   Sunucu (smart-endpoint v41) aynı yapıyı döndürür; burada cihaz tarafında tekrar doğrulanır.
   ============================================================= */

export const STORE_TYPE_LABELS = {
  market: 'Market',
  akaryakit: 'Akaryakıt istasyonu',
  eczane: 'Eczane',
  kafe_restoran: 'Kafe / Restoran',
  giyim: 'Giyim',
  elektronik: 'Elektronik',
  diger: 'Mağaza',
};

export const CATEGORY_LABELS = {
  temel_gida: 'Temel gıda',
  sut_urunleri: 'Süt ürünleri',
  et_tavuk_balik: 'Et / tavuk / balık',
  meyve_sebze: 'Meyve / sebze',
  atistirmalik: 'Atıştırmalık',
  icecek: 'İçecek',
  temizlik: 'Temizlik',
  kisisel_bakim: 'Kişisel bakım',
  bebek: 'Bebek',
  evcil_hayvan: 'Evcil hayvan',
  tutun: 'Tütün',
  akaryakit: 'Akaryakıt',
  poset: 'Poşet',
  diger: 'Diğer',
};

const STORE_TYPES = Object.keys(STORE_TYPE_LABELS);
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const UNITS = ['adet', 'kg', 'g', 'lt', 'ml', 'paket'];
const NON_COMPARABLE = ['tutun', 'akaryakit', 'poset'];
// Alışveriş listesine eklenmeyecek kalemler (fişte görünür ama "gelecek hafta alınacak" değildir).
const NOT_FOR_LIST = ['akaryakit', 'poset'];

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/[\s*₺]|TL/gi, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const str = (v, max = 80) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/* Sunucudan (veya eski kayıttan) gelen fiş verisini doğrular. Ürün yoksa null döner. */
export const normalizeReceipt = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const store = raw.store && typeof raw.store === 'object' ? raw.store : {};
  const type = STORE_TYPES.includes(store.type) ? store.type : 'diger';
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((it) => it && typeof it === 'object' && (str(it.name) || str(it.raw_name)))
    .slice(0, 100)
    .map((it) => {
      const q = num(it.quantity);
      const quantity = q && q > 0 ? q : 1;
      let unitPrice = num(it.unit_price);
      let lineTotal = num(it.line_total);
      if (lineTotal === null && unitPrice !== null) lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      if (unitPrice === null && lineTotal !== null) unitPrice = Math.round((lineTotal / quantity) * 100) / 100;
      const category = CATEGORIES.includes(it.category) ? it.category : 'diger';
      return {
        raw_name: str(it.raw_name) || str(it.name),
        name: str(it.name) || str(it.raw_name),
        brand: str(it.brand, 40),
        size: str(it.size, 20),
        quantity,
        unit: UNITS.includes(it.unit) ? it.unit : 'adet',
        unit_price: unitPrice,
        line_total: lineTotal,
        category,
        comparable: type === 'market' && !NON_COMPARABLE.includes(category),
      };
    });
  if (!items.length) return null;
  const total = num(raw.total);
  const discount = num(raw.discount_total);
  const priced = items.filter((it) => it.line_total !== null);
  const itemsTotal = priced.length
    ? Math.round((priced.reduce((a, it) => a + it.line_total, 0) - (discount || 0)) * 100) / 100
    : null;
  return {
    store: {
      chain: str(store.chain, 40),
      legal_name: str(store.legal_name, 120),
      type,
      address: str(store.address, 120),
      district: str(store.district, 40),
      city: str(store.city, 40),
    },
    date: typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null,
    time: typeof raw.time === 'string' && /^\d{1,2}:\d{2}$/.test(raw.time) ? raw.time.padStart(5, '0') : null,
    items,
    discount_total: discount,
    total: total !== null && total > 0 ? total : null,
    items_total: itemsTotal,
    totals_match: total !== null && itemsTotal !== null && priced.length === items.length
      ? Math.abs(total - itemsTotal) <= 0.05
      : null,
    payment_method: str(raw.payment_method, 30),
    currency: 'TRY',
  };
};

/* ---------- biçimlendirme ---------- */

// Hermes'te toLocaleString her cihazda Türkçe biçim vermeyebilir; elle biçimlenir: 1.234,50
export const formatTL = (n) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const [int, dec] = Math.abs(Number(n)).toFixed(2).split('.');
  return `${Number(n) < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} TL`;
};

export const formatQty = (q) => {
  const n = Number(q);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
};

// Zincir olmayan işletmede uzun unvan kısaltılır:
// "Mustafa Sarı Isı Yakıt Pet. Ürn. San. Tic. A.Ş." → "Mustafa Sarı Isı Yakıt"
const LEGAL_WORDS = /^(san\.?|sanayi|tic\.?|ticaret|ltd\.?|limited|şti\.?|sti\.?|a\.?ş\.?|as\.?|pet\.?|ürn\.?|urn\.?|paz\.?|pazarlama|ins\.?|inş\.?|ith\.?|ihr\.?|ve|&|gıda\.?|turizm|tur\.?|nak\.?|loj\.?)$/i;
const shortLegalName = (name) => {
  const words = String(name || '').split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (LEGAL_WORDS.test(w)) break;
    out.push(w);
    if (out.join(' ').length >= 28) break;
  }
  return out.join(' ') || String(name || '').slice(0, 28);
};

export const receiptStoreName = (r) => {
  const s = r && r.store;
  if (!s) return 'Mağaza';
  if (s.chain) return s.chain;
  if (s.legal_name) return shortLegalName(s.legal_name);
  return STORE_TYPE_LABELS[s.type] || 'Mağaza';
};

export const receiptStoreType = (r) =>
  STORE_TYPE_LABELS[(r && r.store && r.store.type) || 'diger'] || 'Mağaza';

export const receiptBranch = (r) => {
  if (!r || !r.store) return '';
  const s = r.store;
  const place = [s.district, s.city].filter(Boolean).join(' / ');
  return [s.address, place].filter(Boolean).join(', ');
};

export const receiptDateText = (r) => {
  if (!r || !r.date) return '';
  const [y, m, d] = r.date.split('-');
  return `${d}.${m}.${y}${r.time ? ` ${r.time}` : ''}`;
};

// Aynı fişin iki kez eklenmesini önlemek için.
export const receiptFingerprint = (r) =>
  [receiptStoreName(r), r && r.store && r.store.district, r && r.date, r && r.time, r && r.total]
    .map((x) => String(x == null ? '' : x).toLocaleLowerCase('tr-TR'))
    .join('|');

export const comparableCount = (r) => (r && Array.isArray(r.items) ? r.items.filter((it) => it.comparable).length : 0);

/* ---------- Belgeler'e düşen kayıt ---------- */

export const receiptTitle = (r) => {
  const date = r && r.date ? ` · ${receiptDateText({ date: r.date })}` : '';
  return `${receiptStoreName(r)} fişi${date}`;
};

export const receiptSummary = (r) => {
  const lines = [`Mağaza: ${receiptStoreName(r)} (${receiptStoreType(r)})`];
  const branch = receiptBranch(r);
  if (branch) lines.push(`Şube: ${branch}`);
  const when = receiptDateText(r);
  if (when) lines.push(`Tarih: ${when}`);
  lines.push(`Ürün: ${r.items.length} kalem`);
  if (r.total !== null) lines.push(`Toplam: ${formatTL(r.total)}`);
  if (r.totals_match === false) {
    lines.push(`Not: Ürünlerin toplamı (${formatTL(r.items_total)}) fiş toplamıyla tutmuyor; bazı satırlar okunamamış olabilir.`);
  }
  return lines.join('\n');
};

export const receiptActions = (r) => {
  const actions = ['Ürün adlarını, adetleri ve fiyatları kontrol et.'];
  if (r.totals_match === false) actions.push('Fiş toplamı ürünlerle tutmuyor; fişi daha net bir fotoğrafla yeniden okutabilirsin.');
  const n = comparableCount(r);
  if (n > 0) actions.push(`${n} ürün market fiyat karşılaştırmasına hazır (fiyat verisi bağlanınca açılacak).`);
  return actions;
};

/* Genel belge analizi alanlarıyla uyumlu analiz nesnesi (Belge Detay, görev oluşturma vb. bozulmasın). */
export const receiptAnalysis = (r) => ({
  demo: false,
  createdAt: new Date().toISOString(),
  summary: receiptSummary(r),
  actions: receiptActions(r),
  document_type: 'Alışveriş fişi',
  title: receiptTitle(r),
  product_name: r.items.slice(0, 5).map((it) => it.name).join(', ') + (r.items.length > 5 ? '…' : ''),
  date: r.date,
  purchase_date: r.date,
  amount: r.total,
  currency: 'TL',
  payment_deadline: null,
  return_period: null,
  warranty_period: null,
  important_deadline: null,
  required_action: null,
  urgency: 'low',
  receipt: r,
});

export const isReceiptDoc = (doc) => Boolean(doc && doc.analysis && doc.analysis.receipt && Array.isArray(doc.analysis.receipt.items));

// En yeni fiş en başta.
export const receiptDocsOf = (documents) =>
  (Array.isArray(documents) ? documents : [])
    .filter(isReceiptDoc)
    .sort((a, b) => {
      const ka = `${a.analysis.receipt.date || ''} ${a.analysis.receipt.time || ''} ${a.createdAt || ''}`;
      const kb = `${b.analysis.receipt.date || ''} ${b.analysis.receipt.time || ''} ${b.createdAt || ''}`;
      return kb.localeCompare(ka);
    });

/* ---------- yapay zekâya giden kısa biçim (sunucu boyut sınırına takılmasın) ---------- */

const compactReceipt = (r) => ({
  store: receiptStoreName(r),
  store_type: r.store.type,
  branch: receiptBranch(r) || null,
  date: r.date,
  time: r.time,
  total: r.total,
  totals_match: r.totals_match,
  items: r.items.slice(0, 60).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    line_total: it.line_total,
    category: it.category,
    size: it.size,
  })),
});

// PLAN AI / Fırsat Motoru'na giden belge: fişin özeti tekrar edilmez, ürünler kısa biçimde gider.
export const docForAi = (doc) => {
  if (!isReceiptDoc(doc)) return doc;
  const { receipt, summary, actions, ...rest } = doc.analysis;
  return { ...doc, analysis: { ...rest, receipt: compactReceipt(receipt) } };
};

export const shoppingContextForAi = (items, documents) => {
  const list = (Array.isArray(items) ? items : []).slice(0, 60).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    checked: Boolean(it.checked),
    last_price: it.lastPrice ?? null,
    last_store: it.lastStore ?? null,
  }));
  const receipts = receiptDocsOf(documents).slice(0, 5).map((d) => {
    const r = d.analysis.receipt;
    return { store: receiptStoreName(r), date: r.date, total: r.total, item_count: r.items.length };
  });
  return { list, recent_receipts: receipts };
};

/* ---------- alışveriş listesine ekleme ---------- */

// Fişteki ürünleri listeye ekler; listede zaten olan ürünün yalnızca son fiyatı/mağazası güncellenir.
export const mergeReceiptIntoList = (current, r, makeId) => {
  const list = Array.isArray(current) ? [...current] : [];
  const keyOf = (name) => String(name || '').toLocaleLowerCase('tr-TR').trim();
  const index = new Map(list.map((it, i) => [keyOf(it.name), i]));
  const storeName = receiptStoreName(r);
  let added = 0;
  r.items.forEach((it, i) => {
    if (NOT_FOR_LIST.includes(it.category)) return;
    const key = keyOf(it.name);
    const info = {
      lastPrice: it.unit_price,
      lastStore: storeName,
      lastDate: r.date,
      category: it.category,
      comparable: it.comparable,
      size: it.size,
    };
    if (index.has(key)) {
      const pos = index.get(key);
      list[pos] = { ...list[pos], ...info };
    } else {
      index.set(key, list.length);
      list.push({
        id: makeId(i),
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        checked: false,
        source: 'receipt',
        estimatedPrice: null,
        ...info,
      });
      added += 1;
    }
  });
  return { items: list, added };
};

/* ---------- sunucu sınırına sığdırma ---------- */

// Sunucu en fazla 50 belge ve ~60.000 karakter kabul eder. En yeniler önce olacak şekilde sığdırılır.
export const fitDocsForAi = (docs, maxCount = 45, maxChars = 55000) => {
  const stamp = (d) => Date.parse(d.updatedAt || d.createdAt || '') || 0;
  const sorted = [...(Array.isArray(docs) ? docs : [])].sort((a, b) => stamp(b) - stamp(a));
  const out = [];
  let size = 2;
  for (const d of sorted) {
    if (out.length >= maxCount) break;
    let len = 0;
    try { len = JSON.stringify(d).length + 1; } catch (e) { continue; }
    if (size + len > maxChars) continue;
    out.push(d);
    size += len;
  }
  return out;
};

// Soru alışverişle ilgiliyse (fiş, market, harcama, fiyat...) PLAN AI'ya son fişler mutlaka gönderilir.
const SHOPPING_WORDS = /(fiş|fis|market|alışveriş|alisveris|aldım|aldim|aldığım|harca|fiyat|ürün|urun|bim|a101|şok|migros|carrefour|hakmar|ekmek|liste|receipt|grocery|shopping)/i;
export const isShoppingQuestion = (q) => SHOPPING_WORDS.test(String(q || ''));
