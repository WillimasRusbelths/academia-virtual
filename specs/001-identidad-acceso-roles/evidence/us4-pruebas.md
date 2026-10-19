# US4 · Escritura de pruebas T059–T061

Fecha: 2026-10-14. Rama `feat/001-identidad-acceso-roles`; base `f72f94d`.
Dependencia T058 comprobada en [US6](us6.md); checklist documental 16/16, sin AGENTS.md
aplicable ni hooks. **Escritura completa; US4 no funcional ni checkpoint aceptado.**

Este registro conserva los resultados anteriores a la implementación. El avance T062–T064
se documenta en [consultas, nombre y alta administrativa](us4-implementacion.md).

| Tarea | Criterios preparados | Ejecución Docker |
| --- | --- | --- |
| T059 | [Contratos HTTP](../../../apps/api/tests/integration/admin-users.contract.spec.ts): seis rutas, UserView cerrado, paginación/defaults/orden, búsqueda por nombre/correo y comodines literales, filtros enum, validación/Unicode/campos extra y obligatorios, 201 pendiente sin secretos, cuota de correo, 409 duplicado sin overwrite, nombre auditado y 401/403 conocido/desconocido sin efectos. | 62 casos: 2 aprobados (control y rechazo de JSON null por el transporte existente), 60 fallos esperados por 404 de rutas administrativas ausentes. |
| T060 | [Revocación](../../../apps/api/tests/integration/admin-revocation.spec.ts): dos sesiones tras commit, cambio de rol y nuevo acceso, desactivar/reactivar sin revivir sesiones/tokens/entregas, no-op sin versión, propio/último ADMIN y revalidación del actor revocado mientras espera el lock de gobierno. | 13 casos: 2 controles aprobados y 11 fallos esperados por ausencia de PUT rol/estado. |
| T061 | [Navegador](../../../apps/web/tests/e2e/admin-users.spec.ts): alta privada y activación con Mailpit, búsqueda/nombre en 360×800/1366×768, confirmaciones de rol/estado; seis variantes V04-B, nombre/rol/estado × inactividad/absoluta, con 401, cero cambios/auditoría y login sin replay. | 12 casos: 2 controles aprobados y 10 fallos esperados; AppRouter muestra «Página no disponible» en `/admin/cuentas`. |

Fuentes: US4 y FR-013–017/025 en [spec](../spec.md), [contrato administrativo](../contracts/api.md#endpoints-administrativos),
[pantallas](../contracts/ui.md), [invariantes](../data-model.md#invariantes-transaccionales) y
[criterio de escritura de pruebas](../verification.md#capas-de-pruebas).
No se cambian contratos ni se implementan T062–T071.

## Causas comprobadas y límites

Los controles acreditan composición AppModule real, readiness, sesión ADMIN y `/me`, dos
sesiones válidas/logout, fixtures cifrados coherentes y captura SMTP de verificación existente.
[us4.ts](../../../apps/api/tests/support/us4.ts) envía solicitudes reales y compara
predicados/snapshots privados; no instala controladores simulados ni imprime credenciales.
`US4_PENDING_HTTP` identifica exclusivamente un 404 donde el contrato exige otra respuesta;
el caso de destino inexistente comprueba antes el detalle existente, evitando un falso verde.

Las barreras de T060 usan SystemState y pg_blocking_pids reales, exclusivamente en `t_*`.
Antes del bloqueo se exige respuesta de la ruta rol; hoy falla ahí, **no se han ejecutado
todavía las aserciones de la carrera administrativa**. El caso de único ADMIN también coincide
con cambio propio; los retiros simultáneos se amplían en T070. Tokens de ambos propósitos
son preparación sintética, con payload/huellas ajustados al destinatario y scheduler detenido;
no demuestran emisión/reset de US7 ni entrega exactamente una vez.

T061 inicia sesión por la UI existente antes de comprobar la página administrativa. Solo
etiqueta `US4_PENDING_UI` al observar el fallback del router; errores de carga/fixtures
no se convierten en fallos esperados. **V04-B no está aprobado:** sus aserciones posteriores
al formulario requieren T068–T069/T071. El reloj SQL aislado prepara los vencimientos; en
el absoluto mantiene actividad reciente para distinguirlo de inactividad. No hay hooks HTTP.
Los selectores son semánticos y no fijan el estilo del cuadro de confirmación.

## Regresiones y reproducción

| Comprobación | Resultado |
| --- | --- |
| Nuevas suites | 6 aprobados (5 controles y rechazo de JSON null), 81 fallos funcionales esperados; cero casos omitidos, cero errores de pruebas/infraestructura. |
| Regresiones API US1/US2/US6 | 119/119: login 19, sesiones 15, registro 45, concurrencia 13, CLI 6 e inicial 21. |
| Chromium US1/US2/US6 | 21/21, 14/14 y 14/14. |
| Unitarias/arquitectura | 85/85: API 50, web 35. |
| Lint y compilación | API/web aprobados; configuración Playwright nueva verificada con ESLint. |
| Enlaces y formato | 135 enlaces locales existentes en los cuatro documentos del bloque; `git diff --check` aprobado. |

Solo imágenes/herramientas existentes, fuentes/tests montados, migraciones deploy y
esquemas temporales de la base de pruebas. Sin herramientas, dependencias ni migraciones nuevas.
Para repetir API desde PowerShell:

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/src:/workspace/apps/api/src:ro" --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --volume "${PWD}/apps/api/package.json:/workspace/apps/api/package.json:ro" --entrypoint sh api -c 'npm run build --workspace @academia/api && cd apps/api && npx vitest run tests/integration/admin-users.contract.spec.ts tests/integration/admin-revocation.spec.ts'
```

Navegador: [composición identity-tests](../../../ops/docker/compose.identity-tests.yml),
runtime `academia_us1_test_runtime:/us1runtime:ro` y
`PRISMA_SCHEMA_ENGINE_BINARY=/us1runtime/schema-engine`, según [pruebas Docker](../../../ops/docker/README.md).
Montar API src/tests/package.json, web src/tests y configuraciones identity/admin-users;
copiar `/us1runtime/generated` a `apps/api/generated`, compilar API y ejecutar en `apps/web`:

```sh
npx playwright test --config playwright.admin-users.config.ts
```

Ambas suites nuevas terminan con código 1 por funcionalidad pendiente. En esta ejecución
los reportes crudos permanecieron privados y los resúmenes sanearon fallos; las regresiones
se ejecutaron separadamente. No se modificaron pruebas originales ni código de producción.
La configuración desactiva trace, screenshot, video y copia automática de prompts.

El ensayo manual conserva imágenes, esquema y volumen de credenciales; no se ejecutaron
bootstrap, purgas ni restauraciones sobre él. La comparación privada antes/después confirmó
las mismas 12 cuentas, esquema y credenciales, sin publicar la huella comparada.
No se incluyen contraseñas, hashes, cookies o enlaces utilizables.

Clean Architecture y monolito conservados; las nuevas dependencias SQL/HTTP están solo
en tests. Siguiente bloque: T062–T064, consultas, nombre y alta administrativa, evaluando
sus dependencias en orden. T070/T071 cierran carreras/checkpoint; T095 y T104–T108 mantienen
su ubicación final. No se modifican diagramas ni se afirma capacidad de 1000 concurrentes.
