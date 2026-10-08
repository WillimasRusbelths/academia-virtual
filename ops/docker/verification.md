# Verificación del entorno Docker

Fecha: 2026-10-06. Rama `feat/001-identidad-acceso-roles`.

## Plataforma y construcción

Docker Desktop con motor Linux 29.8.1, WSL2 y arquitectura x86_64; Compose v5.5.1.
Node 22.23.1 y npm 10.9.8 en las imágenes. Los manifests y el lockfile conservan
las versiones anteriores. `docker compose config --quiet` y `docker compose build`
aprobaron; ambos Dockerfiles instalaron 389 paquetes mediante `npm ci`.
No se usaron dependencias ni builds del host.

Digests observados en esta descarga (las etiquetas pueden cambiar de digest):

| Imagen | Digest SHA256 |
| --- | --- |
| node:22.23.1-bookworm-slim | `6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3` |
| postgres:16.14-bookworm | `64154d0babcb1741988719e703419af0382b19953706149f9872fbd0f438efa8` |
| axllent/mailpit:v1.31.3 | `ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d` |

## Servicios y conexiones

`docker compose up -d --wait` terminó correctamente con los cuatro servicios healthy.
Se revisaron sus logs. PostgreSQL informó 16.14 y reutilizó el volumen en los reinicios;
el inicializador creó las dos bases y cuatro roles únicamente al estrenarlo.

| Comprobación | Resultado |
| --- | --- |
| PostgreSQL | healthy, pg_isready TCP; puerto del host 55432 |
| Mailpit | healthy, readyz; HTTP 200 en localhost:18025/api/v1/info; SMTP 11025 en el host |
| API | healthy; HTTP 200 y `{"status":"ok"}` en localhost:3000/health/live |
| Web | healthy; HTTP 200 en localhost:5173 |
| API → PostgreSQL | probe:migrate y probe:check aprobados usando db:5432 y roles exclusivos de ensayo |
| API → Mailpit | SMTP mailpit:1025; mensaje ficticio capturado mediante http://mailpit:8025 |

Todos los puertos publicados usan 127.0.0.1. La red local es interna; access es una
bridge adicional necesaria para los puertos del host en este motor. La API y web
esperan las dependencias saludables. El health check HTTP no sustituye las pruebas
de conexiones a datos/correo.

## Pruebas

`docker compose exec -T api npm run test:docker` terminó con exit 0 como usuario node:

| Validación | Resultado |
| --- | --- |
| Lint | API y web, aprobados |
| Build | TypeScript API y TypeScript/Vite web, aprobados |
| Unitarias | 4/4: tres de límites de importación y una de componente web |
| Migración y permisos | Ensayo Prisma aplicado; owner y runtime restringidos, sin acceso a academia_dev |
| Integración | 4/4 en tres archivos: Nest HTTP, Prisma con rollback real, esquema aislado y Mailpit |
| Hash y correo | 2/2: Argon2id y captura SMTP ficticia |
| Navegador | 1/1 en Chromium headless 153.0.8010.12 mediante Playwright existente, contra web:5173; compilación previa aprobada y contenedor efímero como node |

## Incidencias resueltas y límites

- npm requirió una CA pública del inspector TLS confiado por Windows. Se exportó solo
  el certificado público a la caché privada y se suministró como secret de BuildKit,
  mediante el override local ignorado. npm ping aprobó con TLS activo. No hay claves
  privadas ni CA local copiadas a las imágenes. Procedimiento en [README](README.md).
- Vite necesitó permisos de escritura en .vite-temp y .vite. Se habilitan solo esas
  cachés y los archivos de aplicación; las dependencias permanecen sin permisos de
  escritura para node. Los procesos de API/web y navegador no usan root.
- El primer arranque con red exclusivamente interna no publicaba puertos; access
  resolvió el acceso desde el host, conservando la red interna y los enlaces loopback.
- Chromium detectó un HTTP 403 al usar el host interno web. Se autoriza únicamente
  ese nombre mediante la variable de Vite en Compose; la solicitud interna devuelve
  HTTP 200. No se deshabilita el control de hosts.

La auditoría del 2026-09-29 sigue pendiente según [compatibility.md](compatibility.md);
no se ejecutó una nueva auditoría ni el workflow remoto de Actions. Esta verificación
no acredita funcionalidades de identidad, pagos/video, recuperación de producción
ni capacidad de 1000 usuarios concurrentes. No se modificaron drivers ni reglas
arquitectónicas.

## Cierre

El comando principal `docker compose up -d --build --wait` se ejecutó con los archivos
finales: exit 0, cuatro servicios healthy y HTTP 200 en API, web y Mailpit. La
comprobación de roles PostgreSQL volvió a pasar tras reutilizar el volumen.

Se comprobaron 170 enlaces locales y sus encabezados en 25 documentos Markdown,
sin enlaces rotos. Los tres diagramas Mermaid pasaron revisión estructural básica;
el diagrama de arquitectura se comparó con la revisión anterior y permanece idéntico.
No se instaló un renderizador ni se afirma una comprobación visual completa.
`git diff --check` y la comprobación del staging aprobaron. La revisión de 103 archivos
candidatos no encontró secretos locales ni archivos .env reales seguidos.

`docker compose down` terminó con exit 0, sin -v. `docker compose ps -a` no muestra
contenedores del proyecto y `academia-local_postgres_data` permanece con driver local.
No se borraron datos persistentes, cachés ni resultados anteriores del host.

## Inventario de la migración

| Acción | Archivos |
| --- | --- |
| Creados | apps/api/Dockerfile; apps/web/Dockerfile; ops/docker/README.md; ops/docker/compose.ca.example.yml; ops/docker/configure.mjs; ops/docker/verification.md |
| Renombrado y actualizado | compose.linux.yml → compose.yml |
| Trasladados y actualizados | ops/local/compatibility.md → ops/docker/compatibility.md; ops/local/test-harness.md → ops/docker/test-harness.md |
| Inicialización sustituida conservando roles/permisos | ops/local/provision.sql → ops/docker/init-databases.sql |
| Modificados: configuración | .dockerignore; .gitignore; .env.example; .env.test.example; package.json; .github/workflows/v00-linux.yml |
| Modificados: ejecución y pruebas | apps/api/src/main.ts; apps/api/tests/compatibility/crypto-mail.spec.ts; apps/api/tests/support/mailpit.ts; apps/web/playwright.config.ts; apps/web/vite.config.ts; ops/local/compatibility/env.mjs |
| Modificados: referencias y estado | README.md; docs/alcance-mvp.md; docs/decisiones-pendientes.md; analisis-de-sistema/01-actores.md; 02-historias-del-usuario.md; 03-requisitos-funcionales.md; 04-atributos-de-calidad.md; 05-restricciones.md; arquitectura/arquitectura-inicial.md; ops/local/architecture.md |
| Modificados: especificaciones de ejecución | specs/001-identidad-acceso-roles/contracts/api.md; plan.md; quickstart.md; research.md; tasks.md; verification.md |
| Eliminados tras validar el reemplazo | ops/local/native.md; ops/local/environment.md; ops/local/start-mailpit.ps1; ops/local/review-v00.md; ops/local/repository-review.md; ops/linux/README.md; ops/linux/prepare-secret.mjs; ops/linux/provision-ci.mjs |

Se conservan ops/local/compatibility/ (Prisma, migración y guardas),
ops/local/review-files.mjs (revisión sin revelar secretos), ops/local/architecture.md
(límites de importación vigentes), ops/lint/, código, pruebas, .agents/, .specify/ y
.vscode/settings.json. No queda un procedimiento de ejecución nativa como principal.
La documentación detallada del alcance y el diagrama de arquitectura se mantienen;
17 HU/19 RF generales refinan una parte en siete historias y 33 FR de identidad.

.env y .env.test, compose.override.yml, la CA local, node_modules, cachés npm,
compilaciones y reportes siguen ignorados. Se comprobaron las reglas sin borrar
archivos locales. El generador de .env pasó con una plantilla CRLF aislada: produce
cinco claves independientes válidas y rechaza sobrescribir configuración existente.
