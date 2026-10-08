# Reglas de dominio, credenciales y límites persistidos

Fecha: 2026-10-07. Rama: `feat/001-identidad-acceso-roles`. Base: commit `696b488` y
[T011–T016](fundamentos-datos.md). Incremento verificado: T017–T020 de [tasks.md](../tasks.md).
La rama estaba limpia, sin fusión ni conflictos; no existen AGENTS.md aplicables ni hooks
en `.specify/extensions.yml`. Checklist: 16/16. Se contrastaron constitución, especificación,
plan, contratos, modelo de datos y verificación; no se necesitaron aclaraciones funcionales.

| Tarea | Resultado comprobado | Trazabilidad |
| --- | --- | --- |
| T017 | Validación Unicode de nombre/correo/contraseña, rol único y estado; elegibilidad y fronteras exactas de sesiones, acciones y provisional | FR-001/002/004/005/008/012/014/029/030; API, modelo de datos |
| T018 | Argon2id real con salt, trabajo ficticio para condiciones no elegibles, dos operaciones máximas por proceso, cola FIFO de 50 y espera de 5 s; secretos de 32 bytes/base64url y huellas SHA-256 | FR-006/026/033; R04, API |
| T019 | Ventanas móviles: cinco fallos/15 min, bloqueo de 15 min, éxito limpia fallos, reserva de 30 s; correo 1/min, 5/h destinatario/propósito y 20/h origen | FR-022/031; R09, modelo de datos |
| T020 | Upsert y locks lexicográficos en PostgreSQL; reservas vencidas como fallos, éxito tardío rechazado, persistencia con conexiones nuevas y cuotas equivalentes para conocidos/desconocidos | FR-022/026/031/033; R09, V10 parcial |

El dominio no importa NestJS, HTTP, PostgreSQL ni criptografía. Los helpers de aplicación
reutilizan validación y elegibilidad sin crear cuentas ni sesiones. El adaptador de cuotas
reutiliza las políticas puras y el pool existente; no consulta cuentas. Las claves HMAC
incluyen ámbito/fase, correo canónico y origen normalizado; no guardan correo/IP en buckets.
Los métodos de cuotas terminan su transacción antes de devolver el resultado. No reciben
callbacks de hash/SMTP ni una transacción de cuentas. El reloj de BD se toma después del lock.

## Migración y conservación de datos

La comprobación real detectó que Argon2 serializa parámetros PHC como `m,p,t`, mientras el
CHECK anterior admitía solo `m,t,p`. `0004_identity_argon2_format` permite el orden de los
tres parámetros sin duplicarlos ni cambiar hashes. Se revisó el SQL y se aplicó con
`db:migrate:deploy` a esquemas de prueba aislados; no se ejecutó `db:migrate:dev`, `db push`
ni reset. Las migraciones 0001–0003 permanecen intactas. Se conservó un hash ficticio anterior
al aplicar la migración incremental y se verificó la persistencia de un hash nativo real.
Las ocho tablas y el volumen existente se conservan; no se migraron datos de desarrollo.

## Comprobaciones en Docker Compose

Se conservan Node 22.23.1, npm 10.9.8, Prisma 7.10.0, PostgreSQL 16.14 y el lockfile.
La construcción genera los clientes y compila API. Comandos desde la raíz:

| Comando | Resultado |
| --- | --- |
| `docker compose up -d --build api` | Satisfactorio |
| `docker compose exec -T api npm run lint` | API/web satisfactorios; restricciones de capas vigentes |
| `docker compose exec -T api npm run build` | API/web satisfactorios |
| `docker compose exec -T api npm run test:unit` | 21 pruebas: 17 de dominio, 3 de arquitectura y 1 React |
| `docker compose exec -T api npm run test:integration` | 57 pruebas: 7 credenciales, 12 cuotas y 38 regresiones |
| `docker compose exec -T api npm run test:crypto-mail` | 2 pruebas de compatibilidad: Argon2 y Mailpit |
| `docker compose config --quiet` / `docker compose ps` | Configuración válida; cuatro servicios saludables |
| Enlaces Markdown / `git diff --check` | 57 enlaces locales válidos; sin errores de whitespace |

Las cuotas se probaron con PostgreSQL real: máximo cinco reservas entre 12 llamadas por
pareja, un envío entre ocho llamadas al mismo destinatario y 20 admisiones entre 25 por
origen. Se probaron fases ADMISSION/SMTP separadas, suma de propósitos, persistencia al
crear otro pool/store, liberación de locks y rollback tras fallo en la segunda cuota.
Las fronteras exactas se verifican en dominio; las pruebas SQL adelantan únicamente fechas
de fixtures aislados. El reloj simulado de cola permite probar 5 s sin modificar límites
productivos. Dos hashes/verificaciones nativos comparten el tope; la saturación/FIFO se
comprueba además con un backend controlado, sin reducir los parámetros de Argon2.

La primera suite de credenciales falló al validar el orden PHC, antes de sus aserciones;
se corrigió el adaptador y el CHECK, y la repetición completa pasó sin omisiones.
No se guardaron contraseñas, tokens, salts ni hashes en logs o este informe. Solo se limpian
los esquemas creados por las suites; no se borraron cachés, mensajes ni volúmenes existentes.

## Pendientes

No se implementaron registro/login, lookup de sesiones, guards, HTTP de identidad ni worker.
V01–V16 y el protocolo temporal de enumeración T087 siguen pendientes: verificar trabajo
criptográfico equivalente no demuestra ausencia de canales temporales HTTP. La retención
de eventos sigue en sus tareas posteriores; este bloque no añade un proceso de limpieza.
Los 1000 concurrentes continúan pendientes de carga. Siguiente bloque: T021–T023,
persistencia/consulta de sesiones, autorización y transporte HTTP.
