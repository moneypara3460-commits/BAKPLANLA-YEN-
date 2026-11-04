/*
===========================================================
  BAKPLANLA — QR kodu üretici (gerçek, taranabilir)
  Saf JavaScript, bağımlılık yok → Node ile test edilebilir ve React Native'de
  mevcut kare ızgarasıyla (View) çizilir; yeni bir kütüphane eklemeye gerek kalmaz.

  Desteklenen: QR Model 2, bayt (byte) kipi, sürüm 1–10, hata düzeltme seviyesi M.
  UTF-8 metin kodlanır (ECI kullanılmaz; okuyucular UTF-8'i kendiliğinden tanır).

  Doğrulama: üretilen matris Node testinde görüntüye çevrilip gerçek bir QR
  çözücüyle (OpenCV) okunarak doğrulanmıştır (tests/qrcode.test.mjs).
===========================================================
*/

/* ---------- sürüm tabloları (seviye M) ---------- */

// [sürüm]: { ec: blok başına hata düzeltme kodu, g1: 1. grup blok sayısı, d1: 1. grup veri kodu,
//            g2: 2. grup blok sayısı, d2: 2. grup veri kodu }
const VERSIONS = {
  1: { ec: 10, g1: 1, d1: 16, g2: 0, d2: 0 },
  2: { ec: 16, g1: 1, d1: 28, g2: 0, d2: 0 },
  3: { ec: 26, g1: 1, d1: 44, g2: 0, d2: 0 },
  4: { ec: 18, g1: 2, d1: 32, g2: 0, d2: 0 },
  5: { ec: 24, g1: 2, d1: 43, g2: 0, d2: 0 },
  6: { ec: 16, g1: 4, d1: 27, g2: 0, d2: 0 },
  7: { ec: 18, g1: 4, d1: 31, g2: 0, d2: 0 },
  8: { ec: 22, g1: 2, d1: 38, g2: 2, d2: 39 },
  9: { ec: 22, g1: 3, d1: 36, g2: 2, d2: 37 },
  10: { ec: 26, g1: 4, d1: 43, g2: 1, d2: 44 },
};

const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

export const MAX_VERSION = 10;
export const EC_LEVEL = 'M';

const dataCapacity = (version) => {
  const v = VERSIONS[version];
  return v.g1 * v.d1 + v.g2 * v.d2;
};

/* ---------- GF(256) ve Reed-Solomon ---------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // QR'ın ilkel polinomu
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const rsGenerator = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= gfMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  // Katsayılar yukarıda en düşük dereceden saklanır; bölme işlemi en yüksek derece başta bekler.
  return poly.reverse();
};

const rsEncode = (data, ecCount) => {
  const gen = rsGenerator(ecCount);
  const result = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < ecCount; i += 1) result[i] ^= gfMul(gen[i + 1], factor);
  }
  return result;
};

/* ---------- BCH (biçim ve sürüm bilgisi) ---------- */

const bchFormat = (data) => {
  let d = data << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if (d & (1 << (i + 10))) d ^= 0x537 << i;
  }
  return ((data << 10) | d) ^ 0x5412;
};

const bchVersion = (version) => {
  let d = version << 12;
  for (let i = 5; i >= 0; i -= 1) {
    if (d & (1 << (i + 12))) d ^= 0x1f25 << i;
  }
  return (version << 12) | d;
};

/* ---------- metin → bit dizisi ---------- */

// UTF-8 bayt dizisi (TextEncoder olmadan; React Native'de her sürümde bulunmayabilir).
export const utf8Bytes = (text) => {
  const out = [];
  const str = String(text == null ? '' : text);
  for (let i = 0; i < str.length; i += 1) {
    let code = str.codePointAt(i);
    if (code > 0xffff) i += 1;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return out;
};

export const chooseVersion = (byteLength) => {
  for (let v = 1; v <= MAX_VERSION; v += 1) {
    const countBits = v < 10 ? 8 : 16;
    const needBits = 4 + countBits + byteLength * 8;
    if (needBits <= dataCapacity(v) * 8) return v;
  }
  return null;
};

const buildCodewords = (bytes, version) => {
  const info = VERSIONS[version];
  const totalData = dataCapacity(version);
  const countBits = version < 10 ? 8 : 16;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);              // bayt kipi
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);

  // sonlandırıcı + bayta tamamlama
  for (let i = 0; i < 4 && bits.length < totalData * 8; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // dolgu baytları (standart: 236, 17 sırayla)
  const PADS = [0xec, 0x11];
  let p = 0;
  while (codewords.length < totalData) {
    codewords.push(PADS[p % 2]);
    p += 1;
  }

  // bloklara ayır, her bloğa hata düzeltme kodu üret
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < info.g1; i += 1) {
    const data = codewords.slice(offset, offset + info.d1);
    offset += info.d1;
    blocks.push({ data, ec: rsEncode(data, info.ec) });
  }
  for (let i = 0; i < info.g2; i += 1) {
    const data = codewords.slice(offset, offset + info.d2);
    offset += info.d2;
    blocks.push({ data, ec: rsEncode(data, info.ec) });
  }

  // blokları çaprazlamasına (interleave) birleştir
  const out = [];
  const maxData = Math.max(info.d1, info.d2 || 0);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < info.ec; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return out;
};

/* ---------- matris ---------- */

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

const makeEmpty = (size) => {
  const m = [];
  for (let i = 0; i < size; i += 1) m.push(new Array(size).fill(null));
  return m;
};

const placeFinder = (m, row, col) => {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[rr][cc] = inRing || inCore ? 1 : 0;
    }
  }
};

const placeAlignment = (m, version) => {
  const positions = ALIGNMENT[version];
  const last = m.length - 1;
  for (const r of positions) {
    for (const c of positions) {
      // sol üst / sağ üst / sol alt köşelerdeki bulucu desenlerle çakışanlar atlanır
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= last - 8) || (r >= last - 8 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          m[r + dr][c + dc] = ring === 1 ? 0 : 1;
        }
      }
    }
  }
};

const reserveFormat = (m) => {
  const size = m.length;
  for (let i = 0; i < 9; i += 1) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i += 1) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
  }
};

const buildBase = (version) => {
  const size = version * 4 + 17;
  const m = makeEmpty(size);
  const reserved = makeEmpty(size);

  placeFinder(m, 0, 0);
  placeFinder(m, 0, size - 7);
  placeFinder(m, size - 7, 0);
  placeAlignment(m, version);

  // zamanlama desenleri
  for (let i = 8; i < size - 8; i += 1) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0;
  }
  m[size - 8][8] = 1; // her zaman koyu olan modül

  reserveFormat(m);

  if (version >= 7) {
    const bits = bchVersion(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = (bits >> i) & 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      m[r][c] = bit;
      m[c][r] = bit;
    }
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) reserved[r][c] = m[r][c] !== null;
  }
  return { matrix: m, reserved };
};

const placeData = (matrix, reserved, codewords) => {
  const size = matrix.length;
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i -= 1) bits.push((cw >> i) & 1);

  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // dikey zamanlama sütunu atlanır
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (reserved[row][c]) continue;
        matrix[row][c] = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
};

const applyMask = (matrix, reserved, maskIndex) => {
  const size = matrix.length;
  const out = matrix.map((row) => row.slice());
  const fn = MASKS[maskIndex];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (reserved[r][c]) continue;
      if (fn(r, c)) out[r][c] ^= 1;
    }
  }
  return out;
};

const writeFormat = (matrix, maskIndex) => {
  const size = matrix.length;
  const bits = bchFormat((0b00 << 3) | maskIndex); // seviye M = 00
  const get = (i) => (bits >> i) & 1;

  // birinci kopya: sol üstteki bulucu desenin çevresi (önce 8. sütun, sonra 8. satır)
  for (let i = 0; i <= 5; i += 1) matrix[i][8] = get(i);
  matrix[7][8] = get(6);
  matrix[8][8] = get(7);
  matrix[8][7] = get(8);
  for (let i = 9; i <= 14; i += 1) matrix[8][14 - i] = get(i);

  // ikinci kopya: sol alt ve sağ üst

  /* İkinci kopya birinci kopyanın TERS bit sırasıyla yerleşir:
     sol altta satır (size-1) → bit 14 ... satır (size-7) → bit 8,
     sağ üstte sütun (size-7) → bit 6 ... sütun (size-1) → bit 0.
     (size-8, 8) konumu format biti değil, her zaman koyu olan modüldür. */
  for (let i = 0; i <= 6; i += 1) matrix[size - 1 - i][8] = get(14 - i);
  for (let i = 7; i <= 14; i += 1) matrix[8][size - 15 + i] = get(14 - i);

  matrix[size - 8][8] = 1;
};

/* ---------- ceza puanı (en iyi maskeyi seçmek için) ---------- */

const penalty = (m) => {
  const size = m.length;
  let score = 0;

  const runScore = (run) => (run >= 5 ? 3 + (run - 5) : 0);
  for (let r = 0; r < size; r += 1) {
    let run = 1;
    for (let c = 1; c < size; c += 1) {
      if (m[r][c] === m[r][c - 1]) run += 1;
      else { score += runScore(run); run = 1; }
    }
    score += runScore(run);
  }
  for (let c = 0; c < size; c += 1) {
    let run = 1;
    for (let r = 1; r < size; r += 1) {
      if (m[r][c] === m[r - 1][c]) run += 1;
      else { score += runScore(run); run = 1; }
    }
    score += runScore(run);
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (arr, pattern) => pattern.every((v, i) => arr[i] === v);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c <= size - 11; c += 1) {
      const row = m[r].slice(c, c + 11);
      if (matches(row, P1) || matches(row, P2)) score += 40;
      const col = [];
      for (let k = 0; k < 11; k += 1) col.push(m[c + k][r]);
      if (matches(col, P1) || matches(col, P2)) score += 40;
    }
  }

  let dark = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) dark += m[r][c];
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return score;
};

/* ---------- genel arayüz ---------- */

/*
  Metni taranabilir bir QR matrisine çevirir.
  Dönüş: { ok: true, matrix: [[0|1]], size, version } ya da { ok: false, reason }
  reason: 'empty' (boş metin) | 'toolong' (sürüm 10'a sığmıyor)
*/
export const createQrMatrix = (text, forceMask = null) => {
  const bytes = utf8Bytes(text);
  if (!bytes.length) return { ok: false, reason: 'empty' };
  const version = chooseVersion(bytes.length);
  if (!version) return { ok: false, reason: 'toolong' };

  const codewords = buildCodewords(bytes, version);
  const { matrix, reserved } = buildBase(version);
  const working = matrix.map((row) => row.map((v) => (v === null ? 0 : v)));
  placeData(working, reserved, codewords);

  let best = null;
  const masks = forceMask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forceMask];
  for (const mask of masks) {
    const candidate = applyMask(working, reserved, mask);
    writeFormat(candidate, mask);
    const score = penalty(candidate);
    if (!best || score < best.score) best = { score, matrix: candidate };
  }

  return { ok: true, matrix: best.matrix, size: best.matrix.length, version };
};
