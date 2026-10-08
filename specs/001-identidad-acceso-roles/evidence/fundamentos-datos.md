# Fundamentos de configuración y persistencia

Fecha: 2026-10-07. Rama: `feat/001-identidad-acceso-roles`.
Alcance: T011–T016 de [tasks.md](../tasks.md). Estado: incremento verificado.

## Punto de partida

La rama comenzó limpia, sin fusión pendiente ni marcadores de conflicto. No se encontraron
archivos AGENTS.md aplicables. Se consultaron la constitución, especificación, plan, tareas,
modelo de datos, contratos HTTP/UI, estrategia de verificación y procedimiento Docker.
El checklist de requisitos tenía sus 16 entradas completas. No existen hooks en
`.specify/extensions.yml`.

T001–T010 corresponden al entorno, esqueleto y harness. Se contrastaron con archivos y
pruebas existentes y se repitió `verify:v00`: builds, smoke Nest/React, PostgreSQL real,
Argon2 y captura SMTP satisfactorios. Estos resultados no implementan las historias.
El análisis documental identificó 33 FR, 10 SC y 108 tareas; los siete grupos de historias
cubren los 33 FR. No se encontraron contradicciones funcionales que bloqueen este bloque.

## Implementación y trazabilidad

| Tarea | Comportamiento comprobado | Requisitos que fundamenta, sin completar sus flujos |
| --- | --- | --- |
| T011 | Entorno explícito, carga desde raíz, credenciales/claves independientes, SMTP local cerrado y rechazo de configuración insegura | FR-026, FR-033; restricciones de entornos de plan/quickstart |
| T012 | Cuenta con rol único, correo canónico único, CHECKs de Unicode/estado/credenciales y reloj de BD | FR-001, FR-002, FR-012, FR-014, FR-015 |
| T013 | Sesiones y tokens con FKs, huellas de 32 bytes, vencimientos e índice parcial de token abierto | FR-008, FR-024, FR-029, FR-030 |
| T014 | Auditoría con actor/destino coherentes y singleton con marca irreversible | FR-025, FR-027, FR-028 |
| T015 | Estructuras de correo y cuotas, payload activo obligatorio, metadatos terminales e índices | FR-022, FR-031, FR-033 |
| T016 | Pool compartido, cliente generado, despliegue versionado, restricciones y rollback real | Transacciones y persistencia de las tareas anteriores |

Ocho modelos en `apps/api/prisma/schema.prisma`: User, Session, ActionToken, AuditEvent,
SystemState, MailDelivery, RateBucket y RateEvent. Migraciones:
`0001_identity_users`, `0002_identity_access`, `0003_identity_mail_limits`.
CHECKs, funciones, triggers e índice parcial se mantienen en SQL revisado, porque el
esquema Prisma no expresa todas estas reglas. El singleton es dato estructural de la
migración; no hay administrador ni cuentas iniciales.

El pool y la configuración pertenecen a infraestructura. No se introdujeron Prisma/HTTP
en dominio, reglas de negocio en controladores ni módulos académicos. La API valida
configuración antes de iniciar; conserva únicamente el módulo Probe y `/health/live`.
La persistencia de identidad se usa en las pruebas; todavía no se conecta a casos de uso.

## Ejecución

Docker Compose: PostgreSQL 16.14, Mailpit 1.31.3, Node 22.23.1/npm 10.9.8;
Prisma 7.10.0, NestJS 12.1.0, React 19 y Vite 8.3.1. Se conservan versiones y lockfile.
La reconstrucción ejecutó `npm ci`, generación de los dos clientes y compilación de API.
Solo se copiaron plantillas sin secretos a la imagen.

| Comando desde la raíz | Resultado |
| --- | --- |
| `docker compose up -d --build api` | Satisfactorio; Compose válido y cuatro servicios saludables |
| `docker compose exec -T api npm run lint` | Satisfactorio en API y web |
| `docker compose exec -T api npm run build` | Satisfactorio en API y web |
| `docker compose exec -T api npm run test:unit` | 4 pruebas satisfactorias: 3 límites de dependencias y 1 React |
| `docker compose exec -T api npm run test:integration` | 38 pruebas satisfactorias: 23 configuración, 11 migraciones y 4 de harness/Nest/PostgreSQL |
| `docker compose exec -T api npm run test:crypto-mail` | 2 pruebas satisfactorias; Argon2 y captura Mailpit |
| `git diff --check` y enlaces Markdown modificados | Sin errores; 55 enlaces locales válidos |

`environment.spec.ts` comprueba selección explícita de test, raíz independiente del
workspace, base/roles/claves distintos, claves base64 de 32 bytes, parámetros acotados,
TLS/HTTPS y proxy concreto en demo/producción. Las configuraciones de producción son
fixtures: no acreditan un despliegue ni conexiones externas. También comprueba plantillas
vacías y actualización idempotente de claves faltantes, conservando configuración previa.

`migrations.spec.ts` aplica las tres migraciones con Prisma a un esquema vacío, comprueba
su historial, las ocho tablas y permisos restringidos; aplica SQL incremental a otro
esquema con datos ficticios y conserva esos datos. Repite deploy sin reinicialización.
Prueba CHECKs/enums/FKs, índice parcial sin `now()`, 20 inserciones concurrentes de un
mismo correo, marca permanente de bootstrap, cancelación/purga de correo y rollback
conjunto de cuenta/auditoría mediante Prisma.

Los dos esquemas efímeros pertenecen exclusivamente a `academia_v00_test` y se eliminan
al finalizar. No se migró ni reinicializó desarrollo ni se borraron datos ajenos. Esta
prueba incremental no equivale a restaurar un respaldo completo de una base real.
No se usaron mocks de PostgreSQL, `db push`, reset ni seed de cuentas.

Una repetición durante la construcción de Docker superó los 15 segundos del test de
idempotencia, sin fallo de restricciones ni migración. Su timeout se ajustó a 120 segundos,
igual que el límite de ejecución de la CLI; las demás pruebas mantienen sus límites.
La repetición final pasó: 11 pruebas de migraciones, incluida idempotencia. No se usa esa
duración para afirmar rendimiento del sistema.

## Límites y siguiente bloque

T017–T030 permanecen pendientes. Todavía no existen registro, login, autorización,
bootstrap operable, verificación/reset de correo, worker ni reglas de cuotas ejecutadas
por la aplicación. Las tablas no equivalen a esos comportamientos. V01–V16 continúan
pendientes y los 1000 concurrentes siguen siendo un objetivo por validar.

`db:migrate:dev` existe, rechaza otros entornos y usa `--create-only`. La generación de
nuevas migraciones mediante ese comando requiere una BD sombra con permisos adecuados;
ese flujo no se validó ni se concedió CREATEDB al propietario. Sí se probaron generación
offline y deploy de las tres migraciones revisadas. Antes de generar nuevas migraciones,
se debe preparar esa BD sombra y revisar que el SQL conserve las restricciones manuales.

Siguiente incremento recomendado: T017–T020, reglas puras, hashing/secretos y límites
persistidos. Después: T021–T023, sesiones, autorización y transporte HTTP; T024–T030
completan correo, auditoría, gobierno y aceptación de fundamentos antes de las historias.
