import { test as academicTest, expect } from './academic-offering-fixture';
import { prepareEnrollmentFixture } from '../../../api/tests/support/enrollment.js';
import type { EnrollmentDataset } from '../../../api/tests/support/enrollment.js';

// Reutiliza API real, Vite loopback, schema propio y cleanup del harness académico.
// Sin importar locks.ts/Vitest en el proceso Playwright.
export const test = academicTest.extend<{ enrollment: EnrollmentDataset & { backendUrl: string } }>({
  reservationWorker: true,
  enrollment: async ({ offering, reservationClock }, use) => {
    const prepared = await prepareEnrollmentFixture(offering);
    if(reservationClock)await offering.context.database.pool.query(`UPDATE "Session" SET "createdAt"='2090-01-02T04:58:00Z',"lastAcceptedAt"='2090-01-02T04:58:00Z',"absoluteExpiresAt"='2090-01-02T12:58:00Z'`);
    await use({ ...offering, ...prepared });
  },
});
export { expect };
