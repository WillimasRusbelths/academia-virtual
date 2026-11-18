import type { Pool } from 'pg';
import type { Environment } from '../../src/infrastructure/config/environment.js';
import type { ClassesCoordinator } from '../../src/modules/classes/application/ports.js';
import * as composition from '../../src/app.module.js';

/** Real composition seam for T014/T017, following materials-foundation. Never
 * substitute a permissive fake or let a missing import masquerade as rejection. */
export function classesFoundation(environment: Environment, pool: Pool): ClassesCoordinator {
  const factory: unknown = Reflect.get(composition, 'createClassesFoundation');
  if (typeof factory !== 'function') throw new Error('T014/T017: classes foundation not implemented; authority is NOT verified.');
  return factory(environment, pool) as ClassesCoordinator;
}
