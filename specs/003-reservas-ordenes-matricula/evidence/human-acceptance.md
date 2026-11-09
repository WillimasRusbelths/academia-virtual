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
