import React, { useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from './helpers';
import { isReceiptDoc, receiptStoreName } from './receipts';

export const filterDocuments = (documents, query) => {
  const q = query.trim().toLowerCase();
  return q
    ? documents.filter((d) => {
      const receiptText = isReceiptDoc(d)
        ? d.analysis.receipt.items.map((it) => `${it.name} ${it.raw_name || ''}`).join(' ') + ` ${receiptStoreName(d.analysis.receipt)}`
        : '';
      return `${d.title || ''} ${d.notes || ''} ${receiptText}`.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'));
    })
    : documents;
};

const DocumentCard = ({ doc, onPress, s, c, tx, lang }) => (
  <TouchableOpacity style={s.menuRow} onPress={onPress}>
    <View style={s.docThumb}>
      {doc.uri ? (
        <Image source={{ uri: doc.uri }} style={s.docThumbImage} resizeMode="cover" />
      ) : (
        <Ionicons name="document-text-outline" size={24} color={c.green} />
      )}
    </View>

    <View style={s.flex1}>
      <Text style={s.menuTitle} numberOfLines={1}>{doc.title}</Text>
      <Text style={s.menuSub}>{formatDate(doc.createdAt, lang)}</Text>
    </View>

    {doc.analyzed ? (
      <View style={[s.badge, { backgroundColor: c.green }]}>
        <Text style={s.badgeText}>{tx('ANALİZ EDİLDİ', 'ANALYZED', 'ANALYSIERT')}</Text>
      </View>
    ) : (
      <View style={s.tag}>
        <Text style={s.tagText}>{tx('YENİ', 'NEW', 'NEU')}</Text>
      </View>
    )}
  </TouchableOpacity>
);

export default function DocumentsScreen({
  s, c, tx, lang, documents, openDocument, openAddSheet,
  Screen, ScreenHeader, EmptyCard,
}) {
  const [query, setQuery] = useState('');
  const filtered = filterDocuments(documents, query);

  return (
    <Screen>
      <ScreenHeader
        title={tx('Belgeler', 'Documents', 'Dokumente')}
        subtitle={tx('Tüm belgelerin tek yerde.', 'All your documents in one place.', 'Alle deine Dokumente an einem Ort.')}
      />

      {documents.length > 0 && (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tx('Belge ara...', 'Search documents...', 'Dokumente suchen...')}
          placeholderTextColor="#9BA7A3"
          style={[s.input, { marginBottom: 12 }]}
        />
      )}

      {documents.length === 0 ? (
        <EmptyCard
          badge="PDF"
          title={tx('Henüz belge yok', 'No documents yet', 'Noch keine Dokumente')}
          text={tx(
            'Bir belge ekle, PLAN onu kaydetsin ve analiz etmeye hazırlasın.',
            'Add a document and PLAN will save it and prepare it for analysis.',
            'Füge ein Dokument hinzu und PLAN speichert und bereitet es zur Analyse vor.'
          )}
          buttonLabel={tx('İlk Belgeyi Ekle', 'Add First Document', 'Erstes Dokument hinzufügen')}
          onPress={openAddSheet}
        />
      ) : filtered.length === 0 ? (
        <EmptyCard
          badge="⌕"
          title={tx('Sonuç bulunamadı', 'No results', 'Keine Ergebnisse')}
          text={tx('Arama kelimeni değiştir.', 'Try another search term.', 'Versuche einen anderen Suchbegriff.')}
        />
      ) : (
        filtered.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} s={s} c={c} tx={tx} lang={lang} onPress={() => openDocument(doc.id)} />
        ))
      )}
    </Screen>
  );
}
