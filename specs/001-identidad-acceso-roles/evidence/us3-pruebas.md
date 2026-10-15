# US3: pruebas de perfil, inicio y accesibilidad

## Alcance y dependencias

T089–T090 son escritura y ejecución de pruebas, no implementación ni aceptación de US3.
Dependen de T088, comprobada en [US5](us5.md), commit `3afdc44`. La rama inicial fue
`feat/001-identidad-acceso-roles`, sin cambios, fusión/rebase ni AGENTS.md aplicable.
Checklist documental: 16/16. No hay hooks de implementación registrados.

Fuentes: [US3, FR-010–FR-012/FR-021 y SC-005](../spec.md),
[API: UserView y GET /me](../contracts/api.md), [pantallas](../contracts/ui.md) y
[V05 / reglas de escritura de pruebas](../verification.md). T091–T094 siguen pendientes;
no se modifican producción, contratos, requisitos, Docker ni diagramas.

## T089: contrato propio

[Suite](../../../apps/api/tests/integration/profile.contract.spec.ts): **18/18 aprobadas**
contra la composición HTTP real y PostgreSQL. `/me` ya estaba implementado; no se fuerza
un fallo artificial.

- Tres roles: ocho campos exactos de UserView, rol escalar único, estado, indicadores
  booleanos, UUID y fecha idéntica a la persistida, serializada en UTC.
- Ningún hash, versión, credencial, colección de roles, sesión o token en el cuerpo;
  sin nueva cookie y con cabeceras de privacidad.
- Diez filtros prohibidos, cada uno con valor conocido/desconocido; arrays, parámetros
  repetidos y filtros anidados rechazados con 400, sin renovar actividad.
- Cambiar cabeceras declarativas no selecciona una cuenta ajena. La cookie determina
  el perfil en consultas alternadas de los tres roles.
- Sesión ausente/revocada o cuenta desactivada: 401 sin perfil ni secretos.

## T090: recorridos de interfaz

[Suite](../../../apps/web/tests/e2e/accessibility.spec.ts),
[herramientas de teclado](../../../apps/web/tests/support/accessibility.ts) y
[configuración](../../../apps/web/playwright.accessibility.config.ts): 28 escenarios,
cada uno a **360×800** y **1366×768**. Ejecución final: **42 aprobadas / 14 fallos
esperados / 0 errores de pruebas o infraestructura / 0 omitidas**. Son 21 aprobadas y
7 fallos esperados por resolución. Las esperas, geometría y errores se contrastaron con
el contrato antes de completar la escritura.

| Selección | Comprobaciones |
| --- | --- |
| Inicio y perfil por rol | Identidad propia, rol único, gestión solo ADMIN, enlace a perfil, lectura sin edición, recarga y rechazo de visitante |
| Acceso y cierre por rol | Tab/teclado, foco visible, HTTP real, llegada a inicio y rechazo tras logout |
| Formularios públicos | Etiquetas, orden alcanzable por Tab, texto asociado, descripción accesible del error y ausencia de POST inválido |
| Registro y verificación | Registro → captura Mailpit → confirmación explícita → acceso → cierre; también reenvío |
| Sustitución inicial | Verificación → credencial provisional → contraseña propia → acceso, sin auto-login |
| Recuperación | Solicitud → Mailpit → reset → acceso; confirmación inválida conserva el enlace |
| Administración | Búsqueda/filtros/paginación/detalle, alta, nombre, cancelación/confirmación de rol y estado, reactivación y rechazo de cambio propio |

Las acciones de interfaz usan Tab, Enter y teclas de selección; sin click, hover o focus()
programático. Las entradas sensibles se generan en memoria y cualquier error al escribirlas
se convierte en mensaje sin valores. Cada control visible y habilitado revisado debe tener
nombre accesible y ser alcanzable con foco visible dentro de la pantalla. Se mide el ancho
de página en las pantallas y estados visitados; se permite desplazamiento vertical y
contenedores internos accesibles. Los errores requieren texto asociado y descripción
accesible al recorrer el campo con teclado; no se impone una alerta inmediata concreta.

| Fallo esperado | Casos | Causa contrastada / implementación pendiente |
| --- | ---: | --- |
| Pantalla propia y rechazo de visitante | 8 | [Rutas](../../../apps/web/src/app/App.tsx) e [isProtectedPath](../../../apps/web/src/app/router.tsx) no incluyen `/perfil`; se muestra «Página no disponible». T091 |
| Enlace al perfil desde inicio | 6 | [HomePage](../../../apps/web/src/features/profile/home-page.tsx) muestra identidad, rol y cierre, pero no el enlace. T092 |

La espera de redirección del visitante falla como aserción de URL: la ruta sigue siendo `/perfil`; no es un timeout de
HTTP ni un fallo de conexión.
No se usan skip, fixme, reintentos automáticos o `test.fail()` para convertir estos rojos
en aprobaciones. Playwright devuelve 1 por esas 14 aserciones pendientes: no se informa
la suite nueva como aprobada ni se acepta US3.

Fuentes de las validaciones revisadas: [login](../../../apps/web/src/features/auth/login-page.tsx),
[búsqueda](../../../apps/web/src/features/admin-users/accounts-page.tsx),
[alta](../../../apps/web/src/features/admin-users/create-account-form.tsx) y
[nombre](../../../apps/web/src/features/admin-users/account-detail-page.tsx).

## Ejecución, regresiones y diagnóstico

Imágenes Linux existentes; fuentes y pruebas actuales montadas, API recompilada antes de
probar, Prisma/migraciones existentes en esquemas nuevos `t_*` de `academia_v00_test`.
Se reutilizan `us1Dataset`, `us2-fixture`, emisión sintética restringida y buzones ficticios
de Mailpit. Cada caso restablece únicamente su esquema, sin borrar el buzón global.

| Verificación | Resultado |
| --- | --- |
| Lint y build de API/web | Aprobados |
| Unitarias y arquitectura | 120/120: API 75 y web 45 |
| T089 y regresiones API | 105/105: perfil 18, login 19, consulta/cierre 20, matriz 33, privacidad 5, CLI 6, controles bootstrap 4 |
| T090 | 56 ejecutadas: 42 aprobadas, 14 fallos esperados confirmados, cero errores de entorno/pruebas y omisiones |
| Regresiones Chromium | 133/133: US1 21, US2 14, US6 14, US4 20, US7 36 y seguridad 28; cero omitidas o fallos esperados |
| Conservación del [ensayo manual](../../../ops/local/manual-us1.md) | Las 12 cuentas y archivo privado de credenciales conservan la misma huella antes/después; cuatro servicios healthy y API live/ready, web y Mailpit con HTTP 200 |

El fallo intermitente de bootstrap conserva su [diagnóstico y causa no confirmada](us5.md#hallazgo-intermitente-de-bootstrap-cli).
En este lote pasaron privacidad, CLI, controles bootstrap y los 14 recorridos originales
US6 de navegador, sin modificar tiempos ni aserciones. No se declara resuelto.
Si reaparece, se conservan fase/campos respondidos,
duración, señal, timeout, tamaño de salida y contexto del lote, sin entradas ni transcripción.
Su seguimiento permanece en T106.

### Correcciones del arnés T090

El primer ensayo tuvo 28 aprobadas, 26 fallos inicialmente clasificados y dos errores
sin clasificar. No se aceptó ese lote como evidencia suficiente de T090. Se conservaron
su resumen y un diagnóstico acotado de diez casos: 2 aprobadas, 6 fallos de foco y
2 errores de contexto de navegación confirmados.

- Los enlaces se activaban con Enter sin esperar la carga del destino. La siguiente
  evaluación podía ejecutarse en un contexto destruido. El arnés ahora espera la URL
  y carga real; no se introducen retardos fijos ni respuestas simuladas.
- El foco estaba pintado y era `:focus-visible`, pero el desplazamiento nativo entero
  dejaba bordes como 800,34375 frente a 800 px. La comparación de DOMRect ahora se
  expresa en píxeles CSS enteros, sin confundir esas fracciones con un control inaccesible.
  Se mantienen foco pintado, alcance por teclado y la condición exacta de ancho de página.
- Se espera el montaje/hidratación al inspeccionar perfil y su rechazo, conservando los
  resultados requeridos. No se corrigen pantallas ni se omiten pruebas.
- El ensayo intermedio quedó en 34 aprobadas / 22 fallidas / 0 errores de entorno.
  Una revisión normativa detectó que ocho aserciones exigían alerta inmediata o foco
  automático, condiciones no fijadas por T090/FR-021 ni el contrato UI. `aria-describedby`
  ya permite anunciar la descripción al recorrer el campo. Se corrigió esa exigencia:
  cada error conserva texto asociado y debe tener descripción accesible y ser alcanzable
  con foco visible por teclado. Se repite la suite completa; no se imponen cambios de
  producción para introducir una técnica ARIA específica.

La ejecución final íntegra confirma 42/14: los errores textuales y sus descripciones
accesibles pasan en ambos tamaños; todos los rojos restantes corresponden a T091–T092.
Los controles actuales revisados de accesibilidad no completan T093 ni su dependencia
de las pantallas futuras. Se conservan los resúmenes intermedios por separado del final.

Las categorías finales se establecen únicamente con la repetición posterior a estas
correcciones. Los diagnósticos contienen geometría, categoría y ubicación, sin valores
de formulario, enlaces utilizables ni transcripciones.

Reproducción en la imagen API con fuentes/tests/configuraciones actuales montados:
`npm run lint`, `npm run build`, `npm run test:unit`; desde `apps/api`:

```sh
npx vitest run tests/integration/profile.contract.spec.ts tests/integration/login.contract.spec.ts tests/integration/us1-read-logout.contract.spec.ts tests/integration/permission-matrix.spec.ts tests/integration/secret-redaction.spec.ts tests/integration/bootstrap-cli.spec.ts tests/integration/us6-bootstrap-guards.spec.ts --maxWorkers=1
```

En [Compose de pruebas](../../../ops/docker/compose.identity-tests.yml), con runtime Prisma
preparado y la API compilada, desde `apps/web`:

```sh
npx playwright test --config playwright.accessibility.config.ts
```

Las regresiones usan las configuraciones originales `identity`, `registration`,
`first-admin`, `admin-users`, `password-reset` y `security`. Traces, vídeos y capturas
desactivados; reportes temporales privados/ignorados, resúmenes saneados en `.cache/us3/`.

## Límites y siguiente bloque

T089 y T090 quedan completas como escritura y ejecución de pruebas, según las reglas
de [tasks.md](../tasks.md): **90 completas / 18 pendientes**. No se adelantan T091–T094.
Comprobados 310 enlaces locales y 108 IDs únicos, y `git diff --check`, incluidos los
archivos nuevos al preparar el commit. Solo se versionan pruebas y su seguimiento;
los reportes, configuración real, cuentas y credenciales permanecen fuera del commit.

Las pruebas nuevas no aceptan US3, V05 ni SC-005 mientras existan conductas pendientes.
Los controles automatizados de foco, etiquetas y mensajes no sustituyen observación humana,
lector de pantalla ni una auditoría completa de accesibilidad. No se repite el protocolo
temporal de T087: no cambió el código productivo. Retención, restauración, carga de 1000
usuarios y aceptación humana siguen en sus tareas. El siguiente bloque de implementación
es T091–T093, seguido de la aceptación T094.

Seguimiento: [implementación y resultados de T091–T093](us3-implementacion.md).
Este registro conserva la ejecución previa a la implementación; el estado vigente está
en [tasks.md](../tasks.md). T094 mantiene su aceptación independiente.
