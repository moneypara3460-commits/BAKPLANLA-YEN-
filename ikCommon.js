/*
  BAKPLANLA İŞ KÖPRÜSÜ — genç ve işletme ekranlarının ORTAK parçaları
  (hesap bilgisi, kurulum uyarısı, bildirimler, şikâyet/itiraz, değerlendirme formu)
*/
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput } from 'react-native';
import { L3, RATING_KEYS, errorText, eventText, formatDateTime, validRatings } from './isKoprusu.js';
import { useIk, BackLink, Field, Btn, Stars, Loading, ErrorCard, EmptyBox, GateCard } from './ikUi.js';

/* ======================= ORTAK: hesap bilgisi ======================= */
export const useMe = () => {
  const { api } = useIk();
  const [me, setMe] = useState({ state: 'loading', data: null, code: null });
  const load = useCallback(async () => {
    setMe((cur) => ({ ...cur, state: cur.data ? 'refreshing' : 'loading' }));
    const res = await api.me();
    setMe(res.ok ? { state: 'ready', data: res.data, code: null } : { state: 'error', data: null, code: res.code });
  }, [api]);
  useEffect(() => { load(); }, [load]);
  return [me, load];
};

export const NotInstalled = ({ code, onRetry }) => {
  const { app } = useIk();
  const { tx, lang } = app;
  if (code === 'not_installed') {
    return (
      <GateCard
        icon="🛠️"
        title={tx('Sunucu kurulumu bekleniyor', 'Server setup pending', 'Server-Einrichtung ausstehend')}
        text={tx('İş Köprüsü\'nün veritabanı fonksiyonları Supabase\'e henüz yüklenmemiş. Bu bir hata değil; yönetici KURULUM-IS-KOPRUSU.md adımlarını tamamlayınca bu ekran açılır.', 'The Job Bridge database functions are not installed in Supabase yet.', 'Die Datenbankfunktionen sind noch nicht installiert.')}
        buttonLabel={tx('Tekrar Kontrol Et', 'Check Again', 'Erneut prüfen')}
        onPress={onRetry}
      />
    );
  }
  return <ErrorCard text={errorText(code, lang)} onRetry={onRetry} />;
};

export const EventsView = ({ onBack }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang } = app;
  const [st, setSt] = useState({ state: 'loading', list: [], code: null });
  const load = useCallback(async () => {
    const res = await api.events();
    setSt(res.ok ? { state: 'ready', list: res.data || [], code: null } : { state: 'error', list: [], code: res.code });
    if (res.ok && (res.data || []).some((e) => !e.read_at)) api.markRead();
  }, [api]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen>
      <ScreenHeader title={tx('Bildirimler', 'Notifications', 'Mitteilungen')} subtitle={tx('İş Köprüsü gelişmeleri', 'Job Bridge updates', 'Job-Brücke-Updates')} />
      <BackLink onPress={onBack} />
      <View style={s.softCard}>
        <Text style={s.note}>
          {tx('Bu bildirimler yalnızca uygulamayı açınca burada görünür. Telefona anlık (push) bildirim altyapısı bu sürümde HENÜZ YOK.', 'These updates show here when you open the app. Push notifications are NOT available in this version yet.', 'Diese Updates erscheinen nur hier. Push-Mitteilungen gibt es in dieser Version noch NICHT.')}
        </Text>
      </View>
      {st.state === 'loading' && <Loading />}
      {st.state === 'error' && <ErrorCard text={errorText(st.code, lang)} onRetry={load} />}
      {st.state === 'ready' && st.list.length === 0 && <EmptyBox icon="🔔" title={tx('Henüz bildirim yok', 'No notifications yet', 'Noch keine Mitteilungen')} />}
      {st.list.map((e) => (
        <View key={String(e.id)} style={[s.card, !e.read_at && { borderColor: c.gold, borderWidth: 1.5 }]}>
          <Text style={{ color: c.text, fontSize: 14 }}>{eventText(e, lang)}</Text>
          <Text style={s.cardMeta}>{formatDateTime(e.created_at, lang)}</Text>
        </View>
      ))}
    </Screen>
  );
};

export const ReportLink = ({ type, id }) => {
  const { app, api } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    if (reason.trim().length < 5) { Alert.alert('BAKPLANLA', errorText('invalid:reason', lang)); return; }
    setBusy(true);
    const res = await api.report(type, id, reason.trim());
    setBusy(false);
    if (!res.ok) { Alert.alert('BAKPLANLA', errorText(res.code, lang)); return; }
    setOpen(false); setReason('');
    showToast(tx('Bildirimin alındı, incelenecek.', 'Report received.', 'Meldung erhalten.'));
  };
  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)} style={{ marginTop: 14, alignSelf: 'center' }}>
        <Text style={[s.link, { color: c.sub }]}>🚩 {tx('Sorun bildir / itiraz et', 'Report a problem / dispute', 'Problem melden')}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>🚩 {tx('Sorun bildir / itiraz et', 'Report / dispute', 'Melden')}</Text>
      <TextInput style={[s.input, s.inputMulti]} value={reason} onChangeText={setReason} multiline maxLength={500} placeholder={tx('Ne oldu? Kısaca yaz.', 'What happened?', 'Was ist passiert?')} placeholderTextColor={c.muted} />
      <Btn kind="danger" label={tx('Gönder', 'Send', 'Senden')} busy={busy} onPress={send} />
      <TouchableOpacity onPress={() => setOpen(false)} style={{ marginTop: 10, alignSelf: 'center' }}><Text style={s.link}>{tx('Vazgeç', 'Cancel', 'Abbrechen')}</Text></TouchableOpacity>
    </View>
  );
};

/* ---------- Değerlendirme formu (side: 'candidate' | 'business') ---------- */
export const RatingForm = ({ side, application, onBack, onDone, title }) => {
  const { app, api, Screen, ScreenHeader } = useIk();
  const { s, c, tx, lang, showToast } = app;
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (busy) return;
    setErr(null);
    if (!validRatings(side, ratings)) { setErr(tx('Lütfen tüm başlıklara 1-5 arası puan ver.', 'Please rate every item 1-5.', 'Bitte alles mit 1-5 bewerten.')); return; }
    setBusy(true);
    const res = await api.review(application.id, side, ratings, comment.trim());
    setBusy(false);
    if (!res.ok) { setErr(errorText(res.code, lang)); return; }
    showToast(tx('Değerlendirmen kaydedildi.', 'Review saved.', 'Bewertung gespeichert.'));
    (onDone || onBack)();
  };
  return (
    <Screen>
      <ScreenHeader title={title || tx('DEĞERLENDİRME', 'REVIEW', 'BEWERTUNG')} subtitle={application.shift ? application.shift.title : ''} />
      <BackLink onPress={onBack} />
      <View style={s.card}>
        {RATING_KEYS[side].map((k) => (
          <View key={k.key} style={{ marginBottom: 10 }}>
            <Text style={s.cardTitle}>{L3(lang, k)}</Text>
            <Stars value={ratings[k.key]} onChange={(n) => setRatings((cur) => ({ ...cur, [k.key]: n }))} />
          </View>
        ))}
        <Field label={tx('YORUM (isteğe bağlı)', 'COMMENT (optional)', 'KOMMENTAR (optional)')} value={comment} onChangeText={setComment} multiline maxLength={500} />
        <Text style={s.note}>
          {tx('Lütfen yalnızca bu vardiyadaki gerçek deneyimini yaz. Kişisel saldırı, ayrımcılık veya özel bilgi içeren yorumlar gizlenir. Değerlendirme gönderildikten sonra değiştirilemez; haksız bulduğun bir değerlendirmeye itiraz edebilirsin.', 'Only write about this shift. Personal attacks, discrimination or private data are hidden. Reviews cannot be edited after sending; you can dispute unfair ones.', 'Nur echte Erfahrung. Bewertungen sind nicht änderbar, aber anfechtbar.')}
        </Text>
        {!!err && <Text style={{ color: c.red, marginTop: 10, fontWeight: '700' }}>{err}</Text>}
        <Btn kind="gold" label={tx('Gönder', 'Submit', 'Senden')} busy={busy} onPress={submit} />
      </View>
    </Screen>
  );
};
