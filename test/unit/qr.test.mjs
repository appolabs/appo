// @ts-check
import { test, expect } from 'vitest';
import { QrCode, Ecc, renderQr } from '../../src/qr.mjs';

const TEST_URL = 'https://example.com/preview/TESTTOKEN';
const PREVIEW_URL = 'https://app.appo.io/preview/tok_abc123_abcdefghijklmnop';

// ─── Task 1: Encoder correctness ────────────────────────────────────────────

test('QrCode.encodeText returns an object with a valid integer .size', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  expect(Number.isInteger(qr.size)).toBe(true);
  // QR versions 1-40; v1=21 modules. size must be odd and ≥21.
  expect(qr.size).toBeGreaterThanOrEqual(21);
  expect(qr.size % 2).toBe(1); // always odd
});

test('QrCode.encodeText .size is stable for a fixed input', () => {
  const qr1 = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  const qr2 = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  expect(qr1.size).toBe(qr2.size);
});

test('QrCode .size is bounded for a representative preview URL (Pitfall 2)', () => {
  const qr = QrCode.encodeText(PREVIEW_URL, Ecc.MEDIUM);
  // ECC M keeps short URLs at v2-v5 (25-37 modules). Upper safety bound: v10 = 57.
  expect(qr.size).toBeLessThanOrEqual(57);
});

test('getModule returns boolean', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  expect(typeof qr.getModule(0, 0)).toBe('boolean');
  expect(typeof qr.getModule(1, 1)).toBe('boolean');
});

test('finder pattern top-left: corner module (0,0) is dark', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  // The QR finder pattern top-left outer border starts at (0,0) and is dark.
  expect(qr.getModule(0, 0)).toBe(true);
});

test('finder pattern top-left: 7×7 structure', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  // Outer border is all dark (row 0 and row 6 within [0..6]).
  for (let i = 0; i < 7; i++) {
    expect(qr.getModule(i, 0)).toBe(true); // top edge
    expect(qr.getModule(i, 6)).toBe(true); // bottom edge
    expect(qr.getModule(0, i)).toBe(true); // left edge
    expect(qr.getModule(6, i)).toBe(true); // right edge
  }
  // Inner white gap: row 1 col 1..5, row 5 col 1..5, interior of row 2..4
  for (let i = 1; i <= 5; i++) {
    expect(qr.getModule(i, 1)).toBe(false); // inner top
    expect(qr.getModule(i, 5)).toBe(false); // inner bottom
    expect(qr.getModule(1, i)).toBe(false); // inner left
    expect(qr.getModule(5, i)).toBe(false); // inner right
  }
  // Dark 3×3 core at (2,2)..(4,4)
  for (let dy = 2; dy <= 4; dy++) {
    for (let dx = 2; dx <= 4; dx++) {
      expect(qr.getModule(dx, dy)).toBe(true);
    }
  }
});

test('finder pattern top-right: outer corner modules are dark', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  const s = qr.size;
  // Top-right finder at x=[s-7..s-1], y=[0..6]
  expect(qr.getModule(s - 7, 0)).toBe(true);
  expect(qr.getModule(s - 1, 0)).toBe(true);
  expect(qr.getModule(s - 7, 6)).toBe(true);
  expect(qr.getModule(s - 1, 6)).toBe(true);
});

test('finder pattern bottom-left: outer corner modules are dark', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  const s = qr.size;
  // Bottom-left finder at x=[0..6], y=[s-7..s-1]
  expect(qr.getModule(0, s - 7)).toBe(true);
  expect(qr.getModule(6, s - 7)).toBe(true);
  expect(qr.getModule(0, s - 1)).toBe(true);
  expect(qr.getModule(6, s - 1)).toBe(true);
});

test('timing pattern row 6 alternates dark/light', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  // Timing strip on row y=6 from x=8..size-9; starts dark at even positions.
  for (let x = 8; x <= qr.size - 9; x++) {
    const expected = x % 2 === 0;
    expect(qr.getModule(x, 6)).toBe(expected);
  }
});

test('timing pattern col 6 alternates dark/light', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  // Timing strip on col x=6 from y=8..size-9; starts dark at even positions.
  for (let y = 8; y <= qr.size - 9; y++) {
    const expected = y % 2 === 0;
    expect(qr.getModule(6, y)).toBe(expected);
  }
});

// ─── Task 2: renderQr renderer ──────────────────────────────────────────────

test('renderQr returns a non-empty multi-line string', () => {
  const output = renderQr(TEST_URL);
  expect(typeof output).toBe('string');
  expect(output.length).toBeGreaterThan(0);
  const lines = output.split('\n');
  expect(lines.length).toBeGreaterThan(1);
});

test('renderQr output width == size + 8 (4-module quiet zone each side)', () => {
  const qr = QrCode.encodeText(TEST_URL, Ecc.MEDIUM);
  const output = renderQr(TEST_URL);
  const lines = output.split('\n');
  const expectedWidth = qr.size + 8;
  for (const line of lines) {
    expect(line.length).toBe(expectedWidth);
  }
});

test('renderQr first 4 rows are all-space (quiet zone)', () => {
  const output = renderQr(TEST_URL);
  const lines = output.split('\n');
  // Half-block renders 2 module rows per text row; QZ=4 => 2 blank text rows at top/bottom.
  for (let i = 0; i < 2; i++) {
    expect(lines[i].trim()).toBe('');
  }
});

test('renderQr last 2 rows are all-space (quiet zone)', () => {
  const output = renderQr(TEST_URL);
  const lines = output.split('\n');
  for (let i = lines.length - 2; i < lines.length; i++) {
    expect(lines[i].trim()).toBe('');
  }
});

test('renderQr is stable (same output for same input)', () => {
  const out1 = renderQr(TEST_URL);
  const out2 = renderQr(TEST_URL);
  expect(out1).toBe(out2);
});

test('renderQr snapshot (bare matrix, no ANSI)', () => {
  const output = renderQr(TEST_URL);
  // No ANSI escape codes in bare matrix (ESC char followed by '[')
  // eslint-disable-next-line no-control-regex
  expect(output).not.toMatch(/\x1b\[/);
  expect(output).toMatchSnapshot();
});

test('renderQr width <= 80 for a representative preview URL (Pitfall 2)', () => {
  const output = renderQr(PREVIEW_URL);
  const lines = output.split('\n');
  const maxWidth = Math.max(...lines.map((l) => l.length));
  expect(maxWidth).toBeLessThanOrEqual(80);
});

test('renderQr contains block characters (half-block rendering)', () => {
  const output = renderQr(TEST_URL);
  // Should contain at least some half-block glyphs (not pure spaces)
  expect(output).toMatch(/[▀▄█]/u);
});
