// Dosya sistemi köprüsü.
// Gerçek cihazda / derlemede orijinal expo-file-system/legacy kullanılır.
// Snack bu paketi yükleyemezse uygulama çökmez; sadece dosya kaydetme işleri devre dışı kalır.
let Legacy = null;
try {
  Legacy = require('expo-file-system/legacy');
} catch (e) {
  Legacy = null;
}

const unavailable = () =>
  Promise.reject(new Error('Dosya sistemi bu ortamda kullanılamıyor.'));

export const isAvailable = !!Legacy;
export const documentDirectory = Legacy ? Legacy.documentDirectory : null;
export const EncodingType =
  (Legacy && Legacy.EncodingType) || { Base64: 'base64', UTF8: 'utf8' };

export const readAsStringAsync = (...args) =>
  Legacy ? Legacy.readAsStringAsync(...args) : unavailable();
export const copyAsync = (...args) =>
  Legacy ? Legacy.copyAsync(...args) : unavailable();
export const deleteAsync = (...args) =>
  Legacy ? Legacy.deleteAsync(...args) : unavailable();
export const downloadAsync = (...args) =>
  Legacy ? Legacy.downloadAsync(...args) : unavailable();