/*
===========================================================
  BAKPLANLA — PROMOSYON KODU ekranı
  App.js'ten: <PromoKodScreen app={ctx} supabase={supabase} Screen={Screen} ScreenHeader={ScreenHeader} />
  Kod, kişinin e-postasına bağlıdır; kontrolü sunucu yapar (promo.js → redeem_promo_code).
===========================================================
*/
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { redeemPromo, promoErrorText, formatPromoInput, looksLikePromo } from './promo';

const formatDate = (iso, lang) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const locale = lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : lang === 'ar' ? 'ar' : 'tr-TR';
  try {
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
};

export const PromoKodScreen = ({ app, supabase, Screen, ScreenHeader }) => {
  const { s, c, tx, lang, session, setShowAuthModal, refreshEntitlement, proActive, proInfo, showToast } = app;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null); // { until, already }

  const signedIn = !!session?.user?.id;
  const ready = looksLikePromo(code) && !busy;

  const submit = async () => {
    if (!ready) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await redeemPromo(supabase, code);
    setBusy(false);
    if (res.ok) {
      setSuccess({ until: res.until, already: res.already });
      setCode('');
      await refreshEntitlement();
      if (showToast) showToast(tx('BAKPLANLA Pro açıldı', 'BAKPLANLA Pro unlocked', 'BAKPLANLA Pro freigeschaltet'));
    } else {
      setError(res.error);
    }
  };

  const untilText = (until) =>
    until
      ? tx(`${formatDate(until, lang)} tarihine kadar geçerli.`, `Valid until ${formatDate(until, lang)}.`, `Gültig bis ${formatDate(until, lang)}.`)
      : tx('Süresiz geçerli.', 'Valid with no end date.', 'Unbegrenzt gültig.');

  return (
    <Screen>
      <ScreenHeader
        title={tx('Promosyon Kodu', 'Promo Code', 'Aktionscode')}
        subtitle={tx('Sana verilen kodla Pro’yu ücretsiz aç', 'Unlock Pro for free with your code', 'Schalte Pro mit deinem Code kostenlos frei')}
      />

      {proActive && (
        <View style={[s.softCard, { flexDirection: 'row', alignItems: 'center' }]}>
          <Ionicons name="ribbon-outline" size={26} color={c.green} style={{ marginRight: 12 }} />
          <View style={s.flex1}>
            <Text style={s.cardTitle}>{tx('BAKPLANLA Pro aktif', 'BAKPLANLA Pro is active', 'BAKPLANLA Pro ist aktiv')}</Text>
            <Text style={s.cardMeta}>{untilText(proInfo.periodEnd)}</Text>
          </View>
        </View>
      )}

      {!signedIn ? (
        <View style={s.softCard}>
          <Text style={s.cardTitle}>{tx('Önce giriş yap', 'Sign in first', 'Bitte zuerst anmelden')}</Text>
          <Text style={s.cardMeta}>
            {tx('Promosyon kodu kişiye özeldir ve hesabına bağlanır. Kodu kullanmak için, kodun verildiği e-posta ile giriş yapmalısın.', 'Promo codes are personal and are linked to your account. Sign in with the e-mail the code was given for.', 'Aktionscodes sind persönlich und an dein Konto gebunden. Melde dich mit der E-Mail an, für die der Code erstellt wurde.')}
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setShowAuthModal(true)}>
            <Text style={s.primaryBtnText}>{tx('Giriş Yap', 'Sign In', 'Anmelden')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={s.label}>{tx('KODUN', 'YOUR CODE', 'DEIN CODE')}</Text>
          <TextInput
            style={[s.input, { fontSize: 18, letterSpacing: 1.5, fontWeight: '700' }]}
            value={code}
            onChangeText={(t) => { setCode(formatPromoInput(t)); setError(null); }}
            placeholder={tx('Kodunu yaz (örn. DENIZ2026)', 'Enter your code (e.g. DENIZ2026)', 'Code eingeben (z. B. DENIZ2026)')}
            placeholderTextColor={c.sub}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!busy}
          />
          <Text style={[s.cardMeta, { marginTop: 8 }]}>
            {tx(`Bu kod yalnızca ${session.user.email} hesabı için verildiyse çalışır.`, `This code only works if it was given for ${session.user.email}.`, `Dieser Code funktioniert nur, wenn er für ${session.user.email} erstellt wurde.`)}
          </Text>

          <TouchableOpacity style={[s.primaryBtn, !ready && { opacity: 0.5 }]} onPress={submit} disabled={!ready}>
            {busy
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={s.primaryBtnText}>{tx('Kodu Kullan', 'Redeem Code', 'Code einlösen')}</Text>}
          </TouchableOpacity>

          {error && (
            <View style={[s.softCard, { marginTop: 14, flexDirection: 'row', alignItems: 'flex-start' }]}>
              <Ionicons name="alert-circle-outline" size={22} color="#C2410C" style={{ marginRight: 10, marginTop: 1 }} />
              <Text style={[s.cardMeta, { flex: 1, marginTop: 0, color: '#C2410C', fontSize: 13 }]}>{promoErrorText(tx, error)}</Text>
            </View>
          )}

          {success && (
            <View style={[s.softCard, { marginTop: 14, flexDirection: 'row', alignItems: 'flex-start' }]}>
              <Ionicons name="checkmark-circle-outline" size={22} color={c.green} style={{ marginRight: 10, marginTop: 1 }} />
              <View style={s.flex1}>
                <Text style={s.cardTitle}>
                  {success.already
                    ? tx('Bu kodu zaten kullanmıştın', 'You already used this code', 'Du hast diesen Code bereits eingelöst')
                    : tx('Kod kabul edildi, Pro açıldı!', 'Code accepted, Pro unlocked!', 'Code akzeptiert, Pro freigeschaltet!')}
                </Text>
                <Text style={s.cardMeta}>{untilText(success.until)}</Text>
              </View>
            </View>
          )}
        </>
      )}
    </Screen>
  );
};
