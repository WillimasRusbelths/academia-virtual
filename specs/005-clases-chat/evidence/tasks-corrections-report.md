# Correcciones autorizadas tras el análisis del 005

2026-11-17, America/Lima. Base `4607683`, rama `feat/005-clases-chat`.
Autorización: «entonces has eso corrige», después de recomendar corregir I1/I2 y
preparar una propuesta revisable de alcance audiovisual. No adopta esa propuesta.

## Resultado

- **I1 corregido**: T084 depende de T076–T079 y puede registrar T080–T083 pendientes
  si faltan participantes/acuerdos/entorno. T085 puede entregar revisión preliminar
  sin esperar personas. T086 exige explícitamente T080–T083, además de video y
  demás condiciones: quitar la espera de documentación no elimina aceptación humana.
- **I2 corregido**: parser reproducible en
  [task-references.mjs](../../../ops/specs/task-references.mjs), con abreviaturas,
  rangos y cambios FR/SC en una cadena. [Índice actual](tasks-coverage.json),
  asociado en ambas direcciones, incluye las referencias omitidas. El índice
  original tasks-generation-results.json y su informe se conservan sin reescribir:
  contienen una limitación del generador anterior, no evidencia nueva de aceptación.
- **C1: propuesta preparada, no resuelto**. [Texto revisable](video-scope-proposal.md)
  para YouTube como ensayo del MVP, protección propia de aula/referencia/chat y
  limitaciones externas. Incluye enmienda MAJOR propuesta 2.0.0, FR/SC/escenarios,
  impacto en RF16/DEC01/D07/D08/plan/modelo/contratos/tareas y aprobación responsable/
  validación académica si afecta evaluación. Cloudflare permanece fuera del MVP.

La constitución vigente 1.2.1, FR/SC/escenarios de 005 y specs 001–004 conservan
sus obligaciones. G-V005 y aceptación de video siguen pendientes; T034 no se marca
completa por adelantar su borrador, porque faltan prerrequisitos/registro de decisión.
0/86 tareas completadas. Las correcciones no implementan sesiones o reproducción.

## Comprobación reproducible

Desde raíz del repositorio:

```powershell
node ops/specs/validate-005-tasks.mjs --write
node ops/specs/validate-005-tasks.mjs
git diff --check
```

`--write` genera el índice actual y [resultados](tasks-corrections-results.json);
sin ese argumento valida en modo de solo lectura. Nunca escribe la constitución,
el spec o los checkpoints anteriores. Valida regresiones del parser, numeración/
etiquetas/rutas, dependencias, separación de T084/T086, asociación de 23 FR/ocho SC,
enlaces y preservación de alcance/gates/archivos previos. Hashes normalizan CRLF a
LF para reproducibilidad Windows/Linux.

Los casos del parser incluyen los fallos concretos de FR-009, FR-017 y FR-021,
abreviaturas mixtas, rangos, duplicados y entradas inválidas. No son pruebas de
producto. El resultado detallado registra el número de asociaciones recuperadas.
No se lanzan suites funcionales por cambios documentales o por validar el índice.

## Trabajo restante

Revisar/aprobar la propuesta concreta y determinar si necesita validación del
profesor antes de adoptarla. La [constitución](../../../.specify/memory/constitution.md)
exige «La persona responsable del proyecto DEBE aprobarla antes de su adopción»;
si cambia criterios de evaluación, exige validarlos con el profesor. Ninguna de
esas decisiones se inventa o se obtiene por vencimiento de un plazo de espera.

Tras adoptar el alcance, completar diseño/contrato de video del ensayo y repetir
consistencia antes de implementar su parte dependiente. El primer bloque técnico
independiente sigue siendo T001–T004. No se compran servicios, emite señal, migra BD,
publica producción o implementa Cloudflare por preparar esta corrección.
