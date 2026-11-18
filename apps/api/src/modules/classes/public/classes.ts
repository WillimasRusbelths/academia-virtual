/** DTOs de transporte, nunca filas SQL. Validación cerrada en los entrypoints.
 * UUID canónico; enteros decimales sin signo/ceros iniciales y <= int64 máximo.
 * Revision persistida >0; ExpectedRevision permite 0 solo si el recurso no existe.
 * UTCInstant conserva seis decimales de timestamptz(6); no usar Date para autoridad.
 */
export { normalizeClassTexts, prepareClassSession, transitionClassSession } from '../domain/class-session.js';
import type { ClassState, ClassTexts } from '../domain/class-session.js';
export type { ClassState, ClassTexts } from '../domain/class-session.js';
export type UUID = string;
export type Revision = string;
export type ExpectedRevision = string;
export type EventSeq = string;
export type UTCInstant = string;
export type InstantUs = bigint;
export type ClassOperation = 'CREATE' | 'EDIT' | 'START' | 'FINISH' | 'CANCEL'
  | 'SEND' | 'HIDE' | 'MUTE' | 'UNMUTE' | 'VIDEO_REFERENCE_SET';
export type ClassChangeType = 'CREATED' | 'EDITED' | 'STARTED' | 'FINISHED' | 'CANCELLED'
  | 'MESSAGE_SENT' | 'MESSAGE_HIDDEN' | 'STUDENT_MUTED' | 'STUDENT_UNMUTED' | 'VIDEO_REFERENCE_CHANGED';
export type ClassResult = 'APPLIED' | 'NO_CHANGE';

export interface ClassCreateInput extends ClassTexts { readonly commandId: UUID }
export interface ClassCommandInput { readonly commandId: UUID; readonly expectedRevision: ExpectedRevision }
export interface ClassEditInput extends ClassCommandInput, ClassTexts {}
export interface ClassSendInput { readonly commandId: UUID; readonly text: string }
export interface ClassHideInput { readonly commandId: UUID }
export interface ClassVideoInput extends ClassCommandInput { readonly videoId: string | null }
export interface ClassesPagination { readonly page: number; readonly pageSize: number }
export interface ClassesFilter extends ClassesPagination { readonly state?: ClassState }
export interface ClassesPage<T> { readonly items: readonly T[]; readonly page: number; readonly pageSize: number; readonly total: number }
export interface ClassGroup { readonly id: UUID; readonly name: string; readonly courseName: string }
export interface ManagedClassGroup extends ClassGroup {
  readonly state: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN' | 'CANCELLED';
  readonly canPrepare: boolean;
}
export interface ClassSessionView extends ClassTexts {
  readonly id: UUID;
  readonly groupId: UUID;
  readonly state: ClassState;
  readonly revision: Revision;
  /** Último cambio de textos/estado. No es la revisión de gestión o cursor global. */
  readonly viewVersion: EventSeq;
  readonly createdAt: UTCInstant;
  readonly updatedAt: UTCInstant;
  readonly startedAt: UTCInstant | null;
  readonly finishedAt: UTCInstant | null;
  readonly cancelledAt: UTCInstant | null;
}
export interface ManagedClassSession extends ClassSessionView {
  readonly createdBy: UUID;
  readonly updatedBy: UUID;
  readonly actions: { readonly edit: boolean; readonly start: boolean; readonly finish: boolean; readonly cancel: boolean };
}
export interface ClassAuthor { readonly id: UUID; readonly name: string; readonly role: 'ADMIN' | 'TEACHER' | 'STUDENT' }
interface MessageIdentity {
  readonly id: UUID;
  readonly messageSeq: EventSeq;
  readonly author: ClassAuthor;
  readonly acceptedAt: UTCInstant;
  /** SEND o HIDE más reciente que afecta este mensaje. */
  readonly viewVersion: EventSeq;
}
export type ClassMessageView = (MessageIdentity & { readonly hidden: false; readonly text: string })
  | (MessageIdentity & { readonly hidden: true; readonly text?: never });
export interface ClassRestrictionView {
  readonly studentId: UUID;
  readonly muted: boolean;
  readonly revision: ExpectedRevision;
  readonly viewVersion: EventSeq;
}
export interface ClassHistoryQuery { readonly beforeSeq?: EventSeq; readonly limit: number }
export interface ClassChangesQuery { readonly after: EventSeq; readonly limit: number }
export interface ClassChatSnapshot {
  readonly items: readonly ClassMessageView[];
  readonly highWatermark: EventSeq;
  readonly nextBeforeSeq: EventSeq | null;
  readonly hasOlder: boolean;
  readonly session: ClassSessionView;
  readonly ownRestriction: ClassRestrictionView | null;
  /** Solo referencias visibles al gestor; no es un padrón global. */
  readonly restrictions?: readonly ClassRestrictionView[];
}
interface ChangeIdentity { readonly eventSeq: EventSeq; readonly occurredAt: UTCInstant }
export type ClassChangeView = ChangeIdentity & (
  { readonly type: 'CREATED' | 'EDITED' | 'STARTED' | 'FINISHED' | 'CANCELLED'; readonly session: ClassSessionView }
  | { readonly type: 'MESSAGE_SENT' | 'MESSAGE_HIDDEN'; readonly message: ClassMessageView }
  | { readonly type: 'STUDENT_MUTED' | 'STUDENT_UNMUTED'; readonly restriction: ClassRestrictionView }
  | { readonly type: 'VIDEO_REFERENCE_CHANGED'; readonly revision: Revision });
export interface ClassChangesPage {
  readonly items: readonly ClassChangeView[];
  readonly nextCursor: EventSeq;
  readonly highWatermark: EventSeq;
  readonly hasMore: boolean;
}
export interface ClassReceipt {
  readonly id: UUID;
  readonly replayed: boolean;
  readonly result: ClassResult;
  /** null en NO_CHANGE sobre recurso ausente; la vista conserva revisión virtual 0. */
  readonly appliedRevision: Revision | null;
  readonly appliedEventSeq: EventSeq | null;
}
export interface ClassCommandResponse<T> { readonly resource: T; readonly command: ClassReceipt }
export type ClassCommandLookup = { readonly result: 'NOT_CONFIRMED' }
  | { readonly result: 'APPLIED'; readonly response: ClassCommandResponse<ClassSessionView | ClassMessageView | ClassRestrictionView | ClassVideoReferenceView> };
export interface ClassVideoReferenceView {
  readonly classId: UUID;
  readonly provider: 'YOUTUBE_DEMO';
  readonly videoId: string | null;
  readonly revision: ExpectedRevision;
  readonly updatedAt: UTCInstant | null;
}
export type ClassVideoAccess = { readonly status: 'NOT_CONFIGURED' | 'CLASS_NOT_LIVE' }
  | { readonly status: 'CONFIGURED'; readonly provider: 'YOUTUBE_DEMO'; readonly videoId: string;
    readonly revision: Revision; readonly checkedAt: UTCInstant; readonly externalAccessLimited: true };
export interface ClassSocketTicket { readonly ticket: string; readonly expiresAt: UTCInstant }
declare const classDecision: unique symbol;
/** Solo lo emite el coordinador tras locks/recheck; válido durante su callback. */
export interface ClassDecision { readonly at: InstantUs; readonly [classDecision]: true }
