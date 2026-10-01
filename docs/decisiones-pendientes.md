# Decisiones pendientes

> **Nota de vigencia — 2026-10-01:** se conserva este registro de decisiones del
> 2026-09-23. D11 ya tiene [plan y decisiones de diseño](../specs/001-identidad-acceso-roles/plan.md)
> y [tareas](../specs/001-identidad-acceso-roles/tasks.md); «lista para planificar» es
> histórico. V00 nativo y T009/T010 tienen evidencia, pero las historias siguen sin
> implementar. Para entorno y estado usar R12 y el
> [inventario actualizado](../arquitectura/arquitectura-inicial.md). Esta entrega AS-002
> no cierra decisiones comerciales, académicas ni de aceptación aquí pendientes.

Estado al 2026-09-23: decisiones abiertas o parcialmente resueltas según cada fila.
La elección de Izipay está resuelta; sus condiciones e integración siguen pendientes.
Una propuesta no equivale a una regla aprobada, una contratación ni una capacidad demostrada.

Antes de implementar una funcionalidad, sus decisiones bloqueantes deben resolverse o
delimitarse en su especificación. Cada resolución registrará fecha, responsable, criterio,
evidencia y especificaciones afectadas. Las reglas obligatorias de la
[constitución](../.specify/memory/constitution.md) no se sustituyen por supuestos.

| ID | Tema | Propuesta o pregunta por resolver | Evidencia o condición de cierre |
| --- | --- | --- | --- |
| D01 | Regla de pago | Propuesta: un pago por el total de la orden y matrícula por cada curso. ¿La activación es atómica? ¿Qué sucede si un curso pierde disponibilidad tras el cobro? | Regla validada y casos de aceptación de éxito, rechazo, pago tardío y falta de cupos antes de implementar órdenes/pagos. |
| D02 | Pasarela: parcialmente resuelta | Izipay elegida para el MVP el 2026-09-23 por el responsable del proyecto; reemplaza la candidatura inicial de Culqi. Pendientes: tarifas finales, límites, acceso al entorno de pruebas y habilitación de Yape para la modalidad contratada. Integración no implementada. | Confirmar las condiciones para la modalidad contratada, definir verificación del proveedor y validar en su entorno de pruebas. Mantener pagos simulados para carga y separar al proveedor de órdenes/matrículas; no asumir capacidad ilimitada. |
| D03 | Vigencia de matrícula | ¿Por período, fechas del curso o duración desde el pago? ¿Qué ocurre al cancelar o finalizar? | Estados y fechas que determinen acceso a materiales, chat y video. |
| D04 | Reservas de cupos | ¿Se reserva al crear la orden? ¿Por cuánto tiempo? ¿Cómo expira y se libera? | Transiciones que cubran competencia, abandono, reintentos y confirmación tardía sin sobreventa. |
| D05 | Reembolsos | ¿Se admiten, en qué condiciones y por curso o por orden? ¿Cómo afectan matrícula y cupos? | Política validada y comportamiento definido antes de implementar cancelaciones o reembolsos. |
| D06 | Horarios simultáneos | ¿Se impide matrícula en cursos solapados? ¿Cómo se tratan cambios de horario y zona horaria? | Regla validada y ejemplos de solapamiento, cambios y excepciones permitidas. |
| D07 | Video y ancho de banda | ¿Es viable OBS → SRS → HLS dentro del presupuesto? Faltan bitrate, calidad, latencia tolerada y número de emisiones simultáneas. | Prueba temprana de emisión y reproducción, tráfico medido, limitaciones y estimación sustentada de costo. |
| D08 | Protección HLS | ¿Cómo autorizar manifiestos y cada segmento, con expiración y reglas de acceso definidas? | Pruebas de acceso directo permitido/denegado y permisos vencidos; sin prometer impedir grabaciones. |
| D09 | Alojamiento y presupuesto | Faltan proveedor, región, recursos, almacenamiento, transferencia, HTTPS y tiempo de uso. | Estimación fechada de gasto total de servicios y pruebas que no exceda S/300, con forma de detener consumo al terminar. No contratar en esta etapa. |
| D10 | Criterios de evaluación | Falta la rúbrica del profesor: distribución de 1000 usuarios, duración, carga, latencia, errores y evidencia exigida. | Escenarios y umbrales acordados con el profesor; distinguir matrícula, chat, video y cualquier escenario combinado. |
| D11 | Identidad y permisos: comportamiento definido | Confirmado el 2026-09-23: correo verificado antes del acceso, recuperación por correo con enlace de un solo uso y un único rol por cuenta. Registro público solo de alumnos, gestión administrativa y revocación de sesiones definidos en [identidad](../specs/001-identidad-acceso-roles/spec.md). | Checklist de especificación revisado; lista para planificar, no implementada. El plan validará envío de correo, costo y procedimiento operativo. La pertenencia a cursos se definirá con ese dominio. |
| D12 | Materiales y paneles | Faltan formatos, tamaños, almacenamiento y operaciones mínimas por rol. | Alcance acotado por funcionalidad compatible con el plazo y el presupuesto. |
| D13 | Actualización y recuperación | Faltan ubicación/retención de respaldos, responsables y tiempos aceptables de recuperación. | Procedimiento y restauración comprobada antes de una demo con datos persistentes o publicación. |

## Historial de la decisión de pasarela (D02)

- **2026-09-22:** Culqi se documentó como candidata, sin selección definitiva ni integración.
- **2026-09-23:** el responsable del proyecto elige Izipay para el MVP mediante la instrucción
  de esta etapa. Se conserva la propuesta de un pago por orden como decisión independiente
  todavía pendiente (D01). No se han confirmado condiciones comerciales ni contratado servicios
  en esta etapa. Yape queda pendiente para la modalidad contratada, no prometido como disponible.
- **Impacto:** se actualizan constitución, README y alcance. La futura especificación de pagos
  deberá aislar la integración del proveedor de las reglas de órdenes y matrículas. La
  funcionalidad actual de identidad no depende de Izipay ni incorpora pagos.

## Prioridades

El comportamiento de identidad (D11) está definido y puede pasar a planificación cuando
se solicite. Obtener la rúbrica (D10) e investigar video, protección y alojamiento (D07–D09)
sigue siendo prioritario. Son riesgos que pueden modificar el diseño y el escenario
demostrable dentro del presupuesto; también se deberá validar el costo del correo.

Antes de implementar matrícula y pagos, resolver D01–D06. No sustituir la confirmación del
proveedor por la pantalla de éxito ni omitir transacciones o idempotencia por una decisión
pendiente. D12 se resolverá al especificar materiales/paneles y D13 antes de operar con datos
persistentes en demo o producción.
