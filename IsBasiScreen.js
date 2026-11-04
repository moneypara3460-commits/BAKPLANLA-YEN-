import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createQrMatrix } from './qrcode';
import { pick, dateLocaleFor, getTodayISO, loadValue, loadValueStrict, saveValue } from './helpers';
import { pickByLang } from './arabic';
import { createScopeBoundSave } from './localDataScope';
import {
  ISBASI_KEY, POINTS as ISBASI_POINTS, SHIFTS_FOR_REWARD, REWARD_MIN_STARS, DAILY_REWARD_SHIFT_CAP,
  INGREDIENTS, ingredientByKey, recipeByKey, SIZES, levelInfo, roleLevels, roleLevelInfo, roleVenue,
  VENUES, ROLES, isRecipeVisible, tick, customerSatisfaction, summarizeShift, emptyProgress,
  normalizeProgress, applyShiftResult,
} from './isbasi';
import {
  MARKET_POINTS, DENOMINATIONS, BAG_PRICE, formatMoney, denominationLabel, cashierProduct,
  registerTotal, changeSum, aisleByKey, shelfProduct, formatDateTR, itemUsed, shelfLabelsVisible,
  discountedPrice, paymentMethod, slotFull,
} from './isbasiMarket';
import {
  evaluateShift, playerLevel, ACHIEVEMENTS, achievementById, missionById, dailyMissionIds, TIPS, MISSION_XP,
} from './isbasiCareer';
import { dispatch, createRoleShift } from './isbasiReplay';
import { couponQrPayload } from './isbasiServer';
import {
  ISBASI_SERVER_CACHE_KEY, ISBASI_PENDING_KEY, isPendingUsable, shouldKeepPending,
  finishWithDurablePending, startAfterPendingRecovery, selectPendingForRecovery, mergeCoupon, modeForError,
} from './isbasiApi';

const IB_MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const IB_LAYER = { espresso: '#5B3A29', water: '#B9DFF0', milk: '#F1E3CF', foam: '#FFFFFF', choc: '#3B2418', caramel: '#D99A3C', ice: '#CDEFF8', coldMilk: '#E6EFF3' };
// Select a stable customer face from the customer's name.
const IB_FACES_F = ['👩', '👩‍🦰', '👱‍♀️', '🧕', '👩‍🦳', '👵'];
const IB_FACES_M = ['👨', '🧔', '👨‍🦱', '👨‍🦳', '👴', '👱‍♂️'];
const IB_FEMALE_NAMES = ['Ayşe', 'Zeynep', 'Elif', 'Selin', 'Ece', 'Derya', 'İrem', 'Seda'];
const IB_MALE_NAMES = ['Mehmet', 'Can', 'Burak', 'Emre', 'Murat', 'Kerem', 'Okan'];
const ibFace = (name) => {
const n = String(name || '');
const h = [...n].reduce((a, ch) => a + ch.charCodeAt(0), 0);
if (IB_FEMALE_NAMES.includes(n)) return IB_FACES_F[h % IB_FACES_F.length];
if (IB_MALE_NAMES.includes(n)) return IB_FACES_M[h % IB_FACES_M.length];
return '🧑';
};
const IB_VENUE_THEME = {
demoCafe: { awning: ['#0A3D33', '#F3E7D3'], window: ['☕', '🥐', '🧁'], glass: '#FDF4E6', sign: '#0A3D33', signText: '#F5B83D' },
demoMarket: { awning: ['#F5B83D', '#0A3D33'], window: ['🍎', '🥖', '🧃'], glass: '#EEF8F1', sign: '#12524A', signText: '#FFFFFF' },
demoRestaurant: { awning: ['#C8463D', '#F3E7D3'], window: ['🍝', '🥗', '🍲'], glass: '#FCEFEA', sign: '#5B2320', signText: '#F3E7D3' },
};
const IB_NOTE = { 20000: '#A86BBF', 10000: '#3F7FD6', 5000: '#E2873A', 2000: '#2E9E6B', 1000: '#D24E4A', 500: '#8C6A54' };

/* --- Small animation helpers --- */

const IbPop = ({ trigger, children, style }) => {
const v = useRef(new Animated.Value(1)).current;
const first = useRef(true);
useEffect(() => {
if (first.current) { first.current = false; return; }
v.setValue(0.88);
Animated.spring(v, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
}, [trigger]);
return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
};

const IbShake = ({ trigger, children }) => {
const v = useRef(new Animated.Value(0)).current;
const first = useRef(true);
useEffect(() => {
if (first.current) { first.current = false; return; }
Animated.sequence([
Animated.timing(v, { toValue: 8, duration: 50, useNativeDriver: true }),
Animated.timing(v, { toValue: -8, duration: 50, useNativeDriver: true }),
Animated.timing(v, { toValue: 5, duration: 50, useNativeDriver: true }),
Animated.timing(v, { toValue: 0, duration: 50, useNativeDriver: true }),
]).start();
}, [trigger]);
return <Animated.View style={{ transform: [{ translateX: v }] }}>{children}</Animated.View>;
};

const IbScorePill = ({ score }) => {
const prev = useRef(score);
const [delta, setDelta] = useState(0);
const v = useRef(new Animated.Value(0)).current;
useEffect(() => {
const d = score - prev.current;
prev.current = score;
if (d === 0) return;
setDelta(d);
v.setValue(0);
Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
}, [score]);
return (
<View style={{ alignItems: 'flex-end' }}>
<View style={{ backgroundColor: '#F5B83D', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' }}>
<Text style={{ fontSize: 13, marginRight: 4 }}>⭐</Text>
<Text style={{ color: '#0A3D33', fontWeight: '900', fontSize: 16 }}>{score}</Text>
</View>
{delta !== 0 && (
<Animated.Text
style={{
position: 'absolute', top: -4, right: 6, fontWeight: '900', fontSize: 15,
color: delta > 0 ? '#7CFFB2' : '#FF9A94',
opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) }],
}}
>
{delta > 0 ? `+${delta}` : delta}
</Animated.Text>
)}
</View>
);
};

const IbTimeBar = ({ value, label }) => {
const pulse = useRef(new Animated.Value(1)).current;
const low = value < 0.25;
useEffect(() => {
if (!low) { pulse.setValue(1); return undefined; }
const loop = Animated.loop(Animated.sequence([
Animated.timing(pulse, { toValue: 0.45, duration: 380, useNativeDriver: true }),
Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: true }),
]));
loop.start();
return () => loop.stop();
}, [low]);
const color = value > 0.5 ? '#3DDC97' : value > 0.25 ? '#F5B83D' : '#FF6B5E';
return (
<View style={{ marginTop: 12 }}>
<View style={{ height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
<Animated.View style={{ width: `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`, height: 12, borderRadius: 6, backgroundColor: color, opacity: pulse }} />
</View>
<Text style={{ color: '#CFE3DC', fontSize: 12, marginTop: 5 }}>{label}</Text>
</View>
);
};

const IbStars = ({ n, size = 38 }) => {
const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
useEffect(() => {
vals.forEach((v) => v.setValue(0));
Animated.stagger(220, vals.map((v) => Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }))).start();
}, [n]);
return (
<View style={{ flexDirection: 'row', justifyContent: 'center' }}>
{vals.map((v, i) => (
<Animated.Text key={i} style={{ fontSize: size, marginHorizontal: 4, color: i < n ? '#F5B83D' : 'rgba(255,255,255,0.22)', transform: [{ scale: v }] }}>★</Animated.Text>
))}
</View>
);
};

const IbCountUp = ({ value, style }) => {
const [shown, setShown] = useState(0);
useEffect(() => {
const start = Date.now();
const id = setInterval(() => {
const p = Math.min(1, (Date.now() - start) / 900);
setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
if (p >= 1) clearInterval(id);
}, 30);
return () => clearInterval(id);
}, [value]);
return <Text style={style}>{shown}</Text>;
};

/* --- Scene components --- */

const IbAwning = ({ colors }) => (
<View>
<View style={{ flexDirection: 'row', height: 20 }}>
{Array.from({ length: 10 }).map((_, i) => <View key={i} style={{ flex: 1, backgroundColor: colors[i % 2] }} />)}
</View>
<View style={{ flexDirection: 'row', height: 9 }}>
{Array.from({ length: 10 }).map((_, i) => (
<View key={i} style={{ flex: 1, backgroundColor: colors[i % 2], borderBottomLeftRadius: 9, borderBottomRightRadius: 9 }} />
))}
</View>
</View>
);

const IbStorefront = ({ venue, name, sub, chips, onPress, disabled }) => {
const theme = IB_VENUE_THEME[venue.key] || IB_VENUE_THEME.demoCafe;
return (
<TouchableOpacity activeOpacity={0.85} disabled={disabled} onPress={onPress}
style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', opacity: disabled ? 0.62 : 1 }}>
<View style={{ backgroundColor: theme.sign, paddingVertical: 9, alignItems: 'center' }}>
<Text style={{ color: theme.signText, fontWeight: '900', letterSpacing: 2, fontSize: 15 }}>{venue.icon}  {name}</Text>
</View>
<IbAwning colors={theme.awning} />
<View style={{ flexDirection: 'row', padding: 12, paddingTop: 10, alignItems: 'flex-end' }}>
<View style={{ flex: 1, backgroundColor: theme.glass, borderRadius: 12, borderWidth: 3, borderColor: '#D9CDB8', height: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
{theme.window.map((e) => <Text key={e} style={{ fontSize: 30 }}>{e}</Text>)}
</View>
<View style={{ width: 46, height: 86, marginLeft: 10, backgroundColor: '#7A5230', borderTopLeftRadius: 23, borderTopRightRadius: 23, borderWidth: 3, borderColor: '#5E3E22', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 6 }}>
<View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#F5B83D' }} />
</View>
</View>
<View style={{ height: 8, backgroundColor: '#CBBFA9' }} />
<View style={{ padding: 12, paddingTop: 10, flexDirection: 'row', alignItems: 'center' }}>
<View style={{ flex: 1 }}>
<Text style={{ fontSize: 13, color: '#6E7F7A' }}>{sub}</Text>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
{chips.map((ch) => (
<View key={ch.text} style={{ backgroundColor: ch.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginTop: 2 }}>
<Text style={{ fontSize: 11, fontWeight: '800', color: ch.color }}>{ch.text}</Text>
</View>
))}
</View>
</View>
<View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: disabled ? '#E7ECE8' : '#0A3D33', alignItems: 'center', justifyContent: 'center' }}>
<Ionicons name={disabled ? 'lock-closed-outline' : 'arrow-forward'} size={18} color={disabled ? '#6E7F7A' : '#F5B83D'} />
</View>
</View>
</TouchableOpacity>
);
};

const ibMood = (v) => (v >= 85 ? '😄' : v >= 65 ? '🙂' : v >= 40 ? '😐' : '😠');
const IB_GRADE_COLOR = { S: '#F5B83D', A: '#1FA36F', B: '#3F7FD6', C: '#E08A1E', D: '#D9473D' };

const IbCustomer = ({ name, line, sub, mood }) => (
<View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
<View>
<View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#F3E7D3', borderWidth: 3, borderColor: '#F5B83D', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 28 }}>{ibFace(name)}</Text>
</View>
{typeof mood === 'number' && (
<IbPop trigger={ibMood(mood)} style={{ position: 'absolute', right: -6, bottom: -6 }}>
<View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 16 }}>{ibMood(mood)}</Text>
</View>
</IbPop>
)}
</View>
<View style={{ flex: 1, marginLeft: 12 }}>
<Text style={{ color: '#CFE3DC', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>{name}{typeof mood === 'number' ? `  ·  ${mood}%` : ''}</Text>
<View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9 }}>
<Text style={{ color: '#0E2F28', fontSize: 16, fontWeight: '800' }}>{line}</Text>
</View>
{!!sub && <Text style={{ color: '#CFE3DC', fontSize: 12, marginTop: 6 }}>{sub}</Text>}
</View>
</View>
);

const IbCup = ({ size, items, placeholder }) => {
const W = size === 'S' ? 82 : size === 'L' ? 112 : 98;
const H = Math.round(W * 1.1);
const layerH = (H - 8) / 6;
const hot = items.length > 0 && !items.includes('ice');
return (
<View style={{ alignItems: 'center', width: 150 }}>
<Text style={{ fontSize: 18, height: 22, opacity: hot ? 0.55 : 0 }}>♨️</Text>
<View style={{ width: W + 28, alignItems: 'flex-start' }}>
<View style={{ flexDirection: 'row', alignItems: 'center' }}>
<View style={{
width: W, height: H, borderWidth: 4, borderColor: placeholder ? '#C9BFAE' : '#E2D6C2', borderStyle: placeholder ? 'dashed' : 'solid',
borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
backgroundColor: 'rgba(255,255,255,0.75)', overflow: 'hidden', justifyContent: 'flex-end',
}}>
{[...items].reverse().map((k, i) => (
<View key={`${k}-${i}`} style={{ height: layerH, backgroundColor: IB_LAYER[k] || '#ccc', borderTopWidth: k === 'foam' ? 0 : 1, borderTopColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}>
{k === 'ice' && <Text style={{ fontSize: 10 }}>🧊 🧊</Text>}
{k === 'foam' && <Text style={{ fontSize: 9, color: '#D8CDBE' }}>◦ ◦ ◦</Text>}
</View>
))}
{placeholder && (
<View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 11, color: '#8B8173', fontWeight: '800', textAlign: 'center' }}>{placeholder}</Text>
</View>
)}
</View>
<View style={{ width: 24, height: H * 0.42, marginLeft: -2, borderWidth: 4, borderLeftWidth: 0, borderColor: '#E2D6C2', borderTopRightRadius: 14, borderBottomRightRadius: 14 }} />
</View>
</View>
<View style={{ width: W + 34, height: 9, borderRadius: 6, backgroundColor: '#E2D6C2', marginTop: 2, marginRight: 22 }} />
</View>
);
};

const IbLcd = ({ lines, total, label, flash }) => (
<IbPop trigger={flash}>
<View style={{ backgroundColor: '#0D1F17', borderRadius: 14, borderWidth: 4, borderColor: '#2D3B35', padding: 12 }}>
<Text style={{ fontFamily: IB_MONO, color: '#4FD18B', fontSize: 11, letterSpacing: 1 }}>{label}</Text>
{lines.length === 0 ? (
<Text style={{ fontFamily: IB_MONO, color: '#7CFFB2', fontSize: 13, marginTop: 6 }}>— — —</Text>
) : lines.slice(-4).map((ln, i) => (
<View key={`${ln.left}-${i}`} style={{ flexDirection: 'row', marginTop: 4 }}>
<Text style={{ flex: 1, fontFamily: IB_MONO, color: '#7CFFB2', fontSize: 12 }} numberOfLines={1}>{ln.left}</Text>
<Text style={{ fontFamily: IB_MONO, color: '#7CFFB2', fontSize: 12 }}>{ln.right}</Text>
</View>
))}
{lines.length > 4 && <Text style={{ fontFamily: IB_MONO, color: '#4FD18B', fontSize: 10, marginTop: 2 }}>+{lines.length - 4} …</Text>}
<View style={{ height: 1, backgroundColor: '#2D5C44', marginVertical: 8 }} />
<View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
<Text style={{ flex: 1, fontFamily: IB_MONO, color: '#4FD18B', fontSize: 13, fontWeight: '700' }}>TOPLAM</Text>
<Text style={{ fontFamily: IB_MONO, color: '#B6FFD6', fontSize: 24, fontWeight: '900' }}>{total}</Text>
</View>
</View>
</IbPop>
);

const IbMoney = ({ kurus, onPress, small }) => {
const note = kurus >= 500;
const label = denominationLabel(kurus);
if (note) {
const bg = IB_NOTE[kurus] || '#3F7FD6';
return (
<TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.7}
style={{ width: small ? 54 : '31.5%', height: small ? 30 : 58, borderRadius: small ? 5 : 8, backgroundColor: bg, padding: small ? 2 : 4, marginBottom: small ? 0 : 8, marginRight: small ? 4 : 0 }}>
<View style={{ flex: 1, borderRadius: small ? 3 : 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
{!small && <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.35)', marginRight: 6 }} />}
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: small ? 11 : 17 }}>{label}</Text>
</View>
</TouchableOpacity>
);
}
const d = small ? 30 : 56;
const gold = kurus === 100;
return (
<TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.7}
style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: gold ? '#C9CFD6' : '#D3D8DE', borderWidth: small ? 2 : 4, borderColor: gold ? '#D6A93A' : '#AEB6BF', alignItems: 'center', justifyContent: 'center', marginRight: small ? 4 : 10, marginBottom: small ? 0 : 8 }}>
<Text style={{ color: '#37424C', fontWeight: '900', fontSize: small ? 8 : 12 }}>{label}</Text>
</TouchableOpacity>
);
};

const IbQr = ({ text, cell = 4 }) => {
const qr = useMemo(() => createQrMatrix(text), [text]);
if (!qr || !qr.ok) return null;
return (
<View style={{ padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12, alignSelf: 'center' }}>
{qr.matrix.map((row, r) => (
<View key={`r${r}`} style={{ flexDirection: 'row' }}>
{row.map((dark, col) => <View key={`c${col}`} style={{ width: cell, height: cell, backgroundColor: dark ? '#0A3D33' : '#FFFFFF' }} />)}
</View>
))}
</View>
);
};

const IbCouponTicket = ({ coupon, expanded, onPress, c, tx, lang }) => {
const now = Date.now();
const expired = Date.parse(coupon.expiresAt) <= now;
const used = !!coupon.redeemedAt;
const venue = VENUES.find((v) => v.key === coupon.venue);
// For Cucci, the reward is a game badge, not a cashier discount coupon.
const badge = !!(venue && venue.partner && !venue.couponsAgreed);
const inactive = (expired || used) && !badge;
const theme = IB_VENUE_THEME[coupon.venue] || IB_VENUE_THEME.demoCafe;
const title = (coupon.title && pickByLang(coupon.title, lang)) || '';
const dateLocale = dateLocaleFor(lang);
return (
<TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ marginBottom: 12, opacity: inactive ? 0.55 : 1 }}>
<View style={{ flexDirection: 'row', borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
<View style={{ width: 82, backgroundColor: theme.sign, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>
<Text style={{ fontSize: 30 }}>{venue ? venue.icon : '🎁'}</Text>
<Text style={{ color: theme.signText, fontWeight: '900', fontSize: 10, letterSpacing: 1.5, marginTop: 6 }}>{badge ? tx('ROZET', 'BADGE', 'ABZEICHEN') : tx('KUPON', 'COUPON', 'GUTSCHEIN')}</Text>
</View>
<View style={{ width: 14, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
{Array.from({ length: 7 }).map((_, i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.bg }} />)}
</View>
<View style={{ flex: 1, padding: 12, paddingLeft: 4 }}>
<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
{coupon.isDemo && !badge && <View style={{ backgroundColor: '#FDE7C2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}><Text style={{ fontSize: 10, fontWeight: '900', color: '#9A5B00' }}>{tx('DENEME', 'DEMO', 'DEMO')}</Text></View>}
{used && <View style={{ backgroundColor: '#E7ECE8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}><Text style={{ fontSize: 10, fontWeight: '900', color: '#6E7F7A' }}>{tx('KULLANILDI', 'USED', 'EINGELÖST')}</Text></View>}
{!used && expired && <View style={{ backgroundColor: '#E7ECE8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}><Text style={{ fontSize: 10, fontWeight: '900', color: '#6E7F7A' }}>{tx('SÜRESİ DOLDU', 'EXPIRED', 'ABGELAUFEN')}</Text></View>}
</View>
<Text style={{ fontSize: 16, fontWeight: '900', color: '#0E2F28', marginTop: 4 }}>{title}</Text>
<Text style={{ fontSize: 12, color: '#6E7F7A', marginTop: 2 }}>{coupon.partnerName}</Text>
{badge ? (
<Text style={{ fontSize: 11, color: '#6E7F7A', marginTop: 8 }}>
{tx('Kazanıldı', 'Earned', 'Erhalten')}: {new Date(coupon.issuedAt).toLocaleDateString(dateLocale)}
</Text>
) : (
<>
<Text style={{ fontFamily: IB_MONO, fontSize: 15, fontWeight: '900', color: '#0A3D33', letterSpacing: 2, marginTop: 8 }}>{coupon.code}</Text>
<Text style={{ fontSize: 11, color: '#6E7F7A', marginTop: 2 }}>
{tx('Son kullanma', 'Valid until', 'Gültig bis')}: {new Date(coupon.expiresAt).toLocaleDateString(dateLocale)}
</Text>
</>
)}
</View>
</View>
{expanded && badge && (
<View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: -8, paddingTop: 18, paddingBottom: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
<Text style={{ fontSize: 12, color: '#6E7F7A', textAlign: 'center', lineHeight: 17 }}>
{tx('Bu bir oyun rozetidir, indirim kuponu değildir. Cucci Bruschetta\'da her gün tüm kahvelerde %10 indirim için: İş Köprüsü → İşletmeler.', 'This is a game badge, not a discount coupon. For 10% off all coffees at Cucci Bruschetta every day: Job Bridge → Businesses.', 'Dies ist ein Spielabzeichen, kein Rabattgutschein. 10 % auf alle Kaffees bei Cucci Bruschetta: Job-Brücke → Betriebe.')}
</Text>
</View>
)}
{expanded && !inactive && !badge && (
<View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: -8, paddingTop: 18, paddingBottom: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
<IbQr text={couponQrPayload(coupon.code)} />
<Text style={{ fontSize: 12, color: '#6E7F7A', textAlign: 'center', marginTop: 10, lineHeight: 17 }}>
{coupon.isDemo
? tx('Bu bir DENEME kuponudur: henüz anlaşmalı mağaza yok, gerçek alışverişte geçmez.', 'This is a DEMO coupon: there is no partner store yet, it is not valid for real purchases.', 'DEMO-Gutschein: noch kein Partnergeschäft, im echten Einkauf nicht gültig.')
: tx('Kasada bu QR kodu ya da kodu göster. Kupon tek kullanımlıktır.', 'Show this QR code or the code at the till. The coupon can be used once.', 'Zeige diesen QR-Code oder den Code an der Kasse. Einmal einlösbar.')}
</Text>
</View>
)}
</TouchableOpacity>
);
};

const IbXpBar = ({ xp, light, tx, lang }) => {
const lv = playerLevel(xp);
const pct = lv.span ? Math.round((lv.into / lv.span) * 100) : 100;
return (
<View>
<View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
<Text style={{ color: light ? '#FFFFFF' : '#0E2F28', fontWeight: '900', fontSize: 15 }}>
{tx('Seviye', 'Level', 'Stufe')} {lv.level} · {pick(lang, lv.title.tr, lv.title.en, lv.title.de)}
</Text>
<Text style={{ color: light ? '#CFE3DC' : '#6E7F7A', fontSize: 12 }}>{lv.span ? `${lv.into}/${lv.span} XP` : `${lv.xp} XP`}</Text>
</View>
<View style={{ height: 10, borderRadius: 5, backgroundColor: light ? 'rgba(255,255,255,0.15)' : '#E7ECE8', marginTop: 6, overflow: 'hidden' }}>
<View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: '#F5B83D' }} />
</View>
</View>
);
};

const IbGradeBadge = ({ grade, size = 64 }) => (
<IbPop trigger={grade}>
<View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: IB_GRADE_COLOR[grade] || '#999', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.6)' }}>
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: size * 0.48 }}>{grade}</Text>
</View>
</IbPop>
);

const IsBasiScreen = ({ s, c, tx, lang, showToast, navigate, dataScopeGeneration, isCurrentDataScope, Screen, ScreenHeader, ibApi, isKoprusuActive }) => {
const saveScopedValue = createScopeBoundSave(dataScopeGeneration, isCurrentDataScope, saveValue);
const [view, setView] = useState('venues'); // venues | roles | role | shift | result | coupons | achievements | history
const [localProgress, setLocalProgress] = useState(emptyProgress());
const [serverProgress, setServerProgress] = useState(null);
const [coupons, setCoupons] = useState([]);
const [mode, setMode] = useState('checking'); // checking | online | local | offline
const [loaded, setLoaded] = useState(false);
const [venueKey, setVenueKey] = useState('demoCafe');
const [roleKey, setRoleKey] = useState('barista');
const [selectedLevel, setSelectedLevel] = useState(1);
const [shift, setShift] = useState(null);
const [shiftMeta, setShiftMeta] = useState(null); // { kind: 'server'|'local'|'practice', id }
const [result, setResult] = useState(null);
const [starting, setStarting] = useState(false);
const [openCoupon, setOpenCoupon] = useState(null);
const lastTickRef = useRef(0);
const finishedRef = useRef(false);

const L = (o) => pick(lang, o.tr, o.en, o.de);
const U = (text) => String(text).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US');
const role = ROLES[roleKey];
const venue = VENUES.find((v) => v.key === venueKey) || VENUES[0];
const serverMode = mode === 'online' || (mode === 'offline' && !!serverProgress);
const progress = serverMode && serverProgress ? serverProgress : localProgress;
const roleProgress = progress.roles[roleKey];
const venueProgress = progress.venues[roleVenue(roleKey)];
const levelsOf = roleLevels(roleKey);

const rememberServer = (p, list) => {
saveScopedValue(ISBASI_SERVER_CACHE_KEY, { progress: p, coupons: list, savedAt: Date.now() });
};

const sendPending = async (pending) => {
return finishWithDurablePending(pending, {
persist: (value) => saveScopedValue(ISBASI_PENDING_KEY, value),
submit: (shiftId, log, endT) => ibApi.finish(shiftId, log, endT),
clear: () => saveScopedValue(ISBASI_PENDING_KEY, null),
});
};

useEffect(() => {
let cancelled = false;
(async () => {
const savedLocal = normalizeProgress(await loadValue(ISBASI_KEY, null));
const cache = await loadValue(ISBASI_SERVER_CACHE_KEY, null);
if (cancelled) return;
setLocalProgress(savedLocal);
if (cache && cache.progress) {
setServerProgress(normalizeProgress(cache.progress));
setCoupons(Array.isArray(cache.coupons) ? cache.coupons : []);
}
setLoaded(true);

const res = await ibApi.state();
if (cancelled) return;
setMode(modeForError(res));
if (!res.ok) return;
let p = normalizeProgress(res.data.progress);
let list = res.data.coupons || [];

// Retry a shift result that could not be submitted during the previous session.
const pendingRead = await loadValueStrict(ISBASI_PENDING_KEY, null);
if (!pendingRead.ok) {
showToast(tx('Bekleyen vardiya sonucu okunamadı ve korundu.', 'The pending shift result could not be read and was preserved.', 'Das ausstehende Ergebnis konnte nicht gelesen werden und wurde beibehalten.'));
} else if (isPendingUsable(pendingRead.value)) {
const pending = pendingRead.value;
const sent = await sendPending(pending);
if (sent.ok) {
p = normalizeProgress(sent.data.progress);
list = mergeCoupon(list, sent.data.coupon);
showToast(tx('Bekleyen vardiya sonucun sunucuda doğrulandı.', 'Your pending shift result was verified.', 'Dein ausstehendes Ergebnis wurde bestätigt.'));
}
}
if (cancelled) return;
setServerProgress(p);
setCoupons(list);
rememberServer(p, list);
})();
return () => { cancelled = true; };
}, []);

// Run the shift clock only while the shift screen is active.
useEffect(() => {
if (view !== 'shift' || !shift || shift.finished) return undefined;
lastTickRef.current = Date.now();
const id = setInterval(() => {
const now = Date.now();
const dt = now - lastTickRef.current;
lastTickRef.current = now;
setShift((cur) => tick(cur, dt));
}, 250);
return () => clearInterval(id);
}, [view, shift && shift.finished]);

const finishServerShift = async (meta, st, localSummary) => {
setResult({ summary: localSummary, applied: {}, verify: 'sending' });
const pending = { shiftId: meta.id, log: st.log || [], endT: st.elapsedMs, savedAt: Date.now() };
const res = await finishWithDurablePending(pending, {
persist: (value) => saveScopedValue(ISBASI_PENDING_KEY, value),
submit: (shiftId, log, endT) => ibApi.finish(shiftId, log, endT),
clear: () => saveScopedValue(ISBASI_PENDING_KEY, null),
});
if (!isCurrentDataScope(dataScopeGeneration)) return;
if (res.ok) {
const d = res.data;
const p = normalizeProgress(d.progress);
const list = mergeCoupon(coupons, d.coupon);
setServerProgress(p);
setCoupons(list);
rememberServer(p, list);
setMode('online');
if (d.levelUnlocked) setSelectedLevel(d.levelUnlocked);
setResult({ summary: d.summary, applied: d, verify: 'verified', coupon: d.coupon || null });
return;
}
if (res.kind === 'pending_storage') {
setResult({ summary: localSummary, applied: {}, verify: 'storage', pending: { id: meta.id, st } });
return;
}
if (shouldKeepPending(res)) {
setResult({ summary: localSummary, applied: {}, verify: 'pending', pending: { id: meta.id, st } });
return;
}
setResult({ summary: localSummary, applied: {}, verify: res.kind === 'rejected' ? 'rejected' : 'failed', reason: res.reason || res.error });
};

const retryPending = async () => {
if (!result || !result.pending) return;
const { id, st } = result.pending;
await finishServerShift({ id }, st, result.summary);
};

// Process a completed shift result once.
useEffect(() => {
if (view !== 'shift' || !shift || !shift.finished || finishedRef.current) return;
finishedRef.current = true;
const summary = summarizeShift(shift);
setView('result');
const meta = shiftMeta || { kind: 'practice' };
if (meta.kind === 'server') {
finishServerShift(meta, shift, summary);
return;
}
if (meta.kind === 'practice') {
setResult({ summary, applied: {}, verify: 'practice' });
return;
}
const applied = applyShiftResult(localProgress, summary, getTodayISO());
setLocalProgress(applied.progress);
setResult({ summary, applied, verify: 'local' });
if (applied.levelUnlocked) setSelectedLevel(applied.levelUnlocked);
saveScopedValue(ISBASI_KEY, applied.progress).then((ok) => {
if (!ok) showToast(tx('İlerleme cihaza kaydedilemedi.', 'Progress could not be saved.', 'Fortschritt konnte nicht gespeichert werden.'));
});
}, [view, shift]);

const openRole = (key) => {
setRoleKey(key);
setSelectedLevel(progress.roles[key].unlockedLevel);
setView('role');
};

const openVenue = (v) => {
setVenueKey(v.key);
if (v.roles.length === 1) openRole(v.roles[0]);
else setView('roles');
};

const beginShift = (st, meta) => {
finishedRef.current = false;
setResult(null);
setShiftMeta(meta);
setShift(st);
setView('shift');
};

const startPractice = (level) => beginShift(createRoleShift(roleKey, level, Date.now(), getTodayISO()), { kind: 'practice' });

const startShift = async (level) => {
if (starting) return;
if (mode === 'local') {
beginShift(createRoleShift(roleKey, level, Date.now(), getTodayISO()), { kind: 'local' });
return;
}
if (mode === 'offline' || mode === 'checking') {
Alert.alert(
tx('Sunucuya bağlanılamıyor', 'Cannot reach the server', 'Server nicht erreichbar'),
tx('Antrenman olarak oynayabilirsin; bu vardiya ilerlemeye ve ödüle sayılmaz.', 'You can play for practice; this shift will not count toward progress or rewards.', 'Du kannst zum Üben spielen; die Schicht zählt nicht.'),
[
{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' },
{ text: tx('Antrenman', 'Practice', 'Training'), onPress: () => startPractice(level) },
]
);
return;
}
setStarting(true);
const pendingRead = await loadValueStrict(ISBASI_PENDING_KEY, null);
if (!pendingRead.ok) {
setStarting(false);
showToast(tx('Bekleyen vardiya sonucu okunamadı. Yeniden dene.', 'The pending shift result could not be read. Please retry.', 'Das ausstehende Ergebnis konnte nicht gelesen werden. Bitte erneut versuchen.'));
return;
}
const storedPending = pendingRead.value;
const memoryPending = result?.pending ? { shiftId: result.pending.id, log: result.pending.st?.log || [], endT: result.pending.st?.elapsedMs, savedAt: Date.now() } : null;
const pendingSelection = selectPendingForRecovery(storedPending, memoryPending);
if (!pendingSelection.ok) {
setStarting(false);
showToast(pendingSelection.kind === 'invalid_pending'
? tx('Bekleyen vardiya sonucu doğrulanamadı. Yeni vardiya başlatılmadı.', 'The saved pending result is invalid. No new shift was started.', 'Das gespeicherte Ergebnis ist ungültig. Es wurde keine neue Schicht gestartet.')
: tx('Önce bekleyen vardiya sonucunu yeniden gönder.', 'Retry the pending shift result before starting another server shift.', 'Sende das ausstehende Ergebnis erneut, bevor du eine weitere Schicht startest.'));
return;
}
const pending = pendingSelection.pending;
const res = await startAfterPendingRecovery(pending, {
retry: sendPending,
onRecovered: async (sent) => {
const p = normalizeProgress(sent.data.progress);
const list = mergeCoupon(coupons, sent.data.coupon);
setServerProgress(p);
setCoupons(list);
rememberServer(p, list);
setMode('online');
if (result?.pending) setResult({ summary: result.summary, applied: sent.data, verify: 'verified', coupon: sent.data.coupon || null });
},
start: () => ibApi.start(roleKey, level),
});
setStarting(false);
if (res.kind === 'pending') {
showToast(tx('Bekleyen vardiya sonucu hâlâ bekliyor. Yeniden gönderilmeden yeni vardiya başlatılamaz.', 'Your previous shift result is still pending. Retry it before starting another server shift.', 'Das vorherige Ergebnis wartet noch. Sende es erneut, bevor du eine weitere Schicht startest.'));
return;
}
if (res.ok) {
const sh = res.data.shift;
beginShift(createRoleShift(sh.role, sh.level, sh.seed, sh.gameDate), { kind: 'server', id: sh.id });
return;
}
if (res.kind === 'not_deployed') {
setMode('local');
beginShift(createRoleShift(roleKey, level, Date.now(), getTodayISO()), { kind: 'local' });
return;
}
if (res.kind === 'locked') {
Alert.alert('BAKPLANLA', tx('Bu seviye sunucuda henüz açılmamış.', 'This level is not unlocked on the server yet.', 'Diese Stufe ist noch gesperrt.'));
return;
}
if (res.kind === 'rate_limited') {
Alert.alert('BAKPLANLA', tx('Son bir saatte çok fazla vardiya başlattın. Biraz mola ver ☕', 'You started too many shifts in the last hour. Take a short break ☕', 'Zu viele Schichten in der letzten Stunde. Kurze Pause ☕'));
return;
}
setMode(modeForError(res));
Alert.alert(
tx('Sunucuya bağlanılamadı', 'Could not reach the server', 'Server nicht erreichbar'),
tx('Antrenman olarak oynayabilirsin; bu vardiya ilerlemeye ve ödüle sayılmaz.', 'You can play for practice; this shift will not count.', 'Du kannst zum Üben spielen; die Schicht zählt nicht.'),
[
{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' },
{ text: tx('Antrenman', 'Practice', 'Training'), onPress: () => startPractice(level) },
]
);
};

const leaveShift = () => {
Alert.alert(
tx('Vardiyayı bırak', 'Leave shift', 'Schicht verlassen'),
tx('Bu vardiya kaydedilmeyecek. Emin misin?', 'This shift will not be saved. Are you sure?', 'Diese Schicht wird nicht gespeichert. Sicher?'),
[
{ text: tx('Devam et', 'Keep playing', 'Weiterspielen'), style: 'cancel' },
{ text: tx('Bırak', 'Leave', 'Verlassen'), style: 'destructive', onPress: () => { setShift(null); setView('role'); } },
]
);
};

// Advance the clock to now at millisecond precision before applying and saving a move.
const act = (name, ...params) => {
const now = Date.now();
const dt = now - lastTickRef.current;
lastTickRef.current = now;
setShift((cur) => (cur ? dispatch(tick(cur, dt), name, ...params) : cur));
};

const venueName = (key) => L(VENUES.find((v) => v.key === key) || VENUES[0]);
// Do not describe an offer as a discount coupon when the business has no coupon agreement.
const noPartnerCoupon = (key) => { const v = VENUES.find((x) => x.key === key); return !!(v && v.partner && !v.couponsAgreed); };
const totalStars = Object.values(progress.roles).reduce((sum, r) => sum + Object.values(r.bestStars || {}).reduce((a, b) => a + b, 0), 0);
const totalShifts = Object.values(progress.roles).reduce((sum, r) => sum + (r.shifts || 0), 0);
const activeCoupons = coupons.filter((cp) => !cp.redeemedAt && Date.parse(cp.expiresAt) > Date.now());
const career = progress.career;
const todayKey = getTodayISO();
const todayMissions = dailyMissionIds(todayKey).map((id) => {
const m = missionById(id);
const sameDay = career.daily && career.daily.date === todayKey;
const value = sameDay ? (career.daily.progress[id] || 0) : 0;
return { ...m, value, done: sameDay && career.daily.done.includes(id) };
});
const unlockedCount = Object.keys(career.achievements).length;
const ROLE_ICON = { barista: '☕', cashier: '🧾', shelf: '📦' };

const careerCard = (
<View style={[s.card, { marginBottom: 14, padding: 16 }]}>
<View style={[s.row, { marginBottom: 12 }]}>
<View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: c.dark, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 3, borderColor: c.gold }}>
<Text style={{ fontSize: 26 }}>👷</Text>
</View>
<View style={s.flex1}>
<Text style={{ fontSize: 11, fontWeight: '900', color: c.sub, letterSpacing: 1 }}>{tx('KARİYERİN', 'YOUR CAREER', 'DEINE KARRIERE')}</Text>
<Text style={[s.cardTitle, { fontSize: 18 }]}>{career.xp} XP</Text>
</View>
{mode === 'local' && <Text style={{ fontSize: 10, color: c.sub, maxWidth: 90, textAlign: 'right' }}>{tx('cihazda', 'on device', 'auf Gerät')}</Text>}
</View>
<View style={{ backgroundColor: c.dark, borderRadius: 14, padding: 12 }}><IbXpBar xp={career.xp} light tx={tx} lang={lang} /></View>
<View style={{ flexDirection: 'row', marginTop: 12 }}>
<TouchableOpacity onPress={() => setView('achievements')} style={{ flex: 1, backgroundColor: c.chip, borderRadius: 14, padding: 10, marginRight: 8, alignItems: 'center' }}>
<Text style={{ fontSize: 20 }}>🏆</Text>
<Text style={{ fontWeight: '800', color: c.text, fontSize: 13, marginTop: 2 }}>{tx('Başarımlar', 'Achievements', 'Erfolge')}</Text>
<Text style={{ color: c.sub, fontSize: 11 }}>{unlockedCount}/{ACHIEVEMENTS.length}</Text>
</TouchableOpacity>
<TouchableOpacity onPress={() => setView('history')} style={{ flex: 1, backgroundColor: c.chip, borderRadius: 14, padding: 10, alignItems: 'center' }}>
<Text style={{ fontSize: 20 }}>📈</Text>
<Text style={{ fontWeight: '800', color: c.text, fontSize: 13, marginTop: 2 }}>{tx('Geçmiş', 'History', 'Verlauf')}</Text>
<Text style={{ color: c.sub, fontSize: 11 }}>{career.history.length} {tx('vardiya', 'shifts', 'Schichten')}</Text>
</TouchableOpacity>
</View>
</View>
);

const missionsCard = (
<View style={[s.card, { marginBottom: 14, padding: 16 }]}>
<View style={[s.row, { marginBottom: 6 }]}>
<Text style={[s.cardTitle, s.flex1]}>🎯 {tx('Günün görevleri', "Today's missions", 'Tagesaufgaben')}</Text>
<Text style={{ color: c.sub, fontSize: 12 }}>+{MISSION_XP} XP</Text>
</View>
{todayMissions.map((m) => (
<View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
<View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: m.done ? c.green : c.chip, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
<Text style={{ fontSize: 16 }}>{m.done ? '✓' : m.icon}</Text>
</View>
<View style={s.flex1}>
<Text style={{ color: c.text, fontWeight: '700', fontSize: 13, textDecorationLine: m.done ? 'line-through' : 'none' }}>{pick(lang, m.tr, m.en, m.de)}</Text>
<View style={{ height: 6, borderRadius: 3, backgroundColor: c.chip, marginTop: 5, overflow: 'hidden' }}>
<View style={{ width: `${Math.round((Math.min(m.value, m.target) / m.target) * 100)}%`, height: 6, backgroundColor: m.done ? c.green : c.gold }} />
</View>
</View>
<Text style={{ color: c.sub, fontSize: 12, marginLeft: 10 }}>{Math.min(m.value, m.target)}/{m.target}</Text>
</View>
))}
{mode === 'offline' && <Text style={s.note}>{tx('Antrenman vardiyaları görevlere sayılmaz.', 'Practice shifts do not count.', 'Training zählt nicht.')}</Text>}
</View>
);

const modeChip = {
checking: { bg: 'rgba(255,255,255,0.14)', color: '#FFFFFF', text: tx('⏳ Sunucu kontrol ediliyor…', '⏳ Checking server…', '⏳ Server wird geprüft…') },
online: { bg: 'rgba(61,220,151,0.2)', color: '#7CFFB2', text: tx('🟢 Sunucuya bağlı · puanlar doğrulanıyor', '🟢 Connected · scores are verified', '🟢 Verbunden · Punkte werden geprüft') },
local: { bg: 'rgba(245,184,61,0.22)', color: '#FFD98A', text: tx('📱 Cihaz modu · sunucu henüz kurulmadı, kupon yok', '📱 Device mode · server not set up, no coupons', '📱 Gerätemodus · Server nicht eingerichtet') },
offline: { bg: 'rgba(255,107,94,0.2)', color: '#FFB3AC', text: tx('📴 Çevrimdışı · yalnızca antrenman', '📴 Offline · practice only', '📴 Offline · nur Training') },
}[mode];

const rewardCard = (
<View style={[s.card, { marginTop: 10 }]}>
<View style={[s.row, { marginBottom: 10 }]}>
<Text style={{ fontSize: 26, marginRight: 10 }}>🎁</Text>
<View style={s.flex1}>
<Text style={s.cardTitle}>{tx('Ödül ilerlemesi', 'Reward progress', 'Belohnungsfortschritt')}</Text>
<Text style={s.cardMeta}>{noPartnerCoupon(roleVenue(roleKey)) ? tx('Ödül: Cucci Bruschetta Barista Rozeti. Kahve indirimi (%10, her gün): İş Köprüsü → İşletmeler', 'Reward: Cucci Bruschetta Barista Badge. Coffee discount (10%, daily): Job Bridge → Businesses', 'Belohnung: Cucci Bruschetta Barista-Abzeichen. Kaffeerabatt (10 %): Job-Brücke → Betriebe') : venueName(roleVenue(roleKey))}</Text>
</View>
<Text style={[s.cardTitle, { color: c.green, fontSize: 18 }]}>{venueProgress.rewardProgress}/{SHIFTS_FOR_REWARD}</Text>
</View>
<View style={{ flexDirection: 'row' }}>
{Array.from({ length: SHIFTS_FOR_REWARD }).map((_, i) => (
<View key={i} style={{ flex: 1, height: 30, marginRight: i < SHIFTS_FOR_REWARD - 1 ? 6 : 0, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: i < venueProgress.rewardProgress ? c.gold : c.chip }}>
<Text style={{ fontSize: 14 }}>{i < venueProgress.rewardProgress ? '⭐' : i === SHIFTS_FOR_REWARD - 1 ? (noPartnerCoupon(roleVenue(roleKey)) ? '🏅' : '🎫') : ''}</Text>
</View>
))}
</View>
<Text style={s.note}>
{noPartnerCoupon(roleVenue(roleKey)) ? tx(
`${REWARD_MIN_STARS}+ yıldızlı ${SHIFTS_FOR_REWARD} vardiya = 1 Cucci Bruschetta rozeti. Günde en fazla ${DAILY_REWARD_SHIFT_CAP} vardiya sayılır.`,
`${SHIFTS_FOR_REWARD} shifts with ${REWARD_MIN_STARS}+ stars = 1 Cucci Bruschetta badge. Max ${DAILY_REWARD_SHIFT_CAP} per day.`,
`${SHIFTS_FOR_REWARD} Schichten mit ${REWARD_MIN_STARS}+ Sternen = 1 Abzeichen. Max. ${DAILY_REWARD_SHIFT_CAP} pro Tag.`
) : tx(
`${REWARD_MIN_STARS}+ yıldızlı ${SHIFTS_FOR_REWARD} vardiya = 1 kupon. Bu mekandaki tüm roller sayılır, günde en fazla ${DAILY_REWARD_SHIFT_CAP} vardiya.`,
`${SHIFTS_FOR_REWARD} shifts with ${REWARD_MIN_STARS}+ stars = 1 coupon. All roles at this venue count, max ${DAILY_REWARD_SHIFT_CAP} per day.`,
`${SHIFTS_FOR_REWARD} Schichten mit ${REWARD_MIN_STARS}+ Sternen = 1 Gutschein. Alle Rollen zählen, max. ${DAILY_REWARD_SHIFT_CAP} pro Tag.`
)}
</Text>
{mode !== 'online' && (
<Text style={[s.note, { fontWeight: '700' }]}>
{mode === 'local'
? tx('Cihaz modunda kupon verilmez; sunucu kurulunca puanlar doğrulanır ve kupon kazanılır.', 'No coupons in device mode; once the server is set up, scores are verified and coupons can be earned.', 'Im Gerätemodus keine Gutscheine.')
: tx('Çevrimdışıyken oynanan vardiyalar sayılmaz.', 'Shifts played offline do not count.', 'Offline gespielte Schichten zählen nicht.')}
</Text>
)}
</View>
);

const levelMeta = (lv) => {
const sec = `${Math.round(lv.patienceMs / 1000)} ${tx('sn', 's', 's')}`;
if (roleKey === 'cashier') {
return `${lv.orders} ${tx('müşteri', 'customers', 'Kunden')} · ${sec}`
+ (lv.produce ? tx(' · tartı', ' · scale', ' · Waage') : '')
+ (lv.priceStep < 100 ? tx(' · kuruşlu fiyat', ' · prices with cents', ' · Cent-Preise') : '')
+ (lv.discounts ? tx(' · indirim etiketi', ' · discount stickers', ' · Rabattetiketten') : '')
+ (lv.bag ? tx(' · poşet', ' · bags', ' · Tüten') : '')
+ (lv.declines ? tx(' · kart reddi', ' · declined cards', ' · abgelehnte Karten') : '');
}
if (roleKey === 'shelf') {
return `${lv.orders} ${tx('raf', 'shelves', 'Regale')} · ${lv.slots} ${tx('ürün', 'items', 'Waren')} · ${sec}`
+ (lv.need[1] > 1 ? tx(' · adetli stok', ' · quantities', ' · Mengen') : '')
+ (lv.extras ? tx(' · fazla stok', ' · surplus', ' · Überbestand') : '')
+ (lv.shortage ? tx(' · eksik stok', ' · shortages', ' · Fehlbestand') : '')
+ (lv.memorize ? tx(' · planogramı ezberle', ' · memorize planogram', ' · Planogramm merken') : '')
+ (lv.question ? tx(' · müşteri sorusu', ' · customer question', ' · Kundenfrage') : '');
}
return `${lv.orders} ${tx('müşteri', 'customers', 'Kunden')} · ${sec} ${tx('sabır', 'patience', 'Geduld')}`
+ (lv.sizes ? tx(' · bardak boyu', ' · cup size', ' · Bechergröße') : '')
+ (!lv.showRecipe ? tx(' · tarif gizli', ' · hidden recipe', ' · Rezept verdeckt') : '');
};

const howToPlay = roleKey === 'cashier'
? tx(
'Sepetteki her ürüne bir kez dokunarak okut. Meyve-sebzenin barkodu yoktur: önce "Tartı"yı aç, sonra okut. Çalışan seviyesinden itibaren sarı İNDİRİM etiketli ürünleri okuttuktan sonra "%" ile indirimi uygula (etiketsiz ürüne indirim hatadır). Poşet isteyene poşet ekle. "Ödeme Al"a bas; nakitse para üstünü kendin hesaplayıp ver. Uzman seviyesinde bazı kartlar reddedilir, müşteri nakit öder. Müşteri bekledikçe ve hata yaptıkça memnuniyeti düşer.',
'Tap each basket item once to scan it. Produce has no barcode: switch on the "Scale" first. From Staff level, after scanning items with a yellow DISCOUNT sticker tap "%" to apply it (discounting an unstickered item is a mistake). Add a bag if asked. Tap "Take Payment"; for cash, work out and give the change. At Expert level some cards are declined and the customer pays cash. Waiting and mistakes lower customer satisfaction.',
'Tippe jede Ware einmal an. Obst/Gemüse ohne Barcode: erst "Waage". Ab Mitarbeiter-Stufe bei gelbem RABATT-Etikett nach dem Scannen "%" tippen (Rabatt ohne Etikett ist ein Fehler). Tüte buchen, wenn gewünscht. "Bezahlen" tippen; bei Bargeld Wechselgeld selbst berechnen. Ab Experte werden manche Karten abgelehnt. Warten und Fehler senken die Zufriedenheit.'
)
: roleKey === 'shelf'
? tx(
'Arabadan bir ürün seç, sonra rafta etiketi o ürün olan yere dokun. Etikette rafta olması gereken ADET yazar (×2 gibi); rafı o adede kadar doldur. Son kullanma tarihi (SKT) bugünden önce olanları İmha kutusuna at; SKT bugünse ürün hâlâ satılabilir. Raf dolduktan sonra artan sağlam ürünleri Depoya gönder. Uzman seviyesinden itibaren arabada bazı ürünler eksik gelir: rafı elindekiyle doldurup "Eksik bildir" de. Raf planı birkaç saniye görünür, ezberlemen gerekir.',
'Pick an item from the trolley, then tap the shelf spot with its label. The label shows the QUANTITY needed (e.g. ×2); fill the spot up to it. Items whose expiry date is before today go to Disposal; an item expiring today can still be sold. Once a spot is full, send surplus good items back to Storage. From Expert level some items are short: fill what you can and tap "Report shortage". The shelf plan is shown only for a few seconds.',
'Wähle eine Ware und tippe auf ihren Regalplatz. Das Etikett zeigt die MENGE (z. B. ×2). Abgelaufene Waren (MHD vor heute) in die Entsorgung; MHD heute ist noch verkäuflich. Ist ein Platz voll, Überbestand ins Lager. Ab Experte fehlt manche Ware: auffüllen und "Fehlbestand melden". Der Regalplan ist nur kurz sichtbar.'
)
: tx(
'Müşterinin siparişini oku, malzemeleri tarifteki SIRAYLA bardağa ekle ve "Servis Et"e bas. Hızlı olursan bahşiş alırsın. Yanlış servis −25, bardağı dökmek −5 puan. Uzman seviyesinden itibaren önce bardak boyunu seçersin ve tarif gizlidir; bakmak −20 puan. Müşteri bekledikçe ve hata yaptıkça memnuniyeti düşer.',
'Read the order, add the ingredients to the cup IN RECIPE ORDER and tap "Serve". Be quick for tips. Wrong serve −25, discarding −5. From Expert level you pick the cup size first and the recipe is hidden; peeking costs −20. Waiting and mistakes lower satisfaction.',
'Lies die Bestellung, gib die Zutaten IN REZEPT-REIHENFOLGE in den Becher und tippe auf "Servieren". Falsch −25, Wegschütten −5. Ab Experte zuerst die Größe wählen, Rezept verdeckt; Nachsehen −20. Warten und Fehler senken die Zufriedenheit.'
);

if (!loaded) {
return (
<Screen>
<ScreenHeader title={tx('İŞ BAŞI', 'ON THE JOB', 'IM JOB')} subtitle={tx('Oyna, mesleği dene', 'Play and try a job', 'Spiel und probier einen Beruf')} />
<ActivityIndicator color={c.green} />
</Screen>
);
}

/* ----- Achievements ----- */
if (view === 'achievements') {
return (
<Screen>
<ScreenHeader title={tx('Başarımlar', 'Achievements', 'Erfolge')} subtitle={`${unlockedCount}/${ACHIEVEMENTS.length} ${tx('açıldı', 'unlocked', 'freigeschaltet')}`} />
<TouchableOpacity onPress={() => setView('venues')} style={{ marginBottom: 10 }}>
<Text style={s.link}>‹ {tx('İş Başı', 'On the Job', 'Im Job')}</Text>
</TouchableOpacity>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
{ACHIEVEMENTS.map((a) => {
const got = career.achievements[a.id];
const [title, desc] = pickByLang(a, lang);
return (
<View key={a.id} style={{ width: '48.5%', backgroundColor: got ? c.card : c.chip, borderRadius: 18, padding: 12, marginBottom: 10, borderWidth: got ? 1.5 : 0, borderColor: c.gold, opacity: got ? 1 : 0.7 }}>
<View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: got ? '#FFF1D2' : 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 24, opacity: got ? 1 : 0.35 }}>{got ? a.icon : '🔒'}</Text>
</View>
<Text style={{ color: c.text, fontWeight: '900', fontSize: 14, marginTop: 8 }}>{title}</Text>
<Text style={{ color: c.sub, fontSize: 12, marginTop: 3, lineHeight: 16 }}>{desc}</Text>
<Text style={{ color: got ? c.green : c.sub, fontSize: 11, fontWeight: '800', marginTop: 6 }}>
{got ? `✓ ${got}` : a.xp ? `+${a.xp} XP` : ''}
</Text>
</View>
);
})}
</View>
</Screen>
);
}

/* ----- Performance history ----- */
if (view === 'history') {
const list = [...career.history].reverse();
const last = career.history.slice(-12);
const byRole = ['barista', 'cashier', 'shelf'].map((rk) => {
const rows = career.history.filter((h) => h.r === rk);
const avg = rows.length ? Math.round(rows.reduce((a, h) => a + (100 * h.s) / h.m, 0) / rows.length) : null;
const sats = rows.filter((h) => typeof h.sat === 'number');
const sat = sats.length ? Math.round(sats.reduce((a, h) => a + h.sat, 0) / sats.length) : null;
return { rk, n: rows.length, avg, sat };
});
return (
<Screen>
<ScreenHeader title={tx('Performans geçmişi', 'Performance history', 'Leistungsverlauf')} subtitle={tx(`Son ${career.history.length} vardiya`, `Last ${career.history.length} shifts`, `Letzte ${career.history.length} Schichten`)} />
<TouchableOpacity onPress={() => setView('venues')} style={{ marginBottom: 10 }}>
<Text style={s.link}>‹ {tx('İş Başı', 'On the Job', 'Im Job')}</Text>
</TouchableOpacity>
{list.length === 0 ? (
<View style={[s.card, { alignItems: 'center', paddingVertical: 26 }]}>
<Text style={{ fontSize: 40 }}>📈</Text>
<Text style={[s.cardTitle, { marginTop: 8 }]}>{tx('Henüz kayıtlı vardiya yok', 'No shifts recorded yet', 'Noch keine Schichten')}</Text>
</View>
) : (
<>
<View style={[s.card, { padding: 14 }]}>
<Text style={s.cardTitle}>{tx('Puan oranı (son vardiyalar)', 'Score ratio (recent shifts)', 'Punktequote (zuletzt)')}</Text>
<View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, marginTop: 12 }}>
{last.map((h, i) => {
const pct = Math.round((100 * h.s) / h.m);
return (
<View key={i} style={{ flex: 1, alignItems: 'center', marginHorizontal: 2 }}>
<Text style={{ fontSize: 9, color: c.sub }}>{pct}</Text>
<View style={{ width: 18, height: Math.max(4, pct * 0.85), borderRadius: 4, backgroundColor: IB_GRADE_COLOR[h.g] || c.green, marginTop: 2 }} />
<Text style={{ fontSize: 11, marginTop: 3 }}>{ROLE_ICON[h.r]}</Text>
</View>
);
})}
</View>
</View>
<View style={{ flexDirection: 'row', marginTop: 10 }}>
{byRole.map((r, i) => (
<View key={r.rk} style={[s.card, { flex: 1, marginRight: i < 2 ? 8 : 0, padding: 10, alignItems: 'center' }]}>
<Text style={{ fontSize: 20 }}>{ROLE_ICON[r.rk]}</Text>
<Text style={{ color: c.text, fontWeight: '900', fontSize: 16, marginTop: 2 }}>{r.avg === null ? '—' : `%${r.avg}`}</Text>
<Text style={{ color: c.sub, fontSize: 10, textAlign: 'center' }}>{tx('ort. puan', 'avg score', 'Ø Punkte')} · {r.n}</Text>
{r.sat !== null && <Text style={{ color: c.sub, fontSize: 10 }}>{ibMood(r.sat)} %{r.sat}</Text>}
</View>
))}
</View>
<Text style={s.label}>{tx('VARDİYALAR', 'SHIFTS', 'SCHICHTEN')}</Text>
{list.map((h, i) => (
<View key={i} style={[s.card, { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8 }]}>
<IbGradeBadge grade={h.g} size={38} />
<View style={[s.flex1, { marginLeft: 12 }]}>
<Text style={{ color: c.text, fontWeight: '800' }}>{ROLE_ICON[h.r]} {L(ROLES[h.r])} · {L(roleLevelInfo(h.r, h.l))}</Text>
<Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
{h.d ? formatDateTR(h.d) : ''} · {h.s}/{h.m} · {'★'.repeat(h.st)}{h.sat !== null ? ` · ${ibMood(h.sat)} %${h.sat}` : ''}
</Text>
</View>
<Text style={{ color: c.green, fontWeight: '900' }}>+{h.xp} XP</Text>
</View>
))}
</>
)}
</Screen>
);
}

/* ----- My coupons ----- */
if (view === 'coupons') {
return (
<Screen>
<ScreenHeader title={tx('Kuponlarım', 'My Coupons', 'Meine Gutscheine')} subtitle={tx('İş Başı vardiyalarından kazandıkların', 'Earned from your On the Job shifts', 'Aus deinen Schichten verdient')} />
<TouchableOpacity onPress={() => setView('venues')} style={{ marginBottom: 10 }}>
<Text style={s.link}>‹ {tx('İş Başı', 'On the Job', 'Im Job')}</Text>
</TouchableOpacity>
{coupons.length === 0 ? (
<View style={[s.card, { alignItems: 'center', paddingVertical: 26 }]}>
<Text style={{ fontSize: 44 }}>🎫</Text>
<Text style={[s.cardTitle, { marginTop: 8 }]}>{tx('Henüz kuponun yok', 'No coupons yet', 'Noch keine Gutscheine')}</Text>
<Text style={[s.note, { textAlign: 'center' }]}>
{tx(`Bir mekanda ${REWARD_MIN_STARS}+ yıldızlı ${SHIFTS_FOR_REWARD} vardiya tamamla, kuponun burada belirsin.`, `Finish ${SHIFTS_FOR_REWARD} shifts with ${REWARD_MIN_STARS}+ stars at a venue and your coupon appears here.`, `Schaffe ${SHIFTS_FOR_REWARD} Schichten mit ${REWARD_MIN_STARS}+ Sternen.`)}
</Text>
</View>
) : coupons.map((cp) => (
<IbCouponTicket key={cp.id || cp.code} coupon={cp} expanded={openCoupon === cp.code} c={c} tx={tx} lang={lang} onPress={() => setOpenCoupon(openCoupon === cp.code ? null : cp.code)} />
))}
<Text style={s.note}>{tx('Kupona dokununca QR kodu açılır.', 'Tap a coupon to show its QR code.', 'Tippe auf einen Gutschein für den QR-Code.')}</Text>
</Screen>
);
}

/* ----- Venues ----- */
if (view === 'venues') {
return (
<Screen>
<ScreenHeader title={tx('İŞ BAŞI', 'ON THE JOB', 'IM JOB')} subtitle={tx('Oyna, mesleği dene, ödül kazan', 'Play, try a job, earn rewards', 'Spielen, Beruf testen, gewinnen')} />
<View style={{ backgroundColor: c.dark, borderRadius: 24, padding: 18, marginBottom: 14, overflow: 'hidden' }}>
<Text style={{ position: 'absolute', right: -10, top: -14, fontSize: 120, opacity: 0.1 }}>💼</Text>
<Text style={{ color: '#F5B83D', fontWeight: '900', fontSize: 12, letterSpacing: 2 }}>{tx('BUGÜN HANGİ İŞTESİN?', 'WHICH JOB TODAY?', 'WELCHER JOB HEUTE?')}</Text>
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 22, marginTop: 6 }}>{tx('Bir gün o işi sen yap', 'Do the job for a day', 'Mach den Job für einen Tag')}</Text>
<Text style={{ color: '#CFE3DC', fontSize: 13, marginTop: 6, lineHeight: 19 }}>
{tx('Gerçek çalışanların günlük işini öğren, vardiyanı tamamla, kupon kazan.', 'Learn what real staff do every day, finish your shift, earn coupons.', 'Lerne den Arbeitsalltag, schaffe deine Schicht, verdiene Gutscheine.')}
</Text>
<View style={{ flexDirection: 'row', marginTop: 14 }}>
{[
['⭐', totalStars, tx('yıldız', 'stars', 'Sterne')],
['🕐', totalShifts, tx('vardiya', 'shifts', 'Schichten')],
['🎫', activeCoupons.length, tx('kupon', 'coupons', 'Gutscheine')],
].map(([icon, n, label]) => (
<View key={label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 10, alignItems: 'center', marginRight: label === tx('kupon', 'coupons', 'Gutscheine') ? 0 : 8 }}>
<Text style={{ fontSize: 18 }}>{icon}</Text>
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18, marginTop: 2 }}>{n}</Text>
<Text style={{ color: '#CFE3DC', fontSize: 11 }}>{label}</Text>
</View>
))}
</View>
<View style={{ backgroundColor: modeChip.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 12, alignSelf: 'flex-start' }}>
<Text style={{ color: modeChip.color, fontSize: 12, fontWeight: '800' }}>{modeChip.text}</Text>
</View>
</View>

{careerCard}
{missionsCard}

<TouchableOpacity onPress={() => navigate('prova')} style={[s.card, s.row, { marginBottom: 14, borderColor: c.green, borderWidth: 1.5 }]}>
<Text style={{ fontSize: 26, marginRight: 12 }}>🎭</Text>
<View style={s.flex1}>
<Text style={s.cardTitle}>{tx('Meslek Provası: 30+ meslek daha', 'Job Rehearsal: 30+ more jobs', 'Berufsprobe: 30+ weitere Berufe')}</Text>
<Text style={s.cardMeta}>{tx('Hemşire, yazılımcı, aşçı, öğretmen ve daha fazlası', 'Nurse, developer, cook, teacher and more', 'Pflege, Software, Koch, Lehrer und mehr')}</Text>
</View>
<Ionicons name="chevron-forward" size={20} color={c.muted} />
</TouchableOpacity>

<TouchableOpacity onPress={() => setView('coupons')} style={[s.card, s.row, { marginBottom: 14, borderColor: c.gold, borderWidth: 1.5 }]}>
<Text style={{ fontSize: 26, marginRight: 12 }}>🎫</Text>
<View style={s.flex1}>
<Text style={s.cardTitle}>{tx('Kuponlarım', 'My Coupons', 'Meine Gutscheine')}</Text>
<Text style={s.cardMeta}>{activeCoupons.length > 0 ? tx(`${activeCoupons.length} kullanılabilir kupon`, `${activeCoupons.length} usable coupons`, `${activeCoupons.length} einlösbar`) : tx('Kazandığın kuponlar burada', 'Coupons you earn appear here', 'Deine Gutscheine erscheinen hier')}</Text>
</View>
<Ionicons name="chevron-forward" size={20} color={c.muted} />
</TouchableOpacity>

<Text style={s.label}>{tx('MEKANLAR', 'VENUES', 'ORTE')}</Text>
{VENUES.map((v) => {
const vp = progress.venues[v.key];
const chips = v.available
? [
{ text: v.roles.map((k) => `${ROLES[k].icon} ${L(ROLES[k])}`).join('  '), bg: '#E6F3EC', color: '#12524A' },
...(vp ? [{ text: `${v.partner && !v.couponsAgreed ? '🏅' : '🎁'} ${vp.rewardProgress}/${SHIFTS_FOR_REWARD}`, bg: '#FFF1D2', color: '#9A5B00' }] : []),
]
: [{ text: tx('🔒 Yakında', '🔒 Coming soon', '🔒 Bald'), bg: '#E7ECE8', color: '#6E7F7A' }];
return (
<IbStorefront key={v.key} venue={v} name={v.partner ? L(v) : U(L(v))} sub={pick(lang, v.subTr, v.subEn, v.subDe)} chips={chips} disabled={!v.available} onPress={() => openVenue(v)} />
);
})}
<Text style={s.note}>
{tx('Şu an deneme mekanları var; anlaşmalı markaların mekanları eklenecek.', 'These are demo venues for now; partner brand venues will be added.', 'Derzeit Demo-Orte; Orte von Partnermarken folgen.')}
</Text>
</Screen>
);
}

/* ----- Venue roles ----- */
if (view === 'roles') {
const theme = IB_VENUE_THEME[venue.key] || IB_VENUE_THEME.demoCafe;
return (
<Screen>
<ScreenHeader title={`${venue.icon} ${L(venue)}`} subtitle={tx('Bugün hangi işi yapmak istersin?', 'Which job do you want to do today?', 'Welchen Job willst du heute machen?')} />
<TouchableOpacity onPress={() => setView('venues')} style={{ marginBottom: 10 }}>
<Text style={s.link}>‹ {tx('Mekanlar', 'Venues', 'Orte')}</Text>
</TouchableOpacity>
<View style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 14 }}><IbAwning colors={theme.awning} /></View>
{venue.roles.filter((k) => ROLES[k]).map((k) => {
const r = ROLES[k];
const rp = progress.roles[k];
const lvl = roleLevelInfo(k, rp.unlockedLevel);
const maxLv = roleLevels(k).length;
return (
<TouchableOpacity key={k} activeOpacity={0.85} onPress={() => openRole(k)} style={[s.card, { marginBottom: 12, padding: 16 }]}>
<View style={s.row}>
<View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: theme.sign, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
<Text style={{ fontSize: 34 }}>{r.icon}</Text>
</View>
<View style={s.flex1}>
<Text style={[s.cardTitle, { fontSize: 18 }]}>{L(r)}</Text>
<Text style={s.cardMeta}>{tx('Seviye', 'Level', 'Stufe')} {rp.unlockedLevel}/{maxLv} · {L(lvl)}</Text>
<View style={{ height: 6, borderRadius: 3, backgroundColor: c.chip, marginTop: 8, overflow: 'hidden' }}>
<View style={{ width: `${Math.round((rp.unlockedLevel / maxLv) * 100)}%`, height: 6, backgroundColor: c.gold }} />
</View>
</View>
<Ionicons name="chevron-forward" size={22} color={c.muted} style={{ marginLeft: 8 }} />
</View>
<Text style={[s.note, { marginTop: 10 }]}>{pickByLang(r.duties, lang)[0]}</Text>
</TouchableOpacity>
);
})}
</Screen>
);
}

/* ----- Role and level selection ----- */
if (view === 'role') {
const theme = IB_VENUE_THEME[role.venue] || IB_VENUE_THEME.demoCafe;
return (
<Screen>
<ScreenHeader title={`${role.icon} ${L(role)}`} subtitle={venueName(role.venue)} />
<TouchableOpacity onPress={() => setView(venue.roles.length > 1 ? 'roles' : 'venues')} style={{ marginBottom: 10 }}>
<Text style={s.link}>‹ {venue.roles.length > 1 ? L(venue) : tx('Mekanlar', 'Venues', 'Orte')}</Text>
</TouchableOpacity>

<View style={{ backgroundColor: theme.sign, borderRadius: 22, padding: 16, marginBottom: 12, overflow: 'hidden' }}>
<Text style={{ position: 'absolute', right: -6, bottom: -18, fontSize: 110, opacity: 0.12 }}>{role.icon}</Text>
<Text style={{ color: theme.signText, fontWeight: '900', fontSize: 12, letterSpacing: 1.5 }}>{tx('GERÇEK HAYATTA BU İŞ', 'THE JOB IN REAL LIFE', 'DER JOB IM ECHTEN LEBEN')}</Text>
{pickByLang(role.duties, lang).map((d, i) => (
<View key={d} style={{ flexDirection: 'row', marginTop: 10, alignItems: 'flex-start' }}>
<View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
<Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 11 }}>{i + 1}</Text>
</View>
<Text style={{ flex: 1, color: '#FFFFFF', fontSize: 13, lineHeight: 19 }}>{d}</Text>
</View>
))}
</View>

<View style={[s.softCard, { marginTop: 0 }]}>
<Text style={s.cardTitle}>🎮 {tx('Nasıl oynanır?', 'How to play', 'So wird gespielt')}</Text>
<Text style={s.note}>{howToPlay}</Text>
</View>

<Text style={s.label}>{tx('SEVİYELER', 'LEVELS', 'STUFEN')}</Text>
{levelsOf.map((lv) => {
const locked = lv.level > roleProgress.unlockedLevel;
const active = selectedLevel === lv.level;
const best = roleProgress.bestStars[lv.level] || 0;
return (
<TouchableOpacity key={lv.level} disabled={locked} onPress={() => setSelectedLevel(lv.level)}
style={[s.oppCard, active && { borderColor: c.green, borderWidth: 2, backgroundColor: c.soft }, locked && { opacity: 0.5 }]}>
<View style={[s.oppIcon, { backgroundColor: active ? c.green : c.chip }]}>
{locked ? <Ionicons name="lock-closed" size={18} color={c.muted} /> : <Text style={{ fontWeight: '900', fontSize: 16, color: active ? '#FFFFFF' : c.text }}>{lv.level}</Text>}
</View>
<View style={s.flex1}>
<Text style={s.cardTitle}>{L(lv)}</Text>
<Text style={s.cardMeta}>{levelMeta(lv)}</Text>
</View>
{!locked && (
<Text style={{ marginLeft: 8, fontSize: 14, letterSpacing: 1, color: c.gold }}>
{'★'.repeat(best)}<Text style={{ color: c.muted }}>{'★'.repeat(3 - best)}</Text>
</Text>
)}
</TouchableOpacity>
);
})}
{roleProgress.unlockedLevel < levelsOf.length && (
<Text style={s.note}>{tx(`Sonraki seviyeyi açmak için ${REWARD_MIN_STARS} yıldız al.`, `Get ${REWARD_MIN_STARS} stars to unlock the next level.`, `${REWARD_MIN_STARS} Sterne schalten die nächste Stufe frei.`)}</Text>
)}

{rewardCard}

<TouchableOpacity style={[s.goldBtn, starting && { opacity: 0.7 }]} disabled={starting} onPress={() => startShift(selectedLevel)}>
{starting ? <ActivityIndicator color={c.dark} /> : (
<Text style={[s.goldBtnText, { marginLeft: 0 }]}>
{mode === 'offline' ? '🏋️ ' : '▶ '}{tx('Vardiyaya Başla', 'Start Shift', 'Schicht beginnen')} · {L(roleLevelInfo(roleKey, selectedLevel))}
</Text>
)}
</TouchableOpacity>
</Screen>
);
}

/* ----- Result ----- */
if (view === 'result' && result) {
const { summary, applied } = result;
const nextLevel = applied.levelUnlocked;
const sending = result.verify === 'sending';
const doneLabel = roleKey === 'shelf' ? tx('Tamamlanan raf', 'Shelves completed', 'Fertige Regale')
: roleKey === 'cashier' ? tx('Tamamlanan müşteri', 'Customers checked out', 'Abkassierte Kunden')
: tx('Doğru servis', 'Served correctly', 'Richtig serviert');
const missLabel = roleKey === 'shelf' ? tx('Yarım kalan raf', 'Shelves unfinished', 'Unfertige Regale') : tx('Kaçan müşteri', 'Customers lost', 'Verlorene Kunden');
const rows = [
['✅', doneLabel, `${summary.served} / ${summary.total}`],
['🚶', missLabel, summary.missed],
['❌', tx('Yanlış işlem', 'Mistakes', 'Fehler'), summary.wrong],
];
if (roleKey === 'barista') rows.push(['🗑️', tx('Dökülen bardak', 'Cups discarded', 'Weggeschüttet'), summary.discards]);
if (roleKey === 'cashier') rows.push(['↩️', tx('İptal edilen ürün', 'Voided items', 'Stornierte Waren'), summary.discards]);
rows.push(['⏱️', tx('Süre', 'Time', 'Zeit'), `${Math.round(summary.elapsedMs / 1000)} ${tx('sn', 's', 's')}`]);

const verifyBox = {
sending: { bg: c.soft, color: c.text, text: tx('⏳ Sonuç sunucuda doğrulanıyor…', '⏳ Verifying result on the server…', '⏳ Ergebnis wird geprüft…') },
verified: { bg: '#DDF5E8', color: '#0E6B45', text: tx('✅ Sunucuda doğrulandı — puanın resmî.', '✅ Verified on the server — your score is official.', '✅ Auf dem Server bestätigt.') },
local: { bg: '#FFF1D2', color: '#8A5600', text: tx('📱 Cihazda kaydedildi (sunucu henüz kurulmadı; kupon verilmez).', '📱 Saved on this device (server not set up; no coupons).', '📱 Auf dem Gerät gespeichert (keine Gutscheine).') },
practice: { bg: '#E8EEF8', color: '#2D4E86', text: tx('🏋️ Antrenman — ilerlemeye ve ödüle sayılmadı.', '🏋️ Practice — did not count toward progress or rewards.', '🏋️ Training — zählt nicht.') },
pending: { bg: '#FFE3E0', color: '#9B2C24', text: tx('📡 Sonuç gönderilemedi. Bağlantı gelince yeniden dene; sunucuya ulaşmayan ve süresi dolan vardiya reddedilebilir.', '📡 The result could not be sent. Retry when online; a shift that never reached the server before expiry may be rejected.', '📡 Ergebnis nicht gesendet. Bei Verbindung erneut versuchen; eine Schicht, die vor Ablauf den Server nicht erreicht hat, kann abgelehnt werden.') },
storage: { bg: '#FFE3E0', color: '#9B2C24', text: tx('⚠️ Sonuç cihaza kaydedilemedi ve gönderilmedi. Yeniden dene.', '⚠️ The result could not be saved on this device and was not sent. Please retry.', '⚠️ Ergebnis konnte nicht auf dem Gerät gespeichert werden und wurde nicht gesendet.') },
rejected: { bg: '#FFE3E0', color: '#9B2C24', text: tx(`⚠️ Sunucu bu vardiyayı kabul etmedi (${result.reason || '?'}). İlerlemeye sayılmadı.`, `⚠️ The server did not accept this shift (${result.reason || '?'}). It did not count.`, `⚠️ Schicht nicht akzeptiert (${result.reason || '?'}).`) },
failed: { bg: '#FFE3E0', color: '#9B2C24', text: tx('⚠️ Vardiya sunucuda kaydedilemedi (süresi dolmuş ya da zaten gönderilmiş).', '⚠️ The shift could not be saved on the server (expired or already sent).', '⚠️ Schicht konnte nicht gespeichert werden.') },
}[result.verify];

return (
<Screen>
<ScreenHeader title={tx('Vardiya bitti', 'Shift over', 'Schicht vorbei')} subtitle={`${role.icon} ${L(role)} · ${L(roleLevelInfo(roleKey, summary.level))}`} />
<View style={{ backgroundColor: c.dark, borderRadius: 26, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', marginBottom: 12, overflow: 'hidden' }}>
{summary.stars === 3 && <Text style={{ position: 'absolute', top: 8, fontSize: 22, letterSpacing: 10 }}>🎉✨🎊✨🎉</Text>}
<View style={{ marginTop: summary.stars === 3 ? 18 : 0 }}><IbStars n={summary.stars} /></View>
<View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
<IbCountUp value={summary.score} style={{ color: '#FFFFFF', fontSize: 40, fontWeight: '900' }} />
<Text style={{ color: '#CFE3DC', fontSize: 15, marginLeft: 6, marginBottom: 8 }}>/ {summary.maxScore}</Text>
</View>
<Text style={{ color: '#CFE3DC', textAlign: 'center', marginTop: 4 }}>
{summary.stars === 3
? tx('Harika vardiya! Müdürün seninle gurur duyuyor.', 'Great shift! Your manager is proud of you.', 'Super Schicht! Deine Chefin ist stolz auf dich.')
: summary.passed
? tx('İyi iş! Biraz daha hızla 3 yıldız senin.', 'Good job! A bit faster for 3 stars.', 'Gut gemacht! Etwas schneller für 3 Sterne.')
: tx('Bu sefer olmadı. Kuralları gözden geçir ve yeniden dene.', 'Not this time. Review the rules and try again.', 'Diesmal nicht. Regeln ansehen und nochmal.')}
</Text>
</View>

<View style={{ backgroundColor: verifyBox.bg, borderRadius: 14, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
{sending && <ActivityIndicator color={c.green} style={{ marginRight: 8 }} />}
<Text style={{ flex: 1, color: verifyBox.color, fontWeight: '700', fontSize: 13, lineHeight: 18 }}>{verifyBox.text}</Text>
</View>
{(result.verify === 'pending' || result.verify === 'storage') && (
<TouchableOpacity style={s.primaryBtn} onPress={retryPending}>
<Text style={s.primaryBtnText}>{tx('Tekrar Gönder', 'Send Again', 'Erneut senden')}</Text>
</TouchableOpacity>
)}

{(() => {
const ev = (applied.career && applied.career.evaluation) || evaluateShift(summary);
const car = applied.career || null;
const metric = (icon, label, value) => (
<View key={label} style={{ flex: 1, alignItems: 'center' }}>
<Text style={{ fontSize: 18 }}>{icon}</Text>
<Text style={{ color: c.text, fontWeight: '900', fontSize: 16, marginTop: 2 }}>{value}</Text>
<Text style={{ color: c.sub, fontSize: 10, textAlign: 'center' }}>{label}</Text>
</View>
);
return (
<>
<View style={[s.card, { padding: 16, marginBottom: 12 }]}>
<View style={s.row}>
<IbGradeBadge grade={ev.grade} />
<View style={[s.flex1, { marginLeft: 14 }]}>
<Text style={{ fontSize: 11, fontWeight: '900', color: c.sub, letterSpacing: 1 }}>{tx('PERFORMANS DEĞERLENDİRMESİ', 'PERFORMANCE REVIEW', 'LEISTUNGSBEWERTUNG')}</Text>
<Text style={[s.cardTitle, { fontSize: 17, marginTop: 2 }]}>
{{ S: tx('Mükemmel', 'Outstanding', 'Hervorragend'), A: tx('Çok iyi', 'Very good', 'Sehr gut'), B: tx('İyi', 'Good', 'Gut'), C: tx('Geliştirilmeli', 'Needs work', 'Ausbaufähig'), D: tx('Yetersiz', 'Insufficient', 'Ungenügend') }[ev.grade]}
</Text>
</View>
</View>
<View style={{ flexDirection: 'row', marginTop: 14 }}>
{metric('🎯', tx('Doğruluk', 'Accuracy', 'Genauigkeit'), `%${ev.accuracy}`)}
{metric('⏱️', roleKey === 'shelf' ? tx('sn / raf', 's / shelf', 's / Regal') : tx('sn / müşteri', 's / customer', 's / Kunde'), ev.avgTaskSec === null ? '—' : String(ev.avgTaskSec).replace('.', ','))}
{ev.satisfaction !== null && metric(ibMood(ev.satisfaction), tx('Memnuniyet', 'Satisfaction', 'Zufriedenheit'), `%${ev.satisfaction}`)}
{metric('📊', tx('Puan oranı', 'Score ratio', 'Quote'), `%${ev.ratio}`)}
</View>
<View style={{ backgroundColor: c.soft, borderRadius: 12, padding: 10, marginTop: 14 }}>
<Text style={{ fontWeight: '900', color: c.text, fontSize: 12 }}>💡 {tx('Müdürünün notu', "Your manager's note", 'Notiz der Chefin')}</Text>
{ev.tips.map((k) => (
<Text key={k} style={{ color: c.text, fontSize: 13, marginTop: 5, lineHeight: 18 }}>• {pick(lang, (TIPS[k] || TIPS.other).tr, (TIPS[k] || TIPS.other).en, (TIPS[k] || TIPS.other).de)}</Text>
))}
</View>
</View>

{car ? (
<View style={{ backgroundColor: c.dark, borderRadius: 20, padding: 16, marginBottom: 12 }}>
<View style={[s.row, { marginBottom: 10 }]}>
<IbPop trigger={car.xpGained} style={{ flex: 1 }}>
<Text style={{ color: '#F5B83D', fontWeight: '900', fontSize: 24 }}>+{car.xpGained} XP</Text>
</IbPop>
<Text style={{ color: '#CFE3DC', fontSize: 11, textAlign: 'right' }}>
{tx('vardiya', 'shift', 'Schicht')} {car.xpBreakdown.shift}
{car.xpBreakdown.missions ? ` · ${tx('görev', 'missions', 'Aufgaben')} ${car.xpBreakdown.missions}` : ''}
{car.xpBreakdown.achievements ? ` · ${tx('başarım', 'achievements', 'Erfolge')} ${car.xpBreakdown.achievements}` : ''}
</Text>
</View>
<IbXpBar xp={progress.career.xp} light tx={tx} lang={lang} />
{car.levelAfter > car.levelBefore && (
<IbPop trigger={car.levelAfter}>
<View style={{ backgroundColor: '#F5B83D', borderRadius: 12, padding: 10, marginTop: 12 }}>
<Text style={{ color: '#0A3D33', fontWeight: '900' }}>🎉 {tx(`Seviye atladın: ${car.levelAfter}!`, `Level up: ${car.levelAfter}!`, `Stufe ${car.levelAfter} erreicht!`)}</Text>
</View>
</IbPop>
)}
{car.missionsCompleted.map((id) => {
const m = missionById(id);
return <Text key={id} style={{ color: '#FFFFFF', marginTop: 10, fontWeight: '700' }}>🎯 {tx('Görev tamam', 'Mission done', 'Aufgabe erledigt')}: {pick(lang, m.tr, m.en, m.de)} (+{MISSION_XP} XP)</Text>;
})}
{car.newAchievements.map((id) => {
const a = achievementById(id);
const [title] = pickByLang(a, lang);
return (
<IbPop key={id} trigger={id}>
<View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, marginTop: 10 }}>
<Text style={{ fontSize: 24, marginRight: 10 }}>{a.icon}</Text>
<View style={{ flex: 1 }}>
<Text style={{ color: '#F5B83D', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>{tx('YENİ BAŞARIM', 'NEW ACHIEVEMENT', 'NEUER ERFOLG')}</Text>
<Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{title}</Text>
</View>
{!!a.xp && <Text style={{ color: '#7CFFB2', fontWeight: '900' }}>+{a.xp}</Text>}
</View>
</IbPop>
);
})}
</View>
) : (result.verify === 'practice' && (
<Text style={[s.note, { marginBottom: 10 }]}>{tx('Antrenmanda XP, görev ve başarım kazanılmaz.', 'Practice does not earn XP, missions or achievements.', 'Im Training gibt es keine XP.')}</Text>
))}
</>
);
})()}

{result.coupon && (
<IbPop trigger={result.coupon.code}>
<View style={{ backgroundColor: '#FFF6DF', borderRadius: 20, padding: 14, marginBottom: 12, borderWidth: 2, borderColor: c.gold }}>
<Text style={{ fontWeight: '900', fontSize: 16, color: '#0E2F28' }}>{noPartnerCoupon(result.coupon.venue) ? `🏅 ${tx('Cucci Bruschetta rozeti kazandın!', 'You earned a Cucci Bruschetta badge!', 'Cucci-Bruschetta-Abzeichen erhalten!')}` : `🎫 ${tx('Kupon kazandın!', 'You won a coupon!', 'Gutschein gewonnen!')}`}</Text>
<Text style={{ color: '#6E7F7A', marginTop: 4, marginBottom: 10 }}>{tx('Kuponlarım bölümüne eklendi.', 'Added to My Coupons.', 'Zu deinen Gutscheinen hinzugefügt.')}</Text>
<IbCouponTicket coupon={result.coupon} expanded={false} c={c} tx={tx} lang={lang} onPress={() => { setOpenCoupon(result.coupon.code); setView('coupons'); }} />
</View>
</IbPop>
)}

<View style={s.softCard}>
{rows.map(([icon, label, value]) => (
<View key={label} style={[s.row, { marginTop: 6 }]}>
<Text style={[s.checkText, { marginLeft: 0 }]}>{icon} {label}</Text>
<Text style={s.cardTitle}>{value}</Text>
</View>
))}
</View>

{!!nextLevel && (
<IbPop trigger={nextLevel}>
<View style={[s.softCard, { borderWidth: 1.5, borderColor: c.gold, flexDirection: 'row', alignItems: 'center' }]}>
<Text style={{ fontSize: 24, marginRight: 10 }}>🔓</Text>
<Text style={[s.cardTitle, s.flex1]}>{tx('Yeni seviye açıldı', 'New level unlocked', 'Neue Stufe freigeschaltet')}: {L(roleLevelInfo(roleKey, nextLevel))}</Text>
</View>
</IbPop>
)}
{applied.dailyCapReached && (
<Text style={s.note}>{tx('Bu mekanda bugünkü ödül sınırına ulaştın; bu vardiya ödüle sayılmadı ama seviye ve puanın kaydedildi.', 'Daily reward limit reached at this venue; this shift did not count toward rewards but your progress was saved.', 'Tageslimit an diesem Ort erreicht.')}</Text>
)}

{(result.verify === 'verified' || result.verify === 'local') && rewardCard}

{!!nextLevel && (
<TouchableOpacity style={s.goldBtn} onPress={() => startShift(nextLevel)}>
<Text style={[s.goldBtnText, { marginLeft: 0 }]}>▶ {tx('Sonraki Seviyeye Geç', 'Next Level', 'Nächste Stufe')}</Text>
</TouchableOpacity>
)}
<TouchableOpacity style={nextLevel ? s.secondaryBtn : s.darkBtn} disabled={sending} onPress={() => (result.verify === 'practice' ? startPractice(summary.level) : startShift(summary.level))}>
<Text style={nextLevel ? s.secondaryBtnText : s.darkBtnText}>{tx('Tekrar Oyna', 'Play Again', 'Nochmal spielen')}</Text>
</TouchableOpacity>
<TouchableOpacity style={s.secondaryBtn} disabled={sending} onPress={() => setView('role')}>
<Text style={s.secondaryBtnText}>{tx('Seviyelere Dön', 'Back to Levels', 'Zurück zu den Stufen')}</Text>
</TouchableOpacity>
{isKoprusuActive && (result.verify === 'verified' || result.verify === 'local') && summary.stars >= 2 && (
<TouchableOpacity style={s.goldBtn} disabled={sending} onPress={() => navigate('koprusu')}>
<Text style={[s.goldBtnText, { marginLeft: 0 }]}>🪪 {tx('MESLEK PASAPORTUMA EKLENDİ — Bak', 'ADDED TO MY PASSPORT — View', 'IM BERUFSPASS — Ansehen')}</Text>
</TouchableOpacity>
)}
</Screen>
);
}

/* ----- Shift (game) ----- */
if (!shift) {
return (
<Screen>
<ScreenHeader title={tx('İŞ BAŞI', 'ON THE JOB', 'IM JOB')} />
<TouchableOpacity style={s.darkBtn} onPress={() => setView('role')}>
<Text style={s.darkBtnText}>{tx('Seviyelere Dön', 'Back to Levels', 'Zurück zu den Stufen')}</Text>
</TouchableOpacity>
</Screen>
);
}

const lvInfo = roleLevelInfo(shift.role, shift.level);
const task = shift.orders[shift.index] || null;
const timeLeft = shift.remainingMs / shift.patienceMs;
const ev = shift.lastEvent;

const reasonText = (r) => ({
size: tx('Bardak boyu yanlış.', 'Wrong cup size.', 'Falsche Bechergröße.'),
order: tx('Malzemeler doğru ama sırası yanlış.', 'Right ingredients, wrong order.', 'Richtige Zutaten, falsche Reihenfolge.'),
ingredients: tx('Eksik ya da fazla malzeme var.', 'Missing or extra ingredients.', 'Zutaten fehlen oder sind zu viel.'),
missing: tx('Sepette okutulmamış ürün var.', 'Some basket items were not scanned.', 'Nicht alle Waren wurden gescannt.'),
double: tx('Bir ürün iki kez okutuldu; müşteriden fazla para alınırdı.', 'An item was scanned twice; the customer would be overcharged.', 'Eine Ware wurde doppelt gescannt.'),
bagMissing: tx('Müşteri poşet istemişti.', 'The customer asked for a bag.', 'Der Kunde wollte eine Tüte.'),
bagExtra: tx('Müşteri poşet istemedi.', 'The customer did not want a bag.', 'Der Kunde wollte keine Tüte.'),
discountMissing: tx('“Bu üründe indirim vardı!” — etiketli ürüne indirim uygulanmadı.', '“That item was on sale!” — a stickered discount was not applied.', '„Das war reduziert!“ — Rabatt nicht angewendet.'),
noDiscount: tx('Bu üründe indirim etiketi yok.', 'This item has no discount sticker.', 'Diese Ware hat kein Rabattetikett.'),
expiredToStorage: tx('SKT\'si geçmiş ürün depoya değil imhaya gider.', 'Expired items go to disposal, not storage.', 'Abgelaufenes gehört in die Entsorgung.'),
neededOnShelf: tx('Raf henüz dolmadı; bu ürün rafa lazım.', 'The spot is not full yet; this item is needed.', 'Der Platz ist noch nicht voll.'),
falseShortage: tx('Arabada bu üründen hâlâ var — eksik değil.', 'There is still stock of this item in the trolley.', 'Davon ist noch etwas im Wagen.'),
change: tx('Para üstü yanlış verildi.', 'Wrong change given.', 'Falsches Wechselgeld.'),
wrongSlot: tx('Bu ürün o rafın yeri değil.', 'That is not this item\'s spot.', 'Das ist nicht der Platz dieser Ware.'),
expiredOnShelf: tx('SKT\'si geçmiş ürün rafa konmaz!', 'Expired items must not go on the shelf!', 'Abgelaufenes gehört nicht ins Regal!'),
freshDiscarded: tx('Bu ürünün tarihi geçmemiş, atılmaz.', 'This item has not expired; do not throw it away.', 'Diese Ware ist nicht abgelaufen.'),
}[r] || tx('Hatalı işlem.', 'Mistake.', 'Fehler.'));

let banner = null;
if (ev) {
const green = '#1FA36F'; const orange = '#E08A1E'; const red = '#D9473D'; const grey = '#5E6E69';
if (ev.type === 'correct') {
banner = { color: green, icon: '🎉', text: shift.role === 'shelf'
? tx(`Raf tamam! +${ev.points} puan`, `Shelf done! +${ev.points}`, `Regal fertig! +${ev.points}`)
: shift.role === 'cashier'
? tx(`${ev.customer} alışverişini tamamladı! +${ev.points} puan`, `${ev.customer} is checked out! +${ev.points}`, `${ev.customer} ist abkassiert! +${ev.points}`)
: tx(`${ev.customer} teşekkür etti! +${ev.points} puan`, `${ev.customer} says thanks! +${ev.points}`, `${ev.customer} bedankt sich! +${ev.points}`) };
} else if (ev.type === 'wrong') {
const pts = ev.reason === 'wrongSlot' ? MARKET_POINTS.wrongSlot : ev.reason === 'expiredOnShelf' || ev.reason === 'freshDiscarded' ? MARKET_POINTS.badShelfAction : ISBASI_POINTS.wrongServe;
banner = { color: red, icon: '✋', text: `−${pts}: ${reasonText(ev.reason)}` };
} else if (ev.type === 'missed') {
banner = { color: orange, icon: '😤', text: shift.role === 'shelf'
? tx('Süre doldu, raf yarım kaldı.', 'Time is up, the shelf was left unfinished.', 'Zeit vorbei, Regal unfertig.')
: tx(`${ev.customer} beklemekten sıkılıp gitti.`, `${ev.customer} got tired of waiting and left.`, `${ev.customer} ist gegangen.`) };
}
else if (ev.type === 'needCup') banner = { color: orange, icon: '🥤', text: tx('Önce bardak boyunu seç.', 'Pick the cup size first.', 'Wähle zuerst die Bechergröße.') };
else if (ev.type === 'cupLocked') banner = { color: orange, icon: '🥤', text: tx('Bardak dolu; boyu değiştirmek için önce dök.', 'Cup has ingredients; discard to change size.', 'Erst wegschütten, dann Größe ändern.') };
else if (ev.type === 'cupFull') banner = { color: orange, icon: '🥤', text: tx('Bardak doldu.', 'The cup is full.', 'Der Becher ist voll.') };
else if (ev.type === 'empty') banner = { color: orange, icon: '🤔', text: shift.role === 'cashier' ? tx('Henüz ürün okutmadın.', 'Nothing scanned yet.', 'Noch nichts gescannt.') : tx('Bardak boş.', 'The cup is empty.', 'Der Becher ist leer.') };
else if (ev.type === 'discard') banner = { color: grey, icon: '🗑️', text: tx(`Bardak döküldü (−${ISBASI_POINTS.discard}).`, `Cup discarded (−${ISBASI_POINTS.discard}).`, `Weggeschüttet (−${ISBASI_POINTS.discard}).`) };
else if (ev.type === 'peek') banner = { color: grey, icon: '👀', text: tx(`Plana bakıldı (−${ISBASI_POINTS.peek}).`, `Checked the plan (−${ISBASI_POINTS.peek}).`, `Plan angesehen (−${ISBASI_POINTS.peek}).`) };
else if (ev.type === 'needScale') banner = { color: orange, icon: '⚖️', text: tx('Meyve-sebzenin barkodu yok: önce Tartı\'yı aç.', 'Produce has no barcode: switch on the Scale first.', 'Obst/Gemüse ohne Barcode: erst die Waage einschalten.') };
else if (ev.type === 'scaleNotNeeded') banner = { color: orange, icon: '⚖️', text: tx('Paketli ürün tartılmaz, barkodu okutulur. Tartı kapatıldı.', 'Packaged items are scanned, not weighed. Scale switched off.', 'Verpackte Ware wird gescannt, nicht gewogen.') };
else if (ev.type === 'void') banner = { color: grey, icon: '↩️', text: tx(`Son ürün iptal edildi (−${MARKET_POINTS.voidItem}).`, `Last item voided (−${MARKET_POINTS.voidItem}).`, `Letzte Ware storniert (−${MARKET_POINTS.voidItem}).`) };
else if (ev.type === 'cash') banner = { color: '#12524A', icon: '💵', text: tx(`Müşteri ${formatMoney(ev.given)} verdi. Para üstünü hesapla ve ver.`, `The customer paid ${formatMoney(ev.given)}. Work out and give the change.`, `Kunde zahlt ${formatMoney(ev.given)}. Wechselgeld berechnen.`) };
else if (ev.type === 'paying') banner = { color: orange, icon: '💵', text: tx('Ödeme aşamasındasın; önce para üstünü ver.', 'You are taking payment; give the change first.', 'Erst das Wechselgeld geben.') };
else if (ev.type === 'selectFirst') banner = { color: orange, icon: '👆', text: tx('Önce arabadan bir ürün seç.', 'Pick an item from the trolley first.', 'Wähle zuerst eine Ware vom Wagen.') };
else if (ev.type === 'slotFull') banner = { color: orange, icon: '📦', text: tx('Bu raf dolu — fazlasını depoya gönder.', 'This spot is full — send the surplus to storage.', 'Platz voll — Überbestand ins Lager.') };
else if (ev.type === 'stored') banner = { color: green, icon: '📦', text: tx(`Fazla stok depoya döndü. +${ev.points}`, `Surplus returned to storage. +${ev.points}`, `Überbestand ins Lager. +${ev.points}`) };
else if (ev.type === 'reported') banner = { color: green, icon: '📋', text: tx(`Eksik stok bildirildi, depo haberdar. +${ev.points}`, `Shortage reported to storage. +${ev.points}`, `Fehlbestand gemeldet. +${ev.points}`) };
else if (ev.type === 'alreadyReported') banner = { color: grey, icon: '📋', text: tx('Bu raf zaten bildirildi.', 'Already reported.', 'Schon gemeldet.') };
else if (ev.type === 'discounted') banner = { color: green, icon: '🏷️', text: tx(`%${ev.pct} indirim uygulandı. +${ev.points}`, `${ev.pct}% discount applied. +${ev.points}`, `${ev.pct} % Rabatt. +${ev.points}`) };
else if (ev.type === 'alreadyDiscounted') banner = { color: grey, icon: '🏷️', text: tx('İndirim zaten uygulandı.', 'Discount already applied.', 'Rabatt schon angewendet.') };
else if (ev.type === 'scanFirst') banner = { color: orange, icon: '🏷️', text: tx('Önce ürünü okut.', 'Scan the item first.', 'Erst scannen.') };
else if (ev.type === 'declined') banner = { color: '#12524A', icon: '💳', text: tx(`Kart reddedildi. Müşteri nakit ${formatMoney(ev.given)} verdi; para üstünü ver.`, `Card declined. The customer paid ${formatMoney(ev.given)} cash; give the change.`, `Karte abgelehnt. Kunde zahlt ${formatMoney(ev.given)} bar.`) };
else if (ev.type === 'placed') banner = { color: green, icon: '👍', text: tx(`Doğru yer! +${ev.points}`, `Right spot! +${ev.points}`, `Richtiger Platz! +${ev.points}`) };
else if (ev.type === 'removed') banner = { color: green, icon: '🧹', text: tx(`SKT geçmiş ürün raftan kaldırıldı. +${ev.points}`, `Expired item removed. +${ev.points}`, `Abgelaufene Ware entfernt. +${ev.points}`) };
else if (ev.type === 'answerRight') banner = { color: green, icon: '🧭', text: tx(`Müşteriye doğru yolu gösterdin. +${ev.points}`, `You showed the customer the right way. +${ev.points}`, `Richtig gezeigt. +${ev.points}`) };
else if (ev.type === 'answerWrong') banner = { color: red, icon: '🧭', text: tx(`Yanlış reyon (−${MARKET_POINTS.questionWrong}). Doğrusu: ${L(aisleByKey(ev.answer))}`, `Wrong aisle (−${MARKET_POINTS.questionWrong}). Correct: ${L(aisleByKey(ev.answer))}`, `Falscher Gang (−${MARKET_POINTS.questionWrong}). Richtig: ${L(aisleByKey(ev.answer))}`) };
}

const counterLabel = shift.role === 'shelf' ? tx('Raf', 'Shelf', 'Regal') : tx('Müşteri', 'Customer', 'Kunde');
const timeLabel = `${shift.role === 'shelf' ? tx('Süre', 'Time', 'Zeit') : tx('Sabır', 'Patience', 'Geduld')}: ${Math.ceil(shift.remainingMs / 1000)} ${tx('sn', 's', 's')}`;

let scene = null;
if (task && shift.role === 'barista') {
const recipe = recipeByKey(task.recipeKey);
const sizeObj = task.size ? SIZES.find((z) => z.key === task.size) : null;
scene = <IbCustomer name={task.customer} mood={customerSatisfaction(shift)} line={`“${sizeObj ? `${L(sizeObj)} ` : ''}${L(recipe)}${tx(' lütfen!', ', please!', ', bitte!')}”`} />;
} else if (task && shift.role === 'cashier') {
scene = (
<IbCustomer
name={task.customer}
line={task.wantsBag ? tx('“Merhaba! Bir de poşet alayım.”', '“Hi! A bag too, please.”', '„Hallo! Eine Tüte bitte.“') : tx('“Merhaba!”', '“Hello!”', '„Hallo!“')}
mood={customerSatisfaction(shift)}
sub={shift.work.declined
? tx('💳✗ Kart reddedildi → 💵 nakit ödüyor', '💳✗ Card declined → 💵 paying cash', '💳✗ Karte abgelehnt → 💵 zahlt bar')
: paymentMethod(task, shift.work) === 'cash' ? tx('💵 Nakit ödeyecek', '💵 Paying cash', '💵 Zahlt bar') : tx('💳 Kartla ödeyecek', '💳 Paying by card', '💳 Zahlt mit Karte')}
/>
);
} else if (task && shift.role === 'shelf') {
const aisle = aisleByKey(task.aisle);
scene = (
<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
<View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#F5B83D', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 28 }}>{aisle.icon}</Text>
</View>
<View style={{ marginLeft: 12, flex: 1 }}>
<Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }}>{tx(`${L(aisle)} reyonu`, `${L(aisle)} aisle`, `Gang: ${L(aisle)}`)}</Text>
<Text style={{ color: '#CFE3DC', fontSize: 12, marginTop: 2 }}>📅 {tx('Bugün', 'Today', 'Heute')}: {formatDateTR(shift.todayISO)}</Text>
</View>
</View>
);
}

const header = (
<View style={{ backgroundColor: c.dark, borderRadius: 24, padding: 16, marginBottom: 12, overflow: 'hidden' }}>
<Text style={{ position: 'absolute', right: -14, top: -16, fontSize: 110, opacity: 0.08 }}>{ROLES[shift.role].icon}</Text>
<View style={s.row}>
<View style={s.flex1}>
<Text style={{ color: '#F5B83D', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }}>
{U(L(ROLES[shift.role]))} · {U(L(lvInfo))}
{shiftMeta && shiftMeta.kind === 'practice' ? tx(' · ANTRENMAN', ' · PRACTICE', ' · TRAINING') : ''}
</Text>
<View style={{ flexDirection: 'row', marginTop: 6 }}>
{shift.orders.map((o, i) => (
<View key={o.id} style={{ width: 16, height: 6, borderRadius: 3, marginRight: 4, backgroundColor: i < shift.index ? '#F5B83D' : i === shift.index ? '#FFFFFF' : 'rgba(255,255,255,0.2)' }} />
))}
</View>
<Text style={{ color: '#CFE3DC', fontSize: 11, marginTop: 4 }}>{counterLabel} {Math.min(shift.index + 1, shift.orders.length)}/{shift.orders.length}</Text>
</View>
<IbScorePill score={shift.score} />
</View>
{scene}
{!!task && <IbTimeBar value={timeLeft} label={timeLabel} />}
</View>
);

const bannerView = !!banner && (
<IbPop trigger={ev}>
<View style={{ backgroundColor: banner.color, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
<Text style={{ fontSize: 18, marginRight: 8 }}>{banner.icon}</Text>
<Text style={{ flex: 1, color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{banner.text}</Text>
</View>
</IbPop>
);

const leaveLink = (
<TouchableOpacity onPress={leaveShift} style={{ alignSelf: 'center', marginTop: 16, padding: 8 }}>
<Text style={[s.link, { color: c.red }]}>{tx('Vardiyayı bırak', 'Leave shift', 'Schicht verlassen')}</Text>
</TouchableOpacity>
);

const bigBtn = (label, onPress, kind = 'primary', flex = 1) => (
<TouchableOpacity onPress={onPress} activeOpacity={0.8}
style={{ flex, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: kind === 'ghost' ? 8 : 0,
backgroundColor: kind === 'primary' ? '#1FA36F' : kind === 'gold' ? '#F5B83D' : 'transparent', borderWidth: kind === 'ghost' ? 1.5 : 0, borderColor: c.green }}>
<Text style={{ fontWeight: '900', fontSize: 16, color: kind === 'primary' ? '#FFFFFF' : kind === 'gold' ? '#0A3D33' : c.green }}>{label}</Text>
</TouchableOpacity>
);

/* --- BARISTA --- */
if (shift.role === 'barista') {
const showRecipe = isRecipeVisible(shift);
const recipe = task ? recipeByKey(task.recipeKey) : null;
const sized = levelInfo(shift.level).sizes;
return (
<Screen>
<IbShake trigger={shift.wrong}>
{header}
{bannerView}
{task && (showRecipe ? (
<View style={{ backgroundColor: '#FFF6DF', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#F3D58E' }}>
<Text style={{ fontSize: 11, fontWeight: '900', color: '#9A5B00', letterSpacing: 1 }}>📖 {tx('TARİF KARTI', 'RECIPE CARD', 'REZEPTKARTE')}</Text>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
{recipe.steps.map((k, i) => (
<View key={`${k}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, marginTop: 4 }}>
<View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' }}>
<Text style={{ fontWeight: '900', color: '#9A5B00', marginRight: 4 }}>{i + 1}</Text>
<Text style={{ fontSize: 13, color: '#0E2F28', fontWeight: '700' }}>{ingredientByKey(k).icon} {L(ingredientByKey(k))}</Text>
</View>
{i < recipe.steps.length - 1 && <Text style={{ color: '#C9A659', marginLeft: 6 }}>→</Text>}
</View>
))}
</View>
</View>
) : (
<TouchableOpacity style={{ backgroundColor: '#FFF6DF', borderRadius: 16, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F3D58E', borderStyle: 'dashed' }} onPress={() => act('peekRecipe')}>
<Text style={{ fontSize: 18, marginRight: 8 }}>📖</Text>
<Text style={{ flex: 1, fontWeight: '800', color: '#0E2F28' }}>{tx('Tarif kartına bak', 'Check the recipe card', 'Rezeptkarte ansehen')}</Text>
<Text style={{ color: '#9A5B00', fontWeight: '800' }}>−{ISBASI_POINTS.peek}</Text>
</TouchableOpacity>
))}

<View style={{ backgroundColor: '#3B2A20', borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center' }}>
<IbCup size={shift.cup.size || (sized ? 'M' : 'M')} items={shift.cup.items} placeholder={sized && !shift.cup.size ? tx('Önce\nboy seç', 'Pick a\nsize', 'Größe\nwählen') : null} />
<View style={{ flex: 1, marginLeft: 6 }}>
{sized && (
<View style={{ flexDirection: 'row', marginBottom: 10 }}>
{SIZES.map((z) => {
const on = shift.cup.size === z.key;
return (
<TouchableOpacity key={z.key} onPress={() => act('chooseCup', z.key)}
style={{ flex: 1, marginRight: 6, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: on ? '#F5B83D' : 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: on ? '#F5B83D' : 'rgba(255,255,255,0.2)' }}>
<Text style={{ fontWeight: '900', color: on ? '#0A3D33' : '#FFFFFF', fontSize: z.key === 'S' ? 12 : z.key === 'M' ? 14 : 16 }}>{z.key}</Text>
<Text style={{ fontSize: 10, color: on ? '#0A3D33' : '#E6D8C8' }}>{L(z)}</Text>
</TouchableOpacity>
);
})}
</View>
)}
<Text style={{ color: '#E6D8C8', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{tx('BARDAKTA', 'IN THE CUP', 'IM BECHER')}</Text>
{shift.cup.items.length === 0
? <Text style={{ color: '#FFFFFF', marginTop: 4, opacity: 0.7 }}>{tx('Henüz boş', 'Empty so far', 'Noch leer')}</Text>
: shift.cup.items.map((k, i) => (
<Text key={`${k}-${i}`} style={{ color: '#FFFFFF', marginTop: 3, fontSize: 13 }}>{i + 1}. {ingredientByKey(k).icon} {L(ingredientByKey(k))}</Text>
))}
</View>
</View>

<Text style={s.label}>{tx('TEZGÂH', 'COUNTER', 'THEKE')}</Text>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
{INGREDIENTS.map((ing) => (
<TouchableOpacity key={ing.key} activeOpacity={0.7} onPress={() => act('addIngredient', ing.key)}
style={{ width: '23.5%', backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingVertical: 10, alignItems: 'center', marginBottom: 8 }}>
<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: IB_LAYER[ing.key], borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 20 }}>{ing.icon}</Text>
</View>
<Text style={{ fontSize: 11, color: c.text, fontWeight: '700', textAlign: 'center', marginTop: 5 }} numberOfLines={2}>{L(ing)}</Text>
</TouchableOpacity>
))}
</View>

<View style={{ flexDirection: 'row', marginTop: 6 }}>
{bigBtn(`🗑️ ${tx('Dök', 'Discard', 'Weg')}`, () => act('discardCup'), 'ghost', 1)}
{bigBtn(`☕ ${tx('Servis Et', 'Serve', 'Servieren')}`, () => act('serve'), 'primary', 2)}
</View>
</IbShake>
{leaveLink}
</Screen>
);
}

/* --- CASHIER --- */
if (shift.role === 'cashier') {
const w = shift.work;
const counts = {};
for (const id of w.scanned) counts[id] = (counts[id] || 0) + 1;
const byId = task ? Object.fromEntries(task.items.map((x) => [x.id, x])) : {};
const weightText = (kg) => `${String(kg).replace('.', ',')} kg`;
const lcdLines = w.scanned.map((id) => {
const it = byId[id];
const p = it ? cashierProduct(it.product) : null;
const disc = w.discounted.includes(id);
return p
? { left: `${L(p)}${p.kg ? ` ${weightText(it.weightKg)}` : ''}${disc ? ` −%${it.discountPct}` : ''}`, right: formatMoney(disc ? discountedPrice(it, lvInfo.priceStep) : it.price) }
: { left: '?', right: '' };
});
if (w.bag) lcdLines.push({ left: tx('Poşet', 'Bag', 'Tüte'), right: formatMoney(BAG_PRICE) });
const roundBtn = (icon, label, onPress, on) => (
<TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ alignItems: 'center', marginRight: 14 }}>
<View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#F5B83D' : c.card, borderWidth: 2, borderColor: on ? '#F5B83D' : c.border }}>
<Text style={{ fontSize: 22 }}>{icon}</Text>
</View>
<Text style={{ fontSize: 11, fontWeight: '800', color: on ? c.text : c.sub, marginTop: 4 }}>{label}</Text>
</TouchableOpacity>
);
return (
<Screen>
<IbShake trigger={shift.wrong}>
{header}
{bannerView}
{task && w.phase === 'scan' && (
<>
<View style={{ backgroundColor: '#2A3036', borderRadius: 20, padding: 10, paddingTop: 0, overflow: 'hidden' }}>
<View style={{ flexDirection: 'row', marginBottom: 10 }}>
{Array.from({ length: 14 }).map((_, i) => <View key={i} style={{ flex: 1, height: 6, marginRight: 3, backgroundColor: '#3C444C' }} />)}
</View>
<Text style={{ color: '#9AA6B2', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>🛒 {tx('BANT — ürüne dokun, okut', 'BELT — tap an item to scan', 'BAND — Ware antippen')}</Text>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
{task.items.map((it) => {
const p = cashierProduct(it.product);
const n = counts[it.id] || 0;
const discNow = w.discounted.includes(it.id);
return (
<View key={it.id} style={{ width: '48.5%', marginBottom: 8 }}>
<TouchableOpacity activeOpacity={0.7} onPress={() => act('scanItem', it.id)}
style={{ backgroundColor: n > 0 ? '#E3F6EC' : '#FFFFFF', borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: n > 1 ? '#FF6B5E' : n > 0 ? '#3DDC97' : 'transparent' }}>
<Text style={{ fontSize: 28, marginRight: 8 }}>{p.icon}</Text>
<View style={{ flex: 1 }}>
<Text style={{ fontSize: 13, fontWeight: '800', color: '#0E2F28' }} numberOfLines={1}>{L(p)}</Text>
<Text style={{ fontSize: 11, color: p.kg ? '#9A5B00' : '#6E7F7A', marginTop: 2, fontWeight: p.kg ? '800' : '400' }}>
{p.kg ? `⚖️ ${weightText(it.weightKg)}` : '▮▯▮▮▯▮ barkod'}
</Text>
</View>
{n > 0 && <Text style={{ fontWeight: '900', color: n > 1 ? '#D9473D' : '#1FA36F', fontSize: 16 }}>{n > 1 ? `×${n}` : '✓'}</Text>}
{!!it.discountPct && (
<View style={{ position: 'absolute', top: -7, right: -5, backgroundColor: '#FFD43B', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, transform: [{ rotate: '8deg' }], borderWidth: 1, borderColor: '#E0A800' }}>
<Text style={{ fontSize: 10, fontWeight: '900', color: '#7A4B00' }}>%{it.discountPct} {tx('İNDİRİM', 'OFF', 'RABATT')}</Text>
</View>
)}
</TouchableOpacity>
{lvInfo.discounts > 0 && n > 0 && (
<TouchableOpacity onPress={() => act('applyDiscount', it.id)} activeOpacity={0.75}
style={{ marginTop: 4, borderRadius: 10, paddingVertical: 5, alignItems: 'center', backgroundColor: discNow ? '#3DDC97' : 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: discNow ? '#3DDC97' : 'rgba(255,255,255,0.3)' }}>
<Text style={{ fontSize: 11, fontWeight: '900', color: discNow ? '#0A3D33' : '#FFFFFF' }}>
{discNow ? `✓ %${it.discountPct} ${tx('uygulandı', 'applied', 'angewendet')}` : `% ${tx('İndirim uygula', 'Apply discount', 'Rabatt anwenden')}`}
</Text>
</TouchableOpacity>
)}
</View>
);
})}
</View>
</View>

<View style={{ flexDirection: 'row', marginTop: 12, marginBottom: 4 }}>
{lvInfo.produce && roundBtn('⚖️', w.scale ? tx('Tartı AÇIK', 'Scale ON', 'Waage AN') : tx('Tartı', 'Scale', 'Waage'), () => act('toggleScale'), w.scale)}
{lvInfo.bag && roundBtn('🛍️', w.bag ? tx('Poşet ✓', 'Bag ✓', 'Tüte ✓') : tx('Poşet', 'Bag', 'Tüte'), () => act('toggleBag'), w.bag)}
{roundBtn('↩️', tx('İptal', 'Void', 'Storno'), () => act('voidLast'), false)}
</View>

<View style={{ marginTop: 8 }}>
<IbLcd lines={lcdLines} total={formatMoney(registerTotal(shift))} label={tx('KASA', 'TILL', 'KASSE')} flash={w.scanned.length + (w.bag ? 100 : 0)} />
</View>
<View style={{ flexDirection: 'row', marginTop: 12 }}>
{bigBtn(`💳 ${tx('Ödeme Al', 'Take Payment', 'Bezahlen')}`, () => act('takePayment'), 'primary', 1)}
</View>
<Text style={s.note}>{tx('Fiyatlar oyun içi temsili fiyatlardır.', 'Prices are fictional in-game prices.', 'Preise sind fiktive Spielpreise.')}</Text>
</>
)}

{task && w.phase === 'change' && (
<>
<View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E7ECE8' }}>
<Text style={{ fontFamily: IB_MONO, fontSize: 11, color: '#6E7F7A', textAlign: 'center', letterSpacing: 1 }}>— — — {tx('FİŞ', 'RECEIPT', 'BELEG')} — — —</Text>
{[
[tx('Tutar', 'Amount', 'Betrag'), formatMoney(task.total)],
[tx('Müşterinin verdiği', 'Customer paid', 'Gegeben'), formatMoney(task.given)],
].map(([label, value]) => (
<View key={label} style={{ flexDirection: 'row', marginTop: 8 }}>
<Text style={{ flex: 1, fontFamily: IB_MONO, color: '#0E2F28', fontSize: 13 }}>{label}</Text>
<Text style={{ fontFamily: IB_MONO, color: '#0E2F28', fontSize: 14, fontWeight: '900' }}>{value}</Text>
</View>
))}
<View style={{ height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#C9D2CE', marginVertical: 10 }} />
<View style={{ flexDirection: 'row', alignItems: 'center' }}>
<Text style={{ flex: 1, fontFamily: IB_MONO, color: '#1FA36F', fontSize: 13, fontWeight: '900' }}>{tx('Verdiğin para üstü', 'Change you give', 'Dein Wechselgeld')}</Text>
<IbPop trigger={w.change.length}><Text style={{ fontFamily: IB_MONO, color: '#1FA36F', fontSize: 20, fontWeight: '900' }}>{formatMoney(changeSum(shift))}</Text></IbPop>
</View>
{w.change.length > 0 && (
<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
{w.change.map((d, i) => <View key={i} style={{ marginBottom: 4 }}><IbMoney kurus={d} small /></View>)}
</View>
)}
</View>

<View style={{ backgroundColor: '#4A3426', borderRadius: 20, padding: 12, marginTop: 12 }}>
<Text style={{ color: '#E6D2BE', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>🗄️ {tx('KASA ÇEKMECESİ', 'CASH DRAWER', 'KASSENLADE')}</Text>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
{DENOMINATIONS.filter((d) => d >= 500).map((d) => <IbMoney key={d} kurus={d} onPress={() => act('addChange', d)} />)}
</View>
<View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 2 }}>
{DENOMINATIONS.filter((d) => d < 500).map((d) => <IbMoney key={d} kurus={d} onPress={() => act('addChange', d)} />)}
</View>
</View>

<View style={{ flexDirection: 'row', marginTop: 12 }}>
{bigBtn(tx('Temizle', 'Clear', 'Leeren'), () => act('clearChange'), 'ghost', 1)}
{bigBtn(`💵 ${tx('Para Üstünü Ver', 'Give Change', 'Herausgeben')}`, () => act('giveChange'), 'primary', 2)}
</View>
</>
)}
</IbShake>
{leaveLink}
</Screen>
);
}

/* --- SALES ASSOCIATE --- */
const w = shift.work;
const labelsVisible = shelfLabelsVisible(shift);
const remainingItems = task ? task.trolley.filter((x) => !itemUsed(w, x.id)) : [];
const rowsOfSlots = [];
if (task) for (let i = 0; i < task.slots.length; i += 2) rowsOfSlots.push([i, i + 1].filter((k) => k < task.slots.length));
return (
<Screen>
<IbShake trigger={shift.wrong}>
{header}
{bannerView}
{task && (
<>
{lvInfo.memorize && w.revealMs > 0 && (
<View style={{ backgroundColor: '#F5B83D', borderRadius: 14, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
<Text style={{ fontSize: 20, marginRight: 8 }}>👀</Text>
<Text style={{ flex: 1, color: '#0A3D33', fontWeight: '900', fontSize: 13 }}>{tx('Raf planını ezberle!', 'Memorize the shelf plan!', 'Regalplan merken!')}</Text>
<Text style={{ color: '#0A3D33', fontWeight: '900', fontSize: 20 }}>{Math.ceil(w.revealMs / 1000)}</Text>
</View>
)}

<View style={{ backgroundColor: '#EFE5D3', borderRadius: 20, padding: 10, paddingBottom: 4, borderWidth: 3, borderColor: '#D8C7AA' }}>
<Text style={{ color: '#7A6448', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 }}>🗄️ {tx('RAF — ürünü seç, sonra yerine dokun', 'SHELF — pick an item, then tap its spot', 'REGAL — Ware wählen, dann Platz antippen')}</Text>
{rowsOfSlots.map((row, ri) => (
<View key={ri} style={{ marginBottom: 8 }}>
<View style={{ flexDirection: 'row' }}>
{row.map((i) => {
const slot = task.slots[i];
const p = shelfProduct(slot.product);
const placedList = w.placed[i];
const full = placedList.length >= slot.need;
const reported = w.reported.includes(i);
const known = labelsVisible || placedList.length > 0;
return (
<View key={`${slot.product}-${i}`} style={{ flex: 1, marginRight: row.length === 2 && i === row[0] ? 8 : 0 }}>
<TouchableOpacity activeOpacity={0.75} onPress={() => act('placeSelected', i)}
style={{ height: 82, borderRadius: 10, backgroundColor: full ? '#FFFFFF' : 'rgba(255,255,255,0.45)', borderWidth: full ? 0 : 2, borderStyle: 'dashed', borderColor: reported ? '#D9473D' : w.selected ? '#1FA36F' : '#C8B48F', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
<View style={{ flexDirection: 'row', height: 30, alignItems: 'center' }}>
{placedList.map((pid) => (
<IbPop key={pid} trigger={pid}><Text style={{ fontSize: 24, marginHorizontal: 1 }}>{p.icon}</Text></IbPop>
))}
{placedList.length === 0 && <Text style={{ fontSize: 20, opacity: 0.25 }}>{known ? p.icon : '📦'}</Text>}
</View>
<View style={{ backgroundColor: known ? '#FFE07A' : '#E3D5BB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, maxWidth: '96%', marginTop: 4, flexDirection: 'row' }}>
<Text style={{ fontSize: 11, fontWeight: '900', color: known ? '#5E4300' : '#8B7A5C' }} numberOfLines={1}>
🏷️ {i + 1}. {known ? L(p) : '???'}
</Text>
</View>
<Text style={{ fontSize: 11, fontWeight: '900', marginTop: 3, color: full ? '#1FA36F' : reported ? '#D9473D' : '#7A6448' }}>
{reported ? tx(`⚠️ eksik · ${placedList.length}/${slot.need}`, `⚠️ short · ${placedList.length}/${slot.need}`, `⚠️ fehlt · ${placedList.length}/${slot.need}`) : `${placedList.length}/${known ? slot.need : '?'}${full ? ' ✓' : ''}`}
</Text>
</TouchableOpacity>
{lvInfo.shortage && !full && !reported && (
<TouchableOpacity onPress={() => act('reportShortage', i)} activeOpacity={0.75} style={{ marginTop: 3, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2 }}>
<Text style={{ fontSize: 10, fontWeight: '900', color: '#B5452F' }}>⚠️ {tx('Eksik bildir', 'Report shortage', 'Fehlbestand melden')}</Text>
</TouchableOpacity>
)}
</View>
);
})}
</View>
<View style={{ height: 9, backgroundColor: '#A87445', borderRadius: 3, marginTop: 4, borderBottomWidth: 3, borderBottomColor: '#7E5531' }} />
</View>
))}
</View>
{lvInfo.memorize && !labelsVisible && (
<TouchableOpacity style={{ backgroundColor: '#FFF6DF', borderRadius: 14, padding: 10, marginTop: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F3D58E', borderStyle: 'dashed' }} onPress={() => act('peekPlanogram')}>
<Text style={{ fontSize: 18, marginRight: 8 }}>🗺️</Text>
<Text style={{ flex: 1, fontWeight: '800', color: '#0E2F28' }}>{tx('Raf planına bak', 'Check shelf plan', 'Regalplan ansehen')}</Text>
<Text style={{ color: '#9A5B00', fontWeight: '800' }}>−{MARKET_POINTS.peek}</Text>
</TouchableOpacity>
)}

{task.question && w.answered === null && (
<View style={{ backgroundColor: c.dark, borderRadius: 18, padding: 12, marginTop: 10 }}>
<View style={{ flexDirection: 'row', alignItems: 'center' }}>
<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3E7D3', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
<Text style={{ fontSize: 22 }}>{ibFace(task.question.customer)}</Text>
</View>
<View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderTopLeftRadius: 4, padding: 10 }}>
<Text style={{ color: '#0E2F28', fontWeight: '800', fontSize: 14 }}>
“{tx(`Pardon, ${L(shelfProduct(task.question.product)).toLocaleLowerCase('tr-TR')} hangi reyonda?`, `Excuse me, which aisle is the ${L(shelfProduct(task.question.product)).toLowerCase()} in?`, `Entschuldigung, wo finde ich ${L(shelfProduct(task.question.product))}?`)}”
</Text>
</View>
</View>
<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
{task.question.options.map((k) => (
<TouchableOpacity key={k} onPress={() => act('answerQuestion', k)} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
<Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{aisleByKey(k).icon} {L(aisleByKey(k))}</Text>
</TouchableOpacity>
))}
</View>
</View>
)}

<View style={{ backgroundColor: '#E4EAED', borderRadius: 20, padding: 10, marginTop: 12, borderWidth: 3, borderColor: '#B9C5CB' }}>
<Text style={{ color: '#4E5D66', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>🛒 {tx('ARABA — SKT\'yi kontrol et', 'TROLLEY — check expiry dates', 'WAGEN — MHD prüfen')}</Text>
{remainingItems.length === 0 ? (
<Text style={{ color: '#4E5D66', textAlign: 'center', paddingVertical: 10 }}>{tx('Araba boş 👍', 'Trolley is empty 👍', 'Wagen ist leer 👍')}</Text>
) : (
<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
{remainingItems.map((it) => {
const p = shelfProduct(it.product);
const sel = w.selected === it.id;
return (
<TouchableOpacity key={it.id} activeOpacity={0.75} onPress={() => act('selectItem', it.id)}
style={{ width: '48.5%', backgroundColor: sel ? '#FFF6DF' : '#FFFFFF', borderRadius: 12, padding: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: sel ? '#F5B83D' : 'transparent', transform: [{ scale: sel ? 1.03 : 1 }] }}>
<Text style={{ fontSize: 26, marginRight: 6 }}>{p.icon}</Text>
<View style={{ flex: 1 }}>
<Text style={{ fontSize: 12, fontWeight: '800', color: '#0E2F28' }} numberOfLines={1}>{L(p)}</Text>
<View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: '#9AA6AD', borderRadius: 4, paddingHorizontal: 4, marginTop: 3 }}>
<Text style={{ fontFamily: IB_MONO, fontSize: 10, color: '#37424C' }}>SKT {formatDateTR(it.skt)}</Text>
</View>
</View>
</TouchableOpacity>
);
})}
</View>
)}
<View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 2 }}>
<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#37424C' }} />
<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#37424C' }} />
</View>
</View>

<View style={{ flexDirection: 'row', marginTop: 12 }}>
<TouchableOpacity activeOpacity={0.8} onPress={() => act('discardSelected')}
style={{ flex: 1, marginRight: lvInfo.extras ? 8 : 0, height: 58, borderRadius: 16, backgroundColor: w.selected ? '#D9473D' : 'transparent', borderWidth: 2, borderColor: '#D9473D', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 18 }}>🗑️</Text>
<Text style={{ fontWeight: '900', fontSize: 12, color: w.selected ? '#FFFFFF' : '#D9473D' }}>{tx('İmha (SKT geçmiş)', 'Dispose (expired)', 'Entsorgen (abgelaufen)')}</Text>
</TouchableOpacity>
{lvInfo.extras > 0 && (
<TouchableOpacity activeOpacity={0.8} onPress={() => act('returnToStorage')}
style={{ flex: 1, height: 58, borderRadius: 16, backgroundColor: w.selected ? '#3F7FD6' : 'transparent', borderWidth: 2, borderColor: '#3F7FD6', alignItems: 'center', justifyContent: 'center' }}>
<Text style={{ fontSize: 18 }}>🏬</Text>
<Text style={{ fontWeight: '900', fontSize: 12, color: w.selected ? '#FFFFFF' : '#3F7FD6' }}>{tx('Depoya (fazla stok)', 'To storage (surplus)', 'Ins Lager (Überbestand)')}</Text>
</TouchableOpacity>
)}
</View>
<Text style={s.note}>{tx(`SKT ${formatDateTR(shift.todayISO)} (bugün) olan ürün hâlâ satılabilir; daha önceki tarihler geçmiştir.`, `Items dated ${formatDateTR(shift.todayISO)} (today) can still be sold; earlier dates are expired.`, `Ware mit MHD ${formatDateTR(shift.todayISO)} (heute) ist noch verkäuflich; frühere Daten sind abgelaufen.`)}</Text>
</>
)}
</IbShake>
{leaveLink}
</Screen>
);
};

export default IsBasiScreen;
