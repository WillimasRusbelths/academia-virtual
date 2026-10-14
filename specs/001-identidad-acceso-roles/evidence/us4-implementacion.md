# US4 · Consultas, nombre y alta administrativa

Fecha: 2026-10-14. Rama `feat/001-identidad-acceso-roles`; base `79168ac`.
Dependencias T059–T061 cumplidas como [escritura ejecutada](us4-pruebas.md), no aceptación.
Checklist documental 16/16; sin AGENTS.md aplicable ni hooks de implementación.

| Tarea | Comportamiento comprobado | Estado y límite |
| --- | --- | --- |
| T062 | [ListUsers](../../../apps/api/src/modules/users/application/list-users.ts), [GetUser](../../../apps/api/src/modules/users/application/get-user.ts) y [consultas PostgreSQL](../../../apps/api/src/modules/users/infrastructure/user-queries.ts), montados mediante [controlador](../../../apps/api/src/modules/users/entrypoints/http/admin-queries.controller.ts): ADMIN, UserView cerrado, q hasta 254, comodines literales, filtros enum, página/tamaño y orden createdAt,id. Listado y total comparten una sentencia SQL. | Completa; GET listado/detalle reales, 401/403 anteriores al lookup del destino y 404 después de autorizar. |
| T063 | [ChangeName](../../../apps/api/src/modules/users/application/change-name.ts), [store](../../../apps/api/src/modules/users/infrastructure/name-store.ts) y [controlador PATCH](../../../apps/api/src/modules/users/entrypoints/http/change-name.controller.ts): únicamente nombre Unicode normalizado, usuarios bloqueados por UUID, revalidación de actor/sesión y NAME_CHANGED en el mismo commit. | Completa; rollback comprobado incluso tras insertar el evento. No cambia correo, rol, estado ni credenciales; tampoco revoca sesiones por corregir nombre. |
| T064 | [CreateAccount](../../../apps/api/src/modules/identity/application/create-account.ts) y [store](../../../apps/api/src/modules/identity/infrastructure/account-creation-store.ts): tres roles permitidos, provisional hasheada fuera de locks y vigente 24 h, ACTIVE pendiente de verificación/sustitución, conflicto canónico tipado, cuenta/token/entrega cifrada/auditoría atómicos. Falta de cuota conserva cuenta/evento sin token; reenvío existente funciona después de la espera. | Completa como caso de uso/adaptador. Exposición POST y adaptación HTTP del conflicto corresponden a T067, aún pendiente. |

Fuentes normativas: [US4 y FR-013–014/018–020/025](../spec.md),
[API administrativa](../contracts/api.md#endpoints-administrativos) y
[invariantes](../data-model.md#invariantes-transaccionales).

## Pruebas y resultados

Todas las comprobaciones de persistencia se ejecutaron en Docker Linux con PostgreSQL real,
migraciones desplegadas en esquemas nuevos `t_*`, pool y fixtures existentes. Sin migraciones
nuevas, `db:migrate:dev`, cambios de configuración ni instalación de dependencias.

| Suite | Resultado |
| --- | --- |
| T059 original | 30 aprobados, 32 fallos esperados; 28 casos de listado/detalle/nombre pasan de rojo a verde. |
| T060 original | 2 controles aprobados, 11 fallos esperados por PUT rol/estado aún ausentes. |
| [Consultas/nombre adicionales](../../../apps/api/tests/integration/users-administration.spec.ts) | 11/11: autorización antes de existencia/UUID inválido, sesión ausente, 404 autorizado, corrección propia, rollback de auditoría, actor sin permisos, dos ADMIN con locks ordenados y sesión revocada durante espera. |
| [Alta administrativa directa](../../../apps/api/tests/integration/account-creation.spec.ts) | 24/24: roles, Unicode, hash sin trim, caducidad, cuota/reenvío, duplicado y doble alta, entradas inválidas, denegación antes de hash, revocación durante hash, gobierno ADMIN con revalidación, abortos transitorios y fallos reales de auditoría/cifrado sin estado parcial. |
| Regresiones API US1/US2/US6 | 119/119: login 19, sesiones 15, registro 45, concurrencia 13, CLI 6 e inicial 21. |
| Regresiones de auditoría/bootstrap afectadas | 39/39 y 24/24, repetidas tras conservar la señal segura de aborto transitorio. |
| Unitarias y arquitectura | 85/85: API 50, web 35; incluye los cuatro ensayos del protocolo de transacciones con commit incierto/rollback fallido. |
| Lint y compilación | API/web aprobados; lint verifica las dependencias entre capas y módulos. |
| Enlaces y formato | 162 enlaces locales comprobados en los cinco documentos del bloque; `git diff --check` aprobado. |

Los 32 fallos restantes de T059 corresponden a POST alta pendiente de T067, DTOs PUT
pendientes de T065–T067 y casos que exigen las seis rutas montadas. Las aserciones originales
no se modificaron, omitieron ni relajaron. Los fallos HTTP esperados son 404 de rutas ausentes,
no errores de imports, migraciones o conexiones. Las suites administrativas devuelven código 1;
las suites adicionales del bloque y regresiones API devuelven código 0.

T061 conserva 2 controles aprobados y 10 fallos esperados por la página administrativa ausente.
Sus aserciones posteriores sobre alta y V04-B no se han ejecutado; requieren T068–T071.
Las regresiones Chromium de US1, US2 y US6 aprobaron 21/21, 14/14 y 14/14 respectivamente.
La repetición de US6 montó también package.json vigente; el primer ensayo de navegador
sin ese montaje terminó con fallo y no se contó como aprobado.

La primera ejecución de CLI usó el package.json antiguo de la imagen de ensayo y produjo
tres fallos de disponibilidad. Se corrigió el montaje del archivo vigente sin modificarlo:
CLI 6/6 en la repetición. No se atribuyen esos fallos a funcionalidad pendiente.

La comparación privada antes/después confirmó las mismas 12 cuentas y credenciales del
ensayo manual, así como su esquema. Sus imágenes/configuración no se reconstruyeron ni
se ejecutaron bootstrap, purgas o restauraciones sobre él.

## Reproducción y arquitectura

Desde PowerShell, contra los servicios PostgreSQL/Mailpit existentes:

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/src:/workspace/apps/api/src:ro" --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --volume "${PWD}/apps/api/package.json:/workspace/apps/api/package.json:ro" --entrypoint sh api -c 'npm run lint --workspace @academia/api && npm run build --workspace @academia/api && cd apps/api && npx vitest run tests/integration/users-administration.spec.ts tests/integration/account-creation.spec.ts'
```

T059/T060 se ejecutan con los mismos montajes y sus archivos originales. Para Chromium se
usa [identity-tests](../../../ops/docker/compose.identity-tests.yml), el runtime Prisma
existente y las configuraciones identity/registration/first-admin/admin-users; véase
[operación Docker](../../../ops/docker/README.md). Los reportes crudos quedan privados;
la salida resumida omite contraseñas, cookies, hashes, tokens y enlaces utilizables.

Aplicación coordina validación y capacidades; dominio conserva las reglas Unicode/roles,
caducidad y permisos. SQL/locks siguen en infraestructura; los controladores solo adaptan
transporte/resultados. Users no importa implementaciones internas de identity/audit:
[AppModule](../../../apps/api/src/app.module.ts) inyecta los adaptadores existentes de sesión
y auditoría. El [protocolo de transacciones](../../../apps/api/src/infrastructure/database/account-transaction.ts)
se extrae a infraestructura común y la función existente actionTransaction lo reutiliza;
se conservan dos reintentos solo tras aborto/rollback confirmado y no se repite un commit ambiguo.
El [writer de auditoría](../../../apps/api/src/modules/audit/infrastructure/audit-writer.ts)
conserva exclusivamente 40001/40P01 en su error seguro para permitir esos reintentos;
un trigger de prueba aborta dos INSERT y el tercero confirma un único conjunto de datos.
No propaga mensajes PostgreSQL, SQL, valores ni causas originales.
Las cuotas se admiten antes de adquirir locks de gobierno/usuarios; SMTP sigue fuera del commit.
El alta ADMIN bloquea SystemState, sin cambiar ni reinicializar la marca de bootstrap.

No se implementan cambios de rol/estado, UI administrativa ni T070/T071. **US4 y V04-B
continúan sin aceptación.** El próximo bloque es T065–T067, reglas/cambios de acceso y
exposición de comandos. Retención y verificaciones finales mantienen sus dependencias.
No se modifican diagramas ni se afirma cumplimiento de 1000 usuarios concurrentes.
