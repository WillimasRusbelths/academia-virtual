# US6 · Bootstrap y sustitución inicial en API

Fecha: 2026-10-14. Rama `feat/001-identidad-acceso-roles`; base `8d96e85`.
T053–T055 implementadas y verificadas. **US6 no completa:** T056–T058 siguen pendientes.
Fuentes: US6/FR-001/004/014/025–029/031/033 en [spec](../spec.md),
[contrato API y operativo](../contracts/api.md), [modelo/U1](../data-model.md) y [plan](../plan.md).

| Tarea | Comportamiento y evidencia | Pendiente del incremento |
| --- | --- | --- |
| T053 | [BootstrapAdmin](../../../apps/api/src/modules/identity/application/bootstrap-admin.ts) prepara hash y enlace cifrado compartido con T043 antes de llamar al store T028. Su transacción conserva ADMIN ACTIVE pendiente, provisional de 24 h, SYSTEM_BOOTSTRAP, marca irreversible y token/entrega si hay cuota. [Unitarias](../../../apps/api/src/modules/identity/application/bootstrap-admin.test.ts), [store](../../../apps/api/tests/integration/bootstrap-store.spec.ts) y CLI originales comprueban preparación, atomicidad, repetición, concurrencia y fallos. | Ninguno de T053; activación completa espera T056/T058. |
| T054 | [CLI](../../../apps/api/src/cli/bootstrap-admin.ts) y `admin:bootstrap`: terminal interactivo, configuración existente, alias ASCII de 1–64 caracteres sin valor predeterminado, provisional sin eco ni historial. Solo ID/correo o error seguro como resultado. [Controles adicionales](../../../apps/api/tests/integration/us6-bootstrap-guards.spec.ts) comprueban correlación LOCAL_OPERATOR/SYSTEM_BOOTSTRAP, exclusión de secretos, rechazo de argumentos/ausencia de terminal y alias inválidos sin mutación. | Ninguno de T054; procedimiento operativo completo corresponde a T057. |
| T055 | [SetInitialPassword](../../../apps/api/src/modules/identity/application/set-initial-password.ts), [adaptador](../../../apps/api/src/modules/identity/infrastructure/initial-password-store.ts) y [controlador](../../../apps/api/src/modules/identity/entrypoints/http/initial-password.controller.ts) montado: cuota compartida con login, verificación/hash fuera de lock y revalidación de estado, hash, versión y vigencia con reloj SQL tras adquirirlo. Cambio atómico de hash propio, `mustSetPassword=false`, provisional nula y `authVersion++`; 204 sin sesión ni verificación implícita. | Ninguno de T055; pantalla inicial pendiente T056. |

## Resultados

Docker Linux, fuentes actuales montadas sobre imágenes existentes; base de pruebas con
esquemas temporales `t_*`, migraciones existentes desplegadas y reloj SQL aislado.
No se requieren nuevas dependencias, migraciones ni base sombra.

| Comprobación | Resultado |
| --- | --- |
| T050 original: `bootstrap-cli.spec.ts` | 6/6; tres fallos funcionales anteriores pasan a verde. PTY real con eco habilitado, dos procesos concurrentes y repetición tras desactivación. |
| T051 original: `initial-password.spec.ts` | 21/21; veinte fallos anteriores pasan a verde. 24 h −1 ms/exactas, DTO inválido sin consumo, rechazo genérico, cuota persistida/reinicio, doble consumo, carreras de hash/versión/estado y rollback SQL real. |
| Controles CLI adicionales | 4/4; correlación, entrega cifrada, privacidad, alias y condiciones de entrada. |
| Regresiones API | 183/183: login 19, sesiones 15, registro 45, concurrencia 13, bootstrap T028 24, casos de uso US2 16, cuotas 12 y auditoría 39. |
| Unitarias y arquitectura | 85/85: API 50 y web 35; incluye 13 nuevas de bootstrap/alias. |
| T052 original, Chromium | 1 aprobada y 8 fallos esperados `US6_PENDING_UI`; cero fallos de entorno y cero casos omitidos. Falta `/establecer-contrasena` de T056, no un fallo HTTP de T055. |
| Regresiones Chromium US1 / US2 | 21/21 y 14/14, sin modificar aserciones. |
| Lint y compilación API/web | Aprobados. Se corrigieron dos advertencias de asignación innecesaria y un salto de línea en las nuevas pruebas antes de la ejecución aprobada. |
| Enlaces y formato | 126 enlaces locales revisados sin rutas rotas; `git diff --check` aprobado. |

Las suites originales no se modificaron. Los resultados de escritura históricos permanecen
en [us6-pruebas.md](us6-pruebas.md). La ejecución de T052 termina con código 1 por sus ocho
fallos pendientes; ejecutar las regresiones separadamente no convierte esa suite en aprobada.
No se demuestra un recorrido completo CLI → correo → sustitución → login ni V08/T058.
El enlace para provisional vencida espera la integración de recuperación US7/T081.
Encolar correo no equivale a entregarlo por SMTP, ni garantiza entrega exactamente una vez.

## Reproducción y aislamiento

Desde PowerShell, con los servicios y configuración Docker existentes:

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/src:/workspace/apps/api/src:ro" --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --volume "${PWD}/apps/api/package.json:/workspace/apps/api/package.json:ro" --entrypoint sh api -c 'npm run build --workspace @academia/api && cd apps/api && npx vitest run tests/integration/bootstrap-cli.spec.ts tests/integration/initial-password.spec.ts tests/integration/us6-bootstrap-guards.spec.ts'
```

Para navegador se utilizó el perfil `tests` de `ops/docker/compose.identity-tests.yml`,
runtime Prisma `academia_us1_test_runtime`, API compilada y las configuraciones
`playwright.first-admin.config.ts`, `playwright.identity.config.ts` y
`playwright.registration.config.ts`, con fuentes/tests actuales montados.
Procedimiento de ese entorno: [pruebas Docker](../../../ops/docker/README.md).

No se ejecutó bootstrap en desarrollo ni en el esquema manual de US1. El ensayo manual
conserva sus imágenes, esquema y volumen de secretos: los nuevos ejecutables se compilaron
en contenedores de prueba transitorios, sin reconstruir API/web manuales. No se publican
salidas crudas, contraseñas, hashes, identificadores de sesión ni enlaces utilizables.
La comparación privada antes/después confirmó las 12 cuentas, el esquema y el archivo
de credenciales manuales sin cambios.

## Revisión arquitectónica y límites

Reglas puras en dominio, coordinación en aplicación, terminal/HTTP/PostgreSQL/cifrado en
adaptadores y ensamblaje en CLI/AppModule/IdentityModule. Pool compartido, credenciales y
cuotas existentes; sin SMTP/hash dentro del bloqueo ni proceso servidor adicional.
Lint de límites y pruebas de arquitectura aprobados; sin infracciones detectadas en el bloque.

El [catálogo](../../../docs/02-arquitectura-software/componentes-arquitectonicos.md) y el
[diseño interno](../../../docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md)
mantienen estados históricos que presentan C11/bootstrap e inicial como previstos; requieren
actualización documental posterior. C11 continúa fuera del proceso HTTP, reutilizando C03;
la selección C4 de sesiones no incluye estos casos de uso. No se redibujan diagramas.
Siguiente bloque: T056–T058, UI, procedimiento operativo y checkpoint, según dependencias.
T095 y T104–T108 mantienen su lugar en el cierre final; aceptación humana y carga pendientes.
