# Checklist de calidad de especificación: materiales de estudio por grupo

**Propósito**: revisar requisitos antes de preparar el plan técnico.
**Creado**: 2026-11-16, America/Lima.
**Feature**: [spec.md](../spec.md).

Los marcadores acreditan calidad del documento; no implementación, pruebas de
producto, decisiones operativas o aceptación humana.

## Calidad del contenido

- [x] Sin decisiones de implementación como lenguajes, frameworks o diseño de interfaces técnicas.
- [x] Centrada en valor del usuario y reglas de negocio.
- [x] Escrita para los interesados con acciones y resultados concretos.
- [x] Secciones obligatorias completas: escenarios, requisitos, entidades, resultados y supuestos.

## Integridad de requisitos

- [x] No quedan marcadores NEEDS CLARIFICATION: las tres preguntas de alcance recibieron respuesta explícita.
- [x] Requisitos comprobables, con estados, matriz de actores y límites definidos.
- [x] Criterios de éxito medibles mediante archivos, permisos, estados y recorridos observables.
- [x] Criterios independientes de tecnología, sin latencia/capacidad inventadas.
- [x] Escenarios de aceptación definidos para las tres historias y sus fallos principales.
- [x] Casos límite identificados: tamaño/tipo, fallo, concurrencia, autorización y recuperación.
- [x] Alcance acotado: por grupo, formatos/tamaño confirmados y exclusiones expresas.
- [x] Dependencias, supuestos y puertas D02/D10/D13/D12 identificados sin cerrar pendientes anteriores.

## Preparación de la funcionalidad

- [x] Los veinte requisitos tienen trazabilidad hacia escenarios/resultados exigidos.
- [x] Historias priorizadas cubren publicación, consulta/descarga y mantenimiento/retiro.
- [x] Los resultados exigidos permiten evaluar los recorridos y denegaciones sin presumir su cumplimiento.
- [x] La especificación conserva reglas de producto y separa decisiones técnicas para el plan.

## Notas de revisión

Resultado: **16/16 criterios de calidad satisfechos**, revisión del 2026-11-16.

- M01–M03 registran las decisiones del responsable: por grupo, docente propio/admin
  global, PDF/JPG/PNG hasta 20 MB. Los supuestos restantes se distinguen de esas respuestas.
- Se explicitaron permisos para grupos cancelados y descarga de gestión para evitar
  inferir acceso por autoría o por una matrícula de otro grupo.
- «20 MB» se define como 20 000 000 bytes; JPEG admite .jpg y .jpeg. La comprobación
  de tipo/tamaño no se presenta como detección universal de archivos maliciosos.
- Almacenamiento y operación técnica se resolverán en el plan; no se contrata servicio
  ni se aprueban cuotas agregadas, retención/custodia o capacidad por este checklist.
- 003 conserva 84/94 tareas completas. No se marca ninguna tarea de 001–003 ni se
  acredita Izipay real, prueba humana de materiales o ensayo operacional.
- Se conserva la rama de trabajo existente y se actualiza solo el puntero local de
  Spec Kit a 004. No se inicia plan, generación de tareas ni implementación en este bloque.

Siguiente fase: `$speckit-plan` para 004. Una aclaración posterior que cambie reglas
debe actualizar la especificación y volver a revisar este checklist antes de implementar.
