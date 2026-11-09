import { defineConfig, devices } from '@playwright/test';
import identity from './playwright.identity.config';

export default defineConfig(identity, {
  testMatch: 'enrollment-*.spec.ts',
  use: { baseURL: 'http://localhost:5173', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
