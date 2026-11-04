import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { buildPairingPayload, parsePairingPayload, describePlatform, formatLastSeen, secondsLeft } from './devices';
import { createQrMatrix } from './qrcode';

const QrScreenView = ({ s, c, tx, lang, userId, setShowAuthModal, deviceId, deviceName, dataScopeGeneration, isCurrentDataScope, services, backupErrorText, Screen, ScreenHeader, EmptyCard }) => {
const [tab, setTab] = useState('qr');
const [pairingState, setPairingState] = useState({ generation: dataScopeGeneration, value: { state: 'idle', code: null, expiresAt: null, reason: null } });
const pairing = pairingState.generation === dataScopeGeneration ? pairingState.value : { state: 'idle', code: null, expiresAt: null, reason: null };
const [left, setLeft] = useState(0);
const [devicesState, setDevicesState] = useState({ generation: dataScopeGeneration, value: { state: 'idle', list: [], reason: null } });
const devices = devicesState.generation === dataScopeGeneration ? devicesState.value : { state: 'idle', list: [], reason: null };
const [scanningState, setScanningState] = useState({ generation: dataScopeGeneration, value: false });
const scanning = scanningState.generation === dataScopeGeneration && scanningState.value;
const [scanBusyState, setScanBusyState] = useState({ generation: dataScopeGeneration, value: false });
const scanBusy = scanBusyState.generation === dataScopeGeneration && scanBusyState.value;
const [permission, requestCameraPermission] = useCameraPermissions();
const codeInFlightRef = useRef(null);
const scanOperationRef = useRef(null);
const listRequestRef = useRef(0);
const mountedRef = useRef(true);
const currentScopeRef = useRef({ generation: dataScopeGeneration, userId, isCurrentDataScope });
currentScopeRef.current = { generation: dataScopeGeneration, userId, isCurrentDataScope };
const signedIn = !!userId;
const isCurrent = (generation, uid = userId) => mountedRef.current && generation === currentScopeRef.current.generation && uid === currentScopeRef.current.userId && (typeof currentScopeRef.current.isCurrentDataScope !== 'function' || currentScopeRef.current.isCurrentDataScope(generation));

// QR payloads contain pairing codes only; the server binds redemption to the current authenticated user.
const qr = useMemo(
() => (pairing.code ? createQrMatrix(buildPairingPayload(pairing.code)) : null),
[pairing.code]
);

const loadDevices = async (generation = dataScopeGeneration, uid = userId) => {
const requestId = ++listRequestRef.current;
if (!uid) { if (isCurrent(generation)) setDevicesState({ generation, value: { state: 'idle', list: [], reason: null } }); return; }
if (isCurrent(generation)) setDevicesState({ generation, value: { ...devices, state: 'loading' } });
const res = await services.listDevices(uid);
if (!isCurrent(generation) || requestId !== listRequestRef.current) return;
setDevicesState({ generation, value: res.ok ? { state: 'ready', list: res.devices, reason: null } : { state: 'error', list: [], reason: res.reason } });
};

const newCode = async () => {
const generation = dataScopeGeneration;
if (codeInFlightRef.current?.generation === generation) return;
if (!signedIn) { setShowAuthModal(true); return; }
const operation = { generation };
codeInFlightRef.current = operation;
setPairingState({ generation, value: { state: 'loading', code: null, expiresAt: null, reason: null } });
try {
const res = await services.createPairingCode();
if (!isCurrent(generation) || codeInFlightRef.current !== operation) return;
setPairingState({ generation, value: res.ok
? { state: 'ready', code: res.code, expiresAt: res.expiresAt, reason: null }
: { state: 'error', code: null, expiresAt: null, reason: res.reason } });
} finally {
if (codeInFlightRef.current === operation) codeInFlightRef.current = null;
}
};

// Register only this installation; keep the server-side user identity authoritative.
useEffect(() => {
const generation = dataScopeGeneration;
const uid = userId;
if (!uid || !deviceId || !isCurrent(generation)) return;
services.upsertOwnDevice({ deviceId, name: deviceName, platform: Platform.OS });
loadDevices(generation, uid);
}, [userId, deviceId, dataScopeGeneration]);

useEffect(() => {
mountedRef.current = true;
return () => {
mountedRef.current = false;
listRequestRef.current += 1;
};
}, []);

// Expired codes disappear from the active QR payload, but remain visibly expired.
useEffect(() => {
const generation = dataScopeGeneration;
if (!pairing.expiresAt) { setLeft(0); return undefined; }
const tick = () => {
if (!isCurrent(generation)) return;
const remaining = secondsLeft(pairing.expiresAt);
setLeft(remaining);
if (remaining <= 0) setPairingState((cur) => cur.generation === generation && cur.value.code ? { ...cur, value: { ...cur.value, state: 'expired' } } : cur);
};
tick();
const timer = setInterval(tick, 1000);
return () => clearInterval(timer);
}, [pairing.expiresAt, dataScopeGeneration]);

const onScanned = async ({ data }) => {
const generation = dataScopeGeneration;
if (!isCurrent(generation) || !signedIn || (scanOperationRef.current && scanOperationRef.current.generation === generation)) return;
const parsed = parsePairingPayload(data);
if (!parsed.ok) return; // Ignore unrelated QR codes and keep scanning.
const operation = { generation };
scanOperationRef.current = operation;
setScanBusyState({ generation, value: true });
try {
const res = await services.redeemPairingCode({ code: parsed.code, deviceId, name: deviceName, platform: Platform.OS });
if (!isCurrent(generation) || scanOperationRef.current !== operation) return;
setScanningState({ generation, value: false });
if (!res.ok) {
Alert.alert('BAKPLANLA', backupErrorText(tx, res.reason));
return;
}
if (res.paired) {
Alert.alert('BAKPLANLA', tx('Cihaz hesabına eklendi.', 'The device was added to your account.', 'Das Gerät wurde deinem Konto hinzugefügt.', 'Das Gerät wurde deinem Konto hinzugefügt.'));
loadDevices(generation, userId);
return;
}
const message = res.reason === 'expired'
? tx('Kodun süresi dolmuş. Diğer cihazda yeni kod oluştur.', 'The code has expired. Create a new one on the other device.', 'Der Code ist abgelaufen. Erstelle auf dem anderen Gerät einen neuen.')
: res.reason === 'used'
? tx('Bu kod daha önce kullanılmış.', 'This code has already been used.', 'Dieser Code wurde bereits verwendet.')
: res.reason === 'self'
? tx('Bu kod başka bir hesaba ait. Her iki cihazda da aynı hesapla giriş yapmış olmalısın.', 'This code belongs to another account. Both devices must be signed in to the same account.', 'Dieser Code gehört zu einem anderen Konto. Beide Geräte müssen im selben Konto angemeldet sein.')
: tx('Kod tanınmadı.', 'The code was not recognised.', 'Der Code wurde nicht erkannt.');
Alert.alert('BAKPLANLA', message);
} finally {
if (scanOperationRef.current === operation) {
scanOperationRef.current = null;
if (isCurrent(generation)) setScanBusyState({ generation, value: false });
}
}
};

const startScan = async () => {
const generation = dataScopeGeneration;
if (!signedIn) { setShowAuthModal(true); return; }
if (Platform.OS === 'web') {
Alert.alert('BAKPLANLA', tx('Tarama yalnızca telefon uygulamasında çalışır.', 'Scanning only works in the phone app.', 'Das Scannen funktioniert nur in der Telefon-App.'));
return;
}
if (!permission || !permission.granted) {
const res = await requestCameraPermission();
if (!isCurrent(generation)) return;
if (!res || !res.granted) {
Alert.alert('BAKPLANLA', tx('QR taramak için kamera izni gerekiyor.', 'Camera permission is needed to scan a QR code.', 'Für das Scannen wird die Kameraberechtigung benötigt.'));
return;
}
}
if (isCurrent(generation)) setScanningState({ generation, value: true });
};

const unlink = (device) => {
const generation = dataScopeGeneration;
const uid = userId;
Alert.alert(
tx('Cihazı kaldır', 'Remove device', 'Gerät entfernen'),
tx(`"${device.name}" hesabındaki cihaz listesinden çıkarılacak.`, `"${device.name}" will be removed from your device list.`, `"${device.name}" wird aus deiner Geräteliste entfernt.`),
[
{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' },
{
text: tx('Kaldır', 'Remove', 'Entfernen'),
style: 'destructive',
onPress: async () => {
if (!isCurrent(generation) || !uid) return;
const res = await services.removeDevice(uid, device.device_id);
if (!isCurrent(generation)) return;
if (!res.ok) { Alert.alert('BAKPLANLA', backupErrorText(tx, res.reason)); return; }
loadDevices(generation, uid);
},
},
]
);
};

const cell = qr ? Math.floor(200 / qr.size) : 8;

return (
<Screen>
<ScreenHeader
title={tx('QR Merkezi', 'QR Center', 'QR-Zentrale')}
subtitle={tx('Cihazlarını bağla', 'Connect your devices', 'Geräte verbinden')}
/>

<View style={s.segment}>
<TouchableOpacity style={[s.segmentItem, tab === 'qr' && s.segmentItemActive]} onPress={() => setTab('qr')}>
<Text style={[s.segmentText, tab === 'qr' && s.segmentTextActive]}>{tx('QR Kodum', 'My QR', 'Mein QR')}</Text>
</TouchableOpacity>
<TouchableOpacity style={[s.segmentItem, tab === 'devices' && s.segmentItemActive]} onPress={() => { setTab('devices'); loadDevices(); }}>
<Text style={[s.segmentText, tab === 'devices' && s.segmentTextActive]}>{tx('Cihazlar', 'Devices', 'Geräte')}</Text>
</TouchableOpacity>
</View>

{tab === 'qr' ? (
<>
<View style={s.qrCard}>
{qr && qr.ok && pairing.state === 'ready' ? (
<>
<View style={[s.qrBox, { width: cell * qr.size + 24, height: cell * qr.size + 24 }]}>
{qr.matrix.map((row, r) => (
<View key={`qr-row-${r}`} style={{ flexDirection: 'row' }}>
{row.map((dark, col) => (
<View
key={`qr-cell-${r}-${col}`}
style={{ width: cell, height: cell, backgroundColor: dark ? '#0A3D33' : '#FFFFFF' }}
/>
))}
</View>
))}
</View>
<Text style={[s.cardTitle, { marginTop: 12, letterSpacing: 2, textAlign: 'center' }]}>{pairing.code}</Text>
<Text style={[s.note, { textAlign: 'center' }]}>
{left > 0
? tx(`Bu kod ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} sonra geçersiz olacak. Tek kullanımlıktır.`, `This code expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}. It can be used once.`, `Dieser Code läuft in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} ab. Einmalig nutzbar.`)
: tx('Kodun süresi doldu.', 'The code has expired.', 'Der Code ist abgelaufen.')}
</Text>
</>
) : (
<View style={{ alignItems: 'center', paddingVertical: 18 }}>
{pairing.state === 'loading' ? (
<ActivityIndicator color={c.green} />
) : (
<Text style={[s.note, { textAlign: 'center' }]}>
{!signedIn
? tx('Cihaz bağlamak için önce hesabınla giriş yapmalısın.', 'Sign in to your account first to link a device.', 'Melde dich zuerst an, um ein Gerät zu verbinden.')
: pairing.state === 'error'
? backupErrorText(tx, pairing.reason)
: pairing.state === 'expired'
? tx('Kodun süresi doldu. Yeni kod oluşturabilirsin.', 'The code expired. You can create a new one.', 'Der Code ist abgelaufen. Du kannst einen neuen erstellen.')
: tx('Diğer cihazda okutmak için tek kullanımlık bir kod oluştur.', 'Create a one-time code to scan on your other device.', 'Erstelle einen Einmal-Code zum Scannen auf deinem anderen Gerät.')}
</Text>
)}
</View>
)}

<TouchableOpacity style={s.shareBtn} onPress={newCode} disabled={pairing.state === 'loading'}>
<Ionicons name="refresh-outline" size={18} color={c.text} />
<Text style={s.shareText}>
{pairing.code ? tx('Yeni Kod Oluştur', 'Create New Code', 'Neuen Code erstellen') : tx('Kod Oluştur', 'Create Code', 'Code erstellen')}
</Text>
</TouchableOpacity>
</View>

<View style={[s.softCard, { marginTop: 14 }]}>
<View style={s.row}>
<Ionicons name="lock-closed" size={22} color={c.green} />
<View style={[s.flex1, { marginLeft: 12 }]}>
<Text style={s.cardTitle}>{tx('Güvenli Bağlantı', 'Secure Connection', 'Sichere Verbindung')}</Text>
<Text style={s.cardMeta}>
{tx(
'Kod 5 dakika geçerlidir, bir kez kullanılır ve sunucuda açık hâlde saklanmaz. QR ile oturum AKTARILMAZ: diğer cihazda da aynı hesapla giriş yapmış olman gerekir.',
'The code is valid for 5 minutes, can be used once and is not stored in plain text. The QR does NOT transfer your session: the other device must also be signed in to the same account.',
'Der Code gilt 5 Minuten, ist einmal nutzbar und wird nicht im Klartext gespeichert. Der QR überträgt KEINE Sitzung: Das andere Gerät muss im selben Konto angemeldet sein.'
)}
</Text>
</View>
</View>
</View>
</>
) : (
<>
<TouchableOpacity style={s.primaryBtn} onPress={startScan}>
<Text style={s.primaryBtnText}>{tx('QR Tara ve Bu Cihazı Ekle', 'Scan QR and Add This Device', 'QR scannen und Gerät hinzufügen')}</Text>
</TouchableOpacity>

<View style={s.card}>
<View style={s.row}>
<View style={s.menuIcon}>
<Ionicons name="phone-portrait-outline" size={22} color={c.green} />
</View>
<View style={s.flex1}>
<Text style={s.menuTitle}>{tx('Bu cihaz', 'This device', 'Dieses Gerät')}</Text>
<Text style={s.menuSub}>{deviceName}</Text>
</View>
<View style={[s.badge, { backgroundColor: c.green }]}>
<Text style={s.badgeText}>{tx('AKTİF', 'ACTIVE', 'AKTIV')}</Text>
</View>
</View>
</View>

{devices.state === 'loading' && <ActivityIndicator color={c.green} style={{ marginTop: 14 }} />}

{devices.state === 'error' && (
<Text style={[s.note, { marginTop: 10 }]}>{backupErrorText(tx, devices.reason)}</Text>
)}

{devices.state === 'ready' && devices.list.filter((d) => d.device_id !== deviceId).length === 0 && (
<EmptyCard
badge="QR"
title={tx('Bağlı başka cihaz yok', 'No other devices linked', 'Keine weiteren Geräte verbunden')}
text={tx('Diğer cihazında QR Merkezi’ni aç, kod oluştur ve buradan tara.', 'Open QR Center on your other device, create a code and scan it here.', 'Öffne auf dem anderen Gerät die QR-Zentrale, erstelle einen Code und scanne ihn hier.')}
/>
)}

{devices.state === 'ready' && devices.list.filter((d) => d.device_id !== deviceId).map((d) => (
<View key={d.device_id} style={s.menuRow}>
<View style={s.menuIcon}>
<Ionicons name="hardware-chip-outline" size={22} color={c.green} />
</View>
<View style={s.flex1}>
<Text style={s.menuTitle}>{d.name}</Text>
<Text style={s.menuSub}>{describePlatform(d.platform)} · {formatLastSeen(d.last_seen_at, lang)}</Text>
</View>
<TouchableOpacity onPress={() => unlink(d)}>
<Text style={[s.link, { color: c.red }]}>{tx('Kaldır', 'Remove', 'Entfernen')}</Text>
</TouchableOpacity>
</View>
))}
</>
)}

<Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
<View style={{ flex: 1, backgroundColor: '#000000' }}>
{Platform.OS !== 'web' && (
<CameraView
style={{ flex: 1 }}
facing="back"
barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
onBarcodeScanned={scanBusy ? undefined : onScanned}
/>
)}
<View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
<Text style={{ color: '#FFFFFF', textAlign: 'center', marginBottom: 14, fontSize: 15, fontWeight: '700' }}>
{scanBusy
? tx('Kod kontrol ediliyor...', 'Checking the code...', 'Code wird geprüft...')
: tx('Diğer cihazdaki QR kodunu çerçeveye al.', 'Point the camera at the QR code on your other device.', 'Richte die Kamera auf den QR-Code des anderen Geräts.')}
</Text>
<TouchableOpacity style={s.primaryBtn} onPress={() => setScanning(false)}>
<Text style={s.primaryBtnText}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text>
</TouchableOpacity>
</View>
</View>
</Modal>
</Screen>
);

};

export default QrScreenView;
