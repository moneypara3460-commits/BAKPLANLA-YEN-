/*
===========================================================
  BAKPLANLA — Profil / "Planım" form doğrulayıcıları
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.

  Burada doğrulanan tercihler (şehir/semt, bütçe, kişi sayısı) "Bugün Ne Yapsak?" ekranıyla
  aynı veridir (todayPreferences); ayrı bir kopya tutulmaz. Bulut yedeğine zaten dahildir.
  Görünen ad doğrulaması helpers.js içindeki validateDisplayName ile yapılır.
===========================================================
*/

export const LOCATION_MAX = 60;
export const BUDGET_MAX_DIGITS = 7;
export const PEOPLE_VALUES = ['1', '2', '3', '4', '5+'];

const collapse = (raw) => String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();

// Şehir/semt isteğe bağlıdır; boş olabilir. HTML ayraçları ve kontrol karakterleri reddedilir.
export const validateLocation = (raw) => {
  const value = collapse(raw);
  if (value.length > LOCATION_MAX) return { ok: false, reason: 'long', value };
  if (/[<>]/.test(value) || /[\u0000-\u001F\u007F]/.test(value)) return { ok: false, reason: 'chars', value };
  return { ok: true, value };
};

// Bütçe isteğe bağlıdır; yalnızca rakam. Baştaki sıfırlar atılır, "0" ya da boş değer "" olur.
export const validateBudget = (raw) => {
  const text = collapse(raw);
  if (!text) return { ok: true, value: '' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'chars', value: text };
  const value = text.replace(/^0+/, '');
  if (value.length > BUDGET_MAX_DIGITS) return { ok: false, reason: 'long', value };
  return { ok: true, value };
};

export const validatePeopleCount = (raw) => {
  const value = collapse(raw);
  if (!PEOPLE_VALUES.includes(value)) return { ok: false, reason: 'invalid', value };
  return { ok: true, value };
};

// Sonuç: { ok, value?, errors } — errors alan adına göre neden kodu içerir.
export const validatePlanPrefs = (input) => {
  const src = input && typeof input === 'object' ? input : {};
  const loc = validateLocation(src.location);
  const bud = validateBudget(src.budget);
  const ppl = validatePeopleCount(src.peopleCount);
  const errors = {};
  if (!loc.ok) errors.location = loc.reason;
  if (!bud.ok) errors.budget = bud.reason;
  if (!ppl.ok) errors.peopleCount = ppl.reason;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors, value: { location: loc.value, budget: bud.value, peopleCount: ppl.value } };
};

// Kayıtlı tercihlerle yeni değerler aynı mı? (gereksiz yazmayı önlemek için)
export const arePlanPrefsEqual = (a, b) => {
  const left = a && typeof a === 'object' ? a : {};
  const right = b && typeof b === 'object' ? b : {};
  return (
    collapse(left.location) === collapse(right.location) &&
    collapse(left.budget) === collapse(right.budget) &&
    collapse(left.peopleCount) === collapse(right.peopleCount)
  );
};

// Hesabın oluşturulma tarihi (Supabase user.created_at). Geçersizse boş döner.
export const formatMemberSince = (iso, lang) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : lang === 'ar' ? 'ar' : 'tr-TR';
  try {
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (error) {
    return d.toISOString().slice(0, 10);
  }
};
