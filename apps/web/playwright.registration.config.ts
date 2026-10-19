import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';

// Misma privacidad y composición real que US1; suite US2 separada.
export default defineConfig(identity,{testMatch:'registration.spec.ts'});
