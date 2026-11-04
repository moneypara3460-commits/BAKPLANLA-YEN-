/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — MESLEK PASAPORTU (saf JavaScript, React Native bağımlılığı yok → Node ile test edilir)

  Yeni senaryo (24 Ekim):
  - BAKPLANLA iş ilanı yayınlamaz, başvuru almaz, aday ile işvereni eşleştirmez.
  - Kullanıcının PUSULA sonucu, Meslek Provası puanları ve İş Başı rozetleri tek sayfalık
    bir "meslek pasaportu"nda toplanır. Pasaportu kullanıcı istediği kişiye KENDİSİ gösterir/gönderir.
  - Hiçbir veri sunucuya gönderilmez; her şey cihazdaki kayıtlardan hazırlanır.
===========================================================
*/
import { AREAS, scoreCompass } from './compass';
import { PROFESSIONS, professionByKey, professionName, matchProfessions, normalizeProvaProgress } from './meslekProvasi';
import { ROLES, roleLevels, roleLevelInfo, normalizeProgress } from './isbasi';
import { playerLevel, achievementById, ACHIEVEMENT_IDS } from './isbasiCareer';
import { pickByLang, toArabic } from './arabic';

const pickL = (lang, o) => (o ? (pickByLang(o, lang) || '') : '');
const areaName = (key, lang) => {
  const a = AREAS.find((x) => x.key === key);
  return a ? `${a.icon} ${pickByLang(a, lang)}` : key;
};
const roleName = (key, lang) => (ROLES[key] ? pickByLang(ROLES[key], lang) : key);

/*
  Girdi:
    compass   : AsyncStorage'daki PUSULA kaydı ({ answers }) ya da null
    prova     : Meslek Provası ilerlemesi ya da null
    isbasi    : İş Başı ilerlemesi (önce sunucuda doğrulanmış önbellek, yoksa cihazdaki) ya da null
    verified  : isbasi sunucuda doğrulanmış kayıttan mı geldi
  Çıktı: ekranda ve paylaşılan metinde kullanılan düz nesne.
*/
export const buildPassport = ({ compass = null, prova = null, isbasi = null, verified = false } = {}) => {
  // PUSULA
  const scored = compass && compass.answers ? scoreCompass(compass.answers) : null;
  const compassOk = !!(scored && scored.ok);
  const topAreas = compassOk ? scored.ranked.slice(0, 3) : [];
  const best = compassOk ? (matchProfessions(scored.scores)[0] || null) : null;

  // Meslek Provası
  const pr = normalizeProvaProgress(prova);
  const provaJobs = Object.entries(pr.jobs)
    .filter(([, j]) => j.plays > 0)
    .map(([key, j]) => {
      const p = professionByKey(key);
      const max = p ? p.scenes.length * 2 : 0;
      return { key, icon: p ? p.icon : '💼', stars: j.bestStars, points: j.bestPoints, max, plays: j.plays, last: j.last };
    })
    .sort((a, b) => b.stars - a.stars || b.points - a.points || a.key.localeCompare(b.key));

  // İş Başı (Barista, Kasiyer, Reyon Görevlisi)
  const ib = normalizeProgress(isbasi);
  const isbasiRoles = Object.keys(ib.roles)
    .map((key) => {
      const r = ib.roles[key];
      const starLevels = Object.keys(r.bestStars).map(Number).filter((l) => r.bestStars[l] >= 2);
      const topLevel = starLevels.length ? Math.max(...starLevels) : 0; // en az 2 yıldızla geçilen en yüksek seviye
      return {
        key,
        icon: ROLES[key] ? ROLES[key].icon : '💼',
        shifts: r.shifts,
        topLevel,
        maxLevel: roleLevels(key).length,
        bestStars: Math.max(0, ...Object.values(r.bestStars)),
        levelInfo: topLevel ? roleLevelInfo(key, topLevel) : null,
      };
    })
    .filter((r) => r.shifts > 0);
  const career = ib.career;
  const achievements = ACHIEVEMENT_IDS.filter((id) => career.achievements[id]).map((id) => achievementById(id));
  const player = playerLevel(career.xp);

  const empty = !compassOk && provaJobs.length === 0 && isbasiRoles.length === 0;
  return {
    empty,
    compassOk,
    topAreas,
    best,
    provaJobs,
    provaTotal: PROFESSIONS.length,
    isbasiRoles,
    isbasiVerified: !!verified && isbasiRoles.length > 0,
    achievements,
    player,
    xp: career.xp + pr.xp,
  };
};

const starText = (n) => '★'.repeat(Math.max(0, Math.min(3, n))) + '☆'.repeat(3 - Math.max(0, Math.min(3, n)));

/* Paylaşılacak düz metin (WhatsApp, e-posta vb.). Kullanıcı kendisi gönderir. */
export const passportText = (p, { name = '', dateISO = '', lang = 'tr' } = {}) => {
  const T = (tr, en, de) => (lang === 'en' ? en : lang === 'de' ? de : lang === 'ar' ? toArabic(en) : tr);
  const lines = [];
  lines.push(T('BAKPLANLA — MESLEK PASAPORTU', 'BAKPLANLA — CAREER PASSPORT', 'BAKPLANLA — BERUFSPASS'));
  if (name) lines.push(`${T('Ad', 'Name', 'Name')}: ${name}`);
  if (dateISO) lines.push(`${T('Tarih', 'Date', 'Datum')}: ${dateISO}`);
  lines.push('');

  if (p.compassOk) {
    lines.push(T('PUSULA — öne çıkan ilgi alanları', 'COMPASS — top interests', 'KOMPASS — stärkste Interessen'));
    p.topAreas.forEach((a, i) => lines.push(`${i + 1}. ${areaName(a.key, lang)} — ${a.score}/100`));
    if (p.best) {
      const job = professionByKey(p.best.key);
      lines.push(`${T('En yakın meslek', 'Closest job', 'Passendster Beruf')}: ${job ? `${job.icon} ${professionName(job, lang)}` : p.best.key} (%${p.best.match})`);
    }
    lines.push('');
  }

  if (p.provaJobs.length) {
    lines.push(T(`MESLEK PROVASI — ${p.provaJobs.length}/${p.provaTotal} meslek denendi`, `JOB REHEARSAL — ${p.provaJobs.length}/${p.provaTotal} jobs tried`, `BERUFSPROBE — ${p.provaJobs.length}/${p.provaTotal} Berufe getestet`));
    p.provaJobs.slice(0, 10).forEach((j) => {
      const job = professionByKey(j.key);
      lines.push(`${j.icon} ${job ? professionName(job, lang) : j.key}: ${starText(j.stars)} (${j.points}/${j.max} ${T('puan', 'pts', 'Pkt.')})`);
    });
    if (p.provaJobs.length > 10) lines.push(T(`+${p.provaJobs.length - 10} meslek daha`, `+${p.provaJobs.length - 10} more`, `+${p.provaJobs.length - 10} weitere`));
    lines.push('');
  }

  if (p.isbasiRoles.length) {
    lines.push(T('İŞ BAŞI — meslek simülasyonu', 'ON THE JOB — job simulation', 'IM JOB — Berufssimulation'));
    p.isbasiRoles.forEach((r) => {
      const lvl = r.topLevel ? `${T('Seviye', 'Level', 'Stufe')} ${r.topLevel}/${r.maxLevel}` : T('seviye henüz geçilmedi', 'no level passed yet', 'noch keine Stufe');
      lines.push(`${r.icon} ${roleName(r.key, lang)}: ${lvl}, ${starText(r.bestStars)}, ${r.shifts} ${T('vardiya', 'shifts', 'Schichten')}`);
    });
    if (p.achievements.length) {
      lines.push(`${T('Başarımlar', 'Achievements', 'Erfolge')}: ${p.achievements.map((a) => `${a.icon} ${pickL(lang, { tr: a.tr[0], en: a.en[0], de: a.de[0] })}`).join(', ')}`);
    }
    lines.push(`${T('Oyuncu seviyesi', 'Player level', 'Spielerstufe')}: ${p.player.level} (${pickL(lang, p.player.title)})`);
    lines.push('');
  }

  lines.push(T(
    'Not: Bu pasaport BAKPLANLA uygulamasındaki meslek tanıtım oyunlarından ve ilgi testinden hazırlanmıştır. Resmî sertifika, diploma ya da mesleki yeterlilik belgesi değildir.',
    'Note: This passport is generated from career-discovery games and an interest test in the BAKPLANLA app. It is not an official certificate, diploma or professional qualification.',
    'Hinweis: Dieser Pass stammt aus Berufs-Entdeckungsspielen und einem Interessentest in der BAKPLANLA-App. Er ist kein offizielles Zertifikat und kein Berufsnachweis.'
  ));
  return lines.join('\n');
};
