# Preparación T090 — ensayo operacional de 24 horas

2026-11-15, America/Lima. **Plan preparado; ensayo no iniciado ni autorizado en
un destino concreto.** No se registran horas de inicio/fin, recursos, resultados
ni RPO/RTO observados en este bloque. T090 permanece pendiente.

## Dependencias y decisiones previas

T086 completó el [upgrade y restore aislados](recovery.md). Sus tiempos observados
no son objetivos aprobados ni prueba de la operación durante 24 horas. T059 sigue
pendiente de contrato, adaptador y sandbox D02; es dependencia expresa de T090.
D13 requiere acuerdos y autorización previos para ejecutar el ensayo.

| Decisión que debe quedar registrada antes de iniciar | Estado |
| --- | --- |
| Responsable de operación, observación, incidencias y recuperación; disponibilidad durante la ventana | Pendiente de acuerdo |
| Destino exclusivo y autorizado: equipo, proyecto, BD, roles, red, volumen y fuentes/imágenes | Pendiente de acuerdo e inventario |
| Ventana real de al menos 86 400 s y medio de observación que permanezca activo | Pendiente de fecha y autorización |
| Ubicación privada de backups y evidencias, custodio, ACL y separación de clave; necesidad de copia externa | Pendiente D13 |
| Retención y eliminación operada de copias/evidencias; responsables y límites de datos | Pendiente D13, sin plazo aprobado |
| Objetivos aceptables de pérdida de datos (RPO) y tiempo de recuperación (RTO) | Pendiente D13, sin umbrales aprobados |
| Fuente y comprobación de salud horaria, cadencia de observación, tolerancias y respuesta a discontinuidades | Pendiente D13 |
| Reinicios/interrupciones permitidos, recursos y criterios acordados de suspensión | Pendiente de acuerdo y autorización |
| Presupuesto/costo de la ventana y de custodiar/observar el ensayo | Pendiente de aprobación; no contratar por este plan |
| T059 y modalidad de sandbox, operaciones externas permitidas y evidencias saneadas | Pendiente D02 |

Estos campos no se rellenan con valores inferidos. El registro posterior debe
incluir decisión, fecha, responsable y referencia a autorización explícita. La
autorización genérica de continuar implementación no documenta esos acuerdos.

Este plan se coordina con **VP004**, que exige recuperación comprobada,
copias/custodia/RPO/RTO, secretos y volúmenes separados antes de demo persistente
o publicación. VP004 depende también de su propia preparación de destino; T086
no cierra automáticamente VP004. Véanse [tareas de planificación](../../../docs/planificacion/tasks.md),
[decisiones pendientes](../../../docs/decisiones-pendientes.md) y
[procedimiento de recuperación](../../../ops/recovery/README.md).

## Preflight que se ejecutará después de resolver las puertas

1. Registrar alcance aprobado, fuentes por hash, imágenes por ID, versiones de
   PostgreSQL/Node y configuración privada identificada sin publicarla. Usar un
   proyecto y datos ficticios propios; no reutilizar cuentas, esquemas o volumen
   de ensayos humanos. No ejecutar configure/bootstrap/reset sobre instalaciones
   existentes. El nombre y destino concretos permanecen pendientes de inventario.
2. Verificar roles runtime/migración separados, permisos, red y puertos autorizados,
   custodia de claves, backups y acceso al registro privado. Mantener cobros reales
   deshabilitados y sandbox separado de cualquier carga.
3. Confirmar datos ficticios, cuentas y oferta elegible, precio PEN y fecha inicial
   válida para confirmar la reserva. Registrar instantánea y reconciliación inicial
   de órdenes, detalles, reservas, pagos, matrículas, incidencias y auditoría.
4. Comprobar que no hay `TestClock`, funciones que sustituyan `clock_timestamp`,
   timers acelerados o manipulación de fechas. La autoridad de negocio debe ser
   `pg_catalog.clock_timestamp()` del reloj real sano del servidor. Las fixtures
   T042/T083 y los tests de límites usan controles temporales y no se promueven
   directamente a este ensayo.
5. Registrar sincronización/estado del reloj de host/BD y fuente independiente de
   observación. El tiempo monotónico sirve a telemetría, nunca sustituye expiresAt
   ni decide vencimiento. Documentar cómo se detectarán huecos y discontinuidades
   si se reinicia alguno de los procesos observados.
6. Comprobar backup cifrado y recuperación en otro destino, con writers detenidos
   durante el punto consistente. Preservar la fuente; el restore requiere una BD
   nueva y posterior invalidación de accesos según el procedimiento vigente.
   Verificar permisos runtime sin DDL antes de reabrir acceso controlado.
7. Revisar por última vez acuerdos/autorización y estado T059. Solo entonces
   registrar inicio real y habilitar los procesos del ensayo aprobado.

## Recorrido operacional previsto

| Hito | Observación a registrar, todavía no ejecutada |
| --- | --- |
| Confirmación inicial | Intención y orden propias, confirmedAt/expiresAt originales con seis fracciones; diferencia exacta 86 400 000 000 µs, total y snapshots. IDs y datos sensibles quedan privados. |
| Antes del vencimiento | Estado del servidor y cupos, salud de reloj, proceso/pool/worker y recursos observados con la cadencia acordada. Cerrar sesión o recargar no cambia el plazo. |
| Interrupción/reinicio permitido | Estado antes/después, tiempos reales y persistencia de la misma orden/plazo; registrar lag del worker y recuperar desde el estado durable, sin reenviar pagos a ciegas. No provocar fallos fuera del alcance autorizado. |
| Pago oportuno sandbox | Solo si T059 lo habilita: verificar resultado del proveedor y efectos atómicos, sin tomar el retorno del navegador como aprobación. Una orden matriculada conserva su estado al pasar el plazo original. |
| Orden sin pago al vencer | Tras transcurrir físicamente el plazo, comprobar vencimiento efectivo, liberación/materialización idempotente, filas y auditoría finales; una nueva intención no renueva la antigua ni aplica sanción por abandono. |
| Incidencia o respuesta incierta | Solo con escenario compatible acreditado en T059: consultar/recuperar antes de repetir; registrar resultado canónico sin matrícula indebida ni resolución económica manual. |
| Cierre | Inventario final, reconciliación por orden, errores/incidencias, recursos, huecos de observación y decisiones de recuperación. Conservar claves/copias/datos según acuerdo; detener solo recursos propios autorizados. |

Comparar un reloj acelerado o dos timestamps separados por un día no demuestra por
sí solo 24 horas físicas. El observador debe acreditar el transcurso y la salud del
reloj con continuidad suficiente. Si no se observó el instante exacto del límite,
informar primera observación posterior y retraso de materialización; no atribuir
resolución de microsegundos a una consulta periódica.

## Criterios de suspensión y recuperación

Detener nuevas decisiones temporales y mantener acceso controlado ante pérdida de
salud horaria, retroceso incompatible detectado, destino/configuración discrepante,
exposición de secretos, pérdida de observación o recursos fuera de los criterios
acordados. Registrar el hecho y preservar evidencia saneada. No mover expiresAt,
añadir gracia, reactivar estados terminales ni ocultar errores para completar la ventana.
El diseño no detecta universalmente todo retroceso arbitrario entre reinicios;
sin evidencia suficiente no se certifica operación. [Contrato T07](../contracts/time.md).

Si se requiere restore, conservar el fallo y sus bases; restablecer a un destino
nuevo, invalidar sesiones/enlaces/correo restaurados y comprobar estado antes de abrir.
No usar `migrate resolve`, downgrade, borrado de volúmenes ni replay indiscriminado.
Restaurar pierde cambios posteriores al punto consistente; identificar y revisar
solo decisiones conocidas y autorizadas. No prometer recuperación automática de pagos
externos o hechos posteriores al backup.

## Plantilla de registro posterior

```text
Autorización/decisiones D13 y referencia T059:
Responsables; destino/revisión/imágenes/configuración privada identificada:
Inicio real UTC / America-Lima; evidencia de fuente horaria y observador:
confirmedAt / expiresAt originales; muestra saneada o hash del registro privado:
Hitos/observaciones reales; reinicios, recursos y discontinuidades:
Resultado por orden y reconciliación de filas/auditoría:
Incidencias, decisiones, pérdida conocida y recuperación:
Fin real y transcurso acreditado; alcance que quedó sin observar:
RPO/RTO medidos comparados con los objetivos previamente acordados:
Custodia/retención aplicada; recursos detenidos y datos conservados:
Conclusión favorable, desfavorable o incompleta y razón:
```

No publicar DSN, cuentas, cookies, enlaces, claves, payloads, tarjetas, firmas o
callbacks. Referenciar resultados privados mediante hashes e IDs técnicos saneados.
No sustituir la evidencia de T089 humana, T059 sandbox o T093 capacidad por este plan.
T090/T094 permanecen pendientes hasta resultados y puertas completos.
