import type { SessionActor } from '../../authorization/public/session.js';
import type { ClassGroup, ManagedClassGroup, ClassSessionView, ManagedClassSession, ClassesPage, ClassVideoAccess } from '../public/classes.js';

export const CLASSES_READ = 'CLASSES_READ';
export interface ClassesReadQueries {
  groups(actor: SessionActor, input?: unknown): Promise<ClassesPage<ClassGroup | ManagedClassGroup>>;
  group(actor: SessionActor, id: string): Promise<ClassGroup | ManagedClassGroup>;
  sessions(actor: SessionActor, id: string, input?: unknown): Promise<ClassesPage<ClassSessionView | ManagedClassSession>>;
  session(actor: SessionActor, id: string): Promise<ClassSessionView | ManagedClassSession>;
  video(actor: SessionActor, id: string): Promise<ClassVideoAccess>;
}
