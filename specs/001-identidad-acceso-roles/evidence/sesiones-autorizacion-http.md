# Sesiones, autorización y transporte HTTP — T021–T023

Fecha local: 2026-10-07. Rama: `feat/001-identidad-acceso-roles`.
Base del bloque: `597e530`, T011–T020 verificadas. Se conservan las cuatro migraciones,
el pool compartido, la configuración y las reglas puras de elegibilidad y credenciales.
No se encontraron AGENTS.md aplicables, fusión pendiente ni hooks de extensiones.
El checklist documental mantiene 16/16 criterios completos; no acredita funcionalidad.
La revisión de spec/plan/tasks y contrato no identificó decisiones que bloqueen este bloque.

## Comportamiento comprobado

| Tarea | Resultado | Requisitos que fundamenta |
| --- | --- | --- |
| T021 | Consulta primaria por huella SHA-256 del secreto opaco; cuenta y versión actuales, elegibilidad, 30 minutos de inactividad y 8 horas absolutas. Revocación idempotente y persistida. Actividad con GREATEST solo al resultado protegido satisfactorio, sin ampliar expiración ni reactivar sesiones vencidas/revocadas. | FR-004, FR-007–FR-009, FR-018 |
| T022 | Matriz cerrada: perfil propio para STUDENT/TEACHER/ADMIN y gestión de usuarios para ADMIN. Guard global con denegación por defecto y SessionLookup inyectado sin IdentityModule circular. Revalidación del actor bajo bloqueo dentro de la transacción antes de escribir. | FR-018–FR-020 |
| T023 | JSON de hasta 16 KiB, DTO sin claves adicionales ni coerción, Origin exacto, cabecera CSRF y rechazo cross-site, CORS cerrado, cookies por entorno y errores públicos seguros. Salud sin actividad de sesión, ready independiente de SMTP. | FR-018, FR-023, FR-026; contrato HTTP/R03 |

El núcleo no importa NestJS, HTTP ni PostgreSQL. La superficie pública de autorización
expone tipos/contratos y errores tipados; infraestructura implementa persistencia y entrada
HTTP adapta cookies/respuestas. Nest ensambla el pool y los adaptadores y cierra el pool al
terminar. Se añadió únicamente `@types/express` 5.0.6 como dependencia de desarrollo,
necesaria para tipar el parser de Nest, con lockfile y `npm ci` comprobados en la imagen.

Las mutaciones de las historias deberán invocar `revalidateInTransaction` en su propia
transacción, después de bloquear gobierno y usuarios por UUID cuando corresponda. Un
savepoint impide usarla fuera de BEGIN; actor y sesión permanecen bloqueados hasta commit.
Las operaciones internas de aceptación/revocación permiten como máximo dos reintentos por
conflicto transitorio, con rollback. No sostienen locks durante hashing ni SMTP.

## Pruebas y resultados

Ejecutados desde la raíz, dentro de Docker Compose:

| Comando | Resultado |
| --- | --- |
| `docker compose up -d --build api` | Imagen reproducible con npm ci, clientes generados y API compilada; inicio satisfactorio |
| `docker compose exec -T api npm run build` | API TypeScript y web TypeScript/Vite: exit 0 |
| `docker compose exec -T api npm run lint` | Ambos workspaces y límites de capas: exit 0 |
| `docker compose exec -T api npm run test:unit` | 23 casos: 22 backend y 1 web |
| `docker compose exec -T api npm run test:integration` | 107 casos aprobados: 50 nuevos y 57 regresiones |
| `docker compose exec -T api npm run test:crypto-mail` | 2 casos aprobados: Argon2 real y captura SMTP local |

Los 50 nuevos casos se distribuyen en `session-store.spec.ts` (15), `access-guard.spec.ts`
(18) y `http-security.spec.ts` (17). Consultan PostgreSQL real en esquemas aislados de la
base de pruebas, migrados mediante deploy. Verifican expiración/revocación/versión/estado,
credenciales inválidas y ausencia de cookie, permisos antes de consultar destinos, cambios
entre guard y transacción, rollback y máximo de reintentos. Un adaptador nuevo conserva la
sesión persistida; no se simula PostgreSQL para demostrar estos comportamientos.

También verifican cookies local/HTTPS y eliminación con los mismos atributos, ausencia de
Bearer alternativo, origen/CSRF/CORS, fronteras exactas de 16 KiB, arrays/campos desconocidos,
errores sin valores ni detalles internos, correlación propia y ausencia de secretos en
logs incluso al solicitar debug. Respuestas fallidas o no serializables no renuevan actividad.
La composición real de AppModule responde ready 503 si se cierra su pool y conserva live 200.

Ensayo adicional sobre la aplicación de Compose: `docker compose pause mailpit`, comprobar
que `http://mailpit:8025/readyz` no responde dentro de 1 segundo desde API y consultar
`/health/live` y `/health/ready`, ambos 200; `docker compose unpause mailpit` en finally.
Se pausó el proceso para conservar mensajes, sin recrear Mailpit. Al terminar,
`docker compose ps` mostró los cuatro servicios saludables. Este ensayo no verifica todavía worker
ni entrega diferida durante una caída.

Se revisaron 53 enlaces locales sin roturas, trazabilidad y `git diff --check`. No se crearon migraciones
ni se ejecutó migrate:dev: no existe una base sombra validada para ese procedimiento.
Los volúmenes, datos y configuración privada permanecen conservados.

## Límites y siguiente bloque

Las rutas protegidas de prueba existen exclusivamente en `tests/support/session-http.ts`;
AppModule no las importa. La API de producto expone solo salud. Registro/login/logout,
perfil y administración completos, correo y UI siguen pendientes. La integración de los
controles con esas rutas se verificará en sus tareas; este bloque no cierra V01–V16 ni T087.
No hay mecanismos productivos para crear sesiones de ensayo o eludir autorización.

Siguiente bloque recomendado: T024–T026, adaptadores de correo/cifrado, ejecutor persistido
y pruebas de entrega. No se implementó ninguna tarea posterior a T023. El objetivo de
1000 usuarios concurrentes continúa pendiente de pruebas de carga.
