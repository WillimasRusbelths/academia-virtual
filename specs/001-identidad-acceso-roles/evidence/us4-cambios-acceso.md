# US4 · Cambios de acceso y comandos HTTP

Fecha: 2026-10-14. Rama `feat/001-identidad-acceso-roles`; base `0805def`.
Dependencia T064 respaldada por [consultas/nombre/alta](us4-implementacion.md).
Resultados posteriores de las pantallas: [UI administrativa T068–T069](us4-ui.md).
Checklist documental 16/16; sin AGENTS.md aplicable, operación Git pendiente ni hooks.

| Tarea | Comportamiento comprobado | Límite |
| --- | --- | --- |
| T065 | [Reglas puras](../../../apps/api/src/modules/identity/domain/account-administration.ts) y [12 pruebas unitarias](../../../apps/api/src/modules/identity/domain/account-administration.test.ts): prohíben cambios de rol/desactivación propios y retirar el último ADMIN ACTIVE; deciden no-op, revocación y reactivación sin IO ni restauración de credenciales. | El cómputo de administradores utiliza rol/estado, sin añadir condiciones de verificación o contraseña. |
| T066 | [ChangeAccess](../../../apps/api/src/modules/identity/application/change-access.ts) y [adaptador](../../../apps/api/src/modules/identity/infrastructure/access-change-store.ts): gobierno → usuarios por UUID → sesión del actor y sesiones/tokens del destino → entregas. Revalidación bajo locks, revocaciones y auditoría comparten commit/rollback. | Las carreras adicionales de T070 y el checkpoint T071 siguen pendientes. |
| T067 | [Controlador](../../../apps/api/src/modules/identity/entrypoints/http/admin-commands.controller.ts) y [composición](../../../apps/api/src/modules/identity/identity.module.ts): POST alta reutiliza CreateAccount de T064; PUT rol/estado invoca ChangeAccess. DTO cerrados, 201/200, 400/401/403/404/409 y 503 seguros, UserView sin secretos. | No se añade UI ni mecanismos de acceso privilegiado. |

Fuentes: [US4 y FR-013–020/025](../spec.md),
[API administrativa](../contracts/api.md#endpoints-administrativos),
[modelo](../data-model.md#invariantes-transaccionales) y [plan](../plan.md#capas-internas-y-dependencias-permitidas).
No se modifican contratos ni reglas aprobadas.

## Comportamiento y verificación

Un cambio efectivo de rol o una desactivación incrementa authVersion una vez y revoca todas
las sesiones del destino. Desactivar revoca ambos propósitos no consumidos y cancela PENDING/SENDING,
borrando payload, clave/nonce/tag y claim/lease. Se conservan tokens consumidos y marcas
de revocación anteriores. Cambiar rol conserva tokens/entregas; reactivar conserva versión,
verificación y credenciales sin revivir cookies, tokens o correo. La corrección de rol de
una cuenta desactivada conserva disabledAt. No-op no altera cuenta/versión/revocaciones y
audita NO_CHANGE sin metadatos ficticios de transición.

Los éxitos se auditan con actor/destino y requestId en la misma transacción. Auditoría de
rol/estado incluye únicamente la transición pertinente; 409/401/403 no insertan éxito.
Se reutilizan sesión, credenciales, cuotas, cifrado y persistencia existentes. El controlador
solo comprueba forma del DTO y adapta la validación de contraseña al nombre provisionalPassword;
no vuelve a decidir roles, límites, último ADMIN o caducidad.

| Comprobación Docker | Resultado |
| --- | --- |
| T059 original | 62/62; los 32 fallos del bloque anterior pasan a verde. |
| T060 original | 13/13; los 11 fallos anteriores pasan a verde, incluidas las tres barreras de revalidación del actor. |
| [Pruebas adicionales](../../../apps/api/tests/integration/access-change.spec.ts) | 12/12: DTO/UUID/404, auditoría, rol sin revocar acciones, SENDING cancelado, tokens terminales conservados, reactivación/no-op, rollback completo y máximo dos reintentos en auditoría/revalidación. |
| Regresiones API | 250/250: US1/US2/US6 119; auditoría 39; bootstrap persistido 24; store de sesiones 15; guard 18; alta/nombre 35. |
| Unitarias y arquitectura | 97/97: API 62, web 35; lint y compilación API/web aprobados. |
| Chromium US1/US2/US6 | 21/21, 14/14 y 14/14; los 10 fallos esperados de T061 no se cuentan como aprobación. |
| Enlaces y formato | 171 enlaces locales comprobados, anclas nuevas válidas y `git diff --check` aprobado. |

La primera ejecución detectó tres 503 inesperados en cambios efectivos. Se corrigieron los
casts PostgreSQL de la sentencia UPDATE y se repitieron las suites: T060 13/13 y T059 62/62.
No se cambiaron aserciones ni se atribuyó ese error del adaptador a funcionalidad pendiente.
Los abortos de revalidación se comunican por una señal genérica de transacción abortada;
el protocolo común solo reintenta con rollback confirmado, hasta dos veces. No se propagan
SQL, mensajes del motor, payloads, contraseñas ni causas originales a respuestas o evidencia.
Las pruebas fuerzan abortos PostgreSQL reales con sentencias de ensayo; no demuestran un
deadlock espontáneo ni sustituyen las carreras específicas de T070.

T061 mantiene 2 controles aprobados y 10 fallos esperados por el fallback de `/admin/cuentas`.
Sus aserciones posteriores de formularios y V04-B no se han ejecutado. **US4 y V04-B siguen
sin aceptación**; los estados de componentes no se consideran completos por estas rutas.
RESET_PASSWORD sigue siendo preparación sintética para comprobar revocación: no acepta US7.
Cancelar una entrega persistida no permite deshacer SMTP ya iniciado ni garantiza entrega
exactamente una vez.

## Reproducción y alcance

Se usaron contenedores transitorios, fuentes/tests/package.json actuales montados, PostgreSQL
y Mailpit existentes y esquemas `t_*` nuevos con migraciones desplegadas. No se ejecutó
db:migrate:dev ni se cambiaron Docker, dependencias o configuraciones del equipo.

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/src:/workspace/apps/api/src:ro" --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --volume "${PWD}/apps/api/package.json:/workspace/apps/api/package.json:ro" --entrypoint sh api -c 'npm run lint --workspace @academia/api && npm run build --workspace @academia/api && npm run test:unit --workspace @academia/api && cd apps/api && npx vitest run tests/integration/admin-users.contract.spec.ts tests/integration/admin-revocation.spec.ts tests/integration/access-change.spec.ts'
```

Chromium utiliza [identity-tests](../../../ops/docker/compose.identity-tests.yml), runtime
Prisma existente y configuraciones admin-users/identity/registration/first-admin, según
[operación Docker](../../../ops/docker/README.md). Reportes crudos privados; sin trace,
screenshot, video o copia de prompts que expongan secretos.

La comparación privada antes/después confirmó las mismas 12 cuentas, credenciales y esquema
del ensayo manual. Se conservaron sus imágenes/configuración y no se ejecutaron bootstrap,
purgas o restauraciones sobre ese esquema.

Monolito y Clean Architecture conservados: dominio puro, aplicación sin HTTP/SQL y
adaptadores ensamblados en [AppModule](../../../apps/api/src/app.module.ts); users no importa
internos de identity. Se comparte la validación UUID mediante la superficie pública de users.
No se modifican diagramas ni se adelantan verificaciones finales. Siguiente bloque:
T068–T069, UI administrativa; después T070–T071 cierran carreras/checkpoint, incluido V04-B.
