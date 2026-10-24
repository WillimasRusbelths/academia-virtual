# Planificación vigente: reservas, matrícula y capacidad

Actualización confirmada por el responsable: **2026-10-23**, America/Lima.
Rama documental: `docs/planificacion-reservas-capacidad`, desde `eafae88` de
`feat/002-oferta-academica`, sin cambios pendientes iniciales. No es un nuevo spec
de implementación. [Tareas futuras](tasks.md), [alcance](../alcance-mvp.md),
[decisiones](../decisiones-pendientes.md) y [constitución](../../.specify/memory/constitution.md).

## Requisitos confirmados y magnitudes distintas

| ID | Requisito | Comprobación futura; estado actual |
| --- | --- | --- |
| RC-01 | Al menos **15 000 cuentas registradas** | Población persistida, tamaño/índices y operaciones verificadas con datos ficticios; no significa sesiones abiertas. No se generan esas cuentas en este bloque. |
| RC-02 | Objetivo de **2500 usuarios concurrentes activos** | Definir ventana de actividad y mezcla de recorridos con D10; medir usuarios distintos realmente activos. Sin evidencia de cumplimiento. |
| RC-03 | El alumno reserva un cupo antes de pagar | Confirmación atómica de reserva por servidor; un intento, una selección en UI o una petición en cola no constituye reserva confirmada. Aún sin implementar. |
| RC-04 | Reserva de **24 horas exactas** desde su confirmación por servidor | Persistir confirmedAt y expiresAt=confirmedAt+86 400 segundos, instantes UTC; no desde apertura de pantalla, clic, creación previa de orden o llegada a una cola. No se reinicia al reintentar, reconectar o reiniciar el servicio. |
| RC-05 | El pago verificado confirma matrícula | Validar proveedor, orden, importe/moneda e identidad del pago; transición idempotente. Pantalla de éxito no basta. La resolución en límite/tardía requiere decisión específica. |
| RC-06 | Vencimiento sin pago libera cupo mediante conciliación consistente | Coordinar confirmación de pago, vencimiento y reasignación sin sobreventa/doble liberación. Definir autoridad temporal y resolución de carreras antes de implementar; un worker retrasado no extiende las 24 h. |
| RC-07 | Presupuesto **S/300 total** | Sumar VPS, dominio/HTTPS cuando tenga costo, respaldos, tráfico, correo, pagos y pruebas durante el tiempo contratado. No mensual, sin contratación ahora. |

**Solicitudes simultáneas** son peticiones en vuelo observadas en API/BD; un usuario
puede no tener ninguna mientras lee, o generar varias. Se reportarán por separado de
usuarios, VU y RPS. **Capacidad de reservas** comprende inventario por grupo, reservas
confirmadas/activas, matrículas que consumen plaza y tasa/latencia de confirmación.
No equivale a 2500 plazas, 2500 conexiones PostgreSQL ni a capacidad configurada.
Oferta 002 conserva PA-04: entero 1–50 por grupo, sin ocupación/disponibilidad ficticia.

Invariantes a especificar/probar: inventario nunca negativo ni sobrevendido; no contar
una misma plaza dos veces al convertir reserva en matrícula; repetir una intención o
notificación no duplica efectos; liberar una reserva una sola vez. La identidad de
reserva/matrícula y el ámbito curso/grupo se aprobarán en el futuro spec (D01/D03/D04).

## Decisiones todavía abiertas

RC-04 cierra únicamente la duración. No se atribuye aprobación a estas alternativas:

| ID | Decisión pendiente | Preguntas para aclaración; bloqueo |
| --- | --- | --- |
| RA-01 | Varios cursos y orden | ¿Reserva conjunta atómica o parcial? ¿Un pago total o pagos por curso? ¿Cómo se reparte/cancela una orden parcial? D01/D04; bloquea agregado/atomicidad de la orden. |
| RA-02 | Orden de llegada | ¿FIFO, sorteo, turnos u otra regla? ¿Qué instante y desempate decide prioridad? D14: no hay política FIFO aprobada ni promesa de justicia de los locks. |
| RA-03 | Pago en límite/vencimiento | ¿Tiempo de autorización del proveedor, captura, verificación o recepción? ¿Qué pasa con una notificación recibida exactamente al vencimiento o después? Aprobar comparación temporal y conciliación, sin tolerancia inventada. |
| RA-04 | Reembolsos y pagos tardíos | ¿Reintegrar, conciliar manualmente, ofrecer otra plaza u otra resolución si el cupo se reasignó? No confirmar ciegamente una matrícula ni prometer reembolso automático. D02/D05. |
| RA-05 | Cancelaciones y cambios | ¿Quién cancela reserva/orden/matrícula? ¿Qué pasa si el administrador cancela un grupo con reservas o pagos? ¿Cambios de grupo/horario? D03/D05/D06; la cancelación editorial terminal de 002 no resuelve sus efectos económicos. |
| RA-06 | Bloqueo abusivo de cupos | D15: ¿límite por alumno, grupo, tiempo, reservas reiteradas o penalizaciones? ¿Excepciones y recuperación? No se imponen cuotas ni sanciones de negocio aquí. Las protecciones de identidad existentes permanecen. |

La conciliación debe cerrar RC-06 sin modificar RC-04: distinguir vencimiento de la
reserva, instante del pago y momento de conocerlo. No hay decisión aprobada sobre
extender, retener o volver a asignar una plaza durante incertidumbre. Esto es un bloqueo
de diseño de matrícula, no un permiso para debilitar la reserva de 24 h o sobrevendérsela
a otro alumno. Se necesitan escenarios resueltos y verificables en RA-03/RA-04.

## Escenarios obligatorios del futuro spec

| ID | Escenario | Resultado exigido o decisión necesaria |
| --- | --- | --- |
| RE-01 | Doble clic, reintento por timeout, duplicado simultáneo | Misma intención no reserva ni cobra dos veces; persistencia de idempotencia y unicidad de negocio según RA-01. |
| RE-02 | Dos alumnos compiten por el último cupo | Como máximo uno obtiene esa plaza; respuesta y estado final transaccionales, sin depender del frontend. Prioridad según RA-02, pendiente. |
| RE-03 | Desconexión antes/después del commit o respuesta perdida | Consultar resultado existente de forma autorizada; desconectar no cancela ni reinicia las 24 h. No reenvío ciego ni duplicación. |
| RE-04 | Reinicio de API/BD/conciliador | Plazo e intención persistidos, reconciliación reanudable y efectos una sola vez; no cron exclusivo en memoria del proceso o navegador. |
| RE-05 | Instante anterior, exacto y posterior a 24 h | Fecha límite calculada por servidor, no por zona de horarios America/Lima. Aprobar comparación/precedencia de pago en RA-03; controles de reloj para pruebas, sin cambiar duración del producto. |
| RE-06 | Reserva vencida sin pago, proceso retrasado o repetido | Liberación correcta/idempotente, inventario final reconciliado; el retraso de limpieza no convierte una reserva vencida en vigente. Política detallada pendiente. |
| RE-07 | Pago duplicado, fuera de orden o alterado | Verificación de autenticidad/orden/importe/moneda; no doble matrícula/doble consumo, rechazo de alteración. Sandbox separado, no proveedor real durante k6. |
| RE-08 | Pago al vencer, tardío o confirmado antes pero notificado después | Aprobar RA-03/RA-04 y demostrar ambos órdenes de carrera con barreras y estado final; no sustituir decisión con hora del navegador. |
| RE-09 | Cancelación de grupo con reserva/orden/pago | Conservar historial, no borrar efectos; aplicar RA-05 aprobada sin asumir reembolso ni traslado automático. Respetar cancelación terminal de oferta. |
| RE-10 | Reservas masivas, reiteradas y acceso no autorizado | Probar RA-06 aprobada y permisos vigentes; sin bloquear cupos por una petición rechazada ni filtrar datos de otros alumnos. |

## Dirección técnica y evaluación de capacidad

**Propuesta**, todavía sin despliegue/contratación: mantener NestJS, PostgreSQL y el
monolito modular; preparar VPS con HTTPS, recuperación y acceso controlado en apertura
de matrícula. La admisión/espera debe medirse y especificarse: no garantiza un cupo,
no confirma reserva y no decide orden de llegada. No añadir otro stack, Redis,
microservicios o balanceadores sin evidencia. AWS queda para evaluación posterior
según mediciones y presupuesto; no se adopta, configura ni implementa infraestructura.

Antes de contratar: recursos/tiempo/tráfico/costos fechados, mecanismo de detención
del gasto, D13 y plan de protección de datos. No se afirma que S/300 permita sostener
2500 activos ni operación permanente. No se elige proveedor/tamaño por intuición.

Validación futura **en VPS con k6 desde otro equipo físico**: registrar origen/destino,
RTT/red, cuotas efectivas, versiones/commit, población ficticia, ventanas/mezcla,
RPS y solicitudes en vuelo, sesiones/usuarios distintos activos, reservas/matrículas,
latencias/errores, CPU/RAM/disco/IO, pool/locks, ancho de banda y conciliación final.
Separar recursos del generador, servidor y observadores. Una VM/otro contenedor en la
misma laptop no demuestra ausencia de contención del generador. Escalar solo con
autorización/mediciones; umbrales, rampas y mezcla de 2500 siguen pendientes de D10.
No reutilizar sin revisión los umbrales de identidad como aceptación de matrícula.

Preparar ruta segura y explícita para destino remoto autorizado; los clientes históricos
apuntan deliberadamente a la red interna local, no deben redirigirse a producción ni
desactivar guardas para cargar un VPS. Los pagos de carga son simulados; prueba del
adaptador Izipay aparte en sandbox. Video/chat necesitan escenarios propios; no se
infiere su capacidad desde reservas o sesiones ni se exige 2500 reproducciones por defecto.

## Base comprobada y continuidad

Identidad: **T103 [x] ejecución/informe; capacidad sin aprobar**. Conservadas sin edición
las evidencias [carga](../../specs/001-identidad-acceso-roles/evidence/load.md),
[recursos](../../specs/001-identidad-acceso-roles/evidence/load-resources.md) e
[investigación](../../specs/001-identidad-acceso-roles/evidence/load-investigation.md),
perfiles 1000 sesiones y 10/25/50/100 autenticación, datos privados y umbrales históricos.
No convertirlos a 2500 o reclasificar fallos como éxito. T104 [ ] exige diez personas,
≥9/10 registro/verificación y recuperación sin ayuda en <180 s activos por flujo,
espera de correo separada. T108 [ ] depende de T104/T107 y conserva aceptación preliminar.
Bootstrap intermitente sigue abierto aunque una regresión pase; no se afirma causa resuelta.
SMTP real, D10/rúbrica y D13/operación continúan pendientes. [Aceptación histórica](../../specs/001-identidad-acceso-roles/evidence/acceptance.md).

Oferta: `feat/002-oferta-academica` conserva `eafae88`, PA-01–PA-05/E1 y
[tasks.md](../../specs/002-oferta-academica/tasks.md): T001–T034/T036–T038 completas;
Esa es la base histórica previa al bloque de continuidad. El merge `b0af757` conserva
ambos historiales (`eafae88` y `061b183`); T035/T039–T041 quedan verificadas según
[evidencia](../../specs/002-oferta-academica/evidence/t039-t041.md). El
[checkpoint T042](../../specs/002-oferta-academica/evidence/us2.md) aprueba la verificación
automatizada US2 y su regresión; T043–T074 permanecen pendientes, incluida la
observación humana SC-002/T073. Siguen las pruebas de US3 T043–T047. No se incorporan
reservas, órdenes, matrícula o pagos al spec 002.
Aquí no se cambia su plan ni sus
checklists/criterios históricos de constitución 1.1.0; la enmienda 1.2.0 gobierna el
trabajo nuevo y no invalida ni amplía lo demostrado anteriormente.
La etapa documental no fusionó ramas. El bloque posterior de continuidad incorporó
el commit mediante merge para que la constitución vigente acompañe la implementación;
el checkpoint histórico de oferta permanece referenciado y conservado.

Propuesto para después: spec `003-reservas-ordenes-matricula` (confirmar numeración
libre al crearlo con Spec Kit). No se crea esa carpeta/rama, ni un plan de implementación
o migración en este bloque. El backlog de este documento no sustituye specify/clarify/
plan/tasks/analyze de esa funcionalidad ni habilita implementar decisiones abiertas.

## Enmienda constitucional y verificaciones de este bloque

Constitución **1.1.0 → 1.2.0 MINOR** por ampliación de IV/XI, métricas, restricciones
y validación; sin eliminar principios. Ratificación 2026-09-22 conservada. Aprobación de
requisitos: solicitud explícita del responsable del 2026-10-23. Rúbrica del profesor
pendiente; no se presenta el nuevo objetivo como capacidad validada. El comentario
temporal de sincronización se revisa y retira antes del commit; este registro perdura.

Se ejecutan solamente `smoke-sessions` y luego `smoke-authentication`, con el harness
existente en `identity-load-80c2b6fa22ce`. Resultados, recursos y límites reales en
[evidencia de smokes](evidence/2026-10-23-smokes.md). No ejecutar perfiles completos.
El perfil independiente [followup-local.js](../../load-tests/identity/followup-local.js)
queda preparado para **10 y 25 VU, dos minutos por nivel**, sin ejecución de carga.
Es seguimiento de autenticación/identidad, no reservas ni prueba de 2500; conserva
seguridad, cuotas, clientes y perfiles históricos. Su ejecución futura exige guardas,
medición/limpieza dirigida y autorización; el runner histórico no cambia de escenarios.
