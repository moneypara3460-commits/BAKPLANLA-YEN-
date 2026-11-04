/*
===========================================================
  BAKPLANLA — İŞLETMENİ TANIT (25 Ekim)
  App.js'ten: <IsletmeTanitScreen app={ctx} supabase={supabase} supabaseUrl={SUPABASE_URL}
                publishableKey={SUPABASE_PUBLISHABLE_KEY} Screen={Screen} ScreenHeader={ScreenHeader} />

  - İşletme sahibi formu doldurur → Edge Function "isletme-basvuru" kaydeder ve
    bakplanla.destek@gmail.com'a bildirim maili atar.
  - Onay elle verilir (Supabase'te status = 'approved'). Onaylananlar İş Köprüsü → İşletmeler'de görünür.
  - Şimdilik ÜCRETSİZ. Ücretli paket (Google Play aboneliği) vergi konusu netleşince eklenecek.
  - Telefon ve e-posta yalnızca BAKPLANLA yönetimine gider; uygulamada kimseye gösterilmez.
===========================================================
*/
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Keyboard, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIVACY_URL = 'https://moneypara3460-commits.github.io/bakplanla-yasal/gizlilik.html';

const CATEGORIES = [
  { key: 'Kafe', tr: 'Kafe', en: 'Café', de: 'Café' },
  { key: 'Restoran', tr: 'Restoran', en: 'Restaurant', de: 'Restaurant' },
  { key: 'Market', tr: 'Market', en: 'Market', de: 'Markt' },
  { key: 'Kuaför / Güzellik', tr: 'Kuaför / Güzellik', en: 'Hair / Beauty', de: 'Friseur / Beauty' },
  { key: 'Mağaza', tr: 'Mağaza', en: 'Store', de: 'Geschäft' },
  { key: 'Hizmet', tr: 'Hizmet', en: 'Service', de: 'Dienstleistung' },
  { key: 'Diğer', tr: 'Diğer', en: 'Other', de: 'Sonstiges' },
];

const EMPTY = {
  businessName: '', category: '', contactName: '', phone: '', email: '',
  district: '', address: '', website: '', instagram: '', description: '', offer: '',
};

const STATUS = {
  pending: { icon: '⏳', tr: 'İnceleniyor', en: 'Under review', de: 'Wird geprüft' },
  approved: { icon: '✅', tr: 'Onaylandı — İşletmeler bölümünde görünüyor', en: 'Approved — visible under Businesses', de: 'Freigegeben — sichtbar unter Betriebe' },
  rejected: { icon: '✖️', tr: 'Onaylanmadı', en: 'Not approved', de: 'Nicht freigegeben' },
};

export const IsletmeTanitScreen = ({ app, supabase, supabaseUrl, publishableKey, Screen, ScreenHeader }) => {
  const { s, c, tx, lang, session, setShowAuthModal, navigate } = app;
  const [form, setForm] = useState({ ...EMPTY, email: session?.user?.email || '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState([]);

  const signedIn = !!session?.user?.id;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const L = (o) => (lang === 'en' ? o.en : lang === 'de' ? o.de : o.tr);

  const loadMine = useCallback(async () => {
    if (!signedIn || !supabase) return;
    try {
      const { data } = await supabase
        .from('bakplanla_business_requests')
        .select('id, business_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (Array.isArray(data)) setMine(data);
    } catch (e) {
      // liste gösterilemezse form yine çalışır
    }
  }, [signedIn, supabase]);

  useEffect(() => { loadMine(); }, [loadMine]);

  const digits = form.phone.replace(/\D/g, '');
  const missing = [];
  if (form.businessName.trim().length < 2) missing.push(tx('işletme adı', 'business name', 'Name'));
  if (!form.category) missing.push(tx('kategori', 'category', 'Kategorie'));
  if (form.contactName.trim().length < 2) missing.push(tx('yetkili adı', 'contact name', 'Ansprechpartner'));
  if (digits.length < 10) missing.push(tx('telefon', 'phone', 'Telefon'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) missing.push(tx('e-posta', 'e-mail', 'E-Mail'));
  if (form.district.trim().length < 2) missing.push(tx('ilçe', 'district', 'Bezirk'));
  if (form.address.trim().length < 5) missing.push(tx('adres', 'address', 'Adresse'));
  if (form.description.trim().length < 10) missing.push(tx('tanıtım yazısı', 'description', 'Beschreibung'));

  const submit = async () => {
    Keyboard.dismiss();
    setError('');
    if (missing.length) {
      setError(tx(`Eksik veya hatalı: ${missing.join(', ')}.`, `Missing or invalid: ${missing.join(', ')}.`, `Fehlt oder ungültig: ${missing.join(', ')}.`));
      return;
    }
    if (!consent) {
      setError(tx('Göndermek için onay kutusunu işaretlemelisin.', 'Please tick the confirmation box.', 'Bitte bestätige das Kästchen.'));
      return;
    }
    setBusy(true);
    try {
      let token = null;
      try {
        const { data } = await supabase.auth.getSession();
        token = data?.session?.access_token || null;
      } catch (e) {
        token = null;
      }
      if (!token) {
        setError(tx('Oturumun sona ermiş. Tekrar giriş yap.', 'Your session has expired. Please sign in again.', 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'));
        return;
      }
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => controller && controller.abort(), 30000);
      let res;
      let body = null;
      try {
        res = await fetch(`${supabaseUrl}/functions/v1/isletme-basvuru`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: publishableKey },
          body: JSON.stringify({ ...form, phone: form.phone.trim(), email: form.email.trim() }),
          signal: controller ? controller.signal : undefined,
        });
        try { body = await res.json(); } catch (e) { body = null; }
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok || !body || !body.success) {
        if (res.status === 404) {
          setError(tx('Başvuru servisi henüz kurulmamış. Biraz sonra tekrar dene.', 'The application service is not set up yet.', 'Der Antragsdienst ist noch nicht eingerichtet.'));
        } else {
          setError((body && typeof body.error === 'string' && body.error) || tx('Başvuru gönderilemedi. Biraz sonra tekrar dene.', 'The application could not be sent. Please try again later.', 'Der Antrag konnte nicht gesendet werden.'));
        }
        return;
      }
      setDone(true);
      setForm({ ...EMPTY, email: session?.user?.email || '' });
      setConsent(false);
      loadMine();
    } catch (e) {
      setError(tx('Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.', 'The server could not be reached. Check your connection.', 'Der Server war nicht erreichbar.'));
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, opts = {}) => (
    <>
      <Text style={s.label}>{label}{opts.optional ? '' : ' *'}</Text>
      <TextInput
        value={form[key]}
        onChangeText={set(key)}
        placeholder={opts.placeholder || ''}
        placeholderTextColor="#9BA7A3"
        style={[s.input, opts.multiline && s.inputMulti]}
        multiline={!!opts.multiline}
        maxLength={opts.max || 120}
        keyboardType={opts.keyboardType || 'default'}
        autoCapitalize={opts.autoCapitalize || 'sentences'}
        editable={!busy}
      />
    </>
  );

  return (
    <Screen>
      <ScreenHeader
        title={tx('İşletmeni Tanıt', 'Promote your business', 'Betrieb vorstellen')}
        subtitle={tx('İşletmen BAKPLANLA kullanıcılarına görünsün', 'Let BAKPLANLA users discover your business', 'Mach deinen Betrieb für BAKPLANLA-Nutzer sichtbar')}
      />

      <View style={s.softCard}>
        <Text style={s.cardTitle}>🏪 {tx('Nasıl çalışır?', 'How it works', 'So funktioniert es')}</Text>
        <Text style={[s.cardMeta, { marginTop: 6, lineHeight: 19 }]}>
          {tx('1) Formu doldur.\n2) Başvurunu inceleyip seninle iletişime geçeriz.\n3) Onaylanınca işletmen İş Köprüsü → İşletmeler bölümünde görünür.\n\nŞu an ücretsiz.',
            '1) Fill in the form.\n2) We review it and contact you.\n3) Once approved, your business appears under Job Bridge → Businesses.\n\nCurrently free.',
            '1) Formular ausfüllen.\n2) Wir prüfen und melden uns.\n3) Nach Freigabe erscheint dein Betrieb unter Job-Brücke → Betriebe.\n\nDerzeit kostenlos.')}
        </Text>
      </View>

      {mine.length > 0 && (
        <View style={[s.card, { marginBottom: 10 }]}>
          <Text style={s.cardTitle}>{tx('Başvurularım', 'My applications', 'Meine Anträge')}</Text>
          {mine.map((m) => {
            const st = STATUS[m.status] || STATUS.pending;
            return (
              <View key={m.id} style={[s.row, { marginTop: 8 }]}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>{st.icon}</Text>
                <View style={s.flex1}>
                  <Text style={[s.cardTitle, { fontSize: 14 }]}>{m.business_name}</Text>
                  <Text style={s.cardMeta}>{L(st)}</Text>
                </View>
              </View>
            );
          })}
          {mine.some((m) => m.status === 'approved') && (
            <TouchableOpacity style={[s.secondaryBtn, { marginTop: 10 }]} onPress={() => navigate('koprusu')}>
              <Text style={s.secondaryBtnText}>{tx('İşletmeler Bölümünü Aç', 'Open Businesses', 'Betriebe öffnen')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!signedIn ? (
        <View style={s.softCard}>
          <Text style={s.cardTitle}>{tx('Önce giriş yap', 'Sign in first', 'Bitte zuerst anmelden')}</Text>
          <Text style={s.cardMeta}>
            {tx('Başvuru yapmak için BAKPLANLA hesabınla giriş yapmalısın (e-postan doğrulanmış olmalı).', 'Sign in with a verified BAKPLANLA account to apply.', 'Melde dich mit einem bestätigten BAKPLANLA-Konto an.')}
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setShowAuthModal(true)}>
            <Text style={s.primaryBtnText}>{tx('Giriş Yap', 'Sign In', 'Anmelden')}</Text>
          </TouchableOpacity>
        </View>
      ) : done ? (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 22 }]}>
          <Text style={{ fontSize: 40 }}>🎉</Text>
          <Text style={[s.cardTitle, { marginTop: 8, textAlign: 'center' }]}>{tx('Başvurun alındı!', 'Application received!', 'Antrag erhalten!')}</Text>
          <Text style={[s.cardMeta, { marginTop: 6, textAlign: 'center', lineHeight: 19 }]}>
            {tx('İnceledikten sonra verdiğin telefon veya e-posta üzerinden seninle iletişime geçeceğiz. Durumunu bu sayfadaki "Başvurularım" bölümünden takip edebilirsin.',
              'We will contact you by phone or e-mail after reviewing it. You can follow the status under "My applications".',
              'Wir melden uns nach der Prüfung. Den Status siehst du unter „Meine Anträge".')}
          </Text>
          <TouchableOpacity style={[s.secondaryBtn, { alignSelf: 'stretch' }]} onPress={() => setDone(false)}>
            <Text style={s.secondaryBtnText}>{tx('Başka Bir İşletme Ekle', 'Add another business', 'Weiteren Betrieb hinzufügen')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.card}>
          {field('businessName', tx('İşletme adı', 'Business name', 'Name des Betriebs'), { max: 80, placeholder: tx('Örn. Cucci Bruschetta', 'e.g. Corner Café', 'z. B. Eckcafé') })}

          <Text style={s.label}>{tx('Kategori', 'Category', 'Kategorie')} *</Text>
          <View style={s.chipRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat.key} style={[s.chip, form.category === cat.key && s.chipActive]} onPress={() => set('category')(cat.key)} disabled={busy}>
                <Text style={[s.chipText, form.category === cat.key && s.chipTextActive]}>{L(cat)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {field('contactName', tx('Yetkili adı soyadı', 'Contact name', 'Ansprechpartner'), { max: 80, autoCapitalize: 'words' })}
          {field('phone', tx('Telefon', 'Phone', 'Telefon'), { max: 20, keyboardType: 'phone-pad', placeholder: '05xx xxx xx xx' })}
          {field('email', tx('E-posta', 'E-mail', 'E-Mail'), { max: 120, keyboardType: 'email-address', autoCapitalize: 'none' })}
          {field('district', tx('İlçe / Şehir', 'District / City', 'Bezirk / Stadt'), { max: 60, placeholder: tx('Örn. Sultangazi / İstanbul', 'e.g. Kadıköy / Istanbul', 'z. B. Kadıköy / Istanbul') })}
          {field('address', tx('Açık adres', 'Address', 'Adresse'), { max: 200, multiline: true })}
          {field('website', tx('Web sitesi', 'Website', 'Website'), { optional: true, max: 200, keyboardType: 'url', autoCapitalize: 'none', placeholder: 'https://' })}
          {field('instagram', 'Instagram', { optional: true, max: 60, autoCapitalize: 'none', placeholder: '@isletmen' })}
          {field('description', tx('İşletmeni kısaca tanıt', 'Short description', 'Kurzbeschreibung'), { max: 500, multiline: true, placeholder: tx('Ne sunuyorsun, seni farklı kılan ne?', 'What do you offer?', 'Was bietest du an?') })}
          {field('offer', tx('BAKPLANLA kullanıcılarına indirim (isteğe bağlı)', 'Discount for BAKPLANLA users (optional)', 'Rabatt für BAKPLANLA-Nutzer (optional)'), { optional: true, max: 200, placeholder: tx('Örn. Tüm kahvelerde %10', 'e.g. 10% off all coffees', 'z. B. 10 % auf Kaffee') })}

          <View style={[s.row, { alignItems: 'flex-start', marginTop: 16 }]}>
            <TouchableOpacity
              onPress={() => setConsent(!consent)}
              disabled={busy}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.green, backgroundColor: consent ? c.green : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 }}
            >
              {consent && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </TouchableOpacity>
            <Text style={[s.cardMeta, s.flex1, { marginTop: 0, lineHeight: 18 }]}>
              {tx('Bilgilerin doğru olduğunu ve bu işletmeyi temsil etmeye yetkili olduğumu onaylıyorum. Başvuru bilgilerimin değerlendirme ve iletişim için işlenmesini kabul ediyorum. ',
                'I confirm the information is correct and that I may represent this business. I agree that my details are processed to review the application and contact me. ',
                'Ich bestätige die Angaben und meine Vertretungsbefugnis und stimme der Verarbeitung zur Prüfung und Kontaktaufnahme zu. ')}
              <Text style={{ color: c.green, fontWeight: '800', textDecorationLine: 'underline' }} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
                {tx('Gizlilik Politikası', 'Privacy Policy', 'Datenschutz')}
              </Text>
            </Text>
          </View>

          {!!error && <Text style={{ color: c.red, fontSize: 13, fontWeight: '700', marginTop: 12, lineHeight: 18 }}>{error}</Text>}

          <TouchableOpacity style={[s.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>{tx('Başvuruyu Gönder', 'Send application', 'Antrag senden')}</Text>}
          </TouchableOpacity>
          <Text style={[s.cardMeta, { marginTop: 10, textAlign: 'center' }]}>
            {tx('Telefon ve e-postan uygulamada kimseye gösterilmez.', 'Your phone and e-mail are never shown in the app.', 'Telefon und E-Mail werden in der App nie angezeigt.')}
          </Text>
        </View>
      )}
    </Screen>
  );
};

/*
  Onaylanmış işletmeler — İş Köprüsü → İşletmeler sekmesinin altında gösterilir.
  Veriler sunucudaki business_list_approved() fonksiyonundan gelir (telefon/e-posta içermez).
*/
const isWebUrl = (url) => typeof url === 'string' && /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url.trim());
const instaUrl = (h) => {
  const handle = String(h || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : null;
};

export const OnayliIsletmeler = ({ app, supabase }) => {
  const { s, c, tx, navigate } = app;
  const [list, setList] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('business_list_approved');
        if (!cancelled && !error && Array.isArray(data)) setList(data);
      } catch (e) {
        // sunucuya ulaşılamazsa bu bölüm boş kalır
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <>
      {list.map((b) => {
        const insta = instaUrl(b.instagram);
        const site = isWebUrl(b.website) ? b.website.trim() : null;
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.business_name} ${b.address || ''}`)}`;
        return (
          <View key={b.id} style={[s.card, { marginBottom: 10 }]}>
            <Text style={s.cardTitle}>{b.business_name}</Text>
            <Text style={[s.cardMeta, { marginTop: 2 }]}>{[b.category, b.district].filter(Boolean).join(' · ')}</Text>
            {!!b.description && <Text style={[s.cardMeta, { marginTop: 6, lineHeight: 19 }]}>{b.description}</Text>}
            {!!b.address && (
              <TouchableOpacity onPress={() => Linking.openURL(mapUrl).catch(() => {})} style={[s.row, { marginTop: 8, alignItems: 'flex-start' }]}>
                <Ionicons name="location-outline" size={16} color={c.green} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={[s.cardMeta, s.flex1, { lineHeight: 18, marginTop: 0 }]}>{b.address}</Text>
              </TouchableOpacity>
            )}
            {!!b.offer && (
              <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1.5, borderColor: c.gold, padding: 10 }}>
                <Text style={s.cardTitle}>🎁 {b.offer}</Text>
                <Text style={[s.cardMeta, { marginTop: 2 }]}>{tx('BAKPLANLA kullanıcılarına özel', 'For BAKPLANLA users', 'Für BAKPLANLA-Nutzer')}</Text>
              </View>
            )}
            {(site || insta) && (
              <View style={[s.row, { marginTop: 10 }]}>
                {site && (
                  <TouchableOpacity style={[s.secondaryBtn, s.flex1, { marginTop: 0, marginRight: insta ? 8 : 0 }]} onPress={() => Linking.openURL(site).catch(() => {})}>
                    <Text style={s.secondaryBtnText}>🔗 {tx('Web Sitesi', 'Website', 'Website')}</Text>
                  </TouchableOpacity>
                )}
                {insta && (
                  <TouchableOpacity style={[s.secondaryBtn, s.flex1, { marginTop: 0 }]} onPress={() => Linking.openURL(insta).catch(() => {})}>
                    <Text style={s.secondaryBtnText}>📷 Instagram</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}

      <View style={[s.softCard, { marginTop: 4 }]}>
        <Text style={s.cardTitle}>🏪 {tx('İşletmen var mı?', 'Own a business?', 'Hast du einen Betrieb?')}</Text>
        <Text style={[s.cardMeta, { marginTop: 4, lineHeight: 19 }]}>
          {tx('Sen de BAKPLANLA’da yer al, işletmeni kullanıcılarımıza tanıt.', 'Join BAKPLANLA and introduce your business to users.', 'Stelle deinen Betrieb auf BAKPLANLA vor.')}
        </Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => navigate('isletmeTanit')}>
          <Text style={s.primaryBtnText}>{tx('İşletmeni Tanıt', 'Promote your business', 'Betrieb vorstellen')}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};
