import { createHash } from 'node:crypto';
import { MATERIAL_FILE_LIMIT, normalizeMaterialFileMetadata } from '../domain/material.js';
import type { MaterialFileExpectation } from '../domain/material.js';
import { MaterialError } from '../domain/material-error.js';
import { validatePdfStructure } from './pdf-structure.js';

function requireFormat(condition: unknown): asserts condition {
  if (!condition) throw new MaterialError('VALIDATION_ERROR', ['mediaType']);
}
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function png(bytes: Buffer): void {
  requireFormat(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
  let offset = 8, header = false, palette = false, image = false, afterImage = false, imageBytes = 0;
  let colour = -1, depth = -1;
  while (offset < bytes.length) {
    requireFormat(offset + 12 <= bytes.length);
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    requireFormat(length <= 0x7fffffff && end <= bytes.length);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    // Check actual bytes: Buffer's ASCII decoder masks the high bit.
    requireFormat(bytes.subarray(offset + 4, offset + 8).every(byte => byte >= 65 && byte <= 90 || byte >= 97 && byte <= 122));
    requireFormat(type[2] === type[2].toUpperCase());
    requireFormat(crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4));
    const data = offset + 8;
    if (!header) requireFormat(type === 'IHDR');
    if (type === 'IHDR') {
      requireFormat(!header && offset === 8 && length === 13);
      const width = bytes.readUInt32BE(data), height = bytes.readUInt32BE(data + 4);
      depth = bytes[data + 8]; colour = bytes[data + 9];
      const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      requireFormat(width > 0 && width <= 0x7fffffff && height > 0 && height <= 0x7fffffff
        && depths[colour]?.includes(depth) && bytes[data + 10] === 0 && bytes[data + 11] === 0 && bytes[data + 12] <= 1);
      header = true;
    } else if (type === 'PLTE') {
      requireFormat(!palette && !image && colour !== 0 && colour !== 4 && length > 0 && length <= 768 && length % 3 === 0
        && (colour !== 3 || length / 3 <= 2 ** depth));
      palette = true;
    } else if (type === 'IDAT') {
      requireFormat(!afterImage && (colour !== 3 || palette)); image = true; imageBytes += length;
    } else if (type === 'IEND') {
      requireFormat(length === 0 && image && imageBytes > 0 && end === bytes.length); return;
    } else {
      requireFormat(type[0] === type[0].toLowerCase()); // Unknown critical chunk is not a compatible PNG.
      if (image) afterImage = true;
    }
    offset = end;
  }
  requireFormat(false);
}

function jpeg(bytes: Buffer): void {
  requireFormat(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8);
  let offset = 2, frame = false, scan = false, inScan = false, scanBytes = 0;
  const components = new Set<number>();
  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) { offset++; scanBytes++; continue; }
    requireFormat(bytes[offset++] === 0xff);
    while (bytes[offset] === 0xff) offset++;
    requireFormat(offset < bytes.length);
    const marker = bytes[offset++];
    if (inScan && marker === 0x00) { scanBytes++; continue; }
    if (inScan && marker >= 0xd0 && marker <= 0xd7) continue;
    if (inScan) requireFormat(scanBytes > 0);
    inScan = false;
    if (marker === 0xd9) { requireFormat(frame && scan && offset === bytes.length); return; }
    requireFormat(marker !== 0xd8 && marker !== 0x00 && !(marker >= 0xd0 && marker <= 0xd7));
    if (marker === 0x01) continue; // TEM has no length.
    requireFormat(marker >= 0xc0 && offset + 2 <= bytes.length);
    const length = bytes.readUInt16BE(offset), end = offset + length;
    requireFormat(length >= 2 && end <= bytes.length);
    const data = offset + 2;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      requireFormat(!frame && length >= 8 && bytes[data] > 0 && bytes[data] <= 16
        && bytes.readUInt16BE(data + 1) > 0 && bytes.readUInt16BE(data + 3) > 0);
      const count = bytes[data + 5]; requireFormat(count > 0 && length === 8 + count * 3);
      for (let index = 0; index < count; index++) {
        const id = bytes[data + 6 + index * 3], sampling = bytes[data + 7 + index * 3];
        requireFormat(!components.has(id) && (sampling >> 4) >= 1 && (sampling >> 4) <= 4 && (sampling & 15) >= 1 && (sampling & 15) <= 4);
        components.add(id);
      }
      frame = true;
    } else if (marker === 0xda) {
      const count = bytes[data]; requireFormat(frame && count > 0 && count <= 4 && length === 6 + count * 2);
      const ids = new Set<number>();
      for (let index = 0; index < count; index++) {
        const id = bytes[data + 1 + index * 2]; requireFormat(components.has(id) && !ids.has(id)); ids.add(id);
      }
      scan = true; inScan = true; scanBytes = 0;
    } else if (marker === 0xdb) {
      let table = data; requireFormat(table < end);
      while (table < end) {
        const info = bytes[table++], precision = info >> 4;
        requireFormat(precision <= 1 && (info & 15) <= 3); table += 64 * (precision + 1);
      }
      requireFormat(table === end);
    } else if (marker === 0xc4) {
      let table = data; requireFormat(table < end);
      while (table < end) {
        const info = bytes[table++]; requireFormat((info >> 4) <= 1 && (info & 15) <= 3 && table + 16 <= end);
        let symbols = 0, available = 1;
        for (let index = 0; index < 16; index++) {
          const count = bytes[table++]; symbols += count; available = available * 2 - count; requireFormat(available >= 0);
        }
        requireFormat(symbols > 0 && symbols <= 256); table += symbols;
      }
      requireFormat(table === end);
    } else if (marker === 0xdd) requireFormat(length === 4);
    offset = end;
  }
  requireFormat(false);
}

/** Bounded container/structure checks, not rendering, decompression or malware scanning.
 * No IO, mutation, SQL or copies of the whole binary. Call outside a DB transaction.
 */
export function validateMaterialFile(metadata: unknown, contents: Uint8Array): MaterialFileExpectation {
  const expected = normalizeMaterialFileMetadata(metadata);
  if (!(contents instanceof Uint8Array)) throw new MaterialError('VALIDATION_ERROR', ['byteSize']);
  if (contents.byteLength > MATERIAL_FILE_LIMIT) throw new MaterialError('VALIDATION_ERROR', ['byteSize'], undefined, 413);
  if (contents.byteLength !== expected.byteSize) throw new MaterialError('VALIDATION_ERROR', ['byteSize']);
  const bytes = Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expected.sha256) throw new MaterialError('VALIDATION_ERROR', ['sha256']);
  if (expected.mediaType === 'image/png') png(bytes);
  else if (expected.mediaType === 'image/jpeg') jpeg(bytes);
  else validatePdfStructure(bytes);
  return { ...expected, sha256 };
}
