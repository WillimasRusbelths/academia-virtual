import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test as base, expect } from '@playwright/test';
import { us1Dataset, us1Http } from '../../../api/tests/support/us1-http.js';
import type { Us1Dataset } from '../../../api/tests/support/us1-http.js';
import { repositoryRoot } from '../../../api/src/infrastructure/config/environment.js';

export const test = base.extend<object, { identity: Us1Dataset }>({
  // eslint-disable-next-line no-empty-pattern
  identity: [async ({}, use) => {
    // Reloj real: no instalar el reloj congelado de los ensayos funcionales US1.
    const data = await us1Dataset('login_timing');
    let server: Awaited<ReturnType<typeof us1Http>> | undefined;
    let preview: ReturnType<typeof spawn> | undefined;
    try {
      server = await us1Http(data);
      preview = spawn(process.execPath, [path.join(repositoryRoot(), 'node_modules/vite/bin/vite.js'),
        'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
        cwd: path.join(repositoryRoot(), 'apps/web'),
        env: { ...process.env, API_PROXY_TARGET: server.url }, stdio: 'ignore',
      });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (preview.exitCode !== null) break;
        try { ready = (await fetch('http://localhost:5173/')).status === 200; } catch { /* arranque */ }
        if (ready) break;
        await pause(100);
      }
      if (!ready) throw new Error('Preview aislado no disponible; valores omitidos.');
      expect((await fetch(`${server.url}/health/ready`)).status).toBe(200);
      await use(data);
    } finally {
      if (preview && preview.exitCode === null) {
        const exited = new Promise<void>(resolve => preview!.once('exit', () => resolve()));
        preview.kill('SIGTERM'); await exited;
      }
      await server?.close();
      await data.cleanup();
    }
  }, { scope: 'worker', timeout: 120_000 }],
});
export { expect };
