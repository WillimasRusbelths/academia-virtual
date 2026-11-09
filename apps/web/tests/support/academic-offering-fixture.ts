import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test as base, expect } from '@playwright/test';
import { academicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import type { AcademicOfferingDataset } from '../../../api/tests/support/academic-offering.js';
import { us1Http } from '../../../api/tests/support/us1-http.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';
import { enrollmentClock } from './enrollment-clock';

async function assertLoopbackPortFree() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () => reject(new Error('Puerto loopback del ensayo ocupado; no reutilizar servidor existente.')));
    probe.listen(5173, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
  });
}

export const test = base.extend<{ offering: AcademicOfferingDataset & { backendUrl: string }; reservationWorker: boolean; reservationClock: boolean }>({
  reservationWorker: [false, { option: true }],
  reservationClock: [false, { option: true }],
  // Un esquema nuevo por caso; no TRUNCATE/reset de datos compartidos entre historias.
  offering: [async ({reservationWorker,reservationClock}, use) => {
    await assertLoopbackPortFree();
    const data = await academicOfferingDataset('academic_browser');
    let server: Awaited<ReturnType<typeof us1Http>> | undefined;
    let vite: ReturnType<typeof spawn> | undefined;
    try {
      const clock=reservationClock?await enrollmentClock(data):undefined;
      server = await us1Http({...data,reservationWorker,clock});
      const root = repositoryRoot();
      vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
        '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
        cwd: path.join(root, 'apps/web'), env: { ...process.env, API_PROXY_TARGET: server.url }, stdio: 'ignore',
      });
      let spawnFailed = false;
      vite.once('error', () => { spawnFailed = true; });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (spawnFailed || vite.exitCode !== null) break;
        try { ready = (await fetch('http://localhost:5173/', { signal: AbortSignal.timeout(1000) })).ok; }
        catch { /* Espera acotada de readiness, sin reutilizar servidor manual. */ }
        if (ready) break;
        await pause(100);
      }
      if (!ready) throw new Error('Vite académico no alcanzó readiness. Valores omitidos.');
      expect((await fetch(`${server.url}/health/ready`)).status).toBe(200);
      await use({ ...data, backendUrl: server.url });
    } finally {
      if (vite?.pid && vite.exitCode === null && vite.signalCode === null) {
        const exited = new Promise<void>(resolve => vite!.once('exit', () => resolve()));
        vite.kill('SIGTERM');
        await exited;
      }
      try { await server?.close(); } finally { await data.cleanup(); }
    }
  }, { timeout: 120000 }],
});
export { expect };
