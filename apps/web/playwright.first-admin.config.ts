import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';

export default defineConfig(identity,{testMatch:'first-admin.spec.ts'});
