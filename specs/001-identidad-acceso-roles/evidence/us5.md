# US5: protección de operaciones y datos privados

## Alcance y estado

T087–T088 completas sobre `feat/001-identidad-acceso-roles`, con T082–T086 verificadas.
El checkpoint técnico US5 queda aprobado para los flujos P1 actuales: V09/V12/V14/VA y
comparación temporal V03/V10. No se completa US3 ni las verificaciones finales del spec.

| Criterio | Prueba y fuente | Estado de este bloque |
| --- | --- | --- |
| V09, FR-018–FR-020 | [Matriz directa](../../../apps/api/tests/integration/permission-matrix.spec.ts): visitante, alumno A/B, docente, administrador, estados/sesiones inválidos, destinos conocidos/desconocidos y ausencia de efectos | 33/33 aprobadas |
| V12, FR-026, SC-007 | [Privacidad de flujos P1](../../../apps/api/tests/integration/secret-redaction.spec.ts), auditoría/U1 y atribución de cambios administrativos | Privacidad 5/5 y auditoría 58/58 aprobadas |
| V14 | [CSRF/CORS](../../../apps/web/tests/e2e/csrf.spec.ts) y [navegación/contenido](../../../apps/web/tests/e2e/denied-access.spec.ts) sobre la API y web reales | 16 originales + 12 de navegación/contenido: 28/28 aprobadas |
| VA | [Capas](../../../apps/api/tests/architecture/layers.spec.ts), reglas de importación y revisión de atomicidad de [T085–T086](us5-integracion.md) | Cinco pruebas de capas, tres de barreras y lint aprobados; código productivo sin cambios |
| Políticas HTTP | [Metadatos de controladores compilados](../../../apps/api/tests/architecture/endpoint-policies.spec.ts) | 1/1: 17 endpoints con política explícita |
| V03/V10 temporal | [Protocolo U2, datos y límites](enumeration.md) | Cinco cohortes × tres rondas: 8700 muestras + 870 calentamientos; sin señal detectada bajo este protocolo |

## Revisión de políticas

| Operaciones actuales | Política |
| --- | --- |
| Salud live/ready | Pública explícita |
| Registro, login/logout, solicitud/confirmación de verificación, establecimiento inicial y recuperación/reset | Pública explícita; mantienen validaciones, Origin/CSRF, cuotas y reglas de cada caso de uso |
| Consulta propia `/me` | `profile:read`: sesión y cuenta habilitadas de cualquiera de los tres roles |
| Listado/detalle/alta y cambios de nombre/rol/estado | `users:manage`: solo ADMIN, con revalidación transaccional al mutar |

El [guard](../../../apps/api/src/modules/authorization/entrypoints/http/access.guard.ts)
deniega por defecto si falta política. Una política pública no desactiva las reglas del
caso de uso; logout es idempotente según su contrato. La UI no concede permisos.

## Hallazgo intermitente de bootstrap CLI

El primer lote de T085–T086 tuvo un fallo sin diagnóstico detallado en la prueba de
privacidad de bootstrap. Las tres repeticiones posteriores aprobadas no confirmaron su
causa ni lo resolvieron. Se conserva ese hallazgo en [la evidencia original](us5-integracion.md).

En este bloque se añadió diagnóstico saneado al [harness PTY](../../../apps/api/tests/support/us6-cli.ts):
duración, señal, campos respondidos por nombre, timeout/error de arranque y cantidad de bytes;
nunca entradas, credenciales o transcripción. La aserción original conserva su exigencia y
ahora aporta estos datos si falla. No se modificaron tiempos, aserciones o políticas productivas.

El diagnóstico acotado aprobó **23/23**: ocho [inicializaciones/repeticiones](../../../apps/api/tests/integration/bootstrap-cli-diagnostic.spec.ts),
las seis pruebas originales CLI, cuatro controles de bootstrap y las cinco de privacidad.
Comprobó ocultación, no sobrescritura, cero sesiones, marca única, auditoría y correlación
LOCAL_OPERATOR → SYSTEM_BOOTSTRAP, sin usuario ficticio ni secretos en registros/salida.
**La causa original sigue sin confirmarse; el hallazgo continúa abierto.**

No hay un defecto de privacidad o atomicidad reproducido que corregir con estos resultados.
En el lote final también aprobaron la suite original de privacidad, los controles CLI y
las regresiones, sin omisiones ni cambios en sus aserciones. No quedó un criterio actual
de US5 incumplido en esas ejecuciones: se acepta el checkpoint técnico local conservando
el hallazgo de estabilidad abierto, sin dar por resuelta su causa. Si reaparece, el lote
afectado no contará como aprobado y el diagnóstico saneado permitirá precisar la fase.
Su seguimiento continúa en la regresión final T106.

## Verificación y estado persistido

Contenedores efímeros Linux con fuentes actuales montadas y compiladas, dependencias
existentes y esquemas nuevos `t_*` en la base de pruebas. No se añaden migraciones.

| Comprobación | Resultado |
| --- | --- |
| Lint y compilación de API/web | Aprobados |
| Unitarias | **120/120**: API 75, web 45; incluyen VA y la política de los 17 endpoints |
| Integración y cálculos U2 | **347/347**, cero omitidas: matriz 33, privacidad 5, auditoría 58, guard 18, transporte 17, login 19, consulta/cierre 20, registro 45, inicial 21, reset 26, administración 62, CLI 6, controles bootstrap 4, diagnóstico CLI 8 y cálculo/orden 5 |
| Ensayo temporal real | **1/1**; recálculo independiente de todas las muestras, cero cruces, 429/5xx/timeouts o diferencias públicas |
| Seguridad Chromium | **28/28**: 16 originales T084 y 12 de navegación/contenido T086 |
| Regresiones Chromium | **105/105**: US1 21, US2 14, US6 14, US4 20 y US7 36; configuraciones originales, sin omisiones ni fallos esperados restantes |
| Ensayo manual | 12 cuentas y archivo privado de credenciales con huella idéntica antes/después; cuatro servicios healthy, API live/ready, web y Mailpit con HTTP 200 |

La matriz comprueba que las denegaciones no alteran cuentas, sesiones, enlaces o auditoría
de negocio. Las pruebas de privacidad verifican la atribución actor/destino de los cambios
administrativos aceptados, listas de campos permitidos, secretos señuelo ausentes y
denegaciones igualmente seguras aunque falle el logger o el destino no exista.
Bootstrap conserva la marca única, una cuenta y un evento correlacionado, sin sesiones
ni sobrescritura al repetir. No se atribuye a estos casos la invalidación global pendiente.

U2 terminó con 8250 cuentas sintéticas, 1980 tokens/entregas pendientes, cero sesiones o
eventos de auditoría, sin bootstrap y sin cambios en las cuentas preparadas. Se comprobó
el contador persistido de 330 orígenes, todos con 13 admisiones; la limpieza del esquema
propio finalizó correctamente. La entrega SMTP se mantiene fuera de este ensayo temporal.

Reproducción: `npm run lint`, `npm run build` y `npm run test:unit` en la imagen API con
fuentes y pruebas de API/web actuales, configuración ESLint y `ops/lint` montados. Después,
desde `apps/api`, sin ejecutar simultáneamente el ensayo temporal:

```sh
npx vitest run tests/security/enumeration-protocol.spec.ts tests/integration/permission-matrix.spec.ts tests/integration/secret-redaction.spec.ts tests/integration/access-guard.spec.ts tests/integration/http-security.spec.ts tests/integration/login.contract.spec.ts tests/integration/us1-read-logout.contract.spec.ts tests/integration/registration.contract.spec.ts tests/integration/initial-password.spec.ts tests/integration/password-reset.contract.spec.ts tests/integration/admin-users.contract.spec.ts tests/integration/audit.spec.ts tests/integration/bootstrap-cli.spec.ts tests/integration/us6-bootstrap-guards.spec.ts tests/integration/bootstrap-cli-diagnostic.spec.ts --maxWorkers=1
```

Para Chromium se utiliza [Compose de pruebas](../../../ops/docker/compose.identity-tests.yml),
el runtime Prisma preparado y la API compilada con fuentes actuales. Desde `apps/web`,
ejecutar `npx playwright test --config playwright.security.config.ts`, seguido de las
configuraciones originales `identity`, `registration`, `first-admin`, `admin-users` y
`password-reset`. Sin trazas, capturas, vídeos ni publicación de reportes privados.
Los resúmenes saneados quedan en `.cache/us5/`, ignorados por Git.

El [ensayo manual](../../../ops/local/manual-us1.md) mantiene su versión y comando de
inicio documentados: no se reconstruyeron sus imágenes ni se tocaron cuentas, volúmenes
o puertos. Las fuentes actuales se probaron en contenedores temporales; la salud del
ensayo conservado no se presenta como validación funcional de esta revisión.

T087 y T088 quedan marcadas en [tasks.md](../tasks.md): **88 completas / 20 pendientes**.
Comprobados 285 enlaces locales y 108 IDs únicos; `git diff --check` aprobado,
incluidos los archivos nuevos al preparar el commit.

## Límites

La aceptación técnica local no equivale a aceptación humana ni a seguridad absoluta.
La retención/purga, restauración, carga de 1000 usuarios y cierre final permanecen en sus
tareas. Los ensayos usan esquemas nuevos y credenciales sintéticas; el entorno manual y
sus cuentas se conservan. No se introducen retardos productivos, bypass, servicios nuevos,
cambios de contratos ni diagramas.
