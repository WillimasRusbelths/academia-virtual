# Contrato de interfaz previsto — RP004

Diseño futuro de cuatro historias. [Spec](../spec.md), [HTTP](api.md),
[integración](integration.md). Sin páginas implementadas en este bloque.

## Composición y navegación

Feature `apps/web/src/features/enrollment/`; recibe ApiClient y navegación desde app.
No importa internos de identidad/oferta; componentes y tipos realmente compartidos
se extraen a shared solo si tienen consumidores demostrados. El router enlaza oferta
publicada con selección y compromisos propios; administración dispone de precios y
seguimiento. Docente no ve acceso financiero; backend deniega aunque use URL directa.

Rutas UI previstas: `/reservar`, `/mis-ordenes`, `/mis-ordenes/:id`,
`/mis-matriculas`, `/mis-matriculas/:id`, `/admin/precios`, `/admin/compromisos` y
`/admin/incidencias/:id`. Las rutas 002 siguen funcionando y el docente conserva
`/mis-grupos`, sin atribuirle consulta financiera o permiso de matrícula.

## US1 — Seleccionar y reservar

1. Desde oferta/Inicio abrir selección de grupos visibles. Mostrar curso/grupo,
   período/franjas America/Lima, docente por nombre, precio PEN explícito y capacidad
   máxima separada de retenciones/ocupación/disponibilidad reales con instante evaluado.
2. Elegir un grupo por curso. Mostrar vacíos y precio sin definir, sin asumir cero.
   Previsualizar conjunto/desglose/total mediante selection-preview; mostrar que es
   orientativo, sin prioridad, precio congelado o reserva. La UI no es autoridad
   monetaria y la confirmación revalida condiciones/precios.
3. Confirmación explícita crea intentionId estable en memoria. Enviar selección;
   respuesta ADMITTED muestra «Solicitud admitida; todavía no tienes reserva».
   No cuenta atrás de 24 h, mensaje de cupo asegurado ni botón de pago en esta etapa.
4. Consultar estado propio hasta decisión, sin repetir automáticamente la mutación.
   CONFIRMED abre orden con referencia/inicio/vencimiento; REJECTED muestra motivo
   seguro, cero reserva parcial y permite preparar nueva selección/intención.
5. Si llega el corte de inicio o cambian visibilidad/cupo/horarios mientras espera,
   la confirmación puede rechazarse. Consulta anterior no da prioridad ni asegura plaza.

## US2 — Orden y pago

Orden conserva detalle/precio originales y plazo exactamente confirmado. Mostrar
`serverNow` para orientar el contador; reloj local solo ayuda visual, no decide vigencia.
No recalcular inicio desde apertura, sesión, clic o recepción de respuesta.

Iniciar pago es acción explícita recuperable. Distinguir inicio pendiente, pago sin
verificar, matrícula confirmada, vencimiento y «Pago en conciliación, sin matrícula».
Redirección exitosa del proveedor nunca confirma matrícula por sí sola.

Si algún grupo está oculto: indicar que el pago/confirmación de la orden completa no
están permitidos, conservar consulta y plazo, sin causas privadas. Republicación
explícita puede habilitar pagar el plazo restante, sin ofrecer otras 24 h ni resolver
incidencias o iniciar otro cobro por ese hecho. Matrículas anteriores siguen consultables.

El camino de proveedor real permanece bloqueado hasta D02/RP006 y política económica
aprobada. La demostración con fixtures identifica claramente pagos simulados; no se
presenta como integración o cobro real ni se publica un botón de simulación en producción.

## US3 — Vencimiento y recuperación

Al consultar al llegar al límite, usar estado del servidor: la reserva no retiene
plazas después del vencimiento aunque el proceso de materialización vaya retrasado.
Cerrar navegador o reiniciar servicio no modifica el plazo. La pantalla no libera
plazas ni confirma pago localmente.

Tras vencer sin pago válido se permite preparar otra intención según condiciones
actuales, sin penalización ni espera extra por abandono y sin prometer cupo. Repetir
la intención anterior muestra su resultado original. Sin acciones de cancelación o
modificación voluntaria de reservas/órdenes/matrículas confirmadas.

Resultado incierto: mantener la intención en memoria mientras sigue la vista; ofrecer
consulta y repetición manual idéntica, sin reescribir selección ni reemplazar la
identidad para «probar otra vez». Cambiar selección requiere intención nueva y puede
ser rechazado si ya hay una orden vigente. Salir no garantiza que la petición falló.

Logout/sesión perdida limpia datos e intenciones privadas y descarta respuestas tardías.
Tras acceder de nuevo se consultan solicitudes propias pendientes/históricas y órdenes;
se recupera la intención desde el servidor sin reenviar la mutación. No
guardar tokens, datos financieros privados o intención en localStorage para replay.

## US4 — Consulta y seguimiento

Alumno: listas propias, orden vigente, antecedentes y matrículas con vigencia derivada
de fechas originales. Oferta retirada no elimina esos datos ni habilita datos ajenos.

Administrador: precio por curso con revisión; consulta de compromisos/incidencias
necesarios y seguimiento append-only. Texto visible distingue «seguimiento registrado»
de «incidencia resuelta»; anotar no cambia plazo, reserva, matrícula, dinero o bloqueo.
Sin acciones de confirmar pago/matrícula, devolución, traslado o liberación manual.

Gestión de oferta: con bloqueantes, permitir solo nombre/descripción/docente siguiendo
retiro antes de editar y revisión/publicación explícitas; informar de bloqueo seguro
para período/horarios/capacidad/cancelación. Relación curso/grupo sigue inmutable.
Solo historial finalizado no bloquea; editar/republicar no reactiva ese historial.

## Estados, accesibilidad y validación

En cada vista: carga, vacío, validación asociada al campo, error recuperable, acceso
denegado y resultado incierto. Conservar entradas en conflicto de revisión; consultar
datos guardados para comparar, sin sobrescribir ni adoptar otra revisión automáticamente.
Evitar doble envío visual sin atribuir a ello idempotencia backend.

Tab/Shift+Tab, foco tras confirmación/error, encabezados y labels claros, avisos
anunciados accesiblemente; no depender solo del color. Verificar móvil/escritorio,
sin scroll que oculte confirmaciones o botones de consulta. Fechas civiles Lima y
plazo transcurrido se presentan con significado distinto, sin confundir UTC con otra
regla académica. No inventar umbrales humanos o participantes para SC-007.
