import type { SessionActor } from '../../authorization/public/session.js';
import type {
  ClassChangesPage, ClassChangesQuery, ClassChatSnapshot, ClassCommandInput, ClassCommandLookup,
  ClassCommandResponse, ClassCreateInput, ClassDecision, ClassEditInput, ClassGroup, ClassHideInput,
  ClassHistoryQuery, ClassMessageView, ClassOperation, ClassRestrictionView, ClassResult, ClassSendInput,
  ClassSessionView, ClassSocketTicket, ClassVideoAccess, ClassVideoInput, ClassVideoReferenceView,
  ClassesFilter, ClassesPage, ClassesPagination, InstantUs, ManagedClassGroup, ManagedClassSession, UUID,
} from '../public/classes.js';

export type ClassesPermission = 'classes:manage-all' | 'classes:manage-own' | 'classes:participate-enrolled';
export interface ClassesAuthorization { revalidate(actor: SessionActor, permission: ClassesPermission): Promise<void> }
export interface ClassesTopology {
  readonly accountIds: readonly UUID[];
  readonly courseIds: readonly UUID[];
  readonly groupIds: readonly UUID[];
  readonly classIds: readonly UUID[];
}
export type ClassesTarget = { readonly kind: 'GROUP' | 'CLASS'; readonly id: UUID }
  | { readonly kind: 'GROUPS' }
  | { readonly kind: 'COMMAND'; readonly id: UUID }
  | { readonly kind: 'STUDENT'; readonly classId: UUID; readonly studentId: UUID };
export interface ClassesQueries {
  groups(page: ClassesPagination): Promise<ClassesPage<ClassGroup | ManagedClassGroup>>;
  group(groupId: UUID): Promise<ClassGroup | ManagedClassGroup>;
  sessions(groupId: UUID, page: ClassesFilter): Promise<ClassesPage<ClassSessionView | ManagedClassSession>>;
  session(classId: UUID): Promise<ClassSessionView | ManagedClassSession>;
  command(commandId: UUID): Promise<ClassCommandLookup>;
}
export interface ClassesCommands {
  create(groupId: UUID, input: ClassCreateInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  edit(classId: UUID, input: ClassEditInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  start(classId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  finish(classId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  cancel(classId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ManagedClassSession>>;
}
/** Management use cases depend on transactional persistence, never SQL/Nest. */
export interface ClassesManagementStore {
  create(actor: SessionActor, groupId: UUID, input: ClassCreateInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  edit(actor: SessionActor, classId: UUID, input: ClassEditInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  start(actor: SessionActor, classId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  finish(actor: SessionActor, classId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  cancel(actor: SessionActor, classId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ManagedClassSession>>;
  command(actor: SessionActor, commandId: UUID): Promise<ClassCommandLookup>;
}
export interface ClassesChat {
  send(classId: UUID, input: ClassSendInput): Promise<ClassCommandResponse<ClassMessageView>>;
  history(classId: UUID, query: ClassHistoryQuery): Promise<ClassChatSnapshot>;
  changes(classId: UUID, query: ClassChangesQuery): Promise<ClassChangesPage>;
}
export interface ClassesModeration {
  hide(classId: UUID, messageId: UUID, input: ClassHideInput): Promise<ClassCommandResponse<ClassMessageView>>;
  mute(classId: UUID, studentId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ClassRestrictionView>>;
  unmute(classId: UUID, studentId: UUID, input: ClassCommandInput): Promise<ClassCommandResponse<ClassRestrictionView>>;
}
export interface ClassesVideo {
  reference(classId: UUID): Promise<ClassVideoReferenceView>;
  setReference(classId: UUID, input: ClassVideoInput): Promise<ClassCommandResponse<ClassVideoReferenceView>>;
  access(classId: UUID): Promise<ClassVideoAccess>;
}
export interface ClassesAuditRecord {
  readonly actorId: UUID;
  readonly classId: UUID;
  readonly groupId: UUID;
  readonly commandId: UUID | null;
  readonly operation: ClassOperation;
  readonly result: ClassResult | 'REJECTED';
  readonly at: InstantUs;
  readonly revision: string | null;
  readonly eventSeq: string | null;
}
export interface ClassesAudit { write(record: ClassesAuditRecord): Promise<void> }
export interface ClassesCapabilities {
  readonly decision: ClassDecision;
  readonly queries: ClassesQueries;
  readonly commands: ClassesCommands;
  readonly chat: ClassesChat;
  readonly moderation: ClassesModeration;
  readonly video: ClassesVideo;
  readonly audit: ClassesAudit;
}
/** Un único presupuesto accountTransaction: cuentas UUID -> sesión -> curso -> grupo
 * -> clase -> mensaje/restricción -> ledger. WRITE toma clase UPDATE desde el inicio;
 * READ toma SHARE. Participantes públicos comparten conexión; ninguna espera de red.
 */
export interface ClassesCoordinator {
  run<T>(actor: SessionActor, permission: ClassesPermission, target: ClassesTarget,
    mode: 'READ' | 'WRITE', decide: (capabilities: ClassesCapabilities) => Promise<T>): Promise<T>;
}
/** Ticket/admisión son efímeros; no fuentes de autoridad o contenido del chat. */
export interface ClassesTickets { issue(actor: SessionActor, classId: UUID): Promise<ClassSocketTicket> }
export interface ClassesNotifier { changed(classId: UUID): Promise<void> }
