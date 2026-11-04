/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — Meslek Pasaportu + İşletme Tanıtımı ekranı
  App.js'ten: <MeslekPasaportuScreen app={ctx} Screen={Screen} ScreenHeader={ScreenHeader} />

  - Eşleştirme YOK: ilan, başvuru düğmesi, işletmenin aday görmesi, onay, teklif yok.
  - Pasaport cihazdaki kayıtlardan hazırlanır; "Paylaş" ile kullanıcı kendisi gönderir.
  - İşletmeler yalnızca tanıtım kartı + kendi kariyer sayfası bağlantısıyla görünür.
===========================================================
*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Share, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadValue, getTodayISO } from './helpers';
import { COMPASS_KEY, AREAS } from './compass';
import { PROVA_KEY, professionByKey, professionName } from './meslekProvasi';
import { ISBASI_KEY, ROLES } from './isbasi';
import { buildPassport, passportText } from './meslekPasaportu';
import { validIsletmeler, isletmeText, isWebUrl, isletmeUrl } from './isletmeTanitim';
import { getDiscountCode, discountErrorText, formatCode, istanbulHHMM, kasaLink } from './isletmeIndirim';
import { createQrMatrix } from './qrcode';
import { pickByLang } from './arabic';
import { OnayliIsletmeler } from './IsletmeTanitScreen'; // 25 Ekim: onaylı başvurular + İşletmeni Tanıt kutusu

// isbasiApi.js'teki anahtarla aynı (o dosya ağ kodu içerdiği için buraya doğrudan yazıldı).
const ISBASI_SERVER_CACHE_KEY = 'BAKPLANLA_ISBASI_SERVER_CACHE';

const QrView = ({ text, cell = 5 }) => {
  const qr = useMemo(() => (text ? createQrMatrix(text) : null), [text]);
  if (!qr || !qr.ok) return null;
  return (
    <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 14, alignSelf: 'center' }}>
      {qr.matrix.map((row, r) => (
        <View key={`r${r}`} style={{ flexDirection: 'row' }}>
          {row.map((dark, col) => <View key={`c${col}`} style={{ width: cell, height: cell, backgroundColor: dark ? '#0A3D33' : '#FFFFFF' }} />)}
        </View>
      ))}
    </View>
  );
};

const StarRow = ({ n, size = 14 }) => (
  <Text style={{ fontSize: size }}>{[1, 2, 3].map((i) => (i <= n ? '⭐' : '☆')).join('')}</Text>
);

export const MeslekPasaportuScreen = ({ app, supabase, Screen, ScreenHeader }) => {
  const { s, c, tx, lang, navigate, userName, session, setShowAuthModal } = app;
  const [disc, setDisc] = useState({}); // işletme id → { loading, result }

  const askDiscount = async (biz) => {
    const id = biz.id;
    setDisc((d) => ({ ...d, [id]: { loading: true, result: d[id] ? d[id].result : null } }));
    const result = session ? await getDiscountCode(supabase, biz.indirim.partnerId) : { ok: false, error: 'auth' };
    setDisc((d) => ({ ...d, [id]: { loading: false, result } }));
  };
  const [loaded, setLoaded] = useState(false);
  const [passport, setPassport] = useState(null);
  const [tab, setTab] = useState('passport'); // passport | business

  const name = userName || (session?.user?.email ? session.user.email.split('@')[0] : '');
  const L = (o) => (o ? pickByLang(o, lang) : '');

  const load = useCallback(async () => {
    const [compass, prova, local, cache] = await Promise.all([
      loadValue(COMPASS_KEY, null),
      loadValue(PROVA_KEY, null),
      loadValue(ISBASI_KEY, null),
      loadValue(ISBASI_SERVER_CACHE_KEY, null),
    ]);
    const verified = !!(cache && cache.progress);
    setPassport(buildPassport({ compass, prova, isbasi: verified ? cache.progress : local, verified }));
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sharePassport = async () => {
    if (!passport || passport.empty) return;
    try {
      await Share.share({
        title: tx('Meslek Pasaportum', 'My Career Passport', 'Mein Berufspass'),
        message: passportText(passport, { name, dateISO: getTodayISO(), lang }),
      });
    } catch (e) {
      Alert.alert(tx('Paylaşılamadı', 'Could not share', 'Teilen fehlgeschlagen'), tx('Telefonun paylaşma penceresi açılamadı.', 'The share sheet could not be opened.', 'Teilen-Fenster konnte nicht geöffnet werden.'));
    }
  };

  const openCareer = (biz) => {
    const url = isletmeUrl(biz);
    if (!isWebUrl(url)) return;
    Alert.alert(
      tx('Dış siteye gidiyorsun', 'Leaving the app', 'Externe Seite'),
      biz.baglanti === 'kariyer'
        ? tx(`${biz.ad} kendi kariyer sayfasında açılacak. Başvuru ve bilgi paylaşımı tamamen o sitede, senin kararınla olur; BAKPLANLA bu süreçte yer almaz.`,
          `${biz.ad}'s own careers page will open. Any application happens on that site, by your choice; BAKPLANLA is not involved.`,
          `Die Karriereseite von ${biz.ad} wird geöffnet. Eine Bewerbung erfolgt nur dort und nach deiner Entscheidung; BAKPLANLA ist nicht beteiligt.`)
        : tx(`${biz.ad} işletmesinin kendi web sitesi açılacak. O sitedeki içerik ve işlemlerden BAKPLANLA sorumlu değildir.`,
          `${biz.ad}'s own website will open. BAKPLANLA is not responsible for that site.`,
          `Die Website von ${biz.ad} wird geöffnet. BAKPLANLA ist für diese Seite nicht verantwortlich.`),
      [
        { text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' },
        { text: tx('Aç', 'Open', 'Öffnen'), onPress: () => Linking.openURL(url.trim()).catch(() => {}) },
      ],
    );
  };

  const header = (
    <ScreenHeader
      title={tx('İŞ KÖPRÜSÜ', 'JOB BRIDGE', 'JOB-BRÜCKE')}
      subtitle={tx('Oyundan gerçek hayata, deneyimden işe.', 'From the game to real life, from experience to work.', 'Vom Spiel ins echte Leben.')}
    />
  );

  if (!loaded) return <Screen>{header}<ActivityIndicator color={c.green} /></Screen>;

  const p = passport;
  const businesses = validIsletmeler();

  const tabs = (
    <View style={[s.chipRow, { marginBottom: 8 }]}>
      {[['passport', '🪪', tx('Meslek Pasaportum', 'My Passport', 'Mein Pass')], ['business', '🏪', tx('İşletmeler', 'Businesses', 'Betriebe')]].map(([key, icon, label]) => (
        <TouchableOpacity key={key} style={[s.chip, tab === key && s.chipActive]} onPress={() => setTab(key)}>
          <Text style={[s.chipText, tab === key && s.chipTextActive]}>{icon} {label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  /* ---------------- İŞLETMELER ---------------- */
  if (tab === 'business') {
    return (
      <Screen>
        {header}
        {tabs}
        <View style={[s.softCard, { marginBottom: 12 }]}>
          <Text style={s.cardTitle}>ℹ️ {tx('Bu bölüm nasıl çalışır?', 'How this works', 'So funktioniert es')}</Text>
          <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 19 }]}>
            {tx('Burada BAKPLANLA ile anlaşmalı işletmelerin tanıtımı yer alır. BAKPLANLA iş ilanı yayınlamaz, başvuru almaz ve seni işletmeyle eşleştirmez. İlgini çeken bir işletme olursa onun kendi kariyer sayfasına gidebilir, istersen meslek pasaportunu kendin gönderebilirsin.',
              'Here you see partner businesses. BAKPLANLA does not publish job ads, take applications or match you with employers. If one interests you, visit its own careers page and, if you wish, send your passport yourself.',
              'Hier siehst du Partnerbetriebe. BAKPLANLA veröffentlicht keine Stellen, nimmt keine Bewerbungen an und vermittelt nicht. Besuche bei Interesse die Karriereseite des Betriebs und sende deinen Pass selbst.')}
          </Text>
        </View>

        {businesses.length === 0 && (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 22 }]}>
            <Text style={{ fontSize: 34 }}>🏪</Text>
            <Text style={[s.cardTitle, { marginTop: 8, textAlign: 'center' }]}>{tx('Henüz tanıtılan işletme yok', 'No businesses yet', 'Noch keine Betriebe')}</Text>
            <Text style={[s.cardMeta, { marginTop: 4, textAlign: 'center', lineHeight: 19 }]}>
              {tx('Anlaşmalı işletmeler eklendikçe burada görünecek. Bu sırada meslek pasaportunu doldurmaya devam edebilirsin.',
                'Partner businesses will appear here. Meanwhile, keep building your passport.',
                'Partnerbetriebe erscheinen hier. Bis dahin kannst du deinen Pass weiter füllen.')}
            </Text>
            <TouchableOpacity style={[s.secondaryBtn, { alignSelf: 'stretch' }]} onPress={() => setTab('passport')}>
              <Text style={s.secondaryBtnText}>🪪 {tx('Pasaportuma Dön', 'Back to my passport', 'Zurück zum Pass')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {businesses.map((b) => (
          <View key={b.id} style={[s.card, { marginBottom: 10 }]}>
            <View style={s.row}>
              {!!b.demo && (
                <View style={{ backgroundColor: '#E5534B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>DEMO</Text>
                </View>
              )}
              <Text style={[s.cardTitle, s.flex1]}>{b.ad}</Text>
            </View>
            <Text style={[s.cardMeta, { marginTop: 2 }]}>{[isletmeText(b.sektor, lang), b.sehir].filter(Boolean).join(' · ')}</Text>
            {!!isletmeText(b.tanitim, lang) && <Text style={[s.cardMeta, { marginTop: 6, lineHeight: 19 }]}>{isletmeText(b.tanitim, lang)}</Text>}
            {Array.isArray(b.meslekler) && b.meslekler.length > 0 && (
              <Text style={[s.cardMeta, { marginTop: 6 }]}>
                {tx('İlgili meslekler: ', 'Related jobs: ', 'Passende Berufe: ')}
                {b.meslekler.map((k) => (ROLES[k] ? L(ROLES[k]) : professionByKey(k) ? professionName(professionByKey(k), lang) : k)).join(', ')}
              </Text>
            )}
            {!!b.adres && (
              <TouchableOpacity disabled={!isWebUrl(b.haritaUrl)} onPress={() => Linking.openURL(b.haritaUrl).catch(() => {})} style={[s.row, { marginTop: 8, alignItems: 'flex-start' }]}>
                <Ionicons name="location-outline" size={16} color={c.green} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={[s.cardMeta, s.flex1, { lineHeight: 18 }]}>{b.adres}</Text>
              </TouchableOpacity>
            )}

            {!!b.indirim && (() => {
              const st = disc[b.id] || {};
              const r = st.result;
              return (
                <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1.5, borderColor: c.gold, padding: 12 }}>
                  <Text style={s.cardTitle}>☕ {isletmeText(b.indirim.baslik, lang)}</Text>
                  <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 18 }]}>
                    {tx(`BAKPLANLA kullanıcılarına özel · her gün ${b.indirim.saat} · günde 1 kez · tek kullanımlık kod`,
                      `For BAKPLANLA users · daily ${b.indirim.saat} · once a day · single-use code`,
                      `Für BAKPLANLA-Nutzer · täglich ${b.indirim.saat} · 1× pro Tag · Einmalcode`)}
                  </Text>

                  {r && r.ok ? (
                    <View style={{ marginTop: 12, alignItems: 'center' }}>
                      <Text style={[s.cardMeta, { fontWeight: '800' }]}>{tx('BUGÜNKÜ İNDİRİM KODUN', "TODAY'S CODE", 'DEIN HEUTIGER CODE')}</Text>
                      <Text style={{ fontSize: 34, fontWeight: '900', letterSpacing: 4, color: c.green, marginVertical: 6 }}>{formatCode(r.code)}</Text>
                      <QrView text={kasaLink(b.indirim.partnerId, r.code)} />
                      <Text style={[s.cardMeta, { marginTop: 8, textAlign: 'center', lineHeight: 18 }]}>
                        {tx(`Bugün ${istanbulHHMM(r.expiresAt) || '22:00'}'a kadar geçerli. Kasada bu ekranı göster; kasiyer QR'ı okutur ya da kodu yazar. Kod bir kez kullanılır.`,
                          `Valid today until ${istanbulHHMM(r.expiresAt) || '22:00'}. Show this screen at the till; the cashier scans the QR or types the code. Single use.`,
                          `Heute gültig bis ${istanbulHHMM(r.expiresAt) || '22:00'}. Zeige diesen Bildschirm an der Kasse. Nur einmal gültig.`)}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {r && !r.ok && <Text style={{ color: r.error === 'used_today' || r.error === 'closed' ? c.muted : c.red, fontSize: 13, fontWeight: '700', marginTop: 10, lineHeight: 18 }}>{discountErrorText(tx, r)}</Text>}
                      {r && r.error === 'auth' ? (
                        <TouchableOpacity style={[s.darkBtn, { marginTop: 10 }]} onPress={() => setShowAuthModal && setShowAuthModal(true)}>
                          <Text style={s.darkBtnText}>{tx('Giriş Yap', 'Sign in', 'Anmelden')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={[s.goldBtn, { marginTop: 10 }, st.loading && { opacity: 0.6 }]} disabled={!!st.loading} onPress={() => askDiscount(b)}>
                          {st.loading
                            ? <ActivityIndicator color="#0A3D33" />
                            : <Text style={[s.goldBtnText, { marginLeft: 0 }]}>🎟️ {tx('Bugünkü İndirim Kodumu Al', "Get today's discount code", 'Heutigen Rabattcode holen')}</Text>}
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity style={[s.secondaryBtn, { marginTop: 10 }]} onPress={() => openCareer(b)}>
              <Text style={s.secondaryBtnText}>🔗 {b.baglanti === 'kariyer' ? tx('Kariyer Sayfasını Aç', 'Open careers page', 'Karriereseite öffnen') : tx('Web Sitesini Aç', 'Open website', 'Website öffnen')}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <OnayliIsletmeler app={app} supabase={supabase} />
      </Screen>
    );
  }

  /* ---------------- PASAPORT ---------------- */
  return (
    <Screen>
      {header}
      {tabs}

      <View style={{ backgroundColor: c.dark, borderRadius: 24, padding: 18, marginBottom: 14, overflow: 'hidden' }}>
        <Text style={{ position: 'absolute', right: -8, top: -12, fontSize: 116, opacity: 0.1 }}>🪪</Text>
        <Text style={{ color: c.gold, fontWeight: '900', fontSize: 12, letterSpacing: 2 }}>{tx('MESLEK PASAPORTU', 'CAREER PASSPORT', 'BERUFSPASS')}</Text>
        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 20, marginTop: 6 }}>{name || tx('Pasaportun', 'Your passport', 'Dein Pass')}</Text>
        <Text style={{ color: '#CFE3DC', fontSize: 13, marginTop: 6, lineHeight: 19 }}>
          {tx('PUSULA sonucun, Meslek Provası puanların ve İş Başı rozetlerin tek sayfada. Kime göstereceğine sen karar verirsin.',
            'Your COMPASS result, rehearsal scores and On the Job badges on one page. You decide who sees it.',
            'Dein KOMPASS-Ergebnis, Probenpunkte und Abzeichen auf einer Seite. Du entscheidest, wer ihn sieht.')}
        </Text>
        {!p.empty && (
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            {[['🎯', p.provaJobs.length + p.isbasiRoles.length, tx('meslek denendi', 'jobs tried', 'Berufe getestet')], ['🏅', p.achievements.length, tx('başarım', 'achievements', 'Erfolge')], ['✨', p.xp, 'XP']].map(([icon, n, label], i) => (
              <View key={label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 10, alignItems: 'center', marginRight: i < 2 ? 8 : 0 }}>
                <Text style={{ fontSize: 18 }}>{icon}</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18, marginTop: 2 }}>{n}</Text>
                <Text style={{ color: '#CFE3DC', fontSize: 11 }}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {p.empty && (
        <View style={[s.card, { marginBottom: 12 }]}>
          <Text style={s.cardTitle}>{tx('Pasaportun henüz boş', 'Your passport is empty', 'Dein Pass ist noch leer')}</Text>
          <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 19 }]}>
            {tx('PUSULA testini çöz ya da bir meslek dene; sonuçların burada kendiliğinden görünür.', 'Take the COMPASS test or try a job; results appear here automatically.', 'Mach den KOMPASS-Test oder probiere einen Beruf; Ergebnisse erscheinen hier.')}
          </Text>
        </View>
      )}

      {/* PUSULA */}
      <View style={[s.card, { marginBottom: 10 }]}>
        <Text style={s.cardTitle}>🧭 PUSULA</Text>
        {p.compassOk ? (
          <>
            {p.topAreas.map((a) => {
              const area = AREAS.find((x) => x.key === a.key);
              return (
                <View key={a.key} style={{ marginTop: 8 }}>
                  <View style={s.row}>
                    <Text style={[s.cardMeta, s.flex1]}>{area ? `${area.icon} ${L(area)}` : a.key}</Text>
                    <Text style={[s.cardMeta, { color: c.green, fontWeight: '900' }]}>{a.score}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.chip, overflow: 'hidden', marginTop: 4 }}>
                    <View style={{ width: `${a.score}%`, height: 6, backgroundColor: c.green }} />
                  </View>
                </View>
              );
            })}
            {p.best && professionByKey(p.best.key) && (
              <Text style={[s.cardMeta, { marginTop: 10, fontWeight: '800' }]}>
                {tx('Sana en yakın meslek: ', 'Closest job: ', 'Passendster Beruf: ')}
                {professionByKey(p.best.key).icon} {professionName(professionByKey(p.best.key), lang)} · %{p.best.match}
              </Text>
            )}
          </>
        ) : (
          <TouchableOpacity onPress={() => navigate('compass')} style={[s.row, { marginTop: 8 }]}>
            <Text style={[s.cardMeta, s.flex1]}>{tx('Henüz çözülmedi. Teste başla', 'Not taken yet. Start the test', 'Noch nicht gemacht. Test starten')}</Text>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* MESLEK PROVASI */}
      <View style={[s.card, { marginBottom: 10 }]}>
        <Text style={s.cardTitle}>🎭 {tx('Meslek Provası', 'Job Rehearsal', 'Berufsprobe')} · {p.provaJobs.length}/{p.provaTotal}</Text>
        {p.provaJobs.length ? p.provaJobs.map((j) => {
          const job = professionByKey(j.key);
          return (
            <View key={j.key} style={[s.row, { marginTop: 8 }]}>
              <Text style={[s.cardMeta, s.flex1]}>{j.icon} {job ? professionName(job, lang) : j.key}</Text>
              <StarRow n={j.stars} size={12} />
              <Text style={[s.cardMeta, { marginLeft: 6, minWidth: 44, textAlign: 'right' }]}>{j.points}/{j.max}</Text>
            </View>
          );
        }) : (
          <TouchableOpacity onPress={() => navigate('prova')} style={[s.row, { marginTop: 8 }]}>
            <Text style={[s.cardMeta, s.flex1]}>{tx('Henüz meslek denemedin. Provaya git', 'No jobs tried yet. Go to rehearsals', 'Noch kein Beruf getestet. Zur Probe')}</Text>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* İŞ BAŞI */}
      <View style={[s.card, { marginBottom: 10 }]}>
        <Text style={s.cardTitle}>💼 {tx('İş Başı', 'On the Job', 'Im Job')}</Text>
        {p.isbasiRoles.length ? (
          <>
            {p.isbasiRoles.map((r) => (
              <View key={r.key} style={[s.row, { marginTop: 8 }]}>
                <Text style={[s.cardMeta, s.flex1]}>{r.icon} {ROLES[r.key] ? L(ROLES[r.key]) : r.key}</Text>
                <Text style={[s.cardMeta, { marginRight: 6 }]}>
                  {r.topLevel ? tx(`Seviye ${r.topLevel}/${r.maxLevel}`, `Level ${r.topLevel}/${r.maxLevel}`, `Stufe ${r.topLevel}/${r.maxLevel}`) : tx('başladı', 'started', 'begonnen')}
                </Text>
                <StarRow n={r.bestStars} size={12} />
              </View>
            ))}
            {p.achievements.length > 0 && (
              <Text style={[s.cardMeta, { marginTop: 10, lineHeight: 20 }]}>
                {tx('Başarımlar: ', 'Achievements: ', 'Erfolge: ')}
                {p.achievements.map((a) => `${a.icon} ${pickByLang(a, lang)[0]}`).join('  ')}
              </Text>
            )}
            <Text style={[s.cardMeta, { marginTop: 6 }]}>
              {tx('Oyuncu seviyesi: ', 'Player level: ', 'Spielerstufe: ')}{p.player.level} ({L(p.player.title)})
            </Text>
            <Text style={[s.note, { marginTop: 6 }]}>
              {p.isbasiVerified
                ? tx('İş Başı sonuçları sunucuda doğrulanmış kayıttan alındı.', 'On the Job results come from the server-verified record.', 'Ergebnisse aus dem serverseitig geprüften Datensatz.')
                : tx('İş Başı sonuçları bu cihazdaki kayıttan alındı.', 'On the Job results come from this device.', 'Ergebnisse von diesem Gerät.')}
            </Text>
          </>
        ) : (
          <TouchableOpacity onPress={() => navigate('isbasi')} style={[s.row, { marginTop: 8 }]}>
            <Text style={[s.cardMeta, s.flex1]}>{tx('Henüz vardiya yok. İş Başı\'na git', 'No shifts yet. Go to On the Job', 'Noch keine Schicht. Zu Im Job')}</Text>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={[s.darkBtn, p.empty && { opacity: 0.5 }]} disabled={p.empty} onPress={sharePassport}>
        <Text style={s.darkBtnText}>📤 {tx('Pasaportumu Paylaş', 'Share my passport', 'Pass teilen')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.secondaryBtn} onPress={() => setTab('business')}>
        <Text style={s.secondaryBtnText}>🏪 {tx('İşletmeleri Gör', 'See businesses', 'Betriebe ansehen')}</Text>
      </TouchableOpacity>

      <Text style={[s.note, { marginTop: 14 }]}>
        {tx('Pasaport, bu cihazdaki oyun ve test kayıtlarından hazırlanır; BAKPLANLA bunu kimseye göndermez. "Paylaş" dediğinde metni hangi uygulamayla ve kime göndereceğini sen seçersin. Bu belge resmî sertifika, diploma ya da mesleki yeterlilik belgesi değildir.',
          'The passport is built from game and test records on this device; BAKPLANLA does not send it anywhere. When you tap Share, you choose the app and the recipient. It is not an official certificate or qualification.',
          'Der Pass entsteht aus Spiel- und Testdaten auf diesem Gerät; BAKPLANLA sendet ihn nirgendwohin. Beim Teilen wählst du App und Empfänger. Er ist kein offizielles Zertifikat.')}
      </Text>
    </Screen>
  );
};
