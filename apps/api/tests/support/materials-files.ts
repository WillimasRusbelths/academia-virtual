import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

// Synthetic, deterministic documents/images. No personal data, filesystem or DB access.
export const MATERIAL_FILE_LIMIT = 20_000_000;
export type FixtureFormat = 'pdf' | 'jpeg' | 'png';
export type MaterialFileCase = {
  id: string;
  name: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  expected: 'ACCEPT' | 'REJECT';
  reason: string;
  bytes: Buffer;
};

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size?: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; // 1x1 grayscale
  const parts = [Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header)];
  const image = chunk('IDAT', deflateSync(Buffer.from([0, 128])));
  const end = chunk('IEND', Buffer.alloc(0));
  const baseSize = parts.reduce((n, p) => n + p.length, 0) + image.length + end.length;
  if (size !== undefined && size !== baseSize) {
    if (size < baseSize + 14) throw new Error('PNG fixture size cannot hold a text chunk.');
    // Legal ancillary tEXt chunk, keyword + NUL + ASCII text, before IEND.
    parts.push(chunk('tEXt', Buffer.concat([Buffer.from('F\0'), Buffer.alloc(size - baseSize - 14, 65)])));
  }
  return Buffer.concat([...parts, image, end]);
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]); header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function jpeg(size?: number): Buffer {
  // Baseline grayscale 1x1, quantization=1, DC=0 and EOB: a uniform gray pixel.
  const counts = Buffer.from([1, ...Array<number>(15).fill(0)]);
  const prefix = [Buffer.from([0xff, 0xd8]),
    jpegSegment(0xdb, Buffer.from([0, ...Array<number>(64).fill(1)])),
    jpegSegment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    jpegSegment(0xc4, Buffer.concat([Buffer.from([0]), counts, Buffer.from([0]),
      Buffer.from([0x10]), counts, Buffer.from([0])]))];
  const suffix = [jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x3f, 0xff, 0xd9])];
  const baseSize = [...prefix, ...suffix].reduce((n, p) => n + p.length, 0);
  let remaining = size === undefined ? 0 : size - baseSize;
  if (remaining < 0 || (remaining > 0 && remaining < 4)) throw new Error('JPEG fixture size cannot hold a comment.');
  while (remaining) {
    let total = Math.min(remaining, 65537);
    if (remaining > total && remaining - total < 4) total -= 4 - (remaining - total);
    prefix.push(jpegSegment(0xfe, Buffer.alloc(total - 4, 65))); // COM, not trailing padding
    remaining -= total;
  }
  return Buffer.concat([...prefix, ...suffix]);
}

function pdf(size?: number): Buffer {
  function build(padding: number): Buffer {
    const stream = `q\n${' '.repeat(padding)}Q\n`;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`];
    let text = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((object, i) => { offsets.push(text.length); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = text.length;
    text += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
    text += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(text, 'ascii');
  }
  let padding = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = build(padding);
    if (size === undefined || bytes.length === size) return bytes;
    padding += size - bytes.length;
    if (padding < 0) break;
  }
  throw new Error('PDF fixture size cannot hold a complete document.');
}

export function materialFile(format: FixtureFormat, size?: number): Buffer {
  if (size !== undefined && (!Number.isSafeInteger(size) || size > MATERIAL_FILE_LIMIT + 1 || size < 1)) {
    throw new Error('Fixture size outside bounded test corpus.');
  }
  return ({ pdf, jpeg, png })[format](size);
}

export function materialFileCase(id: string): MaterialFileCase {
  const item = materialFileManifest.find(entry => entry.id === id);
  if (!item) throw new Error('Unknown material fixture.');
  const bytes = item.build();
  return { id, name: item.name, mediaType: item.mediaType, expected: item.expected, reason: item.reason,
    bytes, byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

type ManifestEntry = Pick<MaterialFileCase, 'id' | 'name' | 'mediaType' | 'expected' | 'reason'> & { build(): Buffer };
const mime = { pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png' };
export const materialFileManifest: readonly ManifestEntry[] = [
  ...(['pdf', 'jpeg', 'png'] as const).flatMap(format => [
    { id: `${format}-valid`, name: `estudio.${format}`, mediaType: mime[format], expected: 'ACCEPT' as const,
      reason: 'Complete synthetic document/image', build: () => materialFile(format) },
    { id: `${format}-limit`, name: `limite.${format}`, mediaType: mime[format], expected: 'ACCEPT' as const,
      reason: 'Exactly 20 000 000 bytes, complete format', build: () => materialFile(format, MATERIAL_FILE_LIMIT) },
    { id: `${format}-excess`, name: `exceso.${format}`, mediaType: mime[format], expected: 'REJECT' as const,
      reason: '20 000 001 bytes, complete format', build: () => materialFile(format, MATERIAL_FILE_LIMIT + 1) },
    { id: `${format}-truncated`, name: `cortado.${format}`, mediaType: mime[format], expected: 'REJECT' as const,
      reason: 'Missing final structure', build: () => materialFile(format).subarray(0, -8) },
  ]),
  { id: 'jpg-valid', name: 'estudio.jpg', mediaType: mime.jpeg, expected: 'ACCEPT',
    reason: 'JPEG extension alias', build: () => jpeg() },
  { id: 'empty', name: 'vacio.pdf', mediaType: mime.pdf, expected: 'REJECT',
    reason: 'Zero bytes', build: () => Buffer.alloc(0) },
  { id: 'one-byte', name: 'uno.pdf', mediaType: mime.pdf, expected: 'REJECT',
    reason: '1 byte is within size range 1–20 000 000, but not a valid format', build: () => Buffer.from('%') },
  { id: 'false-extension', name: 'falso.pdf', mediaType: mime.pdf, expected: 'REJECT',
    reason: 'PNG contents declared as PDF', build: () => png() },
  { id: 'same-name-first', name: 'estudio.pdf', mediaType: mime.pdf, expected: 'ACCEPT',
    reason: 'Same download name, first contents', build: () => pdf() },
  { id: 'same-name-second', name: 'estudio.pdf', mediaType: mime.pdf, expected: 'ACCEPT',
    reason: 'Same download name, distinct complete contents', build: () => pdf(1024) },
];

// Serializable manifest: binary data stays in memory and out of evidence/logs.
export function materialFileInventory() {
  return materialFileManifest.map(({ id }) => {
    const { bytes: _bytes, ...entry } = materialFileCase(id);
    void _bytes;
    return entry;
  });
}
