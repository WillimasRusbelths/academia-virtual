import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';

export default defineConfig(identity, {
  testMatch: 'login-timing.spec.ts',
  timeout: 300_000,
  retries: 0,
  workers: 1,
  use: { viewport: { width: 1366, height: 768 } },
});
