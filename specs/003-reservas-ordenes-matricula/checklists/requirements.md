# Specification Quality Checklist: reservas, órdenes y matrícula

**Purpose**: Revisar calidad y preparación del borrador RP002 antes del plan.
**Created**: 2026-10-30, America/Lima.
**Feature**: [spec.md](../spec.md).
**Estado**: revisado, **no aprobado para planificación**. No acredita implementación.

Checklist incorporado de speckit-specify, no checklist personalizado. Sus marcas
expresan calidad documental revisada; las casillas pendientes se conservan hasta
resolver los motivos indicados. No se modifican checklists de 001/002.

## Content Quality

- [X] No contiene detalles de implementación como lenguajes, frameworks u operaciones técnicas.
- [X] Está centrado en valor del usuario y necesidades del negocio.
- [X] Está escrito para los interesados del negocio.
- [X] Incluye todas las secciones obligatorias de la plantilla.

## Requirement Completeness

- [x] No quedan marcas [NEEDS CLARIFICATION].
- [ ] Los requisitos son verificables y no ambiguos en todo su alcance.
- [ ] Todos los criterios de éxito son medibles con condiciones de evaluación definidas.
- [X] Los criterios de éxito son independientes de la tecnología.
- [x] Todos los escenarios de aceptación tienen reglas de resultado definidas.
- [X] Los casos límite están identificados, incluidos RE-01–RE-10.
- [X] El alcance está delimitado.
- [X] Las dependencias y supuestos están identificados.

## Feature Readiness

- [ ] Todos los requisitos funcionales tienen criterios de aceptación completos.
- [X] Las historias cubren los recorridos principales.
- [ ] La funcionalidad especificada permite evaluar todos los resultados de éxito sin reglas pendientes.
- [X] La especificación no introduce decisiones de implementación.

## Notes

Resultado de revisión, actualizada tras dos respuestas parciales: **10/16 satisfechas;
seis pendientes**.
La revisión reconoce el borrador como salida documental de RP002; no lo declara
listo para plan ni implementación. RP003/clarify debe completar las reglas y repetir
esta revisión. No se ejecuta ese procedimiento en este bloque.

| Criterio pendiente | Evidencia concreta del borrador | Qué falta |
| --- | --- | --- |
| Marcas de aclaración | RA-01: «¿Cómo se compone la orden y su pago…?»; RA-03: «¿Cómo se resuelve la verificación exactamente al vencimiento…?»; PD-01: «¿Quién define el precio y moneda…?». | La reserva conjunta y el instante de verificación servidor ya están confirmados; siguen las tres cuestiones restantes, sin aprobar otras filas. |
| Requisitos no ambiguos | FR-003/005/006/008/014/015/020 dependen de RA-01–RA-06 y PD-01–PD-03. | Composición, precio, precedencia, cancelación, permisos, identidad y abuso aprobados o delimitados explícitamente. |
| Medición completa | SC-008: «El objetivo de 2500 activos solo se considera alcanzado con evidencia del escenario y criterios D10 acordados». | Definir actividad, mezcla/ventana y condiciones D10; no inventar latencias, cuotas o capacidad aprobada. |
| Resultados de escenarios | US1.3 y US2.5, US3.5 y US4.3 quedan condicionados por precio y RA-03/04/05. | Precisar resultados verificables para precio, pagos al límite/tardíos y cancelación. US1.6 ya exige todas las reservas o ninguna. |
| Criterios por requisito | FR-014 exige «seguir RA-05» y FR-020 «seguir RA-06 explícita»; todavía no hay esa política aprobada. | Sustituir dependencia por regla/alcance explícitos conservando decisiones no aprobadas. |
| Preparación integral | SC-002/003/005/006 requieren reglas comerciales/permisos; SC-008 mantiene D10 pendiente. | Cerrar o delimitar puertas antes de planificar la porción afectada; ninguna prueba sustituye esa aprobación. |

Las demás RA siguen abiertas aunque no tengan otra marca: prioridad RA-02,
reembolsos/pagos tardíos RA-04, cancelaciones RA-05 y abuso RA-06. PD-02 y PD-03
exponen vacíos de identidad/condiciones y permisos; no se sustituyen por supuestos.
Specify recibió dos respuestas parciales el 2026-10-30: todas las reservas juntas o
ninguna y referencia temporal al terminar la verificación en servidor. PD-01 sigue
sin respuesta; las otras cuestiones no se aprueban por esas dos opciones. RP003
continúa pendiente y no se considera ejecutada por este registro.

Se conservan las 24 horas confirmadas, PA-01–PA-05/E1 y los pendientes de 001/002.
T073/T074 y T104/T108 no se cierran; T103 mantiene ejecución/informe sin capacidad
aprobada. Sin pruebas de producto, cobros, datos nuevos ni resultados de carga.

Comprobación documental RP002: cuatro historias, 24 FR, ocho SC, siete RC y diez
RE; tres marcas de aclaración. Se comprobaron 1.297 enlaces en 87 documentos sin
roturas, 72 archivos protegidos intactos y conservación completa de 001/002/RP001.
La única marca del backlog que cambia es RP002 por sus documentos preparados;
no significa aprobar este checklist ni ejecutar RP003. Detalle versionado en
`specs/003-reservas-ordenes-matricula/evidence/rp002-results.json`.

Comandos de revisión: resolución de plantilla mediante el procedimiento de Spec Kit,
creación con `create-new-feature.ps1 -Json -AllowExistingBranch -Number 3 -ShortName reservas-ordenes-matricula`,
`check-prerequisites.ps1 -Json -PathsOnly` y `node .cache/reservas-rp002/review.mjs`.
Los lanzadores/resultado privados permanecen en ese directorio ignorado. No se
ejecutan tipos/lint/build ni suites porque solo cambian artefactos documentales.
