# Escritura de pruebas de acceso y sesiones — T031–T033

Fecha: 2026-10-14. Rama: `feat/001-identidad-acceso-roles`.
Alcance: pruebas antes de implementar US1. No añade login, logout, perfil ni pantallas
funcionales. Según la regla de cierre de [tasks.md](../tasks.md), completar la escritura
no exige aprobar una conducta pendiente; sí exige ejecutar la suite y distinguir sus fallos.

## Cobertura y resultados por tarea

| Tarea | Criterios escritos | Resultado en Docker | Pendiente funcional |
| --- | --- | --- | --- |
| T031 | Tres roles; UserView con lista cerrada de campos; cookie opaca nueva y ausencia de Bearer; 401 uniforme para contraseña errónea, inexistencia, desactivación, falta de verificación y provisional, incluida vencida; /me sin sesión, credencial inválida, revocada o versión anterior; 429 con Retry-After; 503 seguro ante denegación SQL real; logout ausente/repetido/desconocido y revocación de una sesión; emisión/borrado local y HTTPS. | 19 pruebas: 2 aprobadas, 17 fallos esperados por HTTP 404. | T034–T037: casos de uso y rutas reales; aceptación T039. |
| T032 | 29:59 renueva; 30 minutos y 8 horas exactas rechazan; 400/401/403/404/503 y salud no renuevan; GREATEST concurrente y reloj anterior; dos sesiones y revocación individual; reconexión, reinicio de composición y de proceso; cinco fallos persistidos y fin del bloqueo a los 15 minutos. | 15 pruebas: 6 aprobadas, 9 fallos esperados por HTTP 404. | Integración HTTP de estos fundamentos y aceptación T039. |
| T033 | Login/inicio/logout/atrás de cada rol; error de credenciales y recarga sin contraseña; /me detecta expiración por inactividad y absoluta, limpia identidad y vuelve a /login sin replay; tamaños 360×800 y 1366×768. | 13 pruebas Chromium: 1 control aprobado, 12 fallos esperados porque /login no tiene el campo Correo. | T038: pantallas, hidratación y limpieza reales; aceptación V04-A en T039. V04-B se reserva para T061/T071. |

Fuentes ejecutables: [T031](../../../apps/api/tests/integration/login.contract.spec.ts),
[T032](../../../apps/api/tests/integration/session-lifecycle.spec.ts),
[T033](../../../apps/web/tests/e2e/login.spec.ts). Contratos:
[HTTP](../contracts/api.md), [UI](../contracts/ui.md); trazabilidad:
US1, FR-005–FR-009, FR-022–FR-023; V03, V04-A y parte de V10.
No se acepta la comparación temporal de T087 ni SC-002 completo.

## Entorno y diagnóstico de los fallos

Se reutilizan [fixtures seguros T029](fixtures-seguros.md), hashes reales, seis sesiones
iniciales, migraciones versionadas, configuración y pool existentes. Cada suite posee un
esquema `t_*` aislado en la base de pruebas. La limpieza elimina solo ese esquema y su
manifiesto temporal privado; no modifica datos ni volúmenes de desarrollo. No se usa
`db:migrate:dev`, base sombra, SQLite ni endpoints privilegiados de prueba.

[Composición HTTP](../../../apps/api/tests/support/us1-http.ts) importa AppModule y transporte
compilados, comprueba readiness 200 y usa PostgreSQL real. El reloj SQL sustituible existe
solo en el esquema de prueba; no altera pg_catalog ni el reloj del equipo. Los procesos de
[reinicio](../../../apps/api/tests/support/us1-process.mjs) ensamblan la misma aplicación,
se comunican por IPC únicamente para anunciar el puerto y se detienen antes de arrancar otro.
No añaden rutas ni autenticación. Las revocaciones y cuotas se conservan en PostgreSQL;
el flujo HTTP completo de reinicio aún falla por logout ausente.

Los fallos HTTP finales son aserciones de estado: 404 frente a 200/204/401/429/503 esperados.
La cuota agotada se prepara con el adaptador real; la denegación de SELECT se confirma y
restaura en el esquema aislado. No se confunden esos escenarios con una conexión defectuosa.
Los controles aprobados incluyen cookies, límites exactos, GREATEST, pool nuevo y reinicio.

El [ensayo de navegador](../../../apps/web/tests/support/us1-fixture.ts) inicia Vite y NestJS
reales, sin interceptar respuestas. Conserva `http://localhost:5173` como APP_ORIGIN y origen
del navegador; escucha IPv4 loopback para evitar la divergencia localhost/::1. El control
comprueba aplicación React, proxy HTTP y sesión válida persistida. La ausencia del formulario
es coherente con el router actual, no un fallo de carga. Los pasos posteriores están escritos,
pero todavía no se alcanzan: su resultado solo podrá comprobarse al implementar US1.

Intentos iniciales no contados como fallos esperados: permisos y descarga del motor Prisma
en browser-tests, escucha IPv6 de Vite y un import Node omitido en lint del ejecutable de
prueba. Se resolvieron reutilizando artefactos existentes y ajustando únicamente el ensayo.
Trace, capturas y vídeo están desactivados en la configuración US1; se evita el snapshot
automático del DOM y se limpian campos de contraseña al terminar. Aserciones HTTP comparan
predicados para no imprimir cuerpos, cookies, hashes ni credenciales. No se versionan secretos
ni reportes. El escenario HTTPS verifica configuración y cabeceras; no acredita despliegue TLS.

## Reproducción y regresiones

Con los servicios e imágenes vigentes del [entorno Docker](../../../ops/docker/README.md):

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --entrypoint sh api -c "cd apps/api && npx vitest run tests/integration/login.contract.spec.ts tests/integration/session-lifecycle.spec.ts"
docker compose run --rm --no-deps --user root --volume academia_us1_test_runtime:/runtime --entrypoint sh api -c "mkdir -p /runtime/generated && cp -R apps/api/generated/. /runtime/generated/ && cp node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x /runtime/schema-engine"
docker compose -f compose.yml -f ops/docker/compose.identity-tests.yml --profile tests run --rm --no-deps --volume academia_us1_test_runtime:/us1runtime:ro --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --volume "${PWD}/apps/web/src:/workspace/apps/web/src:ro" --volume "${PWD}/apps/web/tests:/workspace/apps/web/tests:ro" --volume "${PWD}/apps/web/playwright.identity.config.ts:/workspace/apps/web/playwright.identity.config.ts:ro" -e PRISMA_SCHEMA_ENGINE_BINARY=/us1runtime/schema-engine --entrypoint sh browser-tests -c "cp -R /us1runtime/generated apps/api/generated && npm run build --workspace @academia/api && cd apps/web && npx playwright test --config playwright.identity.config.ts"
```

Las suites US1 devuelven código 1 mientras falten los comportamientos; no contienen skip,
todo ni fallos artificialmente aceptados. La configuración de navegador US1 y su overlay
son necesarios para los datos aislados; el comando E2E de esqueleto por sí solo no prepara
ese entorno. El volumen de artefactos contiene clientes/motor Linux, no datos de identidad;
debe prepararse con la imagen API compilada del código vigente. No requiere descargas nuevas.

| Comprobación | Resultado |
| --- | --- |
| Lint API/web y configuración Playwright US1 | Aprobado |
| Compilación API y web | Aprobada |
| Unitarias, incluidas tres pruebas de arquitectura | 45/45 aprobadas |
| Regresiones integración/compatibilidad, excluidas solo las dos suites nuevas | 239/240 en contenedor temporal; un fallo de infraestructura por readiness en localhost:3000 |
| Repetición de mail-delivery.spec.ts en API activa, único archivo afectado por ese entorno | 25/25 aprobadas; resuelve el fallo anterior sin cambios de código |
| Regresiones Chromium de esqueleto y transporte/UI | 5/5 aprobadas |

El análisis acotado de spec/plan/tasks/contratos no encontró contradicciones que bloqueen
este grupo: T030 y V00-L están respaldados; los seis escenarios de US1 se distribuyen entre
T031–T033 y su implementación/aceptación posterior. Las importaciones backend en el ensayo
web son exclusivamente infraestructura de pruebas en Node; no llegan al bundle del navegador.
Sin cambios de producción ni nuevas infracciones de capas. No se cierran V01–V16, usabilidad
observada, disponibilidad de producción ni capacidad de 1000 concurrentes.

Siguiente bloque: **T034**, implementación de login, seguido de T035–T038 y aceptación T039.
