# Decisiones pendientes

Estado al 2026-09-22: todas las decisiones siguientes están abiertas. Una propuesta no
equivale a una regla aprobada, una contratación ni una capacidad demostrada.

Antes de implementar una funcionalidad, sus decisiones bloqueantes deben resolverse o
delimitarse en su especificación. Cada resolución registrará fecha, responsable, criterio,
evidencia y especificaciones afectadas. Las reglas obligatorias de la
[constitución](../.specify/memory/constitution.md) no se sustituyen por supuestos.

| ID | Tema | Propuesta o pregunta por resolver | Evidencia o condición de cierre |
| --- | --- | --- | --- |
| D01 | Regla de pago | Propuesta: un pago por el total de la orden y matrícula por cada curso. ¿La activación es atómica? ¿Qué sucede si un curso pierde disponibilidad tras el cobro? | Regla validada y casos de aceptación de éxito, rechazo, pago tardío y falta de cupos antes de implementar órdenes/pagos. |
| D02 | Pasarela | Culqi es candidata. Faltan proveedor, requisitos, costos y mecanismo de verificación. | Decisión documentada y plan de validación en sandbox; carga con pagos simulados por separado. |
| D03 | Vigencia de matrícula | ¿Por período, fechas del curso o duración desde el pago? ¿Qué ocurre al cancelar o finalizar? | Estados y fechas que determinen acceso a materiales, chat y video. |
| D04 | Reservas de cupos | ¿Se reserva al crear la orden? ¿Por cuánto tiempo? ¿Cómo expira y se libera? | Transiciones que cubran competencia, abandono, reintentos y confirmación tardía sin sobreventa. |
| D05 | Reembolsos | ¿Se admiten, en qué condiciones y por curso o por orden? ¿Cómo afectan matrícula y cupos? | Política validada y comportamiento definido antes de implementar cancelaciones o reembolsos. |
| D06 | Horarios simultáneos | ¿Se impide matrícula en cursos solapados? ¿Cómo se tratan cambios de horario y zona horaria? | Regla validada y ejemplos de solapamiento, cambios y excepciones permitidas. |
| D07 | Video y ancho de banda | ¿Es viable OBS → SRS → HLS dentro del presupuesto? Faltan bitrate, calidad, latencia tolerada y número de emisiones simultáneas. | Prueba temprana de emisión y reproducción, tráfico medido, limitaciones y estimación sustentada de costo. |
| D08 | Protección HLS | ¿Cómo autorizar manifiestos y cada segmento, con expiración y reglas de acceso definidas? | Pruebas de acceso directo permitido/denegado y permisos vencidos; sin prometer impedir grabaciones. |
| D09 | Alojamiento y presupuesto | Faltan proveedor, región, recursos, almacenamiento, transferencia, HTTPS y tiempo de uso. | Estimación fechada de gasto total de servicios y pruebas que no exceda S/300, con forma de detener consumo al terminar. No contratar en esta etapa. |
| D10 | Criterios de evaluación | Falta la rúbrica del profesor: distribución de 1000 usuarios, duración, carga, latencia, errores y evidencia exigida. | Escenarios y umbrales acordados con el profesor; distinguir matrícula, chat, video y cualquier escenario combinado. |
| D11 | Identidad y permisos | Faltan alta de cuentas, recuperación, sesiones, asignación de roles y reglas de pertenencia. | Matriz de permisos y criterios verificables para la primera especificación. |
| D12 | Materiales y paneles | Faltan formatos, tamaños, almacenamiento y operaciones mínimas por rol. | Alcance acotado por funcionalidad compatible con el plazo y el presupuesto. |
| D13 | Actualización y recuperación | Faltan ubicación/retención de respaldos, responsables y tiempos aceptables de recuperación. | Procedimiento y restauración comprobada antes de una demo con datos persistentes o publicación. |

## Prioridades

Al comenzar, resolver D11 para especificar identidad, obtener la rúbrica (D10) e investigar
video, protección y alojamiento (D07–D09). Son riesgos que pueden modificar el diseño y el
escenario demostrable dentro del presupuesto.

Antes de implementar matrícula y pagos, resolver D01–D06. No sustituir la confirmación del
proveedor por la pantalla de éxito ni omitir transacciones o idempotencia por una decisión
pendiente. D12 se resolverá al especificar materiales/paneles y D13 antes de operar con datos
persistentes en demo o producción.
