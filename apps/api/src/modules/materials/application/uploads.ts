import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { isAccountId } from '../../users/public/account.js';
import { normalizeMaterialTexts, normalizeMaterialFileMetadata } from '../domain/material.js';
import { MaterialError } from '../domain/material-error.js';
import type { MaterialUploadInput, MaterialUploadStatus } from '../public/materials.js';
import type { MaterialsUploadIntentStore, MaterialsUploadCompletionStore } from './ports.js';

function manager(actor: SessionActor): void {
  if (!permits(actor.role, 'materials:manage-all') && !permits(actor.role, 'materials:manage-own')) {
    throw new AuthorizationFailure('FORBIDDEN');
  }
}
/** Copy/normalize primitives before entering storage. No mutable request object survives an await. */
function normalizeInput(input: unknown): MaterialUploadInput {
  const keys = ['intentionId', 'title', 'description', 'downloadName', 'mediaType', 'byteSize', 'sha256'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !keys.includes(key))) throw new MaterialError('VALIDATION_ERROR');
  const data = input as Record<string, unknown>;
  if (!isAccountId(data.intentionId)) throw new MaterialError('VALIDATION_ERROR', ['intentionId']);
  return Object.freeze({ intentionId: data.intentionId.toLowerCase(),
    ...normalizeMaterialTexts({ title: data.title, description: data.description }),
    ...normalizeMaterialFileMetadata({ downloadName: data.downloadName, mediaType: data.mediaType,
      byteSize: data.byteSize, sha256: data.sha256 }) });
}

export function createMaterialsUploadIntents(store: MaterialsUploadIntentStore, completion: MaterialsUploadCompletionStore) {
  return Object.freeze({
    async register(actor: SessionActor, groupId: string, input: unknown): Promise<MaterialUploadStatus> {
      manager(actor);
      if (!isAccountId(groupId)) throw new MaterialError('NOT_FOUND');
      return store.register(actor, groupId.toLowerCase(), normalizeInput(input));
    },
    async status(actor: SessionActor, uploadId: string): Promise<MaterialUploadStatus> {
      manager(actor);
      if (!isAccountId(uploadId)) throw new MaterialError('NOT_FOUND');
      return store.status(actor, uploadId.toLowerCase());
    },
    async complete(actor: SessionActor, uploadId: string, content: Uint8Array) {
      manager(actor);
      if (!isAccountId(uploadId)) throw new MaterialError('NOT_FOUND');
      return completion.complete(actor, uploadId.toLowerCase(), content);
    },
    async authorizeContent(actor: SessionActor, uploadId: string) {
      manager(actor);
      if (!isAccountId(uploadId)) throw new MaterialError('NOT_FOUND');
      return store.authorizeContent(actor, uploadId.toLowerCase());
    },
  });
}
