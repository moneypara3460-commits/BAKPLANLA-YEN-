import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadValue, pick, saveValue } from './helpers';
import {
  COMPASS_KEY, QUESTIONS, ANSWER_LABELS, scoreCompass, answeredCount, suggestFields, areaByKey,
} from './compass';
import { matchProfessions, professionByKey, professionName, setPendingProfession } from './meslekProvasi';
export const CompassScreen = ({ app, Screen, ScreenHeader, Chip, isKoprusuActive }) => {
const { s, c, tx, lang, showToast, navigate } = app;
const [answers, setAnswers] = useState({});
const [result, setResult] = useState(null);
const [loaded, setLoaded] = useState(false);
const [showQuiz, setShowQuiz] = useState(false);
const [upgraded, setUpgraded] = useState(false);
const jobMatches = useMemo(() => (result && result.ok ? matchProfessions(result.scores) : []), [result]);
const tryJob = (key) => {
const p = professionByKey(key);
if (p && p.game === 'isbasi') { navigate('isbasi'); return; }
setPendingProfession(key);
navigate('prova');
};

useEffect(() => {
let cancelled = false;
const load = async () => {
const saved = await loadValue(COMPASS_KEY, null);
if (cancelled) return;
if (saved && saved.answers && scoreCompass(saved.answers).ok) {
setAnswers(saved.answers);
setResult(scoreCompass(saved.answers));
} else if (saved && saved.answers && answeredCount(saved.answers) > 0) {
// Test 36 soruya çıktı: önceki cevaplar korunur, yalnızca yeni sorular cevaplanır.
setAnswers(saved.answers);
setUpgraded(true);
}
setLoaded(true);
};
load();
return () => { cancelled = true; };
}, []);

const setAnswer = (id, value) => setAnswers((cur) => ({ ...cur, [id]: value }));

const finish = async () => {
const scored = scoreCompass(answers);
if (!scored.ok) {
Alert.alert('BAKPLANLA', tx(`${scored.missing} soru daha cevaplanmalı.`, `${scored.missing} more questions to answer.`, `Noch ${scored.missing} Fragen offen.`));
return;
}
setResult(scored);
setShowQuiz(false);
setUpgraded(false);
const ok = await saveValue(COMPASS_KEY, { answers, savedAt: new Date().toISOString() });
showToast(ok
? tx('Sonucun kaydedildi.', 'Your result was saved.', 'Dein Ergebnis wurde gespeichert.')
: tx('Sonuç cihaza kaydedilemedi.', 'The result could not be saved.', 'Das Ergebnis konnte nicht gespeichert werden.'));
};

const restart = () => { setAnswers({}); setResult(null); setUpgraded(false); setShowQuiz(true); };
const answered = answeredCount(answers);

if (!loaded) {
return (
<Screen>
<ScreenHeader title={tx('PUSULA', 'COMPASS', 'KOMPASS')} subtitle={tx('Mesleğini Keşfet', 'Discover your field', 'Entdecke dein Feld')} />
<ActivityIndicator color={c.green} />
</Screen>
);
}

return (
<Screen>
<ScreenHeader
title={tx('PUSULA', 'COMPASS', 'KOMPASS')}
subtitle={tx('Mesleğini Keşfet', 'Discover your field', 'Entdecke dein Feld')}
/>

{/* Meslek simülasyonları (İş Başı) — Pusula'dan kalıcı giriş */}
<TouchableOpacity activeOpacity={0.85} onPress={() => navigate('isbasi')} style={{ backgroundColor: c.dark, borderRadius: 20, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
<Text style={{ position: 'absolute', right: 40, top: -18, fontSize: 80, opacity: 0.08 }}>💼</Text>
<View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
<Text style={{ fontSize: 24 }}>💼</Text>
</View>
<View style={{ flex: 1 }}>
<Text style={{ color: c.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{tx('MESLEK SİMÜLASYONLARI', 'JOB SIMULATIONS', 'BERUFSSIMULATIONEN')}</Text>
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15, marginTop: 2 }}>{tx('İş Başı: bir günlüğüne o işi yap', 'On the Job: do it for a day', 'Im Job: einen Tag lang ausprobieren')}</Text>
<Text style={{ color: '#CFE3DC', fontSize: 12, marginTop: 2 }}>☕ {tx('Barista', 'Barista', 'Barista')} · 🧾 {tx('Kasiyer', 'Cashier', 'Kassierer')} · 📦 {tx('Reyon görevlisi', 'Shelf staff', 'Regalpfleger')}</Text>
</View>
<Ionicons name="chevron-forward" size={20} color={c.gold} />
</TouchableOpacity>

<TouchableOpacity activeOpacity={0.85} onPress={() => navigate('prova')} style={[s.card, s.row, { marginBottom: 12, borderColor: c.gold, borderWidth: 1.5 }]}>
<Text style={{ fontSize: 26, marginRight: 12 }}>🎭</Text>
<View style={s.flex1}>
<Text style={s.cardTitle}>{tx('Meslek Provası: 30+ meslek', 'Job Rehearsal: 30+ jobs', 'Berufsprobe: 30+ Berufe')}</Text>
<Text style={s.cardMeta}>{tx('Hemşireden yazılımcıya, mesleği bir vardiya boyunca dene', 'From nurse to developer, try a job for one shift', 'Von Pflege bis Software: probier einen Beruf')}</Text>
</View>
<Ionicons name="chevron-forward" size={20} color={c.muted} />
</TouchableOpacity>

{!showQuiz && result && (
<>
{jobMatches.length > 0 && (() => {
const top = professionByKey(jobMatches[0].key);
return (
<View style={{ backgroundColor: c.dark, borderRadius: 24, padding: 18, marginBottom: 12, overflow: 'hidden' }}>
<Text style={{ position: 'absolute', right: -6, top: -12, fontSize: 110, opacity: 0.1 }}>{top.icon}</Text>
<Text style={{ color: c.gold, fontWeight: '900', fontSize: 12, letterSpacing: 2 }}>{tx('SANA EN YAKIN MESLEK', 'YOUR CLOSEST JOB', 'DEIN PASSENDSTER BERUF')}</Text>
<View style={[s.row, { marginTop: 8 }]}>
<Text style={{ fontSize: 34, marginRight: 10 }}>{top.icon}</Text>
<View style={s.flex1}>
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 22 }}>{professionName(top, lang)}</Text>
<Text style={{ color: '#CFE3DC', fontSize: 13, marginTop: 2 }}>{tx(`Uyum: %${jobMatches[0].match}`, `Match: ${jobMatches[0].match}%`, `Passung: ${jobMatches[0].match} %`)}</Text>
</View>
</View>
<Text style={{ color: '#CFE3DC', fontSize: 13, marginTop: 8, lineHeight: 19 }}>{top.intro.gun}</Text>
<TouchableOpacity onPress={() => tryJob(top.key)} style={[s.goldBtn, { marginTop: 14 }]}>
<Text style={s.goldBtnText}>▶ {tx('Bu Mesleği Dene', 'Try This Job', 'Diesen Beruf testen')}</Text>
</TouchableOpacity>
</View>
);
})()}

{jobMatches.length > 1 && (
<>
<Text style={s.label}>{tx('SANA YAKIN DİĞER MESLEKLER', 'OTHER CLOSE JOBS', 'WEITERE PASSENDE BERUFE')}</Text>
{jobMatches.slice(1, 4).map((m) => {
const p = professionByKey(m.key);
return (
<TouchableOpacity key={m.key} onPress={() => tryJob(m.key)} style={[s.card, s.row, { marginBottom: 8 }]}>
<Text style={{ fontSize: 24, marginRight: 10 }}>{p.icon}</Text>
<Text style={[s.cardTitle, s.flex1]}>{professionName(p, lang)}</Text>
<Text style={{ color: c.green, fontWeight: '900', marginRight: 6 }}>%{m.match}</Text>
<Ionicons name="play-circle" size={22} color={c.green} />
</TouchableOpacity>
);
})}
<TouchableOpacity onPress={() => navigate('prova')} style={{ marginBottom: 12, alignSelf: 'center' }}>
<Text style={{ color: c.green, fontWeight: '800' }}>{tx('Tüm meslekleri gör →', 'See all jobs →', 'Alle Berufe ansehen →')}</Text>
</TouchableOpacity>
</>
)}

<View style={s.softCard}>
<Text style={s.cardTitle}>{tx('İlgi alanların', 'Your interests', 'Deine Interessen')}</Text>
<Text style={s.cardMeta}>
{tx('En yüksek puanlı iki alan sana en yakın duran alanlardır.', 'The two highest areas are the ones closest to you.', 'Die zwei höchsten Bereiche liegen dir am nächsten.')}
</Text>
</View>

{result.ranked.map((item) => {
const area = areaByKey(item.key);
return (
<View key={item.key} style={[s.softCard, { marginTop: 8 }]}>
<View style={[s.row, { marginBottom: 6 }]}>
<Text style={[s.cardTitle, s.flex1]}>{area.icon} {pick(lang, area.tr, area.en, area.de)}</Text>
<Text style={[s.cardTitle, { color: c.green }]}>{item.score}</Text>
</View>
<View style={{ height: 8, borderRadius: 4, backgroundColor: c.chip, overflow: 'hidden' }}>
<View style={{ width: `${item.score}%`, height: 8, backgroundColor: c.green }} />
</View>
</View>
);
})}

<Text style={s.label}>{tx('BAKABİLECEĞİN ALANLAR', 'FIELDS TO LOOK AT', 'MÖGLICHE FELDER')}</Text>
{suggestFields(result.ranked, lang).map((field) => (
<View key={field} style={s.checkRow}>
<Ionicons name="arrow-forward-circle-outline" size={20} color={c.green} />
<Text style={s.checkText}>{field}</Text>
</View>
))}

<Text style={[s.note, { marginTop: 14 }]}>
{tx(
'Bu bir yetenek ya da zekâ testi DEĞİLDİR ve kesin bir meslek tavsiyesi vermez. Yalnızca verdiğin cevaplara göre ilgi alanlarını gösterir. Cevapların bu cihazda kalır, hiçbir yere gönderilmez.',
'This is NOT an aptitude test and does not give definitive career advice. It only shows your interests based on your answers. Your answers stay on this device.',
'Dies ist KEIN Eignungstest und gibt keine verbindliche Berufsberatung. Es zeigt nur deine Interessen. Deine Antworten bleiben auf diesem Gerät.'
)}
</Text>

<TouchableOpacity style={s.darkBtn} onPress={() => navigate('isbasi')}>
<Text style={s.darkBtnText}>💼 {tx('Bir mesleği oyunda dene — İş Başı', 'Try a job in the game — On the Job', 'Probier einen Beruf im Spiel — Im Job')}</Text>
</TouchableOpacity>
{isKoprusuActive && (
<TouchableOpacity style={s.secondaryBtn} onPress={() => navigate('koprusu')}>
<Text style={s.secondaryBtnText}>🪪 {tx('Meslek Pasaportuma Bak — İş Köprüsü', 'See my career passport — Job Bridge', 'Meinen Berufspass ansehen')}</Text>
</TouchableOpacity>
)}

<TouchableOpacity style={s.secondaryBtn} onPress={restart}>
<Text style={s.secondaryBtnText}>{tx('Testi Yeniden Yap', 'Take the test again', 'Test wiederholen')}</Text>
</TouchableOpacity>
</>
)}

{!showQuiz && !result && (
<>
<View style={s.heroCard}>
<View style={s.heroIconBox}><Text style={{ fontSize: 30 }}>🧭</Text></View>
<Text style={s.heroTitle}>{tx('Neye ilgi duyuyorsun?', 'What are you drawn to?', 'Was interessiert dich?')}</Text>
<Text style={s.heroDesc}>
{upgraded
? tx(`Teste yeni sorular eklendi. Önceki cevapların duruyor; kalan ${QUESTIONS.length - answered} soruyu cevaplaman yeterli.`, `New questions were added. Your earlier answers are kept; just answer the remaining ${QUESTIONS.length - answered}.`, `Neue Fragen wurden ergänzt. Deine Antworten bleiben; beantworte nur die restlichen ${QUESTIONS.length - answered}.`)
: tx(`${QUESTIONS.length} kısa soru, yaklaşık 6 dakika. İnternet gerekmez, cevapların cihazında kalır.`, `${QUESTIONS.length} short questions, about 6 minutes. No internet needed, your answers stay on your device.`, `${QUESTIONS.length} kurze Fragen, etwa 6 Minuten. Kein Internet nötig, deine Antworten bleiben auf dem Gerät.`)}
</Text>
</View>
<TouchableOpacity style={s.darkBtn} onPress={() => setShowQuiz(true)}>
<Text style={s.darkBtnText}>{upgraded ? tx('Kalan Soruları Cevapla', 'Answer the remaining questions', 'Restliche Fragen beantworten') : tx('Teste Başla', 'Start the test', 'Test starten')}</Text>
</TouchableOpacity>
</>
)}

{showQuiz && (
<>
<View style={s.softCard}>
<Text style={s.cardTitle}>{answered} / {QUESTIONS.length}</Text>
<View style={{ height: 8, borderRadius: 4, backgroundColor: c.chip, overflow: 'hidden', marginTop: 8 }}>
<View style={{ width: `${Math.round((answered / QUESTIONS.length) * 100)}%`, height: 8, backgroundColor: c.green }} />
</View>
</View>

{QUESTIONS.map((q, index) => (
<View key={q.id} style={[s.softCard, { marginTop: 10 }]}>
<Text style={s.cardTitle}>{index + 1}. {pick(lang, q.tr, q.en, q.de)}</Text>
<View style={[s.chipRow, { marginTop: 10 }]}>
{ANSWER_LABELS.map((opt) => (
<Chip
key={opt.value}
label={pick(lang, opt.tr, opt.en, opt.de)}
active={answers[q.id] === opt.value}
onPress={() => setAnswer(q.id, opt.value)}
/>
))}
</View>
</View>
))}

<TouchableOpacity style={s.darkBtn} onPress={finish}>
<Text style={s.darkBtnText}>{tx('Sonucu Gör', 'See my result', 'Ergebnis ansehen')}</Text>
</TouchableOpacity>
<TouchableOpacity style={s.secondaryBtn} onPress={() => setShowQuiz(false)}>
<Text style={s.secondaryBtnText}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text>
</TouchableOpacity>
</>
)}
</Screen>
);
};
