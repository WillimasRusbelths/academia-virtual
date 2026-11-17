import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionActor } from '../../../authorization/public/session.js';
import type { MaterialsUploadCompletionStore, MaterialsUploadIntentStore } from '../../application/ports.js';
import { MaterialError } from '../../public/errors.js';
import { MATERIAL_FILE_LIMIT } from '../../public/materials.js';

interface Dependencies {
  readonly uploads: MaterialsUploadCompletionStore & Pick<MaterialsUploadIntentStore, 'authorizeContent'>;
  readonly admission: { admit(actorId: string, authorize: () => Promise<void>, events: readonly ServerResponse[]): Promise<{ release(): void }> };
  readonly timeoutMs: number;
  match(method: string, path: string): string | null;
}
type Request = IncomingMessage & { originalUrl?: string };

function receive(request: Request, response: ServerResponse, expectedSize: number, remainingMs: number): Promise<Buffer> {
  if (remainingMs <= 0 || request.aborted || request.destroyed || response.destroyed) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
  if (request.readableEnded || request.readableFlowing === true) throw new MaterialError('VALIDATION_ERROR');
  // One bounded buffer, not an unbounded collection of tiny chunks. No buffer until authority and admission.
  const buffer = Buffer.allocUnsafe(expectedSize);
  return new Promise((resolve, reject) => {
    let received = 0, settled = false;
    const cleanup = () => {
      clearTimeout(timer); request.pause();
      request.off('data', data); request.off('end', end); request.off('error', failure); request.off('aborted', aborted); request.off('close', close);
      response.off('close', aborted); response.off('error', failure);
    };
    const finish = (error?: MaterialError) => {
      if (settled) return; settled = true; cleanup();
      if (error) {
        // Node may emit ECONNRESET after aborted. Do not leave a late error unhandled.
        if (!request.closed) {
          const swallow = () => undefined;
          request.once('error', swallow); request.once('close', () => request.off('error', swallow));
        }
        reject(error);
      } else resolve(buffer);
    };
    const failure = () => finish(new MaterialError('TEMPORARILY_UNAVAILABLE'));
    const aborted = () => failure();
    const close = () => { if (!request.complete) failure(); };
    const data = (chunk: Buffer) => {
      if (!Buffer.isBuffer(chunk)) return finish(new MaterialError('VALIDATION_ERROR'));
      const size = received + chunk.length;
      if (size > MATERIAL_FILE_LIMIT) return finish(new MaterialError('VALIDATION_ERROR', ['byteSize'], undefined, 413));
      if (size > expectedSize) return finish(new MaterialError('VALIDATION_ERROR', ['byteSize']));
      chunk.copy(buffer, received); received = size;
    };
    const end = () => finish(received !== expectedSize || !request.complete ? new MaterialError('VALIDATION_ERROR', ['byteSize']) : undefined);
    const timer = setTimeout(failure, remainingMs); timer.unref();
    request.on('data', data); request.once('end', end); request.once('error', failure); request.once('aborted', aborted); request.once('close', close);
    response.once('close', aborted); response.once('error', failure);
  });
}

/** No controller registered here. Actor is supplied by the existing guard in T025.
 * Authorization transaction ends before admission/buffer/data listeners. Completion
 * revalidates after the body, and successful leases last until response finish/close.
 */
export function createContentReceiver(dependencies: Dependencies) {
  return async (actor: SessionActor, uploadId: string, request: Request, response: ServerResponse) => {
    const started = Date.now(); let lease: { release(): void } | undefined;
    try {
      const matched = dependencies.match(request.method ?? '', request.originalUrl ?? request.url ?? '');
      if (matched === null || matched !== uploadId.toLowerCase()
        || !/^application\/octet-stream$/i.test(String(request.headers['content-type'] ?? ''))
        || request.headers['content-encoding'] !== undefined && !/^identity$/i.test(String(request.headers['content-encoding']))) {
        throw new MaterialError('UNSUPPORTED_MEDIA_TYPE');
      }
      let metadata: { readonly byteSize: number } | undefined;
      lease = await dependencies.admission.admit(actor.userId, async () => {
        metadata = await dependencies.uploads.authorizeContent(actor, uploadId);
      }, [response]);
      if (!metadata || !Number.isSafeInteger(metadata.byteSize) || metadata.byteSize < 1 || metadata.byteSize > MATERIAL_FILE_LIMIT) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
      const length = request.headers['content-length'];
      if (length !== undefined) {
        if (typeof length !== 'string' || !/^\d+$/.test(length)) throw new MaterialError('VALIDATION_ERROR', ['byteSize']);
        const declared = Number(length);
        if (!Number.isSafeInteger(declared) || declared > MATERIAL_FILE_LIMIT) throw new MaterialError('VALIDATION_ERROR', ['byteSize'], undefined, 413);
        if (declared !== metadata.byteSize) throw new MaterialError('VALIDATION_ERROR', ['byteSize']);
      }
      const bytes = await receive(request, response, metadata.byteSize, dependencies.timeoutMs - (Date.now() - started));
      if (request.aborted || response.destroyed) throw new MaterialError('TEMPORARILY_UNAVAILABLE');
      return await dependencies.uploads.complete(actor, uploadId, bytes);
    } catch (error) {
      lease?.release(); request.pause();
      if (!response.headersSent && !response.destroyed) {
        response.setHeader('Connection', 'close'); response.once('finish', () => request.destroy());
      } else if (!response.destroyed) response.destroy();
      throw error;
    }
  };
}
