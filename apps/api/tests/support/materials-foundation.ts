import type { Pool, PoolClient } from 'pg';
import type { Environment } from '../../src/infrastructure/config/environment.js';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { MaterialDecision, ManagedMaterial, ManagedMaterialGroup, MaterialsPage } from '../../src/modules/materials/public/materials.js';
import type { EventEmitter } from 'node:events';
import * as composition from '../../src/app.module.js';

export interface FoundationContext {
  readonly client: PoolClient;
  readonly decision: MaterialDecision;
  assertActive(): void;
  use<T>(operation: () => Promise<T>): Promise<T>;
}
export type FoundationAction = 'READ' | 'PREPARE' | 'EDIT' | 'PUBLISH' | 'WITHDRAW';
export type FoundationTarget = { readonly kind: 'GROUP' | 'MATERIAL' | 'UPLOAD'; readonly id: string } | { readonly kind: 'GROUPS' };
export interface Foundation {
  run<T>(actor: SessionActor, target: FoundationTarget, action: FoundationAction,
    apply: (context: FoundationContext) => Promise<T>): Promise<T>;
  queries: {
    groups(actor: SessionActor, input?: unknown): Promise<MaterialsPage<ManagedMaterialGroup>>;
    group(actor: SessionActor, groupId: string): Promise<ManagedMaterialGroup>;
    items(actor: SessionActor, groupId: string, input?: unknown): Promise<MaterialsPage<ManagedMaterial>>;
    item(actor: SessionActor, materialId: string): Promise<ManagedMaterial>;
  };
  transfers: {
    acquire(actorId: string): { release(): void; bind(events: EventEmitter): void };
    admit(actorId: string, authorize: () => Promise<void>, events: readonly EventEmitter[]): Promise<{ release(): void }>;
  };
}
/** A missing composition capability fails explicitly, never via a broken import or fake implementation. */
export function foundation(environment: Environment, pool: Pool): Foundation {
  const factory: unknown = Reflect.get(composition, 'createMaterialsFoundation');
  if (typeof factory !== 'function') throw new Error('T009–T016: materials foundation not implemented.');
  return factory(environment, pool) as Foundation;
}
