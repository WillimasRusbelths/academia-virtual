import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { materialFile, materialFileCase, materialFileManifest, MATERIAL_FILE_LIMIT } from '../support/materials-files.js';

// Fixture checks only: these do not exercise the future production validator.
function checkPdf(bytes: Buffer) {
  const text = bytes.toString('ascii');
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);
  const offset = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  expect(text.slice(offset, offset + 9)).toBe('xref\n0 5\n');
  const entries = text.slice(offset).split('\n').slice(3, 7);
  expect(entries).toHaveLength(4);
  entries.forEach((entry, index) => {
    const objectOffset = Number(entry.slice(0, 10));
    expect(text.slice(objectOffset).startsWith(`${index + 1} 0 obj\n`)).toBe(true);
  });
  const stream = text.match(/\/Length (\d+) >>\nstream\n/)!;
  const streamStart = stream.index! + stream[0].length;
  const streamEnd = streamStart + Number(stream[1]);
  expect(text.slice(streamEnd, streamEnd + 9)).toBe('endstream');
  expect(text.slice(streamStart, streamEnd).trim()).toMatch(/^q\n *Q$/);
  expect(text).toContain('/Type /Catalog');
  expect(text).toContain('/Type /Page /Parent 2 0 R');
}

function checkPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let offset = 8; const types: string[] = []; const compressed: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 8 + length;
    expect(end + 4).toBeLessThanOrEqual(bytes.length);
    // Independent CRC calculation, using a lookup table rather than the builder's loop.
    const table = Array.from({ length: 256 }, (_, n) => {
      let value = n;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      return value >>> 0;
    });
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end; index++) crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    expect((crc ^ 0xffffffff) >>> 0).toBe(bytes.readUInt32BE(end));
    if (type === 'IHDR') {
      expect(length).toBe(13);
      expect(bytes.readUInt32BE(offset + 8)).toBe(1);
      expect(bytes.readUInt32BE(offset + 12)).toBe(1);
    }
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, end));
    if (type === 'IEND') { expect(length).toBe(0); expect(end + 4).toBe(bytes.length); }
    types.push(type); offset = end + 4;
  }
  expect(types[0]).toBe('IHDR'); expect(types.at(-1)).toBe('IEND');
  expect(inflateSync(Buffer.concat(compressed))).toEqual(Buffer.from([0, 128]));
}

function checkJpeg(bytes: Buffer) {
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  let offset = 2; const markers: number[] = [];
  while (offset < bytes.length) {
    expect(bytes[offset]).toBe(0xff);
    const marker = bytes[offset + 1]; const length = bytes.readUInt16BE(offset + 2);
    expect(length).toBeGreaterThanOrEqual(2);
    expect(offset + length + 2).toBeLessThanOrEqual(bytes.length);
    markers.push(marker);
    if (marker === 0xc0) {
      expect(bytes[offset + 4]).toBe(8);
      expect(bytes.readUInt16BE(offset + 5)).toBe(1);
      expect(bytes.readUInt16BE(offset + 7)).toBe(1);
    }
    offset += length + 2;
    if (marker === 0xda) break;
  }
  expect(markers.filter(marker => marker !== 0xfe)).toEqual([0xdb, 0xc0, 0xc4, 0xda]);
  // Decode the two single-symbol Huffman codes: DC category 0 and AC EOB.
  expect(bytes[offset] >>> 6).toBe(0);
  expect(bytes[offset] & 0x3f).toBe(0x3f); // entropy byte has legal one-bit fill
  expect(bytes.subarray(offset + 1)).toEqual(Buffer.from([0xff, 0xd9]));
}

describe('T004 deterministic synthetic file corpus (no database)', () => {
  test.each(['pdf', 'jpeg', 'png'] as const)('%s is complete at small, exact limit and one byte over', format => {
    const check = { pdf: checkPdf, jpeg: checkJpeg, png: checkPng }[format];
    for (const size of [undefined, MATERIAL_FILE_LIMIT, MATERIAL_FILE_LIMIT + 1]) {
      const bytes = materialFile(format, size);
      if (size !== undefined) expect(bytes.length).toBe(size);
      check(bytes);
    }
  });

  test('all identities are unique and hashes are reproducible, including rejected fixtures', () => {
    expect(new Set(materialFileManifest.map(item => item.id)).size).toBe(materialFileManifest.length);
    for (const item of materialFileManifest) {
      const file = materialFileCase(item.id);
      expect(file.byteSize).toBe(file.bytes.length);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(createHash('sha256').update(materialFileCase(item.id).bytes).digest('hex')).toBe(file.sha256);
    }
  });

  test('boundary and adversarial cases carry the intended independent inputs', () => {
    expect(materialFileCase('empty').byteSize).toBe(0);
    expect(materialFileCase('one-byte').byteSize).toBe(1);
    expect(materialFileCase('one-byte').expected).toBe('REJECT');
    expect(materialFileCase('false-extension').bytes).toEqual(materialFile('png'));
    expect(materialFileCase('false-extension').name.endsWith('.pdf')).toBe(true);
    expect(materialFileCase('jpg-valid').bytes).toEqual(materialFile('jpeg'));
    for (const format of ['pdf', 'jpeg', 'png'] as const) {
      expect(materialFileCase(`${format}-truncated`).bytes).toEqual(materialFile(format).subarray(0, -8));
      expect(materialFileCase(`${format}-truncated`).expected).toBe('REJECT');
      expect(materialFileCase(`${format}-limit`).expected).toBe('ACCEPT');
      expect(materialFileCase(`${format}-excess`).expected).toBe('REJECT');
    }
    const first = materialFileCase('same-name-first'); const second = materialFileCase('same-name-second');
    expect(first.name).toBe(second.name); expect(first.sha256).not.toBe(second.sha256);
    checkPdf(first.bytes); checkPdf(second.bytes);
  });

  test('fixture allocation is bounded and caller mutations do not contaminate later tests', () => {
    expect(() => materialFile('pdf', MATERIAL_FILE_LIMIT + 2)).toThrow();
    expect(() => materialFile('png', -1)).toThrow();
    expect(() => materialFile('jpeg', 1.5)).toThrow();
    expect(() => materialFileCase('unknown')).toThrow();
    const original = materialFileCase('pdf-valid'); original.bytes.fill(0);
    checkPdf(materialFileCase('pdf-valid').bytes);
  });
});
