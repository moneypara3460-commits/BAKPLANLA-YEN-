/*
===========================================================
  BAKPLANLA — PUSULA / Mesleğini Keşfet
  Saf JavaScript (React Native bağımlılığı yok) → Node ile test edilebilir.

  Kısa bir ilgi anketidir. Cevaplar CİHAZDA işlenir; sunucuya ya da yapay zekâya gönderilmez,
  bu yüzden internet gerekmez ve ücretsiz kullanım hakkı harcanmaz.

  DÜRÜSTLÜK NOTU: Bu bir meslek TAVSİYESİ ya da yetenek testi değildir; yalnızca kişinin
  ilgi alanlarını altı başlıkta toplayıp hangi alanlara yakın durduğunu gösterir.
  Ekranda da bu açıkça yazar.
===========================================================
*/

import { pickByLang } from './arabic';

export const COMPASS_KEY = 'PLAN_COMPASS_RESULT';

// Altı ilgi alanı (yaygın kullanılan RIASEC çerçevesinin sade bir uyarlaması).
export const AREAS = [
  { key: 'yapici', icon: '🔧', tr: 'Yapıcı', en: 'Builder', de: 'Praktisch' },
  { key: 'arastirmaci', icon: '🔬', tr: 'Araştırmacı', en: 'Investigator', de: 'Forschend' },
  { key: 'sanatsal', icon: '🎨', tr: 'Sanatsal', en: 'Creative', de: 'Kreativ' },
  { key: 'sosyal', icon: '🤝', tr: 'Sosyal', en: 'Social', de: 'Sozial' },
  { key: 'girisimci', icon: '🚀', tr: 'Girişimci', en: 'Enterprising', de: 'Unternehmerisch' },
  { key: 'duzenli', icon: '📊', tr: 'Düzenli', en: 'Organised', de: 'Strukturiert' },
];

export const AREA_KEYS = AREAS.map((a) => a.key);

// Her alan için 6 soru (toplam 36). Sorular 1–5 arası puanlanır.
export const QUESTIONS = [
  { id: 'q1', area: 'yapici', tr: 'Bozulan bir eşyayı kendim tamir etmeyi denerim.', en: 'I try to repair broken things myself.', de: 'Ich repariere kaputte Dinge gern selbst.' },
  { id: 'q2', area: 'yapici', tr: 'Elimle bir şeyler üretmek (montaj, tamir, yapım) hoşuma gider.', en: 'I enjoy making things with my hands.', de: 'Ich arbeite gern mit meinen Händen.' },
  { id: 'q3', area: 'yapici', tr: 'Açık havada ya da sahada çalışmayı masa başına tercih ederim.', en: 'I prefer working outdoors or on site to a desk.', de: 'Ich arbeite lieber draußen als am Schreibtisch.' },

  { id: 'q4', area: 'arastirmaci', tr: 'Bir konunun nedenini anlayana kadar araştırmayı severim.', en: 'I like digging into a topic until I understand why.', de: 'Ich forsche gern, bis ich das Warum verstehe.' },
  { id: 'q5', area: 'arastirmaci', tr: 'Sayılarla, verilerle ya da deneylerle uğraşmak ilgimi çeker.', en: 'Working with numbers, data or experiments interests me.', de: 'Zahlen, Daten und Experimente interessieren mich.' },
  { id: 'q6', area: 'arastirmaci', tr: 'Karmaşık bir bulmacayı çözmek bana keyif verir.', en: 'Solving a complex puzzle is satisfying for me.', de: 'Knifflige Rätsel zu lösen macht mir Freude.' },

  { id: 'q7', area: 'sanatsal', tr: 'Yazmak, çizmek, müzik ya da tasarım yapmak bana iyi gelir.', en: 'Writing, drawing, music or design feels good to me.', de: 'Schreiben, Zeichnen, Musik oder Design tun mir gut.' },
  { id: 'q8', area: 'sanatsal', tr: 'İşleri kendi tarzımda yapabildiğimde daha verimli olurum.', en: 'I work better when I can do things in my own style.', de: 'Ich arbeite besser, wenn ich meinen eigenen Stil einbringen kann.' },
  { id: 'q9', area: 'sanatsal', tr: 'Yeni fikirler üretmek, kurallara uymaktan daha çok hoşuma gider.', en: 'I enjoy coming up with new ideas more than following rules.', de: 'Neue Ideen reizen mich mehr als Regeln zu befolgen.' },

  { id: 'q10', area: 'sosyal', tr: 'İnsanlara bir şey öğretmek ya da yardım etmek beni mutlu eder.', en: 'Teaching or helping people makes me happy.', de: 'Menschen zu helfen oder zu unterrichten macht mich glücklich.' },
  { id: 'q11', area: 'sosyal', tr: 'Bir grupta çalışmak, tek başıma çalışmaktan daha keyifli.', en: 'I enjoy working in a group more than working alone.', de: 'Ich arbeite lieber im Team als allein.' },
  { id: 'q12', area: 'sosyal', tr: 'Tartışmalarda insanları anlamaya ve uzlaştırmaya çalışırım.', en: 'In disagreements I try to understand people and find common ground.', de: 'Bei Streit versuche ich zu vermitteln.' },

  { id: 'q13', area: 'girisimci', tr: 'Bir işi başlatıp başkalarını da peşimden sürüklemek bana uyar.', en: 'Starting something and getting others on board suits me.', de: 'Etwas anzustoßen und andere mitzunehmen liegt mir.' },
  { id: 'q14', area: 'girisimci', tr: 'İkna etmek, pazarlık yapmak ya da satış yapmak ilgimi çeker.', en: 'Persuading, negotiating or selling interests me.', de: 'Überzeugen, Verhandeln oder Verkaufen reizt mich.' },
  { id: 'q15', area: 'girisimci', tr: 'Risk alıp kendi işimi kurmayı düşünürüm.', en: 'I think about taking a risk and starting my own business.', de: 'Ich denke daran, ein eigenes Unternehmen zu gründen.' },

  { id: 'q16', area: 'duzenli', tr: 'Planlı, düzenli ve belli kuralları olan işlerde rahat ederim.', en: 'I am comfortable with planned, orderly work with clear rules.', de: 'Geplante, geordnete Arbeit mit klaren Regeln liegt mir.' },
  { id: 'q17', area: 'duzenli', tr: 'Listeler, tablolar ve kayıt tutmak işimi kolaylaştırır.', en: 'Lists, tables and records make my work easier.', de: 'Listen, Tabellen und Aufzeichnungen helfen mir.' },
  { id: 'q18', area: 'duzenli', tr: 'Ayrıntıdaki hataları fark etmekte iyiyimdir.', en: 'I am good at noticing mistakes in the details.', de: 'Ich entdecke Fehler im Detail gut.' },

  // 2. bölüm: her alana 3 soru daha (aynı biçim). Eski 18 soru ve kimlikleri değişmedi.
  { id: 'q19', area: 'yapici', tr: 'Bir aletin ya da makinenin nasıl çalıştığını kurcalayarak öğrenirim.', en: 'I learn how a tool or machine works by tinkering with it.', de: 'Ich lerne, wie Geräte funktionieren, indem ich sie ausprobiere.' },
  { id: 'q20', area: 'yapici', tr: 'Gün sonunda elle tutulur bir iş ortaya çıkarmak beni tatmin eder.', en: 'Ending the day with something tangible satisfies me.', de: 'Am Ende des Tages etwas Greifbares geschafft zu haben, befriedigt mich.' },
  { id: 'q21', area: 'yapici', tr: 'Fiziksel olarak hareketli bir işte çalışmak bana uyar.', en: 'A physically active job suits me.', de: 'Eine körperlich aktive Arbeit passt zu mir.' },

  { id: 'q22', area: 'arastirmaci', tr: 'Bir şeyi kabul etmeden önce kanıtını görmek isterim.', en: 'I want to see evidence before I accept something.', de: 'Bevor ich etwas glaube, will ich Belege sehen.' },
  { id: 'q23', area: 'arastirmaci', tr: 'Bilim, teknoloji ya da sağlıkla ilgili yazılar okumak hoşuma gider.', en: 'I enjoy reading about science, technology or health.', de: 'Ich lese gern über Wissenschaft, Technik oder Gesundheit.' },
  { id: 'q24', area: 'arastirmaci', tr: 'Bir sorunu adım adım analiz ederek çözmeyi severim.', en: 'I like solving a problem by analysing it step by step.', de: 'Ich löse Probleme gern Schritt für Schritt.' },

  { id: 'q25', area: 'sanatsal', tr: 'Renklere, şekillere ve görünüşe herkesten çok dikkat ederim.', en: 'I pay more attention to colours, shapes and looks than most people.', de: 'Ich achte mehr als andere auf Farben, Formen und Aussehen.' },
  { id: 'q26', area: 'sanatsal', tr: 'Sıradan bir şeyi daha güzel ya da ilginç hâle getirmeyi severim.', en: 'I like making ordinary things more beautiful or interesting.', de: 'Ich mache Alltägliches gern schöner oder interessanter.' },
  { id: 'q27', area: 'sanatsal', tr: 'Kendimi bir eserle (fotoğraf, video, yazı, çizim) ifade etmek isterim.', en: 'I want to express myself through a creation (photo, video, writing, drawing).', de: 'Ich drücke mich gern durch ein Werk aus (Foto, Video, Text, Zeichnung).' },

  { id: 'q28', area: 'sosyal', tr: 'İnsanlar dertlerini anlatmak için genellikle bana gelir.', en: 'People usually come to me to talk about their problems.', de: 'Andere kommen oft mit ihren Sorgen zu mir.' },
  { id: 'q29', area: 'sosyal', tr: 'Gün boyu insanlarla iletişim içinde olmak beni yormaz.', en: 'Being in contact with people all day does not tire me.', de: 'Den ganzen Tag mit Menschen zu tun zu haben, ermüdet mich nicht.' },
  { id: 'q30', area: 'sosyal', tr: 'Birinin iyileşmesine ya da gelişmesine katkı sağlamak bana anlamlı gelir.', en: 'Helping someone heal or grow feels meaningful to me.', de: 'Zur Genesung oder Entwicklung anderer beizutragen, finde ich sinnvoll.' },

  { id: 'q31', area: 'girisimci', tr: 'Bir grupta kararı vermek ve sorumluluk almak bana uyar.', en: 'Making the decision and taking responsibility in a group suits me.', de: 'In einer Gruppe zu entscheiden und Verantwortung zu übernehmen, liegt mir.' },
  { id: 'q32', area: 'girisimci', tr: 'Hedef koymak ve o hedefe ulaşmak için yarışmak beni motive eder.', en: 'Setting targets and competing to reach them motivates me.', de: 'Ziele zu setzen und sie zu erreichen, motiviert mich.' },
  { id: 'q33', area: 'girisimci', tr: 'Tanımadığım insanlarla rahatça konuşup bağlantı kurabilirim.', en: 'I can easily talk to and connect with strangers.', de: 'Ich spreche leicht mit Fremden und knüpfe Kontakte.' },

  { id: 'q34', area: 'duzenli', tr: 'Yapılacak işleri sıraya koyup takvime bağlamayı severim.', en: 'I like putting tasks in order and on a schedule.', de: 'Ich plane Aufgaben gern der Reihe nach im Kalender.' },
  { id: 'q35', area: 'duzenli', tr: 'Para, belge ya da kayıtla ilgili işlerde dikkatli ve titizimdir.', en: 'I am careful and precise with money, documents or records.', de: 'Bei Geld, Dokumenten oder Unterlagen bin ich sorgfältig.' },
  { id: 'q36', area: 'duzenli', tr: 'Belli bir sisteme göre işleyen bir iş ortamında daha iyi çalışırım.', en: 'I work better where things run by a clear system.', de: 'Ich arbeite besser, wo alles nach einem klaren System läuft.' },
];

export const ANSWER_MIN = 1;
export const ANSWER_MAX = 5;

export const ANSWER_LABELS = [
  { value: 1, tr: 'Hiç', en: 'Not at all', de: 'Gar nicht' },
  { value: 2, tr: 'Az', en: 'A little', de: 'Wenig' },
  { value: 3, tr: 'Orta', en: 'Somewhat', de: 'Mittel' },
  { value: 4, tr: 'Çok', en: 'A lot', de: 'Viel' },
  { value: 5, tr: 'Tam', en: 'Exactly', de: 'Genau' },
];

// Alan → örnek çalışma alanları. Bunlar "senin mesleğin bu" demez; fikir vermek içindir.
export const AREA_FIELDS = {
  yapici: {
    tr: ['Teknisyenlik ve bakım', 'İnşaat ve mimarlık uygulama', 'Üretim ve imalat', 'Tarım ve gıda', 'Lojistik ve saha işleri'],
    en: ['Technician and maintenance', 'Construction', 'Manufacturing', 'Agriculture and food', 'Logistics and field work'],
    de: ['Technik und Wartung', 'Bau', 'Fertigung', 'Landwirtschaft', 'Logistik'],
  },
  arastirmaci: {
    tr: ['Mühendislik', 'Veri ve yazılım', 'Sağlık bilimleri', 'Laboratuvar ve araştırma', 'Finansal analiz'],
    en: ['Engineering', 'Data and software', 'Health sciences', 'Laboratory and research', 'Financial analysis'],
    de: ['Ingenieurwesen', 'Daten und Software', 'Gesundheitswissenschaften', 'Labor und Forschung', 'Finanzanalyse'],
  },
  sanatsal: {
    tr: ['Grafik ve ürün tasarımı', 'Yazarlık ve içerik', 'Müzik ve sahne', 'Mimari tasarım', 'Film, fotoğraf, video'],
    en: ['Graphic and product design', 'Writing and content', 'Music and performance', 'Architectural design', 'Film and photography'],
    de: ['Grafik- und Produktdesign', 'Schreiben und Inhalte', 'Musik und Bühne', 'Architektur', 'Film und Fotografie'],
  },
  sosyal: {
    tr: ['Öğretmenlik ve eğitim', 'Psikoloji ve danışmanlık', 'Hemşirelik ve bakım', 'Sosyal hizmet', 'İnsan kaynakları', 'Yiyecek-içecek ve servis'],
    en: ['Teaching and education', 'Psychology and counselling', 'Nursing and care', 'Social work', 'Human resources', 'Food service and hospitality'],
    de: ['Lehre und Bildung', 'Psychologie und Beratung', 'Pflege', 'Sozialarbeit', 'Personalwesen', 'Gastronomie und Service'],
  },
  girisimci: {
    tr: ['Satış ve pazarlama', 'Girişimcilik', 'Yöneticilik', 'Gayrimenkul', 'Halkla ilişkiler'],
    en: ['Sales and marketing', 'Entrepreneurship', 'Management', 'Real estate', 'Public relations'],
    de: ['Vertrieb und Marketing', 'Unternehmertum', 'Management', 'Immobilien', 'PR'],
  },
  duzenli: {
    tr: ['Muhasebe ve finans', 'Bankacılık', 'İdari işler ve ofis yönetimi', 'Kalite kontrol', 'Hukuk büroları ve mevzuat'],
    en: ['Accounting and finance', 'Banking', 'Administration and office management', 'Quality control', 'Legal and compliance'],
    de: ['Buchhaltung und Finanzen', 'Bankwesen', 'Verwaltung', 'Qualitätskontrolle', 'Recht und Compliance'],
  },
};

export const isCompleteAnswers = (answers) =>
  !!answers && QUESTIONS.every((q) => {
    const v = Number(answers[q.id]);
    return Number.isFinite(v) && v >= ANSWER_MIN && v <= ANSWER_MAX;
  });

export const answeredCount = (answers) =>
  !answers ? 0 : QUESTIONS.filter((q) => {
    const v = Number(answers[q.id]);
    return Number.isFinite(v) && v >= ANSWER_MIN && v <= ANSWER_MAX;
  }).length;

/*
  Puanlama: her alanın soruları toplanır, 0–100 arasına çevrilir.
  Dönüş: { ok: true, scores: { alan: 0-100 }, ranked: [{ key, score }] } ya da
         { ok: false, reason: 'incomplete', missing }
  Eşit puanlarda sıra AREAS dizisine göre sabittir (sonuç her açılışta aynı görünür).
*/
export const scoreCompass = (answers) => {
  if (!isCompleteAnswers(answers)) {
    return { ok: false, reason: 'incomplete', missing: QUESTIONS.length - answeredCount(answers) };
  }
  const totals = {};
  const counts = {};
  for (const q of QUESTIONS) {
    totals[q.area] = (totals[q.area] || 0) + Number(answers[q.id]);
    counts[q.area] = (counts[q.area] || 0) + 1;
  }
  const scores = {};
  for (const key of AREA_KEYS) {
    const min = counts[key] * ANSWER_MIN;
    const max = counts[key] * ANSWER_MAX;
    scores[key] = Math.round(((totals[key] - min) / (max - min)) * 100);
  }
  const ranked = AREA_KEYS
    .map((key, index) => ({ key, score: scores[key], index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ key, score }) => ({ key, score }));
  return { ok: true, scores, ranked };
};

export const areaByKey = (key) => AREAS.find((a) => a.key === key) || null;

// En güçlü iki alanın örnek çalışma alanları, tekrarsız biçimde birleştirilir.
export const suggestFields = (ranked, lang = 'tr', limit = 6) => {
  const out = [];
  for (const item of (ranked || []).slice(0, 2)) {
    const group = AREA_FIELDS[item.key];
    const list = (group && pickByLang(group, lang)) || [];
    for (const field of list) if (!out.includes(field)) out.push(field);
  }
  return out.slice(0, limit);
};
