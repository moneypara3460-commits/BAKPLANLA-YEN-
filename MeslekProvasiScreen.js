/*
===========================================================
  BAKPLANLA — MESLEK PROVASI ekranı
  App.js'ten: <MeslekProvasiScreen app={ctx} Screen={Screen} ScreenHeader={ScreenHeader} />
  PUSULA sonucundan setPendingProfession(key) ile doğrudan bir meslek açılabilir.
===========================================================
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadValue, saveValue, pick, getTodayISO } from './helpers';
import { COMPASS_KEY, AREAS, scoreCompass } from './compass';
import {
  PROVA_KEY, SCENE_SECONDS, PROFESSIONS, professionByKey, professionName, primaryArea, matchProfessions,
  takePendingProfession, createProva, currentScene, answerScene, nextScene, isAnswered, summarize,
  normalizeProvaProgress, applyProvaResult, triedCount,
} from './meslekProvasi';

const Dots = ({ n, color, off }) => (
  <View style={{ flexDirection: 'row' }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <View key={i} style={{ width: 7, height: 7, borderRadius: 4, marginRight: 3, backgroundColor: i <= n ? color : off }} />
    ))}
  </View>
);

const StarRow = ({ n, size = 16 }) => (
  <Text style={{ fontSize: size }}>{[1, 2, 3].map((i) => (i <= n ? '⭐' : '☆')).join('')}</Text>
);

export const MeslekProvasiScreen = ({ app, Screen, ScreenHeader }) => {
  const { s, c, tx, lang, navigate, showToast } = app;
  const [view, setView] = useState('list'); // list | intro | play | result
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(normalizeProvaProgress(null));
  const [matches, setMatches] = useState({}); // key -> uyum %
  const [area, setArea] = useState('all');
  const [jobKey, setJobKey] = useState(null);
  const [game, setGame] = useState(null);
  const [msLeft, setMsLeft] = useState(SCENE_SECONDS * 1000);
  const [result, setResult] = useState(null);
  const deadlineRef = useRef(0);

  const job = jobKey ? professionByKey(jobKey) : null;
  const L = (o) => pick(lang, o.tr, o.en, o.de);
  const trOnly = lang !== 'tr';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = normalizeProvaProgress(await loadValue(PROVA_KEY, null));
      const compass = await loadValue(COMPASS_KEY, null);
      if (cancelled) return;
      setProgress(saved);
      const scored = compass && compass.answers ? scoreCompass(compass.answers) : null;
      if (scored && scored.ok) {
        const map = {};
        for (const m of matchProfessions(scored.scores)) map[m.key] = m.match;
        setMatches(map);
      }
      const pending = takePendingProfession();
      if (pending) { setJobKey(pending); setView('intro'); }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Sahne sayacı: yalnızca oyun ekranında ve sahne cevaplanmamışken çalışır.
  const answered = isAnswered(game);
  useEffect(() => {
    if (view !== 'play' || !game || game.finished || answered) return undefined;
    deadlineRef.current = Date.now() + SCENE_SECONDS * 1000;
    setMsLeft(SCENE_SECONDS * 1000);
    const id = setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        clearInterval(id);
        setMsLeft(0);
        setGame((cur) => (cur && !isAnswered(cur) ? answerScene(cur, null, 0) : cur));
      } else {
        setMsLeft(left);
      }
    }, 250);
    return () => clearInterval(id);
  }, [view, game && game.index, answered]);

  const openJob = (p) => {
    if (p.game === 'isbasi') { navigate('isbasi'); return; }
    setJobKey(p.key);
    setView('intro');
  };

  const start = () => {
    const g = createProva(jobKey, Date.now());
    if (!g) return;
    setGame(g);
    setResult(null);
    setView('play');
  };

  const choose = (i) => {
    if (!game || answered) return;
    setGame(answerScene(game, i, Math.max(0, deadlineRef.current - Date.now())));
  };

  const goNext = async () => {
    const g = nextScene(game);
    if (!g.finished) { setGame(g); return; }
    const summary = summarize(g);
    const applied = applyProvaResult(progress, summary, getTodayISO());
    setProgress(applied.progress);
    setGame(g);
    setResult({ summary, xp: applied.xp, newBest: applied.newBest });
    setView('result');
    const ok = await saveValue(PROVA_KEY, applied.progress);
    if (!ok) showToast(tx('İlerleme cihaza kaydedilemedi.', 'Progress could not be saved.', 'Fortschritt konnte nicht gespeichert werden.'));
  };

  const header = (
    <ScreenHeader
      title={tx('MESLEK PROVASI', 'JOB REHEARSAL', 'BERUFSPROBE')}
      subtitle={tx('Mesleği bir vardiya boyunca dene', 'Try a job for one shift', 'Probier einen Beruf eine Schicht lang')}
    />
  );

  const trNote = trOnly ? (
    <Text style={[s.note, { marginBottom: 10 }]}>
      {tx('', 'Note: scenario texts are currently available in Turkish only.', 'Hinweis: Die Szenarien gibt es derzeit nur auf Türkisch.')}
    </Text>
  ) : null;

  if (!loaded) return <Screen>{header}<ActivityIndicator color={c.green} /></Screen>;

  /* ---------------- LİSTE ---------------- */
  if (view === 'list') {
    const tried = triedCount(progress);
    const list = PROFESSIONS
      .filter((p) => area === 'all' || primaryArea(p) === area)
      .slice()
      .sort((a, b) => (matches[b.key] ?? -1) - (matches[a.key] ?? -1));
    const hasMatches = Object.keys(matches).length > 0;
    return (
      <Screen>
        {header}
        <View style={{ backgroundColor: c.dark, borderRadius: 24, padding: 18, marginBottom: 14, overflow: 'hidden' }}>
          <Text style={{ position: 'absolute', right: -10, top: -14, fontSize: 120, opacity: 0.1 }}>🎭</Text>
          <Text style={{ color: c.gold, fontWeight: '900', fontSize: 12, letterSpacing: 2 }}>{tx(`${PROFESSIONS.length} MESLEK`, `${PROFESSIONS.length} JOBS`, `${PROFESSIONS.length} BERUFE`)}</Text>
          <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 20, marginTop: 6 }}>{tx('Hangi işi denemek istersin?', 'Which job do you want to try?', 'Welchen Beruf willst du testen?')}</Text>
          <Text style={{ color: '#CFE3DC', fontSize: 13, marginTop: 6, lineHeight: 19 }}>
            {tx('Her provada o mesleğin gerçek bir gününden 5 durum çıkar. Süre dolmadan doğru kararı ver, mesleğin zorluğunu yaşayarak öğren.',
              'Each rehearsal gives you 5 real situations from that job. Decide before time runs out.',
              'Jede Probe zeigt 5 echte Situationen aus dem Beruf. Entscheide, bevor die Zeit abläuft.')}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            {[['🎯', tried, tx('denendi', 'tried', 'getestet')], ['🕐', progress.plays, tx('prova', 'rehearsals', 'Proben')], ['✨', progress.xp, 'XP']].map(([icon, n, label], i) => (
              <View key={label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 10, alignItems: 'center', marginRight: i < 2 ? 8 : 0 }}>
                <Text style={{ fontSize: 18 }}>{icon}</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18, marginTop: 2 }}>{n}</Text>
                <Text style={{ color: '#CFE3DC', fontSize: 11 }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {!hasMatches && (
          <TouchableOpacity onPress={() => navigate('compass')} style={[s.card, s.row, { marginBottom: 12, borderColor: c.gold, borderWidth: 1.5 }]}>
            <Text style={{ fontSize: 26, marginRight: 12 }}>🧭</Text>
            <View style={s.flex1}>
              <Text style={s.cardTitle}>{tx('Önce PUSULA testini çöz', 'Take the COMPASS test first', 'Mach zuerst den KOMPASS-Test')}</Text>
              <Text style={s.cardMeta}>{tx('Sana en yakın meslekler en üstte, uyum yüzdesiyle görünsün.', 'See the closest jobs first, with a match score.', 'Sieh die passendsten Berufe zuerst.')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.muted} />
          </TouchableOpacity>
        )}

        <View style={[s.chipRow, { marginBottom: 6 }]}>
          {[{ key: 'all', icon: '', tr: 'Tümü', en: 'All', de: 'Alle' }, ...AREAS].map((a) => (
            <TouchableOpacity key={a.key} style={[s.chip, area === a.key && s.chipActive]} onPress={() => setArea(a.key)}>
              <Text style={[s.chipText, area === a.key && s.chipTextActive]}>{a.icon ? `${a.icon} ` : ''}{L(a)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {list.map((p) => {
          const j = progress.jobs[p.key];
          return (
            <TouchableOpacity key={p.key} onPress={() => openJob(p)} activeOpacity={0.85} style={[s.card, s.row, { marginBottom: 10 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 24 }}>{p.icon}</Text>
              </View>
              <View style={s.flex1}>
                <Text style={s.cardTitle}>{professionName(p, lang)}</Text>
                <View style={[s.row, { marginTop: 4 }]}>
                  <Text style={[s.cardMeta, { marginRight: 6 }]}>{tx('Zorluk', 'Difficulty', 'Schwierigkeit')}</Text>
                  <Dots n={p.difficulty} color={c.orange} off={c.chip} />
                  {p.game === 'isbasi' && <Text style={[s.cardMeta, { marginLeft: 6, color: c.green, fontWeight: '800' }]}>{tx('İş Başı oyunu', 'On the Job game', 'Im-Job-Spiel')}</Text>}
                </View>
                {j && j.plays > 0 && <View style={{ marginTop: 4 }}><StarRow n={j.bestStars} size={13} /></View>}
              </View>
              {matches[p.key] !== undefined && (
                <View style={{ alignItems: 'center', marginLeft: 8 }}>
                  <Text style={{ color: c.green, fontWeight: '900', fontSize: 16 }}>%{matches[p.key]}</Text>
                  <Text style={[s.cardMeta, { fontSize: 10 }]}>{tx('uyum', 'match', 'Passung')}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={c.muted} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          );
        })}

        <Text style={[s.note, { marginTop: 6 }]}>
          {tx('Provalar mesleği tanıtmak için sadeleştirilmiştir; mesleki eğitim yerine geçmez. İlerlemen bu cihazda tutulur ve İş Köprüsü\'ndeki meslek pasaportunda görünür.',
            'Rehearsals are simplified introductions, not professional training. Progress stays on this device and appears in your Job Bridge career passport.',
            'Die Proben sind vereinfachte Einführungen, keine Ausbildung. Der Fortschritt bleibt auf dem Gerät und erscheint in deinem Berufspass.')}
        </Text>
      </Screen>
    );
  }

  /* ---------------- TANITIM ---------------- */
  if (view === 'intro' && job) {
    const j = progress.jobs[job.key];
    const rows = [
      ['🗓️', tx('Bir günü nasıl geçer?', 'What a day looks like', 'So sieht ein Tag aus'), job.intro.gun],
      ['⚠️', tx('Zor yanları', 'Hard parts', 'Schwierige Seiten'), job.intro.zor],
      ['🎓', tx('Nasıl olunur?', 'How to get there', 'Wie wird man das?'), job.intro.yol],
    ];
    return (
      <Screen>
        {header}
        <TouchableOpacity onPress={() => setView('list')} style={[s.row, { marginBottom: 10 }]}>
          <Ionicons name="chevron-back" size={18} color={c.green} />
          <Text style={{ color: c.green, fontWeight: '800' }}>{tx('Tüm meslekler', 'All jobs', 'Alle Berufe')}</Text>
        </TouchableOpacity>
        {trNote}
        <View style={s.heroCard}>
          <View style={s.heroIconBox}><Text style={{ fontSize: 30 }}>{job.icon}</Text></View>
          <Text style={s.heroTitle}>{professionName(job, lang)}</Text>
          <View style={[s.row, { marginTop: 6 }]}>
            <Text style={[s.heroDesc, { marginRight: 6 }]}>{tx('Zorluk', 'Difficulty', 'Schwierigkeit')}</Text>
            <Dots n={job.difficulty} color={c.gold} off="rgba(255,255,255,0.25)" />
          </View>
          {matches[job.key] !== undefined && (
            <Text style={[s.heroDesc, { marginTop: 6, fontWeight: '800' }]}>{tx(`PUSULA uyumun: %${matches[job.key]}`, `COMPASS match: ${matches[job.key]}%`, `KOMPASS-Passung: ${matches[job.key]} %`)}</Text>
          )}
          {j && j.plays > 0 && <View style={{ marginTop: 6 }}><StarRow n={j.bestStars} /></View>}
        </View>

        {rows.map(([icon, title, text]) => (
          <View key={title} style={[s.softCard, { marginTop: 10 }]}>
            <Text style={s.cardTitle}>{icon} {title}</Text>
            <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 19 }]}>{text}</Text>
          </View>
        ))}

        {job.game === 'prova' ? (
          <>
            <View style={[s.softCard, { marginTop: 10 }]}>
              <Text style={s.cardTitle}>🎮 {tx('Prova nasıl oynanır?', 'How it works', 'So funktioniert es')}</Text>
              <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 19 }]}>
                {tx(`${job.scenes.length} gerçek iş durumu gelecek. Her biri için ${SCENE_SECONDS} saniyen var. En doğru karar 2 puan, idare eder 1 puan, yanlış ya da süre dolarsa 0 puan. Her cevaptan sonra nedenini öğrenirsin.`,
                  `${job.scenes.length} real situations, ${SCENE_SECONDS} seconds each. Best choice 2 points, okay 1, wrong or timeout 0. You learn why after each answer.`,
                  `${job.scenes.length} echte Situationen, je ${SCENE_SECONDS} Sekunden. Beste Wahl 2 Punkte, okay 1, falsch oder Zeitablauf 0.`)}
              </Text>
            </View>
            <TouchableOpacity style={s.darkBtn} onPress={start}>
              <Text style={s.darkBtnText}>▶ {tx('Provaya Başla', 'Start Rehearsal', 'Probe starten')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={s.darkBtn} onPress={() => navigate('isbasi')}>
            <Text style={s.darkBtnText}>💼 {tx('İş Başı oyununda oyna', 'Play in On the Job', 'Im Im-Job-Spiel spielen')}</Text>
          </TouchableOpacity>
        )}
      </Screen>
    );
  }

  /* ---------------- OYUN ---------------- */
  if (view === 'play' && game && job) {
    const scene = currentScene(game);
    const last = answered ? game.answers[game.index] : null;
    const pct = Math.max(0, Math.min(1, msLeft / (SCENE_SECONDS * 1000)));
    const barColor = pct > 0.5 ? c.green : pct > 0.2 ? c.orange : c.red;
    return (
      <Screen>
        {header}
        <View style={[s.row, { marginBottom: 8 }]}>
          <Text style={[s.cardTitle, s.flex1]}>{job.icon} {professionName(job, lang)}</Text>
          <Text style={[s.cardMeta, { fontWeight: '800' }]}>{tx('Durum', 'Situation', 'Situation')} {game.index + 1}/{game.scenes.length}</Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: c.chip, overflow: 'hidden', marginBottom: 4 }}>
          <View style={{ width: `${(answered ? 0 : pct) * 100}%`, height: 8, backgroundColor: barColor }} />
        </View>
        <Text style={[s.cardMeta, { textAlign: 'right', marginBottom: 10 }]}>{answered ? tx('Cevaplandı', 'Answered', 'Beantwortet') : `${Math.ceil(msLeft / 1000)} sn`}</Text>
        {trNote}

        {scene && (
          <>
            <View style={[s.card, { alignItems: 'center', paddingVertical: 18 }]}>
              <Text style={{ fontSize: 44 }}>{scene.e}</Text>
              <Text style={[s.cardTitle, { textAlign: 'center', marginTop: 10, fontSize: 17, lineHeight: 24 }]}>{scene.q}</Text>
            </View>

            {scene.o.map((opt, i) => {
              const picked = last && last.pick === i;
              const isBest = opt.p === 2;
              let border = c.border;
              let bg = c.card;
              if (answered && isBest) { border = c.green; bg = c.soft; }
              else if (answered && picked) { border = opt.p === 1 ? c.orange : c.red; }
              return (
                <TouchableOpacity
                  key={i}
                  disabled={answered}
                  onPress={() => choose(i)}
                  activeOpacity={0.85}
                  style={{ backgroundColor: bg, borderWidth: 1.5, borderColor: border, borderRadius: 16, padding: 14, marginTop: 10 }}
                >
                  <View style={s.row}>
                    <Text style={[s.flex1, { color: c.text, fontSize: 15, fontWeight: '700', lineHeight: 21 }]}>{opt.t}</Text>
                    {answered && (isBest || picked) && (
                      <Text style={{ fontSize: 18, marginLeft: 8 }}>{isBest ? '✅' : opt.p === 1 ? '🟠' : '❌'}</Text>
                    )}
                  </View>
                  {answered && (isBest || picked) && (
                    <Text style={[s.cardMeta, { marginTop: 6, lineHeight: 19 }]}>{opt.why}</Text>
                  )}
                </TouchableOpacity>
              );
            })}

            {answered && (
              <>
                <Text style={[s.cardTitle, { marginTop: 12, textAlign: 'center', color: last.points === 2 ? c.green : last.points === 1 ? c.orange : c.red }]}>
                  {last.timeout
                    ? tx('⏰ Süre doldu! Gerçek işte de bazen hızlı karar vermek gerekir.', '⏰ Time is up!', '⏰ Zeit abgelaufen!')
                    : last.points === 2 ? tx('Harika karar! +2', 'Great call! +2', 'Super Entscheidung! +2')
                      : last.points === 1 ? tx('İdare eder, daha iyisi var. +1', 'Okay, there is a better way. +1', 'Okay, es geht besser. +1')
                        : tx('Bu yanlış bir karar. +0', 'That was the wrong call. +0', 'Das war falsch. +0')}
                </Text>
                <TouchableOpacity style={s.darkBtn} onPress={goNext}>
                  <Text style={s.darkBtnText}>{game.index + 1 >= game.scenes.length ? tx('Vardiyayı Bitir', 'Finish Shift', 'Schicht beenden') : tx('Sonraki Durum', 'Next Situation', 'Nächste Situation')}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </Screen>
    );
  }

  /* ---------------- SONUÇ ---------------- */
  if (view === 'result' && result && job) {
    const { summary } = result;
    const verdict = summary.stars === 3
      ? tx('Bu işin mantığını çok iyi kavradın. Gerçek hayatta denemeye değer!', 'You really get this job.', 'Du verstehst diesen Beruf sehr gut.')
      : summary.stars === 2
        ? tx('İyi gidiyorsun. Birkaç prova daha yaparsan bu işi iyice öğrenirsin.', 'Good job. A few more rehearsals and you have it.', 'Gut gemacht. Noch ein paar Proben.')
        : tx('Bu meslek düşündüğünden zor olabilir. Nedenleri okuyup tekrar dene ya da başka bir meslek seç.', 'This job may be harder than you thought.', 'Dieser Beruf ist vielleicht schwerer als gedacht.');
    return (
      <Screen>
        {header}
        <View style={s.heroCard}>
          <View style={s.heroIconBox}><Text style={{ fontSize: 30 }}>{job.icon}</Text></View>
          <Text style={s.heroTitle}>{tx('Vardiya bitti!', 'Shift over!', 'Schicht vorbei!')}</Text>
          <View style={{ marginTop: 6 }}><StarRow n={summary.stars} size={26} /></View>
          <Text style={[s.heroDesc, { marginTop: 6 }]}>
            {tx(`${summary.points}/${summary.max} puan · ${summary.best} en doğru karar · +${result.xp} XP`, `${summary.points}/${summary.max} points · +${result.xp} XP`, `${summary.points}/${summary.max} Punkte · +${result.xp} XP`)}
          </Text>
          {result.newBest && <Text style={[s.heroDesc, { marginTop: 4, fontWeight: '800' }]}>🏅 {tx('Yeni rekor!', 'New best!', 'Neuer Rekord!')}</Text>}
        </View>
        <View style={[s.softCard, { marginTop: 10 }]}>
          <Text style={s.cardTitle}>{professionName(job, lang)}</Text>
          <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 19 }]}>{verdict}</Text>
          {summary.timeouts > 0 && (
            <Text style={[s.cardMeta, { marginTop: 4 }]}>{tx(`${summary.timeouts} durumda süre doldu.`, `${summary.timeouts} timeouts.`, `${summary.timeouts}× Zeit abgelaufen.`)}</Text>
          )}
        </View>
        <TouchableOpacity style={s.darkBtn} onPress={start}>
          <Text style={s.darkBtnText}>🔁 {tx('Tekrar Oyna', 'Play Again', 'Nochmal spielen')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryBtn} onPress={() => setView('list')}>
          <Text style={s.secondaryBtnText}>🎭 {tx('Başka Bir Meslek Dene', 'Try Another Job', 'Anderen Beruf testen')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryBtn} onPress={() => navigate('compass')}>
          <Text style={s.secondaryBtnText}>🧭 {tx("PUSULA'ya Dön", 'Back to COMPASS', 'Zurück zum KOMPASS')}</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  // Beklenmeyen durum: listeye dön.
  return (
    <Screen>
      {header}
      <TouchableOpacity style={s.darkBtn} onPress={() => setView('list')}>
        <Text style={s.darkBtnText}>{tx('Meslek listesine dön', 'Back to job list', 'Zur Berufsliste')}</Text>
      </TouchableOpacity>
    </Screen>
  );
};
