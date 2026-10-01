# Revisión de organización y preparación de commits

Fecha: 2026-10-01. Rama: `feat/001-identidad-acceso-roles`.
No se encontró AGENTS.md aplicable. Se revisaron Git, archivos nuevos, configuración,
documentación, código y pruebas; los archivos sin seguimiento se clasificaron por su
función, no se trataron como descartables. No se movieron archivos ni se borraron cachés,
dependencias o resultados para limpiar la vista.

## Archivos conservados y organización

| Grupo | Archivos / directorios | Decisión |
| --- | --- | --- |
| Aplicación y configuración | `apps/api/`, `apps/web/`, manifests npm y `package-lock.json` | Conservar esqueleto, AppModule, versiones y scripts. El lockfile incorpora ESLint/TypeScript ESLint y Playwright con sus dependencias. |
| Pruebas y límites | `apps/api/tests/`, `apps/web/tests/`, configuraciones ESLint/Playwright y `ops/lint/` | Versionar pruebas nuevas, aislamiento PostgreSQL, soporte Mailpit y reglas de capas. |
| Operación local/Linux | `ops/local/`, `ops/linux/`, `compose.linux.yml` y `.github/workflows/v00-linux.yml` | Versionar scripts, evidencia y workflow manual de V00-L; conservar su estado de no ejecutado. No dispararlo ni hacer push. |
| Proceso compartido | `.agents/skills/` y `.specify/` | Conservar habilidades, plantillas, scripts, constitución y configuración Spec Kit realmente referenciados. `.specify/.gitignore` conserva exclusiones del estado por equipo. |
| Documentación funcional | `docs/`, `specs/`, `analisis-de-sistema/`, `arquitectura/` y README | Conservar alcance, detalle e historia. AS-002 añade una síntesis trazable, no sustituye las especificaciones. |
| Plantillas de entorno | `.env.example`, `.env.test.example` | Conservar; campos de conexión vacíos. |
| Vista del editor | `.vscode/settings.json` | Ocultar solo `node_modules`, `.npm`, `.cache`, `playwright-report` y `test-results`; código, pruebas, documentos y configuración siguen visibles. |

El staging se divide por rutas explícitas: preparación técnica y organización en el
primer commit; README, notas de `docs/` y siete entregables AS-002 en el segundo. No se
usa `git add .`. La revisión incluye los nuevos archivos que `git diff --stat` omite.

## Exclusiones y secretos

`.gitignore` ya excluye `node_modules/`, `.npm/`, `.cache/`, compilaciones, cliente Prisma
generado, cobertura, `playwright-report/`, `test-results/` y resultados de carga. Se
comprobó con `git check-ignore`; no fue necesario cambiar esas reglas. Se amplió
`.dockerignore` para cubrir dependencias/cachés anidadas, reportes, cliente generado y
directorios de secretos; las plantillas `.env.*.example` siguen disponibles.

`.env.test` contiene dos entradas locales de conexión configuradas. Se inspeccionó sin
imprimir valores y se comprobó que está ignorado y no seguido. No se modificó. El revisor
existente `node ops/local/review-files.mjs` examina tanto seguidos como nuevos, compara
contra valores privados locales y busca patrones conocidos sin mostrarlos; no detectó
hallazgos. Esta comprobación es acotada, no una garantía universal de detección de secretos.

## Comprobaciones de esta revisión

| Comprobación | Resultado |
| --- | --- |
| Lint y build de API/web mediante `npm test` | Aprobados. |
| Unitarias mediante `npm test` | 4/4: tres de límites de capas y una web. |
| Integración | Primer intento: Mailpit apagado, conexión rechazada en 8025; tres pruebas pasaron y una falló. Tras iniciar Mailpit con el script existente: `npm run test:integration` aprobó 4/4. |
| Navegador | `npm run test:e2e`: Chromium, 1/1 aprobada. |
| Hash/correo | `npm run test:crypto-mail`: 2/2 aprobadas, captura local de correo ficticio. |
| Scripts nuevos | `node --check` aprobó `ops/linux/provision-ci.mjs` y `ops/lint/import-boundaries.mjs`; el aprovisionamiento Linux no se ejecutó. |
| Docker | Cliente/Compose detectados y `docker compose -f compose.linux.yml config --quiet` aprobado. Daemon inaccesible en esta revisión; no se ejecutaron contenedores ni V00-L. |
| Documentación | Enlaces locales y anclas del proyecto comprobados; catálogos AS-002 y cobertura de los 33 FR de identidad revisados. Tres diagramas Mermaid revisados estructuralmente; no hay renderizador instalado y no se añadió uno. |
| Git | Revisión de diferencias, archivos nuevos y `git diff --check`, seguida de revisión del staging explícito. |

PowerShell rechazó inicialmente la ejecución directa del script Mailpit por su política
de scripts. Se ejecutó el archivo existente/verificado con `-ExecutionPolicy Bypass`
solo para ese proceso; no se modificó la política global de Windows. Mailpit arrancó
oculto y limitado a loopback, sin relay ni envíos reales. No se reinstalaron dependencias
ni herramientas; la evidencia anterior de `npm ci` sigue en [test-harness.md](test-harness.md).

El resultado no se presenta como un `npm test` íntegramente exitoso en una sola invocación:
lint/build/unitarias pasaron en la primera y se completaron los pasos restantes después
de resolver el prerrequisito Mailpit. No se repitieron pasos ya aprobados sin cambios.

## Límites y pendientes conservados

Docker funciona según confirmación del responsable, pero disponibilidad del equipo y
validación de la aplicación son evidencias distintas; detalle en
[environment.md](environment.md#actualización-docker--2026-10-01). No hay integración de
pagos/video ni prueba de carga que demuestre 1000 usuarios concurrentes. Se conserva el
objetivo pendiente de demostrar y los avisos de auditoría documentados en
[compatibility.md](compatibility.md); no se ejecutó una nueva auditoría remota ni se
actualizaron dependencias para esta organización. El workflow de Linux recibió revisión
estática; su ejecución en GitHub sigue pendiente.
