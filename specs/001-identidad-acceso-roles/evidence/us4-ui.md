# US4 · Pantallas administrativas

Fecha: 2026-10-15. Rama `feat/001-identidad-acceso-roles`; base `3059561`.
Dependencia T067 respaldada por [comandos y cambios de acceso](us4-cambios-acceso.md).
Sin AGENTS.md aplicable, fusión pendiente ni hooks; checklist documental 16/16.

| Tarea | Implementación y comprobación | Estado y límite |
| --- | --- | --- |
| T068 | [Listado](../../../apps/web/src/features/admin-users/accounts-page.tsx) y [cliente de la feature](../../../apps/web/src/features/admin-users/api.ts): búsqueda nombre/correo, filtros de rol/estado, tamaño y paginación, carga/vacío/errores y reintento manual de consultas. | Completa. Solo proyecta UserView; las consultas siempre se autorizan en la API. |
| T069 | [Alta](../../../apps/web/src/features/admin-users/create-account-form.tsx), [detalle](../../../apps/web/src/features/admin-users/account-detail-page.tsx) y [router](../../../apps/web/src/app/router.tsx), ensamblados en [App](../../../apps/web/src/app/App.tsx): nombre, rol/estado con confirmación y cancelación explícitas, errores de invariantes, limpieza de provisional y consulta por correo si se pierde la respuesta de alta. | Completa como UI; no completa T070/T071 ni la aceptación de US4/V04-B. |

Fuentes: [US4 y FR-013–021/025](../spec.md), [pantallas](../contracts/ui.md) y
[API administrativa](../contracts/api.md#endpoints-administrativos). No se cambian contratos,
reglas del backend, migraciones, Docker ni diagramas.

## Resultados Docker

| Comprobación | Resultado |
| --- | --- |
| T061 original, sin modificar | 12/12; sus diez fallos anteriores pasan a verde. |
| [UI adicional](../../../apps/web/tests/e2e/admin-users-ui.spec.ts) | 8/8: filtros/paginación/vacío/validación a dos resoluciones, 503 con reintento manual, alumno/docente con 403, cancelación/409 propio, pérdida de permisos al enviar y respuesta de alta perdida después del commit. |
| Recorridos | Alta privada → Mailpit → verificación → contraseña inicial → login; búsqueda/corrección de nombre a 360×800 y 1366×768, confirmaciones de acceso y seis variantes de sesión vencida con 401, ausencia de cambios/auditoría y sin replay al volver a acceder. |
| Revisión visual | Capturas locales de listado/detalle a ambas resoluciones abiertas y revisadas; sin scroll horizontal, texto y controles legibles. Dos casos de UI se repitieron para las capturas y detalle adaptable. |
| Regresiones API US1/US2/US6 | 119/119: login 19, sesiones 15, registro 45, concurrencia 13, CLI 6 e inicial 21. |
| Regresiones Chromium US1/US2/US6 | 21/21, 14/14 y 14/14. Sin fallos esperados restantes en las suites ejecutadas; T070 no se ejecutó ni modificó. |
| Unitarias/arquitectura | 107/107: API 62, web 45. Se mantienen las pruebas originales de sesión estricta y se añaden pruebas de proyección administrativa, comandos, codificación de filtros y rutas dinámicas. |
| Lint y compilación | API/web aprobados, incluidas reglas de dependencias; imports de tipo corregidos antes de repetir lint. |
| Enlaces y formato | 172 enlaces locales comprobados y `git diff --check` aprobado. |

T061 comprueba técnicamente sus seis casos V04-B, pero **no se acepta V04-B ni US4** en
este bloque: T070 debe ampliar las carreras y T071 reunir/inspeccionar la evidencia del
checkpoint. Tampoco se anticipan T094, retención/purga, observación humana o carga.

## Privacidad, errores y arquitectura

Se reutiliza el cliente de sesión de [SessionProvider](../../../apps/web/src/app/session.tsx).
Un 401 limpia perfil, cancela respuestas pendientes y cambia a login; el cambio de ruta
desmonta los formularios y no guarda acciones para reenviarlas. Un 403 explica la denegación
y retira datos/formularios administrativos. El enlace de gestión del inicio refleja el rol
devuelto por el servidor; no constituye autorización.

El [transporte compartido](../../../apps/web/src/app/http.ts) admite filtros codificados solo
para GET administrativo, con claves permitidas; no acepta destinos externos ni secretos en
paths. Las búsquedas permanecen en memoria, sin query del navegador, historial o storage.
[readAccountView](../../../apps/web/src/shared/user-view.ts) admite cuentas pendientes y
desactivadas con proyección cerrada; readUserView conserva las condiciones estrictas de una
sesión habilitada. No se importan entidades, adaptadores ni reglas privadas del backend.

La provisional se introduce privadamente, no se genera por defecto ni se devuelve desde API;
se retira del formulario al enviar y no se persiste. Ante 503/resultado incierto o 409 de alta
se bloquea el reenvío del formulario y se ofrece consultar el correo. El ensayo de respuesta
perdida confirmó una sola creación y ningún overwrite. Las mutaciones no se reintentan
automáticamente; los errores públicos descartan mensajes y valores remotos.

## Entorno y reproducción

Docker Desktop estaba detenido: se inició su instalación existente y los cuatro contenedores
anteriores con la configuración manual y `--no-recreate --wait`, sin reconstruir imágenes ni
modificar configuración. Pruebas en contenedores Linux transitorios, fuentes/tests y
package.json actuales montados, PostgreSQL/Mailpit existentes y esquemas nuevos `t_*` con
migraciones desplegadas. No se ejecutan limpiezas o bootstrap sobre desarrollo o el ensayo manual.
Las imágenes manuales conservan su versión anterior; esta entrega se validó con fuentes montadas.
La comparación privada antes/después confirmó las mismas 12 cuentas, credenciales y esquema.

Para Chromium se usa [identity-tests](../../../ops/docker/compose.identity-tests.yml),
el runtime Prisma existente y las configuraciones admin-users/identity/registration/first-admin,
según [operación Docker](../../../ops/docker/README.md). Tras compilar API, desde apps/web:

```sh
npx playwright test --config playwright.admin-users.config.ts
```

La configuración incluye la suite original y la adicional. Los reportes crudos se mantuvieron
en `/tmp` del contenedor transitorio; las capturas voluntarias de cuentas ficticias permanecen
locales/ignoradas en `.cache/us4/`. No hay trazas, vídeos ni capturas automáticas de formularios
con secretos. La inspección visual no equivale
a aceptación humana. Siguiente bloque: T070 y después T071, manteniendo sus criterios completos.
