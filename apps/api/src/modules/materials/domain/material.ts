import { MaterialError } from './material-error.js';
import type { MaterialField } from './material-error.js';

export type MaterialMediaType = 'application/pdf' | 'image/jpeg' | 'image/png';
export interface MaterialTexts { readonly title: string; readonly description: string | null }
export interface MaterialFileMetadata {
  readonly downloadName: string;
  readonly mediaType: MaterialMediaType;
  readonly byteSize: number;
}
export const MATERIAL_FILE_LIMIT = 20_000_000;
export type MaterialFileExpectation = MaterialFileMetadata & { readonly sha256: string };
function invalid(field: MaterialField): never { throw new MaterialError('VALIDATION_ERROR', [field]); }
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !keys.includes(key))) invalid('title');
  return input as Record<string, unknown>;
}
// PostgreSQL text cannot represent NUL or unpaired UTF-16 surrogates. Count code points,
// matching char_length, rather than JS UTF-16 units. Never silently repair a filename.
function text(value: unknown, field: MaterialField): string {
  if (typeof value !== 'string' || /\p{Surrogate}/u.test(value) || value.includes('\u0000')) invalid(field);
  return value;
}
const controls = /\p{Cc}/u;
export function normalizeMaterialTexts(input: unknown): MaterialTexts {
  const data = record(input, ['title', 'description']);
  const original = text(data.title, 'title'), title = original.trim();
  if (!title || Array.from(title).length > 200 || controls.test(title)) invalid('title');
  const description = data.description === undefined || data.description === null ? null : text(data.description, 'description');
  if (description !== null && Array.from(description).length > 2000) invalid('description');
  return { title, description: description === null || description.trim() === '' ? null : description };
}
export function normalizeMaterialFileMetadata(input: unknown): MaterialFileExpectation {
  const data = record(input, ['downloadName', 'mediaType', 'byteSize', 'sha256']);
  const downloadName = text(data.downloadName, 'downloadName').trim();
  if (!downloadName || Array.from(downloadName).length > 180 || controls.test(data.downloadName as string)
    || /[/\\<>:"|?*]/u.test(downloadName)) invalid('downloadName');
  const mediaType = data.mediaType;
  if (mediaType !== 'application/pdf' && mediaType !== 'image/jpeg' && mediaType !== 'image/png') invalid('mediaType');
  const suffix = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i }[mediaType];
  if (!suffix.test(downloadName)) invalid('downloadName');
  const byteSize = data.byteSize;
  if (typeof byteSize !== 'number' || !Number.isSafeInteger(byteSize) || byteSize < 1) invalid('byteSize');
  if (byteSize > MATERIAL_FILE_LIMIT) throw new MaterialError('VALIDATION_ERROR', ['byteSize'], undefined, 413);
  const sha256 = data.sha256;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) invalid('sha256');
  return { downloadName, mediaType, byteSize, sha256 };
}
