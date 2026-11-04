/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — İŞLETME TANITIM KARTLARI (saf JavaScript)

  Burada yalnızca anlaşmalı işletmelerin TANITIMI durur:
  ad, sektör, şehir, kısa tanıtım ve işletmenin KENDİ kariyer sayfasının bağlantısı.
  BAKPLANLA ilan yayınlamaz, başvuru almaz, adayları işletmeye göstermez, eşleştirme yapmaz.
  Başvuru (varsa) tamamen işletmenin kendi sitesinde, kullanıcının kendisi tarafından yapılır.

  Yeni işletme eklemek için ISLETMELER listesine şu biçimde bir satır ekle:
  {
    id: 'ornek-kafe',                    // benzersiz, küçük harf
    ad: 'Örnek Kafe',
    sektor: { tr: 'Kafe', en: 'Café', de: 'Café' },
    sehir: 'İstanbul',
    tanitim: { tr: '...', en: '...', de: '...' },
    meslekler: ['barista', 'garson'],    // meslekIcerik.js / isbasi.js anahtarları (isteğe bağlı)
    url: 'https://...',                  // işletmenin kendi sitesi / kariyer sayfası (http veya https)
    baglanti: 'site',                    // 'site' ya da 'kariyer' (düğme yazısı buna göre)
    adres: '...', haritaUrl: 'https://www.google.com/maps/search/?api=1&query=...',   // isteğe bağlı
    indirim: { partnerId: '...', baslik: { tr, en, de }, saat: '10:00–22:00' }       // isteğe bağlı; sunucuda bakplanla_partners satırı olmalı
    demo: false,                         // gerçek değilse true → kartta DEMO yazar
  }
  Yalnızca izni alınmış gerçek işletmeler eklenir (sahte işletme gösterilmez).
===========================================================
*/

import { pickByLang } from './arabic';

export const ISLETMELER = [
  {
    // 24 Ekim: işletme sahibi telefonda adının oyunda ve resmî sitesinin reklam amaçlı kullanılmasına izin verdi.
    // Ücret/sponsorluk yok. Sitenin HTTPS sürümü yok (https → http yönlendiriyor), bu yüzden http bağlantısı.
    id: 'cucci-bruschetta',
    ad: 'Cucci Bruschetta',
    sektor: { tr: 'Restoran / Kafe', en: 'Restaurant / Café', de: 'Restaurant / Café' },
    sehir: 'Sultangazi / İstanbul',
    adres: 'Vega İstanbul AVM, Yunus Emre Mah. Lütfi Aykaç Bulvarı No: 80-1, İç Kapı No: 228, 34260 Sultangazi/İstanbul',
    haritaUrl: 'https://www.google.com/maps/search/?api=1&query=Cucci+Bruschetta+Vega+%C4%B0stanbul+AVM+Sultangazi',
    // 24 Ekim anlaşması: BAKPLANLA kullanıcılarına tüm kahvelerde %10, günde 1 kez, 10:00–22:00 (Türkiye saati).
    // Kod üretimi/kasada kullanım sunucuda: supabase/migrations/20261024_07_isletme_indirim.sql
    indirim: {
      partnerId: 'cucci-bruschetta',
      baslik: { tr: 'Tüm kahvelerde %10 indirim', en: '10% off all coffees', de: '10 % auf alle Kaffees' },
      saat: '10:00–22:00',
    },
    tanitim: {
      tr: 'BAKPLANLA\'nın ilk anlaşmalı işletmesi. İş Başı\'ndaki kafe ve restoran oyunları Cucci Bruschetta adıyla oynanır.',
      en: 'BAKPLANLA\'s first partner business. The café and restaurant games in On the Job carry the Cucci Bruschetta name.',
      de: 'Der erste Partnerbetrieb von BAKPLANLA. Die Café- und Restaurantspiele in Im Job tragen den Namen Cucci Bruschetta.',
    },
    meslekler: ['barista', 'garson', 'asci'],
    url: 'https://gncmenu.com/cucci-bruschetta/',
    baglanti: 'site', // 'site' = resmî web sitesi, 'kariyer' = kariyer sayfası
    demo: false,
  },
];

const isHttps = (url) => typeof url === 'string' && /^https:\/\/[^\s/$.?#][^\s]*$/i.test(url.trim());
// Yalnızca http/https web adresleri açılır (javascript:, tel:, dosya vb. engellenir).
const isWebUrl = (url) => typeof url === 'string' && /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url.trim());
export const isletmeUrl = (b) => (b ? (b.url || b.kariyerUrl || '') : '');

// Hatalı satırları ekrana hiç çıkarmaz (eksik ad, https olmayan bağlantı vb.).
export const validIsletmeler = (list = ISLETMELER) =>
  (Array.isArray(list) ? list : []).filter((b) => b
    && typeof b.id === 'string' && b.id
    && typeof b.ad === 'string' && b.ad.trim()
    && isWebUrl(isletmeUrl(b)));

export const isletmeText = (obj, lang = 'tr') => {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return pickByLang(obj, lang) || '';
};

export { isHttps, isWebUrl };
