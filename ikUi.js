/*
  BAKPLANLA İŞ KÖPRÜSÜ — ortak arayüz parçaları.
  Mevcut uygulamanın stillerini (s) ve renklerini (c) kullanır; yeni tasarım dili eklemez.
*/
import React, { createContext, useContext, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createQrMatrix } from './qrcode';
import { L3, statusInfo } from './isKoprusu.js';

export const IkContext = createContext(null);
export const useIk = () => useContext(IkContext);

export const BackLink = ({ onPress, label }) => {
  const { app } = useIk();
  const { c, tx } = app;
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Ionicons name="chevron-back" size={18} color={c.green} />
      <Text style={{ color: c.green, fontWeight: '800', fontSize: 14 }}>{label || tx('Geri', 'Back', 'Zurück')}</Text>
    </TouchableOpacity>
  );
};

export const StatusPill = ({ table, value, style }) => {
  const { app } = useIk();
  const info = statusInfo(table, value);
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: info.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }, style]}>
      <Text style={{ color: info.color, fontSize: 11, fontWeight: '900' }}>{L3(app.lang, info)}</Text>
    </View>
  );
};

export const DemoTag = () => (
  <View style={{ alignSelf: 'flex-start', backgroundColor: '#E5534B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 }}>
    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>DEMO</Text>
  </View>
);

export const IkChip = ({ label, active, onPress }) => {
  const { app } = useIk();
  const { s } = app;
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

export const Field = ({ label, value, onChangeText, error, multiline, keyboardType, placeholder, maxLength, hint, autoCapitalize }) => {
  const { app } = useIk();
  const { s, c } = app;
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti, !!error && { borderColor: c.red }]}
        value={value}
        onChangeText={onChangeText}
        multiline={!!multiline}
        keyboardType={keyboardType || 'default'}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
      />
      {!!hint && !error && <Text style={[s.note, { marginTop: 4 }]}>{hint}</Text>}
      {!!error && <Text style={{ color: c.red, fontSize: 12, marginTop: 4, fontWeight: '700' }}>{error}</Text>}
    </View>
  );
};

export const CheckBox = ({ checked, onPress, children }) => {
  const { app } = useIk();
  const { c } = app;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 }}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? c.green : c.muted} style={{ marginRight: 10, marginTop: -1 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </TouchableOpacity>
  );
};

export const SwitchRow = ({ title, sub, value, onValueChange }) => {
  const { app } = useIk();
  const { s, c } = app;
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {!!sub && <Text style={s.cardMeta}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: c.green }} />
    </View>
  );
};

export const Btn = ({ kind = 'dark', label, onPress, busy, disabled, icon }) => {
  const { app } = useIk();
  const { s, c } = app;
  const box = { dark: s.darkBtn, gold: s.goldBtn, secondary: s.secondaryBtn, danger: s.dangerBtn }[kind] || s.darkBtn;
  const text = { dark: s.darkBtnText, gold: [s.goldBtnText, { marginLeft: 0 }], secondary: s.secondaryBtnText, danger: s.dangerBtnText }[kind] || s.darkBtnText;
  const spinner = kind === 'dark' ? '#FFFFFF' : kind === 'danger' ? c.red : c.dark;
  return (
    <TouchableOpacity style={[box, (disabled || busy) && s.disabled]} onPress={onPress} disabled={disabled || busy}>
      {busy ? <ActivityIndicator color={spinner} /> : <Text style={text}>{icon ? `${icon} ` : ''}{label}</Text>}
    </TouchableOpacity>
  );
};

export const InfoRow = ({ icon, label, value }) => {
  const { app } = useIk();
  const { c } = app;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
      <Ionicons name={icon} size={16} color={c.green} style={{ marginRight: 8, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 14, marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  );
};

export const Stars = ({ value, onChange, size = 28 }) => {
  const { app } = useIk();
  const { c } = app;
  return (
    <View style={{ flexDirection: 'row', marginTop: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={onChange ? () => onChange(n) : undefined} disabled={!onChange} style={{ marginRight: 6 }}>
          <Ionicons name={n <= (value || 0) ? 'star' : 'star-outline'} size={size} color={c.gold} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

export const Loading = () => {
  const { app } = useIk();
  return <ActivityIndicator color={app.c.green} style={{ marginTop: 30 }} />;
};

export const ErrorCard = ({ text, onRetry }) => {
  const { app } = useIk();
  const { s, c, tx } = app;
  return (
    <View style={[s.card, { borderColor: c.red }]}>
      <Text style={[s.cardTitle, { color: c.red }]}>⚠️ {tx('Bir sorun var', 'Something went wrong', 'Ein Problem')}</Text>
      <Text style={s.note}>{text}</Text>
      {!!onRetry && (
        <TouchableOpacity onPress={onRetry} style={{ marginTop: 10 }}>
          <Text style={s.link}>{tx('Tekrar dene', 'Try again', 'Erneut versuchen')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export const EmptyBox = ({ icon, title, text }) => {
  const { app } = useIk();
  const { s } = app;
  return (
    <View style={[s.card, { alignItems: 'center', paddingVertical: 24 }]}>
      <Text style={{ fontSize: 34 }}>{icon}</Text>
      <Text style={[s.cardTitle, { marginTop: 8, textAlign: 'center' }]}>{title}</Text>
      {!!text && <Text style={[s.note, { textAlign: 'center' }]}>{text}</Text>}
    </View>
  );
};

// Gerçek, taranabilir QR (qrcode.js) — vardiya giriş/çıkış kodu
export const QrBox = ({ text, cell = 6 }) => {
  const qr = useMemo(() => (text ? createQrMatrix(text) : null), [text]);
  if (!qr || !qr.ok) return null;
  return (
    <View style={{ padding: 14, backgroundColor: '#FFFFFF', borderRadius: 16, alignSelf: 'center' }}>
      {qr.matrix.map((row, r) => (
        <View key={`r${r}`} style={{ flexDirection: 'row' }}>
          {row.map((dark, col) => <View key={`c${col}`} style={{ width: cell, height: cell, backgroundColor: dark ? '#0A3D33' : '#FFFFFF' }} />)}
        </View>
      ))}
    </View>
  );
};

// Kurulu değil / giriş yok gibi durumlar için ortak kart
export const GateCard = ({ icon, title, text, buttonLabel, onPress }) => {
  const { app } = useIk();
  const { s } = app;
  return (
    <View style={[s.card, { alignItems: 'center', paddingVertical: 22 }]}>
      <Text style={{ fontSize: 38 }}>{icon}</Text>
      <Text style={[s.cardTitle, { marginTop: 8, textAlign: 'center' }]}>{title}</Text>
      <Text style={[s.note, { textAlign: 'center' }]}>{text}</Text>
      {!!buttonLabel && (
        <View style={{ alignSelf: 'stretch' }}>
          <Btn label={buttonLabel} onPress={onPress} />
        </View>
      )}
    </View>
  );
};
