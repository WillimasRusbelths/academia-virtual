# Matriz temporal prevista — RP005

Diseño de comprobaciones, **cero casos implementados o ejecutados** en RP005.
[Contrato temporal T01–T07](contracts/time.md), [plan](plan.md) y
[guía local](quickstart.md). Los IDs TV son casos de diseño, no tareas nuevas ni
marcas de aceptación. RP006 añade P01–P07/PV01–PV30; RV001 integrará la matriz completa.

| ID | Nivel futuro | Preparación / acción | Expectativa verificable | Trazabilidad |
| --- | --- | --- | --- | --- |
| TV01 | UNIT | Confirmación con seis fracciones | expiresAtUs − confirmedAtUs = 86_400_000_000n, sin redondeo ni día civil | T01/03; FR-004; SC-001 |
| TV02 | UNIT/PG | t=expiresAt−1µs, igual y +1µs | Solo el primero vigente; igualdad/posterior vencidos | T01/03; FR-004/009; RE-05 |
| TV03 | UNIT/PG | Fin de verificación −1µs, igual y +1µs del vencimiento | Comparación estricta; resultado financiero diseñado en P05/PV02–PV03, ejecución pendiente | T03/07; FR-007; RE-05/08 |
| TV04 | UNIT/PG | Nueva reserva −1µs, igual y +1µs de medianoche inicial Lima | Solo antes permite confirmar; consulta/admisión anterior no evita rechazo | T02/03; FR-001; SC-001 |
| TV05 | UNIT/PG | Fin original de matrícula −1µs, igual y +1µs | Vigente solo antes; historial conservado | T03; FR-008; SC-003 |
| TV06 | PG | Bloquear grupo hasta cruzar el corte de inicio | Captura después de espera; rechazo total, ningún confirmedAt anterior reutilizado | T02; FR-001/010; RE-02 |
| TV07 | PG/UNIT | Leer/guardar/serializar instantes separados 1µs, incluido epoch negativo fraccionario | Round-trip exacto y acarreo correcto de .999999 al siguiente segundo; no Date intermedio ni parser global. Infinitos/no finitos/más de seis decimales se rechazan sin redondeo | T01; FR-004/007 |
| TV08 | UNIT/PG | Fin de mes/año, bisiesto y rango civil 0001/9999 | Calendario válido, incluidos epoch negativos; fecha final 9999-12-31 admite límite exclusivo ampliado +010000, sin saturación | T03; FR-008/021 |
| TV09 | UNIT/PG | Mismos casos con procesos UTC y America/Lima | Mismos instantes/decisiones; son repeticiones de casos, no casos nuevos | T01/03; RE-05 |
| TV10 | PG | Rollback después de capturar t y nuevo intento | Cero reserva confirmada por rollback; nuevo t solo para intento no confirmado, mismo presupuesto | T02; FR-004/011 |
| TV11 | PG/HTTP | Respuesta perdida o COMMIT ambiguo | Recuperar intención/orden; cero nueva reserva/plazo si ya existe resultado | T02/06; FR-011/018; RE-03 |
| TV12 | PG | Reiniciar antes y después de COMMIT | Redescubrimiento o resultado confirmado, respectivamente; instantes originales conservados | T02/06; FR-018; RE-04 |
| TV13 | PG/HTTP | Worker detenido más allá del vencimiento | Consulta/disponibilidad usan tiempo efectivo; no gracia por retraso ni estado materializado antiguo | T04/06; FR-002/009; RE-06 |
| TV14 | PG | Dos workers normalizan misma orden | Una transición/revisión y una auditoría ORDER_EXPIRED; cero doble liberación | T05/06; FR-009/019; RE-06 |
| TV15 | PG | Orden de varios grupos y fallo de auditoría | Orden/reservas/resultado/auditoría se confirman juntos o cero cambios parciales | T05; FR-010/019; SC-005 |
| TV16 | PG | Orden ENROLLED con reservas CONVERTED; orden EXPIRED; orden RESERVED aún no vencida con resultado NOT_DUE | Sin reversión ni auditorías de expiración repetidas; no afecta matrículas y no inventa estados de orden | T05; FR-009/019 |
| TV17 | PG | Nueva selección no incluye grupos de la orden anterior vencida | Bloquear/normalizar todos los anteriores; UNIQUE parcial no impone esperar worker; nueva selección revalidada | T05; FR-020; RE-10 |
| TV18 | PG | Worker y normalización oportuna concurrentes; normalizar anterior al confirmar nueva selección | Misma operación/identidad de efecto; normalización oportuna y reserva nueva comparten token temporal tras locks de la unión, sin segunda captura ni parcialidad | T05/06; FR-009/010 |
| TV19 | PG | Cambiar topología, 40001, 40P01 y 55P03 | Redescubrimiento/presupuesto único para abortos conocidos; 55P03 no obtiene bucle inmediato extra | T06; FR-010/022 |
| TV20 | UNIT/PG | Candidata fallida, varias páginas y entrada continua de vencidas | Horizonte fijo acota cada barrido; cursor avanza por examinada aunque falle y revisita fallidas al reiniciar. Sin transacción conjunta ni cambios RA-02 | T06; FR-009/012 |
| TV21 | UNIT/configuración | Tick simultáneo, cierre y pool pendiente | Single-flight, timer detenido, esperar trabajo antes de cerrar pool; sin nuevo proceso/lease | T06; FR-018/022 |
| TV22 | HTTP/E2E | Alterar reloj/zona cliente, recargar y volver a acceder | Plazo servidor intacto; recuperar solicitud/orden; no reenvío automático ni éxito por contador local | T02/04; FR-017/018; RE-03 |
| TV23 | PG/HTTP | Ocultar/republicar oferta o cambiar fechas después del historial | Cero renovación; período/límite original histórico intacto, no reactivación | T03/05; FR-021; RE-09 |
| TV24 | UNIT/PG/operación | Retroceso de reloj detectado y estado terminal previo | Fallo seguro sin cambiar expiresAt ni reactivar; no afirmar detección universal o 24h físicas ante reloj no confiable | T07; FR-004/022; D13 |
| TV25 | PG/HTTP | Recibo técnico pendiente o finalizador frente a expiración/reasignación | P01/P05/P06 y PV03–PV10 definen atomicidad/carreras; sin retención extra, ejecución pendiente | T07; FR-007/009/013; RE-07/08 |

En cada caso registrar preparación, versión, descubrimiento real, aserciones alcanzadas,
estado final y limitaciones. UNIT prueba reglas puras; integración usa PostgreSQL y
autorización reales con barreras observables. Un helper/scheduler controlado aprobado
no demuestra el protocolo académico. Errores de conexión/import/sintaxis/configuración
se corrigen y se separan de fallos esperados del comportamiento.

Los grupos antes/igual/después son variantes que deberán desglosarse al preparar
pruebas; estos 25 IDs no son una afirmación de 25 tests ejecutados. Separar casos
únicos de repeticiones por zona/proyecto. No acortar las 24 horas del producto para
probar límites: reloj controlado en test no acredita un ensayo operacional de 24 h.
Las referencias esperadas de conversión civil se contrastarán con fixtures revisadas
y versión de tzdata, evitando que una aserción copie simplemente la misma fórmula
de la implementación. TV25 y el resultado completo de TV03 se diseñan en
[P01–P07](contracts/payments.md) y [PV01–PV30](payment-verification.md), sin ejecución.

No ejecutar estos ensayos, smokes, perfiles 10/25 ni cargas durante RP005. Integración
Izipay/sandbox, economía antes de cobros reales, D10/capacidad, D13, bootstrap y
aceptaciones humanas de 001/002 permanecen pendientes.
