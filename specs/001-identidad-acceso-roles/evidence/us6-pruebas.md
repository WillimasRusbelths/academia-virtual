# US6 · Escritura de pruebas T050–T052

Fecha: 2026-10-14. Rama `feat/001-identidad-acceso-roles`; base `cf239d9`.
Dependencia T049 cumplida. Checklist documental 16/16; sin AGENTS.md aplicable ni hooks.
**Estado: pruebas escritas y ejecutables; US6 todavía no funcional.** No se implementan T053–T058.

| Tarea | Criterios preparados | Resultado de escritura |
| --- | --- | --- |
| T050 | [CLI](../../../apps/api/tests/integration/bootstrap-cli.spec.ts): credencial oculta y sin argv, salida sin secretos, creación pendiente/auditoría, procesos concurrentes, repetición tras desactivar y marca persistente; sin bootstrap público. | 6 casos: 3 controles aprobados y 3 fallos esperados por ausencia de `admin:bootstrap` y su ejecutable. |
| T051 | [Establecimiento inicial](../../../apps/api/tests/integration/initial-password.spec.ts): 204 sin sesión/verificación implícita, hash propio/versionado, frontera 24 h −1 ms/exacta, datos inválidos sin consumo, DTO estricto, rechazo genérico, segundo/doble consumo, cuota compartida con login y reinicio, revalidación de hash/versión/estado bajo lock, rollback por fallo SQL. | 21 casos: 1 control aprobado y 20 fallos esperados, todos por 404 de `/auth/password/initial`. |
| T052 | [Navegador](../../../apps/web/tests/e2e/first-admin.spec.ts): verificar→cambiar y cambiar→verificar en 360×800/1366×768, rechazo mientras falta un requisito, login posterior, limpieza de URL/storage/campos, nueva contraseña inválida, recarga, provisional incorrecta/vencida y enlaces a verificar/recuperar. | 9 casos: 1 control aprobado y 8 fallos esperados por ausencia de `/establecer-contrasena`. |

Fuentes: US6 y FR-004/014/027/028 en [spec](../spec.md), [API y contrato operativo](../contracts/api.md),
[UI](../contracts/ui.md), R06/U1 en [research](../research.md), [plan](../plan.md) y
[reglas de aceptación de tareas de pruebas](../verification.md#capas-de-pruebas).
Los mensajes `US6_PENDING_CLI`, `US6_PENDING_INITIAL` y `US6_PENDING_UI` identifican
ausencias funcionales; no convierten fallos en aprobaciones ni omiten casos.

## Controles y límites

T050 reutiliza `PostgresBootstrapStore` de T028 en un esquema vacío: dos intentos producen
un ADMIN/auditoría y marca permanente; las rutas HTTP inexistentes conservan cero cuentas.
El PTY usa `script` ya instalado en la imagen API y echo habilitado. Un programa exclusivo
de tests demuestra detección de un señuelo visible y captura oculta sin argumentos secretos.
Su salida se conserva solo en memoria y se compara mediante booleanos; no crea cuentas ni
sustituye la CLI real. La disponibilidad de script/ejecutable se comprueba antes de intentar
el diálogo futuro, evitando interpretar un error de importación como fallo funcional.

T051 reutiliza el fixture ADMIN PROVISIONAL, hashes reales y reloj SQL exclusivo del esquema
de prueba. El control confirma provisional válida, cuenta pendiente y login/me denegados.
Las carreras están escritas con locks reales y `pg_blocking_pids` del cliente retenedor;
no añaden endpoints para pausar producción. **Sus aserciones posteriores al 404 aún no se
ejecutan**: deberán pasar después de T055, incluidas concurrencia y rollback.

T052 reutiliza la composición real y fixture de US2. Su control comprueba React/API,
ADMIN pendiente sin acceso y envío de verificación a Mailpit. Las solicitudes de correo y
la confirmación previa de los casos verificar→cambiar funcionan; la pantalla inicial falta.
Las aserciones después de esa pantalla esperan T056. Los fixtures de activación no demuestran
la creación del primer administrador por CLI; el recorrido conjunto corresponde a T058.
La recuperación tras provisional vencida se prepara como enlace, **no como reset funcional**;
su ejecución final permanece en US7/T081. No se promete entrega SMTP exactamente una vez.

## Verificación y reproducción

Docker Linux con imágenes existentes, fuentes/tests montados y datos `t_*` en la base de
pruebas. Sin herramientas, dependencias ni migraciones nuevas. Resultados:

| Comprobación | Resultado |
| --- | --- |
| T050–T051, Vitest | 4 aprobadas, 23 fallos esperados; cero omitidas |
| T052, Chromium | 1 aprobada, 8 fallos esperados; cero omitidas |
| Regresiones API: login, sesiones, registro, concurrencia y bootstrap | 116/116: 19 + 15 + 45 + 13 + 24 |
| Regresiones Chromium US1 / US2 | 21/21 y 14/14 |
| Lint API/web y configuración Playwright nueva | Aprobados |
| Compilación API/web | Aprobada |
| Unitarias y arquitectura | 72/72: API 37 y web 35 |
| Enlaces y formato | 115 enlaces locales sin rutas rotas; `git diff --check` aprobado |

Se corrigieron errores de ensayo: import explícito de `process` en el control MJS,
API sin compilar en la imagen de navegador y comillas del primer resumen inline. La ejecución
posterior usó API compilada y resúmenes saneados; los fallos restantes son únicamente
funcionalidad ausente. No se redujeron aserciones ni se habilitaron accesos de producción.

Para reproducir T050–T051 desde imágenes API compiladas y configuración de pruebas existente:

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --entrypoint sh api -c 'cd apps/api && npx vitest run tests/integration/bootstrap-cli.spec.ts tests/integration/initial-password.spec.ts'
```

Para navegador usar `ops/docker/compose.identity-tests.yml`, perfil `tests`, volumen
`academia_us1_test_runtime:/us1runtime:ro` y `PRISMA_SCHEMA_ENGINE_BINARY=/us1runtime/schema-engine`.
Montar API `src/tests`, web `src/tests` y ambas configuraciones `playwright.identity.config.ts`
y [playwright.first-admin.config.ts](../../../apps/web/playwright.first-admin.config.ts).
En el contenedor browser-tests:

```sh
cp -R /us1runtime/generated apps/api/generated
npm run build --workspace @academia/api
cd apps/web
npx playwright test --config playwright.first-admin.config.ts
```

Estos dos comandos de pruebas terminan con código 1 mientras falte US6; no son un checkpoint
aprobado. Las regresiones se ejecutan por separado, sin excluir ni modificar pruebas originales.
T050–T052 se completan como **escritura**, según el plan; T058 exige resultados funcionales verdes.

El ensayo manual se levantó con el overlay existente de [US2](us2.md#reproducción-y-ensayo-manual-conservado),
sin reconstruir imágenes. La comparación privada antes/después comprobó las 12 cuentas y su
archivo de credenciales sin cambios. Los tests solo borran/restablecen sus esquemas/archivos temporales;
no intervienen en desarrollo ni en `manual_us1_05832d35725f`. No se incluyen contraseñas,
tokens, enlaces utilizables ni resultados crudos. Monolito y dependencias de producción permanecen intactos.

Siguiente bloque recomendado: **T053–T055**, bootstrap/caso de uso, diálogo CLI y sustitución
inicial en API, evaluando sus dependencias en orden. T056–T058 mantienen UI/documentación y
checkpoint pendientes. T095 y T104–T108 conservan sus dependencias y ubicación en el cierre final.
