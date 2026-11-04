import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { docForAi, fitDocsForAi } from './receipts';
import { makeSmartError, smartErrorMessage } from './helpers';

const OpportunitiesScreenView = ({ s, c, tx, lang, documents, dataScopeGeneration, isCurrentDataScope, requestOpportunities, logSmartError, Screen, ScreenHeader }) => {

const [loadedOpportunities, setLoadedOpportunities] = useState([]);
const [loadedScopeGeneration, setLoadedScopeGeneration] = useState(dataScopeGeneration);
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const opportunities = loadedScopeGeneration === dataScopeGeneration ? loadedOpportunities : [];
// Each request gets an ID; only the latest request may update the screen.
const requestIdRef = useRef(0);
const inFlightKeyRef = useRef(null);

const getOpportunityStyle = (type) => {
switch (type) {
case 'saving':
return {
icon: 'wallet-outline',
color: c.green,
};

case 'deadline':
return {
icon: 'calendar-outline',
color: c.orange,
};

case 'campaign':
return {
icon: 'pricetag-outline',
color: c.blue,
};

case 'warning':
return {
icon: 'warning-outline',
color: c.red || '#E56B5D',
};

case 'action':
default:
return {
icon: 'flash-outline',
color: c.green,
};
}
};

const loadOpportunities = async () => {
const isCurrentRequest = (requestId, scopeGeneration) =>
requestId === requestIdRef.current &&
(typeof isCurrentDataScope !== 'function' || isCurrentDataScope(scopeGeneration));
if (!documents || !documents.length) {
requestIdRef.current += 1;
inFlightKeyRef.current = null;
setLoading(false);
setLoadedOpportunities([]);
return;
}

const analyzedDocuments = fitDocsForAi(documents
.filter((doc) => doc && doc.analysis)
.map(docForAi))
.map((doc) => ({
id: doc.id,
title: doc.title || null,
type: doc.type || null,
analyzed: doc.analyzed || false,
analysis: doc.analysis || null,
}));

if (!analyzedDocuments.length) {
requestIdRef.current += 1;
inFlightKeyRef.current = null;
setLoading(false);
setLoadedOpportunities([]);
return;
}

// Do not duplicate a request for the same scoped document snapshot while it is in flight.
let requestKey = '';
try {
requestKey = JSON.stringify({ scope: dataScopeGeneration, documents: analyzedDocuments });
} catch (keyError) {
requestKey = `${String(dataScopeGeneration)}:${String(analyzedDocuments.length)}:${requestIdRef.current + 1}`;
}
if (inFlightKeyRef.current === requestKey) return;

requestIdRef.current += 1;
const myRequestId = requestIdRef.current;
inFlightKeyRef.current = requestKey;

setLoading(true);
setError('');

try {
const data = await requestOpportunities(analyzedDocuments, () => isCurrentRequest(myRequestId, dataScopeGeneration));

if (!isCurrentRequest(myRequestId, dataScopeGeneration)) return;

if (!data || typeof data !== 'object' || Array.isArray(data) || (data.opportunities !== undefined && !Array.isArray(data.opportunities))) {
throw makeSmartError('format');
}

const result = (data.opportunities || []).filter(
(item) => item && typeof item === 'object'
);

setLoadedOpportunities(result.slice(0, 5));
setLoadedScopeGeneration(dataScopeGeneration);
} catch (err) {
if (!isCurrentRequest(myRequestId, dataScopeGeneration)) return;
logSmartError('Opportunity Engine error:', err);

setError(
smartErrorMessage(err, lang, {
tr: 'Fırsatlar şu anda oluşturulamadı.',
en: 'Opportunities could not be generated right now.',
de: 'Chancen konnten derzeit nicht erstellt werden.',
})
);
} finally {
if (isCurrentRequest(myRequestId, dataScopeGeneration)) {
inFlightKeyRef.current = null;
setLoading(false);
}
}
};

useEffect(() => {
loadOpportunities();
}, [documents, dataScopeGeneration]);

// Ignore a pending response after the screen unmounts.
useEffect(
() => () => {
requestIdRef.current += 1;
inFlightKeyRef.current = null;
},
[]
);

return (
<Screen>
<ScreenHeader
title={tx(
'Fırsat Motoru',
'Opportunity Engine',
'Chancen-Motor'
)}
subtitle={tx(
'Belgelerindeki bilgileri fırsatlara dönüştür.',
'Turn document information into opportunities.',
'Mache aus Dokumentinformationen Chancen.'
)}
/>

<View style={s.heroCard}>
<View style={s.heroIconBox}>
<Ionicons
name="flash"
size={30}
color={c.dark}
/>
</View>

<Text style={s.heroTitle}>
{tx(
'Belgeden Fırsata',
'Document to Opportunity',
'Vom Dokument zur Chance'
)}
</Text>

<Text style={s.heroDesc}>
{tx(
'PLAN, analiz edilmiş belgelerini inceleyerek senin için önemli olabilecek fırsatları bulur.',
'PLAN analyzes your documents to find opportunities that may be useful to you.',
'PLAN analysiert deine Dokumente und findet Chancen, die für dich nützlich sein können.'
)}
</Text>
</View>

{!documents || documents.length === 0 ? (
<View style={s.statusCard}>
<View
style={[
s.statusDot,
{ backgroundColor: c.muted },
]}
/>

<View style={s.flex1}>
<Text style={s.cardTitle}>
{tx(
'Henüz belge yok',
'No documents yet',
'Noch keine Dokumente'
)}
</Text>

<Text style={s.cardMeta}>
{tx(
'Fırsatları görmek için önce bir belge ekle ve analiz et.',
'Add and analyze a document to discover opportunities.',
'Füge ein Dokument hinzu und analysiere es, um Chancen zu entdecken.'
)}
</Text>
</View>
</View>
) : loading ? (
<View style={s.statusCard}>
<ActivityIndicator
size="small"
color={c.green}
/>

<View
style={[
s.flex1,
{ marginLeft: 12 },
]}
>
<Text style={s.cardTitle}>
{tx(
'Fırsatlar aranıyor...',
'Finding opportunities...',
'Chancen werden gesucht...'
)}
</Text>

<Text style={s.cardMeta}>
{tx(
'PLAN belgelerini inceliyor.',
'PLAN is analyzing your documents.',
'PLAN analysiert deine Dokumente.'
)}
</Text>
</View>
</View>
) : error ? (
<View style={s.statusCard}>
<View
style={[
s.statusDot,
{ backgroundColor: c.red || '#E56B5D' },
]}
/>

<View style={s.flex1}>
<Text style={s.cardTitle}>
{tx(
'Fırsat Motoru',
'Opportunity Engine',
'Chancen-Motor'
)}
</Text>

<Text style={s.cardMeta}>
{error}
</Text>

<TouchableOpacity
onPress={() => loadOpportunities()}
style={[
s.smallButton,
{
marginTop: 10,
alignSelf: 'flex-start',
},
]}
>
<Text style={s.smallButtonText}>
{tx(
'Tekrar Dene',
'Try Again',
'Erneut versuchen'
)}
</Text>
</TouchableOpacity>
</View>
</View>
) : opportunities.length === 0 ? (
<View style={s.statusCard}>
<View
style={[
s.statusDot,
{ backgroundColor: c.green },
]}
/>

<View style={s.flex1}>
<Text style={s.cardTitle}>
{tx(
'Şu anda fırsat bulunamadı',
'No opportunities found',
'Keine Chancen gefunden'
)}
</Text>

<Text style={s.cardMeta}>
{tx(
'PLAN belgelerinde dikkat edilmesi gereken belirgin bir fırsat bulamadı.',
'PLAN did not find a clear opportunity in your documents.',
'PLAN hat in deinen Dokumenten keine klare Chance gefunden.'
)}
</Text>
</View>
</View>
) : (
<>
{opportunities.map((item, index) => {
const style = getOpportunityStyle(item?.type);

return (
<View
style={s.oppCard}
key={`${item?.title || 'opportunity'}-${index}`}
>
<View
style={[
s.oppIcon,
{
backgroundColor: `${style.color}22`,
},
]}
>
<Ionicons
name={style.icon}
size={22}
color={style.color}
/>
</View>

<View style={s.flex1}>
<Text style={s.cardTitle}>
{item?.title ||
tx(
'PLAN Fırsatı',
'PLAN Opportunity',
'PLAN Chance'
)}
</Text>

<Text style={s.stepText}>
{item?.description ||
tx(
'Bu belgeyle ilgili bir fırsat bulundu.',
'An opportunity was found for this document.',
'Für dieses Dokument wurde eine Chance gefunden.'
)}
</Text>

{item?.action ? (
<Text
style={[
s.cardMeta,
{ marginTop: 7 },
]}
>
{tx(
'Önerilen işlem: ',
'Suggested action: ',
'Empfohlene Aktion: '
)}
{item.action}
</Text>
) : null}
</View>
</View>
);
})}

<View style={s.statusCard}>
<View
style={[
s.statusDot,
{ backgroundColor: c.green },
]}
/>

<View style={s.flex1}>
<Text style={s.cardTitle}>
{tx(
`${opportunities.length} fırsat bulundu`,
`${opportunities.length} opportunities found`,
`${opportunities.length} Chancen gefunden`
)}
</Text>

<Text style={s.cardMeta}>
{tx(
'Fırsatlar, analiz edilmiş belgelerindeki bilgilere göre PLAN AI tarafından oluşturuldu.',
'Opportunities were generated by PLAN AI from your analyzed documents.',
'Die Chancen wurden von PLAN AI aus deinen analysierten Dokumenten erstellt.'
)}
</Text>
</View>
</View>
</>
)}
</Screen>
);
};

export default OpportunitiesScreenView;
