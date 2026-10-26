import type { Pool } from 'pg';
import { expect } from 'vitest';
import * as persistence from '../../src/modules/academic-offering/infrastructure/offering-store.js';
import type { PreparationCommand, PublicationCommand } from '../../src/modules/academic-offering/application/commands.js';
import type { OfferingStore } from '../../src/modules/academic-offering/application/offering-store.js';
import type { AcademicTransactionDependencies } from '../../src/infrastructure/database/academic-transaction.js';
import type { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';

export type Executor = Pick<OfferingStore, 'execute'>;
/** Puerto de conformidad de pruebas, no implementación. T048 puede adaptar el enlace
 * a su capacidad real; no se cambia el comportamiento esperado ni se simula éxito. */
export function lifecycleStore(pool: Pool, sessions: PostgresSessionStore): Executor {
  type Factory = (pool: Pool, auth: AcademicTransactionDependencies) => Executor;
  const factory = (persistence as unknown as { createLifecycleStore?: Factory }).createLifecycleStore;
  expect(factory, 'T048 pendiente: escritor real de retiro/cancelación ausente; aserciones posteriores aún no alcanzadas').toBeTypeOf('function');
  return factory!(pool, { revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) });
}
export function existingCommands(pool: Pool, sessions: PostgresSessionStore): Executor {
  const auth = { revalidateInTransaction: sessions.revalidateInTransaction.bind(sessions) };
  return { execute(actor, command, context) {
    if (['COURSE_CREATE','COURSE_EDIT','GROUP_CREATE','GROUP_EDIT','GROUP_SCHEDULE'].includes(command.operation)) {
      return persistence.createPreparationStore(pool, auth).execute(actor, command as PreparationCommand, context);
    }
    if (command.operation === 'COURSE_PUBLISH' || command.operation === 'GROUP_PUBLISH') {
      return persistence.createPublicationStore(pool, auth).execute(actor, command as PublicationCommand, context);
    }
    return lifecycleStore(pool, sessions).execute(actor, command, context);
  } };
}
export { maintenanceSeed, resetAcademicFixture, commandCounts, savedGroup, change } from './academic-maintenance-fixture.js';
