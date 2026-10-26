import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { CommandContext, OfferingCommand } from './offering-store.js';
import type { CommandResult } from '../public/offer.js';
export const ACADEMIC_PREPARATION_COMMANDS = Symbol('AcademicPreparationCommands');
export const ACADEMIC_PUBLICATION_COMMANDS = Symbol('AcademicPublicationCommands');

/** Preparación US1: no ofrece transiciones de publicación/retiro/cancelación. */
export type PreparationCommand = Extract<OfferingCommand,
  { operation: 'COURSE_CREATE' | 'COURSE_EDIT' | 'GROUP_CREATE' | 'GROUP_EDIT' | 'GROUP_SCHEDULE' }>;
export interface PreparationStore {
  execute(actor: SessionActor, command: PreparationCommand, context: CommandContext): Promise<CommandResult>;
}
export class PreparationCommands {
  constructor(private readonly store: PreparationStore) {}
  async execute(actor: SessionActor, command: PreparationCommand, context: CommandContext): Promise<CommandResult> {
    if (!permits(actor.role, 'academic:manage')) throw new AuthorizationFailure('FORBIDDEN');
    // La capacidad atómica reautoriza la sesión y decide con las filas bloqueadas.
    return this.store.execute(actor, command, context);
  }
}

export type PublicationCommand =
  | (Extract<OfferingCommand, { operation: 'COURSE_PUBLISH' | 'COURSE_WITHDRAW' }> & { readonly operation: 'COURSE_PUBLISH' })
  | (Extract<OfferingCommand, { operation: 'GROUP_PUBLISH' | 'GROUP_WITHDRAW' }> & { readonly operation: 'GROUP_PUBLISH' });
export interface PublicationStore {
  execute(actor: SessionActor, command: PublicationCommand, context: CommandContext): Promise<CommandResult>;
}
export class PublicationCommands {
  constructor(private readonly store: PublicationStore) {}
  async execute(actor: SessionActor, command: PublicationCommand, context: CommandContext): Promise<CommandResult> {
    if (!permits(actor.role, 'academic:manage')) throw new AuthorizationFailure('FORBIDDEN');
    return this.store.execute(actor, command, context);
  }
}

export type LifecycleCommand =
  | (Extract<OfferingCommand, { operation: 'COURSE_PUBLISH' | 'COURSE_WITHDRAW' }> & { readonly operation: 'COURSE_WITHDRAW' })
  | (Extract<OfferingCommand, { operation: 'GROUP_PUBLISH' | 'GROUP_WITHDRAW' }> & { readonly operation: 'GROUP_WITHDRAW' })
  | Extract<OfferingCommand, { operation: 'GROUP_CANCEL' }>;
export interface LifecycleStore {
  execute(actor: SessionActor, command: LifecycleCommand, context: CommandContext): Promise<CommandResult>;
}
export class LifecycleCommands {
  constructor(private readonly store: LifecycleStore) {}
  async execute(actor: SessionActor, command: LifecycleCommand, context: CommandContext): Promise<CommandResult> {
    if (!permits(actor.role, 'academic:manage')) throw new AuthorizationFailure('FORBIDDEN');
    return this.store.execute(actor, command, context);
  }
}
