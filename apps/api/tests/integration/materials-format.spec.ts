import { createHash } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { identityDatabase } from '../support/identity-database.js';
import { assertAcademicFixtureInputs } from '../support/academic-offering.js';
import { materialFile, materialFileCase, materialFileManifest } from '../support/materials-files.js';
import type { MaterialFileMetadata } from '../../src/modules/materials/public/materials.js';
import { createMaterialsFoundation } from '../../src/app.module.js';

let context: Awaited<ReturnType<typeof identityDatabase>>;
type FileMetadata = MaterialFileMetadata & { readonly sha256: string };
type Validator = (metadata: FileMetadata, bytes: Uint8Array) => FileMetadata | Promise<FileMetadata>;
beforeAll(async () => { assertAcademicFixtureInputs(); context = await identityDatabase('materials_format'); }, 120000);
afterAll(async () => { await context?.cleanup(); });
function validator(): Validator {
  const candidate: unknown = Reflect.get(createMaterialsFoundation(context.environment, context.database.pool), 'validateFile');
  if (typeof candidate !== 'function') throw new Error('T020: materials binary validator not implemented.');
  return candidate as Validator;
}
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function metadata(bytes: Buffer, mediaType: FileMetadata['mediaType'], downloadName: string): FileMetadata {
  return { byteSize: bytes.length, sha256: sha(bytes), mediaType, downloadName };
}

test.each(materialFileManifest.map(entry => ({ id: entry.id, expected: entry.expected })))('$id: server validates the complete file ($expected)', async ({ id, expected }) => {
  const validate = validator(), fixture = materialFileCase(id);
  const input = { byteSize: fixture.byteSize, sha256: fixture.sha256, downloadName: fixture.name,
    mediaType: fixture.mediaType as FileMetadata['mediaType'] };
  const result = Promise.resolve().then(() => validate(input, fixture.bytes));
  if (expected === 'REJECT') await expect(result).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  else expect(await result).toEqual(input);
}, 60000);

test('hash and declared length are checked against actual bytes, not trusted from the intention', async () => {
  const validate = validator(), bytes = materialFile('pdf'), input = metadata(bytes, 'application/pdf', 'estudio.pdf');
  for (const change of [{ sha256: 'f'.repeat(64) }, { byteSize: bytes.length + 1 }]) {
    await expect(Promise.resolve().then(() => validate({ ...input, ...change }, bytes)))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});
test('PNG with matching hash/header/IEND but corrupt CRC is rejected', async () => {
  const validate = validator(), bytes = Buffer.from(materialFile('png'));
  const idat = 33, length = bytes.readUInt32BE(idat); bytes[idat + 8 + length] ^= 0x01;
  await expect(Promise.resolve().then(() => validate(metadata(bytes, 'image/png', 'estudio.png'), bytes)))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
test('JPEG with matching hash/SOI/EOI but out-of-bounds segment is rejected', async () => {
  const validate = validator(), bytes = Buffer.from(materialFile('jpeg')); bytes.writeUInt16BE(65535, 4);
  await expect(Promise.resolve().then(() => validate(metadata(bytes, 'image/jpeg', 'estudio.jpg'), bytes)))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
test('PDF with matching hash/header/EOF but invalid xref is rejected', async () => {
  const validate = validator();
  const bytes = Buffer.from(materialFile('pdf').toString('ascii').replace(/startxref\n\d+/, 'startxref\n0'), 'ascii');
  await expect(Promise.resolve().then(() => validate(metadata(bytes, 'application/pdf', 'estudio.pdf'), bytes)))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
test('identical download names are independent inputs and validation never mutates bytes', async () => {
  const validate = validator(), first = materialFileCase('same-name-first'), second = materialFileCase('same-name-second');
  for (const file of [first, second]) {
    const original = Buffer.from(file.bytes), input = metadata(file.bytes, 'application/pdf', file.name);
    expect(await validate(input, file.bytes)).toEqual(input); expect(file.bytes).toEqual(original);
  }
  expect(first.sha256).not.toBe(second.sha256);
});

test('actual oversized input is 413 even when metadata claims the allowed boundary', async () => {
  const validate = validator(), bytes = materialFile('pdf', 20_000_001);
  await expect(Promise.resolve().then(() => validate({ ...metadata(bytes, 'application/pdf', 'limite.pdf'), byteSize: 20_000_000 }, bytes)))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR', fields: ['byteSize'], status: 413 });
});

test('a Uint8Array view validates only its selected bytes without mutating the surrounding buffer', async () => {
  const validate = validator(), bytes = materialFile('pdf'), padded = Buffer.concat([Buffer.from('prefix'), bytes, Buffer.from('suffix')]);
  const original = Buffer.from(padded), view = new Uint8Array(padded.buffer, padded.byteOffset + 6, bytes.length);
  expect(await validate(metadata(bytes, 'application/pdf', 'estudio.pdf'), view)).toEqual(metadata(bytes, 'application/pdf', 'estudio.pdf'));
  expect(padded).toEqual(original);
});

test('PNG requires first/unique IHDR, IDAT, terminal empty IEND and coherent header even with valid CRCs', async () => {
  const validate = validator(), bytes = materialFile('png');
  const header = bytes.subarray(8, 33), idat = bytes.subarray(33, -12), end = bytes.subarray(-12);
  // Rearrange complete existing chunks so CRCs stay correct; these are structural failures.
  for (const corrupted of [Buffer.concat([bytes.subarray(0, 8), header, header, idat, end]),
    Buffer.concat([bytes.subarray(0, 33), end]), Buffer.concat([bytes, Buffer.from('trailing')]),
    Buffer.concat([bytes.subarray(0, 8), idat, header, end])]) {
    await expect(Promise.resolve().then(() => validate(metadata(corrupted, 'image/png', 'estudio.png'), corrupted)))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});

test('JPEG rejects a signature-only wrapper, missing frame, empty entropy and bytes after EOI', async () => {
  const validate = validator(), bytes = materialFile('jpeg');
  const frame = bytes.indexOf(Buffer.from([0xff, 0xc0])), scan = bytes.indexOf(Buffer.from([0xff, 0xda]));
  const scanEnd = scan + 2 + bytes.readUInt16BE(scan + 2);
  for (const corrupted of [Buffer.from([0xff, 0xd8, 0xff, 0xd9]), Buffer.concat([bytes.subarray(0, frame), bytes.subarray(scan)]),
    Buffer.concat([bytes.subarray(0, scanEnd), bytes.subarray(-2)]), Buffer.concat([bytes, Buffer.from('trailing')])]) {
    await expect(Promise.resolve().then(() => validate(metadata(corrupted, 'image/jpeg', 'estudio.jpg'), corrupted)))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});

test('PDF checks referenced object headers, stream length and endobj, beyond matching hash/EOF', async () => {
  const validate = validator(), source = materialFile('pdf').toString('ascii');
  // Same byte count keeps all xref offsets valid except the field deliberately corrupted.
  for (const corrupted of [source.replace('1 0 obj', '8 0 obj'), source.replace('/Length 4', '/Length 9'),
    source.replace('endobj', 'endobx'), source.replace('/Root 1 0 R', '/Root 9 0 R')].map(value => Buffer.from(value, 'ascii'))) {
    await expect(Promise.resolve().then(() => validate(metadata(corrupted, 'application/pdf', 'estudio.pdf'), corrupted)))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});

test('PDF incremental update follows Prev and accepts the latest catalog without discarding earlier objects', async () => {
  const validate = validator(), original = materialFile('pdf'), source = original.toString('ascii');
  const previous = /startxref\n(\d+)/.exec(source)![1];
  const update = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'ascii');
  const xref = original.length + update.length;
  const trailer = Buffer.from(`xref\n1 1\n${String(original.length).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R /Prev ${previous} >>\nstartxref\n${xref}\n%%EOF\n`, 'ascii');
  const bytes = Buffer.concat([original, update, trailer]), input = metadata(bytes, 'application/pdf', 'actualizado.pdf');
  expect(await validate(input, bytes)).toEqual(input);
  const cyclic = Buffer.from(bytes.toString('ascii').replace(`/Prev ${previous}`, `/Prev ${xref}`), 'ascii');
  await expect(Promise.resolve().then(() => validate(metadata(cyclic, 'application/pdf', 'ciclo.pdf'), cyclic)))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

test('PDF 1.5 cross-reference stream accepts bounded framing and rejects invalid W/stream termination', async () => {
  const validate = validator(), source = materialFile('pdf').toString('ascii').replace('%PDF-1.4', '%PDF-1.5');
  const prefix = Buffer.from(source.slice(0, source.indexOf('xref\n')), 'ascii');
  const table = Buffer.alloc(6 * 7); table.writeUInt16BE(65535, 5);
  const offsets = [...source.matchAll(/(?:^|\n)(\d+) 0 obj\n/g)].map(match => match.index! + (source[match.index!] === '\n' ? 1 : 0));
  for (let id = 1; id <= 5; id++) { table[id * 7] = 1; table.writeUInt32BE(id === 5 ? prefix.length : offsets[id - 1], id * 7 + 1); }
  function build(widths = '1 4 2', end = 'endstream') {
    return Buffer.concat([prefix, Buffer.from(`5 0 obj\n<< /Type /XRef /Size 6 /Root 1 0 R /W [${widths}] /Length ${table.length} >>\nstream\n`, 'ascii'),
      table, Buffer.from(`\n${end}\nendobj\nstartxref\n${prefix.length}\n%%EOF\n`, 'ascii')]);
  }
  const bytes = build(), input = metadata(bytes, 'application/pdf', 'moderno.pdf'); expect(await validate(input, bytes)).toEqual(input);
  for (const invalid of [build('0 0 0'), build('1 4 2', 'endstreaX')]) {
    await expect(Promise.resolve().then(() => validate(metadata(invalid, 'application/pdf', 'moderno.pdf'), invalid)))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
});
