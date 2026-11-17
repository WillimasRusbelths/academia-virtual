import { defineConfig, devices } from '@playwright/test';
import identity from './playwright.identity.config';

export default defineConfig(identity, {
  testMatch: ['materials-management.spec.ts','materials-student.spec.ts','materials-actions.spec.ts'],
  use: { baseURL:'http://localhost:5173',trace:'off',screenshot:'off',video:'off' },
  projects: [
    {name:'desktop',use:{...devices['Desktop Chrome']}},
    {name:'mobile',use:{...devices['Pixel 7']}},
  ],
});
