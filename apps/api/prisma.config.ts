import { defineConfig } from 'prisma/config';
import { loadEnvironment } from './src/infrastructure/config/environment.ts';

// Generar el cliente es una operación offline; el resto exige configuración validada.
const generate = process.argv.includes('generate');
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: generate ? '' : loadEnvironment().migrationUrl },
});
