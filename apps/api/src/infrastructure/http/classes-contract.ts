/** Server-owned metadata only; this registry does not register HTTP handlers. */
export interface ClassesRouteContract {
  readonly kind: 'NONE' | 'GROUP' | 'CLASS';
  readonly param?: string;
  readonly fields: readonly string[];
  readonly conflicts: readonly string[];
  readonly command?: boolean;
  readonly passive?: boolean;
}
const manage = ['CLASS_VERSION_CONFLICT', 'CLASS_STATE_CONFLICT', 'IDEMPOTENCY_CONFLICT'];
const revision = ['commandId', 'expectedRevision'];
const entry = (fields: readonly string[], conflicts: readonly string[] = [], command = false, passive = false): ClassesRouteContract =>
  Object.freeze({ kind: 'CLASS', param: 'classId', fields: Object.freeze([...fields]), conflicts: Object.freeze([...conflicts]), command, passive });
export const classesRouteContracts: Readonly<Record<string, ClassesRouteContract>> = Object.freeze({
  'GET /classes/groups': { kind: 'NONE', fields: ['page', 'pageSize'], conflicts: [] },
  'GET /classes/groups/:groupId': { kind: 'GROUP', param: 'groupId', fields: [], conflicts: [] },
  'GET /classes/groups/:groupId/sessions': { kind: 'GROUP', param: 'groupId', fields: ['page', 'pageSize', 'state'], conflicts: [] },
  'POST /classes/groups/:groupId/sessions': { kind: 'GROUP', param: 'groupId', fields: ['commandId', 'title', 'description'], conflicts: manage, command: true },
  'GET /classes/sessions/:classId': entry([]),
  'PATCH /classes/sessions/:classId': entry([...revision, 'title', 'description'], manage, true),
  'POST /classes/sessions/:classId/start': entry(revision, [...manage, 'CLASS_ALREADY_LIVE'], true),
  'POST /classes/sessions/:classId/finish': entry(revision, manage, true),
  'POST /classes/sessions/:classId/cancel': entry(revision, manage, true),
  'GET /classes/sessions/:classId/messages': entry(['beforeSeq', 'limit']),
  'POST /classes/sessions/:classId/messages': entry(['commandId', 'text'], ['CLASS_STATE_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'CHAT_MUTED'], true),
  'GET /classes/sessions/:classId/changes': entry(['after', 'limit'], ['CHAT_SYNC_REQUIRED'], false, true),
  'POST /classes/sessions/:classId/messages/:messageId/hide': entry(['commandId'], ['CLASS_STATE_CONFLICT', 'IDEMPOTENCY_CONFLICT'], true),
  'POST /classes/sessions/:classId/students/:studentId/mute': entry(revision, manage, true),
  'POST /classes/sessions/:classId/students/:studentId/unmute': entry(revision, manage, true),
  'GET /classes/commands/:commandId': { kind: 'NONE', fields: [], conflicts: [] },
  'POST /classes/sessions/:classId/socket-tickets': entry([], [], false, true),
  'GET /classes/sessions/:classId/video': entry([], [], false, true),
  'GET /classes/sessions/:classId/video-reference': entry([]),
  'PUT /classes/sessions/:classId/video-reference': entry([...revision, 'videoId'], manage, true),
});
export const classesRouteTargets = Object.fromEntries(Object.entries(classesRouteContracts).map(([key, value]) => [key.slice(key.indexOf(' ') + 1), value]));
export function classesRoute(method: string, template: string): ClassesRouteContract | undefined {
  return Object.hasOwn(classesRouteContracts, `${method} ${template}`) ? classesRouteContracts[`${method} ${template}`] : undefined;
}
export const classesFamily = (template: string) => template === '/classes' || template.startsWith('/classes/');
