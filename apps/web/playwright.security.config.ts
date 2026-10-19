import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig(identity,{testMatch:['csrf.spec.ts','denied-access.spec.ts'],timeout:30000});
