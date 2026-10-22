# Checkpoint US1 — preparar cursos y grupos (T030)

Fecha: 2026-10-22, America/Lima. Rama `feat/002-oferta-academica`.
Base `cf2fc85`, Git inicialmente limpio. `ecb1efe` conserva T022/T028/T029.
Los cuatro commits posteriores documentan arquitectura/presentación y sus reversiones;
`git diff --stat ecb1efe HEAD` está vacío. Se conserva ese historial.

Se utiliza speckit-implement y constitución 1.1.0. Prerrequisitos resueltos con
`check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` (ExecutionPolicy Bypass
solo para ese proceso); checklist requirements 16/16, sin cambios de sus marcas.
Sin AGENTS.md aplicable ni extensions.yml. PA-01–PA-05 y E1 permanecen intactos:
T012 exige ledger/auditoría antes de T014 y barreras/aserciones persistidas,
sin sustituir el protocolo académico por las pruebas del helper.

## Alcance comprobado

US1, HU09/RF10: preparación administrativa de cursos, grupos, asignación docente,
capacidad y horarios. Curso y cada grupo tienen identidad/revisión propias. Capacidad
1–50 configurada no equivale a ocupación ni disponibilidad. Periodos inclusivos,
America/Lima y reglas de T023 se conservan. No se incorpora publicación ni catálogo.

| Escenario | Evidencia automatizada y criterio |
| --- | --- |
| US1.1 | B01 distingue vacío y ofrece crear; B09 provoca fallo SQL real y recupera consulta sin confundir error con vacío. |
| US1.2 | B02 crea curso/dos grupos con capacidades y horarios distintos, recarga y cambia solo uno; observador confirma hermano y curso intactos. H07 comprueba independencia por HTTP/PG. |
| US1.3 | B03 conserva entradas y errores accesibles; H12–H18 verifican rechazos y ausencia de cambios parciales. |
| US1.4 | B04/B05 cancelan alta/edición con teclado, sin petición de escritura ni cambios persistidos. |
| US1.5 | B02/B06 ejercen extremos 1/50 y capacidad inválida, sin disponibilidad ficticia. |
| US1.6 | B07/B08/B10 comprueban fechas, franjas, adyacencia y rechazos; T020 cubre ocurrencias efectivas y medianoche. |

Los archivos originales T019–T022 no se modifican. B02 observa tablas reales desde
otra conexión; las recargas son del navegador real. Los 19 casos únicos originales
de T022 se ejecutan en escritorio y Pixel 7. La ampliación U01–U09 conserva permisos,
logout, cuentas, pérdida de sesión sin replay, revisión explícita y selector privado.
Los fixtures publicados/cancelados de U09 solo prueban bloqueo de edición, no una
funcionalidad de transición implementada.

## Ejecución

**T030 aprobada**. Resultados por caso en [us1-results.json](us1-results.json).

| Suite final de checkpoint | Resultado |
| --- | --- |
| API, reglas y arquitectura | 266/266; incluye T019/T020 (150) y arquitectura (14) |
| HTTP con PostgreSQL real | 74/74 |
| Unitarias web | 141/141 |
| E2E funcionales | 30 casos únicos × 2 perfiles = 60/60 |
| Controles auxiliares de navegador | 1 caso × 2 perfiles = 2/2 |

Total navegador: 62/62, 6,4 minutos; cero omitidos, flaky o reintentos. Los 19 casos
originales T022 suman 38 ejecuciones, sin cambios de sus expectativas. Todos los
códigos de salida fueron 0. Las aserciones posteriores de persistencia e independencia
de dos grupos se alcanzaron. No reapareció el timeout histórico de arquitectura.
Las suites se ejecutan antes de crear las pruebas rojas T031/T032, para que los
fallos intencionales de US2 no oculten una regresión en US1.

Reproducción privada revisada, reutilizando configuración/comandos existentes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t030-t032/run.ps1 -Action up
# Cada acción verifica su código de salida; no continuar tras un fallo de checkpoint.
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t030-t032/run.ps1 -Action unit
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t030-t032/run.ps1 -Action http
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t030-t032/run.ps1 -Action web
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t030-t032/run.ps1 -Action e2e
```

`unit` usa npm run test:unit de API, incluidas arquitectura y las 150 reglas originales
T019/T020. `http` usa Vitest con academic-offering-preparation.spec.ts. `web` usa
test:unit de web; `e2e` usa playwright.academic-offering.config.ts sin alterar perfiles,
timeouts, workers o retries. Se generan Prisma y dist en contenedores temporales
antes de importar AppModule; no se aplica una nueva migración de producto.

## Revisión, conservación y límites

Docker estaba detenido. El primer intento de inspección falló por ausencia del motor;
se inició Docker Desktop desde su ruta instalada y se repitieron las guardas antes
de reanudar db/Mailpit aislados. Esto es una incidencia operativa, no prueba roja de negocio.
Proyecto exclusivo `academic-offering-fa3d46bddbb8`, APP_ENV=test, sin puertos publicados
ni montajes manuales. La fuente versionada actual se sincroniza a la copia de T002;
no se copia ni genera configuración real. Se conserva el volumen existente.

Cada fixture crea su esquema t_ y cuentas ficticias; cleanup se limita a ese esquema.
La base manual no recibe SQL, bootstrap, reinicializaciones, purgas ni migraciones.
La comprobación final de conservación y detención se registra en la evidencia del
bloque T031/T032, una vez concluidas sus pruebas en el mismo entorno aislado.

No hay aceptación humana. SC-001 completo requiere US3 y las otras historias;
SC-002 humano corresponde a T073. Siguen abiertos D04, matrícula de D06,
T104/T108, SMTP real, D10/D13 y el hallazgo histórico de bootstrap, aunque otras
regresiones pasen. Sin matrícula/pagos/reservas/clases/materiales/video/chat ni
declaraciones de capacidad para 1000 concurrentes. La revisión constitucional
I/II/IX/X/XI se limita al alcance y la evidencia indicados; no autoriza producción.
