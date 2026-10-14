# T030 — Transporte y UI comunes

**Fecha:** 2026-10-14. **Dependencia:** [T029](fixtures-seguros.md), commit `4a61b40`.
T029/T030 cierran fundamentos; T031 inicia las pruebas US1 y se reserva con T032/T033.
No tiene dependencias externas bloqueantes después de este checkpoint; no se implementa aquí.

| Criterio | Comportamiento y comprobación |
| --- | --- |
| Cliente relativo | Solo rutas locales bajo /api/v1, JSON y cabecera CSRF fija para mutaciones. Cookie gestionada por navegador, same-origin/no-store y sin Bearer, lectura de HttpOnly ni destinos externos. |
| Errores | 429 utiliza Retry-After válido sin inventar esperas. 503/red/JSON inválido requieren reintento manual; sin replay ni éxito falso. Mensajes locales y nombres de campos permitidos, sin valores/mensajes remotos sensibles. |
| Sesión y cancelación | AUTH_REQUIRED invoca la limpieza registrada, aborta solicitudes pendientes y descarta respuestas tardías. INVALID_CREDENTIALS se distingue y no invalida otra sesión. Cancelar antes de enviar no contacta transporte. |
| Router y UI | Router conectado a la aplicación mínima, historial sin formularios, atrás y reemplazo local. Campos con etiquetas/error asociados; feedback anunciable y reintento solo por acción explícita. No añade pantallas funcionales de login/perfil. |
| Privacidad | Ningún uso de Web Storage para credenciales. Recargar los ensayos elimina el campo de contraseña y no conserva valores; estado HTTP pendiente solo en memoria. |

Código: [cliente y 22 pruebas](../../../apps/web/src/app/http.test.ts),
[implementación HTTP](../../../apps/web/src/app/http.ts),
[router](../../../apps/web/src/app/router.tsx),
[contrato compartido](../../../apps/web/src/shared/api-client.ts),
[campos](../../../apps/web/src/shared/ui/form-field.tsx),
[feedback](../../../apps/web/src/shared/ui/feedback.tsx) y
[ensayos Chromium](../../../apps/web/tests/e2e/foundations.spec.ts).

## Verificaciones compartidas y V00-L

| Verificación en Docker Linux | Resultado final |
| --- | --- |
| `docker compose up -d --build --wait api web` | Compilación API/web, cuatro servicios saludables; volumen existente conservado |
| `docker compose exec -T api npm run lint` | Aprobado; reglas de arquitectura de ambos workspaces |
| `docker compose exec -T api npm run test:unit` | 45/45: 22 backend y 23 web, incluidas las 22 pruebas nuevas del cliente/UI |
| `docker compose exec -T -e APP_ENV=test api npm run test:integration` | 240/240 en 15 archivos; CLI/fixtures, PostgreSQL real, migraciones, SMTP y regresiones |
| `docker compose exec -T api npm run test:crypto-mail` | 2/2: Argon2 y captura local |
| Playwright en browser-tests | 5/5: cuatro nuevas y una regresión; compilación web previa aprobada |

Se reconstruyó browser-tests con el lockfile vigente: la imagen anterior tenía otro hash.
Se reutiliza el Dockerfile/Playwright existente, sin herramientas instaladas en Windows.
Para leer exactamente los últimos fuentes, ensayos y corrección de import type, las
pruebas y lint web finales usaron montajes **solo lectura**, sin copiar reportes al repositorio:

```powershell
docker compose --profile tests run --rm --no-deps --volume "${PWD}/apps/web/src:/workspace/apps/web/src:ro" --volume "${PWD}/apps/web/tests:/workspace/apps/web/tests:ro" browser-tests
docker compose --profile tests run --rm --no-deps --volume "${PWD}/apps/web/src:/workspace/apps/web/src:ro" --volume "${PWD}/apps/web/tests:/workspace/apps/web/tests:ro" --entrypoint npm browser-tests run lint --workspace @academia/web
```

Chromium 153.0.8010.12 comprobó campos a 360×800 y 1366×768: etiquetas, teclado, foco,
mensajes, ausencia de desbordamiento y limpieza al recargar. También comprobó una cookie
HttpOnly sintética y el transporte JSON/CSRF, además del router/atrás. Los dos ensayos de
campos fallaron inicialmente por la transformación JSX de Playwright en Node y después
por interop CommonJS de Vite; se ajustó solo el montaje de pruebas al runtime real del
navegador. Ejecución final: todos aprobados. Lint detectó y se corrigió un import solo de tipo.
Enlaces locales y `git diff --check` aprobados. V00-L se limita a este entorno local, siguiendo
[procedimiento](../../../ops/docker/README.md) y [evidencia previa](../../../ops/docker/verification.md);
no demuestra Actions remotas, disponibilidad pública ni 1000 concurrentes.

## Arquitectura y límites

Las features futuras consumirán ApiClient desde shared, inyectado por app: shared no
importa app/features, y no hay dependencia web → código interno del backend. No se
detectaron nuevas infracciones de dependencias; pruebas de arquitectura y lint pasan.
Se conserva el monolito por capas y el núcleo backend independiente. Sin diagramas nuevos.

La limpieza de perfil/datos se prueba mediante el callback obligatorio del cliente;
el proveedor y las pantallas reales se conectan en T038. Cancelar una solicitud no revierte
una operación ya confirmada por el servidor. En Chromium el ensayo HTTP intercepta
respuestas: no demuestra login/logout real ni autorización. Usa web:5173 internamente;
los E2E funcionales US1 deben respetar el origen localhost aprobado sin debilitar el backend.
Los componentes comunes no cierran FR-021/SC-005 ni V01–V16 completos. T030 [x]; próximo
bloque recomendado: **T031–T033**, escritura de pruebas US1 antes de T034.
