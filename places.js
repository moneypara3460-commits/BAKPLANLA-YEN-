/*
===========================================================
  BAKPLANLA — "Bugün Ne Yapsak?" için mesafe, ulaşım süresi ve bütçe hesapları
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.

  ÖNEMLİ DÜRÜSTLÜK NOTLARI (kullanıcıya da böyle gösterilir):
  - Mesafe KUŞ UÇUŞUDUR (iki nokta arası düz çizgi). Gerçek yol/trafik bilgisi değildir.
  - Süre, kuş uçuşu mesafeden ortalama hızlarla TAHMİN edilir. Gerçek rota servisi bağlı değildir.
  - Mekan fiyatı harita verisinde bulunmaz. Bütçe uyumu, KATEGORİ ORTALAMASINA göre tahmindir;
    mekanın gerçek fiyatı değildir. Rakamlar aşağıdaki tablodan değiştirilebilir.
===========================================================
*/

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

export const isValidCoord = (point) =>
  !!point &&
  Number.isFinite(Number(point.latitude)) &&
  Number.isFinite(Number(point.longitude)) &&
  Math.abs(Number(point.latitude)) <= 90 &&
  Math.abs(Number(point.longitude)) <= 180;

// İki koordinat arası kuş uçuşu mesafe (km). Geçersiz girdide null.
export const haversineKm = (a, b) => {
  if (!isValidCoord(a) || !isValidCoord(b)) return null;
  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLon = toRad(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(Number(b.latitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/* ---------- ulaşım süresi (tahmin) ---------- */

// Şehir içi ortalama hızlar (km/s) ve sabit bekleme süresi (dk). Kuş uçuşu mesafe yol mesafesine
// ROAD_FACTOR ile çevrilir. Bunlar tahmindir; gerçek trafik/rota verisi değildir.
export const ROAD_FACTOR = 1.3;
export const TRAVEL_MODEL = {
  walk: { speedKmh: 4.8, waitMin: 0 },
  public: { speedKmh: 20, waitMin: 8 },
  car: { speedKmh: 28, waitMin: 0 },
  taxi: { speedKmh: 28, waitMin: 4 },
};

export const estimateTravelMinutes = (transport, km) => {
  if (!Number.isFinite(km) || km < 0) return null;
  const model = TRAVEL_MODEL[transport] || TRAVEL_MODEL.car;
  const minutes = ((km * ROAD_FACTOR) / model.speedKmh) * 60 + model.waitMin;
  return Math.max(1, Math.round(minutes));
};

export const formatDistance = (km, lang = 'tr') => {
  if (!Number.isFinite(km)) return null;
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  const text = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return lang === 'ar' ? `${text} كم` : `${lang === 'en' ? text : text.replace('.', ',')} km`;
};

export const formatDuration = (minutes, lang = 'tr') => {
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${minutes} ${lang === 'de' ? 'Min.' : lang === 'en' ? 'min' : lang === 'ar' ? 'د' : 'dk'}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hUnit = lang === 'de' ? 'Std.' : lang === 'en' ? 'h' : lang === 'ar' ? 'س' : 'sa';
  const mUnit = lang === 'de' ? 'Min.' : lang === 'en' ? 'min' : lang === 'ar' ? 'د' : 'dk';
  return m ? `${h} ${hUnit} ${m} ${mUnit}` : `${h} ${hUnit}`;
};

/* ---------- bütçe (kategori ortalamasına göre tahmin) ---------- */

// Kişi başı yaklaşık harcama aralığı (TL). GÜNCEL FİYAT DEĞİLDİR; zaman zaman gözden geçirilmelidir.
export const CATEGORY_COST_TL = {
  restaurant: { min: 350, max: 900 },
  cafe: { min: 120, max: 300 },
  cinema: { min: 200, max: 400 },
  bar: { min: 300, max: 800 },
  activity: { min: 200, max: 600 },
  park: { min: 0, max: 100 },
};

export const parseBudget = (raw) => {
  const n = Number(String(raw == null ? '' : raw).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const parsePeople = (raw) => {
  const n = parseInt(String(raw == null ? '' : raw).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

// Girilen bütçe toplam (grup) bütçesi kabul edilir; kişi başına bölünür.
export const perPersonBudget = (budget, people) => {
  const b = parseBudget(budget);
  if (!b) return 0;
  return b / parsePeople(people);
};

// 'fits' = üst sınıra sığıyor, 'tight' = alt sınıra yetiyor ama üst sınıra yetmiyor,
// 'over' = alt sınıra bile yetmiyor, 'unknown' = bütçe girilmemiş ya da kategori bilinmiyor.
export const budgetFit = (category, perPerson) => {
  const range = CATEGORY_COST_TL[category];
  if (!range || !(perPerson > 0)) return 'unknown';
  if (perPerson >= range.max) return 'fits';
  if (perPerson >= range.min) return 'tight';
  return 'over';
};

const FIT_RANK = { fits: 0, tight: 1, unknown: 2, over: 3 };

/* ---------- sonuçları zenginleştirme / sıralama / filtre ---------- */

/*
  places: sunucudan gelen mekan listesi (latitude/longitude içerebilir).
  origin: { latitude, longitude, kind: 'device' | 'center' } ya da null.
  Her mekana distanceKm, minutes, fit eklenir. Orijinal alanlar korunur.
*/
export const enrichPlaces = (places, { origin, transport, category, budget, people } = {}) => {
  const perPerson = perPersonBudget(budget, people);
  const fit = budgetFit(category, perPerson);
  return (Array.isArray(places) ? places : []).map((p) => {
    const km = origin && isValidCoord(origin) ? haversineKm(origin, p) : null;
    return {
      ...p,
      distanceKm: km,
      minutes: km == null ? null : estimateTravelMinutes(transport, km),
      originKind: km == null ? null : origin.kind || 'device',
      fit,
    };
  });
};

// Mesafeye göre (yakından uzağa) sıralar; mesafesi bilinmeyenler sona gider. Sıra kararlıdır.
export const sortByDistance = (list) =>
  list
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const a = x.item.distanceKm;
      const b = y.item.distanceKm;
      if (a == null && b == null) return x.index - y.index;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b || x.index - y.index;
    })
    .map((x) => x.item);

/*
  Bütçe filtresi: bütçeye hiç yetmeyen ('over') kategoriler gizlenir.
  Filtre sonucu boş kalırsa listeyi BOŞALTMAZ; tümünü döndürür ve relaxed=true işaretler
  (ekran bunu kullanıcıya açıkça söyler).
*/
export const applyBudgetFilter = (list, enabled) => {
  if (!enabled) return { list, hidden: 0, relaxed: false };
  const kept = list.filter((p) => p.fit !== 'over');
  if (kept.length === 0 && list.length > 0) return { list, hidden: 0, relaxed: true };
  return { list: kept, hidden: list.length - kept.length, relaxed: false };
};

export const rankByFitThenDistance = (list) =>
  list
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const f = (FIT_RANK[x.item.fit] ?? 2) - (FIT_RANK[y.item.fit] ?? 2);
      if (f) return f;
      const a = x.item.distanceKm;
      const b = y.item.distanceKm;
      if (a == null && b == null) return x.index - y.index;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b || x.index - y.index;
    })
    .map((x) => x.item);

// Sunucunun (varsa) döndürdüğü arama merkezi: { center: { latitude, longitude } } / { center: { lat, lng } }.
export const readCenterFromResponse = (data) => {
  const c = data && (data.center || data.origin);
  if (!c || typeof c !== 'object') return null;
  const point = {
    latitude: Number(c.latitude ?? c.lat),
    longitude: Number(c.longitude ?? c.lng ?? c.lon),
  };
  return isValidCoord(point) ? { ...point, kind: 'center' } : null;
};
