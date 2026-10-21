import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { CommandContext, OfferingCommand } from './offering-store.js';
import type { CommandResult } from '../public/offer.js';

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
