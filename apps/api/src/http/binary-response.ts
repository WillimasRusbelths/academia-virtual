import { StreamableFile } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { MATERIAL_FILE_LIMIT } from '../modules/materials/public/materials.js';
import { SafeErrorFilter, TransportFailure } from './error.filter.js';
import type { HttpRequest, HttpResponse } from './error.filter.js';

interface Payload {
  readonly body?: Buffer;
  readonly head?: boolean;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly downloadName: string;
  readonly release?: () => void;
}
const pending = new WeakMap<object, Payload>();
const unavailable = () => new TransportFailure(503, 'TEMPORARILY_UNAVAILABLE');
/** Opaque server-only capability. It cannot be forged by a JSON object or serialized into bytes. */
export function createBinaryResponse(input: Payload): object {
  let released = false;
  const release = () => { if (!released) { released = true; try { input.release?.(); } catch { /* private cleanup callback */ } } };
  try {
    const suffix = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i }[input.mediaType];
    if (!suffix || typeof input.downloadName !== 'string' || !input.downloadName || input.downloadName.trim() !== input.downloadName
      || [...input.downloadName].length > 180 || /[\p{Cc}\p{Surrogate}/\\<>:"|?*]/u.test(input.downloadName) || !suffix.test(input.downloadName)
      || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > MATERIAL_FILE_LIMIT
      || (input.head === true ? input.body !== undefined : !Buffer.isBuffer(input.body) || input.body.length !== input.byteSize)) throw unavailable();
    const value = Object.freeze(Object.create(null)) as object;
    pending.set(value, Object.freeze({ ...input, release })); return value;
  } catch (error) { release(); throw error; }
}
export const isBinaryResponse = (value: unknown): value is object => value !== null && typeof value === 'object' && pending.has(value);
export function discardBinaryResponse(value: object): void {
  const payload = pending.get(value); pending.delete(value); payload?.release?.();
}
/** Called only after accepted-session validation. Nest receives a StreamableFile, never a Buffer JSON. */
export function prepareBinaryResponse(value: object, request: HttpRequest, response: HttpResponse): StreamableFile {
  const payload = pending.get(value); if (!payload) throw unavailable(); pending.delete(value);
  try {
    if (response.headersSent || response.destroyed || !response.once || (payload.head === true ? request.method !== 'HEAD' : request.method !== 'GET')) throw unavailable();
    const ascii = payload.downloadName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encoded = encodeURIComponent(payload.downloadName).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
    const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
    const result = new StreamableFile(payload.body ?? Buffer.alloc(0), { type: payload.mediaType, length: payload.byteSize, disposition });
    response.once('finish', () => payload.release?.());
    response.once('close', () => { result.getStream().destroy(); payload.release?.(); });
    response.once('error', () => { result.getStream().destroy(); payload.release?.(); });
    result.setErrorHandler(error => {
      payload.release?.();
      const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ArgumentsHost;
      new SafeErrorFilter().catch(error, host);
    }).setErrorLogger(() => { /* SafeErrorFilter owns bounded error reporting; never log raw stream errors. */ });
    response.setHeader('Content-Type', payload.mediaType); response.setHeader('Content-Length', String(payload.byteSize));
    response.setHeader('Content-Disposition', disposition); response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer');
    return result;
  } catch (error) { payload.release?.(); throw error; }
}
