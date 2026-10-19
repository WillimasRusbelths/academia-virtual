# T105 · Veinte accesos secuenciales

Preparado el 2026-10-18; base funcional `7dbf3a6`. Dependencia T094 cumplida; T104
no bloquea esta comprobación automatizada. Criterio aprobado
[SC-008](../spec.md): **al menos 19/20 accesos válidos con inicio autorizado visible
en <3000 ms**, según [T105](../tasks.md). No son percentiles HTTP ni carga concurrente.

## Procedimiento reproducible

[measure-login.ps1](../../../ops/local/measure-login.ps1) usa la imagen de navegador
existente y la configuración [identity-tests](../../../ops/docker/compose.identity-tests.yml).
Requiere Docker Linux, `.env` privado existente, motor Prisma compatible en el volumen
de artefactos existente `academia_us1_test_runtime` (solo lectura), DB de pruebas accesible y servicios
db/mailpit ya saludables; `--no-deps` evita recrear el ensayo manual. Monta las fuentes
actuales de solo lectura, genera Prisma y compila API/web dentro del runner efímero.
No ejecutar mientras haya carga, participantes u otras suites sobre el host/BD.

```powershell
$lote = Get-Date -Format yyyyMMdd-HHmmss
powershell -NoProfile -ExecutionPolicy Bypass -File ops/local/measure-login.ps1 -Results "test-results/login-timing-$lote"
```

La [fixture](../../../apps/web/tests/support/login-timing-fixture.ts) crea un esquema
aleatorio `t_login_timing_*` en `academia_v00_test`, con cuentas ficticias habilitadas y
verificadas. Usa reloj real, API real, PostgreSQL real y build web servido por Vite preview
con proxy del mismo origen, sin mocks. No modifica cuotas, pool, Argon2 ni seguridad.
Al terminar cierra API/preview/pools y elimina solo el esquema generado y sus credenciales
temporales; conserva desarrollo, las 15 cuentas manuales, credenciales y volúmenes.

El [test](../../../apps/web/tests/e2e/login-timing.spec.ts), con
[configuración propia](../../../apps/web/playwright.login-timing.config.ts), ejecuta un worker,
sin reintentos: 20 accesos uno después de otro (Alumno/Docente/ADMIN, ciclo prefijado:
7/7/6). Cada acceso usa contexto nuevo, 1366×768, zoom 100 %, sin sesión ni almacenamiento
previos. Se prepara `/login` y se rellenan credenciales fuera del tiempo; el primer login
se incluye, sin descartar calentamientos ni muestras desfavorables. No se borra historial
de cuotas entre accesos. Sin throttling artificial; sin trazas, vídeos ni capturas privadas.

- **Inicio:** evento real `submit`, fase capture anterior al manejador React, con
  `performance.now()` del navegador; incluye toda la ejecución posterior de login y `/me`.
- **Fin:** `/inicio`, título «Inicio», nombre y rol esperados visibles con dimensiones;
  siguiente frame de renderizado, usando el mismo reloj. Es una estimación automatizada
  conservadora del pintado; no observación humana ni medición física de la pantalla.
- Fuera del intervalo: comprobación `/me` autorizado, logout y rechazo posterior 401.
  No empezar el siguiente acceso hasta cerrar el contexto anterior. Timeout/fallo se
  conserva y no se reemplaza. El reporte exige 20 válidos además de 19 bajo el umbral.
- Guardar `login-timing.json` adjunto bajo la carpeta de resultados nueva, sin secretos;
  registrar versión, navegador, recursos, condiciones y las veinte duraciones aquí.

## Resultado

**2026-10-18, 10:54:37 America/Lima (15:54:37 UTC): 20/20 válidos y <3000 ms; SC-008
cumplido en este entorno, T105 completa.** Cero accesos fallidos; los veinte controles de
identidad/rol, logout y rechazo posterior pasaron. Un test, un worker: 14,6 s de test,
23,9 s con preparación Playwright. Base funcional `7dbf3a6` más los archivos de ensayo
de este bloque; sin cambios de producto.

| Acceso | Tiempo (ms) | Acceso | Tiempo (ms) |
| --- | --- | --- | --- |
| 01 | 199,5 | 11 | 164,6 |
| 02 | 167,9 | 12 | 118,2 |
| 03 | 154,2 | 13 | 180,7 |
| 04 | 170,6 | 14 | 155,2 |
| 05 | 138,2 | 15 | 122,4 |
| 06 | 136,7 | 16 | 124,0 |
| 07 | 305,1 | 17 | 121,6 |
| 08 | 396,1 | 18 | 121,0 |
| 09 | 300,3 | 19 | 121,8 |
| 10 | 185,7 | 20 | 121,3 |

Chromium headless **153.0.8010.12**, Playwright 1.63.0, Node 22.23.1, PostgreSQL
16.14-bookworm. Host Windows, Ryzen 7 3750H (4 núcleos/8 hilos), 13,94 GiB RAM
(2,97 GiB libres al comprobar preparación), corriente conectada/100 %, plan Alto
rendimiento observado, sin cambiar Windows. Docker 29.8.1: 8 CPU y 6,74 GiB. Runner
(API + preview + navegador) y PostgreSQL sin cuota propia de CPU/memoria; comparten esa
VM. SHM del runner 1 GiB; pool 10. Servicios manuales encendidos, sin otras suites de
este agente. No representa latencia de red externa ni recursos dedicados de producción.

Crudo local ignorado: `test-results/login-timing-20261018-run6/artifacts/login-timing-SC-008-veinte-1ae67-submit-hasta-inicio-visible/login-timing.json`.
SHA-256: `e8bea830b342934562e9675a481dbc9b51a3a66126913b1ff15d6a5f66f46952`.
Las duraciones anteriores están redondeadas a una décima; decisión con valores sin redondear.

Se conservan los logs en `.cache/t104-t105-20261018/`: tres preparaciones sin muestras
(motor Prisma no escribible, asignación redundante de lint y raíz de bind mount no
eliminable por Playwright). Se reutilizó el motor offline existente, se corrigió lint y
se usó un subdirectorio. La primera medición pasó las aserciones, pero el reporter `list`
no persistió las muestras del adjunto en memoria; se añadió escritura explícita y se
repitió el mismo protocolo (run5: 20/20, 120,7–194,1 ms; JSON y logs conservados).
El control estricto adicional detectó que el harness mezclaba `AppModule` compilado y
`createDatabase` fuente, con tipos Prisma de dos árboles. Se alineó ese único import en
[us1-http.ts](../../../apps/api/tests/support/us1-http.ts) con la composición compilada;
`allowJs` sigue la convención existente para importar `env.mjs`. Run6 repite tras esa
corrección y pasa tipos estrictos y SC-008; no se descartó una medición desfavorable ni
se tocaron umbrales para aprobar.

Limpieza comprobada por lectura: **ningún esquema `t_login_timing_*` restante**; huellas
de las 12 cuentas originales, 15 totales, singleton y archivo de credenciales idénticas
antes/después; cuatro servicios manuales healthy, sin restaurar ni borrar volúmenes.
Lint y build de ambos workspaces aprobados, además de lint de la configuración propia
y tipos estrictos del test, fixture y configuración después de compilar API en el mismo runner.
Regresión del harness: **21/21** casos originales de `playwright.identity.config.ts`
aprobados en otro esquema aislado (34,1 s), incluidos los tres roles, 429/503, expiración,
recarga y logout en ambos tamaños. No es la regresión integral de T106. Enlaces locales
840/840, incluidas 44 anclas; `git diff --check` sin errores.

No requiere diez participantes; su resultado no sustituye SC-001/010 ni demuestra 1000
usuarios. D10, los incumplimientos de carga y el cierre integral conservan su estado.
El [bootstrap intermitente](us5.md#hallazgo-intermitente-de-bootstrap-cli) sigue abierto
para T106; este ensayo no ejecutó bootstrap ni permite declararlo resuelto.
