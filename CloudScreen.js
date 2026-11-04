import React, { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dateLocaleFor } from './helpers';

const CloudScreen = ({
s, c, tx, lang, session, setShowAuthModal, backupBusy, backupStatus, backupInfo, refreshBackupInfo, cloudMeta, refreshCloudMeta, runBackup, runRestore, undoRestore, deleteCloudBackup, backupErrorText, Screen, ScreenHeader,
}) => {

const signedIn = !!session?.user?.id;
useEffect(() => { refreshBackupInfo(); refreshCloudMeta(); }, [session?.user?.id]);
const busy = !!backupBusy || !signedIn;
const dateLocale = dateLocaleFor(lang);
const cloudText = (() => {
if (!signedIn) return tx('Giriş yapılmadı. Yedekleme için hesabınla giriş yapmalısın.', 'Not signed in. Sign in with your account to use backup.', 'Nicht angemeldet. Melde dich an, um das Backup zu nutzen.');
if (!cloudMeta || cloudMeta.state === 'loading') return tx('Sunucudaki yedek denetleniyor...', 'Checking the backup on the server...', 'Backup auf dem Server wird geprüft...');
if (cloudMeta.state === 'error') return backupErrorText(tx, cloudMeta.reason);
if (!cloudMeta.exists) return tx('Sunucuda bu hesaba ait yedek yok.', 'There is no backup for this account on the server.', 'Auf dem Server gibt es kein Backup für dieses Konto.');
const when = cloudMeta.updatedAt ? new Date(cloudMeta.updatedAt).toLocaleString(dateLocale) : '';
return tx(`Sunucudaki yedek: ${cloudMeta.taskCount} görev, ${cloudMeta.documentCount} belge${when ? ` — ${when}` : ''}.`, `Backup on the server: ${cloudMeta.taskCount} tasks, ${cloudMeta.documentCount} documents${when ? ` — ${when}` : ''}.`, `Backup auf dem Server: ${cloudMeta.taskCount} Aufgaben, ${cloudMeta.documentCount} Dokumente${when ? ` — ${when}` : ''}.`);
})();
const lastText = backupInfo && backupInfo.lastBackupAt
? new Date(backupInfo.lastBackupAt).toLocaleString(dateLocaleFor(lang))
: null;
const items = [
{ icon: 'cloud-upload-outline', title: tx('Manuel yedekleme', 'Manual backup', 'Manuelles Backup'), text: tx('Görevlerin, belge kayıtların ve tercihlerin hesabına yedeklenir. Otomatik yedekleme yok.', 'Your tasks, document records and preferences are backed up to your account. There is no automatic backup.', 'Aufgaben, Dokumenteinträge und Einstellungen werden in deinem Konto gesichert. Kein automatisches Backup.') },
{ icon: 'image-outline', title: tx('Belge görselleri de yedeklenir', 'Document images are backed up too', 'Dokumentbilder werden mitgesichert'), text: tx('Belge fotoğrafların hesabına özel, kapalı bir alanda saklanır ve geri yüklemede indirilir. Bunun için sunucuda görsel deposu kurulu olmalıdır (supabase/bakplanla_storage.sql).', 'Your document photos are stored in a private area tied to your account and downloaded when you restore. Image storage must be set up on the server (supabase/bakplanla_storage.sql).', 'Deine Dokumentfotos werden in einem privaten, kontogebundenen Bereich gespeichert und bei der Wiederherstellung geladen. Dafür muss der Bildspeicher auf dem Server eingerichtet sein.') },
{ icon: 'shield-checkmark-outline', title: tx('Güvenli geri yükleme', 'Safe restore', 'Sichere Wiederherstellung'), text: tx('Geri yükleme mevcut verilerini silmez; yalnızca eksikleri ekler. Öncesinde cihaz verilerinin kopyası alınır.', 'Restore never deletes your data; it only adds what is missing. A copy of your device data is saved first.', 'Die Wiederherstellung löscht nichts; sie ergänzt nur Fehlendes. Vorher wird eine Kopie der Gerätedaten gespeichert.') },
];
return (
<Screen>
<ScreenHeader title={tx('Bulut ve Yedekleme', 'Cloud & Backup', 'Cloud & Backup')} subtitle={tx('Verilerini hesabına yedekle ve geri yükle', 'Back up and restore your data with your account', 'Daten im Konto sichern und wiederherstellen')} />
<View style={s.softCard}>
<Text style={s.cardTitle}>{tx('Şu anki durum', 'Current status', 'Aktueller Stand')}</Text>
{signedIn && !!session?.user?.email && (
<Text style={s.cardMeta}>{tx('Hesap', 'Account', 'Konto')}: {session.user.email}</Text>
)}
<Text style={[s.cardMeta, { fontWeight: '700' }]}>{cloudText}</Text>
{signedIn && (
<TouchableOpacity disabled={!!backupBusy || (cloudMeta && cloudMeta.state === 'loading')} onPress={refreshCloudMeta} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
<Text style={{ color: c.green, fontWeight: '800', fontSize: 13 }}>{tx('Sunucu durumunu yenile', 'Refresh server status', 'Serverstatus aktualisieren')}</Text>
</TouchableOpacity>
)}
<Text style={s.cardMeta}>
{lastText
? tx(`Son yedek (bu cihazdan): ${lastText} — ${backupInfo.taskCount} görev, ${backupInfo.documentCount} belge.`, `Last backup (from this device): ${lastText} — ${backupInfo.taskCount} tasks, ${backupInfo.documentCount} documents.`, `Letztes Backup (von diesem Gerät): ${lastText} — ${backupInfo.taskCount} Aufgaben, ${backupInfo.documentCount} Dokumente.`)
: tx('Bu cihazdan henüz yedek alınmadı. Verilerin şu an yalnızca bu cihazda.', 'No backup has been made from this device yet. Your data is currently only on this device.', 'Von diesem Gerät wurde noch kein Backup erstellt. Deine Daten liegen nur auf diesem Gerät.')}
</Text>
{!!backupBusy && (
<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
<ActivityIndicator size="small" color={c.green} />
<Text style={[s.cardMeta, { marginLeft: 8, marginTop: 0 }]}>
{backupBusy === 'backup' ? tx('Yedekleniyor...', 'Backing up...', 'Sichern...') : backupBusy === 'restore' ? tx('Geri yükleniyor...', 'Restoring...', 'Wiederherstellen...') : tx('Siliniyor...', 'Deleting...', 'Löschen...')}
</Text>
</View>
)}
{!!backupStatus && (
<Text style={{ marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: '700', color: backupStatus.type === 'error' ? c.red : c.green }}>
{backupStatus.text}
</Text>
)}
</View>

{!signedIn && (
<TouchableOpacity style={s.primaryBtn} onPress={() => setShowAuthModal(true)}>
<Text style={s.primaryBtnText}>{tx('Giriş Yap / Kayıt Ol', 'Sign In / Sign Up', 'Anmelden / Registrieren')}</Text>
</TouchableOpacity>
)}
<TouchableOpacity disabled={busy} style={[s.primaryBtn, { opacity: busy ? 0.6 : 1 }]} onPress={runBackup}>
<Text style={s.primaryBtnText}>{tx('Şimdi Yedekle', 'Back Up Now', 'Jetzt sichern')}</Text>
</TouchableOpacity>
<TouchableOpacity disabled={busy} style={[s.secondaryBtn, { opacity: busy ? 0.6 : 1 }]} onPress={runRestore}>
<Text style={s.secondaryBtnText}>{tx('Yedekten Geri Yükle', 'Restore from Backup', 'Aus Backup wiederherstellen')}</Text>
</TouchableOpacity>
{!!backupInfo && backupInfo.hasPreRestore && (
<TouchableOpacity disabled={busy} style={[s.secondaryBtn, { opacity: busy ? 0.6 : 1 }]} onPress={undoRestore}>
<Text style={s.secondaryBtnText}>{tx('Son Geri Yüklemeyi Geri Al', 'Undo Last Restore', 'Letzte Wiederherstellung rückgängig')}</Text>
</TouchableOpacity>
)}
<TouchableOpacity disabled={busy} style={[s.dangerBtn, { opacity: busy ? 0.6 : 1 }]} onPress={deleteCloudBackup}>
<Text style={s.dangerBtnText}>{tx('Bulut Yedeğimi Sil', 'Delete My Cloud Backup', 'Mein Cloud-Backup löschen')}</Text>
</TouchableOpacity>

<View style={{ height: 14 }} />
{items.map((item) => (
<View key={item.title} style={s.menuRow}>
<View style={s.menuIcon}>
<Ionicons name={item.icon} size={22} color={c.green} />
</View>
<View style={s.flex1}>
<Text style={s.menuTitle}>{item.title}</Text>
<Text style={s.menuSub}>{item.text}</Text>
</View>
</View>
))}
</Screen>
);
};

export default CloudScreen;
