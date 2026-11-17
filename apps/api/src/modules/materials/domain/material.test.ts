import { expect, test } from 'vitest';
import * as contract from '../public/materials.js';
import type { MaterialFileMetadata, MaterialTexts } from '../public/materials.js';

/** T020 will export the pure normalizers through the existing public surface.
 * Missing behavior fails explicitly, without a missing-module import or substitute implementation.
 */
function texts(input: unknown): MaterialTexts {
  const normalize: unknown = Reflect.get(contract, 'normalizeMaterialTexts');
  if (typeof normalize !== 'function') throw new Error('T020: normalizeMaterialTexts not implemented.');
  return normalize(input) as MaterialTexts;
}
function file(input: unknown): MaterialFileMetadata & { readonly sha256: string } {
  const normalize: unknown = Reflect.get(contract, 'normalizeMaterialFileMetadata');
  if (typeof normalize !== 'function') throw new Error('T020: normalizeMaterialFileMetadata not implemented.');
  return normalize(input) as MaterialFileMetadata & { readonly sha256: string };
}
const metadata = { downloadName: 'estudio.pdf', mediaType: 'application/pdf', byteSize: 1, sha256: 'a'.repeat(64) };

test('texts trim title, normalize empty description to null and keep plain text literal', () => {
  expect(texts({ title: '\u00a0 Material de estudio \u3000', description: ' \t\n' }))
    .toEqual({ title: 'Material de estudio', description: null });
  expect(texts({ title: 'Título', description: '<script>ficticio()</script>' }))
    .toEqual({ title: 'Título', description: '<script>ficticio()</script>' });
});
test('limits count Unicode characters, accept title 200/description 2000 and do not mutate input', () => {
  const input = Object.freeze({ title: '🎓'.repeat(200), description: 'ñ'.repeat(2000) });
  expect(texts(input)).toEqual(input);
});
test.each(['', ' ', 'x'.repeat(201), 'x\r\ncontrol', 'x\u0000control', 'x\u007fcontrol'])(
  'rejects invalid title without converting arbitrary values: %j', title => {
    expect(() => texts({ title, description: null })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
test('text DTO is closed and rejects invalid descriptions/types instead of coercing', () => {
  for (const input of [null, [], { title: 42 }, { title: 'Título', description: 42 },
    { title: 'Título', description: 'x'.repeat(2001) }, { title: 'Título', description: null, state: 'PUBLISHED' }]) {
    expect(() => texts(input)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  }
});
test('metadata accepts decimal byte boundaries, JPEG aliases and safe Unicode names', () => {
  expect(file(metadata)).toEqual(metadata);
  expect(file({ ...metadata, byteSize: 20_000_000 })).toMatchObject({ byteSize: 20_000_000 });
  for (const downloadName of ['foto.jpg', 'foto.jpeg', 'foto.JPG']) {
    expect(file({ ...metadata, downloadName, mediaType: 'image/jpeg' })).toMatchObject({ mediaType: 'image/jpeg' });
  }
  expect(file({ ...metadata, downloadName: 'lección.pdf' }).downloadName).toBe('lección.pdf');
});
test.each(['../estudio.pdf', 'sub/estudio.pdf', 'sub\\estudio.pdf', 'C:\\estudio.pdf',
  'archivo\r\nX-Test: uno.pdf', 'archivo\u0000.pdf', 'x'.repeat(177) + '.pdf', 'estudio.png'])(
  'rejects unsafe, oversized or incompatible filename %j', downloadName => {
    expect(() => file({ ...metadata, downloadName })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
test('metadata rejects unknown fields, invalid lengths, MIME and noncanonical SHA-256', () => {
  for (const overrides of [{ byteSize: 0 }, { byteSize: 20_000_001 }, { byteSize: 1.5 }, { byteSize: '1' },
    { sha256: 'A'.repeat(64) }, { sha256: 'a'.repeat(63) }, { mediaType: 'text/html' }, { bytes: [] }]) {
    expect(() => file({ ...metadata, ...overrides })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  }
});

test('normalization matches DB trim/code points and rejects nonrepresentable UTF-16/NUL', () => {
  expect(texts({ title: '\t Lectura \n', description: undefined })).toEqual({ title: 'Lectura', description: null });
  expect(file({ ...metadata, downloadName: ' lección.pdf ' }).downloadName).toBe('lección.pdf');
  expect(file({ ...metadata, downloadName: 'ñ'.repeat(176) + '.pdf' }).downloadName).toHaveLength(180);
  for (const value of ['x\ud800', 'x\udc00', 'x\u0000']) {
    expect(() => texts({ title: value })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR', fields: ['title'] }));
    expect(() => texts({ title: 'Lectura', description: value })).toThrow(expect.objectContaining({ fields: ['description'] }));
    expect(() => file({ ...metadata, downloadName: value + '.pdf' })).toThrow(expect.objectContaining({ fields: ['downloadName'] }));
  }
});
