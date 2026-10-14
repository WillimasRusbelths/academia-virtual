# US1 — Acceder, consultar identidad y cerrar sesión

Fecha: 2026-10-14. Rama: `feat/001-identidad-acceso-roles`.
**Checkpoint T039 aprobado:** acceso funcional independiente con cuentas habilitadas de
prueba de alumno, docente y administrador. No acredita registro público ni las demás historias.

| Tarea | Resultado y fuente |
| --- | --- |
| T037 | Rutas POST /auth/login, POST /auth/logout y GET /me montadas en AppModule. Módulos Identity/Users reutilizan casos de uso, pool, cuotas y sesiones; DTO estricto, errores seguros, cookie y autorización comunes. |
| T038 | /login e /inicio operativos. Estado de sesión solo en memoria, /me antes de mostrar identidad y al recargar inicio; logout y 401 limpian datos; 429 muestra espera y 503 exige reintento manual. |
| T039 | Suites originales T031–T033 satisfactorias; verificación funcional V03, V04-A y parte login de V10, con respuestas HTTP, estado persistido y recorridos Chromium reales. |

## Verificaciones y resultados

| Suite/comprobación en Docker Linux | Resultado |
| --- | --- |
| [T031 · contratos](../../../apps/api/tests/integration/login.contract.spec.ts) | 19/19; antes 17 fallos esperados |
| [T032 · ciclo persistido](../../../apps/api/tests/integration/session-lifecycle.spec.ts) | 15/15; antes 9 fallos esperados |
| [T033 · navegador](../../../apps/web/tests/e2e/login.spec.ts) | 13 originales + 8 casos adicionales, 21/21; antes 12 fallos originales |
| Integración/compatibilidad completa, sin exclusiones | 318/318 en 19 archivos: incluye originales y regresiones de fundamentos, auditoría, correo, bootstrap, fixtures y casos de uso |
| Unitarias y arquitectura | 60/60: 29 backend y 31 web, incluidas ocho nuevas del contrato de identidad recibido |
| Regresiones Chromium de transporte, teclado, mensajes y router | 5/5 |
| Lint API/web, compilación API/web | Aprobados; cuatro servicios saludables tras reconstrucción |

No hubo fallos funcionales ni de entorno pendientes al cierre. Las cuatro migraciones
existentes se aplican en esquemas de prueba aislados; no se añadieron migraciones ni se
eliminaron datos/volúmenes existentes. Los secretos de fixtures permanecen privados y no
se registran valores en esta evidencia. No se omiten tests ni se convierten fallos en éxitos.

**V03 funcional:** los tres roles obtienen UserView permitido y cookie opaca nueva; su
digest se confirma en PostgreSQL. Contraseña incorrecta, cuenta inexistente, desactivada,
sin verificar o provisional producen 401 uniforme y ninguna sesión nueva. Ausencia de
cookie, credencial inválida/revocada, versión antigua y Bearer no conceden acceso. Dos
sesiones independientes: logout revoca solo una; tras reiniciar procesos, la otra funciona.

**V04-A:** /me a 29:59 renueva actividad y conserva las ocho horas absolutas; 30 minutos
inactivos u ocho horas exactas producen 401 sin renovar. Salud, errores y solicitudes
rechazadas no renuevan; GREATEST evita retroceso concurrente. En navegador, recargar inicio
con sesión caducada consulta /me una vez, elimina identidad, vuelve a /login y no reenvía
acciones. No queda contraseña en la recarga ni perfil al volver atrás tras logout.

**V10, login:** cinco fallos en quince minutos limitan la pareja correo/origen con 429 y
Retry-After; contador y bloqueo sobreviven reinicios y vencen en la frontera definida.
La UI muestra 900 segundos en el ensayo con reloj fijo y permite acceso manual tras vencer.
Fallos SQL reales en login, logout e hidratación producen 503 genérico: no se muestra éxito
falso, no se repiten solicitudes y la recuperación exige una acción explícita.

Chromium comprobó login → /me → inicio → recarga → logout → /me 401 → atrás para los
tres roles a 360×800 y 1366×768. Ocho casos adicionales cubren estados no habilitados,
inexistencia, cuota, fallo de login, fallo de logout e hidratación fallida. Transporte y
datos son reales, sin interceptar respuestas para acreditar US1. Los ensayos usan el origen
localhost aprobado; el reloj sustituible existe únicamente en su esquema de PostgreSQL.

## Reproducción

```powershell
docker compose up -d --build --wait api web
docker compose exec -T api npm run lint
docker compose exec -T api npm run test:unit
docker compose exec -T -e APP_ENV=test api npm run test:integration
```

Para Chromium usar el overlay de pruebas y la configuración
[Playwright US1](../../../apps/web/playwright.identity.config.ts), siguiendo el comando de
[la evidencia de escritura](us1-pruebas.md). Preparar el volumen de artefactos con la imagen
API vigente; se reutilizan clientes/motor Prisma existentes y no se requieren descargas nuevas.
Las regresiones de esqueleto se ejecutan aparte con `playwright test harness.spec.ts foundations.spec.ts`.

## Arquitectura, correcciones y límites

Controladores adaptan HTTP; aplicación y dominio conservan coordinación y reglas. Nest
ensambla contratos/adaptadores en el mismo monolito. Las features web reciben capacidades
por props, solo importan shared y no dependen del código backend. Lint y pruebas de capas pasan.
El cliente no almacena ni lee el secreto HttpOnly y los permisos siguen bajo autoridad del backend.
UserView y errores mantienen listas permitidas; los registros usan el canal privado existente.

Las pruebas originales US1 conservan todas sus aserciones. Se corrigieron tres supuestos de
regresión obsoletos: DTO vacío de login ahora debe ser 400 VALIDATION_ERROR, no ruta ausente
404; la portada muestra entrada al acceso en lugar de «En preparación»; el ensayo aislado de
campos inicia foco en su contenedor para probar el mismo orden de Tab sin interferencia del
enlace de portada. Se conservaron aserciones de teclado, etiquetas, mensajes y privacidad.

Pendientes fuera del checkpoint: **V04-B** en T061/T071; comparación temporal de V03/V10
en **T087**; resto de V10 sobre correo; SC-002 completo y medición SC-008/T105. No se declara
1000 concurrentes, despliegue público ni disponibilidad productiva. El ensayo de cookie HTTPS
valida configuración/atributos, no despliegue TLS. Las pantallas de registro, verificación,
recuperación, administración y perfil ampliado siguen previstas; sus enlaces no acreditan flujos.

Siguiente bloque recomendado: **T040–T042**, escritura de pruebas US2 antes de implementar registro.
