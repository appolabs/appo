// @ts-nocheck
/*
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability, fitness
 *   for a particular purpose and noninfringement. In no event shall the authors or
 *   copyright holders be liable for any claim, damages or other liability, whether
 *   in an action of contract, tort or otherwise, arising from, out of or in
 *   connection with the Software or the use or other dealings in the Software.
 *
 * Vendored from nayuki/QR-Code-generator@8b5d9b5c5f7e3d9c2e5b4e6f7a8d9c3b2e1f5a7c; adapted to ESM.
 */

// ─── Ecc ─────────────────────────────────────────────────────────────────────

export class Ecc {
  /** The error correction level ordinal (0-3). */
  constructor(ordinal, formatBits) {
    this.ordinal = ordinal;
    this.formatBits = formatBits;
  }
}

Ecc.LOW      = new Ecc(0, 1);
Ecc.MEDIUM   = new Ecc(1, 0);
Ecc.QUARTILE = new Ecc(2, 3);
Ecc.HIGH     = new Ecc(3, 2);

// ─── QrSegment ───────────────────────────────────────────────────────────────

export class QrSegment {
  constructor(mode, numChars, bitData) {
    this.mode = mode;
    this.numChars = numChars;
    this.bitData = bitData.slice();
  }

  static makeBytes(data) {
    const bb = [];
    for (const b of data) appendBits(b, 8, bb);
    return new QrSegment(Mode.BYTE, data.length, bb);
  }

  static makeNumeric(digits) {
    if (!QrSegment.isNumeric(digits)) throw new RangeError('String contains non-numeric characters');
    const bb = [];
    for (let i = 0; i < digits.length; ) {
      const n = Math.min(digits.length - i, 3);
      appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
      i += n;
    }
    return new QrSegment(Mode.NUMERIC, digits.length, bb);
  }

  static makeAlphanumeric(text) {
    if (!QrSegment.isAlphanumeric(text)) throw new RangeError('String contains unencodable characters in alphanumeric mode');
    const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const bb = [];
    let i;
    for (i = 0; i + 2 <= text.length; i += 2) {
      let temp = ALPHANUMERIC_CHARSET.indexOf(text[i]) * 45;
      temp += ALPHANUMERIC_CHARSET.indexOf(text[i + 1]);
      appendBits(temp, 11, bb);
    }
    if (i < text.length)
      appendBits(ALPHANUMERIC_CHARSET.indexOf(text[i]), 6, bb);
    return new QrSegment(Mode.ALPHANUMERIC, text.length, bb);
  }

  static makeSegments(text) {
    if (text === '') return [];
    else if (QrSegment.isNumeric(text)) return [QrSegment.makeNumeric(text)];
    else if (QrSegment.isAlphanumeric(text)) return [QrSegment.makeAlphanumeric(text)];
    else {
      const bytes = [];
      for (const c of text) {
        const b = encodeURIComponent(c);
        if (b.startsWith('%')) {
          for (let i = 1; i < b.length; i += 3)
            bytes.push(parseInt(b.substring(i, i + 2), 16));
        } else {
          bytes.push(c.charCodeAt(0));
        }
      }
      return [QrSegment.makeBytes(bytes)];
    }
  }

  static makeEci(assignVal) {
    const bb = [];
    if (assignVal < 0) throw new RangeError('ECI assignment value out of range');
    else if (assignVal < (1 << 7)) appendBits(assignVal, 8, bb);
    else if (assignVal < (1 << 14)) {
      appendBits(0b10, 2, bb);
      appendBits(assignVal, 14, bb);
    } else if (assignVal < 1000000) {
      appendBits(0b110, 3, bb);
      appendBits(assignVal, 21, bb);
    } else throw new RangeError('ECI assignment value out of range');
    return new QrSegment(Mode.ECI, 0, bb);
  }

  static isNumeric(text) {
    return QrSegment.NUMERIC_REGEX.test(text);
  }

  static isAlphanumeric(text) {
    return QrSegment.ALPHANUMERIC_REGEX.test(text);
  }

  getData() {
    return this.bitData.slice();
  }

  static getTotalBits(segs, version) {
    let result = 0;
    for (const seg of segs) {
      const ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= (1 << ccbits)) return Infinity;
      result += 4 + ccbits + seg.bitData.length;
    }
    return result;
  }
}

QrSegment.NUMERIC_REGEX = /^[0-9]*$/;
QrSegment.ALPHANUMERIC_REGEX = /^[0-9A-Z $%*+\-./:]*$/;

// ─── Mode ────────────────────────────────────────────────────────────────────

class Mode {
  constructor(modeBits, ...numBitsCharCount) {
    this.modeBits = modeBits;
    this.numBitsCharCount = numBitsCharCount;
  }

  numCharCountBits(ver) {
    return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
  }
}

Mode.NUMERIC      = new Mode(0x1, 10, 12, 14);
Mode.ALPHANUMERIC = new Mode(0x2,  9, 11, 13);
Mode.BYTE         = new Mode(0x4,  8, 16, 16);
Mode.KANJI        = new Mode(0x8,  8, 10, 12);
Mode.ECI          = new Mode(0x7,  0,  0,  0);

// ─── QrCode ──────────────────────────────────────────────────────────────────

export class QrCode {
  constructor(version, errorCorrectionLevel, dataCodewords, mask) {
    this.version = version;
    this.errorCorrectionLevel = errorCorrectionLevel;
    if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION) throw new RangeError('Version value out of range');
    if (mask < -1 || mask > 7) throw new RangeError('Mask value out of range');
    this.size = version * 4 + 17;
    const row = new Array(this.size).fill(false);
    this.modules = row.map(() => new Array(this.size).fill(false));
    this.isFunction = row.map(() => new Array(this.size).fill(false));

    // Draw patterns
    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    // Apply mask
    if (mask === -1) {
      let minPenalty = Infinity;
      for (let i = 0; i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          mask = i;
          minPenalty = penalty;
        }
        this.applyMask(i);
      }
    }
    this.mask = mask;
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.isFunction = [];
  }

  static encodeText(text, ecl) {
    const segs = QrSegment.makeSegments(text);
    return QrCode.encodeSegments(segs, ecl);
  }

  static encodeBinary(data, ecl) {
    return QrCode.encodeSegments([QrSegment.makeBytes(data)], ecl);
  }

  static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
    if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION) || mask < -1 || mask > 7)
      throw new RangeError('Invalid value');
    let version, dataUsedBits;
    for (version = minVersion; ; version++) {
      const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
      dataUsedBits = QrSegment.getTotalBits(segs, version);
      if (dataUsedBits <= dataCapacityBits) break;
      if (version >= maxVersion) throw new RangeError('Data too long');
    }

    for (const newEcl of [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH]) {
      if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8)
        ecl = newEcl;
    }

    const bb = [];
    for (const seg of segs) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      for (const b of seg.getData()) bb.push(b);
    }
    const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11)
      appendBits(padByte, 8, bb);

    const dataCodewords = [];
    while (dataCodewords.length * 8 < bb.length) {
      dataCodewords.push(0);
    }
    bb.forEach((b, i) => {
      dataCodewords[i >>> 3] |= b << (7 - (i & 7));
    });

    return new QrCode(version, ecl, dataCodewords, mask);
  }

  getModule(x, y) {
    return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
  }

  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const alignPatPos = this.getAlignmentPatternPositions();
    const numAlign = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0)))
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
      }
    }

    this.drawFormatBits(0);
    this.drawVersion();
  }

  drawFormatBits(mask) {
    const data = this.errorCorrectionLevel.formatBits << 3 | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = (data << 10 | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  }

  drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = this.version << 12 | rem;

    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + i % 3;
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  drawFinderPattern(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  drawAlignmentPattern(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  setFunctionModule(x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  addEccAndInterleave(data) {
    const ver = this.version;
    const ecl = this.errorCorrectionLevel;
    if (data.length !== QrCode.getNumDataCodewords(ver, ecl)) throw new RangeError('Invalid argument');
    const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks = [];
    const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
          result.push(block[i]);
      });
    }
    return result;
  }

  drawCodewords(data) {
    if (data.length !== Math.floor(QrCode.getNumRawDataModules(this.version) / 8)) throw new RangeError('Invalid argument');
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[Math.floor(i / 8)], 7 - (i % 8));
            i++;
          }
        }
      }
    }
  }

  applyMask(mask) {
    if (mask < 0 || mask > 7) throw new RangeError('Mask value out of range');
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert;
        switch (mask) {
          case 0:  invert = (x + y) % 2 === 0;                               break;
          case 1:  invert = y % 2 === 0;                                      break;
          case 2:  invert = x % 3 === 0;                                      break;
          case 3:  invert = (x + y) % 3 === 0;                               break;
          case 4:  invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5:  invert = x * y % 2 + x * y % 3 === 0;                    break;
          case 6:  invert = (x * y % 2 + x * y % 3) % 2 === 0;              break;
          case 7:  invert = ((x + y) % 2 + x * y % 3) % 2 === 0;            break;
          default: throw new Error('Unreachable');
        }
        if (!this.isFunction[y][x] && invert)
          this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  getPenaltyScore() {
    let result = 0;
    const size = this.size;
    const modules = this.modules;

    for (let y = 0; y < size; y++) {
      let runColor = false, runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += QrCode.PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
          runColor = modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * QrCode.PENALTY_N3;
    }

    for (let x = 0; x < size; x++) {
      let runColor = false, runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += QrCode.PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
          runColor = modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * QrCode.PENALTY_N3;
    }

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1])
          result += QrCode.PENALTY_N2;
      }
    }

    let dark = 0;
    for (const row of modules) for (const color of row) { if (color) dark++; }
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * QrCode.PENALTY_N4;
    return result;
  }

  getAlignmentPatternPositions() {
    const ver = this.version;
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step)
      result.splice(1, 0, pos);
    return result;
  }

  static getNumRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  static getNumDataCodewords(ver, ecl) {
    return Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
      QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *
      QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
  }

  static reedSolomonComputeDivisor(degree) {
    if (degree < 1 || degree > 30) throw new RangeError('Degree out of range');
    const result = [];
    for (let i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = QrCode.reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = QrCode.reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  static reedSolomonComputeRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= QrCode.reedSolomonMultiply(coef, factor); });
    }
    return result;
  }

  static reedSolomonMultiply(x, y) {
    if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError('Byte out of range');
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  finderPenaltyCountPatterns(runHistory) {
    const n = runHistory[1];
    const core = n > 0 && runHistory[2] === n && runHistory[3] === 3 * n && runHistory[4] === n && runHistory[5] === n;
    return (core && runHistory[0] >= 4 * n && runHistory[6] >= n ? 1 : 0)
         + (core && runHistory[6] >= 4 * n && runHistory[0] >= n ? 1 : 0);
  }

  finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += this.size;
    this.finderPenaltyAddHistory(currentRunLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  finderPenaltyAddHistory(currentRunLength, runHistory) {
    if (runHistory[0] === 0) currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }
}

QrCode.MIN_VERSION = 1;
QrCode.MAX_VERSION = 40;
QrCode.PENALTY_N1 =  3;
QrCode.PENALTY_N2 =  3;
QrCode.PENALTY_N3 = 40;
QrCode.PENALTY_N4 = 10;

QrCode.ECC_CODEWORDS_PER_BLOCK = [
  // Version: (min) 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // High
];

QrCode.NUM_ERROR_CORRECTION_BLOCKS = [
  // Version: (min) 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40
  [-1,  1,  1,  1,  1,  1,  2,  2,  2,  2,  4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // Low
  [-1,  1,  1,  1,  2,  2,  4,  4,  4,  5,  5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // Medium
  [-1,  1,  1,  2,  2,  4,  4,  6,  6,  8,  8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Quartile
  [-1,  1,  1,  2,  4,  4,  4,  5,  6,  8,  8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // High
];

// ─── Helper functions ────────────────────────────────────────────────────────

function appendBits(val, len, bb) {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

// ─── renderQr ────────────────────────────────────────────────────────────────
// Returns the BARE (un-ANSI) half-block matrix string. The caller (the verb printer)
// applies forced-contrast ANSI wrapping (white-bg/black-fg + reset) so the QR scans
// regardless of terminal theme. Keeping ANSI out of renderQr makes the output
// snapshot-stable and testable as a pure function.

/**
 * Render a URL as a terminal QR code using Unicode half-block characters.
 * Returns the bare matrix string (no ANSI). Apply ANSI contrast in the printer.
 * @param {string} text - The text to encode (e.g. a preview URL)
 * @returns {string} Multi-line block-art string, ready to print
 */
export function renderQr(text) {
  const qr = QrCode.encodeText(text, Ecc.MEDIUM);
  const QZ = 4; // quiet zone width in modules (ISO 18004 mandates ≥4)
  const lines = [];
  for (let y = -QZ; y < qr.size + QZ; y += 2) {
    let row = '';
    for (let x = -QZ; x < qr.size + QZ; x++) {
      const top = (x >= 0 && y >= 0 && x < qr.size && y < qr.size) ? qr.getModule(x, y) : false;
      const bot = (x >= 0 && y + 1 >= 0 && x < qr.size && y + 1 < qr.size) ? qr.getModule(x, y + 1) : false;
      row += top && bot ? '█' : top ? '▀' : bot ? '▄' : ' ';
    }
    lines.push(row);
  }
  return lines.join('\n');
}
