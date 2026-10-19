// El harness y la CLI comparten el adaptador; la aplicación no importa tests.
export { assertFixtureEnvironment, createIdentityFixtures, cleanupIdentityFixtures, readFixtureManifest, FixtureSafetyError }
  from '../../src/infrastructure/testing/identity-fixtures.js';
export type { FixtureAccount, FixtureManifest, FixtureVariant } from '../../src/infrastructure/testing/identity-fixtures.js';
