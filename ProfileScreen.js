import React from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ProfileScreen = ({
s, c, tx, userName, session, navigate, setShowPlanModal, setShowAppearanceModal, setShowAuthModal, resetData, deleteAccount, accountDeleting, proActive, proInfo, notifPrefs,
isletmePanelActive: ISLETME_PANELI_AKTIF, appVersion: APP_VERSION, supportEmail: SUPPORT_EMAIL, legalUrls: LEGAL_URLS, openLegal, withdrawAiConsent, Screen, ScreenHeader, MenuRow,
}) => {

return (
<Screen>
<ScreenHeader title={tx('Profil', 'Profile', 'Profil')} subtitle={tx('Hesabını yönet, tercihlerini düzenle.', 'Manage your account and preferences.', 'Konto verwalten, Einstellungen anpassen.')} />

<TouchableOpacity style={s.userCard} onPress={() => (session?.user?.id ? setShowPlanModal(true) : setShowAuthModal(true))}>
<View style={s.userAvatar}>
<Ionicons name="person" size={32} color="#9BA7A3" />
</View>
<View style={s.flex1}>
<Text style={s.userName}>{userName || (session?.user?.email ? session.user.email.split('@')[0] : tx('Misafir', 'Guest', 'Gast'))}</Text>
<Text style={s.userSub}>{session?.user?.email || tx('Giriş yapılmadı — dokun ve giriş yap', 'Not signed in — tap to sign in', 'Nicht angemeldet — tippen zum Anmelden')}</Text>
<TouchableOpacity style={s.proPill} onPress={() => navigate('pro')}>
<Text>👑</Text>
<Text style={s.proPillText}>
{proActive
? (proInfo.state === 'pro_canceled'
? tx('Pro (yenilenmeyecek)', 'Pro (not renewing)', 'Pro (keine Verlängerung)')
: tx('BAKPLANLA Pro', 'BAKPLANLA Pro', 'BAKPLANLA Pro'))
: tx('Pro’ya Yükselt', 'Upgrade to Pro', 'Auf Pro upgraden')}
</Text>
</TouchableOpacity>
</View>
<Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
</TouchableOpacity>

<MenuRow icon="person-outline" title={tx('Planım', 'My Plan', 'Mein Plan')} subtitle={tx('Kişisel bilgiler ve tercihler', 'Personal info and preferences', 'Persönliche Angaben und Einstellungen')} onPress={() => setShowPlanModal(true)} />
<MenuRow icon="cloud-outline" title={tx('Bulut ve Yedekleme', 'Cloud & Backup', 'Cloud & Backup')} subtitle={tx('Verilerini yedekle ve geri yükle', 'Back up and restore your data', 'Daten sichern und wiederherstellen')} onPress={() => navigate('cloud')} />
<MenuRow
icon="notifications-outline"
title={tx('Bildirimler', 'Notifications', 'Benachrichtigungen')}
subtitle={notifPrefs.taskReminders
? tx(`Görev hatırlatmaları açık (${String(notifPrefs.hour).padStart(2, '0')}:00)`, `Task reminders on (${String(notifPrefs.hour).padStart(2, '0')}:00)`, `Erinnerungen an (${String(notifPrefs.hour).padStart(2, '0')}:00)`)
: tx('Görev hatırlatmaları kapalı', 'Task reminders are off', 'Erinnerungen aus')}
onPress={() => navigate('notifications')}
/>
<MenuRow icon="gift-outline" title={tx('Promosyon Kodu', 'Promo Code', 'Aktionscode')} subtitle={proActive ? tx('BAKPLANLA Pro aktif', 'BAKPLANLA Pro is active', 'BAKPLANLA Pro ist aktiv') : tx('Kodunu gir, Pro’yu ücretsiz aç', 'Enter your code to unlock Pro', 'Code eingeben, Pro freischalten')} onPress={() => navigate('promo')} />
<MenuRow icon="storefront-outline" title={tx('İşletmeni Tanıt', 'Promote your business', 'Betrieb vorstellen')} subtitle={tx('İşletmeni BAKPLANLA’da göster', 'Show your business on BAKPLANLA', 'Zeige deinen Betrieb auf BAKPLANLA')} onPress={() => navigate('isletmeTanit')} />
{false && <MenuRow
icon="compass-outline"
title={tx('PUSULA — Mesleğini Keşfet', 'COMPASS — Discover your field', 'KOMPASS — Entdecke dein Feld')}
subtitle={tx('Kısa ilgi testi, cihazında kalır', 'A short interest test, stays on your device', 'Kurzer Interessentest, bleibt auf dem Gerät')}
onPress={() => navigate('compass')}
/>}
<MenuRow icon="qr-code-outline" title={tx('QR Merkezi', 'QR Center', 'QR-Zentrale')} subtitle={tx('Cihazlarını bağla', 'Connect your devices', 'Geräte verbinden')} onPress={() => navigate('qr')} />
{ISLETME_PANELI_AKTIF && <MenuRow icon="storefront-outline" title={tx('İşletme Paneli', 'Business Panel', 'Betriebsbereich')} subtitle={tx('İş Köprüsü: deneme vardiyası ilanları ve adaylar', 'Job Bridge: trial shifts and candidates', 'Job-Brücke: Probeschichten und Kandidaten')} onPress={() => navigate('koprusuBiz')} />}
<MenuRow
icon="shield-checkmark-outline"
title={tx('Gizlilik ve Güvenlik', 'Privacy & Security', 'Datenschutz & Sicherheit')}
subtitle={tx('Verilerin nerede tutuluyor?', 'Where is your data kept?', 'Wo liegen deine Daten?')}
onPress={() =>
Alert.alert(
tx('Gizlilik ve Güvenlik', 'Privacy & Security', 'Datenschutz & Sicherheit'),
tx(
'• Görevlerin, belgelerin ve ayarların öncelikle BU CİHAZDA tutulur.\n• Yedekleme yaparsan bunlar yalnızca hesabına açık, kapalı bir alanda (Supabase) saklanır.\n• Yapay zekâ özelliklerinde gönderdiğin belge veya soru, analiz için OpenAI\'ye (yurt dışı) iletilir; izin vermeden hiçbir şey gönderilmez.\n• GPS konumun cihazından çıkmaz.\n• Reklam ve takip aracı yok, verilerin satılmaz.\n• Hesabını ve tüm verilerini aşağıdan kalıcı olarak silebilirsin.',
'• Your tasks, documents and settings are kept on THIS DEVICE first.\n• If you back up, they are stored in a private area only your account can access (Supabase).\n• For AI features, the document or question you send goes to OpenAI (abroad) for analysis; nothing is sent without your permission.\n• Your GPS location never leaves your device.\n• No ads or trackers; your data is never sold.\n• You can permanently delete your account and all data below.',
'• Aufgaben, Dokumente und Einstellungen liegen zuerst auf DIESEM GERÄT.\n• Beim Backup werden sie in einem privaten, nur für dein Konto zugänglichen Bereich (Supabase) gespeichert.\n• Für KI-Funktionen geht dein Dokument bzw. deine Frage zur Analyse an OpenAI (Ausland); ohne Zustimmung wird nichts gesendet.\n• Dein GPS-Standort verlässt das Gerät nicht.\n• Keine Werbung, keine Tracker, kein Datenverkauf.\n• Du kannst Konto und Daten unten dauerhaft löschen.'
),
[
{ text: tx('Gizlilik Politikası', 'Privacy Policy', 'Datenschutzerklärung'), onPress: () => openLegal(LEGAL_URLS.privacy) },
{
text: tx('Yapay zekâ iznini geri al', 'Withdraw AI consent', 'KI-Zustimmung widerrufen'),
onPress: async () => {
const ok = await withdrawAiConsent();
Alert.alert(
'BAKPLANLA',
ok
? tx('İznin geri alındı. Yapay zekâ özelliklerini bir dahaki kullanımında izin tekrar sorulacak.', 'Consent withdrawn. You will be asked again next time you use an AI feature.', 'Zustimmung widerrufen. Bei der nächsten KI-Nutzung wirst du erneut gefragt.')
: tx('İzin geri alınamadı. İnternet bağlantını kontrol edip tekrar dene.', 'Could not withdraw consent. Check your connection and try again.', 'Widerruf fehlgeschlagen. Prüfe deine Verbindung.')
);
},
},
{ text: tx('Tamam', 'OK', 'OK'), style: 'cancel' },
]
)
}
/>
<MenuRow icon="globe-outline" title={tx('Dil ve Görünüm', 'Language & Appearance', 'Sprache & Design')} subtitle={tx('Uygulama dilini ve temasını seç', 'Choose app language and theme', 'App-Sprache und Design wählen')} onPress={() => setShowAppearanceModal(true)} />
<MenuRow
icon="headset-outline"
title={tx('Destek', 'Support', 'Support')}
subtitle={tx('Sorların mı var? Biz buradayız.', 'Questions? We’re here.', 'Fragen? Wir sind da.')}
onPress={() =>
Alert.alert(
tx('Destek', 'Support', 'Support'),
tx(
`Sorun yaşarsan bize yazabilirsin:\n${SUPPORT_EMAIL}\n\nYazarken uygulama sürümünü (v${APP_VERSION}) ve ne yaptığında sorunun çıktığını eklersen daha hızlı yardımcı olabiliriz.`,
`If something goes wrong, write to us:\n${SUPPORT_EMAIL}\n\nPlease include the app version (v${APP_VERSION}) and what you were doing when it happened.`,
`Bei Problemen schreib uns:\n${SUPPORT_EMAIL}\n\nBitte nenne die App-Version (v${APP_VERSION}) und was du gerade gemacht hast.`
),
[
{
text: tx('E-posta Yaz', 'Write an e-mail', 'E-Mail schreiben'),
onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=BAKPLANLA%20v${APP_VERSION}`).catch(() => {}),
},
{ text: tx('Kapat', 'Close', 'Schließen'), style: 'cancel' },
]
)
}
/>
<MenuRow
icon="information-circle-outline"
title={tx('Hakkında', 'About', 'Über')}
subtitle={`BAKPLANLA v${APP_VERSION}`}
onPress={() => Alert.alert('BAKPLANLA', `BAKPLANLA v${APP_VERSION}\n${tx('Hayatını Seninle Planlar.', 'PLAN your life with you.', 'Plane dein Leben mit dir.')}`)}
/>

<TouchableOpacity style={[s.dangerBtn, { marginTop: 8 }]} onPress={resetData}>
<Text style={s.dangerBtnText}>{tx('Verilerimi Sil', 'Delete my data', 'Meine Daten löschen')}</Text>
</TouchableOpacity>

{!!session?.user?.id && (
<TouchableOpacity
style={[s.dangerBtn, { backgroundColor: c.red, borderColor: c.red, opacity: accountDeleting ? 0.6 : 1 }]}
disabled={accountDeleting}
onPress={deleteAccount}
>
{accountDeleting
? <ActivityIndicator color="#FFFFFF" />
: <Text style={[s.dangerBtnText, { color: '#FFFFFF' }]}>{tx('Hesabımı Sil', 'Delete my account', 'Mein Konto löschen')}</Text>}
</TouchableOpacity>
)}
<Text style={s.note}>
{tx('"Verilerimi Sil" yalnızca bu cihazdaki verileri siler; hesabın kalır. "Hesabımı Sil" hesabını ve buluttaki her şeyi kalıcı olarak siler.', '"Delete my data" only clears this device; your account remains. "Delete my account" permanently removes your account and everything in the cloud.', '"Meine Daten löschen" betrifft nur dieses Gerät. "Mein Konto löschen" entfernt Konto und Cloud-Daten dauerhaft.')}
</Text>
<Text style={s.versionText}>BAKPLANLA v{APP_VERSION}</Text>
</Screen>
);
};

export default ProfileScreen;
