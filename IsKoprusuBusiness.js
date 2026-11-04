/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — İŞLETME PANELİ
  İşletme kaydı · vardiya ilanı · aday inceleme · QR giriş/çıkış · değerlendirme · iş teklifi

  Güvenlik notu: Bu ekranlarda gösterilen düğmeler yalnızca kolaylık içindir.
  Yetki ve kuralların TAMAMI sunucuda (bk_* fonksiyonları) tekrar kontrol edilir.
===========================================================
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  IK_ROLE_KEYS, APP_STATUS, SHIFT_STATUS, BIZ_STATUS, OFFER_TYPES, PAYMENT_METHODS, RATING_KEYS, L3,
  roleName, roleIcon, roleMaxLevel, levelTitle, badgeName, formatDay, formatDateTime, durationLabel, payLabel,
  errorText, fieldName, validateShiftForm, validateBusinessForm, EMPTY_SHIFT_FORM, EMPTY_BIZ_FORM,
  canTransition, parseCheckinPayload, istanbulDay, averageOf, qrWindow,
} from './isKoprusu.js';
import { useIk, BackLink, StatusPill, DemoTag, IkChip, Field, CheckBox, Btn, InfoRow, Loading, ErrorCard, EmptyBox, GateCard } from './ikUi.js';
import { useMe, NotInstalled, EventsView, RatingForm } from './ikCommon.js';

const fieldErrors = (errors, lang) => {
  const out = {};
  Object.keys(errors || {}).forEach((k) => { out[k] = errorText(`invalid:${k}`, lang); });
  return out;
};

/* ======================= PANEL ======================= */
export const BusinessPanel = ({ title, subtitle }) => {
  const { app, Screen, ScreenHeader } = useIk();
  const [me, reloadMe] = useMe();
  const [view, setView] = useState('home'); // home | register | shiftForm | shift | scan | review | offer | events
  const [bizId, setBizId] = useState(null);
  const [shift, setShift] = useState(null); // düzenlenen/görülen ilan
  const [target, setTarget] = useState(null); // değerlendirme/teklif için başvuru

  if (me.state === 'loading') return <Screen><ScreenHeader title={title} subtitle={subtitle} /><Loading /></Screen>;
  if (me.state === 'error') return <Screen><ScreenHeader title={title} subtitle={subtitle} /><NotInstalled code={me.code} onRetry={reloadMe} /></Screen>;

  const businesses = (me.data && me.data.businesses) || [];
  const current = businesses.find((b) => b.id === bizId) || businesses.find((b) => b.status === 'verified') || businesses[0] || null;

  if (view === 'register' || !current) {
    return <RegisterBusiness title={title} subtitle={subtitle} first={!current} onBack={current ? () => setView('home') : null} onDone={(id) => { setBizId(id); reloadMe(); setView('home'); }} />;
  }
  if (view === 'events') return <EventsView onBack={() => { reloadMe(); setView('home'); }} />;
  if (view === 'shiftForm') return <ShiftForm business={current} editing={shift} onBack={() => setView(shift ? 'shift' : 'home')} onDone={() => { setShift(null); setView('home'); }} />;
  if (view === 'shift' && shift) {
    return (
      <ShiftManage
        business={current}
        shiftId={shift.id}
        onBack={() => { setShift(null); setView('home'); }}
        onEdit={(sh) => { setShift(sh); setView('shiftForm'); }}
        onReview={(a, sh) => { setTarget({ ...a, shift: sh }); setView('review'); }}
        onOffer={(a, sh) => { setTarget({ ...a, shift: sh }); setView('offer'); }}
      />
    );
  }
  if (view === 'scan') return <ScanCheckin onBack={() => setView('home')} />;
  if (view === 'review' && target) {
    return <RatingForm side="business" application={target} title={app.tx('ADAYI DEĞERLENDİR', 'REVIEW CANDIDATE', 'KANDIDAT BEWERTEN')} onBack={() => setView('shift')} />;
  }
  if (view === 'offer' && target) return <OfferForm application={target} onBack={() => setView('shift')} />;
  return (
    <BizHome
      title={title}
      subtitle={subtitle}
      me={me.data}
      businesses={businesses}
      current={current}
      onSelect={setBizId}
      onGo={(v) => { if (v === 'shiftForm') setShift(null); setView(v); }}
      onOpenShift={(sh) => { setShift(sh); setView('shift'); }}
    />
  );
};

/* ---------- Ana panel ---------- */
const BizHome = ({ title, subtitle, me, businesses, current, onSelect, onGo, onOpenShift }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang } = app;
  const verified = current.status === 'verified';
  const [st, setSt] = useState({ state: 'loading', list: [], code: null });
  const load = useCallback(async () => {
    setSt((cur) => ({ ...cur, state: 'loading' }));
    const res = await api.businessShifts(current.id);
    setSt(res.ok ? { state: 'ready', list: res.data || [], code: null } : { state: 'error', list: [], code: res.code });
  }, [api, current.id]);
  useEffect(() => { load(); }, [load]);
  const unread = Number((me && me.unread) || 0);

  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} />
      {businesses.length > 1 && (
        <View style={s.chipRow}>
          {businesses.map((b) => <IkChip key={b.id} label={b.name} active={b.id === current.id} onPress={() => onSelect(b.id)} />)}
        </View>
      )}
      <View style={s.card}>
        <View style={s.row}>
          <Text style={{ fontSize: 26, marginRight: 10 }}>🏪</Text>
          <View style={s.flex1}>
            <Text style={[s.cardTitle, { fontSize: 17 }]}>{current.name}</Text>
            <StatusPill table={BIZ_STATUS} value={current.status} style={{ marginTop: 4 }} />
          </View>
        </View>
        {!!current.status_note && <Text style={s.note}>💬 {current.status_note}</Text>}
        {current.status === 'pending' && (
          <Text style={s.note}>
            {tx('İşletmen doğrulama bekliyor. BAKPLANLA ekibi kayıttaki iletişim bilgilerinden sana ulaşıp işletme belgelerini (ör. vergi levhası) kontrol edecek. Güvenliğin için belgeleri uygulamaya YÜKLEME; yalnızca ekip istediğinde güvenli kanaldan paylaş. Doğrulanmadan ilan açılamaz.', 'Your business is awaiting verification. The BAKPLANLA team will contact you to check documents. Do NOT upload documents into the app. You cannot post listings before verification.', 'Dein Betrieb wartet auf Prüfung. Keine Dokumente in die App hochladen.')}
          </Text>
        )}
      </View>

      {unread > 0 && (
        <TouchableOpacity onPress={() => onGo('events')} style={[s.card, s.row, { borderColor: c.gold, borderWidth: 1.5 }]}>
          <Text style={{ fontSize: 22, marginRight: 10 }}>🔔</Text>
          <Text style={[s.cardTitle, s.flex1]}>{tx(`${unread} yeni gelişme`, `${unread} new updates`, `${unread} neue Updates`)}</Text>
          <Ionicons name="chevron-forward" size={18} color={c.sub} />
        </TouchableOpacity>
      )}

      <Btn kind="gold" icon="➕" label={tx('Yeni Deneme Vardiyası Oluştur', 'Create Trial Shift', 'Probeschicht erstellen')} disabled={!verified} onPress={() => onGo('shiftForm')} />
      <Btn kind="dark" icon="📷" label={tx('Vardiya QR\'ı Okut (Giriş/Çıkış)', 'Scan Shift QR (In/Out)', 'Schicht-QR scannen')} disabled={!verified} onPress={() => onGo('scan')} />
      <View style={[s.row, { marginTop: 4 }]}>
        <TouchableOpacity onPress={() => onGo('events')} style={{ marginTop: 12, marginRight: 18 }}><Text style={s.link}>🔔 {tx('Bildirimler', 'Notifications', 'Mitteilungen')}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onGo('register')} style={{ marginTop: 12 }}><Text style={s.link}>➕ {tx('Başka işletme ekle', 'Add another business', 'Weiteren Betrieb')}</Text></TouchableOpacity>
      </View>

      <Text style={s.label}>{tx('İLANLARIM', 'MY LISTINGS', 'MEINE ANZEIGEN')}</Text>
      {st.state === 'loading' && <Loading />}
      {st.state === 'error' && <ErrorCard text={errorText(st.code, lang)} onRetry={load} />}
      {st.state === 'ready' && st.list.length === 0 && <EmptyBox icon="📋" title={tx('Henüz ilanın yok', 'No listings yet', 'Noch keine Anzeigen')} text={verified ? tx('İlk deneme vardiyanı oluştur. Her ilan yayına girmeden önce BAKPLANLA tarafından incelenir.', 'Create your first trial shift. Each listing is reviewed before publishing.', 'Jede Anzeige wird vor Veröffentlichung geprüft.') : ''} />}
      {st.list.map((sh) => {
        const counts = sh.counts || {};
        const waiting = (counts.received || 0) + (counts.reviewing || 0);
        return (
          <TouchableOpacity key={sh.id} style={s.card} onPress={() => onOpenShift(sh)}>
            <View style={s.row}>
              {sh.is_demo && <DemoTag />}
              <Text style={{ fontSize: 18, marginRight: 6 }}>{roleIcon(sh.role)}</Text>
              <Text style={[s.cardTitle, s.flex1]} numberOfLines={2}>{sh.title}</Text>
              <Ionicons name="chevron-forward" size={18} color={c.sub} />
            </View>
            <Text style={s.cardMeta}>📅 {formatDay(sh.shift_date, lang)} · {sh.start_time}–{sh.end_time} · 🪑 {sh.seats_taken}/{sh.capacity}</Text>
            <View style={[s.row, { marginTop: 6 }]}>
              <StatusPill table={SHIFT_STATUS} value={sh.status} />
              {waiting > 0 && <Text style={[s.cardMeta, { marginLeft: 8, marginTop: 0, color: c.orange, fontWeight: '900' }]}>{tx(`${waiting} başvuru bekliyor`, `${waiting} waiting`, `${waiting} warten`)}</Text>}
            </View>
            {!!sh.review_note && sh.status === 'rejected' && <Text style={s.note}>💬 {sh.review_note}</Text>}
          </TouchableOpacity>
        );
      })}
    </Screen>
  );
};

/* ---------- İşletme kaydı ---------- */
const RegisterBusiness = ({ title, subtitle, first, onBack, onDone }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [f, setF] = useState(EMPTY_BIZ_FORM());
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }));
  const save = async () => {
    if (busy) return;
    setErr(null);
    const v = validateBusinessForm(f);
    setErrors(fieldErrors(v.errors, lang));
    if (!v.ok) { setErr(tx('Lütfen işaretli alanları düzelt.', 'Please fix the marked fields.', 'Bitte markierte Felder korrigieren.')); return; }
    setBusy(true);
    const res = await api.registerBusiness(v.payload);
    setBusy(false);
    if (!res.ok) { setErr(errorText(res.code, lang)); return; }
    showToast(tx('İşletme kaydın alındı. Doğrulama bekleniyor.', 'Business registered. Awaiting verification.', 'Registriert. Prüfung ausstehend.'));
    onDone(res.data.id);
  };
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} />
      {!!onBack && <BackLink onPress={onBack} />}
      {first && (
        <View style={{ backgroundColor: c.dark, borderRadius: 20, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: c.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{tx('İŞLETMELER İÇİN', 'FOR BUSINESSES', 'FÜR BETRIEBE')}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 4 }}>
            {tx('Mesleği oyunda deneyip rozet kazanmış gençlere ücretli deneme vardiyası açın.', 'Offer paid trial shifts to young people who earned a job badge in the game.', 'Bieten Sie bezahlte Probeschichten an.')}
          </Text>
          <Text style={{ color: '#CFE3DC', fontSize: 12, marginTop: 6 }}>
            {tx('Kayıt → BAKPLANLA doğrulaması → ilan → ilan incelemesi → başvurular → QR ile vardiya → değerlendirme → iş teklifi', 'Register → verification → listing → review → applications → QR shift → rating → job offer', 'Registrierung → Prüfung → Anzeige → Bewerbungen → QR → Bewertung → Angebot')}
          </Text>
        </View>
      )}
      <View style={s.card}>
        <Text style={s.cardTitle}>🏪 {tx('İşletme kaydı', 'Business registration', 'Betriebsregistrierung')}</Text>
        <Field label={tx('İŞLETME ADI', 'BUSINESS NAME', 'BETRIEBSNAME')} value={f.name} onChangeText={set('name')} error={errors.name} maxLength={80} />
        <Field label={tx('FAALİYET ALANI (ör. Kafe, Market)', 'SECTOR', 'BRANCHE')} value={f.sector} onChangeText={set('sector')} error={errors.sector} maxLength={60} />
        <Field label={tx('YETKİLİ KİŞİ', 'CONTACT PERSON', 'ANSPRECHPARTNER')} value={f.contact_person} onChangeText={set('contact_person')} error={errors.contact_person} maxLength={60} />
        <Field label={tx('TELEFON', 'PHONE', 'TELEFON')} value={f.contact_phone} onChangeText={set('contact_phone')} error={errors.contact_phone} keyboardType="phone-pad" maxLength={20} />
        <Field label={tx('E-POSTA', 'EMAIL', 'E-MAIL')} value={f.contact_email} onChangeText={set('contact_email')} error={errors.contact_email} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
        <Field label={tx('ADRES', 'ADDRESS', 'ADRESSE')} value={f.address} onChangeText={set('address')} error={errors.address} maxLength={200} />
        <Field label={tx('İLÇE', 'DISTRICT', 'BEZIRK')} value={f.district} onChangeText={set('district')} error={errors.district} maxLength={60} />
        <Field label={tx('ŞEHİR', 'CITY', 'STADT')} value={f.city} onChangeText={set('city')} error={errors.city} maxLength={60} />
        <Field label={tx('VERGİ NO (isteğe bağlı, 10-11 hane)', 'TAX NO (optional)', 'STEUERNR. (optional)')} value={f.tax_number} onChangeText={set('tax_number')} error={errors.tax_number} keyboardType="number-pad" maxLength={11} />
        <Text style={s.note}>
          {tx('Bu bilgiler gençlere GÖSTERİLMEZ (ilanda yalnızca işletme adı, faaliyet alanı ve ilan adresi görünür). Yalnızca doğrulama ve iletişim için kullanılır.', 'These details are NOT shown to candidates (only name, sector and listing address). Used only for verification and contact.', 'Diese Daten sehen Kandidaten NICHT.')}
        </Text>
        {!!err && <Text style={{ color: c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}
        <Btn kind="gold" label={tx('Kaydı Gönder', 'Submit', 'Absenden')} busy={busy} onPress={save} />
      </View>
    </Screen>
  );
};

/* ---------- İlan oluştur / düzenle ---------- */
const formFromShift = (sh) => ({
  title: sh.title, role: sh.role, description: sh.description, shift_date: sh.shift_date, start_time: sh.start_time,
  end_time: sh.end_time, capacity: String(sh.capacity), pay_amount: String(sh.pay_amount), pay_type: sh.pay_type,
  payment_method: sh.payment_method, payment_timing: sh.payment_timing, min_level: String(sh.min_level), address: sh.address,
  district: sh.district, city: sh.city, safety_info: sh.safety_info, cancel_policy: sh.cancel_policy, legal_declared: false,
});

const ShiftForm = ({ business, editing, onBack, onDone }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [f, setF] = useState(editing ? formFromShift(editing) : { ...EMPTY_SHIFT_FORM(), address: '', district: '' });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }));
  const maxLevel = roleMaxLevel(f.role);

  const save = async () => {
    if (busy) return;
    setErr(null);
    const v = validateShiftForm(f);
    const fe = fieldErrors(v.errors, lang);
    if (v.errors.start_time === 'too_soon') fe.start_time = tx('Vardiya en az 2 saat sonra başlamalı.', 'Must start at least 2 hours from now.', 'Mind. 2 Std. in der Zukunft.');
    if (v.errors.legal_declared) fe.legal_declared = errorText('legal_declaration_required', lang);
    setErrors(fe);
    if (!v.ok) { setErr(tx('Lütfen işaretli alanları düzelt.', 'Please fix the marked fields.', 'Bitte markierte Felder korrigieren.')); return; }
    setBusy(true);
    const res = editing ? await api.updateShift(editing.id, v.payload) : await api.createShift(business.id, v.payload);
    setBusy(false);
    if (!res.ok) { setErr(errorText(res.code, lang)); return; }
    showToast(tx('İlan incelemeye gönderildi. Yayına alınınca bildirim göreceksin.', 'Sent for review.', 'Zur Prüfung gesendet.'));
    onDone();
  };

  return (
    <Screen>
      <ScreenHeader title={editing ? tx('İLANI DÜZENLE', 'EDIT LISTING', 'ANZEIGE BEARBEITEN') : tx('YENİ DENEME VARDİYASI', 'NEW TRIAL SHIFT', 'NEUE PROBESCHICHT')} subtitle={business.name} />
      <BackLink onPress={onBack} />
      <View style={s.card}>
        <Text style={s.label}>{tx('POZİSYON / GEREKEN SİMÜLASYON', 'POSITION / REQUIRED SIMULATION', 'POSITION / SIMULATION')}</Text>
        <View style={s.chipRow}>
          {IK_ROLE_KEYS.map((r) => <IkChip key={r} label={`${roleIcon(r)} ${roleName(r, lang)}`} active={f.role === r} onPress={() => setF((cur) => ({ ...cur, role: r, min_level: String(Math.min(Number(cur.min_level) || 1, roleMaxLevel(r))) }))} />)}
        </View>
        <Text style={s.label}>{tx('EN AZ SİMÜLASYON SEVİYESİ', 'MINIMUM SIMULATION LEVEL', 'MINDESTSTUFE')}</Text>
        <View style={s.chipRow}>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => (
            <IkChip key={n} label={`${n} · ${levelTitle(f.role, n, lang)}`} active={Number(f.min_level) === n} onPress={() => set('min_level')(String(n))} />
          ))}
        </View>
        <Field label={tx('İLAN BAŞLIĞI', 'TITLE', 'TITEL')} value={f.title} onChangeText={set('title')} error={errors.title} maxLength={80} placeholder={tx('ör. Hafta sonu kasiyer deneme günü', 'e.g. Weekend cashier trial day', 'z. B. Kassen-Probetag')} />
        <Field label={tx('GÖREV AÇIKLAMASI', 'TASK DESCRIPTION', 'AUFGABEN')} value={f.description} onChangeText={set('description')} error={errors.description} multiline maxLength={1000} />

        <Text style={s.label}>{tx('TARİH (YYYY-AA-GG)', 'DATE (YYYY-MM-DD)', 'DATUM (JJJJ-MM-TT)')}</Text>
        <View style={s.chipRow}>
          {[1, 2, 3, 7].map((d) => {
            const day = istanbulDay(Date.now(), d);
            return <IkChip key={d} label={formatDay(day, lang)} active={f.shift_date === day} onPress={() => set('shift_date')(day)} />;
          })}
        </View>
        <TextInput style={[s.input, !!errors.shift_date && { borderColor: c.red }]} value={f.shift_date} onChangeText={set('shift_date')} placeholder="2026-11-05" placeholderTextColor={c.muted} maxLength={10} />
        {!!errors.shift_date && <Text style={{ color: c.red, fontSize: 12, marginTop: 4, fontWeight: '700' }}>{errors.shift_date}</Text>}
        <View style={s.row}>
          <View style={[s.flex1, { marginRight: 8 }]}><Field label={tx('BAŞLANGIÇ (SS:DD)', 'START (HH:MM)', 'BEGINN')} value={f.start_time} onChangeText={set('start_time')} error={errors.start_time} maxLength={5} /></View>
          <View style={s.flex1}><Field label={tx('BİTİŞ (SS:DD)', 'END (HH:MM)', 'ENDE')} value={f.end_time} onChangeText={set('end_time')} error={errors.end_time} maxLength={5} /></View>
        </View>
        <Field label={tx('KONTENJAN (kişi)', 'CAPACITY', 'PLÄTZE')} value={f.capacity} onChangeText={set('capacity')} error={errors.capacity} keyboardType="number-pad" maxLength={2} />

        <Text style={s.label}>{tx('ÜCRET TÜRÜ', 'PAY TYPE', 'LOHNART')}</Text>
        <View style={s.chipRow}>
          <IkChip label={tx('Toplam (vardiya başı)', 'Total (per shift)', 'Gesamt')} active={f.pay_type === 'total'} onPress={() => set('pay_type')('total')} />
          <IkChip label={tx('Saatlik', 'Hourly', 'Stündlich')} active={f.pay_type === 'hourly'} onPress={() => set('pay_type')('hourly')} />
        </View>
        <Field label={tx('ÜCRET (₺)', 'PAY (₺)', 'LOHN (₺)')} value={f.pay_amount} onChangeText={set('pay_amount')} error={errors.pay_amount} keyboardType="decimal-pad" maxLength={9} hint={tx('Yürürlükteki asgari ücretin altında olmamalıdır.', 'Must not be below the legal minimum wage.', 'Nicht unter dem Mindestlohn.')} />
        <Text style={s.label}>{tx('ÖDEME YÖNTEMİ', 'PAYMENT METHOD', 'ZAHLUNGSART')}</Text>
        <View style={s.chipRow}>
          {PAYMENT_METHODS.map((p) => <IkChip key={p.key} label={L3(lang, p)} active={f.payment_method === p.key} onPress={() => set('payment_method')(p.key)} />)}
        </View>
        <Field label={tx('ÖDEME ZAMANI', 'PAYMENT TIMING', 'ZAHLUNGSZEITPUNKT')} value={f.payment_timing} onChangeText={set('payment_timing')} error={errors.payment_timing} maxLength={120} placeholder={tx('ör. Vardiya bitiminde / 3 iş günü içinde', 'e.g. within 3 business days', 'z. B. innerhalb 3 Werktagen')} />

        <Field label={tx('İŞ YERİ ADRESİ', 'WORKPLACE ADDRESS', 'ARBEITSORT')} value={f.address} onChangeText={set('address')} error={errors.address} maxLength={200} />
        <View style={s.row}>
          <View style={[s.flex1, { marginRight: 8 }]}><Field label={tx('İLÇE', 'DISTRICT', 'BEZIRK')} value={f.district} onChangeText={set('district')} error={errors.district} maxLength={60} /></View>
          <View style={s.flex1}><Field label={tx('ŞEHİR', 'CITY', 'STADT')} value={f.city} onChangeText={set('city')} error={errors.city} maxLength={60} /></View>
        </View>
        <Field label={tx('İŞ SAĞLIĞI VE GÜVENLİĞİ', 'HEALTH AND SAFETY', 'ARBEITSSCHUTZ')} value={f.safety_info} onChangeText={set('safety_info')} error={errors.safety_info} multiline maxLength={1000} placeholder={tx('ör. Kaymaz ayakkabı zorunlu, ilk yardım dolabının yeri, eğitim verilecek konular', 'e.g. non-slip shoes, first aid location', 'z. B. rutschfeste Schuhe')} />
        <Field label={tx('İPTAL KOŞULLARI', 'CANCELLATION POLICY', 'STORNOBEDINGUNGEN')} value={f.cancel_policy} onChangeText={set('cancel_policy')} error={errors.cancel_policy} multiline maxLength={500} />
        <Text style={s.note}>
          {tx('Yaş sınırı: 18+ (ilk sürümde sabit). Başvuru son tarihi: vardiyadan 2 saat önce.', 'Age: 18+ (fixed in this version). Apply deadline: 2 hours before the shift.', 'Alter: 18+. Bewerbungsfrist: 2 Std. vorher.')}
        </Text>

        <CheckBox checked={f.legal_declared} onPress={() => set('legal_declared')(!f.legal_declared)}>
          <Text style={[s.cardTitle, { fontSize: 14 }]}>{tx('Yasal yükümlülük beyanı', 'Legal declaration', 'Rechtliche Erklärung')}</Text>
          <Text style={s.note}>
            {tx('Bu ücretli vardiyanın bir çalışma ilişkisi doğurabileceğini; işe başlatmadan önce gerekli sigorta (ör. SGK işe giriş bildirimi), iş sağlığı ve güvenliği, ücret ve vergi yükümlülüklerini İŞLETME OLARAK benim yerine getireceğimi beyan ederim. BAKPLANLA işveren veya aracı kurum değildir.', 'I declare that this paid shift may create an employment relationship and that WE, the business, will fulfil insurance, safety, pay and tax obligations before the person starts. BAKPLANLA is not the employer.', 'Wir erfüllen alle gesetzlichen Pflichten. BAKPLANLA ist nicht Arbeitgeber.')}
          </Text>
          {!!errors.legal_declared && <Text style={{ color: c.red, fontSize: 12, marginTop: 4, fontWeight: '700' }}>{errors.legal_declared}</Text>}
        </CheckBox>

        <Text style={s.note}>{tx('İlan önce BAKPLANLA tarafından incelenir, sonra yayına alınır. Yayındaki ilan düzenlenemez; gerekirse iptal edilip yeniden oluşturulur.', 'Each listing is reviewed before publishing. Published listings cannot be edited.', 'Anzeigen werden vor Veröffentlichung geprüft.')}</Text>
        {!!err && <Text style={{ color: c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}
        <Btn kind="gold" label={editing ? tx('Güncelle ve İncelemeye Gönder', 'Update and Send for Review', 'Aktualisieren') : tx('İncelemeye Gönder', 'Send for Review', 'Zur Prüfung senden')} busy={busy} onPress={save} />
      </View>
    </Screen>
  );
};

/* ---------- İlan yönetimi + adaylar ---------- */
const NoteModal = ({ visible, title, placeholder, onCancel, onSubmit, minLen = 0 }) => {
  const { app } = useIk();
  const { s, c, tx } = app;
  const [text, setText] = useState('');
  useEffect(() => { if (visible) setText(''); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
        <View style={[s.card, { marginBottom: 0 }]}>
          <Text style={s.cardTitle}>{title}</Text>
          <TextInput style={[s.input, s.inputMulti, { marginTop: 10 }]} value={text} onChangeText={setText} multiline maxLength={300} placeholder={placeholder} placeholderTextColor={c.muted} />
          {minLen > 0 && <Text style={s.note}>{tx(`En az ${minLen} karakter.`, `At least ${minLen} characters.`, `Mind. ${minLen} Zeichen.`)}</Text>}
          <Btn label={tx('Onayla', 'Confirm', 'Bestätigen')} disabled={text.trim().length < minLen} onPress={() => onSubmit(text.trim())} />
          <TouchableOpacity onPress={onCancel} style={{ marginTop: 12, alignSelf: 'center' }}><Text style={s.link}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const ShiftManage = ({ business, shiftId, onBack, onEdit, onReview, onOffer }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [sh, setSh] = useState(null);
  const [st, setSt] = useState({ state: 'loading', list: [], code: null });
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null); // { kind, app }

  const load = useCallback(async () => {
    const [shifts, apps] = await Promise.all([api.businessShifts(business.id), api.applicants(shiftId)]);
    if (shifts.ok) setSh((shifts.data || []).find((x) => x.id === shiftId) || null);
    setSt(apps.ok ? { state: 'ready', list: apps.data || [], code: null } : { state: 'error', list: [], code: apps.code });
  }, [api, business.id, shiftId]);
  useEffect(() => { load(); }, [load]);

  const run = async (id, fn, okText) => {
    if (busyId) return;
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if (!res.ok) { Alert.alert('BAKPLANLA', errorText(res.code, lang)); load(); return; }
    if (okText) showToast(okText);
    load();
  };
  const decide = (a, status, note) => run(a.id, () => api.decide(a.id, status, note), L3(lang, APP_STATUS[status] || { tr: 'Tamam', en: 'Done', de: 'Erledigt' }));
  const confirmLegal = (a) => Alert.alert(
    tx('Yasal işlemler', 'Legal registration', 'Gesetzliche Anmeldung'),
    tx(`${a.display_name} için işe başlatmadan önce gereken yasal işlemleri (ör. SGK işe giriş bildirimi) yaptığınızı onaylıyor musunuz? Bu beyan kayıt altına alınır.`, 'Do you confirm the legal registration (e.g. social insurance) was done? This is logged.', 'Bestätigen Sie die Anmeldung? Wird protokolliert.'),
    [{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' }, { text: tx('Onaylıyorum', 'I confirm', 'Bestätigen'), onPress: () => run(a.id, () => api.confirmLegal(a.id), tx('Onay kaydedildi.', 'Confirmed.', 'Bestätigt.')) }],
  );
  const onModalSubmit = (text) => {
    const m = modal; setModal(null);
    if (!m) return;
    if (m.kind === 'reject') decide(m.app, 'rejected', text);
    if (m.kind === 'cancelApp') decide(m.app, 'cancelled_by_business', text);
    if (m.kind === 'manualIn') run(m.app.id, () => api.manualAttendance(m.app.id, 'check_in', text), tx('Giriş kaydedildi.', 'Checked in.', 'Eingecheckt.'));
    if (m.kind === 'manualOut') run(m.app.id, () => api.manualAttendance(m.app.id, 'check_out', text), tx('Çıkış kaydedildi.', 'Checked out.', 'Ausgecheckt.'));
    if (m.kind === 'cancelShift') run('shift', () => api.cancelShift(shiftId, text), tx('İlan iptal edildi; adaylar bilgilendirildi.', 'Listing cancelled.', 'Storniert.'));
  };

  return (
    <Screen>
      <ScreenHeader title={tx('İLAN VE ADAYLAR', 'LISTING & CANDIDATES', 'ANZEIGE & KANDIDATEN')} subtitle={business.name} />
      <BackLink onPress={onBack} />
      {!sh && st.state === 'loading' && <Loading />}
      {!!sh && (
        <View style={s.card}>
          <View style={s.row}>
            {sh.is_demo && <DemoTag />}
            <Text style={{ fontSize: 22, marginRight: 6 }}>{roleIcon(sh.role)}</Text>
            <Text style={[s.cardTitle, s.flex1, { fontSize: 16 }]}>{sh.title}</Text>
          </View>
          <StatusPill table={SHIFT_STATUS} value={sh.status} style={{ marginTop: 6 }} />
          {!!sh.review_note && <Text style={s.note}>💬 {sh.review_note}</Text>}
          {!!sh.cancel_reason && <Text style={s.note}>✖ {sh.cancel_reason}</Text>}
          <InfoRow icon="calendar-outline" label={tx('TARİH', 'DATE', 'DATUM')} value={`${formatDay(sh.shift_date, lang)} · ${sh.start_time}–${sh.end_time} (${durationLabel(sh.duration_minutes, lang)})`} />
          <InfoRow icon="ribbon-outline" label={tx('GEREKEN ROZET', 'REQUIRED BADGE', 'ABZEICHEN')} value={badgeName(sh.role, sh.min_level, lang)} />
          <InfoRow icon="cash-outline" label={tx('ÜCRET', 'PAY', 'LOHN')} value={payLabel(sh, lang)} />
          <InfoRow icon="people-outline" label={tx('KONTENJAN', 'CAPACITY', 'PLÄTZE')} value={`${sh.seats_taken}/${sh.capacity}`} />
          {['pending_review', 'rejected'].includes(sh.status) && <Btn kind="secondary" label={tx('İlanı Düzenle', 'Edit Listing', 'Bearbeiten')} onPress={() => onEdit(sh)} />}
          {!['cancelled', 'completed'].includes(sh.status) && <Btn kind="danger" label={tx('İlanı İptal Et', 'Cancel Listing', 'Anzeige stornieren')} busy={busyId === 'shift'} onPress={() => setModal({ kind: 'cancelShift' })} />}
        </View>
      )}

      <Text style={s.label}>{tx('BAŞVURANLAR', 'APPLICANTS', 'BEWERBER')}</Text>
      <Text style={[s.note, { marginTop: 0, marginBottom: 8 }]}>
        {tx('Yalnızca adayın paylaşmayı kabul ettiği bilgiler görünür. Telefon numarası yalnızca onayladığınız adaylarda görünür. Adayları cinsiyet, yaş, köken gibi korunan özelliklere göre ayırt etmeyin.', 'You only see what candidates agreed to share. Phone numbers appear only after approval. Do not discriminate on protected characteristics.', 'Nur geteilte Daten. Keine Diskriminierung.')}
      </Text>
      {st.state === 'error' && <ErrorCard text={errorText(st.code, lang)} onRetry={load} />}
      {st.state === 'ready' && st.list.length === 0 && <EmptyBox icon="🙋" title={tx('Henüz başvuru yok', 'No applicants yet', 'Noch keine Bewerber')} />}
      {st.list.map((a) => {
        const busy = busyId === a.id;
        const win = sh ? qrWindow(sh) : 'unknown';
        const started = sh ? Date.now() >= Date.parse(`${sh.shift_date}T${sh.start_time}:00+03:00`) : false;
        return (
          <View key={a.id} style={s.card}>
            <View style={s.row}>
              <View style={[s.menuIcon, { width: 40, height: 40 }]}><Text style={{ fontSize: 18 }}>🙂</Text></View>
              <View style={s.flex1}>
                <Text style={s.cardTitle}>{a.display_name}</Text>
                <Text style={s.cardMeta}>{tx('Başvuru', 'Applied', 'Beworben')}: {formatDateTime(a.created_at, lang)}</Text>
              </View>
              <StatusPill table={APP_STATUS} value={a.status} />
            </View>
            <Text style={[s.cardMeta, { color: c.green, fontWeight: '800', marginTop: 8 }]}>
              🏅 {sh ? badgeName(sh.role, a.badge_now, lang) : ''} {a.badge_at_apply && a.badge_at_apply.level !== a.badge_now ? tx(`(başvuruda: Sv.${a.badge_at_apply.level})`, `(at apply: Lv.${a.badge_at_apply.level})`, '') : ''}
            </Text>
            <Text style={s.cardMeta}>{a.adult_confirmed ? tx('✓ 18+ beyanı var', '✓ 18+ declared', '✓ 18+ erklärt') : ''}</Text>
            {!!a.message && <Text style={[s.note, { color: c.text }]}>💬 “{a.message}”</Text>}
            {a.history ? (
              <View style={[s.softCard, { marginTop: 8 }]}>
                <Text style={s.cardMeta}>{tx(`Tamamlanan vardiya: ${a.history.completed} · Gelmedi: ${a.history.no_show}`, `Completed: ${a.history.completed} · No-show: ${a.history.no_show}`, `Abgeschlossen: ${a.history.completed}`)}</Text>
                {!!a.history.avg_ratings && <Text style={s.cardMeta}>⭐ {tx('Önceki işletmelerin ortalaması', 'Average from past businesses', 'Durchschnitt')}: {averageOf(a.history.avg_ratings)}/5</Text>}
              </View>
            ) : <Text style={s.note}>{tx('Aday geçmiş deneyimlerini paylaşmadı.', 'The candidate did not share past experience.', 'Keine Erfahrung geteilt.')}</Text>}
            {!!a.contact_phone && <Text style={[s.cardMeta, { fontWeight: '800' }]}>📞 {a.contact_phone}</Text>}
            {!!a.decision_note && <Text style={s.note}>📝 {a.decision_note}</Text>}

            {a.status === 'approved' && (
              <View style={[s.softCard, { marginTop: 8 }]}>
                <Text style={s.cardTitle}>{a.legal_confirmed ? tx('✅ Yasal işlemler onaylandı', '✅ Legal registration confirmed', '✅ Anmeldung bestätigt') : tx('⏳ Yasal işlemler bekleniyor', '⏳ Legal registration pending', '⏳ Anmeldung ausstehend')}</Text>
                {!a.legal_confirmed && <Text style={s.note}>{tx('Bu kişiyi işe başlatmadan önce gerekli yasal işlemleri (ör. SGK işe giriş bildirimi) yapın ve burada onaylayın. Onay olmadan QR girişi yapılamaz.', 'Complete legal registration before the shift and confirm here. QR check-in is blocked until then.', 'Vor der Schicht anmelden und hier bestätigen.')}</Text>}
                {!!a.check_in_at && <Text style={s.cardMeta}>🟢 {tx('Giriş', 'In', 'Ein')}: {formatDateTime(a.check_in_at, lang)}</Text>}
              </View>
            )}
            {!!a.check_out_at && <Text style={s.cardMeta}>🔴 {tx('Çıkış', 'Out', 'Aus')}: {formatDateTime(a.check_out_at, lang)}</Text>}

            <View style={[s.row, { flexWrap: 'wrap', marginTop: 4 }]}>
              {canTransition(a.status, 'reviewing', 'business') && <SmallAction label={tx('İncele', 'Review', 'Prüfen')} busy={busy} onPress={() => decide(a, 'reviewing')} />}
              {canTransition(a.status, 'approved', 'business') && <SmallAction kind="gold" label={tx('Onayla', 'Approve', 'Bestätigen')} busy={busy} onPress={() => decide(a, 'approved')} />}
              {canTransition(a.status, 'rejected', 'business') && <SmallAction kind="danger" label={tx('Reddet', 'Reject', 'Ablehnen')} busy={busy} onPress={() => setModal({ kind: 'reject', app: a })} />}
              {a.status === 'approved' && !a.legal_confirmed && <SmallAction kind="gold" label={tx('Yasal işlemleri onayla', 'Confirm registration', 'Anmeldung bestätigen')} busy={busy} onPress={() => confirmLegal(a)} />}
              {a.status === 'approved' && a.legal_confirmed && !a.check_in_at && win === 'open' && <SmallAction label={tx('Elle giriş', 'Manual check-in', 'Manuell ein')} busy={busy} onPress={() => setModal({ kind: 'manualIn', app: a })} />}
              {a.status === 'approved' && !!a.check_in_at && !a.check_out_at && win === 'open' && <SmallAction label={tx('Elle çıkış', 'Manual check-out', 'Manuell aus')} busy={busy} onPress={() => setModal({ kind: 'manualOut', app: a })} />}
              {a.status === 'approved' && !a.check_in_at && started && <SmallAction kind="danger" label={tx('Gelmedi', 'No-show', 'Nicht erschienen')} busy={busy} onPress={() => decide(a, 'no_show')} />}
              {a.status === 'approved' && !a.check_in_at && !started && <SmallAction kind="danger" label={tx('Yerini iptal et', 'Cancel place', 'Platz stornieren')} busy={busy} onPress={() => setModal({ kind: 'cancelApp', app: a })} />}
              {a.status === 'completed' && !a.my_review_done && <SmallAction kind="gold" label={tx('⭐ Değerlendir', '⭐ Review', '⭐ Bewerten')} onPress={() => onReview(a, sh)} />}
              {a.status === 'completed' && !a.offer_status && <SmallAction kind="gold" label={tx('💼 İş teklifi gönder', '💼 Send job offer', '💼 Angebot')} onPress={() => onOffer(a, sh)} />}
            </View>
            {!!a.offer_status && <Text style={[s.cardMeta, { fontWeight: '800' }]}>💼 {tx('Teklif', 'Offer', 'Angebot')}: {a.offer_status === 'sent' ? tx('gönderildi, yanıt bekleniyor', 'sent, awaiting answer', 'gesendet') : a.offer_status === 'accepted' ? tx('kabul edildi ✅', 'accepted ✅', 'angenommen ✅') : a.offer_status === 'declined' ? tx('reddedildi', 'declined', 'abgelehnt') : tx('geri çekildi', 'withdrawn', 'zurückgezogen')}</Text>}
          </View>
        );
      })}

      <NoteModal
        visible={!!modal}
        title={modal ? {
          reject: tx('Ret açıklaması (isteğe bağlı)', 'Rejection note (optional)', 'Begründung (optional)'),
          cancelApp: tx('İptal nedeni', 'Cancellation reason', 'Stornogrund'),
          manualIn: tx('Elle giriş: neden QR kullanılamadı?', 'Manual check-in: why no QR?', 'Warum kein QR?'),
          manualOut: tx('Elle çıkış: neden QR kullanılamadı?', 'Manual check-out: why no QR?', 'Warum kein QR?'),
          cancelShift: tx('İlanı iptal etme nedeni (adaylara gösterilir)', 'Reason (shown to candidates)', 'Grund (für Kandidaten sichtbar)'),
        }[modal.kind] : ''}
        placeholder={tx('Kısa ve saygılı bir açıklama yaz.', 'Write a short, respectful note.', 'Kurz und respektvoll.')}
        minLen={modal && modal.kind === 'reject' ? 0 : 5}
        onCancel={() => setModal(null)}
        onSubmit={onModalSubmit}
      />
    </Screen>
  );
};

const SmallAction = ({ label, onPress, busy, kind }) => {
  const { app } = useIk();
  const { c } = app;
  const bg = kind === 'gold' ? c.gold : kind === 'danger' ? 'transparent' : c.chip;
  const color = kind === 'danger' ? c.red : c.dark;
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} style={{ backgroundColor: bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginTop: 8, borderWidth: kind === 'danger' ? 1 : 0, borderColor: c.red, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
};

/* ---------- QR okutma ---------- */
const ScanCheckin = ({ onBack }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang } = app;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, data|code }
  const lockRef = useRef(false);

  const handle = async (raw) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setScanning(false);
    if (!parseCheckinPayload(raw)) { setResult({ ok: false, code: 'bad_code' }); lockRef.current = false; return; }
    setBusy(true);
    const res = await api.redeemCheckin(String(raw).trim());
    setBusy(false);
    setResult(res.ok ? { ok: true, data: res.data } : { ok: false, code: res.code });
    lockRef.current = false;
  };
  const start = async () => {
    setResult(null);
    if (Platform.OS === 'web') { Alert.alert('BAKPLANLA', tx('Kamera ile okutma telefonda çalışır. Web önizlemede QR okutulamaz; gerekirse aday listesinden "Elle giriş" kullan.', 'Scanning works on the phone. On web, use manual check-in from the candidate list.', 'Scannen nur auf dem Handy.')); return; }
    if (!permission || !permission.granted) {
      const p = await requestPermission();
      if (!p || !p.granted) { Alert.alert('BAKPLANLA', tx('Kamera izni verilmedi. Ayarlardan izin verebilir ya da "Elle giriş" kullanabilirsin.', 'Camera permission denied.', 'Kamerazugriff verweigert.')); return; }
    }
    setScanning(true);
  };

  return (
    <Screen>
      <ScreenHeader title={tx('VARDİYA QR OKUT', 'SCAN SHIFT QR', 'SCHICHT-QR SCANNEN')} subtitle={tx('Giriş ve çıkış kaydı', 'Check-in and check-out', 'Ein- und Auschecken')} />
      <BackLink onPress={onBack} />
      <View style={s.card}>
        <Text style={s.cardTitle}>📷 {tx('Nasıl çalışır?', 'How it works', 'So geht\'s')}</Text>
        <Text style={s.note}>
          {tx('Genç, Başvurularım ekranından kendi QR kodunu açar; sen burada okutursun. İlk okutma GİRİŞ, ikinci okutma (yeni kodla) ÇIKIŞ kaydeder. Kod 5 dakika geçerli ve tek kullanımlıktır. QR tek başına kimlik doğrulaması değildir: kişinin, onayladığın aday olduğunu yüz yüze kontrol et.', 'The candidate opens their QR; you scan it. First scan = check-in, second (new code) = check-out. Codes last 5 minutes, single use. QR alone is not identity verification — check in person.', 'Erster Scan = Check-in, zweiter = Check-out. Code 5 Min. gültig.')}
        </Text>
        <Btn kind="gold" icon="📷" label={tx('Kamerayı Aç', 'Open Camera', 'Kamera öffnen')} busy={busy} onPress={start} />
      </View>
      {!!result && (result.ok ? (
        <View style={[s.card, { borderColor: c.green, borderWidth: 2, alignItems: 'center' }]}>
          <Text style={{ fontSize: 44 }}>{result.data.action === 'check_in' ? '🟢' : '🏁'}</Text>
          <Text style={[s.cardTitle, { fontSize: 18, marginTop: 6 }]}>
            {result.data.action === 'check_in' ? tx('GİRİŞ KAYDEDİLDİ', 'CHECKED IN', 'EINGECHECKT') : tx('ÇIKIŞ KAYDEDİLDİ — vardiya tamamlandı', 'CHECKED OUT — shift completed', 'AUSGECHECKT')}
          </Text>
          <Text style={[s.cardMeta, { fontSize: 15 }]}>{result.data.display_name} · {result.data.shift_title}</Text>
          <Text style={s.cardMeta}>{formatDateTime(result.data.at, lang)}</Text>
        </View>
      ) : (
        <ErrorCard text={errorText(result.code, lang)} />
      ))}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          {Platform.OS !== 'web' && (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => handle(data)}
            />
          )}
          <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
            <Text style={{ color: '#FFFFFF', textAlign: 'center', marginBottom: 14, fontSize: 15, fontWeight: '700' }}>
              {tx('Gencin ekranındaki vardiya QR\'ını çerçeveye al.', 'Point at the candidate\'s shift QR.', 'Auf den Schicht-QR richten.')}
            </Text>
            <TouchableOpacity onPress={() => setScanning(false)} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#0A3D33', fontWeight: '900' }}>{tx('Kapat', 'Close', 'Schließen')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

/* ---------- İş teklifi ---------- */
const OfferForm = ({ application, onBack }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [type, setType] = useState('interview');
  const [details, setDetails] = useState('');
  const [payInfo, setPayInfo] = useState('');
  const [conditions, setConditions] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async () => {
    if (busy) return;
    setErr(null);
    if (details.trim().length < 10) { setErr(errorText('invalid:details', lang)); return; }
    if (payInfo.trim().length < 3) { setErr(errorText('invalid:pay_info', lang)); return; }
    if (conditions.trim().length < 3) { setErr(errorText('invalid:conditions', lang)); return; }
    setBusy(true);
    const res = await api.sendOffer(application.id, { offer_type: type, details: details.trim(), pay_info: payInfo.trim(), conditions: conditions.trim() });
    setBusy(false);
    if (!res.ok) { setErr(errorText(res.code, lang)); return; }
    showToast(tx('Teklif gönderildi. Karar adayındır.', 'Offer sent. The decision is the candidate\'s.', 'Angebot gesendet.'));
    onBack();
  };
  return (
    <Screen>
      <ScreenHeader title={tx('İŞ TEKLİFİ', 'JOB OFFER', 'JOBANGEBOT')} subtitle={application.display_name} />
      <BackLink onPress={onBack} />
      <View style={s.card}>
        <Text style={s.label}>{tx('TEKLİF TÜRÜ', 'OFFER TYPE', 'ANGEBOTSART')}</Text>
        <View style={s.chipRow}>
          {OFFER_TYPES.map((o) => <IkChip key={o.key} label={L3(lang, o)} active={type === o.key} onPress={() => setType(o.key)} />)}
        </View>
        <Field label={tx('DETAYLAR', 'DETAILS', 'DETAILS')} value={details} onChangeText={setDetails} multiline maxLength={1000} />
        <Field label={tx('ÜCRET BİLGİSİ', 'PAY INFO', 'LOHN')} value={payInfo} onChangeText={setPayInfo} maxLength={200} placeholder={tx('ör. Saatlik 120 ₺ / aylık net …', 'e.g. hourly …', 'z. B. stündlich …')} />
        <Field label={tx('ÇALIŞMA KOŞULLARI', 'CONDITIONS', 'BEDINGUNGEN')} value={conditions} onChangeText={setConditions} multiline maxLength={500} placeholder={tx('Günler, saatler, sigorta, deneme süresi…', 'Days, hours, insurance…', 'Tage, Zeiten, Versicherung…')} />
        <Text style={s.note}>{tx('Teklif adaya bildirilir; uygulama teklifi asla otomatik kabul etmez. Kesin koşullar yazılı iş sözleşmesiyle belirlenmelidir.', 'The candidate decides; the app never auto-accepts. Final terms belong in a written contract.', 'Endgültige Bedingungen im schriftlichen Vertrag.')}</Text>
        {!!err && <Text style={{ color: c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}
        <Btn kind="gold" label={tx('Teklifi Gönder', 'Send Offer', 'Angebot senden')} busy={busy} onPress={send} />
      </View>
    </Screen>
  );
};
