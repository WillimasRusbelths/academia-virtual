import type { SessionActor } from '../../authorization/public/session.js';
import type { ManagedMaterial, ManagedMaterialGroup, MaterialGroupContext, MaterialsPage, StudentMaterial } from '../public/materials.js';

/** Audience-specific DTOs; infrastructure must authorize before projecting/counting. */
export interface MaterialsReadQueries {
  groups(actor: SessionActor, input?: unknown): Promise<MaterialsPage<ManagedMaterialGroup | MaterialGroupContext>>;
  group(actor: SessionActor, groupId: string): Promise<ManagedMaterialGroup | MaterialGroupContext>;
  items(actor: SessionActor, groupId: string, input?: unknown): Promise<MaterialsPage<ManagedMaterial | StudentMaterial>>;
  item(actor: SessionActor, materialId: string): Promise<ManagedMaterial | StudentMaterial>;
}
