import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Evitar capturas automáticas del DOM de formularios en contextos de error de Playwright.
process.env.PLAYWRIGHT_NO_COPY_PROMPT='1';
export default defineConfig(base,{
  testMatch:'login.spec.ts',
  timeout:15000,
  reporter:[['list']],
  use:{baseURL:'http://localhost:5173',trace:'off',screenshot:'off',video:'off'},
  webServer:undefined, // La fixture inicia Vite y la composición API real en el mismo contenedor.
});
