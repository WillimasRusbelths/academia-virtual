import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig(identity,{testMatch:'password-reset.spec.ts',timeout:30000});
