const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const helperUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/openaiDataMinimization.mjs')).href;
const providerUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/openaiProvider.mjs')).href;

const syntheticExifOrientation6DataUrl = () => {
  const jpegPixels = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ4eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD1JfhD4EvL/WJLjwV4dnkGq38YaTSoGIVbqVVXJToFAAHYADtRRRX9ecLf8iDAf9eaX/pET+YuK/8Akocw/wCv1X/0uR//2Q==', 'base64');
  const exifSegment = Buffer.from([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const orientedJpeg = Buffer.concat([jpegPixels.subarray(0, 2), exifSegment, jpegPixels.subarray(2)]);
  return `data:image/jpeg;base64,${orientedJpeg.toString('base64')}`;
};

const sampleDocument = () => ({
  id: 'synthetic-private-document-id',
  user_id: 'synthetic-owner-id',
  uri: 'file:///private/synthetic-document.jpg',
  imagePath: 'synthetic-owner-id/documents/private.jpg',
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-31T10:00:00Z',
  status: 'analyzed',
  analyzed: true,
  title: 'Garanti belgesi',
  type: 'document',
  notes: 'Synthetic free text with personal detail: Ada Example, 555-0100',
  provider_metadata: { email: 'ada@example.invalid', token: 'synthetic-secret-metadata' },
  analysis: {
    createdAt: '2026-10-30T10:01:00Z',
    summary: 'Garanti 2027-10-30 tarihine kadar geçerlidir.',
    actions: ['Fişi sakla.'],
    document_type: 'Garanti belgesi',
    date: '2026-10-30',
    warranty_period: '1 yıl',
    receipt: null,
    private_metadata: 'synthetic-private-analysis-metadata',
  },
});

test('PLAN AI provider context keeps useful document and shopping facts but excludes account and storage metadata', async () => {
  const { buildChatContext } = await import(helperUrl);
  const document = sampleDocument();
  const before = structuredClone(document);
  const shopping = {
    list: [{ name: 'Süt', quantity: 2, unit: 'lt', checked: false, last_price: 40, last_store: 'Örnek Market', id: 'synthetic-item-id', user_id: 'synthetic-owner-id' }],
    recent_receipts: [{ store: 'Örnek Market', date: '2026-10-30', total: 120, item_count: 3, user_id: 'synthetic-owner-id', imagePath: 'private-path' }],
    access_token: 'synthetic-bearer-token',
  };
  const context = buildChatContext([document], shopping);
  const docs = JSON.parse(context.documentContext);
  const shoppingData = JSON.parse(context.shoppingContext);

  assert.deepEqual(docs, [{
    title: 'Garanti belgesi',
    type: 'document',
    notes: 'Synthetic free text with personal detail: Ada Example, 555-0100',
    analysis: {
      summary: 'Garanti 2027-10-30 tarihine kadar geçerlidir.',
      actions: ['Fişi sakla.'],
      document_type: 'Garanti belgesi',
      date: '2026-10-30',
      warranty_period: '1 yıl',
      receipt: null,
    },
  }]);
  assert.deepEqual(shoppingData, {
    list: [{ name: 'Süt', quantity: 2, unit: 'lt', checked: false, last_price: 40, last_store: 'Örnek Market' }],
    recent_receipts: [{ store: 'Örnek Market', date: '2026-10-30', total: 120, item_count: 3 }],
  });
  for (const forbidden of [
    'synthetic-private-document-id', 'synthetic-owner-id', 'file:///private', 'imagePath',
    'synthetic-secret-metadata', 'synthetic-private-analysis-metadata', 'synthetic-bearer-token',
  ]) assert.equal(`${context.documentContext}\n${context.shoppingContext}`.includes(forbidden), false);
  assert.deepEqual(document, before, 'minimization must not mutate account-owned local records');
});

test('opportunity mode retains analyzed facts and receipt semantics while dropping notes and identifiers', async () => {
  const { buildOpportunitiesContext } = await import(helperUrl);
  const receiptDocument = {
    id: 'synthetic-receipt-id', user_id: 'synthetic-owner-id', uri: 'file:///receipt.jpg',
    title: 'Market fişi', type: 'receipt', notes: 'not part of opportunities client contract',
    analysis: {
      document_type: 'Alışveriş fişi',
      receipt: {
        store: 'Örnek Market', store_type: 'market', branch: 'Kadıköy', date: '2026-10-30', time: '12:30',
        payment_method: 'synthetic-sensitive-card',
        total: 125.5, totals_match: true,
        items: [{ name: 'Süt', quantity: 2, unit: 'lt', unit_price: 30, line_total: 60, category: 'sut_urunleri', size: '1 L', id: 'synthetic-line-id', customer_email: 'synthetic@example.invalid' }],
        receipt_number: 'synthetic-sensitive-number',
      },
      user_id: 'synthetic-owner-id',
    },
  };
  const before = structuredClone(receiptDocument);
  const context = buildOpportunitiesContext([receiptDocument]);
  assert.deepEqual(JSON.parse(context), [{
    title: 'Market fişi', type: 'receipt',
    analysis: {
      document_type: 'Alışveriş fişi',
      receipt: {
        store: 'Örnek Market', store_type: 'market', branch: 'Kadıköy', date: '2026-10-30',
        total: 125.5, totals_match: true,
        items: [{ name: 'Süt', quantity: 2, unit: 'lt', unit_price: 30, line_total: 60, category: 'sut_urunleri', size: '1 L' }],
      },
    },
  }]);
  for (const forbidden of ['synthetic-receipt-id', 'synthetic-owner-id', 'file:///receipt.jpg', 'synthetic-line-id', 'synthetic@example.invalid', 'synthetic-sensitive-number', 'synthetic-sensitive-card', '12:30', 'receipt_number', 'not part of opportunities']) {
    assert.equal(context.includes(forbidden), false);
  }
  assert.deepEqual(receiptDocument, before);
});

test('chat retains transaction details for user-directed receipt questions while opportunities omit them', async () => {
  const { buildChatContext, buildOpportunitiesContext } = await import(helperUrl);
  const receipt = {
    title: 'Market fişi', type: 'receipt',
    analysis: { receipt: {
      store: 'Örnek Market', date: '2026-10-30', time: '12:30',
      payment_method: 'synthetic-card', total: 125.5,
      items: [{ name: 'Süt', quantity: 2, unit_price: 30, line_total: 60 }],
    } },
  };
  const chat = buildChatContext([receipt], {}).documentContext;
  const opportunities = buildOpportunitiesContext([receipt]);
  assert.match(chat, /12:30/);
  assert.match(chat, /synthetic-card/);
  assert.doesNotMatch(opportunities, /12:30|synthetic-card/);
  assert.match(opportunities, /Örnek Market/);
  assert.match(opportunities, /125\.5/);
  assert.match(opportunities, /Süt/);
});

test('the exact minimized structured context is serialized into the provider payload with store:false', async () => {
  const { buildChatContext, buildOpportunitiesContext } = await import(helperUrl);
  const { requestOpenAiResponses } = await import(providerUrl);
  const doc = sampleDocument();
  const chat = buildChatContext([doc], { list: [{ name: 'Süt', quantity: 1 }] });
  const opportunities = buildOpportunitiesContext([{
    ...doc,
    analysis: { ...doc.analysis, receipt: {
      store: 'Örnek Market', date: '2026-10-30', time: '12:30', payment_method: 'synthetic-card',
      total: 125.5, items: [{ name: 'Türk kahvesi', quantity: 1, line_total: 125.5 }],
    } },
  }]);
  const observed = [];
  const fakeFetch = async (_url, init) => {
    observed.push(JSON.parse(init.body));
    return new Response('{}', { status: 200 });
  };
  const providerRequest = (text) => requestOpenAiResponses({
    baseUrl: 'http://private-mock.invalid/v1', apiKey: 'synthetic-key', model: 'synthetic-model',
    content: [{ type: 'input_text', text }], timeoutMs: 500, fetchImpl: fakeFetch,
  });
  await providerRequest(`Soru: Synthetic prompt with Ada Example, 555-0100\n${chat.documentContext}\n${chat.shoppingContext}`);
  await providerRequest(`Belgeler:\n${opportunities}`);
  assert.equal(observed.length, 2);
  for (const body of observed) assert.equal(body.store, false);
  assert.match(observed[0].input[0].content[0].text, /Synthetic prompt with Ada Example, 555-0100/);
  assert.match(observed[0].input[0].content[0].text, /Garanti 2027-10-30/);
  assert.doesNotMatch(observed[0].input[0].content[0].text, /synthetic-private-document-id|synthetic-owner-id|file:\/\/\/private/);
  assert.match(observed[1].input[0].content[0].text, /Garanti 2027-10-30/);
  assert.doesNotMatch(observed[1].input[0].content[0].text, /synthetic-private-document-id|synthetic-owner-id|file:\/\/\/private/);
  assert.doesNotMatch(observed[1].input[0].content[0].text, /12:30|synthetic-card/);
  assert.match(observed[1].input[0].content[0].text, /Türk kahvesi/);
  assert.match(observed[1].input[0].content[0].text, /125\.5/);
});

test('all current OpenAI structured-context branches are wired through the minimization boundary', () => {
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/smart-endpoint/index.ts'), 'utf8');
  assert.match(source, /import \{[^}]*buildChatContext[^}]*buildOpportunitiesContext[^}]*openAiImageContent[^}]*\} from "\.\/openaiDataMinimization\.mjs"/);
  assert.match(source, /const \{ documentContext, shoppingContext \} = buildChatContext\(documents, shopping\)/);
  assert.match(source, /const documentContext = buildOpportunitiesContext\(documents\)/);
  assert.equal((source.match(/openAiImageContent\(`/g) || []).length, 2, 'only explicit receipt and document analysis modes retain input images');
});

test('JPEG with an EXIF orientation marker and supported image data URLs pass through byte-for-byte', async () => {
  const { openAiImageContent } = await import(helperUrl);
  const { requestOpenAiResponses } = await import(providerUrl);
  const images = [
    syntheticExifOrientation6DataUrl(),
    'data:image/png;base64,c3ludGhldGljLXBORy1pbWFnZQ==',
    'data:image/webp;base64,c3ludGhldGljLVdFQlAtaW1hZ2U=',
  ];
  for (const image of images) {
    let body;
    await requestOpenAiResponses({
      baseUrl: 'http://private-mock.invalid/v1', apiKey: 'synthetic-key', model: 'synthetic-model',
      content: openAiImageContent('Synthetic image analysis prompt', image), timeoutMs: 500,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(init.body);
        return new Response('{}', { status: 200 });
      },
    });
    assert.equal(body.store, false);
    assert.equal(body.input[0].content[1].image_url, image, 'transport keeps original image bytes and metadata intact');
  }
  const orientedPayload = Buffer.from(images[0].split(',')[1], 'base64');
  assert.ok(orientedPayload.includes(Buffer.from([0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00])), 'synthetic fixture carries EXIF Orientation=6');
});

test('image provider failure does not mutate or replace the original oriented image payload', async () => {
  const { openAiImageContent } = await import(helperUrl);
  const { requestOpenAiResponses } = await import(providerUrl);
  const image = syntheticExifOrientation6DataUrl();
  const content = openAiImageContent('Turkish receipt: Şeker, süt', image);
  const before = structuredClone(content);
  await assert.rejects(requestOpenAiResponses({
    baseUrl: 'http://private-mock.invalid/v1', apiKey: 'synthetic-key', model: 'synthetic-model',
    content, timeoutMs: 500,
    fetchImpl: async () => { throw new Error('synthetic provider unavailable'); },
  }), /synthetic provider unavailable/);
  assert.deepEqual(content, before);
  assert.equal(content[1].image_url, image);
});

test('invalid/non-record contexts fail closed to empty provider context and arbitrary object fields are not copied', async () => {
  const { buildChatContext, buildOpportunitiesContext } = await import(helperUrl);
  assert.equal(buildChatContext(null, 'not-an-object').documentContext, 'Kullanıcının analiz edilmiş bir belgesi bulunmuyor.');
  assert.equal(buildChatContext(null, {}).shoppingContext, 'Alışveriş listesi bilgisi gönderilmedi.');
  assert.deepEqual(JSON.parse(buildOpportunitiesContext([{ id: 'synthetic-id', analysis: { unexpected: { nested: true } } }])), [{ analysis: {} }]);
});

test('documented version-1 portability schema matches the existing backup payload contract', async () => {
  const backupUrl = pathToFileURL(path.join(__dirname, '../backup.js')).href;
  const { BACKUP_SCHEMA_VERSION, buildPayload } = await import(backupUrl);
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/contracts/bakplanla-backup-payload-v1.schema.json'), 'utf8'));
  const payload = buildPayload({
    tasks: [{ id: 'synthetic-task', title: 'Synthetic task' }],
    documents: [{ id: 'synthetic-document', uri: 'file:///private/synthetic.jpg', title: 'Synthetic document' }],
    todayPreferences: { category: 'park' },
    imagePaths: {},
  });
  assert.equal(BACKUP_SCHEMA_VERSION, 1);
  assert.deepEqual(schema.required, ['tasks', 'documents', 'todayPreferences']);
  assert.deepEqual(Object.keys(payload), ['tasks', 'documents', 'todayPreferences']);
  assert.equal(payload.documents[0].uri, undefined);
  assert.equal(payload.documents[0].hadImage, true);
  assert.equal(schema.properties.documents.items.not.required.includes('uri'), true);
});

test('future portable export v1 is versioned, owner-data-only and represents media without Supabase paths', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/contracts/bakplanla-portable-export-v1.schema.json'), 'utf8'));
  assert.equal(schema.properties.format.const, 'BAKPLANLA_USER_EXPORT');
  assert.equal(schema.properties.format_version.const, 1);
  assert.deepEqual(schema.required, ['format', 'format_version', 'exported_at', 'data', 'media']);
  const documentSchema = schema.properties.data.properties.documents.items;
  assert.equal(documentSchema.required.includes('hadImage'), true);
  assert.equal(documentSchema.allOf[0].then.required.includes('exportMediaPath'), true);
  assert.equal(documentSchema.allOf[1].then.not.required.includes('exportMediaPath'), true);
  assert.equal(documentSchema.not.anyOf.some((condition) => condition.required.includes('imagePath')), true);
  assert.equal(schema.properties.media.items.properties.sha256.pattern, '^[a-f0-9]{64}$');
});
