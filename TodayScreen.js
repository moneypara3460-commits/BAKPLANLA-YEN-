import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { ACTIVITY_OPTIONS, PEOPLE_OPTIONS, WITH_WHO_OPTIONS, TRANSPORT_OPTIONS, createId, makeSmartError, smartErrorMessage } from './helpers';
import { pickByLang } from './arabic';
import { validIsletmeler, isletmeText } from './isletmeTanitim';
import { applyBudgetFilter, CATEGORY_COST_TL, enrichPlaces, formatDistance, formatDuration, perPersonBudget, rankByFitThenDistance, readCenterFromResponse, sortByDistance } from './places';

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

const TodayScreenView = ({ s, c, tx, lang, todayPreferences, setTodayPreferences, dataScopeGeneration, isCurrentDataScope, requestPlaces, openLegal, logSmartError, Chip, Screen, ScreenHeader }) => {
const [storedResults, setStoredResults] = useState([]);
const [storedPartners, setStoredPartners] = useState([]);
const [storedProviderNotice, setStoredProviderNotice] = useState('');
const [storedOriginKind, setStoredOriginKind] = useState(null);
const [storedFilterNote, setStoredFilterNote] = useState('');
const [resultScopeGeneration, setResultScopeGeneration] = useState(dataScopeGeneration);
const [loading, setLoading] = useState(false);
const inFlightRef = useRef(false);
const requestIdRef = useRef(0);
const [budgetFilter, setBudgetFilter] = useState(true);
const [startFrom, setStartFrom] = useState('device');
const results = resultScopeGeneration === dataScopeGeneration ? storedResults : [];
const partners = resultScopeGeneration === dataScopeGeneration ? storedPartners : [];
const providerNotice = resultScopeGeneration === dataScopeGeneration ? storedProviderNotice : '';
const originKind = resultScopeGeneration === dataScopeGeneration ? storedOriginKind : null;
const filterNote = resultScopeGeneration === dataScopeGeneration ? storedFilterNote : '';
const requestContextKey = JSON.stringify({ scope: dataScopeGeneration, preferences: todayPreferences, budgetFilter, startFrom, lang });
const currentRequestContextRef = useRef(requestContextKey);
currentRequestContextRef.current = requestContextKey;
useEffect(() => {
if (inFlightRef.current) {
requestIdRef.current += 1;
inFlightRef.current = false;
setLoading(false);
}
}, [requestContextKey]);
useEffect(() => () => {
requestIdRef.current += 1;
inFlightRef.current = false;
}, []);

const setPref = (key, value) => setTodayPreferences((cur) => ({ ...cur, [key]: value }));
const label = (item) => pickByLang(item, lang);

/* Multiple activities are supported. Read the legacy single activityType and keep the first selected value there for compatibility. */
/* Directions require confirmation. Prefer destination coordinates; otherwise search by venue, address and selected area. */
const openDirections = (r) => {
const lat = Number(r && r.latitude);
const lng = Number(r && r.longitude);
const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
const query = hasPoint
? `${lat},${lng}`
: [r && r.title, r && r.address, String(todayPreferences.location || '').trim()].filter(Boolean).join(', ');
const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
Linking.openURL(url).catch(() =>
Alert.alert('BAKPLANLA', tx('Harita açılamadı.', 'Could not open the map.', 'Karte konnte nicht geöffnet werden.'))
);
};
const askDirections = (r) => {
Alert.alert(
r && r.title ? String(r.title) : 'BAKPLANLA',
tx('Bu mekana yol tarifi almak ister misin? Google Haritalar açılacak.', 'Get directions to this place? Google Maps will open.', 'Route zu diesem Ort anzeigen? Google Maps wird geöffnet.'),
[
{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' },
{ text: tx('Yol Tarifi Al', 'Get Directions', 'Route anzeigen'), onPress: () => openDirections(r) },
]
);
};

/* Matching partner venues appear above provider results when activity type and searched district match. Discounts are only mentioned; redemption remains at the till. */
const normTr = (v) => String(v || '').toLocaleLowerCase('tr-TR')
.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
const partnerTypes = (b) => {
const sec = normTr(b && b.sektor && b.sektor.tr);
const types = [];
if (sec.includes('kafe') || sec.includes('cafe')) types.push('cafe');
if (sec.includes('restoran') || sec.includes('restaurant')) types.push('restaurant');
return types;
};
const matchPartners = (place, activityKeys) => {
const where = normTr(place);
if (!where) return [];
return validIsletmeler().filter((b) => {
if (b.demo) return false;
if (!partnerTypes(b).some((t) => activityKeys.includes(t))) return false;
const district = normTr(String(b.sehir || '').split('/')[0]).trim();
return district.length >= 3 && where.includes(district);
});
};

const validActivityKey = (k) => ACTIVITY_OPTIONS.some((a) => a.key === k);
const selectedActivities = (() => {
const list = Array.isArray(todayPreferences.activityTypes)
? todayPreferences.activityTypes.filter(validActivityKey)
: [];
if (list.length) return list;
return validActivityKey(todayPreferences.activityType) ? [todayPreferences.activityType] : ['restaurant'];
})();
const toggleActivity = (key) => {
setTodayPreferences((cur) => {
const curList = Array.isArray(cur.activityTypes) && cur.activityTypes.filter(validActivityKey).length
? cur.activityTypes.filter(validActivityKey)
: validActivityKey(cur.activityType) ? [cur.activityType] : ['restaurant'];
let next = curList.includes(key) ? curList.filter((k) => k !== key) : [...curList, key];
if (!next.length) next = curList; // Keep at least one activity selected.
return { ...cur, activityTypes: next, activityType: next[0] };
});
};

const isCurrentRequest = (requestId, capturedContextKey, scopeGeneration) =>
requestId === requestIdRef.current &&
currentRequestContextRef.current === capturedContextKey &&
(typeof isCurrentDataScope !== 'function' || isCurrentDataScope(scopeGeneration));

const findOptions = async () => {
if (inFlightRef.current) return;
const capturedContextKey = requestContextKey;
const capturedScopeGeneration = dataScopeGeneration;
const requestId = ++requestIdRef.current;
const isCurrent = () => isCurrentRequest(requestId, capturedContextKey, capturedScopeGeneration);
const place = String(todayPreferences.location || '').trim();

if (!place) {
Alert.alert(
'PLAN',
tx(
'Lütfen konumunu gir.',
'Please enter your location.',
'Bitte gib deinen Standort ein.'
)
);
return;
}

inFlightRef.current = true;
setLoading(true);
setStoredProviderNotice('');

try {
const activityKeys = selectedActivities;
const activityKey = activityKeys[0];

const categoryMap = {
restaurant: 'restaurant',
cafe: 'cafe',
cinema: 'cinema',
event: 'activity',
nightlife: 'bar',
activity: 'activity',
shopping: 'activity',
outdoor: 'park',
};

const category = categoryMap[activityKey] || 'activity';
// Map every selected activity to a provider category and deduplicate categories.
const categories = [...new Set(activityKeys.map((k) => categoryMap[k] || 'activity'))];
// Map each provider category to its first selected activity label.
const categoryLabel = {};
activityKeys.forEach((k) => {
const cat = categoryMap[k] || 'activity';
const opt = ACTIVITY_OPTIONS.find((a) => a.key === k);
if (!categoryLabel[cat] && opt) categoryLabel[cat] = label(opt);
});

/* The distance origin is separate from the searched area. Use device location only with permission, then the provider's area center; otherwise show no distance estimate. */
let deviceOrigin = null;
if (startFrom === 'device') {
try {
const perm = await Location.requestForegroundPermissionsAsync();
if (!isCurrent()) return;
if (perm.status === 'granted') {
const pos = await Location.getLastKnownPositionAsync();
if (!isCurrent()) return;
const point = pos || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
if (!isCurrent()) return;
if (point && point.coords) {
deviceOrigin = { latitude: point.coords.latitude, longitude: point.coords.longitude, kind: 'device' };
}
}
} catch (locationError) {
deviceOrigin = null;
}
}

if (!isCurrent()) return;
const data = await requestPlaces({
locationName: place,
category,
categories,
radius: todayPreferences.transport === 'walk' ? 3000 : 5000,
budget: todayPreferences.budget,
}, () => isCurrent());
if (!isCurrent()) return;
setResultScopeGeneration(capturedScopeGeneration);

if (data.places !== undefined && data.places !== null && !Array.isArray(data.places)) {
throw makeSmartError('format');
}

// Ignore non-object results and avoid duplicating partner venues in provider results.
const matchedPartners = matchPartners(place, activityKeys);
setStoredPartners(matchedPartners);
const partnerNames = matchedPartners.map((b) => normTr(b.ad));
const placeList = (data.places || []).filter((item) => item && typeof item === 'object'
&& !partnerNames.some((n) => n && normTr(item.name).includes(n)));
const isStale = data.stale === true;

if (!placeList.length) {
setStoredResults([]);
setStoredProviderNotice(isStale
? tx(
'Mekan sağlayıcıları şu anda kullanılamıyor. Güncel mekan sonucu alınamadı.',
'Place search providers are temporarily unavailable. No current place results could be retrieved.',
'Die Anbieterdienste für Orte sind vorübergehend nicht verfügbar. Es konnten keine aktuellen Ergebnisse abgerufen werden.'
)
: '');
if (matchedPartners.length) return; // Keep the partner cards visible.
if (isStale) return; // The accessible notice explains why there are no current results.
Alert.alert(
'PLAN',
tx(
`${place} çevresinde uygun bir yer bulamadım.`,
`I couldn't find a suitable place around ${place}.`,
`Ich konnte keinen passenden Ort in der Nähe von ${place} finden.`
)
);
return;
}

const activity = ACTIVITY_OPTIONS.find(
(a) => a.key === activityKey
);

const name = activity ? label(activity) : '';


// Prefer device location, then the provider's searched-area center.
const centerOrigin = readCenterFromResponse(data);
const origin = deviceOrigin || centerOrigin;
setStoredOriginKind(origin ? origin.kind : null);

const perPerson = perPersonBudget(todayPreferences.budget, todayPreferences.peopleCount);
// For multiple categories, show the full lowest-to-highest average range.
const ranges = categories.map((cat) => CATEGORY_COST_TL[cat]).filter(Boolean);
const costRange = ranges.length
? { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) }
: null;

// Add straight-line distance, estimated travel time and budget fit per place category.
const groupsByCat = {};
placeList.forEach((item) => {
const cat = categories.includes(item.category) ? item.category : category;
(groupsByCat[cat] = groupsByCat[cat] || []).push(item);
});
const enriched = Object.keys(groupsByCat).reduce((all, cat) => all.concat(
enrichPlaces(groupsByCat[cat], {
origin,
transport: todayPreferences.transport,
category: cat,
budget: todayPreferences.budget,
people: todayPreferences.peopleCount,
}).map((p) => ({ ...p, _cat: cat }))
), []);

const filtered = applyBudgetFilter(enriched, budgetFilter && perPerson > 0);
const ordered = origin ? sortByDistance(filtered.list) : rankByFitThenDistance(filtered.list);

setStoredFilterNote(
filtered.relaxed
? tx(
`Girdiğin bütçe bu kategori için düşük göründüğü halde sonuçlar gizlenmedi; hepsi listelendi.`,
`Your budget looks low for this category, but no results were hidden; all are listed.`,
`Dein Budget wirkt für diese Kategorie niedrig, es wurde aber nichts ausgeblendet; alle werden gezeigt.`
)
: filtered.hidden > 0
? tx(
`Bütçeye uymayan ${filtered.hidden} sonuç gizlendi.`,
`${filtered.hidden} results outside your budget were hidden.`,
`${filtered.hidden} Ergebnisse außerhalb deines Budgets wurden ausgeblendet.`
)
: ''
);

const budgetText = perPerson > 0 && costRange
? tx(
`Kişi başı ~${Math.round(perPerson).toLocaleString('tr-TR')} TL bütçe (bu kategoride ortalama ${costRange.min}–${costRange.max} TL)`,
`~${Math.round(perPerson)} TL per person (this category averages ${costRange.min}–${costRange.max} TL)`,
`~${Math.round(perPerson)} TL pro Person (Kategorie-Durchschnitt ${costRange.min}–${costRange.max} TL)`
)
: tx('Bütçe belirtilmedi', 'Budget not entered', 'Budget nicht eingegeben');

const results = ordered.map((item) => ({
id: String(item.id || createId('place')),
title: item.name || tx(
'İsimsiz mekan',
'Unnamed place',
'Unbenannter Ort'
),
description: (() => {
const itemName = (item && categoryLabel[item._cat]) || name;
const base = item.address || tx(
`${place} çevresinde ${itemName}.`,
`${itemName} around ${place}.`,
`${itemName} in der Nähe von ${place}.`
);
// Prefix the activity label when multiple categories are selected.
return categories.length > 1 && itemName ? `${itemName} · ${base}` : base;
})(),
// Do not imply proximity when distance could not be calculated.
distance: formatDistance(item.distanceKm, lang),
minutesText: formatDuration(item.minutes, lang),
fit: item.fit,
rating: '—',
price: budgetText,
phone: item.phone || null,
website: item.website || null,
opening_hours: item.opening_hours || null,
address: item.address || null,
latitude: item.latitude,
longitude: item.longitude,
}));

// Balance the first ten results across selected categories while preserving each category's order.
if (categories.length > 1) {
const cats = ordered.map((item) => item._cat);
const buckets = {};
results.forEach((r, i) => { (buckets[cats[i]] = buckets[cats[i]] || []).push(i); });
const keys = Object.keys(buckets);
const chosen = new Set();
let more = true;
while (chosen.size < 10 && more) {
more = false;
for (const k of keys) {
if (buckets[k].length && chosen.size < 10) { chosen.add(buckets[k].shift()); more = true; }
}
}
const displayedResults = results.filter((_, i) => chosen.has(i));
setStoredProviderNotice(isStale
? displayedResults.length
? tx(
'Mekan sağlayıcıları şu anda kullanılamıyor. Son kayıtlı mekan sonuçları gösteriliyor.',
'Place search providers are temporarily unavailable. Showing cached place results.',
'Die Anbieterdienste für Orte sind vorübergehend nicht verfügbar. Zwischengespeicherte Ergebnisse werden angezeigt.'
)
: tx(
'Mekan sağlayıcıları şu anda kullanılamıyor. Güncel mekan sonucu alınamadı.',
'Place search providers are temporarily unavailable. No current place results could be retrieved.',
'Die Anbieterdienste für Orte sind vorübergehend nicht verfügbar. Es konnten keine aktuellen Ergebnisse abgerufen werden.'
)
: '');
setStoredResults(displayedResults);
} else {
const displayedResults = results.slice(0, 10);
setStoredProviderNotice(isStale
? displayedResults.length
? tx(
'Mekan sağlayıcıları şu anda kullanılamıyor. Son kayıtlı mekan sonuçları gösteriliyor.',
'Place search providers are temporarily unavailable. Showing cached place results.',
'Die Anbieterdienste für Orte sind vorübergehend nicht verfügbar. Zwischengespeicherte Ergebnisse werden angezeigt.'
)
: tx(
'Mekan sağlayıcıları şu anda kullanılamıyor. Güncel mekan sonucu alınamadı.',
'Place search providers are temporarily unavailable. No current place results could be retrieved.',
'Die Anbieterdienste für Orte sind vorübergehend nicht verfügbar. Es konnten keine aktuellen Ergebnisse abgerufen werden.'
)
: '');
setStoredResults(displayedResults);
}
} catch (error) {
if (!isCurrent()) return;
logSmartError('PLAN places error:', error);

setStoredResults([]);
setStoredPartners([]);
setStoredProviderNotice('');
setStoredOriginKind(null);
setStoredFilterNote('');

Alert.alert(
'PLAN',
smartErrorMessage(error, lang, {
tr: 'Mekanlar alınırken bir hata oluştu.',
en: 'There was an error loading places.',
de: 'Beim Laden der Orte ist ein Fehler aufgetreten.',
})
);
} finally {
if (isCurrent()) {
inFlightRef.current = false;
setLoading(false);
}
}
};

return (
<Screen>
<ScreenHeader title={tx('Bugün Ne Yapsak?', 'What should we do today?', 'Was machen wir heute?')} subtitle={tx('Tercihlerini seç, PLAN öneri hazırlasın.', 'Pick your preferences and PLAN will suggest.', 'Wähle deine Vorlieben, PLAN macht Vorschläge.')} />



<View style={{
  backgroundColor: '#0A3D33',
  borderRadius: 24,
  padding: 20,
  marginBottom: 18,
  borderWidth: 1,
  borderColor: '#E8B53E',
}}>
  <Text style={{
    color: '#F6C445',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  }}>
    ✨ PLAN ÖNERİSİ
  </Text>
  <Text style={{
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    marginBottom: 10,
  }}>
Sana Özel Plan Önerileri ✨
  </Text>
  <Text style={{
    color: '#F2F0E8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  }}>
    Hava durumu, ilgi alanların ve bütçene göre sana özel planlar hazırlıyoruz.
  </Text>
  <TouchableOpacity
    onPress={() =>
      Alert.alert(
        'BAKPLANLA',
        tx(
          'Aşağıdan konumunu, bütçeni ve ne yapmak istediğini seç, sonra "Öneri Bul"a dokun. Mekanlar OpenStreetMap verisinden gelir.',
          'Choose your location, budget and what you feel like below, then tap "Find suggestions". Places come from OpenStreetMap data.',
          'Wähle unten Standort, Budget und Aktivität und tippe dann auf "Vorschläge finden". Orte stammen aus OpenStreetMap-Daten.'
        )
      )
    }
    style={{
      backgroundColor: '#064E40',
      borderRadius: 30,
      paddingVertical: 13,
      paddingHorizontal: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#F6C445',
    }}
  >
    <Text style={{
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 15,
    }}>
      Örnek Planlara Bak →
    </Text>
  </TouchableOpacity>
</View>


<Text style={s.label}>{tx('KONUM', 'LOCATION', 'STANDORT')}</Text>
<TextInput value={todayPreferences.location} onChangeText={(text) => setPref('location', text)} placeholder={tx('Şehir veya semt', 'City or district', 'Stadt oder Viertel')} placeholderTextColor="#9BA7A3" style={s.input} />

{/* PLAN - personal budget */}
<View
  style={{
      marginTop: 18,
          marginBottom: 18,
padding: 16,
backgroundColor: '#FFFFFF',
borderRadius: 20,
borderWidth: 1,
borderColor: '#E8B53E',
}}
>
<View
style={{
flexDirection: 'row',
alignItems: 'center',
marginBottom: 8,
}}
>
<Ionicons
name="wallet-outline"
size={26}
color="#C58B08"
/>

<Text
style={{
flex: 1,
marginLeft: 10,
fontSize: 18,
fontWeight: '800',
color: '#0A3D33',
}}
>
{tx(
'Bugün ne kadar harcamak istiyorsun?',
'How much do you want to spend today?',
'Wie viel möchtest du heute ausgeben?'
)}
</Text>
</View>

<Text
style={{
fontSize: 14,
color: '#6E7F7A',
marginBottom: 12,
}}
>
{tx(
'Bütçeni yaz, sana uygun planları hazırlayalım.',
'Enter your budget and let us plan around it.',
'Gib dein Budget ein und wir planen passend dazu.'
)}
</Text>

<View
style={{
flexDirection: 'row',
alignItems: 'center',
borderWidth: 1,
borderColor: '#DCA628',
borderRadius: 15,
paddingHorizontal: 14,
backgroundColor: '#FFFDF7',
minHeight: 58,
}}
>
<TextInput
value={
/^\d+$/.test(String(todayPreferences.budget || ''))
? String(todayPreferences.budget)
: ''
}
onChangeText={(text) =>
setPref('budget', text.replace(/[^\d]/g, ''))
}
keyboardType="number-pad"
placeholder={tx('Örn. 350', 'e.g. 350', 'z. B. 350')}
placeholderTextColor="#9BA7A3"
style={{
flex: 1,
fontSize: 20,
color: '#0A3D33',
paddingVertical: 10,
}}
/>

<Text
style={{
fontSize: 19,
fontWeight: '900',
color: '#C58B08',
}}
>
TL
</Text>
</View>
</View>
<Text style={s.label}>{tx('KAÇ KİŞİ', 'PEOPLE', 'PERSONEN')}</Text>
<View style={s.chipRow}>
{PEOPLE_OPTIONS.map((p) => (
<Chip key={p} label={p} active={todayPreferences.peopleCount === p} onPress={() => setPref('peopleCount', p)} />
))}
</View>

<Text style={s.label}>{tx('KİMLE', 'WITH WHOM', 'MIT WEM')}</Text>
<View style={s.chipRow}>
{WITH_WHO_OPTIONS.map((w) => (
<Chip key={w.key} label={`${w.icon} ${label(w)}`} active={todayPreferences.withWho === w.key} onPress={() => setPref('withWho', w.key)} />
))}
</View>

<Text style={s.label}>{tx('NE YAPALIM (BİRDEN FAZLA SEÇEBİLİRSİN)', 'ACTIVITY (YOU CAN PICK SEVERAL)', 'AKTIVITÄT (MEHRFACHAUSWAHL)')}</Text>
<View style={s.chipRow}>
{ACTIVITY_OPTIONS.map((a) => (
<Chip key={a.key} label={`${a.icon} ${label(a)}`} active={selectedActivities.includes(a.key)} onPress={() => toggleActivity(a.key)} />
))}
</View>

<Text style={s.label}>{tx('ULAŞIM', 'TRANSPORT', 'VERKEHRSMITTEL')}</Text>
<View style={s.chipRow}>
{TRANSPORT_OPTIONS.map((t) => (
<Chip key={t.key} label={`${t.icon} ${label(t)}`} active={todayPreferences.transport === t.key} onPress={() => setPref('transport', t.key)} />
))}
</View>

<Text style={s.label}>{tx('MESAFE NEREDEN ÖLÇÜLSÜN', 'MEASURE DISTANCE FROM', 'ENTFERNUNG AB')}</Text>
<View style={s.chipRow}>
<Chip label={`📍 ${tx('Konumumdan', 'My location', 'Mein Standort')}`} active={startFrom === 'device'} onPress={() => setStartFrom('device')} />
<Chip label={`🗺️ ${tx('Aradığım semtten', 'The area I searched', 'Gesuchtes Viertel')}`} active={startFrom === 'area'} onPress={() => setStartFrom('area')} />
</View>

<View style={[s.softCard, { flexDirection: 'row', alignItems: 'center' }]}>
<View style={s.flex1}>
<Text style={s.cardTitle}>{tx('Bütçeme uymayanları gizle', 'Hide results over my budget', 'Über Budget ausblenden')}</Text>
<Text style={s.cardMeta}>
{tx('Bütçe yazdıysan, o kategoride ortalama fiyatı bütçene hiç uymayan sonuçlar listelenmez.', 'If you entered a budget, results whose category average is far above it are not listed.', 'Wenn du ein Budget eingibst, werden Ergebnisse weit darüber nicht gelistet.')}
</Text>
</View>
<Switch
value={budgetFilter}
onValueChange={setBudgetFilter}
trackColor={{ false: '#CBD5D1', true: c.green }}
thumbColor="#FFFFFF"
/>
</View>

<TouchableOpacity style={[s.darkBtn, loading && s.disabled]} disabled={loading} onPress={findOptions}>
{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.darkBtnText}>🔎 {tx('Öneri Bul', 'Find suggestions', 'Vorschläge finden')}</Text>}
</TouchableOpacity>

{!!providerNotice && (
<Text accessibilityRole="alert" style={[s.note, { color: c.text, fontSize: 14, lineHeight: 20, marginTop: 10, marginBottom: 10 }]}>
{providerNotice}
</Text>
)}

{(results.length > 0 || partners.length > 0) && (
<>
<View style={s.sectionHeader}>
<Text style={s.sectionTitle}>{tx('Öneriler', 'Suggestions', 'Vorschläge')}</Text>
<TouchableOpacity onPress={() => { setStoredResults([]); setStoredPartners([]); setStoredProviderNotice(''); }}>
<Text style={s.link}>{tx('Temizle', 'Clear', 'Löschen')}</Text>
</TouchableOpacity>
</View>
<Text style={[s.note, { marginTop: -4, marginBottom: 4 }]}>
{originKind === 'device'
? tx('Mesafe senin konumuna göre, KUŞ UÇUŞU hesaplanmıştır. Süre ortalama hızla yapılan bir tahmindir; trafik ve gerçek yol hesaba katılmaz.', 'Distance is measured from your location as the CROW FLIES. The time is an estimate from average speed; traffic and real roads are not included.', 'Die Entfernung ist LUFTLINIE ab deinem Standort. Die Zeit ist eine Schätzung mit Durchschnittsgeschwindigkeit, ohne Verkehr und echte Wege.')
: originKind === 'center'
? tx('Mesafe, aradığın semtin merkezine göre KUŞ UÇUŞU hesaplanmıştır. Süre ortalama hızla yapılan bir tahmindir.', 'Distance is measured as the CROW FLIES from the centre of the area you searched. The time is an estimate from average speed.', 'Die Entfernung ist LUFTLINIE ab der Mitte des gesuchten Gebiets. Die Zeit ist eine Schätzung.')
: tx('Konum alınamadığı için mesafe ve süre gösterilmiyor.', 'Distance and time are not shown because no location was available.', 'Entfernung und Zeit werden nicht angezeigt, da kein Standort verfügbar war.')}
</Text>
<Text style={[s.note, { marginTop: 0, marginBottom: 10 }]}>
{tx('Bütçe bilgisi mekanın kendi fiyatı değildir; kategori ortalamasına göre tahmindir.', 'The budget note is not the venue\u2019s own price; it is an estimate from the category average.', 'Die Budgetangabe ist nicht der Preis des Ortes, sondern eine Schätzung aus dem Kategoriedurchschnitt.')}
{filterNote ? ` ${filterNote}` : ''}
</Text>
{partners.map((b) => (
<TouchableOpacity
key={`partner-${b.id}`}
style={[s.resultCard, { borderWidth: 2, borderColor: c.gold }]}
activeOpacity={0.75}
onPress={() => askDirections({ title: b.ad, address: b.adres })}
>
<View style={[s.saveTag, { marginTop: 0, marginBottom: 8 }]}>
<Text style={s.popularText}>⭐ {tx('ANLAŞMALI MEKAN', 'PARTNER VENUE', 'PARTNERBETRIEB')}</Text>
</View>
<Text style={s.resultTitle}>{b.ad}</Text>
<Text style={s.resultDesc}>{[isletmeText(b.sektor, lang), b.adres].filter(Boolean).join(' · ')}</Text>
{!!(b.indirim && b.indirim.baslik) && (
<Text style={[s.cardMeta, { marginTop: 6, fontWeight: '800', color: c.text }]}>
🎁 {isletmeText(b.indirim.baslik, lang)}{b.indirim.saat ? ` (${b.indirim.saat})` : ''} · {tx('İndirim için kasada sor', 'Ask at the till for the discount', 'Frag an der Kasse nach dem Rabatt')}
</Text>
)}
<Text style={[s.link, { marginTop: 8 }]}>🧭 {tx('Yol tarifi al', 'Get directions', 'Route anzeigen')}</Text>
</TouchableOpacity>
))}
{results.map((r) => (
<TouchableOpacity key={r.id} style={s.resultCard} activeOpacity={0.75} onPress={() => askDirections(r)}>
<Text style={s.resultTitle}>{r.title}</Text>
<Text style={s.resultDesc}>{r.description}</Text>
<View style={s.resultMeta}>
{!!r.distance && <Text style={s.resultMetaText}>📍 {r.distance}</Text>}
{!!r.minutesText && <Text style={s.resultMetaText}>🕒 ~{r.minutesText}</Text>}
<Text style={s.resultMetaText}>
{r.fit === 'fits' ? '💰 ' : r.fit === 'tight' ? '⚠️ ' : r.fit === 'over' ? '🚫 ' : '💰 '}
{r.fit === 'fits'
? tx('Bütçene uygun', 'Fits your budget', 'Passt zum Budget')
: r.fit === 'tight'
? tx('Bütçen sınırda', 'Budget is tight', 'Budget knapp')
: r.fit === 'over'
? tx('Bütçenin üstünde', 'Over your budget', 'Über dem Budget')
: tx('Bütçe girilmedi', 'No budget entered', 'Kein Budget')}
</Text>
</View>
{(!!r.phone || !!r.opening_hours) && (
<Text style={[s.cardMeta, { marginTop: 6 }]}>
{[r.opening_hours, r.phone].filter(Boolean).join('  ·  ')}
</Text>
)}
<Text style={[s.link, { marginTop: 8 }]}>🧭 {tx('Yol tarifi al', 'Get directions', 'Route anzeigen')}</Text>
</TouchableOpacity>
))}
{results.length > 0 && (
<Text
accessible
accessibilityRole="link"
accessibilityLabel={tx(
'© OpenStreetMap katkıda bulunanlar, ODbL lisansı ve telif bilgisi',
'© OpenStreetMap contributors, ODbL license and copyright information',
'© OpenStreetMap-Mitwirkende, ODbL-Lizenz und Urheberrecht'
)}
accessibilityHint={tx(
'OpenStreetMap telif ve lisans sayfasını açar.',
'Opens the OpenStreetMap copyright and license page.',
'Öffnet die Urheberrechts- und Lizenzseite von OpenStreetMap.'
)}
onPress={() => openLegal(OSM_COPYRIGHT_URL)}
style={{
  color: c.text,
  fontSize: 14,
  lineHeight: 20,
  textAlign: 'center',
  textDecorationLine: 'underline',
  paddingVertical: 8,
}}
>
{tx(
'© OpenStreetMap katkıda bulunanlar · ODbL',
'© OpenStreetMap contributors · ODbL',
'© OpenStreetMap-Mitwirkende · ODbL'
)}
</Text>
)}
</>
)}
</Screen>
);
};

export default TodayScreenView;
