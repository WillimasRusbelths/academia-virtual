# US5: capas, navegación y protección de contenido

## Alcance

T085–T086 sobre `feat/001-identidad-acceso-roles`, con T082–T084 escritas y ejecutadas.
El estado inicial estaba limpio, sin fusión/rebase, AGENTS.md aplicable ni hooks de
implementación. Checklist documental: 16/16. No se implementa T087 ni se acepta T088.

## Implementación y revisión VA

| Tarea | Cambio y criterio comprobado |
| --- | --- |
| T085 | [Prueba del código real](../../../apps/api/tests/architecture/layers.spec.ts): ESLint sobre fuentes, cierre transitivo del núcleo, grafo sin ciclos, controladores que consumen aplicación y CLI que reutiliza BootstrapAdmin/IssueActionLink. [Reglas](../../../apps/api/eslint.config.js) y [barreras](../../../ops/lint/import-boundaries.mjs) impiden dependencias externas del núcleo, escapes hacia HTTP/configuración/composición, IO global y acceso directo a persistencia desde entradas. No se encontraron importaciones productivas que requirieran refactorización. |
| T086 | [ProtectedRoute](../../../apps/web/src/app/protected-route.tsx), [router](../../../apps/web/src/app/router.tsx), [sesión](../../../apps/web/src/app/session.tsx) y [composición](../../../apps/web/src/app/App.tsx): hidratación por `/me` también en rutas administrativas; sin montar datos/formularios hasta comprobar sesión/rol. Un 401 reutiliza cancelación/generación del cliente, desmonta datos abiertos y vuelve a login, sin replay. La API conserva toda la autoridad. |

Se revisó la atomicidad por responsabilidad, sin inferirla del árbol de carpetas:

- Registro: `PostgresRegistrationStore` inserta cuenta y programa token/entrega con el mismo
  cliente mediante `actionTransaction`/`persistActionLink`; SMTP queda fuera del commit.
- Reset: `PostgresPasswordResetStore` confirma contraseña/versión, consumo y revocación de
  sesiones/otros enlaces y cancelación de entregas en una transacción del módulo identity.
- Administración: `PostgresAccountCreationStore`/`PostgresAccessChangeStore` revalidan al
  actor y escriben auditoría usando el mismo cliente transaccional; `PostgresNameStore`
  conserva la coordinación de nombre en users. No hay commits repartidos entre módulos.
- Bootstrap: `PostgresBootstrapStore` confirma cuenta, auditoría, marca y, si hay cuota,
  token/entrega juntos. La admisión de cuota es una transacción corta anterior, como define
  el plan. HTTP y CLI consumen aplicación; no se añade un endpoint HTTP de bootstrap.
- Las superficies públicas exponen contratos/reglas puras. El grafo de archivos y las
  raíces de ensamblaje Nest no tienen ciclos; esto no prohíbe consultar reglas públicas
  compartidas ni demuestra atomicidad sin las pruebas de BD citadas abajo.

Se reutiliza además la evidencia de [rollback de reset](us7-implementacion.md) y
[carreras/revocación administrativas](us4.md); sus adaptadores no cambiaron en este bloque.

## Contenido y transporte web

[index.html](../../../apps/web/index.html) incorpora CSP y `no-referrer`.
[Vite](../../../apps/web/vite.config.ts) autoriza mediante hashes solo los scripts inline
que introduce la herramienta, sin `unsafe-inline`/`unsafe-eval` para scripts. En local
permite los WebSocket de HMR de loopback; el build actual deja `script-src 'self'` y
`connect-src 'self'`. Se conservan estilos inline de la UI existente; se bloquean objetos
incrustados, bases y scripts de terceros, y los formularios se limitan al mismo origen. No equivale a
haber desplegado/validado HTTPS o cabeceras del servidor de producción.

Se desactiva CORS de Vite y preview: el proxy conserva Origin y deja llegar el preflight
a la política de la API. Las 16 pruebas originales de T084 pasan, sin cambiar sus
aserciones. Los diez fallos registrados en [la entrega de pruebas](us5-pruebas.md)
corresponden al estado anterior a esta integración.

## Verificación en Docker

Contenedores efímeros con fuentes montadas de solo lectura, imágenes/dependencias
existentes y esquemas nuevos `t_*` en `academia_v00_test`; sin migraciones nuevas.

| Comprobación | Resultado |
| --- | --- |
| `npm run lint`, `npm run build` | Aprobadas para ambos workspaces. ESLint de la configuración Playwright de seguridad también aprobado. |
| `npm run test:unit` | **119/119**: API 74 (incluye cinco pruebas nuevas VA), web 45. Dominio/aplicación se prueban sin HTTP ni BD. |
| BD: auditoría, bootstrap, concurrencia de registro/reset y matriz | **147/147**: 58 + 24 + 13 + 19 + 33. Incluyen rollback, fallos intermedios, repetición, revocación y competencia. |
| Privacidad T083 | Primer lote conjunto: **4/5**, con fallo en bootstrap CLI. Tres repeticiones aisladas posteriores: **5/5 cada una**, sin modificar código, tiempos ni aserciones. El resumen del primer lote no conservó el diagnóstico detallado; su causa no está confirmada. No se presenta ese primer lote (151/152) como aprobado. |
| Seguridad Chromium | **28/28**: 16 originales CSRF/CORS y 12 nuevas de [denegación/contenido](../../../apps/web/tests/e2e/denied-access.spec.ts). Visitante/alumno/docente, ADMIN directo/recarga, 401 con alta/detalle abiertos, cancelación de respuesta tardía, texto escapado y bloqueo CSP. Recorridos de navegación/limpieza en 360 y 1366 px. |
| Regresión Chromium | **105/105**: US1 21, US2 14, US6 14, US4 20 y US7 36. Configuraciones originales `identity`, `registration`, `first-admin`, `admin-users` y `password-reset`, ejecutadas en secuencia, sin omisiones ni aserciones debilitadas. |
| HTML de producción | Build inspeccionado: CSP antes de scripts, sin placeholders, scripts solo de assets locales, conexiones al mismo origen y referrer deshabilitado. No es una prueba de despliegue. |
| Conservación del ensayo manual | Las 12 cuentas y la huella privada de datos/credenciales coinciden antes/después. Los cuatro servicios siguen healthy; API live/ready, web y Mailpit responden 200. No se reconstruyeron sus imágenes ni se tocaron cuentas, volúmenes o puertos. |
| Seguimiento y enlaces | 108 IDs únicos; 86 casillas completas/22 pendientes y 254 enlaces locales comprobados en los documentos revisados y referencias de seguimiento. `git diff --check` aprobado. Cachés, reportes y entornos reales siguen ignorados. |

El ensayo manual conserva su versión e inicio documentados en
[operación de US1](../../../ops/local/manual-us1.md); las fuentes nuevas se verificaron
en contenedores temporales. No se confunde la salud del ensayo con validar allí esta versión.

Reproducción: `npm run lint`, `npm run build` y `npm run test:unit` dentro de la imagen API,
con `apps/api/src`, `apps/api/tests`, `apps/api/eslint.config.js`, `ops/lint` y fuentes/tests,
HTML/configuración Vite de web actuales montados en `/workspace`. Integración:

```sh
cd apps/api
npx vitest run tests/integration/audit.spec.ts tests/integration/bootstrap-store.spec.ts tests/integration/registration-concurrency.spec.ts tests/integration/password-reset-concurrency.spec.ts tests/integration/permission-matrix.spec.ts tests/integration/secret-redaction.spec.ts --maxWorkers=1
```

Para navegador se usa [Compose de pruebas](../../../ops/docker/compose.identity-tests.yml),
el runtime Prisma ya preparado y la API compilada con las fuentes actuales. Dentro del
contenedor `browser-tests`, desde `apps/web`:

```sh
npx playwright test --config playwright.security.config.ts
```

Repetir con `playwright.identity.config.ts`, `playwright.registration.config.ts`,
`playwright.first-admin.config.ts`, `playwright.admin-users.config.ts` y
`playwright.password-reset.config.ts` para las regresiones indicadas.

No exportar reportes con valores privados ni habilitar trazas/capturas de formularios.

## Límites y seguimiento

T087 (protocolo temporal de enumeración), T088 (aceptación transversal US5), US3 y el
cierre final mantienen sus dependencias. Retención/purga, restauración, capacidad de
1000 usuarios y aceptación humana no se dan por demostradas. La incidencia CLI no
reproducida queda registrada para contrastarla al ejecutar la suite transversal T088.
No se modifican diagramas, requisitos, contratos, Docker ni datos manuales.
T085 y T086 quedan completas; seguimiento actualizado: **86 tareas completas y 22 pendientes**.

Seguimiento posterior: [T087–T088](us5.md) registra la comparación temporal y la regresión
transversal. Amplía el diagnóstico saneado de la incidencia CLI, cuya causa sigue sin
confirmarse; conserva los resultados y límites históricos de este bloque.
