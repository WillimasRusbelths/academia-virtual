# Checklist de calidad de especificación: oferta académica

**Propósito**: Validar integridad y calidad antes de planificar; no acredita implementación.
**Creado**: 2026-10-18
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación: lenguajes, frameworks o contratos técnicos.
- [x] Centrada en valor para usuarios y necesidades del negocio.
- [x] Escrita para personas no técnicas.
- [x] Todas las secciones obligatorias están completas.

## Integridad de requisitos

- [x] No quedan marcadores de aclaración pendientes.
- [x] Los requisitos son verificables y no ambiguos.
- [x] Los criterios de éxito son medibles.
- [x] Los criterios de éxito no dependen de una tecnología.
- [x] Todos los escenarios de aceptación están definidos sin alternativas pendientes.
- [x] Se identifican casos límite.
- [x] El alcance está delimitado explícitamente.
- [x] Se identifican dependencias y supuestos.

## Preparación de la funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación cerrados.
- [x] Los escenarios cubren los recorridos principales.
- [x] La especificación permite evaluar los resultados medibles definidos.
- [x] No se filtran detalles de implementación en las reglas de negocio.

## Notas

- Validación inicial: **12/16** puntos aprobados; borrador apto para aclaraciones,
  pendiente de decisiones de negocio antes de planificación. No es aceptación del producto.
- Los cuatro puntos abiertos remiten a «Decisiones de negocio pendientes»: PA-01
  «lectura docente/visitante», PA-02 «ciclo y precondiciones», PA-03 «docentes requeridos»,
  PA-04 «máximo o intervalo obligatorio» y PA-05 «horarios, zona y solapamientos».
  Las propuestas no están aprobadas.
- US2.1–3, US3.1–3, US4.1–3 y FR-003–005/007–012 necesitan confirmar esas reglas;
  repetir revisiones de redacción no sustituye respuestas del responsable.
- S1 queda visible para revisión; D04/D06 no se declaran cerradas.
- Se continúa con `$speckit-clarify`, una pregunta por vez, por solicitud del usuario;
  no avanzar a planificación durante esta etapa.
