import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { isAccountId } from '../../users/public/account.js';
import { MaterialError } from '../domain/material-error.js';
import { normalizeMaterialTexts } from '../domain/material.js';
import { materialRevision } from '../domain/transitions.js';
import type { MaterialCommandInput } from '../public/materials.js';
import type { MaterialsCommandStore } from './ports.js';

function command(input: unknown, edit = false): MaterialCommandInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['commandId', 'expectedRevision', ...(edit ? ['title', 'description'] : [])].includes(key))) throw new MaterialError('VALIDATION_ERROR');
  const data = input as Record<string, unknown>;
  if (!isAccountId(data.commandId)) throw new MaterialError('VALIDATION_ERROR', ['commandId']);
  return Object.freeze({ commandId: data.commandId.toLowerCase(), expectedRevision: materialRevision(data.expectedRevision) });
}
function target(actor: SessionActor, materialId: string): string {
  if (!permits(actor.role, 'materials:manage-all') && !permits(actor.role, 'materials:manage-own')) throw new AuthorizationFailure('FORBIDDEN');
  if (!isAccountId(materialId)) throw new MaterialError('NOT_FOUND');
  return materialId.toLowerCase();
}
export function createMaterialsCommands(store: MaterialsCommandStore) {
  return Object.freeze({
    async edit(actor: SessionActor, materialId: string, input: unknown) {
      const id = target(actor, materialId), identity = command(input, true), data = input as Record<string, unknown>;
      return store.edit(actor, id, Object.freeze({ ...identity, ...normalizeMaterialTexts({ title: data.title, description: data.description }) }));
    },
    async publish(actor: SessionActor, materialId: string, input: unknown) {
      return store.publish(actor, target(actor, materialId), command(input));
    },
    async withdraw(actor: SessionActor, materialId: string, input: unknown) {
      return store.withdraw(actor, target(actor, materialId), command(input));
    },
  });
}
