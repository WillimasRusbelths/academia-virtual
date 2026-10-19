import { defineConfig } from '@playwright/test';
import identity from './playwright.identity.config';
export default defineConfig(identity,{
  testMatch:['password-reset.spec.ts','password-reset-ui.spec.ts','password-reset-bootstrap.spec.ts'],timeout:30000,
  projects:[
    {name:'movil',use:{viewport:{width:360,height:800}}},
    {name:'escritorio',use:{viewport:{width:1366,height:768}}},
  ],
});
