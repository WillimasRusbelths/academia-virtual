export interface BootstrapState {
  readonly bootstrapCompletedAt: Date | null;
  readonly firstAdminUserId: string | null;
}

export class BootstrapAlreadyInitialized extends Error {
  readonly code = 'ALREADY_INITIALIZED';
  constructor() { super('Entorno ya inicializado.'); }
}

/** Un ADMIN desactivado o una marca previa también impiden repetir la inicialización. */
export function requireUninitialized(state: BootstrapState, hasAdmin: boolean): void {
  if (state.bootstrapCompletedAt !== null || state.firstAdminUserId !== null || hasAdmin) {
    throw new BootstrapAlreadyInitialized();
  }
}
