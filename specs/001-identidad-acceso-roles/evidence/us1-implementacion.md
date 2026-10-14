# Implementación parcial de acceso y sesiones — T034–T036

Fecha: 2026-10-14. Rama: `feat/001-identidad-acceso-roles`.
Registro del bloque T034–T036. Estado posterior: [checkpoint funcional US1](us1.md).
Prerrequisitos: T031–T033 y T030 completados; [escritura de pruebas](us1-pruebas.md).
No se detectaron decisiones funcionales pendientes que bloqueen estos casos de uso.

| Tarea | Implementación y verificación | Estado | Pendiente posterior |
| --- | --- | --- | --- |
| T034 | Reserva cuotas persistidas; verifica Argon2 fuera del bloqueo; revalida hash, authVersion y elegibilidad bajo bloqueo de User; crea una sesión opaca nueva con digest SHA-256 y caducidad de ocho horas; devuelve éxito después de COMMIT. Dos reintentos máximos por 40001/40P01 confirmados como abortados. | Completa | Controlador, DTO, traducción de errores/cookies y composición T037. |
| T035 | Caso de uso reutiliza SessionRepository.revoke. Controlador de producción exige JSON vacío, usa transporte y cookie configurada; 204 y borrado idempotente, solo la sesión actual. | Completa | Incorporar el controlador al monolito en T037; UI T038. |
| T036 | Consulta propia recibe el actor autorizado; revalida cuenta/sesión en una instantánea de la base primaria; proyecta únicamente UserView. Controlador rechaza filtros/cuerpo ajenos; guard e interceptor existentes autorizan y renuevan solo tras éxito. | Completa | Composición T037 e hidratación/UI T038. |

Código: [login](../../../apps/api/src/modules/identity/application/login.ts),
[persistencia de login](../../../apps/api/src/modules/identity/infrastructure/login-store.ts),
[regla de revalidación](../../../apps/api/src/modules/identity/domain/login.ts),
[logout](../../../apps/api/src/modules/identity/application/logout.ts),
[controlador de logout](../../../apps/api/src/modules/identity/entrypoints/http/logout.controller.ts),
[consulta propia](../../../apps/api/src/modules/users/application/get-me.ts),
[adaptador de consulta](../../../apps/api/src/modules/users/infrastructure/user-queries.ts),
[controlador /me](../../../apps/api/src/modules/users/entrypoints/http/me.controller.ts) y
[proyección pública](../../../apps/api/src/modules/users/public/user-view.ts).

## Resultados en Docker

| Comprobación | Resultado |
| --- | --- |
| Lint API/web y compilación API/web | Aprobados; API reconstruida, servicios saludables y volúmenes conservados |
| Unitarias y arquitectura | 52/52: 29 backend, incluidas siete nuevas de revalidación, y 23 web |
| Integración/compatibilidad, excluidas únicamente las dos suites originales aún pendientes de T037 | 284/284: 240 regresiones, 24 casos de uso nuevos y 20 contratos de controladores nuevos |
| T031/T032 originales, sin cambios en sus casos/aserciones | 8 aprobadas y 26 fallos esperados por rutas ausentes en AppModule; código de salida 1 |
| T033 original, Chromium con API actual y origen localhost | 1 control aprobado y 12 fallos esperados por formulario /login ausente; código de salida 1 |

Pruebas nuevas: [casos de uso](../../../apps/api/tests/integration/us1-use-cases.spec.ts) y
[contratos logout/me](../../../apps/api/tests/integration/us1-read-logout.contract.spec.ts).
Incluyen tres roles, estados inválidos, correo canónico y contraseña sin trim, cinco fallos/
quince minutos, veinte intentos concurrentes, actualización durante hash, seis cambios
concurrentes de elegibilidad/credencial, estados 40001/40P01 inyectados en PostgreSQL, error al COMMIT, reserva
vencida, aislamiento de identidad, cookies locales/HTTPS, expiración exacta, GREATEST,
denegación de filtros/Origin/CSRF y errores de persistencia sin actividad ni secretos.
Las cuatro migraciones existentes se aplican en esquemas aislados; no hubo migraciones nuevas.

Los comportamientos de /me y logout que antes carecían de implementación ahora aprueban en
una [composición de pruebas](../../../apps/api/tests/support/us1-implemented-http.ts) con
sus controladores de producción y autorización reales. No se registran controladores ficticios
de login ni se cambia AppModule. **Las suites originales todavía no pasan de rojo a verde**:
su montaje productivo corresponde a T037. No se omitieron casos ni se debilitaron aserciones.
Solo se ajustó el tipo del argumento del helper de cookies a las dos propiedades que utiliza;
las comprobaciones de atributos permanecen idénticas.

Reproducción, después de `docker compose up -d --build --wait api`:

```powershell
docker compose exec -T -e APP_ENV=test api sh -c 'cd apps/api && npx vitest run tests/integration/us1-use-cases.spec.ts tests/integration/us1-read-logout.contract.spec.ts'
docker compose exec -T -e APP_ENV=test api sh -c 'cd apps/api && npx vitest run tests/integration tests/compatibility/runtime.spec.ts tests/compatibility/postgres.spec.ts --exclude tests/integration/login.contract.spec.ts --exclude tests/integration/session-lifecycle.spec.ts'
```

T031–T033 se reproducen con los comandos de [su evidencia](us1-pruebas.md). No quedan fallos
de entorno sin resolver. No se registraron credenciales, cookies, hashes ni payloads privados.

## Arquitectura y límites

Aplicación coordina contratos sin Nest/HTTP/SQL; dominio conserva las reglas puras.
Persistencia usa el pool compartido, transacciones cortas y base primaria. Los módulos solo
consumen superficies públicas: identidad publica la regla de vigencia; usuarios publica
UserView fuera del dominio. La clave pública de política permite reutilizar el guard sin
importar entradas HTTP internas de otro módulo. Lint y pruebas de arquitectura pasan.

No se agregan AuditEvent de login/logout: el modelo los reserva para cambios de cuenta.
La privacidad y registros de errores HTTP reutilizan el transporte existente; los errores
de login se traducirán en T037. No se añade un proceso productivo ni se redibujan diagramas.
El catálogo/diseño interno que presenta estos casos de uso como previstos requerirá una
actualización documental posterior; la vista C4 de sesiones mantiene sus firmas existentes.

La finalización de cuota tiene su transacción separada. Si una reserva vence después de un
commit confirmado, se devuelve un error seguro sin entregar la credencial; puede permanecer
una sesión no entregada hasta caducar. No se afirma rollback de un commit confirmado ni se
reintenta un commit de resultado incierto. El ensayo HTTPS comprueba atributos, no despliegue TLS.

T037 es el siguiente bloque. T038 y aceptación T039 siguen pendientes; no se cierran US1,
V03/V04/V10 completos, SC-002, comprobación temporal T087 ni 1000 usuarios concurrentes.
