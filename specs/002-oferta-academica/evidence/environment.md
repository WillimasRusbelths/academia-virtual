# Preparación aislada — T002–T004

Fecha: 2026-10-19 (America/Lima). Solo primer bloque autorizado.
Commit documental: `e0dafe868f5a0e4442963ae3a893048cacbfc516`.

## Destino y guardas

- Copia: `D:\Proyectos\academia-virtual\.cache\academic-offering-validation\source`.
- Proyecto: `academic-offering-fa3d46bddbb8`.
- Volumen: `academic-offering-fa3d46bddbb8_postgres_data`, nuevo y no externo.
- 490 archivos: fuente versionada del commit documental y cinco archivos nuevos de
  harness de este bloque, con SHA-256 por archivo en source-manifest.json privado.
- No se copiaron `.env`, `.env.test`, node_modules, credenciales, datos ni backups
  originales. Solo ejemplos versionados. configure.mjs creó `.env` con flag wx y claves
  nuevas en la copia. No se imprime Compose completo ni URLs de conexión.
- Excepción revisada: overlay de construcción existente y su certificado **público**
  de CA, comprobando BEGIN CERTIFICATE y ausencia de PRIVATE KEY. No claves privadas.
- Compose base + override público + regression + identity-tests, seleccionados con
  rutas absolutas, --project-directory, --env-file y --project-name explícitos.
- Configuración efectiva comprobada: cero puertos publicados en todos los servicios,
  modo test en API/runner y volumen propio. El loopback 5173 de E2E es interno al
  contenedor efímero y se rechaza si ya está ocupado; Vite usa --strictPort.
- No cambios a Compose, Dockerfiles, scripts npm, Actions ni migraciones del repositorio.
  No nuevos paquetes/servicios. El ajuste de Actions permanece en T067.

## Fixtures preparadas

`apps/api/tests/support/academic-offering.ts` valida modo test y destino exclusivo de
pruebas antes de crear un esquema. Reutiliza identityDatabase/test-environment,
createIdentityFixtures y sessionFixture, sin bootstrap. Cada dataset tiene 14 cuentas
sintéticas: las doce combinaciones de identidad y otro ADMIN/TEACHER para futuros
ensayos de pertenencia y concurrencia. Contraseñas/sesiones solo en memoria o manifiesto
privado temporal. Un pool observador independiente evita esperar una conexión retenida.

La limpieza cierra pools y elimina solo el esquema t_* identificado y su directorio
temporal. No hay truncados de bases compartidas. La prueba de dos datasets conserva
el segundo al limpiar el primero y comprueba que bootstrap no fue consumido.
El helper locks.ts existente se importa exclusivamente desde la prueba Vitest.

`apps/web/tests/support/academic-offering-fixture.ts` crea un dataset por caso,
ensambla AppModule/transporte reales mediante us1Http y arranca Vite loopback con proxy
exclusivo. Finalmente cierra Vite/API/pools y limpia su esquema. La configuración
playwright.academic-offering.config.ts fija localhost, dos proyectos móvil/escritorio,
un worker, cero retries y sin capturas/trazas de credenciales.

Los dos archivos academic-offering-harness.spec.ts verifican infraestructura e identidad
sintética. No implementan ni prueban cursos/grupos todavía. Se usan únicamente las cuatro
migraciones **ya existentes** dentro de esquemas nuevos por identityDatabase; no se crea
ni ejecuta la futura migración 0005 ni se modifica ningún esquema manual.

## Reproducción de comandos

Scripts auxiliares privados ignorados: `.cache/academic-offering-validation/prepare.ps1`
y `run.ps1`, estado state.json y manifiestos. prepare exige destino inexistente, valida
cada ruta bajo la copia, copia fuente revisada y configura una sola vez. run admite
acciones cerradas config/build/up/lint/api-harness/e2e-harness/stop y valida proyecto/destino.
No invocarlo contra academia-local. Cambiar fuente exige sincronizar archivos revisados
y reconstruir; las imágenes verificadas deben coincidir con el manifiesto final.

Ejecutado mediante `powershell -NoProfile -ExecutionPolicy Bypass -File <script>`, sin
cambiar ExecutionPolicy del equipo. Para docker se requirió acceso fuera del sandbox.

| Acción | Comando efectivo principal | Resultado |
| --- | --- | --- |
| Preparar | prepare.ps1; git ls-files + cinco rutas nuevas, copia dirigida, node ops/docker/configure.mjs en destino | 0; copia nueva y configuración nueva |
| Configurar | run.ps1 -Action config; docker compose --profile tests config --format json, validación privada | 0; sin puertos ni volumen compartido |
| Construir | run.ps1 -Action build; docker compose --profile tests build api web browser-tests | Ver registro final inferior |
| Iniciar | run.ps1 -Action up; docker compose up -d --no-build --wait db mailpit | 0; ambos saludables |

`docker compose` incluye siempre el proyecto, raíz, env-file y cuatro -f indicados arriba.
Los logs de detalle permanecen en la caché privada ignorada. PowerShell presenta progreso
stderr de Docker como NativeCommandError; se valora el código de salida real, sin
clasificar esa representación de progreso como un fallo de producto ni ocultar fallos.

## Resultados finales y límites

| Comprobación ejecutada | Código / resultado |
| --- | --- |
| Construcción final API/web/browser-tests (run.ps1 -Action build) | 0; clientes actuales generados, compilación API y web aprobada |
| `npm.cmd exec --workspace apps/api -- eslint tests/support/academic-offering.ts tests/integration/academic-offering-harness.spec.ts` | 0 |
| `npm.cmd exec --workspace apps/web -- eslint tests/support/academic-offering-fixture.ts tests/e2e/academic-offering-harness.spec.ts playwright.academic-offering.config.ts` | 0; incluye explícitamente la configuración nueva |
| TypeScript de los cinco archivos nuevos, comando indicado debajo | 0 |
| `run.ps1 -Action lint` → `docker compose run --rm --no-deps api npm run lint` | 0; ambos workspaces |
| `run.ps1 -Action api-harness` → `docker compose run --rm --no-deps api npm exec --workspace apps/api -- vitest run tests/integration/academic-offering-harness.spec.ts --maxWorkers=1` | 0; 3/3 pruebas, 22.82 s |
| `run.ps1 -Action e2e-harness` → `docker compose --profile tests run --rm --no-deps browser-tests npm run test:e2e --workspace apps/web -- --config playwright.academic-offering.config.ts` | 0; 2/2 pruebas, 18.4 s, un worker y sin reintentos |
| `docker exec academic-offering-fa3d46bddbb8-db-1 psql -U postgres -d academia_v00_test -Atc "SELECT count(*) FROM pg_namespace WHERE left(nspname,11)='t_academic_';"` | 0; resultado 0 esquemas restantes |
| Inspect de mounts/puertos | 0; bind de inicialización en la copia, volumen exclusivo; `5432/tcp:null`, sin publicación |
| `run.ps1 -Action stop` → `docker compose stop` del proyecto nuevo | 0; DB/Mailpit detenidos, volumen conservado |
| Comparar protected-before.json y source-manifest.json | 72/72 archivos protegidos idénticos; 490/490 archivos de fuente coinciden con la copia |

Comando de tipos ejecutado en la raíz, con esos cinco archivos como argumentos:
`npm.cmd exec -- tsc --noEmit --strict --allowJs --skipLibCheck --esModuleInterop --experimentalDecorators --emitDecoratorMetadata --target ES2023 --module ESNext --moduleResolution Bundler --types node <cinco rutas nuevas>`.
Las cinco rutas exactas y sus huellas se registran al final; no es el typecheck de toda
la suite futura. El build de imágenes sí compiló el código de aplicación existente.

Correcciones realizadas antes del cierre: evitar importar Vitest al cargar el fixture
Playwright, usar los nombres reales de SystemState y el DTO real de /me, y regenerar
imágenes después de sincronizar la corrección. Un intento de formatear mounts con
condicional Go falló por comillas de PowerShell; se repitió usando json .Mounts, aprobado.
No hubo pruebas de harness fallidas u omitidas. El primer intento de docker version
falló por motor detenido y luego por acceso del sandbox; quedó resuelto al iniciar
Desktop y usar el acceso al motor permitido. No se alteró seguridad de npm/TLS.

Imágenes finales realmente verificadas (IDs de manifiesto):

| Servicio | ID |
| --- | --- |
| API | sha256:9f9e8387016e2a980a37c1f029e424b7cd0b2b148d6be0379eea011ccfef48a2 |
| Web | sha256:243080a156162b245995e5f8ab0e464806953a8b9580625438132cf79028dd1d |
| Browser-tests | sha256:0fbf9b733a9a304c6b15600527a256f4cdd2fe0312482bc049a5c8ea99108128 |

PostgreSQL ejecutado: 16.14 (Debian 16.14-1.pgdg12+1). El contenedor manual DB conservó
ID, StartedAt, FinishedAt y estado exited del inventario inicial; no se consultaron sus
filas ni se montó su volumen en ensayos. Sus cuentas no se volvieron a contar.

**Cierre del bloque**: T001–T004 cumplen sus criterios y se marcan completas. T005–T074
siguen pendientes y no se implementó ningún fundamento o historia. No se ejecutó la
suite completa de identidad, CI remota, recuperación, aceptación humana ni pruebas de
carga. Los cinco ensayos verifican infraestructura/fixtures e integración de identidad
en el harness; no demuestran publicaciones, autorización académica o concurrencia del
módulo futuro. No hay aceptación funcional ni capacidad para 1000 concurrentes acreditada.

Implementación y evidencia de este bloque quedan sin commit para revisión; el único
commit creado es el documental solicitado. Ningún bloqueo operativo permanece para
estas cuatro tareas. Siguiente bloque: T005/T006 antes de T007/T008; requiere reanudar
el proyecto exclusivo y revisar migración/sombra sin tocar la base manual.

## Archivos nuevos de harness y huellas del snapshot ejecutado

| Ruta | SHA-256 |
| --- | --- |
| apps/api/tests/integration/academic-offering-harness.spec.ts | 7C120C85C543A6AD0D09002775561358B73AA2002829C59FB7166C1688922C15 |
| apps/api/tests/support/academic-offering.ts | 3A937EE73FE5414F07CFD29E779C10F09B0AA2AD74E41BD71CE49F81D314DC9F |
| apps/web/playwright.academic-offering.config.ts | 86869D54E41678C8B5A30F62D75FAF0CF4FC7BD0BDF0944C05989748C13B3DDB |
| apps/web/tests/e2e/academic-offering-harness.spec.ts | BCCAEDBA7E0A6655A9A0C56228FADFE1B085221DD5CA0584FCAF1F7F746AEC10 |
| apps/web/tests/support/academic-offering-fixture.ts | F6D42FAF299C3E6EB7C7909C9B09A27E64E3163B6434E8AD684F8B286C874CA9 |
