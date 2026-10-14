# Escritura de pruebas de registro y verificación — T040–T042

Fecha: 2026-10-14. Rama: `feat/001-identidad-acceso-roles`.
Dependencia: [checkpoint US1 T039](us1.md) aprobado. Este bloque escribe y ejecuta
pruebas antes de implementar US2; no añade casos de uso, rutas ni pantallas de registro.
Las casillas corresponden a la regla de escritura de [tasks.md](../tasks.md), no a
aceptación funcional. **US2 permanece pendiente**, incluido su checkpoint T049.

## Cobertura y resultados

| Tarea | Criterios escritos | Resultado en Docker | Pendiente funcional |
| --- | --- | --- | --- |
| T040 | Límites Unicode de nombre/contraseña y correo de 254 caracteres; campos obligatorios, arrays y extras de rol/permisos/estado; registro nuevo/duplicado sin overwrite; reenvío genérico según estado; 429 equivalente para correo nuevo/existente, con conservación de cuenta pendiente sin token/entrega; confirmación 204 sin sesión ni cambios de credenciales; 400 uniforme de enlaces inválidos y DTO estricto. | 45 pruebas: 1 control aprobado, 44 fallos esperados por HTTP 404. | T043–T046: emisión, registro, confirmación y reenvío; aceptación T049. |
| T041 | 20 altas canónicas simultáneas con contraseña ganadora intacta; 20 duplicados de una cuenta previa; doble consumo; frontera de 24 h menos 1 ms/exactas; propósito, snapshot y estado; reemisión de enlace vigente/vencido, cancelación anterior y reenvío limitado sin revocar; retry conserva token y caducidad. | 13 pruebas: 2 controles aprobados, 11 fallos esperados por HTTP 404. | Atomicidad de los flujos HTTP todavía no implementados; T049. |
| T042 | Registro/verificación/login y negativos a 360×800/1366×768; pendiente no accede; fragmento solo en memoria y retirado; GET sin consumo; confirmación explícita; recarga sin secreto; errores, 429 con reenvío sin repetir registro, 503 y fallo de envío sin prometer entrega. | 11 pruebas Chromium: 1 control aprobado, 10 fallos esperados: 7 por campo Nombre ausente y 3 por fragmento sin retirar (longitud 44 frente a 0). | T047–T048: pantallas/navegación reales y aceptación T049. Los pasos posteriores al primer fallo aún no se alcanzan. |

Fuentes: [contratos T040](../../../apps/api/tests/integration/registration.contract.spec.ts),
[concurrencia T041](../../../apps/api/tests/integration/registration-concurrency.spec.ts),
[navegador T042](../../../apps/web/tests/e2e/registration.spec.ts).
Trazabilidad: US2; FR-001–FR-004, FR-023 y FR-029–FR-031;
[HTTP](../contracts/api.md), [UI](../contracts/ui.md), V01/V02 y partes de V10/V13 en
[verification.md](../verification.md). Ninguno de esos escenarios se acepta con fallos.

## Aislamiento, controles y diagnóstico

Se reutilizan los [fixtures seguros T029](fixtures-seguros.md), la composición de US1,
pool, hashes Argon2id, cuotas, cifrado y ejecutor existentes. El
[harness US2](../../../apps/api/tests/support/us2.ts) crea un schema `t_*` por suite
en `academia_v00_test`, aplica las cuatro migraciones versionadas y limpia únicamente
ese schema y su manifiesto temporal privado. El reloj SQL es exclusivo del ensayo.
No se modifican desarrollo, el reloj del equipo, volúmenes ni las cuentas manuales.

Controles aprobados: readiness y acceso US1 reales; restricción única y parcial estática
sin `now()`; fallo temporal **controlado en Mailer** seguido de aceptación SMTP real
por Mailpit, con el mismo token, enlace y caducidad; React/proxy y captura de enlace
sintético por Mailpit en Chromium. No se apagó Mailpit. Estos controles no acreditan
registro funcional, caída real del servidor SMTP ni entrega exactamente una vez.
La entrega SMTP y su registro persistido se comprueban por separado.

Las 55 aserciones HTTP fallidas se clasificaron individualmente como respuesta 404 de
las rutas ausentes. El navegador carga la aplicación real; el router todavía muestra
«Página no disponible» en las rutas US2. No son fallos de importación, migración,
conexión, fixtures ni captura de correo. No hay `skip`, `todo` ni aceptación artificial
de fallos. Las aserciones posteriores permanecen escritas, sin declararlas verificadas.

Incidencias de entorno resueltas: Docker estaba detenido; se inició su instalación
existente y se levantó la misma configuración manual. La primera ejecución Chromium
usó el backend anterior de la imagen de navegador; se repitió montando `apps/api/src/`
vigente y compilándolo. Sus fallos iniciales no se cuentan como resultados funcionales.

| Regresión/comprobación | Resultado final |
| --- | --- |
| Integración/compatibilidad ya incorporada, incluida T031/T032 | 318/318 en 19 archivos; suites nuevas US2 ejecutadas por separado |
| Chromium US1 T033 original y adicionales | 21/21 |
| Unitarias API y web vigente; incluye pruebas de arquitectura | 29/29 y 31/31 |
| Lint API/web/configuración nueva y compilación API/web | Aprobados |

Solo cambian pruebas, configuración de su ejecución y seguimiento documental. Los
imports del backend en el ensayo web pertenecen a Node, no al bundle del navegador.
Se conservan monolito y dependencias hacia el núcleo. Comparaciones de predicados evitan
imprimir credenciales, hashes, cookies o enlaces. Trace, capturas y vídeo están
desactivados; reportes son efímeros y los campos de contraseña se limpian al terminar.
No se afirma disponibilidad productiva ni capacidad de 1000 usuarios concurrentes.

## Reproducción

Desde la raíz, con las imágenes existentes y servicios saludables:

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --entrypoint sh api -c "cd apps/api && npx vitest run tests/integration/registration.contract.spec.ts tests/integration/registration-concurrency.spec.ts"

docker compose -f compose.yml -f ops/docker/compose.identity-tests.yml --profile tests run --rm --no-deps --volume academia_us1_test_runtime:/us1runtime:ro --volume "${PWD}/apps/api/src:/workspace/apps/api/src:ro" --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --volume "${PWD}/apps/web/src:/workspace/apps/web/src:ro" --volume "${PWD}/apps/web/tests:/workspace/apps/web/tests:ro" --volume "${PWD}/apps/web/playwright.identity.config.ts:/workspace/apps/web/playwright.identity.config.ts:ro" --volume "${PWD}/apps/web/playwright.registration.config.ts:/workspace/apps/web/playwright.registration.config.ts:ro" -e PRISMA_SCHEMA_ENGINE_BINARY=/us1runtime/schema-engine --entrypoint sh browser-tests -c "cp -R /us1runtime/generated apps/api/generated && npm run build --workspace @academia/api && cd apps/web && npx playwright test --config playwright.registration.config.ts"
```

El volumen de artefactos, preparado según [la escritura US1](us1-pruebas.md), contiene
clientes/motor Prisma Linux existentes, no credenciales. Las suites US2 devuelven código
1 mientras falte implementación; ese resultado no sustituye la aceptación de T049.

Para volver a levantar **la configuración manual actual de US1**:

```powershell
docker compose -f compose.yml -f compose.override.yml -f .cache/docker/compose.manual-us1.yml up -d --wait api web
```

Usa APP_ENV=test y el schema aislado `manual_us1_05832d35725f` de `academia_v00_test`.
El overlay local ignorado y el volumen privado de fixtures se conservan; no se usa
`academia_dev`. Web: `http://localhost:5173/login`; API: `http://localhost:3000/api/v1`.
No se incorporan credenciales al documento ni al repositorio.

Siguiente tarea: **T043**, emisión atómica de enlaces, antes de T044–T048 y aceptación T049.
