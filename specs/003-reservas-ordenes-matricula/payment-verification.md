# Matriz financiera prevista — RP006

**Diseño: cero pruebas implementadas o ejecutadas.** [P01–P07](contracts/payments.md),
[T01–T07](contracts/time.md) y [TV01–TV25](temporal-verification.md). Los IDs PV no
son tareas ni conteos de ejecución. RV001 debe integrar niveles, fixtures y criterios
completos antes de RP007/tareas/análisis. No ejecutar estos ensayos en RP006.

| ID | Nivel futuro | Caso / preparación | Expectativa verificable |
| --- | --- | --- | --- |
| PV01 | UNIT/PG | Pago total auténtico con verificación final antes del límite | Una matrícula por detalle, conversión conjunta, cero plaza adicional, fecha exacta y auditoría atómicas |
| PV02 | UNIT/PG | Verificación final −1µs, igual y +1µs de expiresAt | Solo antes permite APPLIED; igualdad/posterior INCIDENT sin matrícula, gracia o reembolso automático |
| PV03 | PG | Respuesta externa anterior al límite, bloqueo hasta después | Hora final del servidor posterior; incidente, no backdating a receivedAt/externalObservedAt |
| PV04 | PG | Finalizador obtiene locks antes y worker espera | Si t anterior y demás condiciones válidas, conversión; worker luego observa ENROLLED, sin expirarlo |
| PV05 | PG | Worker confirma vencimiento primero | Pago final posterior incidente; cero resurrección de reserva |
| PV06 | PG | Otra solicitud obtiene último cupo liberado | Pago previo solo recibido no recupera la plaza ni sobrevende; RA-02 conserva prioridad |
| PV07 | PG | Recibo técnico pendiente durante vencimiento/reinicio | No nueva retención o fecha final ficticia; recibo conservado y recuperable |
| PV08 | PG | Fallar una matrícula o auditoría tras verificar | Rollback de toda conversión/pago final; recibo técnico previo permanece, cero parcialidad |
| PV09 | PG/HTTP | COMMIT final ambiguo y recuperación | Consultar identidad económica; resultado existente conserva fecha/efecto, sin otro cobro |
| PV10 | PG | Callback y consulta técnica simultáneos del mismo pago | Una identidad económica y aplicación; sin matrículas/incidencias/auditoría repetidas |
| PV11 | PG/HTTP | Eventos duplicados/fuera de orden después de APPLIED/INCIDENT | No revocación, reapertura, cambio de fecha o nueva aplicación; entrega distinta no es pago distinto |
| PV12 | PG | Otro providerPaymentId auténtico para orden ya matriculada | Hecho adicional investigable e incidencia, sin segunda matrícula ni devolución automática |
| PV13 | PG/HTTP | Mismo ID económico con otra orden/importe/moneda | Preservar asociación original, conflicto seguro, sin apropiación de pago ajeno o fuga de datos |
| PV14 | UNIT/PG/HTTP | Hecho auténtico con importe insuficiente/excesivo o moneda incompatible | Conservar valores reales e incidente; sin suma parcial, conversión o diferencia cobrada |
| PV15 | PG/HTTP | Referencia inventada/desconocida frente a recibo auténtico | Sin FK ficticia ni grupos bloqueados arbitrariamente; seguimiento administrativo mínimo, sin adjudicar alumno/orden |
| PV16 | HTTP | Firma/procedencia falsa, callback alterado y éxito del navegador | Sin pago verificado, matrícula o incidente financiero que bloquee oferta; diagnóstico seguro |
| PV17 | PG | Retiro/pérdida de habilitación confirma antes de finalizar pago | Incidente total sin matrícula, plazo intacto; causas privadas no salen al alumno |
| PV18 | PG/E2E | Conversión confirma antes de ocultamiento posterior | Matrículas vigentes e historial conservados; cero revocación automática |
| PV19 | PG | Cancelación válida antes de pago tardío; incidencia primero en otra carrera | Primer caso conserva terminalidad y abre incidencia; segundo bloquea cancelación |
| PV20 | PG | Sustitución docente/textos permitidos frente a finalización | Relectura de visibilidad/revisión; precio/período/franjas originales intactos |
| PV21 | PG/HTTP | Intentos idénticos simultáneos y otra initiationId de misma orden | Un intento canónico no resuelto y una operación externa; replay después de vencimiento/ocultamiento conserva resultado; contenido distinto 409 |
| PV22 | PG/configuración | Caída antes/después de llamada y respuesta perdida | SUBMITTING/INITIATION_UNKNOWN recuperados con misma clave; no reenviar por reinicio/lease. Pausar respuesta de iniciación, finalizar callback y soltar PENDING/UNKNOWN/FAILED: no regresión terminal ni segundo cobro |
| PV23 | UNIT/PG/HTTP | Rechazo definitivo sin fondos y nuevo intento explícito | Solo después de prueba definitiva; plazo/condiciones originales revalidados, sin sanción o renovación |
| PV24 | PG/HTTP | Logout del alumno después de iniciar pago | Procesador SYSTEM no depende de sesión viva; consultar/iniciar otro pago sí exige autorización actual |
| PV25 | PG | Conversión pausada antes de COMMIT cruza expiresAt y llega GET/preview | Lector espera lock y proyecta en sentencia posterior; no disponibilidad transitoria contradictoria |
| PV26 | PG | Lectura paginada descubre referencias nuevas o topología cambiada | Redescubrimiento sin locks tardíos/upgrades; datos finales solo de referencias cubiertas |
| PV27 | HTTP/UNIT web | Errores/DTO por audiencia, rutas técnicas frente a CSRF usuario | Alumnos solo lo propio, docente/visitante denegados; sin secretos/callbacks ni excepción global de seguridad |
| PV28 | PG/E2E | Republicar después de incidencia y registrar seguimiento | No cerrar incidente, cobrar, matricular, extender o liberar por esa acción; guard vigente |
| PV29 | Sandbox separado | Autenticidad, dinero/IDs, idempotencia/consulta y recuperación reales | Evidencia de modalidad Izipay, sin equiparar simulador con proveedor ni someterlo a carga |
| PV30 | PG/E2E | Escenario completo multigrupo, desconexión/reinicio, historial y cupos finales | Estado persistido conciliable sin sobreventa/parcialidad; evidencia humana/automatizada separadas |

PV01–PV20/PV25/PV30 trazan FR-007–014/019/021 y SC-003–005, RE-05–09.
PV21–PV24/PV27/PV28 trazan FR-011/015–018/020 y SC-006/007, RE-01/03/04/10.
PV29 traza FR-024 y principios V–VII; D02/sandbox pendiente. La carga, población,
2500 activos y costo SC-008 siguen VP001–008/D10, sin ejecutarse aquí.

Usar PG real con conexiones y barreras observables, conteos finales y auditoría;
no sleeps como única prueba o helper como sustituto del protocolo. Desglosar variantes
antes/igual/después, carreras en ambos órdenes y repeticiones por zona/proyecto sin
presentarlas como casos únicos adicionales. TV03/TV25 quedan especificados mediante
esta matriz; **ninguno está aprobado por ejecución**.

Pruebas externas usan sandbox y evidencia propia del proveedor; E2E local identifica
simulación. Fallos de imports/config/conexión se corrigen, no cuentan como rojo válido
de negocio. La guía futura sigue conservando entorno manual, cuentas, configuración,
volumen y evidencias históricas. RV001/RP007 e integración/economía/operación/capacidad
mantienen su estado pendiente; esta matriz no los cierra.
