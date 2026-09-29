import { defineConfig } from 'prisma/config';
import { probeUrl } from './env.mjs';
// También proteger una invocación directa de Prisma: no aceptar URL heredada arbitraria.
// generate no abre conexiones; cualquier otro comando exige el destino aislado validado.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.argv.includes('generate') ? '' : probeUrl('migration') }
});
