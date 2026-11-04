import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dateLocaleFor } from './helpers';

const ProScreen = ({
s, c, tx, lang, goBack, entitlement, proActive, proInfo, refreshEntitlement, backupErrorText, Screen, ScreenHeader,
}) => {

const [plan, setPlan] = useState('yearly');

useEffect(() => { refreshEntitlement(); }, []);

const dateLocale = dateLocaleFor(lang);
const periodText = proInfo.periodEnd ? new Date(proInfo.periodEnd).toLocaleDateString(dateLocale) : '';

const features = [
tx('Sınırsız belge analizi', 'Unlimited document analysis', 'Unbegrenzte Dokumentenanalyse'),
tx('Gelişmiş fırsat motoru', 'Advanced opportunity engine', 'Erweiterter Chancen-Motor'),
tx('Daha fazla depolama alanı', 'More storage space', 'Mehr Speicherplatz'),
tx('Öncelikli yeni özellikler', 'Priority access to new features', 'Neue Funktionen zuerst'),
tx('Detaylı rapor ve analizler', 'Detailed reports and analyses', 'Detaillierte Berichte und Analysen'),
tx('Reklamsız deneyim', 'Ad-free experience', 'Werbefreie Nutzung'),
tx('Öncelikli müşteri desteği', 'Priority customer support', 'Priorisierter Kundensupport'),
];

return (
<Screen>
<ScreenHeader title="BAKPLANLA Pro" subtitle={tx('Daha fazlası seninle mümkün.', 'More is possible with you.', 'Mit dir ist mehr möglich.')} />

{/* Yetki durumu sunucudan okunur; uygulama kendi kendine "Pro" diyemez. */}
<View style={s.softCard}>
<Text style={s.cardTitle}>{tx('Durumun', 'Your status', 'Dein Status')}</Text>
{entitlement.state === 'loading' ? (
<ActivityIndicator size="small" color={c.green} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
) : (
<Text style={[s.cardMeta, { fontWeight: '700' }]}>
{entitlement.state === 'idle'
? tx('Giriş yapmadın. Pro durumu hesabına bağlıdır.', 'You are not signed in. Pro status is tied to your account.', 'Nicht angemeldet. Der Pro-Status hängt am Konto.')
: entitlement.state === 'error'
? (entitlement.reason === 'setup'
? tx('Abonelik sistemi bu projede henüz kurulmadı (supabase/bakplanla_pro.sql).', 'The subscription system is not set up in this project yet (supabase/bakplanla_pro.sql).', 'Das Abo-System ist in diesem Projekt noch nicht eingerichtet.')
: backupErrorText(tx, entitlement.reason))
: proActive
? (proInfo.state === 'pro_canceled'
? tx(`Pro üyeliğin ${periodText} tarihine kadar sürüyor, sonra yenilenmeyecek.`, `Your Pro access runs until ${periodText} and will not renew.`, `Dein Pro-Zugang läuft bis ${periodText} und wird nicht verlängert.`)
: tx(`BAKPLANLA Pro aktif${periodText ? ` — ${periodText} tarihine kadar` : ''}.`, `BAKPLANLA Pro is active${periodText ? ` — until ${periodText}` : ''}.`, `BAKPLANLA Pro ist aktiv${periodText ? ` — bis ${periodText}` : ''}.`))
: proInfo.state === 'expired'
? tx('Pro üyeliğinin süresi dolmuş.', 'Your Pro membership has expired.', 'Deine Pro-Mitgliedschaft ist abgelaufen.')
: tx('Ücretsiz sürümü kullanıyorsun. Yapay zekâ özelliklerinde ilk kullanım ücretsizdir.', 'You are on the free version. AI features are free the first time you use them.', 'Du nutzt die kostenlose Version. KI-Funktionen sind beim ersten Mal gratis.')}
</Text>
)}
</View>

<View style={s.heroCard}>
<View style={s.heroIconBox}>
<Text style={{ fontSize: 30 }}>👑</Text>
</View>
<Text style={s.heroTitle}>{tx('BAKPLANLA Pro ile hayatını yükselt.', 'Elevate your life with BAKPLANLA Pro.', 'Hebe dein Leben mit BAKPLANLA Pro.')}</Text>
<Text style={s.heroDesc}>{tx('Daha fazla özellik, daha fazla fırsat, daha fazla kontrol.', 'More features, more opportunities, more control.', 'Mehr Funktionen, mehr Chancen, mehr Kontrolle.')}</Text>
</View>

<View style={s.proTabs}>
{[
{ key: 'monthly', label: tx('Aylık', 'Monthly', 'Monatlich') },
{ key: 'yearly', label: tx('Yıllık  %33 avantajlı', 'Yearly  33% better value', 'Jährlich  33 % günstiger') },
].map((item) => (
<TouchableOpacity key={item.key} style={[s.segmentItem, plan === item.key && s.segmentItemActive]} onPress={() => setPlan(item.key)}>
<Text style={[s.segmentText, plan === item.key && s.segmentTextActive]}>{item.label}</Text>
</TouchableOpacity>
))}
</View>

<View style={{ marginTop: 6 }}>
{features.map((text) => (
<View key={text} style={s.checkRow}>
<Ionicons name="checkmark-circle" size={20} color={c.green} />
<Text style={s.checkText}>{text}</Text>
</View>
))}
</View>

<TouchableOpacity style={[s.planCard, plan === 'monthly' && s.planCardActive]} onPress={() => setPlan('monthly')}>
<View style={s.row}>
<View style={[s.radio, plan === 'monthly' && s.radioActive]}>{plan === 'monthly' && <View style={s.radioDot} />}</View>
<View>
<Text style={s.planName}>{tx('Aylık BAKPLANLA Pro', 'Monthly BAKPLANLA Pro', 'BAKPLANLA Pro monatlich')}</Text>
<Text style={s.planPrice}>₺249,99 <Text style={s.cardMeta}>{tx('/ay', '/mo', '/Monat')}</Text></Text>
</View>
</View>
</TouchableOpacity>

<TouchableOpacity style={[s.planCard, plan === 'yearly' && s.planCardActive]} onPress={() => setPlan('yearly')}>
<View style={s.popularTag}>
<Text style={s.popularText}>{tx('En Popüler', 'Most Popular', 'Am beliebtesten')}</Text>
</View>
<View style={s.row}>
<View style={[s.radio, plan === 'yearly' && s.radioActive]}>{plan === 'yearly' && <View style={s.radioDot} />}</View>
<View>
<Text style={s.planName}>{tx('Yıllık BAKPLANLA Pro', 'Yearly BAKPLANLA Pro', 'BAKPLANLA Pro jährlich')}</Text>
<Text style={s.cardMeta}>{tx('12 ay boyunca', 'For 12 months', 'Für 12 Monate')}</Text>
<View style={[s.row, { marginTop: 4 }]}>
<Text style={s.strike}>₺2.999,88</Text>
<Text style={s.planPrice}>₺2.000 <Text style={s.cardMeta}>{tx('/yıl', '/yr', '/Jahr')}</Text></Text>
</View>
</View>
</View>
<View style={s.saveTag}>
<Text style={s.popularText}>{tx('%33 Tasarruf', '33% Savings', '33 % Ersparnis')}</Text>
</View>
</TouchableOpacity>

{proActive ? (
<View style={s.softCard}>
<Text style={s.cardTitle}>{tx('Aboneliğini yönet', 'Manage your subscription', 'Abo verwalten')}</Text>
<Text style={s.cardMeta}>
{tx('Abonelik uygulama mağazası üzerinden yönetilecektir. Ödeme sistemi bağlanana kadar buradan iptal/yenileme yapılamaz.', 'Your subscription will be managed through the app store. Until the payment system is connected, you cannot cancel or renew here.', 'Das Abo wird über den App-Store verwaltet. Bis die Zahlung angebunden ist, ist hier keine Kündigung möglich.')}
</Text>
</View>
) : (
<TouchableOpacity
style={s.darkBtn}
onPress={() =>
Alert.alert(
'BAKPLANLA Pro',
tx(
'Ödeme altyapısı henüz bağlanmadı; şu an gerçek bir satın alma yapılamaz ve kimse Pro\u2019ya geçirilmez.\n\nPro özellikleri denemek istersen, sunucudaki abonelik tablosuna hesabın için elle kayıt eklenebilir (supabase/bakplanla_pro.sql dosyasının sonunda anlatıldı).',
'The payment system is not connected yet; no real purchase can be made and no one is switched to Pro.\n\nTo try Pro, a record can be added manually for your account in the subscription table (explained at the end of supabase/bakplanla_pro.sql).',
'Die Zahlung ist noch nicht angebunden; es ist kein echter Kauf möglich.\n\nZum Testen kann in der Abo-Tabelle manuell ein Eintrag angelegt werden (siehe Ende von supabase/bakplanla_pro.sql).'
),
[{ text: tx('Tamam', 'OK', 'OK'), onPress: goBack }]
)
}
>
<Text style={s.darkBtnText}>{tx('Pro’ya Yükselt', 'Upgrade to Pro', 'Auf Pro upgraden')}</Text>
</TouchableOpacity>
)}

<Text style={s.note}>
{tx('Fiyatlar: aylık 249,99 TL, yıllık 2.000 TL. Ödeme altyapısı bağlanmadan bu ekrandan tahsilat yapılmaz.', 'Prices: 249.99 TL monthly, 2,000 TL yearly. No payment is taken from this screen until the payment system is connected.', 'Preise: 249,99 TL monatlich, 2.000 TL jährlich. Ohne angebundene Zahlung wird hier nichts abgebucht.')}
</Text>
</Screen>
);
};

export default ProScreen;
