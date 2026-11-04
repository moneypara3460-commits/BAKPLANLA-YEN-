import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HomeScreen = ({
s, c, tx, lang, today, userName, lifeScore, tasks,
goTab, navigate, openAddSheet, openNewTask, openTask, openTasksList, toggleTask,
isKoprusuActive: IS_KOPRUSU_AKTIF, Screen, LogoBadge, EmptyCard, TaskRow,
}) => {

const taskRow = { s, c, tx, lang, today, openTask, toggleTask };

const level =
lifeScore >= 80
? tx('Harika', 'Great', 'Großartig')
: lifeScore >= 60
? tx('İyi', 'Good', 'Gut')
: lifeScore >= 40
? tx('Orta', 'Fair', 'Mittel')
: tx('Geliştirilebilir', 'Can improve', 'Ausbaufähig');

const activeTasks = tasks.filter((t) => !t.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

const flow = [
{ icon: 'document-text-outline', label: tx('Belge', 'Document', 'Dokument') },
{ icon: 'sparkles-outline', label: tx('Analiz', 'Analysis', 'Analyse') },
{ icon: 'checkmark-circle-outline', label: tx('Görev', 'Task', 'Aufgabe') },
{ icon: 'flash-outline', label: tx('Fırsat', 'Opportunity', 'Chance') },
];

const tiles = [
{ icon: 'sparkles', title: 'PLAN AI', sub: tx('Belgelerin hakkında sor', 'Ask about your documents', 'Frag zu deinen Dokumenten'), to: 'ai' },
{ icon: 'flash', title: tx('Fırsat Motoru', 'Opportunity Engine', 'Chancen-Motor'), sub: tx('Belgeden fırsata', 'From document to opportunity', 'Vom Dokument zur Chance'), to: 'opportunities' },
{ icon: 'compass-outline', title: tx('Bugün Ne Yapsak?', 'What should we do today?', 'Was machen wir heute?'), sub: tx('Konum ve bütçeye göre', 'By location and budget', 'Nach Ort und Budget'), to: 'today' },
{ icon: 'qr-code-outline', title: tx('QR Merkezi', 'QR Center', 'QR-Zentrale'), sub: tx('Cihazlarını bağla', 'Connect your devices', 'Geräte verbinden'), to: 'qr' },
{ icon: 'cart-outline', title: tx('Akıllı Alışveriş', 'Smart Shopping', 'Intelligenter Einkauf'), sub: tx('Fişinden haftalık liste oluştur', 'Build a weekly list from a receipt', 'Wochenliste aus einem Kassenbon'), to: 'shopping' },
{ icon: 'briefcase-outline', title: tx('İş Başı', 'On the Job', 'Im Job'), sub: tx('Oyna, mesleği dene, ödül kazan', 'Play, try a job, earn rewards', 'Spielen, Beruf testen, gewinnen'), to: 'isbasi' },
{ icon: 'navigate-circle-outline', title: tx('PUSULA', 'COMPASS', 'KOMPASS'), sub: tx('Mesleğini keşfet', 'Discover your field', 'Entdecke dein Feld'), to: 'compass' },
...(IS_KOPRUSU_AKTIF ? [{ icon: 'git-network-outline', title: tx('İş Köprüsü', 'Job Bridge', 'Job-Brücke'), sub: tx('Meslek pasaportun', 'Your career passport', 'Dein Berufspass'), to: 'koprusu' }] : []),
];

return (
<Screen flush light>
<View style={s.homeHeader}>
<View style={s.homeTop}>
<View style={s.row}>
<LogoBadge size={42} />
<View>
<Text style={s.homeBrand}>BAKPLANLA</Text>
<Text style={s.homeTagline}>{tx('Hayatını Seninle Planlar.', 'PLAN your life with you.', 'Plane dein Leben mit dir.')}</Text>
</View>
</View>
<TouchableOpacity style={s.homeAvatar} onPress={() => goTab('profile')}>
<Ionicons name="person" size={22} color="#FFFFFF" />
</TouchableOpacity>
</View>

<Text style={s.homeHello}>
{tx('Merhaba', 'Hello', 'Hallo')}
{userName ? `, ${userName}` : ''} 👋
</Text>
<Text style={s.homeDesc}>
{tx(
'Belgelerini anla, görevlerini planla, hayatını kolaylaştır.',
'Understand your documents, plan your tasks, make life easier.',
'Verstehe deine Dokumente, plane deine Aufgaben, mach dir das Leben leichter.'
)}
</Text>

<View style={s.flowStrip}>
{flow.map((item) => (
<View key={item.icon} style={s.flowItem}>
<Ionicons name={item.icon} size={22} color={c.gold} />
<Text style={s.flowText}>{item.label}</Text>
</View>
))}
</View>

<TouchableOpacity style={s.goldBtn} onPress={openAddSheet}>
<Ionicons name="add-circle" size={20} color={c.dark} />
<Text style={s.goldBtnText}>{tx('Belge Ekle', 'Add Document', 'Dokument hinzufügen')}</Text>
</TouchableOpacity>
</View>

<View style={s.homeBody}>
<View style={s.scoreCard}>
<View style={s.flex1}>
<Text style={s.scoreLabel}>{tx('HAYAT SKORU', 'LIFE SCORE', 'LEBENSSCORE')}</Text>
<Text style={s.scoreLevel}>{level}</Text>
<Text style={s.scoreNote}>
{tx(
'Görev ve belgelerinden cihazında hesaplanır.',
'Calculated on your device from your tasks and documents.',
'Wird auf deinem Gerät aus Aufgaben und Dokumenten berechnet.'
)}
</Text>
</View>
<View style={s.scoreCircle}>
<Text style={s.scoreNumber}>{lifeScore}</Text>
<Text style={s.scoreMax}>/100</Text>
</View>
</View>

<View style={s.sectionHeader}>
<Text style={s.sectionTitle}>{tx('Keşfet', 'Explore', 'Entdecken')}</Text>
</View>
<View style={s.exploreGrid}>
{tiles.map((tile) => (
<TouchableOpacity key={tile.to} style={s.exploreTile} onPress={() => navigate(tile.to)}>
<View style={s.exploreIcon}>
<Ionicons name={tile.icon} size={22} color={c.gold} />
</View>
<Text style={s.exploreTitle}>{tile.title}</Text>
<Text style={s.exploreSub}>{tile.sub}</Text>
</TouchableOpacity>
))}
</View>

<View style={s.sectionHeader}>
<View>
<Text style={s.sectionTitle}>{tx('Görevlerim', 'My Tasks', 'Meine Aufgaben')}</Text>
<Text style={s.sectionSub}>
{activeTasks.length} {tx('aktif görev', 'active tasks', 'aktive Aufgaben')}
</Text>
</View>
<TouchableOpacity onPress={openTasksList}>
<Text style={s.link}>{tx('Tümü', 'All', 'Alle')}</Text>
</TouchableOpacity>
</View>

{activeTasks.length === 0 ? (
<EmptyCard
badge="✓"
title={tx('Aktif görev yok', 'No active tasks', 'Keine aktiven Aufgaben')}
text={tx('Yeni bir görev ekleyerek başlayabilirsin.', 'Start by adding a new task.', 'Beginne mit einer neuen Aufgabe.')}
buttonLabel={tx('Görev Ekle', 'Add Task', 'Aufgabe hinzufügen')}
onPress={() => openNewTask()}
/>
) : (
activeTasks.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} mode="upcoming" taskRow={taskRow} />)
)}
</View>
</Screen>
);
};

export default HomeScreen;
