# T106 · Reproducción y regresión final

2026-10-18. Base `6408a1f`, árbol inicial limpio. Dependencias T098/T103/T105 completas;
T103 solo acredita ejecución/informe. **T106 completa como reproducción/regresión local**,
con hallazgo histórico de bootstrap aún abierto; no es aceptación integral ni capacidad.
Se aplica la constitución 1.1.0 y el checklist documental 16/16, sin AGENTS.md ni hooks.

## Aislamiento y reproducción

Snapshot `git archive` de HEAD en `.cache/t106-20261018/source`, sin dependencias,
compilaciones ni secretos heredados. `node ops/docker/configure.mjs` generó allí `.env`
nuevo con claves independientes. Proyecto `identity-regression-5331a74fc144`, volumen
nuevo y puertos publicados eliminados solo en su override privado; API en `APP_ENV=test`.
No se modifica el Compose general, el lockfile ni la configuración de Windows.
Docker estaba detenido; se inició la instalación existente y se reanudaron los cuatro
contenedores manuales sin recrearlos. La huella inicial coincide con T105: 12 originales,
15 cuentas totales, SystemState y archivo privado de credenciales conservados.

Docker 29.8.1 Linux, Compose 5.5.1; VM 8 CPU/6,74 GiB. Host Ryzen 7 3750H,
4 núcleos/8 hilos, 13,94 GiB, plan Equilibrado observado. Memoria libre baja durante
construcción (~333 MiB): no es un entorno de capacidad ni una medición de producción.
Imágenes separadas por proyecto; PostgreSQL 16.14 y Mailpit 1.31.3. Los logs/resultados
crudos permanecen privados bajo `.cache/t106-20261018/`, sin secretos en esta evidencia.

Comandos dentro de una copia nueva, con `docker compose --project-name <proyecto-nuevo>`,
`-f compose.yml -f ops/docker/compose.regression.yml` y, si hace falta CA local, el override
de certificados. [Override reproducible](../../../ops/docker/compose.regression.yml): mismo
aislamiento utilizado en el ensayo privado. Nunca reutilizar `.env`/proyecto/volumen manuales.
Los comandos npm se ejecutan con `docker compose exec -T -e APP_ENV=test api ...`;
`--no-deps` queda para runners que no requieren el servidor HTTP local.

```sh
docker compose --profile tests build --no-cache api web browser-tests
docker compose up -d --no-build --wait db mailpit api web
npm run lint
npm run build
npm run verify:v00
npm run db:generate
APP_ENV=test npm run db:migrate:deploy
npm run test:unit --workspace apps/api -- --maxWorkers=1
npm run test:unit --workspace apps/web -- --maxWorkers=1
npm run test:integration --workspace apps/api -- --maxWorkers=1
```

`npm ci --no-audit --no-fund` se ejecuta realmente en la construcción sin caché;
sin `--force` ni `--legacy-peer-deps`. V00 incluye build de ambos workspaces, smokes,
cliente/migración/privilegios de compatibilidad, rollback PostgreSQL, Argon2 y SMTP.
Unitarios e integración añaden reporter JSON privado; no se atribuyen suites ausentes
a un workspace (integración API, navegador web; unitarios/lint/build en ambos).

## Resultados y seguimiento

| Comprobación | Resultado real |
| --- | --- |
| Configuración / instalación | `.env` nuevo y volumen vacío; `npm ci` real sin caché en las bases API y web/navegador, con el lockfile existente. |
| Lint / build | Ambos workspaces aprobados; API antes de consumir su `dist`. |
| V00 | Aprobado: dos smokes, cliente/migración/permisos, rollback PostgreSQL y dos casos Argon2/SMTP; combinación repetida en Linux nuevo. |
| Generación / migración identidad | `db:generate` y `APP_ENV=test db:migrate:deploy` aprobados sobre la BD nueva. |
| Unidad / arquitectura | **120/120**, cero fallos/omisiones: API 75, web 45. Incluye capas, límites de imports y política explícita de 17 endpoints. |
| Integración API | **744/744**, 41 archivos, cero fallos/omisiones en la ejecución completa correcta. |
| Bootstrap dirigido / privacidad | **23/23**, cero fallos/omisiones; ocho pares de inicialización/repetición, CLI original, guardas y privacidad. Causa histórica no confirmada. |
| V16 nuevo | Tres fases **1/1** cada una: preparar, cambio posterior y restaurar. Migración fallida real, corrección hacia adelante, constraints/permisos, invalidación global y proceso nuevo. |
| Cifrado / guardas / tiempos | Script de ensayo ejecuta 7 pruebas de archivo; guardas **5/5**, tiempos UTC/Lima **2/2**. Sin intervención humana atribuida. |
| Caída SMTP real | **1/1** dirigido con Mailpit pausado; timeout deja intento recuperable y `/health/ready` devuelve 200. Los otros 24 casos no seleccionados ya pasan en la integración completa. Mailpit reanudado/healthy. |
| Cálculos U2 | **5/5**; protocolo completo T087 reutilizado como evidencia histórica, no reejecutado ni sumado como muestras nuevas. |
| E2E | **203/203**, diez configuraciones y **17/17 archivos**; cero omitidos, fallos esperados, reintentos o casos flaky. |

E2E por configuración: infraestructura 5, acceso 21, registro 14, primer ADMIN 14,
administración 20, recuperación 36, seguridad 28, perfil 8, accesibilidad 56 y tiempos 1
(este último contiene **20 accesos**). Chromium 153.0.8010.12, móvil/escritorio según
las configuraciones originales. Repetición SC-008: **20/20**, 121,2–178,6 ms;
no reemplaza [T105](login-timing.md) ni demuestra concurrencia. Reportes privados
`e2e-*-01.json` y `pw/`; inventario contrastado en `audit-summary.json`.

En el runner `browser-tests`, añadiendo `ops/docker/compose.identity-tests.yml` a Compose:

```sh
npm run test:e2e --workspace apps/web -- --config playwright.config.ts harness.spec.ts foundations.spec.ts
for suite in identity registration first-admin admin-users password-reset security profile accessibility login-timing; do
  npm run test:e2e --workspace apps/web -- --config playwright.$suite.config.ts || exit 1
done
```

Selección explícita de configuraciones para conservar sus fixtures, origen y tamaños;
ningún archivo se omite ni se aprueba por no seleccionarlo en el grupo de infraestructura.
El HTML compilado pasa el verificador por directivas de T085, sin placeholders,
scripts externos ni relajación de `script-src`. El inspector inicial, demasiado amplio
para `style-src`, se descarta como comprobación inválida; no se cambió la CSP de producto.

Se conserva `integration.json`: **743/744**, con fallo de `mail-delivery.spec.ts:110`
por `fetch failed`. Ese caso exige `/health/ready` en `127.0.0.1:3000`, ausente en el
runner efímero de la primera invocación. Comprobación directa en API: 200. Se corrigió
solo la invocación a `exec` dentro de la API saludable, como indica quickstart; la
repetición **completa** `integration-final.json` aprobó 744/744. Sin cambiar aserciones,
timeouts, seguridad ni código de producto para acomodar el resultado.

La imagen de navegador recién construida falló en `db:generate`: motor
`debian-openssl-1.1.x` previo y descarga/generación posterior intentada en
`node_modules/@prisma/engines` sin permiso. Diagnóstico offline preservado. Se corrige
[Dockerfile web](../../../apps/web/Dockerfile) generando ambos clientes Prisma y compilando
API durante construcción, después de instalar dependencias de Chromium y antes de
volver al usuario `node`; solo los artefactos de aplicaciones quedan con su propietario.
No se prestan artefactos del volumen manual ni se editan generados a mano.
La imagen corregida se validó como **UID 1000 (`node`)**: clientes probe/identidad generados
sin volumen prestado, con motor OpenSSL 3.0 disponible. Node 22.23.1 y npm 10.9.8.
No es una corrección del bootstrap.

V16 se repitió con `ops/recovery/rehearse.ps1 -ApiImage identity-regression-5331a74fc144-api:latest`:
proyecto nuevo `identity-recovery-0ddd57c311ba`, resumen privado en su directorio `.cache`.
RPO máximo **30,383 s**, RTO **32,280 s**; un cambio posterior al backup perdido según
lo esperado. No se reemplazan las medidas originales de T098 ni se aprueba un SLA.
Recursos del ensayo detenidos, volumen y copia cifrada conservados. La primera guarda
de caída SMTP abortó por quoting de etiquetas en PS5.1 antes de pausar contenedores;
se corrigió la lectura de metadatos y se conserva ese log, sin contarlo como ensayo aprobado.

El [hallazgo CLI original](us5.md#hallazgo-intermitente-de-bootstrap-cli) está abierto:
su lote T085–T086 dio 151 aprobadas/1 fallo, sin diagnóstico de la causa; tres repeticiones
y el diagnóstico T088 de 23/23 no lo resolvieron. T106 repitió la prueba original de
privacidad y las ocho inicializaciones/repeticiones del harness PTY: 23/23, con los mismos
timeouts, assertions, entradas ocultas, unicidad, atribución y no sobrescritura.
**No se reprodujo ni se confirmó la causa original; el hallazgo sigue abierto.**
No se modificó el parser PTY ni la CLI por hipótesis sin evidencia. La ausencia de
reproducción no acredita una solución; no se confunde con el fallo SMTP de invocación.

## Cobertura, conservación y límites

| Criterios | Contraste de esta regresión |
| --- | --- |
| V00 / VA | Instalación, compilación, smokes, arquitectura/imports/políticas y revisión de adaptadores de retención/invalidez. HTTP/CLI llaman casos de uso; SQL/locks en infraestructura. |
| V01–V04 | Registro concurrente, verificación, acceso/cierre, expiraciones y formulario sin replay: integración y suites US1/US2/administración. |
| V05 | Perfil 8 y accesibilidad 56, ambos tamaños y teclado; se conserva la revisión visual/humana identificada de T094, sin atribuir una nueva. |
| V06–V09 / V14–V15 | Alta/cambios administrativos, bootstrap/último ADMIN, permisos directos, CSRF/CORS y carreras: integración y E2E originales completas. |
| V10–V11 | Cuotas/fronteras, recuperación/uso único, dos sesiones/provisional revocadas. U2 completo se reutiliza con los límites de su evidencia original; no hay medición temporal nueva. |
| V12–V13 | Auditoría/privacidad, 29 casos de retención y 17 de estado restaurado incluidos en integración, correo real y caída dirigida. Payload terminal limpio/FK nullable; sesiones/tokens 24 h, correo 7 días y registros/auditoría 30 días por sus eventos. |
| V16 | Nuevo ensayo completo descrito arriba; no restaura ni borra desarrollo o el ensayo manual. D13 sigue sin SLA aprobado. |

La revisión de atomicidad confirma cancelación de correo antes de purgar tokens, límites
y `SKIP LOCKED` por lote, conservación de User/SystemState y transacción de invalidación
global antes de reabrir. El mantenimiento sigue explícito, sin programación activada.
No se modifica código productivo de dominio, aplicación o adaptadores.

Huellas finales idénticas: **12 cuentas originales, 15 totales, SystemState y archivo de
credenciales**. SQL de solo lectura confirmó **cero esquemas `t_*` restantes y cero usuarios
en public** del proyecto nuevo; sus servicios se detuvieron conservando el volumen. Los
cuatro servicios manuales siguen healthy. La comprobación SQL inicial perdió comillas en
PS5.1 y abortó sin escribir; por stdin se confirmó limpieza. Se conservan los logs de
intentos fallidos; no se restauró ningún dato para obtener igualdad.

Lockfile sin cambios, SHA-256
`6f2c05e1f0f7fa2e0f084ac7977f4360e9260814728e0590db82bced925a6292`.
Cambios de ejecución acotados: Dockerfile de pruebas y override de aislamiento;
fuentes funcionales de identidad iguales a la base. No se cambian requisitos ni umbrales.

**No reejecutado / no acreditado como nuevo:** U2 completo T087 se conserva como evidencia
histórica limitada a su versión/topología, sin sumar sus muestras a esta regresión;
ID-LOAD-01/02 y VPS aplazados por acuerdo; participantes T104 aplazados hasta versión
integrada estable; SMTP/DNS/proveedor externos sin activar ni verificar. La regresión
no acredita ausencia universal de canales laterales, capacidad de producción ni aceptación humana.

La purga T095 sigue siendo CLI explícita; D13 no tiene SLA aprobado. No se ejecutan
nuevas cargas completas ni se usan participantes: T104, capacidad y D10 permanecen
pendientes; T108 tendrá su revisión preliminar separada y mantendrá su casilla pendiente.
