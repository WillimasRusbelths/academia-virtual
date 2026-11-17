# Revisión preliminar de aceptación — 004 / preparación T068

2026-11-17, America/Lima. **Aceptación integral pendiente. T068 no completada.**
Este archivo revisa la evidencia disponible; su nombre no acredita aceptación.
T001–T064 y T067 completadas, **65/68**, tres pendientes. T064: resultado global favorable en laptop comunicado por el responsable; móvil no observado y teclado sin desglose. T065/D13 y T066/D10 preparadas sin acuerdos o ensayo externo. T067 sincronizada tras repetición humana favorable del PDF.
No hay nuevas pruebas funcionales ejecutadas en esta revisión documental.

## Evidencia histórica revisada

| Bloque | Resultado real conservado | Límite |
| --- | --- | --- |
| US1/US2/US3 | [US1](us1-checkpoint.md), [US2](us2-checkpoint.md), [US3](us3-checkpoint.md): recorridos automáticos por audiencia y mantenimiento | No aceptación humana |
| T060 | [Automático transversal](automated.md): API 3961 casos aprobados en 171 archivos, cobertura compuesta y focal final 687/687; web 614/614, E2E real 42/42; tipos/lint/builds aprobados | No corrida remota de CI ni capacidad |
| T061–T062 | [Recuperación](recovery.md): cinco fases aprobadas, upgrade 0007→0009, dos procesos, cifrado/restore a otra BD, hashes completos, estados/autoría/permisos/sesiones y dos decisiones posteriores revisadas | Mismo servidor/host, sin custodia externa o RPO/RTO aceptados |
| T063 | [Recursos locales](local-resources.md): un caso integrado con siete ventanas; transferencias 20 MB, buffers/RSS, BD/WAL/disco/backup, cliente lento, plazas y rollback inyectado | Corpus compresible, generador en misma VM, sin capacidad 2500 |
| T064 | [Registro humano](human-acceptance.md): confirmación global favorable en laptop tras corregir PDF | Reporte del responsable; sin observación directa, móvil no observado y teclado sin desglose |
| T065–T066 | [Preparación operativa/capacidad](t065-t066-report.md) | Responsable confirma acuerdos/referencias aún no disponibles |

La revisión reutiliza resultados de esos bloques y contrasta sus hashes. No suma
ejecuciones solapadas como casos nuevos, no convierte un rojo histórico corregido
en fallo vigente, ni omite los incidentes y correcciones registrados originalmente.
Resultado y cadena de hashes: [t067-t068-results.json](t067-t068-results.json).

## Los 20 requisitos funcionales

«Verificado automáticamente en alcance local» describe evidencia de pruebas,
sin aceptación integral o generalización a infraestructura no medida.
La [matriz original](../verification.md) conserva suites y tareas exactas.

| ID | Alcance revisado | Familias | Estado de evidencia | Fuente |
| --- | --- | --- | --- | --- |
| FR-001 | Grupo único e inmutable; sin compartir implícitamente | MV01,MV02 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-002 | Permisos actuales de gestor y grupo cancelado | MV02,MV06 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-003 | Archivo, título y descripción tratados como texto | MV01,MV03 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-004 | PDF/JPEG/PNG compatibles, límite decimal | MV01,MV03 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-005 | Completado atómico, fallo sin pérdida previa | MV03,MV09 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-006 | Preparado/publicado/retirado y publicación explícita | MV01,MV08 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-007 | Alumno con matrícula propia vigente, solo publicado | MV02,MV07 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-008 | Autorización en cada solicitud, incluida referencia directa | MV02,MV06,MV10 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-009 | Fin original exacto y oferta/docente sin revocación implícita | MV07 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-010 | Proyecciones mínimas por audiencia | MV02,MV10 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-011 | Editar textos y retirar sin borrar historial | MV05,MV08 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-012 | Archivo/grupo/autor originales inmutables | MV05,MV08 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-013 | Idempotencia, replay y conflicto de identidad | MV04,MV05 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-014 | Revisión obsoleta y revalidación concurrente | MV05,MV06 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-015 | Estados UI, conflicto e incertidumbre recuperables | MV04,MV11 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-016 | Teclado/computador/móvil y descarte de sesión anterior | MV11,MV13 | Automatizado local; confirmación global en laptop, móvil no observado y teclado sin desglose | [T060](automated.md) |
| FR-017 | Auditoría atribuible y registros sin secretos | MV05,MV10,MV12 | Verificado automáticamente en alcance local | [T060](automated.md) |
| FR-018 | Reinicio y recuperación conjunta de archivos/registros | MV09,MV12 | Restore local aprobado; alcance operativo D13 pendiente | [recovery](recovery.md), [recursos](local-resources.md) |
| FR-019 | Preservación y contratos de 001–003 | MV07,MV10,MV12 | Preservación revisada; sincronización T067 completada | [T060](automated.md), [hashes de revisión](t067-t068-results.json) |
| FR-020 | Datos ficticios, separación y puertas operativas | MV12,MV13 | Separación técnica verificada; D10/D13 pendientes | [recursos](local-resources.md), [operación](../operation.md), [capacidad](../capacity.md) |

## Los siete criterios de éxito

| ID | Alcance revisado | Familias | Estado de evidencia | Fuente |
| --- | --- | --- | --- | --- |
| SC-001 | Preparación/publicación/descarga de los tres formatos | MV01 | Verificado automáticamente en alcance local | [T060](automated.md) |
| SC-002 | Matriz de denegaciones sin datos ajenos | MV02,MV06,MV10 | Verificado automáticamente en alcance local | [T060](automated.md) |
| SC-003 | 20 000 000 admitido; inválidos sin pérdida/parcialidad | MV03,MV09 | Verificado automáticamente en alcance local | [T060](automated.md) |
| SC-004 | Efectos únicos y conflictos recuperables | MV04,MV05 | Verificado automáticamente en alcance local | [T060](automated.md) |
| SC-005 | Retiro, permiso y fin exacto de matrícula | MV07,MV08 | Verificado automáticamente en alcance local | [T060](automated.md) |
| SC-006 | Recuperación al punto respaldado con bytes y permisos | MV12 | Restore local aprobado; alcance operativo D13 pendiente | [recovery](recovery.md), [recursos](local-resources.md) |
| SC-007 | Recorrido de gestor/alumno reales y modalidades observadas | MV11,MV13 | Consentimiento y recorrido global favorable en laptop comunicados; sin observación directa, móvil no observado y teclado sin desglose | [protocolo humano](human-acceptance.md) |

## Los 19 escenarios de historias

Todos los escenarios siguientes tienen cobertura automatizada local registrada
en T060 y los checkpoints de cada historia. La observación humana transversal
SC-007/MV13 tiene confirmación global en laptop, sin desglose por escenario; E2E conserva su evidencia separada. Se conserva el oráculo concreto
de verification.md, sin convertirlo en una declaración de resultado humano.

| ID | Suite/familia | Oráculo revisado | Evidencia y alcance |
| --- | --- | --- | --- |
| US1.1 | upload, management; MV01 | Archivo completo PREPARED, grupo/autor correctos, alumno denegado | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US1.2 | upload, management; MV01,MV08 | Confirmar publish produce PUBLISHED y solo alumno vigente accede | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US1.3 | upload, management; MV01,MV02 | ADMIN prepara/publica sin ser docente; atribución conserva actor | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US1.4 | authority, upload-security; MV02,MV06 | Visitante/alumno/docente ajeno/inhabilitado sin filas ni filtraciones | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US1.5 | format, management UI; MV03,MV11 | Vacío/truncado/tipo/tamaño inválidos rechazados y textos conservados | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US1.6 | upload-races, management UI; MV04 | Consulta/replay con respuesta perdida recupera un único resultado | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.1 | download, student E2E; MV01,MV02 | Publicados propios, DTO mínimo, bytes íntegros | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.2 | enrollment; MV02,MV07 | Reserva/pago/incidencia sin matrícula deniegan consulta y contenido | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.3 | enrollment, download; MV02 | URL/referencia de otro grupo del mismo curso no entrega datos | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.4 | enrollment; MV07 | Antes/en/después del fin original a µs; instante exacto se deniega | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.5 | enrollment, student E2E; MV07 | Retiro de oferta/inhabilitación docente conserva acceso vigente | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.6 | student UI; MV11 | Vacío autorizado distinto de fallo recuperable, reintento manual | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US2.7 | download, student UI/E2E; MV02,MV11 | Sesión/cuenta revocada deniega; respuesta vieja no reaparece | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US3.1 | commands, command-races; MV05 | Textos cambian sin archivo/grupo/estado; revisión obsoleta da conflicto | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US3.2 | commands, actions E2E; MV08 | Retiro oculta y deniega solicitudes nuevas, histórico conservado | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US3.3 | commands, actions E2E; MV08 | Retirado solo vuelve por publish explícito autorizado | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US3.4 | authority, commands, actions E2E; MV06 | Anterior denegado, nuevo habilitado gestiona, autor original inmutable | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US3.5 | schema, commands, audit; MV05,MV08 | No reemplazo bajo ID anterior: nuevo material y retiro separado | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |
| US3.6 | upload-security, command-races; MV06 | Permiso perdido durante operación impide commit del cambio | [T060](automated.md), automatizado local; sin resultado humano individual por escenario |

## Revisión de tareas y condiciones restantes

| Tarea | Preparación disponible | Condición de cierre no satisfecha |
| --- | --- | --- |
| T064 | Completada para el recorrido global en laptop | Móvil no observado; teclado, SO/navegador y ayuda sin desglose |
| T065 | Procedimiento O01–O12 | Acuerdos D13 y comprobación del destino elegido |
| T066 | Escenario C01–C10 | Rúbrica, mezcla/duración, infraestructura autorizada y carga desde otro equipo |
| T067 | Completada; estado/guía/arquitectura sincronizados tras resultado humano y corrección PDF | D13/D10 explícitamente pendientes |
| T068 | Esta revisión FR/SC/escenarios y cadena de hashes | Cierre T001–T067, personas reales y puertas aplicables |

El responsable pidió conservar D10/D13 pendientes. No se solicita de nuevo esa
decisión ni se interpreta «continuar» como autorización para inventar acuerdos,
participantes, despliegue o carga externa. CI remoto no observado permanece
identificado; Izipay/24 h reales y T104/T108 de 001, T073/T074 de 002 y los
pendientes 003 conservan su alcance y evidencia originales.

## Preservación y cómo continuar

Producto, pruebas, migraciones, dependencias, rama y entorno manual se comparan
con la cadena de evidencia anterior. Los cambios de este bloque son documentales;
los textos originales de spec/plan/architecture permanecen íntegros como registros
históricos. Checklist requirements.md 16/16, sin cambio de marcadores.
Se verifican referencias locales, cobertura de IDs y estados de tareas; no se
inicia Docker o un servicio para una revisión documental.

Completar decisiones/ensayos de T065 y T066 cuando estén disponibles y reevaluar T068 con esas evidencias. La aceptación humana se limita al reporte en laptop; D10/D13 y el cierre integral no se acreditan por redactar documentos. T068 permanece sin marcar. Ver [cierre T064/T067](t064-t067-report.md).
