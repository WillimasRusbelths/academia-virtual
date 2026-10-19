import { defineConfig } from '@playwright/test';
import accessibility from './playwright.accessibility.config';

export default defineConfig(accessibility,{testMatch:'profile.spec.ts'});
