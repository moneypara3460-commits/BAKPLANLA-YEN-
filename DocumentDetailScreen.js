import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from './helpers';
import { isReceiptDoc } from './receipts';

const DocumentDetailScreen = ({
  document,
  dataScopeGeneration,
  isCurrentDataScope,
  isAnalysisInFlight = false,
  s,
  c,
  tx,
  lang,
  analyzeDocument,
  deleteDocument,
  createTaskFromDocument,
  Screen,
  ScreenHeader,
  EmptyCard,
  ReceiptCard,
}) => {
  const scopeKey = `${dataScopeGeneration}:${document?.id || 'missing'}`;
  const [busyState, setBusyState] = useState({ scopeKey, value: false });
  const busy = (busyState.scopeKey === scopeKey && busyState.value) || isAnalysisInFlight;
  const mountedRef = useRef(true);
  const analysisInFlightScopeKeyRef = useRef(null);
  const currentScopeRef = useRef({ scopeKey, dataScopeGeneration, isCurrentDataScope });
  currentScopeRef.current = { scopeKey, dataScopeGeneration, isCurrentDataScope };
  const isCurrent = (operationScopeKey, generation) => mountedRef.current
    && operationScopeKey === currentScopeRef.current.scopeKey
    && generation === currentScopeRef.current.dataScopeGeneration
    && (typeof currentScopeRef.current.isCurrentDataScope !== 'function'
      || currentScopeRef.current.isCurrentDataScope(generation));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  if (!document) {
    return (
      <Screen>
        <EmptyCard
          badge="?"
          title={tx('Belge bulunamadı', 'Document not found', 'Dokument nicht gefunden')}
        />
      </Screen>
    );
  }

  const analysis = document.analysis;

  const handleAnalyze = async () => {
    const operationScopeKey = scopeKey;
    const generation = dataScopeGeneration;
    if (!isCurrent(operationScopeKey, generation) || isAnalysisInFlight || analysisInFlightScopeKeyRef.current === operationScopeKey) return;
    analysisInFlightScopeKeyRef.current = operationScopeKey;
    setBusyState({ scopeKey: operationScopeKey, value: true });
    try {
      await analyzeDocument(document.id, generation);
    } finally {
      if (analysisInFlightScopeKeyRef.current === operationScopeKey) {
        analysisInFlightScopeKeyRef.current = null;
      }
      if (isCurrent(operationScopeKey, generation)) {
        setBusyState({ scopeKey: operationScopeKey, value: false });
      }
    }
  };

  const handleDelete = () => {
    const generation = dataScopeGeneration;
    Alert.alert(
      tx('Belgeyi sil?', 'Delete document?', 'Dokument löschen?'),
      tx(
        'Bu belge cihazdan kaldırılacak.',
        'This document will be removed from the device.',
        'Dieses Dokument wird vom Gerät entfernt.'
      ),
      [
        { text: tx('Vazgeç', 'Cancel', 'Abbrechen'), style: 'cancel' },
        {
          text: tx('Sil', 'Delete', 'Löschen'),
          style: 'destructive',
          onPress: () => {
            if (isCurrent(scopeKey, generation)) deleteDocument(document.id, generation);
          },
        },
      ]
    );
  };

  const handleCreateTask = () => {
    if (!isCurrent(scopeKey, dataScopeGeneration)) return;
    if (!analysis) {
      Alert.alert(
        tx('Önce analiz', 'Analyze first', 'Zuerst analysieren'),
        tx(
          'Belgeyi analiz ettikten sonra görev oluşturabilirsin.',
          'Analyze the document first, then you can create a task.',
          'Analysiere das Dokument zuerst, danach kannst du eine Aufgabe erstellen.'
        )
      );
      return;
    }

    createTaskFromDocument(document, undefined, dataScopeGeneration);
  };

  return (
    <Screen>
      <ScreenHeader
        title={document.title}
        subtitle={formatDate(document.createdAt, lang)}
      />

      {document.uri ? (
        <Image source={{ uri: document.uri }} style={s.detailImage} resizeMode="cover" />
      ) : (
        <View style={[s.detailImage, { alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="document-text-outline" size={58} color={c.green} />
        </View>
      )}

      {!!document.notes && (
        <View style={s.softCard}>
          <Text style={s.cardTitle}>{tx('Not', 'Note', 'Notiz')}</Text>
          <Text style={s.note}>{document.notes}</Text>
        </View>
      )}

      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{tx('PLAN ile Analiz', 'Analyze with PLAN', 'Mit PLAN analysieren')}</Text>
      </View>

      {!analysis ? (
        <View style={s.card}>
          <Ionicons name="sparkles-outline" size={28} color={c.green} />
          <Text style={[s.cardTitle, { marginTop: 10 }]}>
            {tx(
              'Bu belge henüz analiz edilmedi.',
              'This document has not been analyzed yet.',
              'Dieses Dokument wurde noch nicht analysiert.'
            )}
          </Text>
          <Text style={s.note}>
            {tx(
              'PLAN AI belgedeki tarih, tutar, son ödeme ve iade/garanti gibi önemli bilgileri çıkarır. Belge bir fişse ürünleri fiyatlarıyla tek tek okur.',
              'PLAN AI extracts key details like dates, amounts, due dates and return/warranty periods. If it is a receipt, it reads each item with its price.',
              'PLAN AI erkennt wichtige Angaben wie Datum, Betrag, Fristen sowie Rückgabe/Garantie. Bei einem Kassenbon liest es jeden Artikel mit Preis.'
            )}
          </Text>

          <TouchableOpacity
            style={[s.primaryBtn, busy && s.disabled]}
            onPress={handleAnalyze}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>
                {tx('Belgeyi Analiz Et', 'Analyze Document', 'Dokument analysieren')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.card}>
            <View style={s.row}>
              <Ionicons name="sparkles" size={20} color={c.green} />
              <Text style={[s.analysisTitle, { marginLeft: 8, marginBottom: 0 }]}>
                {tx('Özet', 'Summary', 'Zusammenfassung')}
              </Text>
            </View>

            <Text style={[s.analysisSummary, { marginTop: 10 }]}>
              {analysis.summary}
            </Text>
          </View>

          {isReceiptDoc(document) && <ReceiptCard receipt={analysis.receipt} />}

          <View style={s.card}>
            <Text style={s.analysisTitle}>
              {tx('Önerilen Adımlar', 'Suggested Steps', 'Empfohlene Schritte')}
            </Text>

            {(analysis.actions || []).map((action, index) => (
              <View style={s.actionRow} key={`${action}-${index}`}>
                <View style={s.actionNumber}>
                  <Text style={s.actionNumberText}>{index + 1}</Text>
                </View>
                <Text style={s.actionText}>{action}</Text>
              </View>
            ))}

            <TouchableOpacity style={s.primaryBtn} onPress={handleCreateTask}>
              <Text style={s.primaryBtnText}>
                {tx('Görev Oluştur', 'Create Task', 'Aufgabe erstellen')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity style={s.dangerBtn} onPress={handleDelete}>
        <Text style={s.dangerBtnText}>
          {tx('Belgeyi Sil', 'Delete Document', 'Dokument löschen')}
        </Text>
      </TouchableOpacity>
    </Screen>
  );
};

export default DocumentDetailScreen;
