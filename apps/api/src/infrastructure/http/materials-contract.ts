/** Server-owned route templates only. This registry does not expose any handler. */
export function binaryMaterialUploadId(method: string, path: string): string | null {
  if (method !== 'PUT') return null;
  const match = /^\/api\/v1\/materials\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/content$/i.exec(path);
  return match ? match[1].toLowerCase() : null;
}
export interface MaterialsRouteContract {
  readonly kind: 'NONE' | 'GROUP' | 'MATERIAL' | 'MATERIAL_UPLOAD';
  readonly param?: string;
  readonly fields: readonly string[];
  readonly conflicts: readonly string[];
  readonly command?: boolean;
}
const command = ['commandId', 'expectedRevision'];
const conflicts = ['MATERIAL_VERSION_CONFLICT', 'MATERIAL_STATE_CONFLICT', 'IDEMPOTENCY_CONFLICT'];
export const materialsRouteContracts: Readonly<Record<string, MaterialsRouteContract>> = {
  'GET /materials/groups': { kind: 'NONE', fields: ['page', 'pageSize'], conflicts: [] },
  'GET /materials/groups/:groupId': { kind: 'GROUP', param: 'groupId', fields: [], conflicts: [] },
  'GET /materials/groups/:groupId/items': { kind: 'GROUP', param: 'groupId', fields: ['page', 'pageSize', 'state'], conflicts: [] },
  'POST /materials/groups/:groupId/uploads': { kind: 'GROUP', param: 'groupId',
    fields: ['intentionId', 'title', 'description', 'downloadName', 'mediaType', 'byteSize', 'sha256'], conflicts: ['IDEMPOTENCY_CONFLICT', 'MATERIAL_STATE_CONFLICT'] },
  'GET /materials/uploads/:uploadId': { kind: 'MATERIAL_UPLOAD', param: 'uploadId', fields: [], conflicts: [] },
  'PUT /materials/uploads/:uploadId/content': { kind: 'MATERIAL_UPLOAD', param: 'uploadId', fields: [], conflicts: ['IDEMPOTENCY_CONFLICT', 'MATERIAL_STATE_CONFLICT'] },
  'GET /materials/items/:materialId': { kind: 'MATERIAL', param: 'materialId', fields: [], conflicts: [] },
  'GET /materials/items/:materialId/content': { kind: 'MATERIAL', param: 'materialId', fields: [], conflicts: [] },
  'HEAD /materials/items/:materialId/content': { kind: 'MATERIAL', param: 'materialId', fields: [], conflicts: [] },
  'PATCH /materials/items/:materialId': { kind: 'MATERIAL', param: 'materialId', fields: [...command, 'title', 'description'], conflicts, command: true },
  'POST /materials/items/:materialId/publish': { kind: 'MATERIAL', param: 'materialId', fields: command, conflicts, command: true },
  'POST /materials/items/:materialId/withdraw': { kind: 'MATERIAL', param: 'materialId', fields: command, conflicts, command: true },
};
export const materialsRouteTargets = Object.fromEntries(Object.entries(materialsRouteContracts)
  .map(([key, contract]) => [key.slice(key.indexOf(' ') + 1), contract]));
export function materialsRoute(method: string, template: string): MaterialsRouteContract | undefined {
  return materialsRouteContracts[`${method} ${template}`];
}
export const materialsFamily = (template: string) => template === '/materials' || template.startsWith('/materials/');
