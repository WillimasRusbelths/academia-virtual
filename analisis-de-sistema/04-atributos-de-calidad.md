# 04. Atributos de calidad

Los escenarios son metas verificables, no resultados.
**Soportar 1000 usuarios concurrentes sigue siendo un requisito por validar mediante
pruebas de carga.** No hay evidencia de carga ejecutada; 1000 estudiantes previstos no
equivalen a 1000 sesiones, matrículas, conexiones de chat o reproducciones simultáneas.

| ID / atributo | Fuente del estímulo, estímulo y entorno | Elemento y respuesta esperada | Medida de aceptación y estado |
| --- | --- | --- | --- |
| AC01 · Rendimiento | 1000 cuentas distintas consultan identidad en el entorno de ensayo documentado, con login gradual, consultas `/me` cada 5–10 s y meseta de 10 min. | API de identidad y PostgreSQL sostienen sesiones válidas sin eludir seguridad. | ID-LOAD-01: alcanzar realmente 1000 sesiones; p95 `/me` <500 ms, p99 <1000 ms, p95 login <3 s y errores inesperados <1 %. Umbrales provisionales del plan, pendientes de prueba y rúbrica D10. No acredita capacidad del MVP completo. |
| AC02 · Disponibilidad y recuperación | El operador enfrenta una actualización fallida o pérdida del servicio con datos persistentes en un ensayo aislado. | API/BD se recuperan desde respaldo comprobado en una BD nueva; antes de reabrir se invalidan sesiones/tokens restaurados y entregas pendientes según el plan. | V16: restauración, integridad y reinicio seguro satisfactorios; medir pérdida potencial, RPO y RTO. Límites temporales, responsables y retención operativa final pendientes D13. Sin SLA porcentual ni recuperación demostrada. |
| AC03 · Escalabilidad | Crece gradualmente la carga de alumnos distribuidos entre matrícula, chat y video según un escenario académico que debe acordarse. | Monolito, BD y servicio de medios permiten identificar límites de CPU, memoria, conexiones, bloqueos y transferencia, y ajustar recursos/configuración con evidencia. | Medir carga alcanzada, latencias, errores y recursos; cero sobreventa/duplicados y cero acceso indebido. Distribución, duración y límites de chat/HLS pendientes D07/D10. Objetivo 1000 concurrentes sin prueba; no dimensionar para 10 000 ni extrapolar ensayos separados. |
| AC04 · Seguridad de acceso | Un visitante o alumno/docente intenta acceder directamente a datos privados ajenos, gestión administrativa o clase sin matrícula; se prueba además una sesión revocada. | API, chat y autorización HLS deniegan según permisos actuales; ninguna restricción depende solo de ocultar botones/enlaces. | 100 % de casos no autorizados del conjunto de aceptación denegados sin filtrar datos ni producir efectos; cero aceptación de nuevas operaciones tras revocación confirmada. Identidad V04/V09/V14 y futuros ensayos directos de manifiestos/segmentos; sin verificación funcional todavía. |
| AC05 · Seguridad e integridad de pagos | El proveedor notifica repetida o simultáneamente un pago, con otros intentos alterando importe/moneda o compitiendo por el último cupo. | Pagos valida al proveedor y coordina transacciones con órdenes/matrículas; solo una transición válida produce efectos. | Cero matrículas duplicadas, cero cupos sobrevendidos y cero activaciones por confirmación inválida. Ensayar pagos simulados para carga y sandbox separado para Izipay. Pendiente de reglas D01–D06 e implementación. |
| AC06 · Mantenibilidad | El desarrollador modifica un caso de uso o sustituye el adaptador de pagos/correo. | Reglas de negocio permanecen independientes de HTTP, Prisma y proveedores; la raíz de composición conecta adaptadores y los módulos usan contratos públicos. | Lint rechaza importaciones prohibidas; pruebas de reglas permitidas/denegadas y regresión afectada pasan. T009 y harness T010 tienen evidencia local parcial; la sustituibilidad de integraciones y módulos aún inexistentes no está demostrada. |
| AC07 · Disponibilidad ante fallo de correo | SMTP deja de responder después de admitir una solicitud de verificación/recuperación. | La entrega persistida se reintenta por ejecutor interno con cuotas y vencimiento; la cuenta sigue protegida y la respuesta no afirma entrega. | Tras reiniciar, no perder entregas vigentes ni habilitar acceso indebidamente; enlaces caducados/consumidos no funcionan. V02/V10/V11/V13/V15 pendientes. SMTP podría entregar dos veces el mismo enlace; su consumo debe ser único. |

## Evidencia existente y pruebas pendientes

La [compatibilidad V00](../ops/docker/compatibility.md) registra builds, pruebas mínimas
de Nest/React, transacción/rollback PostgreSQL y Argon2/SMTP local. Los informes
[T009](../ops/local/architecture.md) y [T010](../ops/docker/test-harness.md)
describen los límites de importación y el soporte de pruebas del esqueleto.
No constituyen aceptación funcional de estos escenarios. Los resultados actuales están en
[verificación Docker](../ops/docker/verification.md). Persisten avisos de auditoría de dependencias.

Reutilizar [verification.md](../specs/001-identidad-acceso-roles/verification.md) para
ID-LOAD-01/02 y V01–V16. ID-LOAD-02 mide por separado el costo de autenticación con
10/25/50/100 usuarios virtuales; no exige 1000 logins simultáneos. SC-008 mide 19 de
20 accesos secuenciales con inicio visible en menos de 3 s; tampoco demuestra concurrencia.

Para el MVP completo, el [alcance](../docs/alcance-mvp.md#evidencia-requerida-para-la-capacidad)
exige ensayos diferenciados de matrícula, Socket.IO y consumo real de segmentos HLS.
Cada informe debe incluir revisión de código y cambios locales, configuración/scripts,
infraestructura, generador, duración, concurrencia real, RPS cuando aplique, percentiles,
errores, recursos y consistencia. Un escenario combinado requiere su propia medición.
La elección vigente de video es YouTube Live con OBS (DEC01). Los controles de acceso
y escenarios de consumo de medios deben validar su compatibilidad con el proveedor;
no se acredita autorización del video por autenticar la página o esconder un enlace.
Las metas finales se acuerdan con el profesor en D10 y permanecen pendientes de validación.
