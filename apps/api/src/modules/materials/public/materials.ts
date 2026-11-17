/** Transport DTOs, never persistence rows. Entrypoints must reject unknown fields.
 * UUIDs are canonical; revisions are positive decimal bigint strings <= int64 max.
 * UTCInstant carries all six fractional digits of timestamptz(6), never a JS Date.
 */
export type UUID = string;
export { normalizeMaterialTexts, normalizeMaterialFileMetadata, MATERIAL_FILE_LIMIT } from '../domain/material.js';
export { transitionMaterial } from '../domain/transitions.js';
export type { MaterialFileExpectation, MaterialTexts, MaterialFileMetadata, MaterialMediaType } from '../domain/material.js';
import type { MaterialTexts, MaterialFileMetadata } from '../domain/material.js';
export type Revision = string;
export type UTCInstant = string;
/** Internal temporal decision only; never serialize bigint directly into JSON. */
export type InstantUs = bigint;
export type MaterialState = 'PREPARED' | 'PUBLISHED' | 'WITHDRAWN';
export type MaterialOperation = 'UPLOAD_COMPLETE' | 'EDIT' | 'PUBLISH' | 'WITHDRAW';
export type MaterialResult = 'APPLIED' | 'NO_CHANGE';

export interface MaterialUploadInput extends MaterialTexts, MaterialFileMetadata {
  readonly intentionId: UUID;
  /** Expected digest, always recalculated by the server, never a student DTO field. */
  readonly sha256: string;
}
export interface MaterialCommandInput {
  readonly commandId: UUID;
  readonly expectedRevision: Revision;
}
export interface MaterialEditInput extends MaterialCommandInput, MaterialTexts {}

interface MaterialView extends MaterialTexts, MaterialFileMetadata {
  readonly id: UUID;
  readonly groupId: UUID;
}
/** No state/revision, actor, digest, storage address or financial information. */
export interface StudentMaterial extends MaterialView {
  readonly publishedAt: UTCInstant;
}
export interface ManagedMaterial extends MaterialView {
  readonly state: MaterialState;
  readonly revision: Revision;
  readonly createdAt: UTCInstant;
  readonly updatedAt: UTCInstant;
  readonly createdBy: UUID;
  readonly publishedAt: UTCInstant | null;
  readonly withdrawnAt: UTCInstant | null;
}
export interface MaterialCommandReceipt {
  readonly id: UUID;
  readonly replayed: boolean;
  readonly appliedRevision: Revision;
  readonly result: MaterialResult;
}
export interface MaterialCommandResponse {
  /** Current authorized resource, even when replaying a historical command. */
  readonly resource: ManagedMaterial;
  readonly command: MaterialCommandReceipt;
}
export type MaterialUploadStatus = {
  readonly uploadId: UUID;
  readonly state: 'PENDING';
  readonly materialId: null;
  readonly command: { readonly replayed: boolean };
} | {
  readonly uploadId: UUID;
  readonly state: 'COMPLETED';
  readonly materialId: UUID;
  readonly command: { readonly replayed: boolean };
};
export interface MaterialGroupContext {
  readonly id: UUID;
  readonly name: string;
  readonly courseName: string;
}
export interface ManagedMaterialGroup extends MaterialGroupContext {
  readonly state: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN' | 'CANCELLED';
  readonly actions: {
    readonly prepare: boolean;
    readonly edit: boolean;
    readonly publish: boolean;
    readonly withdraw: boolean;
  };
}
export interface MaterialsPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
/** Validated at entrypoint: page >= 1, pageSize 1–50 (default 20). */
export interface MaterialsPagination { readonly page: number; readonly pageSize: number }
export interface ManagedMaterialsFilter extends MaterialsPagination { readonly state?: MaterialState }

declare const materialDecision: unique symbol;
/** Emitted by the transaction coordinator only, after locks and topology recheck.
 * Participants must verify token identity and lifetime; HTTP cannot mint it.
 */
export interface MaterialDecision {
  readonly at: InstantUs;
  readonly [materialDecision]: true;
}
