# Propuesta para completar T065–T068

2026-11-17, America/Lima. Solicitud del responsable: «termina todo esos».
**Propuesta revisable; no son acuerdos adoptados ni resultados de pruebas.**
El estado sigue en 65/68: [tareas](../tasks.md). Esta solicitud autoriza avanzar
con el trabajo, pero no aporta el destino externo, custodios, otro equipo o rúbrica
que faltaban. No se han contratado servicios ni iniciado carga externa.

Actualización del responsable: «otro equipo y la copia costudiara el encargado a
quien le entreue el software». Se adopta la elección de otro equipo para la copia
y del encargado receptor como custodio de la copia; no se presume custodia de la
clave ni disponibilidad de ese equipo. Para carga indicó «no ceunto con otro
equipo». Se registra falta actual de generador separado. El destino futuro de
copias y un generador de carga disponible son cuestiones diferentes. Las demás
propuestas de este documento continúan sin acuerdo.

## D13: política inicial propuesta

| Decisión | Propuesta concreta para acordar | Dato o comprobación que falta |
| --- | --- | --- |
| O01/O04 Custodia | Responsable del proyecto como custodio principal; copia cifrada y clave en ubicaciones separadas, acceso restringido | Confirmar principal, sustituto y mecanismo de recuperación de clave; sin publicar secretos |
| O02 Origen | Entorno exclusivo de ensayo con datos ficticios; mantener intacto el entorno manual | Identificar el entorno que posteriormente se operará y su inventario |
| O03 Destino | Copia cifrada externa al equipo de origen, verificable por hash y recuperable sin ese equipo | Elegir disco externo desconectable, otro equipo o servicio y comprobar acceso |
| O05 Frecuencia | Una copia diaria y otra antes de actualizar, con escritores detenidos durante inventario y dump | Acordar ventana, operador y mantenimiento; no se programa automáticamente |
| O06 Retención | Conservar 7 copias diarias y 4 semanales; ninguna eliminación automática en esta etapa | Aceptar plazos y definir revisión manual de copias; no borrar los laboratorios existentes |
| O07 RPO | Objetivo inicial: como máximo 24 horas de cambios perdidos | Aceptar impacto; medir edad del punto recuperado y revisar decisiones perdidas |
| O08 RTO | Objetivo inicial: servicio de ensayo recuperado en 2 horas desde declarar el incidente | Aceptar objetivo; incluir obtención de copia/clave, restore, invalidación y controles antes de abrir |
| O09 Espacio | Antes de copiar/restaurar, calcular espacio para BD/WAL, dump, temporal, cifrado y retención con tamaño observado | Medir espacio y corpus del destino real; no asumir ratio de compresión |
| O10 Observación | Revisar diariamente resultado del backup, antigüedad de copia verificada, espacio y fallos; suspender operación si no hay copia recuperable | Confirmar responsable y canal de incidentes; no se envían avisos a terceros |
| O11 Recuperación | Restore en destino nuevo y aislado desde la copia externa, comparación de inventario, sesiones invalidadas y permisos comprobados | Ejecutar con el destino elegido y aceptar pérdidas revisadas |
| O12 Costo | Reutilizar medios disponibles cuando sea posible; sin compras automáticas | Inventariar costos reales y comprobar presupuesto acumulado S/300 total |

Estos objetivos son una base para decidir. El ensayo local anterior no demuestra
que ya se cumplan en un destino externo. La retención de copias no define por sí
sola la retención de materiales retirados, auditoría o intenciones en la BD; esa
conservación sigue sin purga automática y requiere acuerdo propio.

## D10: subescenario de materiales propuesto

Propuesta para contrastar con la rúbrica del profesor, sin sustituirla:

- Generador en otro equipo físico; API/BD en destino de ensayo autorizado.
  Datos ficticios y sesiones distintas, conservando autorización, cuotas y CSRF.
- Población persistida mínima: 15 000 cuentas; actividad de usuarios distintos
  medida en ventanas de 60 segundos. Un VU sin operación real no cuenta como activo.
- Calentamiento de 5 minutos; escalones de 250, 500, 1000, 1500, 2000 y 2500
  usuarios activos objetivo, 5 minutos cada uno; sostener 15 minutos el máximo
  alcanzado y observar recuperación durante 5 minutos. Registrar lo realmente
  alcanzado; no declarar éxito si el generador o el destino no sostienen el patrón.
- Mezcla inicial de operaciones completadas objetivo: 80% listar, 15% descargar,
  3% preparar y 2% mantener. Actores de gestión separados y autorizados; registrar
  tasas logradas y rechazos por admisión sin contarlos como operaciones exitosas.
- Corpus sintético válido PDF/JPEG/PNG, tamaños de 100 KB, 1 MB, 5 MB y 20 MB,
  con compresibilidad medida y archivos distintos. Ajustar distribución al uso
  acordado; no usar el PDF personal del diagnóstico para generar carga.
- Evaluar integridad/aislamiento sin tolerancia a archivos incorrectos, acceso
  indebido, duplicados o escrituras parciales. Registrar percentiles por operación
  y tamaño, errores, admisión, CPU/RAM/red de ambos equipos, BD/WAL/disco y costo.
- Suspender ante pérdida de integridad, acceso indebido, destino incorrecto o
  pérdida de observación; conservar evidencia y no purgar para continuar.

Faltan la rúbrica, referencias de ambos equipos/destino y aceptación de mezcla,
duración, corpus y umbrales de latencia/disponibilidad/recursos. No se inventan
umbrales aprobados. La tasa de preparación debe evaluarse frente a las dos plazas
de transferencia por proceso y una por actor; la saturación es un resultado que
debe informarse. No se amplían esos límites para forzar una cifra.

Este subescenario no acredita el combinado con reservas/matrícula, chat y video.
El combinado conserva el [alcance y dependencias D10](../capacity.md); deben
definirse sus distribuciones y clientes específicos antes de aceptarlo.

## Secuencia de cierre

1. Completar las referencias reales y acordar O01–O12/C01–C10 en
   [operación](../operation.md) y [capacidad](../capacity.md).
2. Ejecutar respaldo y recuperación desde el destino externo; registrar hashes,
   tiempos, permisos, pérdidas, costos y aceptación para cerrar T065.
3. Preparar/ejecutar el escenario acordado desde el otro equipo, evaluar la rúbrica
   y registrar resultados reproducibles para cerrar T066.
4. Actualizar la [revisión final](final-acceptance.md) con esas evidencias y revisar
   hashes/FR/SC/escenarios antes de marcar T068.

Sin esas comprobaciones las tres casillas permanecen pendientes. No se modifica
la constitución ni se rebautiza un ensayo local como capacidad externa aprobada.
