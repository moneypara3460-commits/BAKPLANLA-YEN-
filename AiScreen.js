import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dateLocaleFor, smartErrorMessage, toISO } from './helpers';
import { docForAi, fitDocsForAi, isShoppingQuestion, receiptDocsOf, shoppingContextForAi } from './receipts';
import { formatRemindAt, formatShopDate } from './shoppingPlan';
import { openSystemSettings } from './notifications';

const pickRelevantDocuments = (docs, question) => {
  const list = Array.isArray(docs) ? docs.filter((d) => d && typeof d === 'object') : [];
  if (list.length <= 5) return list;
  const norm = (v) => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  const words = norm(question).split(/[^a-z0-9çğıöşüâîû]+/i).filter((w) => w.length >= 3);
  const stamp = (d) => Date.parse(d.updatedAt || d.createdAt || '') || 0;
  const scored = list.map((d) => {
    const hay = norm([d.title, d.type, d.notes, d.analysis ? JSON.stringify(d.analysis) : ''].join(' '));
    const score = words.reduce((acc, w) => acc + (hay.includes(w.slice(0, 5)) ? 1 : 0), 0);
    return { d, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || stamp(b.d) - stamp(a.d));
  if (hits.length) return hits.slice(0, 8).map((x) => x.d);
  return [...list].sort((a, b) => stamp(b) - stamp(a)).slice(0, 5);
};

const AiScreenView = ({ s, c, tx, lang, documents, userId, dataScopeGeneration, isCurrentDataScope, readShoppingList, requestChat, createAiReminder, saveShoppingPlan, logSmartError, Screen, ScreenHeader }) => {
const scopeKey = `${dataScopeGeneration}:${userId || 'guest'}`;
const [questionState, setQuestionState] = useState({ scopeKey, value: '' });
const question = questionState.scopeKey === scopeKey ? questionState.value : '';
const [messagesState, setMessagesState] = useState({ scopeKey, value: [] });
const messages = messagesState.scopeKey === scopeKey ? messagesState.value : [];
const [loadingState, setLoadingState] = useState({ scopeKey, value: false });
const loading = loadingState.scopeKey === scopeKey && loadingState.value;
const operationRef = useRef(null);
const mountedRef = useRef(true);
const currentScopeRef = useRef({ scopeKey, dataScopeGeneration, userId, isCurrentDataScope });
currentScopeRef.current = { scopeKey, dataScopeGeneration, userId, isCurrentDataScope };
const isCurrent = (operation) => mountedRef.current && !!operation && operation.scopeKey === currentScopeRef.current.scopeKey && operation.dataScopeGeneration === currentScopeRef.current.dataScopeGeneration && operation.userId === currentScopeRef.current.userId && (typeof currentScopeRef.current.isCurrentDataScope !== 'function' || currentScopeRef.current.isCurrentDataScope(operation.dataScopeGeneration));
const appendMessage = (operation, message) => {
if (!isCurrent(operation)) return;
setMessagesState((current) => ({ scopeKey: operation.scopeKey, value: [...(current.scopeKey === operation.scopeKey ? current.value : []), message] }));
};
const setQuestion = (value) => setQuestionState({ scopeKey, value });

useEffect(() => {
mountedRef.current = true;
return () => {
mountedRef.current = false;
};
}, []);

// Hatırlatma zamanını "bugün 18:50" / "yarın 09:00" / "28 Ekim 14:00" gibi yazar.
const reminderWhen = (at) => {
const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
const dayDiff = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000);
if (dayDiff === 0) return tx(`bugün ${hhmm}`, `today ${hhmm}`, `heute ${hhmm}`);
if (dayDiff === 1) return tx(`yarın ${hhmm}`, `tomorrow ${hhmm}`, `morgen ${hhmm}`);
let day = '';
try { day = at.toLocaleDateString(dateLocaleFor(lang), { day: 'numeric', month: 'long' }); } catch (e) { day = toISO(at); }
return `${day} ${hhmm}`;
};

const handleReminder = async (reminder, operation) => {
let r;
try {
r = await createAiReminder(reminder, operation.dataScopeGeneration);
} catch (e) {
r = { ok: false, reason: 'save' };
}
if (!isCurrent(operation) || r?.reason === 'stale') return;
let text;
if (!r.ok) {
text = r.reason === 'past'
? tx('⚠️ Bu saat geçmiş, hatırlatma kurulamadı. Yeni bir saat söyler misin?', '⚠️ That time has passed, so no reminder was set. Could you give a new time?', '⚠️ Diese Zeit ist vorbei, keine Erinnerung gesetzt. Nenne bitte eine neue Zeit.')
: tx('⚠️ Hatırlatma kaydedilemedi. Lütfen tekrar dene.', '⚠️ The reminder could not be saved. Please try again.', '⚠️ Die Erinnerung konnte nicht gespeichert werden. Bitte versuche es erneut.');
} else if (r.notif && r.notif.ok) {
text = tx(`✅ Hatırlatma kuruldu: ${reminderWhen(r.at)}. O saatte telefonuna bildirim gelecek; Takvim'e de görev olarak eklendi.`,
`✅ Reminder set: ${reminderWhen(r.at)}. You'll get a notification then; it was also added to your Calendar as a task.`,
`✅ Erinnerung gesetzt: ${reminderWhen(r.at)}. Du bekommst dann eine Benachrichtigung; sie steht auch als Aufgabe im Kalender.`);
} else if (r.notif && r.notif.reason === 'permission') {
text = tx(`⚠️ Görev Takvim'e eklendi (${reminderWhen(r.at)}) ama bildirim izni kapalı olduğu için telefonuna bildirim GELMEYECEK.`,
`⚠️ Added to your Calendar (${reminderWhen(r.at)}), but notifications are off, so you will NOT get a notification.`,
`⚠️ Im Kalender eingetragen (${reminderWhen(r.at)}), aber Benachrichtigungen sind aus – du bekommst KEINE Benachrichtigung.`);
if (!isCurrent(operation)) return;
Alert.alert('BAKPLANLA', tx('Hatırlatmanın telefonuna gelmesi için bildirim iznini açman gerekiyor.', 'To receive the reminder, please allow notifications.', 'Bitte erlaube Benachrichtigungen, um die Erinnerung zu erhalten.'), [
{ text: tx('Ayarları Aç', 'Open Settings', 'Einstellungen'), onPress: openSystemSettings },
{ text: tx('Tamam', 'OK', 'OK'), style: 'cancel' },
]);
} else if (r.notif && r.notif.reason === 'unsupported') {
text = tx(`ℹ️ Görev Takvim'e eklendi (${reminderWhen(r.at)}). Bildirimler web'de çalışmaz; Android veya iPhone uygulamasında gelir.`,
`ℹ️ Added to your Calendar (${reminderWhen(r.at)}). Notifications don't work on the web; they work in the Android or iPhone app.`,
`ℹ️ Im Kalender eingetragen (${reminderWhen(r.at)}). Im Web gibt es keine Benachrichtigungen; in der Android- oder iPhone-App schon.`);
} else {
text = tx(`⚠️ Görev Takvim'e eklendi (${reminderWhen(r.at)}) ama bildirim kurulamadı.`,
`⚠️ Added to your Calendar (${reminderWhen(r.at)}), but the notification could not be scheduled.`,
`⚠️ Im Kalender eingetragen (${reminderWhen(r.at)}), aber die Benachrichtigung konnte nicht geplant werden.`);
}
appendMessage(operation, { role: 'assistant', text });
};

const ask = async () => {
const text = question.trim();
const generation = dataScopeGeneration;
const uid = userId;
const requestScopeKey = scopeKey;
if (!text || loading || (operationRef.current && operationRef.current.scopeKey === requestScopeKey)) return;
const operation = { scopeKey: requestScopeKey, dataScopeGeneration: generation, userId: uid };
operationRef.current = operation;
appendMessage(operation, { role: 'user', text });
setQuestionState({ scopeKey: requestScopeKey, value: '' });
setLoadingState({ scopeKey: requestScopeKey, value: true });

try {
const relevantDocs = pickRelevantDocuments(documents, text);
if (isShoppingQuestion(text)) {
receiptDocsOf(documents).slice(0, 5).forEach((d) => { if (!relevantDocs.includes(d)) relevantDocs.push(d); });
}
const documentContext = fitDocsForAi(relevantDocs.map(docForAi)).map((doc) => ({
id: doc.id,
title: doc.title,
type: doc.type,
analyzed: doc.analyzed,
status: doc.status,
analysis: doc.analysis || null,
notes: doc.notes || '',
createdAt: doc.createdAt || null,
updatedAt: doc.updatedAt || null,
}));

// AKILLI ALIŞVERİŞ: güncel alışveriş listesi + son fişlerin kısa özeti PLAN AI'ya da gider.
let shopping = null;
try {
const rawList = await readShoppingList();
if (!isCurrent(operation)) return;
const savedList = rawList ? JSON.parse(rawList) : null;
shopping = shoppingContextForAi(savedList && Array.isArray(savedList.items) ? savedList.items : [], documents);
} catch (listError) {
if (!isCurrent(operation)) return;
shopping = shoppingContextForAi([], documents);
}
if (!isCurrent(operation)) return;
const data = await requestChat({
mode: 'chat',
question: text,
documents: documentContext,
shopping,
}, () => isCurrent(operation));
if (!isCurrent(operation) || data?.stale) return;

const answer =
typeof data?.answer === 'string' && data.answer.trim()
? data.answer.trim()
: 'PLAN şu anda cevap oluşturamadı.';
appendMessage(operation, { role: 'assistant', text: answer });

// ALIŞVERİŞ PLANI: kullanıcı alışverişe gideceği günü söyledi → plan + 1 gün önce hatırlatma.
// Bu durumda ayrı bir görev hatırlatması kurulmaz (çift bildirim olmasın).
if (data && data.shopping_plan && typeof data.shopping_plan === 'object') {
if (!isCurrent(operation)) return;
let text;
try {
const res = await saveShoppingPlan({ shopDate: data.shopping_plan.shop_date, remindAt: data.shopping_plan.remind_at || null, expectedGeneration: operation.dataScopeGeneration });
if (!isCurrent(operation) || res?.reason === 'stale') return;
if (res.ok) {
text = tx(
res.plan.items.length
? `🛒 Alışveriş planı kaydedildi: ${formatShopDate(res.plan.shopDate)}. Hatırlatma: ${formatRemindAt(res.plan.remindAt)}. Listendeki ${res.plan.items.length} ürün dahil; Akıllı Alışveriş'ten düzenleyebilirsin.`
: `🛒 Alışveriş planı kaydedildi: ${formatShopDate(res.plan.shopDate)}. Hatırlatma: ${formatRemindAt(res.plan.remindAt)}. ⚠️ Alışveriş listen şu an boş; Akıllı Alışveriş'ten ürün ekle ya da fiş okut, hatırlatma otomatik güncellenir.`,
`🛒 Shopping plan saved: ${res.plan.shopDate}. Reminder: ${formatRemindAt(res.plan.remindAt)}.`,
`🛒 Einkaufsplan gespeichert: ${res.plan.shopDate}. Erinnerung: ${formatRemindAt(res.plan.remindAt)}.`
);
if (res.notif && res.notif.reason === 'permission') {
text += tx(' ⚠️ Bildirim izni kapalı; hatırlatmanın gelmesi için Ayarlar > Bildirimler\'den aç.', ' ⚠️ Notifications are off.', ' ⚠️ Benachrichtigungen sind aus.');
}
} else {
text = res.reason === 'past'
? tx('⚠️ Bu tarih geçmiş; alışveriş planı kaydedilmedi.', '⚠️ That date has passed; no plan was saved.', '⚠️ Das Datum ist vergangen.')
: tx('⚠️ Alışveriş planı kaydedilemedi. Akıllı Alışveriş ekranından tarihi seçebilirsin.', '⚠️ The shopping plan could not be saved.', '⚠️ Der Einkaufsplan konnte nicht gespeichert werden.');
}
} catch (e) {
if (!isCurrent(operation)) return;
text = tx('⚠️ Alışveriş planı kaydedilemedi.', '⚠️ The shopping plan could not be saved.', '⚠️ Der Einkaufsplan konnte nicht gespeichert werden.');
}
appendMessage(operation, { role: 'assistant', text });
} else if (data && data.reminder && typeof data.reminder === 'object' && typeof createAiReminder === 'function') {
// Yapay zekâ hatırlatma hazırladıysa: görev + bildirim kur ve sonucu dürüstçe göster.
await handleReminder(data.reminder, operation);
}
} catch (error) {
if (!isCurrent(operation)) return;
logSmartError('PLAN AI ERROR:', error);
appendMessage(operation, {
role: 'assistant',
text: smartErrorMessage(error, lang, {
tr: 'PLAN AI ile bağlantı kurulamadı. Lütfen tekrar dene.',
en: 'PLAN AI could not connect. Please try again.',
de: 'PLAN AI konnte keine Verbindung herstellen. Bitte versuche es erneut.',
}),
});
} finally {
if (operationRef.current === operation) operationRef.current = null;
if (isCurrent(operation)) setLoadingState({ scopeKey: operation.scopeKey, value: false });
}
};return (
<Screen>
<ScreenHeader
title="PLAN AI"
subtitle={tx(
'Belgelerin ve hayatın hakkında sor.',
'Ask about your documents and your life.',
'Frage zu deinen Dokumenten und deinem Leben.'
)}
/>

<View style={s.heroCard}>
<View style={s.heroIconBox}>
<Text style={s.heroEmoji}>🧠</Text>
</View>

<Text style={s.heroTitle}>PLAN AI</Text>

<Text style={s.heroDesc}>
{tx(
'Belgelerini anlayan ve sonraki adımlarını düzenlemene yardımcı olan akıllı asistan.',
'An intelligent assistant that understands your documents and helps organize your next steps.',
'Ein intelligenter Assistent, der deine Dokumente versteht und deine nächsten Schritte organisiert.'
)}
</Text>
</View>

{messages.map((message, index) => (
<View
key={`${message.role}-${index}`}
style={
message.role === 'user'
? s.chatBubbleUser
: s.chatBubbleBot
}
>
<Text
style={
message.role === 'user'
? s.chatBubbleUserText
: s.chatBubbleBotText
}
>
{message.text}
</Text>
</View>
))}

{loading && (
<View style={s.chatBubbleBot}>
<ActivityIndicator
size="small"
color={c.green}
/>

<Text
style={[
s.chatBubbleBotText,
{ marginTop: 6 },
]}
>
{tx(
'PLAN düşünüyor...',
'PLAN is thinking...',
'PLAN denkt nach...'
)}
</Text>
</View>
)}

<View style={s.askRow}>
<TextInput
value={question}
onChangeText={setQuestion}
placeholder={tx(
'PLAN’a bir şey sor...',
'Ask PLAN something...',
'Frag PLAN etwas...'
)}
placeholderTextColor="#9BA7A3"
style={[s.input, { flex: 1 }]}
multiline
editable={!loading}
/>

<TouchableOpacity
style={[
s.sendBtn,
loading && { opacity: 0.5 },
]}
onPress={ask}
disabled={loading}
>
<Ionicons
name="arrow-up"
size={21}
color={c.green}
/>
</TouchableOpacity>
</View>

<View style={s.softCard}>
<View style={s.row}>
<Ionicons
name="checkmark-circle-outline"
size={21}
color={c.green}
/>

<Text style={[s.cardTitle, { marginLeft: 8 }]}>
{tx(
'PLAN AI aktif',
'PLAN AI active',
'PLAN AI aktiv'
)}
</Text>
</View>

<Text style={s.note}>
{tx(
'Soruların güvenli şekilde PLAN AI servisine gönderilir ve mevcut belge analizlerin cevaplara dahil edilir.',
'Your questions are securely sent to PLAN AI and your analyzed documents are included in the answers.',
'Deine Fragen werden sicher an PLAN AI gesendet und deine analysierten Dokumente werden in die Antworten einbezogen.'
)}
</Text>
</View>
</Screen>
);

};

export default AiScreenView;
