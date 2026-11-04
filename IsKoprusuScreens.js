/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — ekranlar (genç kullanıcı) + giriş noktası
  "Oyundan gerçek hayata, deneyimden işe."

  App.js'ten şöyle açılır:
    <IsKoprusuScreen app={useApp()} supabase={supabase} Screen={Screen} ScreenHeader={ScreenHeader} mode="youth" />
  mode="business" → İşletme Paneli (IsKoprusuBusiness.js)

  Tüm veriler sunucudan (bk_* fonksiyonları) gelir; bu dosyada sahte ilan/işletme YOKTUR.
===========================================================
*/
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FLOW, L3, IK_ROLE_KEYS, APP_STATUS, RATING_KEYS, roleName, roleIcon, badgeName, levelTitle,
  formatDay, formatDateTime, durationLabel, payLabel, paymentMethodName, offerTypeName, seatsLeft, eligibleFor,
  errorText, eventText, canCancelApplication, qrWindow, validRatings, averageOf, istanbulDay, IK_TOKEN_SECONDS,
} from './isKoprusu.js';
import { createIkApi } from './isKoprusuApi.js';
import {
  IkContext, useIk, BackLink, StatusPill, DemoTag, IkChip, Field, CheckBox, SwitchRow, Btn, InfoRow, Stars,
  Loading, ErrorCard, EmptyBox, QrBox, GateCard,
} from './ikUi.js';
import { BusinessPanel } from './IsKoprusuBusiness.js';
import { useMe, NotInstalled, EventsView, ReportLink, RatingForm } from './ikCommon.js';

/* ======================= GİRİŞ NOKTASI ======================= */
export const IsKoprusuScreen = ({ app, supabase, Screen, ScreenHeader, mode = 'youth' }) => {
  const api = useMemo(() => createIkApi(supabase), [supabase]);
  const ctx = useMemo(() => ({ app, api, Screen, ScreenHeader }), [app, api, Screen, ScreenHeader]);
  const signedIn = !!(app.session && app.session.user && app.session.user.id);
  const { tx } = app;
  const title = mode === 'business' ? tx('İŞLETME PANELİ', 'BUSINESS PANEL', 'BETRIEBSBEREICH') : tx('İŞ KÖPRÜSÜ', 'JOB BRIDGE', 'JOB-BRÜCKE');
  const subtitle = mode === 'business'
    ? tx('BAKPLANLA İş Köprüsü', 'BAKPLANLA Job Bridge', 'BAKPLANLA Job-Brücke')
    : tx('Oyundan gerçek hayata, deneyimden işe.', 'From game to real life, from experience to work.', 'Vom Spiel ins echte Leben, von Erfahrung zur Arbeit.');

  if (!signedIn) {
    return (
      <IkContext.Provider value={ctx}>
        <Screen>
          <ScreenHeader title={title} subtitle={subtitle} />
          <GateCard
            icon="🔐"
            title={tx('Giriş yapman gerekiyor', 'Please sign in', 'Bitte anmelden')}
            text={tx('Rozetlerin, başvuruların ve vardiyaların hesabına bağlı tutulur. Devam etmek için giriş yap.', 'Badges, applications and shifts are tied to your account.', 'Abzeichen, Bewerbungen und Schichten sind an dein Konto gebunden.')}
            buttonLabel={tx('Giriş Yap', 'Sign In', 'Anmelden')}
            onPress={() => app.setShowAuthModal(true)}
          />
        </Screen>
      </IkContext.Provider>
    );
  }
  return (
    <IkContext.Provider value={ctx}>
      {mode === 'business' ? <BusinessPanel title={title} subtitle={subtitle} /> : <YouthFlow title={title} subtitle={subtitle} />}
    </IkContext.Provider>
  );
};

/* ======================= GENÇ AKIŞI ======================= */
const YouthFlow = ({ title, subtitle }) => {
  const { app, Screen, ScreenHeader } = useIk();
  const { tx } = app;
  const [me, reloadMe] = useMe();
  const [view, setView] = useState('home'); // home | profile | list | detail | apps | qr | review | passport | events
  const [shiftId, setShiftId] = useState(null);
  const [activeApp, setActiveApp] = useState(null);

  const go = (v) => setView(v);
  const openShift = (id) => { setShiftId(id); setView('detail'); };

  if (me.state === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={title} subtitle={subtitle} />
        <Loading />
      </Screen>
    );
  }
  if (me.state === 'error') {
    return (
      <Screen>
        <ScreenHeader title={title} subtitle={subtitle} />
        <NotInstalled code={me.code} onRetry={reloadMe} />
      </Screen>
    );
  }
  const candidate = me.data && me.data.candidate;
  if (view === 'profile' || !candidate) {
    return <ProfileForm title={title} subtitle={subtitle} candidate={candidate} onDone={() => { reloadMe(); go('home'); }} onBack={candidate ? () => go('home') : null} />;
  }
  if (view === 'events') return <EventsView onBack={() => { reloadMe(); go('home'); }} />;
  if (view === 'list') return <ShiftList onBack={() => go('home')} onOpen={openShift} />;
  if (view === 'detail' && shiftId) return <ShiftDetail shiftId={shiftId} onBack={() => go('list')} onApplied={() => { reloadMe(); go('apps'); }} />;
  if (view === 'apps') {
    return (
      <MyApplications
        onBack={() => go('home')}
        onOpenShift={openShift}
        onQr={(a) => { setActiveApp(a); go('qr'); }}
        onReview={(a) => { setActiveApp(a); go('review'); }}
      />
    );
  }
  if (view === 'qr' && activeApp) return <MyShiftQr application={activeApp} onBack={() => go('apps')} />;
  if (view === 'review' && activeApp) return <CandidateReview application={activeApp} onBack={() => go('apps')} />;
  if (view === 'passport') return <Passport onBack={() => go('home')} />;
  return <YouthHome title={title} subtitle={subtitle} me={me.data} onGo={go} />;
};

const YouthHome = ({ title, subtitle, me, onGo }) => {
  const { app, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, navigate } = app;
  const badges = (me && me.badges) || [];
  const unread = Number((me && me.unread) || 0);
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} />

      <View style={{ backgroundColor: c.dark, borderRadius: 22, padding: 16, marginBottom: 12, overflow: 'hidden' }}>
        <Text style={{ position: 'absolute', right: 10, top: -14, fontSize: 90, opacity: 0.08 }}>🌉</Text>
        <Text style={{ color: c.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{tx('BAKPLANLA İŞ KÖPRÜSÜ', 'BAKPLANLA JOB BRIDGE', 'BAKPLANLA JOB-BRÜCKE')}</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 4 }}>
          {tx('Mesleği önce oyunda dene, sonra gerçek bir işletmede ücretli bir gün çalış.', 'Try the job in the game first, then work a paid day at a real business.', 'Erst im Spiel ausprobieren, dann einen bezahlten Tag in einem echten Betrieb.')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
          {FLOW.map((f, i) => (
            <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{f.icon} {L3(lang, f)}</Text>
              </View>
              {i < FLOW.length - 1 && <Ionicons name="chevron-forward" size={12} color={c.gold} style={{ marginHorizontal: 2 }} />}
            </View>
          ))}
        </View>
      </View>

      {unread > 0 && (
        <TouchableOpacity onPress={() => onGo('events')} style={[s.card, s.row, { borderColor: c.gold, borderWidth: 1.5 }]}>
          <Text style={{ fontSize: 22, marginRight: 10 }}>🔔</Text>
          <Text style={[s.cardTitle, s.flex1]}>{tx(`${unread} yeni gelişme var`, `${unread} new updates`, `${unread} neue Updates`)}</Text>
          <Ionicons name="chevron-forward" size={18} color={c.sub} />
        </TouchableOpacity>
      )}

      <Text style={s.label}>{tx('MESLEK ROZETLERİM', 'MY JOB BADGES', 'MEINE ABZEICHEN')}</Text>
      {badges.length === 0 ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>🏅 {tx('Henüz rozetin yok', 'No badges yet', 'Noch keine Abzeichen')}</Text>
          <Text style={s.note}>
            {tx('Rozet, İş Başı\'nda bir seviyeyi sunucuya bağlıyken en az 2 yıldızla bitirince otomatik verilir. Cihaz ya da antrenman modunda oynanan vardiyalar rozete sayılmaz.', 'You earn a badge automatically by finishing a level in On the Job with at least 2 stars while online. Device or practice mode does not count.', 'Ein Abzeichen gibt es automatisch für eine Stufe mit mind. 2 Sternen (online).')}
          </Text>
          <Btn kind="gold" icon="🎮" label={tx('İş Başı\'nda Meslek Provası Yap', 'Rehearse in On the Job', 'Im Job üben')} onPress={() => navigate('isbasi')} />
        </View>
      ) : (
        badges.map((b) => (
          <View key={b.role} style={[s.card, s.row]}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ fontSize: 26 }}>{roleIcon(b.role)}</Text>
            </View>
            <View style={s.flex1}>
              <Text style={[s.cardTitle, { fontSize: 13 }]}>{badgeName(b.role, b.best_level, lang)}</Text>
              <Text style={s.cardMeta}>{levelTitle(b.role, b.best_level, lang)} · {tx(`${b.verified_shifts} doğrulanmış vardiya`, `${b.verified_shifts} verified shifts`, `${b.verified_shifts} geprüfte Schichten`)}</Text>
            </View>
          </View>
        ))
      )}

      <Btn kind="dark" icon="🤝" label={tx('GERÇEKTE DENE — Ücretli deneme vardiyaları', 'TRY IT FOR REAL — Paid trial shifts', 'ECHT AUSPROBIEREN — Bezahlte Probeschichten')} onPress={() => onGo('list')} />

      <View style={{ marginTop: 14 }}>
        {[
          { icon: 'document-text-outline', t: tx('Başvurularım', 'My Applications', 'Meine Bewerbungen'), sub: tx('Durum, vardiya QR\'ı, değerlendirme, teklifler', 'Status, shift QR, reviews, offers', 'Status, QR, Bewertung, Angebote'), v: 'apps' },
          { icon: 'id-card-outline', t: tx('Dijital Meslek Pasaportum', 'My Digital Job Passport', 'Mein digitaler Berufspass'), sub: tx('Rozetler ve tamamlanan deneyimler', 'Badges and completed experiences', 'Abzeichen und Erfahrungen'), v: 'passport' },
          { icon: 'notifications-outline', t: tx('Bildirimler', 'Notifications', 'Mitteilungen'), sub: tx('Uygulama içi gelişmeler', 'In-app updates', 'Updates in der App'), v: 'events' },
          { icon: 'person-circle-outline', t: tx('İş Köprüsü Profilim', 'My Job Bridge Profile', 'Mein Profil'), sub: tx('Görünen ad ve şehir', 'Display name and city', 'Anzeigename und Stadt'), v: 'profile' },
        ].map((row) => (
          <TouchableOpacity key={row.v} style={s.menuRow} onPress={() => onGo(row.v)}>
            <View style={s.menuIcon}><Ionicons name={row.icon} size={22} color={c.green} /></View>
            <View style={s.flex1}>
              <Text style={s.menuTitle}>{row.t}</Text>
              <Text style={s.menuSub}>{row.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.sub} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.note, { marginTop: 6 }]}>
        {tx('Rozetler bir oyun içi başarı göstergesidir; resmî sertifika ya da mesleki yeterlilik belgesi DEĞİLDİR ve gerçek iş performansını kesin olarak öngörmez.', 'Badges show in-game achievement; they are NOT an official certificate and do not predict real job performance.', 'Abzeichen zeigen Spielerfolge; sie sind KEIN offizielles Zertifikat.')}
      </Text>
    </Screen>
  );
};

/* ---------- Profil (18+ beyanı, minimum veri) ---------- */
const ProfileForm = ({ title, subtitle, candidate, onDone, onBack }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, tx, lang, showToast } = app;
  const [name, setName] = useState(candidate ? candidate.display_name : '');
  const [city, setCity] = useState(candidate && candidate.city ? candidate.city : '');
  const [adult, setAdult] = useState(!!(candidate && candidate.adult_confirmed));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    if (busy) return;
    setErr(null);
    if (String(name).trim().length < 2) { setErr(errorText('invalid:display_name', lang)); return; }
    if (!adult) { setErr(errorText('not_adult', lang)); return; }
    setBusy(true);
    const res = await api.saveCandidate(String(name).trim(), true, String(city).trim());
    setBusy(false);
    if (!res.ok) { setErr(errorText(res.code, lang)); return; }
    showToast(tx('Profilin kaydedildi.', 'Profile saved.', 'Profil gespeichert.'));
    onDone();
  };
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} />
      {!!onBack && <BackLink onPress={onBack} />}
      <View style={s.card}>
        <Text style={s.cardTitle}>👋 {candidate ? tx('Profilini düzenle', 'Edit your profile', 'Profil bearbeiten') : tx('İş Köprüsü profilini oluştur', 'Create your Job Bridge profile', 'Profil erstellen')}</Text>
        <Text style={s.note}>
          {tx('Yalnızca gerekli bilgileri istiyoruz. Kimlik numarası, doğum tarihi ya da adres istemiyoruz. Görünen adın, yalnızca başvurduğun işletmeye gösterilir.', 'We only ask what is needed. No ID number, birth date or address. Your display name is shown only to businesses you apply to.', 'Nur das Nötigste. Keine Ausweisnummer, kein Geburtsdatum.')}
        </Text>
        <Field label={tx('GÖRÜNEN AD (ör. Ali Y.)', 'DISPLAY NAME', 'ANZEIGENAME')} value={name} onChangeText={setName} maxLength={40} />
        <Field label={tx('ŞEHİR (isteğe bağlı)', 'CITY (optional)', 'STADT (optional)')} value={city} onChangeText={setCity} maxLength={60} />
        <CheckBox checked={adult} onPress={() => setAdult(!adult)}>
          <Text style={[s.cardTitle, { fontSize: 14 }]}>{tx('18 yaşından büyüğüm.', 'I am 18 or older.', 'Ich bin mindestens 18.')}</Text>
          <Text style={s.note}>
            {tx('İlk sürümde ücretli deneme vardiyaları yalnızca 18 yaş ve üzeri içindir. Bu bir beyandır; uygulama kimlik doğrulaması yapmaz. Vardiya günü işletme yasal işlemler için kimliğini isteyebilir.', 'Paid trial shifts are 18+ in this version. This is a self-declaration; the app does not verify ID. The business may ask for ID on the shift day.', 'Bezahlte Probeschichten ab 18. Dies ist eine Selbstauskunft.')}
          </Text>
        </CheckBox>
        {!!err && <Text style={{ color: app.c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}
        <Btn label={tx('Kaydet', 'Save', 'Speichern')} busy={busy} onPress={save} />
      </View>
    </Screen>
  );
};

/* ---------- Gerçekte Dene: ilan listesi ---------- */
const ShiftCard = ({ shift, onPress }) => {
  const { app } = useIk();
  const { s, c, tx, lang } = app;
  const left = seatsLeft(shift);
  const ok = eligibleFor(shift);
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.row, { marginBottom: 6 }]}>
        {shift.is_demo && <DemoTag />}
        <Text style={{ fontSize: 20, marginRight: 6 }}>{roleIcon(shift.role)}</Text>
        <Text style={[s.cardTitle, s.flex1]} numberOfLines={2}>{shift.title}</Text>
      </View>
      <Text style={{ color: c.text, fontWeight: '800' }}>
        {shift.business ? shift.business.name : '—'} {shift.business && shift.business.verified ? '✅' : ''}
      </Text>
      <Text style={s.cardMeta}>📅 {formatDay(shift.shift_date, lang)} · 🕒 {shift.start_time}–{shift.end_time} ({durationLabel(shift.duration_minutes, lang)})</Text>
      <Text style={s.cardMeta}>📍 {shift.district}, {shift.city}</Text>
      <Text style={[s.cardMeta, { color: c.green, fontWeight: '800' }]}>💰 {payLabel(shift, lang)}</Text>
      <View style={[s.row, { marginTop: 8, flexWrap: 'wrap' }]}>
        <View style={{ backgroundColor: ok ? '#DDF5E8' : '#FCF1DC', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: ok ? '#0E6B45' : '#B7791F' }}>
            {ok ? tx('✓ Rozetin uygun', '✓ Badge OK', '✓ Abzeichen passt') : tx(`🏅 ${roleName(shift.role, lang)} Sv.${shift.min_level} gerekli`, `🏅 ${roleName(shift.role, lang)} Lv.${shift.min_level} needed`, `🏅 Stufe ${shift.min_level} nötig`)}
          </Text>
        </View>
        <View style={{ backgroundColor: c.chip, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: c.sub }}>
            {shift.status === 'full' || left === 0 ? tx('Dolu', 'Full', 'Voll') : tx(`${left} yer kaldı`, `${left} seats left`, `${left} Plätze frei`)}
          </Text>
        </View>
        {!!shift.my_application && <StatusPill table={APP_STATUS} value={shift.my_application.status} style={{ marginLeft: 6, marginBottom: 4 }} />}
      </View>
    </TouchableOpacity>
  );
};

const ShiftList = ({ onBack, onOpen }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, tx, lang } = app;
  const [role, setRole] = useState(null);
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [minPay, setMinPay] = useState(null);
  const [range, setRange] = useState('all'); // all | week | today
  const [st, setSt] = useState({ state: 'loading', list: [], code: null });
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqRef.current;
    setSt((cur) => ({ ...cur, state: 'loading' }));
    const res = await api.listShifts({
      role, onlyEligible, onlyOpen, minPay,
      to: range === 'week' ? istanbulDay(Date.now(), 7) : range === 'today' ? istanbulDay() : null,
    });
    if (id !== reqRef.current) return; // eski isteğin geç gelen cevabını yok say
    setSt(res.ok ? { state: 'ready', list: res.data || [], code: null } : { state: 'error', list: [], code: res.code });
  }, [api, role, onlyEligible, onlyOpen, minPay, range]);
  useEffect(() => { load(); }, [load]);

  return (
    <Screen>
      <ScreenHeader title={tx('GERÇEKTE DENE', 'TRY IT FOR REAL', 'ECHT AUSPROBIEREN')} subtitle={tx('Doğrulanmış işletmelerin ücretli deneme vardiyaları', 'Paid trial shifts from verified businesses', 'Bezahlte Probeschichten verifizierter Betriebe')} />
      <BackLink onPress={onBack} />

      <Text style={s.label}>{tx('MESLEK', 'JOB', 'BERUF')}</Text>
      <View style={s.chipRow}>
        <IkChip label={tx('Tümü', 'All', 'Alle')} active={!role} onPress={() => setRole(null)} />
        {IK_ROLE_KEYS.map((r) => <IkChip key={r} label={`${roleIcon(r)} ${roleName(r, lang)}`} active={role === r} onPress={() => setRole(r)} />)}
      </View>
      <Text style={s.label}>{tx('TARİH', 'DATE', 'DATUM')}</Text>
      <View style={s.chipRow}>
        <IkChip label={tx('Tümü', 'All', 'Alle')} active={range === 'all'} onPress={() => setRange('all')} />
        <IkChip label={tx('Bugün', 'Today', 'Heute')} active={range === 'today'} onPress={() => setRange('today')} />
        <IkChip label={tx('7 gün', '7 days', '7 Tage')} active={range === 'week'} onPress={() => setRange('week')} />
      </View>
      <Text style={s.label}>{tx('EN AZ ÜCRET', 'MIN. PAY', 'MIN. LOHN')}</Text>
      <View style={s.chipRow}>
        {[null, 500, 1000, 1500].map((v) => (
          <IkChip key={String(v)} label={v ? `${v} ₺+` : tx('Fark etmez', 'Any', 'Egal')} active={minPay === v} onPress={() => setMinPay(v)} />
        ))}
      </View>
      <View style={s.chipRow}>
        <IkChip label={`🏅 ${tx('Bana uygun', 'Eligible for me', 'Für mich')}`} active={onlyEligible} onPress={() => setOnlyEligible(!onlyEligible)} />
        <IkChip label={`🪑 ${tx('Boş yer var', 'Seats left', 'Plätze frei')}`} active={onlyOpen} onPress={() => setOnlyOpen(!onlyOpen)} />
      </View>
      <Text style={[s.note, { marginBottom: 8 }]}>
        {tx('Mesafe filtresi bu sürümde yok; ilçe ve adres ilan içinde yazar.', 'Distance filter is not available yet; district and address are in each listing.', 'Entfernungsfilter noch nicht verfügbar.')}
      </Text>

      {st.state === 'loading' && <Loading />}
      {st.state === 'error' && <NotInstalled code={st.code} onRetry={load} />}
      {st.state === 'ready' && st.list.length === 0 && (
        <EmptyBox
          icon="🔎"
          title={tx('Şu an uygun ilan yok', 'No listings right now', 'Derzeit keine Anzeigen')}
          text={tx('Henüz anlaşmalı işletme ilanı yayınlanmadı ya da filtrelere uyan ilan yok. Burada uydurma ilan gösterilmez; işletmeler ilan açtıkça liste dolacak.', 'No partner listings yet, or none match your filters. We never show made-up listings.', 'Noch keine Anzeigen. Wir zeigen keine erfundenen Anzeigen.')}
        />
      )}
      {st.list.map((sh) => <ShiftCard key={sh.id} shift={sh} onPress={() => onOpen(sh.id)} />)}
    </Screen>
  );
};

/* ---------- İlan detayı + başvuru ---------- */
const ShiftDetail = ({ shiftId, onBack, onApplied }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, navigate, showToast } = app;
  const [st, setSt] = useState({ state: 'loading', shift: null, code: null });
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [shareHistory, setShareHistory] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const res = await api.getShift(shiftId);
    setSt(res.ok ? { state: 'ready', shift: res.data, code: null } : { state: 'error', shift: null, code: res.code });
  }, [api, shiftId]);
  useEffect(() => { load(); }, [load]);

  const apply = async () => {
    if (inFlight.current) return;
    setErr(null);
    if (!consent) { setErr(tx('Devam etmek için bilgilendirmeyi onaylamalısın.', 'Please accept the notice to continue.', 'Bitte bestätige den Hinweis.')); return; }
    inFlight.current = true;
    setBusy(true);
    const res = await api.apply(shiftId, message.trim(), shareHistory, phone.trim());
    setBusy(false);
    inFlight.current = false;
    if (!res.ok) { setErr(errorText(res.code, lang)); if (res.code === 'shift_full' || res.code === 'already_applied') load(); return; }
    showToast(tx('Başvurun gönderildi.', 'Application sent.', 'Bewerbung gesendet.'));
    onApplied();
  };

  const header = <ScreenHeader title={tx('İLAN DETAYI', 'LISTING', 'ANZEIGE')} subtitle={tx('Gerçekte Dene', 'Try It for Real', 'Echt ausprobieren')} />;
  if (st.state !== 'ready') {
    return (
      <Screen>
        {header}
        <BackLink onPress={onBack} />
        {st.state === 'loading' ? <Loading /> : <NotInstalled code={st.code} onRetry={load} />}
      </Screen>
    );
  }
  const sh = st.shift;
  const ok = eligibleFor(sh);
  const left = seatsLeft(sh);
  const deadlinePassed = Date.parse(sh.apply_deadline) < Date.now();
  const canApply = !sh.is_demo && sh.status === 'published' && left > 0 && ok && !sh.my_application && !deadlinePassed;

  return (
    <Screen>
      {header}
      <BackLink onPress={onBack} />
      {sh.is_demo && (
        <View style={[s.card, { borderColor: c.red, borderWidth: 1.5 }]}>
          <View style={s.row}><DemoTag /><Text style={[s.cardTitle, { color: c.red }]}>{tx('Bu bir DEMO ilandır', 'This is a DEMO listing', 'DEMO-Anzeige')}</Text></View>
          <Text style={s.note}>{tx('Gerçek bir işletmeye ait değildir, yalnızca uygulamanın nasıl çalıştığını göstermek içindir. Başvuru yapılamaz.', 'It does not belong to a real business and only shows how the app works. You cannot apply.', 'Gehört zu keinem echten Betrieb. Keine Bewerbung möglich.')}</Text>
        </View>
      )}
      <View style={s.card}>
        <View style={s.row}>
          <Text style={{ fontSize: 28, marginRight: 8 }}>{roleIcon(sh.role)}</Text>
          <View style={s.flex1}>
            <Text style={[s.cardTitle, { fontSize: 17 }]}>{sh.title}</Text>
            <Text style={{ color: c.text, fontWeight: '800', marginTop: 2 }}>
              {sh.business ? sh.business.name : '—'} {sh.business && sh.business.verified ? tx('✅ Doğrulanmış işletme', '✅ Verified business', '✅ Verifizierter Betrieb') : ''}
            </Text>
          </View>
        </View>
        <Text style={[s.note, { color: c.text, fontSize: 14 }]}>{sh.description}</Text>
        <InfoRow icon="briefcase-outline" label={tx('POZİSYON', 'POSITION', 'POSITION')} value={roleName(sh.role, lang)} />
        <InfoRow icon="calendar-outline" label={tx('TARİH VE SAAT', 'DATE AND TIME', 'DATUM UND ZEIT')} value={`${formatDay(sh.shift_date, lang)} · ${sh.start_time}–${sh.end_time} (${durationLabel(sh.duration_minutes, lang)})`} />
        <InfoRow icon="cash-outline" label={tx('ÜCRET VE ÖDEME', 'PAY AND PAYMENT', 'LOHN UND ZAHLUNG')} value={`${payLabel(sh, lang)} · ${paymentMethodName(sh.payment_method, lang)} · ${sh.payment_timing}`} />
        <InfoRow icon="location-outline" label={tx('KONUM', 'LOCATION', 'ORT')} value={`${sh.address}, ${sh.district}/${sh.city}`} />
        <InfoRow icon="people-outline" label={tx('KONTENJAN', 'CAPACITY', 'PLÄTZE')} value={`${sh.capacity} · ${sh.status === 'full' || left === 0 ? tx('Dolu', 'Full', 'Voll') : tx(`${left} yer kaldı`, `${left} left`, `${left} frei`)}`} />
        <InfoRow icon="ribbon-outline" label={tx('GEREKEN SİMÜLASYON', 'REQUIRED SIMULATION', 'BENÖTIGTE SIMULATION')} value={`${badgeName(sh.role, sh.min_level, lang)} (${levelTitle(sh.role, sh.min_level, lang)})`} />
        <InfoRow icon="person-outline" label={tx('UYGUNLUK', 'ELIGIBILITY', 'VORAUSSETZUNG')} value={tx(`En az ${sh.min_age} yaş`, `At least ${sh.min_age} years old`, `Mindestens ${sh.min_age} Jahre`)} />
        <InfoRow icon="medkit-outline" label={tx('İŞ SAĞLIĞI VE GÜVENLİĞİ', 'HEALTH AND SAFETY', 'ARBEITSSCHUTZ')} value={sh.safety_info} />
        <InfoRow icon="time-outline" label={tx('BAŞVURU SON TARİHİ', 'APPLY BY', 'BEWERBEN BIS')} value={formatDateTime(sh.apply_deadline, lang)} />
        <InfoRow icon="close-circle-outline" label={tx('İPTAL KOŞULLARI', 'CANCELLATION', 'STORNIERUNG')} value={sh.cancel_policy} />
        <View style={{ marginTop: 10 }}><StatusPill table={{ published: { tr: 'Başvuruya açık', en: 'Open', de: 'Offen', color: '#0E6B45', bg: '#DDF5E8' }, full: { tr: 'Dolu', en: 'Full', de: 'Voll', color: '#6E7F7A', bg: '#EEF2EF' }, cancelled: { tr: 'İptal edildi', en: 'Cancelled', de: 'Storniert', color: '#B23A30', bg: '#FBE4E1' }, completed: { tr: 'Tamamlandı', en: 'Completed', de: 'Abgeschlossen', color: '#0A3D33', bg: '#F5E6BF' } }} value={sh.status} /></View>
      </View>

      {!!sh.my_application && (
        <View style={s.softCard}>
          <Text style={s.cardTitle}>{tx('Bu ilana başvurdun', 'You applied', 'Du hast dich beworben')}</Text>
          <StatusPill table={APP_STATUS} value={sh.my_application.status} style={{ marginTop: 6 }} />
        </View>
      )}

      {!sh.my_application && !ok && !sh.is_demo && (
        <View style={s.card}>
          <Text style={s.cardTitle}>🏅 {tx('Önce rozetini kazan', 'Earn the badge first', 'Erst das Abzeichen holen')}</Text>
          <Text style={s.note}>
            {tx(`Bu ilan için ${roleName(sh.role, lang)} simülasyonunda en az Seviye ${sh.min_level} gerekiyor. Şu anki rozet seviyen: ${sh.my_badge_level || 0}.`, `This listing needs at least level ${sh.min_level}. Your level: ${sh.my_badge_level || 0}.`, `Benötigt Stufe ${sh.min_level}. Deine Stufe: ${sh.my_badge_level || 0}.`)}
          </Text>
          <Btn kind="gold" icon="🎮" label={tx('İş Başı\'nda Prova Yap', 'Rehearse in On the Job', 'Im Job üben')} onPress={() => navigate('isbasi')} />
        </View>
      )}

      {canApply && (
        <View style={s.card}>
          <Text style={s.cardTitle}>📝 {tx('Başvur', 'Apply', 'Bewerben')}</Text>
          <Field label={tx('KISA MESAJ (isteğe bağlı)', 'SHORT MESSAGE (optional)', 'KURZE NACHRICHT (optional)')} value={message} onChangeText={setMessage} multiline maxLength={300} />
          <Field
            label={tx('TELEFON (isteğe bağlı)', 'PHONE (optional)', 'TELEFON (optional)')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={20}
            hint={tx('Yalnızca başvurun ONAYLANIRSA bu işletmeye görünür (vardiya ve yasal işlemler için seninle iletişime geçebilsin diye).', 'Shown to this business ONLY if you are approved.', 'Nur nach Bestätigung sichtbar.')}
          />
          <SwitchRow
            title={tx('Geçmiş deneyimlerimi paylaş', 'Share my past experience', 'Erfahrung teilen')}
            sub={tx('Açarsan işletme, tamamladığın vardiya sayısını ve diğer işletmelerin ortalama puanlarını görür. Kapalıysa yalnızca adın ve bu meslekteki rozetin görünür.', 'If on, the business sees your completed shifts and average ratings. Otherwise only your name and badge.', 'Wenn aktiv, sieht der Betrieb deine Schichten und Durchschnittsbewertungen.')}
            value={shareHistory}
            onValueChange={setShareHistory}
          />
          <CheckBox checked={consent} onPress={() => { setConsent(!consent); setErr(null); }}>
            <Text style={s.note}>
              {tx('Görünen adımın, bu meslekteki rozet seviyemin ve yukarıda seçtiklerimin yalnızca bu işletmeyle paylaşılacağını anladım. BAKPLANLA işveren değildir; çalışma ilişkisi, sigorta ve ödeme işletmenin sorumluluğundadır.', 'I understand my display name, badge level and the choices above are shared only with this business. BAKPLANLA is not the employer; employment, insurance and pay are the business\'s responsibility.', 'Ich verstehe, was geteilt wird. BAKPLANLA ist nicht Arbeitgeber.')}
            </Text>
          </CheckBox>
          {!!err && <Text style={{ color: c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}
          <Btn kind="gold" label={tx('Başvuruyu Gönder', 'Send Application', 'Bewerbung senden')} busy={busy} onPress={apply} />
        </View>
      )}
      {!canApply && !!err && <Text style={{ color: c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}

      {!sh.is_demo && <ReportLink type="shift" id={sh.id} />}
    </Screen>
  );
};

/* ---------- Başvurularım ---------- */
const MyApplications = ({ onBack, onOpenShift, onQr, onReview }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [st, setSt] = useState({ state: 'loading', list: [], code: null });
  const [busyId, setBusyId] = useState(null);
  const load = useCallback(async () => {
    const res = await api.myApplications();
    setSt(res.ok ? { state: 'ready', list: res.data || [], code: null } : { state: 'error', list: [], code: res.code });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const cancel = (a) => {
    Alert.alert(tx('Başvuruyu iptal et', 'Cancel application', 'Bewerbung stornieren'), a.shift.cancel_policy, [
      { text: tx('Vazgeç', 'Keep', 'Behalten'), style: 'cancel' },
      {
        text: tx('İptal Et', 'Cancel It', 'Stornieren'), style: 'destructive', onPress: async () => {
          setBusyId(a.id);
          const res = await api.cancelApplication(a.id);
          setBusyId(null);
          if (!res.ok) { Alert.alert('BAKPLANLA', errorText(res.code, lang)); return; }
          showToast(tx('Başvurun iptal edildi.', 'Application cancelled.', 'Storniert.'));
          load();
        },
      },
    ]);
  };
  const respond = async (offer, accept) => {
    setBusyId(offer.id);
    const res = await api.respondOffer(offer.id, accept);
    setBusyId(null);
    if (!res.ok) { Alert.alert('BAKPLANLA', errorText(res.code, lang)); return; }
    showToast(accept ? tx('Teklifi kabul ettin. İşletme seninle iletişime geçecek.', 'Offer accepted.', 'Angebot angenommen.') : tx('Teklifi reddettin.', 'Offer declined.', 'Angebot abgelehnt.'));
    load();
  };
  const askRespond = (offer, accept) => {
    Alert.alert(
      accept ? tx('Teklifi kabul et', 'Accept offer', 'Angebot annehmen') : tx('Teklifi reddet', 'Decline offer', 'Angebot ablehnen'),
      accept
        ? tx('Kabul ettiğini işletmeye bildireceğiz. Sözleşme ve çalışma koşullarını imzalamadan önce mutlaka yazılı olarak kontrol et.', 'We will tell the business. Check the contract in writing before signing.', 'Prüfe den Vertrag vor der Unterschrift.')
        : tx('Bu kararı geri alamazsın.', 'This cannot be undone.', 'Nicht rückgängig zu machen.'),
      [{ text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' }, { text: tx('Evet', 'Yes', 'Ja'), onPress: () => respond(offer, accept) }],
    );
  };

  return (
    <Screen>
      <ScreenHeader title={tx('BAŞVURULARIM', 'MY APPLICATIONS', 'MEINE BEWERBUNGEN')} subtitle={tx('Durum takibi', 'Status tracking', 'Status')} />
      <BackLink onPress={onBack} />
      {st.state === 'loading' && <Loading />}
      {st.state === 'error' && <NotInstalled code={st.code} onRetry={load} />}
      {st.state === 'ready' && st.list.length === 0 && <EmptyBox icon="📭" title={tx('Henüz başvurun yok', 'No applications yet', 'Noch keine Bewerbungen')} text={tx('"Gerçekte Dene" bölümünden sana uygun bir vardiyaya başvurabilirsin.', 'Apply to a shift from "Try It for Real".', 'Bewirb dich unter "Echt ausprobieren".')} />}
      {st.list.map((a) => {
        const sh = a.shift;
        const win = qrWindow(sh);
        const showQr = a.status === 'approved' && sh.status !== 'cancelled' && !a.check_out_at;
        return (
          <View key={a.id} style={s.card}>
            <TouchableOpacity onPress={() => onOpenShift(sh.id)}>
              <View style={s.row}>
                <Text style={{ fontSize: 20, marginRight: 6 }}>{roleIcon(sh.role)}</Text>
                <Text style={[s.cardTitle, s.flex1]} numberOfLines={2}>{sh.title}</Text>
              </View>
              <Text style={s.cardMeta}>{sh.business ? sh.business.name : ''} · {formatDay(sh.shift_date, lang)} {sh.start_time}–{sh.end_time}</Text>
            </TouchableOpacity>
            <StatusPill table={APP_STATUS} value={a.status} style={{ marginTop: 8 }} />
            {!!a.decision_note && <Text style={s.note}>💬 {a.decision_note}</Text>}
            {a.status === 'approved' && (
              <Text style={s.note}>
                {a.legal_confirmed
                  ? tx('✅ İşletme yasal işlemleri yaptığını onayladı.', '✅ The business confirmed the legal registration.', '✅ Anmeldung bestätigt.')
                  : tx('⏳ İşletmenin, vardiyadan önce yasal işlemleri (ör. SGK işe giriş) yapması bekleniyor. Bu onay olmadan giriş yapılamaz.', '⏳ Waiting for the business to complete legal registration before the shift.', '⏳ Warten auf gesetzliche Anmeldung.')}
              </Text>
            )}
            {!!a.check_in_at && <Text style={s.cardMeta}>🟢 {tx('Giriş', 'Check-in', 'Check-in')}: {formatDateTime(a.check_in_at, lang)}{a.check_out_at ? `  ·  🔴 ${tx('Çıkış', 'Check-out', 'Check-out')}: ${formatDateTime(a.check_out_at, lang)}` : ''}</Text>}

            {showQr && (
              win === 'open'
                ? <Btn kind="gold" icon="📲" label={a.check_in_at ? tx('Çıkış QR\'ımı Göster', 'Show Check-out QR', 'Check-out-QR') : tx('Giriş QR\'ımı Göster', 'Show Check-in QR', 'Check-in-QR')} onPress={() => onQr(a)} />
                : <Text style={s.note}>📲 {win === 'early' ? tx('Vardiya QR\'ın, başlangıçtan 1 saat önce burada açılacak.', 'Your shift QR opens here 1 hour before start.', 'QR öffnet 1 Std. vor Beginn.') : tx('QR süresi kapandı.', 'QR window closed.', 'QR geschlossen.')}</Text>
            )}
            {a.status === 'completed' && !a.my_review_done && <Btn kind="secondary" icon="⭐" label={tx('İşletmeyi Değerlendir', 'Review the Business', 'Betrieb bewerten')} onPress={() => onReview(a)} />}
            {!!a.business_review && (
              <View style={[s.softCard, { marginTop: 10 }]}>
                <Text style={s.cardTitle}>⭐ {tx('İşletmenin değerlendirmesi', 'Business review', 'Bewertung des Betriebs')}: {averageOf(a.business_review.ratings)}/5</Text>
                {RATING_KEYS.business.map((k) => (
                  <Text key={k.key} style={s.cardMeta}>{L3(lang, k)}: {a.business_review.ratings[k.key]}/5</Text>
                ))}
                {!!a.business_review.comment && <Text style={s.note}>“{a.business_review.comment}”</Text>}
              </View>
            )}
            {(a.offers || []).map((o) => (
              <View key={o.id} style={[s.card, { borderColor: c.gold, borderWidth: 1.5, marginTop: 10 }]}>
                <Text style={s.cardTitle}>💼 {offerTypeName(o.offer_type, lang)}</Text>
                <Text style={[s.note, { color: c.text }]}>{o.details}</Text>
                <Text style={s.cardMeta}>💰 {o.pay_info}</Text>
                <Text style={s.cardMeta}>📋 {o.conditions}</Text>
                {o.status === 'sent' ? (
                  <>
                    <Text style={s.note}>{tx('Karar tamamen senin. Uygulama teklifi asla kendiliğinden kabul etmez.', 'The decision is yours. The app never accepts automatically.', 'Du entscheidest.')}</Text>
                    <Btn kind="gold" label={tx('Kabul Et', 'Accept', 'Annehmen')} busy={busyId === o.id} onPress={() => askRespond(o, true)} />
                    <Btn kind="secondary" label={tx('Reddet', 'Decline', 'Ablehnen')} disabled={busyId === o.id} onPress={() => askRespond(o, false)} />
                  </>
                ) : (
                  <Text style={[s.cardMeta, { fontWeight: '800' }]}>
                    {o.status === 'accepted' ? tx('✅ Kabul ettin', '✅ Accepted', '✅ Angenommen') : o.status === 'declined' ? tx('Reddettin', 'Declined', 'Abgelehnt') : tx('İşletme geri çekti', 'Withdrawn', 'Zurückgezogen')}
                  </Text>
                )}
              </View>
            ))}
            {canCancelApplication(a, sh) && <Btn kind="danger" label={tx('Başvuruyu İptal Et', 'Cancel Application', 'Stornieren')} busy={busyId === a.id} onPress={() => cancel(a)} />}
            {(a.status === 'no_show' || a.status === 'rejected' || a.status === 'completed') && <ReportLink type="application" id={a.id} />}
          </View>
        );
      })}
    </Screen>
  );
};

/* ---------- Vardiya QR'ım ---------- */
const MyShiftQr = ({ application, onBack }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang } = app;
  const [st, setSt] = useState({ state: 'loading', payload: null, expiresAt: null, next: null, code: null });
  const [left, setLeft] = useState(0);
  const busy = useRef(false);
  const make = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSt((cur) => ({ ...cur, state: 'loading' }));
    const res = await api.issueCheckin(application.id);
    busy.current = false;
    if (!res.ok) { setSt({ state: 'error', payload: null, expiresAt: null, next: null, code: res.code }); return; }
    setSt({ state: 'ready', payload: res.data.payload, expiresAt: Date.parse(res.data.expires_at), next: res.data.next_action, code: null });
  }, [api, application.id]);
  useEffect(() => { make(); }, [make]);
  useEffect(() => {
    if (st.state !== 'ready') return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((st.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [st.state, st.expiresAt]);
  const sh = application.shift;
  return (
    <Screen>
      <ScreenHeader title={tx('VARDİYA QR\'IM', 'MY SHIFT QR', 'MEIN SCHICHT-QR')} subtitle={`${sh.title}`} />
      <BackLink onPress={onBack} />
      {st.state === 'loading' && <Loading />}
      {st.state === 'error' && <ErrorCard text={errorText(st.code, lang)} onRetry={make} />}
      {st.state === 'ready' && (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={[s.cardTitle, { fontSize: 17 }]}>{st.next === 'check_in' ? tx('🟢 GİRİŞ KODU', '🟢 CHECK-IN CODE', '🟢 CHECK-IN') : tx('🔴 ÇIKIŞ KODU', '🔴 CHECK-OUT CODE', '🔴 CHECK-OUT')}</Text>
          <Text style={[s.note, { textAlign: 'center', marginBottom: 12 }]}>{tx('Bu kodu işletme yetkilisine okut. Kod tek kullanımlıktır.', 'Let the business staff scan this. Single use.', 'Vom Betrieb scannen lassen. Einmalig.')}</Text>
          {left > 0 ? <QrBox text={st.payload} cell={6} /> : (
            <View style={{ padding: 30 }}><Text style={{ fontSize: 40 }}>⌛</Text></View>
          )}
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '900', color: left > 30 ? c.green : c.red }}>
            {left > 0 ? tx(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} geçerli`, `valid ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, `gültig ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`) : tx('Süresi doldu', 'Expired', 'Abgelaufen')}
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Btn kind={left > 0 ? 'secondary' : 'dark'} label={tx('Yeni Kod Oluştur', 'New Code', 'Neuer Code')} onPress={make} />
          </View>
        </View>
      )}
      <Text style={s.note}>
        {tx(`Kod ${Math.round(IK_TOKEN_SECONDS / 60)} dakika geçerlidir; yeni kod oluşturunca eskisi hemen geçersiz olur. QR okutulması, yasal çalışma kaydının veya sigorta işlemlerinin yapıldığı anlamına GELMEZ; bunlar işletmenin sorumluluğundadır.`, 'The code is valid for 5 minutes. Scanning does NOT mean legal registration or insurance was done; that is the business\'s responsibility.', 'Code 5 Min. gültig. Scannen ersetzt keine gesetzliche Anmeldung.')}
      </Text>
    </Screen>
  );
};

const CandidateReview = ({ application, onBack }) => (
  <RatingForm side="candidate" application={application} onBack={onBack} />
);

/* ---------- Dijital Meslek Pasaportu ---------- */
const Passport = ({ onBack }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang } = app;
  const [st, setSt] = useState({ state: 'loading', data: null, code: null });
  const load = useCallback(async () => {
    const res = await api.passport();
    setSt(res.ok ? { state: 'ready', data: res.data, code: null } : { state: 'error', data: null, code: res.code });
  }, [api]);
  useEffect(() => { load(); }, [load]);
  const d = st.data;
  return (
    <Screen>
      <ScreenHeader title={tx('MESLEK PASAPORTUM', 'MY JOB PASSPORT', 'MEIN BERUFSPASS')} subtitle={tx('Dijital Meslek Pasaportu', 'Digital Job Passport', 'Digitaler Berufspass')} />
      <BackLink onPress={onBack} />
      {st.state === 'loading' && <Loading />}
      {st.state === 'error' && <NotInstalled code={st.code} onRetry={load} />}
      {st.state === 'ready' && d && (
        <>
          <View style={{ backgroundColor: c.dark, borderRadius: 22, padding: 18, marginBottom: 12 }}>
            <Text style={{ color: c.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>BAKPLANLA · {tx('MESLEK PASAPORTU', 'JOB PASSPORT', 'BERUFSPASS')}</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 6 }}>{d.candidate ? d.candidate.display_name : ''}</Text>
            {!!(d.candidate && d.candidate.city) && <Text style={{ color: '#CFE3DC', marginTop: 2 }}>📍 {d.candidate.city}</Text>}
            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <View style={{ marginRight: 24 }}>
                <Text style={{ color: c.gold, fontSize: 22, fontWeight: '900' }}>{(d.badges || []).length}</Text>
                <Text style={{ color: '#CFE3DC', fontSize: 11 }}>{tx('rozet', 'badges', 'Abzeichen')}</Text>
              </View>
              <View>
                <Text style={{ color: c.gold, fontSize: 22, fontWeight: '900' }}>{(d.experiences || []).length}</Text>
                <Text style={{ color: '#CFE3DC', fontSize: 11 }}>{tx('gerçek deneyim', 'real experiences', 'echte Erfahrungen')}</Text>
              </View>
            </View>
          </View>
          <Text style={s.note}>
            {tx('Pasaportunu yalnızca sen görürsün. Bir ilana başvururken "Geçmiş deneyimlerimi paylaş" seçeneğini açarsan yalnızca o işletme özetini görebilir.', 'Only you can see your passport. A business sees a summary only if you choose to share it when applying.', 'Nur du siehst deinen Pass.')}
          </Text>

          <Text style={s.label}>{tx('ROZETLER', 'BADGES', 'ABZEICHEN')}</Text>
          {(d.badges || []).length === 0 && <EmptyBox icon="🏅" title={tx('Henüz rozet yok', 'No badges yet', 'Noch keine Abzeichen')} />}
          {(d.badges || []).map((b) => (
            <View key={b.role} style={s.card}>
              <Text style={s.cardTitle}>{roleIcon(b.role)} {badgeName(b.role, b.best_level, lang)}</Text>
              <Text style={s.cardMeta}>{levelTitle(b.role, b.best_level, lang)} · {tx('en iyi', 'best', 'beste')} {'★'.repeat(b.best_stars || 0)}</Text>
              <Text style={s.cardMeta}>{tx(`${b.verified_shifts} doğrulanmış vardiya · ilk: ${formatDateTime(b.first_at, lang)} · son: ${formatDateTime(b.last_at, lang)}`, `${b.verified_shifts} verified shifts`, `${b.verified_shifts} geprüfte Schichten`)}</Text>
            </View>
          ))}

          <Text style={s.label}>{tx('TAMAMLANAN GERÇEK DENEYİMLER', 'COMPLETED REAL EXPERIENCES', 'ABGESCHLOSSENE ERFAHRUNGEN')}</Text>
          {(d.experiences || []).length === 0 && <EmptyBox icon="🤝" title={tx('Henüz tamamlanan vardiya yok', 'No completed shifts yet', 'Noch keine Schichten')} />}
          {(d.experiences || []).map((e) => (
            <View key={e.application_id} style={s.card}>
              <Text style={s.cardTitle}>{roleIcon(e.role)} {e.title}</Text>
              <Text style={s.cardMeta}>{e.business_name} · {formatDay(e.shift_date, lang)}{e.minutes ? ` · ${durationLabel(e.minutes, lang)}` : ''}</Text>
              {!!e.business_review && <Text style={[s.cardMeta, { color: c.green, fontWeight: '800' }]}>⭐ {tx('İşletme puanı', 'Business rating', 'Bewertung')}: {averageOf(e.business_review)}/5</Text>}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
};
