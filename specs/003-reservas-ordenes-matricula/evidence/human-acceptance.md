# Aceptación humana de reservas, órdenes y matrícula

Fecha de preparación y ensayo: 2026-11-04, America/Lima.

**T042 — COMPLETADA.** El responsable del ensayo confirmó en la conversación que el recorrido funciona adecuadamente y solicitó cerrar la tarea. Confirmó expresamente el consentimiento del alumno y que utilizaron solo computador. Esta evidencia registra el resultado comunicado por el responsable; el agente no observó directamente las acciones del alumno.

## Participantes y entorno

| Dato | Registro |
| --- | --- |
| ALUMNO-01 | Alumno real; disponibilidad confirmada por el responsable antes del ensayo. |
| RESPONSABLE-01 | Usuario que solicitó y confirmó el ensayo en esta conversación. |
| Consentimiento | Confirmado por el responsable: «Sí; usamos solo computador». |
| Dispositivo | Computador. Sistema operativo, navegador y resolución no informados. |
| Entorno | Sesión local de la versión actual de reservas en http://localhost:5174, con cuenta y tres cursos ficticios, servidor y PostgreSQL reales en esquema aislado de pruebas. |
| Datos privados | Sin nombres, correos, contraseñas, cookies ni identificadores de cuentas publicados. |

Antes de entregar el acceso se comprobaron web, inicio de sesión, consulta de usuario y oferta: respuestas HTTP 200; cierre de sesión: 204. Son comprobaciones técnicas de disponibilidad, separadas del resultado humano. No acreditan por sí solas aceptación.

## Resultado humano comunicado

El responsable declaró: «funciona tood de forma adecuada», y pidió marcar T042 como completada. Resultado global del recorrido de reservas: **favorable, según confirmación del responsable**. No comunicó dificultades ni solicitó correcciones. Esto no implica que el agente haya medido comprensión, tiempos o tasas de éxito.

El guion entregado incluía consultar oferta y entrar en Reservar; comparar horarios, precios y disponibilidad; previsualizar y confirmar; distinguir espera de reserva confirmada; revisar detalle, total y plazo; recuperar tras recarga y nueva sesión; y revisar vacío, falta de precio, rechazo y desconexión. No se aportó un desglose de resultados por escenario ni una descripción de los clics observados: se conserva la confirmación global sin inventar resultados individuales.

## Alcance y límites

- Ensayo humano realizado en computador. Móvil no fue probado por los participantes.
- No se confirmó específicamente el uso exclusivo de teclado; no se atribuye esa observación al ensayo humano.
- Las pruebas automatizadas de móvil, escritorio y teclado se mantienen como evidencia técnica separada en [US1](us1.md), sin sustituir observaciones humanas.
- No se comunicaron correcciones pendientes de esta sesión. Las observaciones humanas adicionales de móvil, teclado y detalle de escenarios podrán ampliar esta evidencia.
- El cierre corresponde a T042, observación humana de US1. No aprueba pagos, sandbox, las otras historias ni la aceptación humana integrada T089; tampoco cierra tareas humanas de otras especificaciones.


## T083 — preparación administrativa, pendiente de observación

2026-11-13, America/Lima. El responsable confirmó que puede probarlo en computador.
Se preparó una sesión local temporal con cuentas ficticias y una incidencia de
pago simulada explícitamente, usando el receptor/finalizador y la persistencia
reales. La web respondió HTTP 200 desde el anfitrión. No hay resultados humanos
comunicados para este recorrido: **T083 permanece pendiente**.

El [guion de T083](t083-guide.md) describe precio, consulta, seguimiento, conservación
de importe/plazo y separación de la vista del alumno. Se solicitó informar pasos
realmente probados, comprensión de la resolución económica pendiente, dificultades
y consentimiento si participa un alumno real, sin datos personales. La disponibilidad
del responsable y la preparación técnica no sustituyen el ensayo. El resultado
T042 anterior se conserva íntegro; no se cierran T089 ni tareas humanas de 001/002.


### Continuidad del 2026-11-15

La sesión temporal preparada el13 terminó durante la interrupción del entorno.
No se recibieron resultados humanos del recorrido administrativo; la confirmación
de disponibilidad en computador no permite cerrar T083. El enlace de aquella sesión
no se presenta como activo. El ensayo debe retomarse cuando se comuniquen acciones
y observaciones reales. T042 mantiene íntegro su registro anterior.


## Preparación de T089 — sesión integrada pendiente

2026-11-15, America/Lima. Se preparó el [guion integrado](human-integrated-guide.md)
con casos HI01–HI09 para las cuatro historias y registro por participante, dispositivo,
entrada y estado observado. No se ha realizado una sesión nueva en este bloque.
La evidencia T042 original permanece íntegra; T083 sigue sin acciones/resultados
humanos comunicados. Se solicitaron las observaciones reales y el estado de acceso
al sandbox, sin pedir credenciales públicas. No se interpreta disponibilidad como
resultado ni se atribuyen móvil o teclado a la prueba histórica en computador.

T089 depende de T083 y T059/proveedor real. Se admite registrar observación parcial
con su procedencia, pero no cerrar el recorrido integrado con simulación. El ensayo
operacional [T090](operation.md) se preparó por separado y no ha comenzado.


## T083 — resultado comunicado y cierre

Registro: 2026-11-15, America/Lima. **T083 COMPLETADA** según confirmación
del responsable en esta conversación. La fecha exacta del ensayo no fue indicada.
Los apartados anteriores conservan el estado que tenían antes de esta confirmación.

El responsable afirmó: «probe los pasos que me mencionaste que hiciera», en
respuesta al recorrido de precio, consulta, seguimiento y vista del alumno en
computador. Después respondió «si» a la pregunta de si la anotación se conservó
y la incidencia siguió pendiente, sin generar matrícula ni devolución. Se registra
ese resultado favorable del seguimiento; el agente no observó directamente el ensayo.

La confirmación respalda uso real del recorrido indicado y la distinción entre
seguimiento y resolución económica pendiente. No se comunicó un detalle separado
de dificultades, tiempos o ayudas; no se inventa ausencia de dificultades ni
resultados individuales adicionales. El uso de la vista STUDENT no acredita que
haya participado otro alumno real. No se atribuye ensayo en móvil o solo con teclado.
No se publica información personal ni se presenta la sesión histórica como activa.

El responsable confirmó también que no dispone de acceso al sandbox de Izipay.
T056–T059/D02 siguen pendientes; T089 integrada y T090 operacional no se cierran
con este resultado. T042 conserva íntegro su resultado previo.
[Registro saneado del cierre T083](t083-human-results.json).
