import type { SessionActor } from '../../authorization/public/session.js';
import type {
  InstantUs, ManagedMaterial, ManagedMaterialGroup, ManagedMaterialsFilter, MaterialCommandInput,
  MaterialCommandResponse, MaterialDecision, MaterialEditInput, MaterialFileMetadata,
  MaterialGroupContext, MaterialOperation, MaterialResult, MaterialsPage, MaterialsPagination,
  MaterialUploadInput, MaterialUploadStatus, Revision, StudentMaterial, UUID,
} from '../public/materials.js';

/** Fixed contract independent of the permission registry's implementation order. */
export type MaterialsPermission = 'materials:manage-all' | 'materials:manage-own' | 'materials:read-enrolled';
export interface MaterialsAuthorization {
  revalidate(actor: SessionActor, permission: MaterialsPermission): Promise<void>;
}
export interface MaterialsTopology {
  readonly accountIds: readonly UUID[];
  readonly courseIds: readonly UUID[];
  readonly groupIds: readonly UUID[];
  readonly materialIds: readonly UUID[];
  readonly uploadIds: readonly UUID[];
}
export type MaterialsTarget = { readonly kind: 'GROUP'; readonly id: UUID }
  | { readonly kind: 'MATERIAL'; readonly id: UUID }
  | { readonly kind: 'UPLOAD'; readonly id: UUID };

export interface MaterialsQueries {
  groups(page: MaterialsPagination): Promise<MaterialsPage<MaterialGroupContext | ManagedMaterialGroup>>;
  group(groupId: UUID): Promise<MaterialGroupContext | ManagedMaterialGroup>;
  managedItems(groupId: UUID, page: ManagedMaterialsFilter): Promise<MaterialsPage<ManagedMaterial>>;
  studentItems(groupId: UUID, page: MaterialsPagination): Promise<MaterialsPage<StudentMaterial>>;
  managedItem(materialId: UUID): Promise<ManagedMaterial>;
  studentItem(materialId: UUID): Promise<StudentMaterial>;
}
export interface MaterialsUploads {
  register(groupId: UUID, input: MaterialUploadInput): Promise<MaterialUploadStatus>;
  status(uploadId: UUID): Promise<MaterialUploadStatus>;
  /** Intention owner and current group authority must both be revalidated. */
  complete(uploadId: UUID, content: Uint8Array): Promise<{
    readonly resource: ManagedMaterial;
    readonly replayed: boolean;
  }>;
}
/** Persistence boundary for T021 only. Receiving/completing content is a separate capability. */
export interface MaterialsUploadIntentStore {
  register(actor: SessionActor, groupId: UUID, input: MaterialUploadInput): Promise<MaterialUploadStatus>;
  status(actor: SessionActor, uploadId: UUID): Promise<MaterialUploadStatus>;
  authorizeContent(actor: SessionActor, uploadId: UUID): Promise<{ readonly byteSize: number }>;
}
export interface MaterialsUploadCompletionStore {
  complete(actor: SessionActor, uploadId: UUID, content: Uint8Array): Promise<{
    readonly resource: ManagedMaterial;
    readonly replayed: boolean;
  }>;
}
export interface MaterialsCommands {
  edit(materialId: UUID, input: MaterialEditInput): Promise<MaterialCommandResponse>;
  publish(materialId: UUID, input: MaterialCommandInput): Promise<MaterialCommandResponse>;
  withdraw(materialId: UUID, input: MaterialCommandInput): Promise<MaterialCommandResponse>;
}
export interface MaterialsCommandStore {
  edit(actor: SessionActor, materialId: UUID, input: MaterialEditInput): Promise<MaterialCommandResponse>;
  publish(actor: SessionActor, materialId: UUID, input: MaterialCommandInput): Promise<MaterialCommandResponse>;
  withdraw(actor: SessionActor, materialId: UUID, input: MaterialCommandInput): Promise<MaterialCommandResponse>;
}
export interface MaterialsContent {
  /** Metadata path for HEAD must never select the binary content. */
  metadata(materialId: UUID): Promise<MaterialFileMetadata>;
  /** Caller holds transfer admission; authorization precedes content selection.
   * Transfer to network starts only after coordinator releases DB locks/connection.
   */
  read(materialId: UUID): Promise<MaterialFileMetadata & { readonly bytes: Uint8Array }>;
}
export interface MaterialsAuditRecord {
  readonly actorId: UUID;
  readonly groupId: UUID;
  readonly materialId: UUID;
  readonly intentionId: UUID | null;
  readonly commandId: UUID | null;
  readonly operation: MaterialOperation;
  readonly result: MaterialResult;
  readonly revision: Revision;
  readonly at: InstantUs;
}
export interface MaterialsAudit { write(record: MaterialsAuditRecord): Promise<void> }
export interface MaterialsCapabilities {
  readonly queries: MaterialsQueries;
  readonly uploads: MaterialsUploads;
  readonly commands: MaterialsCommands;
  readonly content: MaterialsContent;
  readonly audit: MaterialsAudit;
  readonly decision: MaterialDecision;
}
/** One accountTransaction budget; actor -> session -> course -> group -> material/upload.
 * Infrastructure supplies public participants on the same connection. Never hold this
 * callback open while receiving or sending network bytes. No financial locks.
 */
export interface MaterialsCoordinator {
  run<T>(actor: SessionActor, permission: MaterialsPermission, target: MaterialsTarget,
    mode: 'READ' | 'WRITE', decide: (capabilities: MaterialsCapabilities) => Promise<T>): Promise<T>;
}
export interface MaterialsTransferLease { release(): void }
/** Admission before upload buffering or bytea SELECT, no waiting queue. */
export interface MaterialsTransferAdmission {
  acquire(actorId: UUID): MaterialsTransferLease;
}
