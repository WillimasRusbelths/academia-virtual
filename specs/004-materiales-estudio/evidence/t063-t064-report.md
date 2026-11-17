# Informe del bloque T063–T064

2026-11-17, America/Lima. Estado del spec 004: **63/68 tareas completas,
5 pendientes**. T063 completada; T064 preparada y pendiente porque el responsable
confirmó que gestor y alumno reales aún no están disponibles.

| Trabajo | Resultado y evidencia |
| --- | --- |
| T063, laboratorio reproducible | Proyecto nuevo, sin puertos, otra BD/volumen, entorno manual preservado; [medición completa](local-resources.md) |
| Archivo al límite | Carga/descarga HTTP real de 20 000 000 bytes; longitud y SHA-256 completos coinciden |
| Memoria y copias | API y generador en procesos distintos; máximo RSS API 299.63 MiB y generador 183.63 MiB; contadores de buffers/driver separados |
| Plazas y cliente lento | Dos cargas retenidas, 429 por actor y 503 global; aborto libera plazas; cliente lento sin transacción SQL retenida |
| Fallo seguro | 53100/53200 inyectados tras inserción real: 503, rollback y archivo/finanzas previos conservados |
| Persistencia y respaldo | BD/WAL/disco/tráfico medidos; 7 materiales/40001455 bytes lógicos; copia cifrada 278381 bytes en 2.447 s |
| T064, preparación | [Protocolo](human-acceptance.md), consentimiento por rol, recorridos y plantilla anónima por computador/teclado/móvil; sin observaciones inventadas |

Se agregaron un script PowerShell de ensayo, un escenario integrado y un proceso
API de test instrumentado; se actualizaron estado/matriz/guía y evidencia. Lint,
tipos y build API aprobados; caso integrado 1/1, con siete ventanas y sin omitidos.
El parser inicial de salida du falló antes de transferencias; se corrigió y se
repitió el ensayo completo. 1099 archivos previos comparados; producto, pruebas
previas, migraciones, dependencias y rama conservados. Los proyectos quedaron
detenidos, sin eliminar volúmenes. [Resultados y hashes](t063-t064-results.json).

El PDF contiene relleno muy compresible: el backup pequeño no representa datos
reales de alta entropía. Las métricas muestreadas y los contadores de operaciones
Buffer no son una medida de todas las asignaciones nativas o copias vivas exactas.
No se llenó físicamente disco/RAM. No se acreditan 2500 activos, D10/D13, humanos,
CI remoto, 24 h reales, pagos reales, despliegue o cierre integral de 001–003.

## Siguiente bloque de implementación

1. **T065 — operación de materiales:** preparar operation.md con mantenimiento,
   respaldo/restauración, revisión de decisiones perdidas, custodia/retención,
   destino cifrado y control de espacio. Registrar acuerdos D13 reales del
   responsable antes de completar la tarea o habilitar demo persistente/publicación.
2. **T066 — capacidad:** incorporar materiales a capacity.md y definir mezcla,
   volumen, tráfico, duración, concurrencia y recursos/costo conforme a rúbrica.
   Ejecutar solo contra infraestructura autorizada, con generador separado; la
   prueba local T063 no satisface esta aceptación y no autoriza compras/despliegue.
3. **Retomar T064 cuando haya participantes:** consentimiento y recorrido real;
   registrar únicamente modalidades observadas y dificultades comunicadas.
   T067 depende de esa evidencia humana y T068 conserva todas las dependencias
   de cierre integral; no adelantarlas como tareas completas.

T065/T066 pueden prepararse documentalmente; su cierre requiere acuerdos,
escenario e infraestructura/evidencia que siguen pendientes. No se iniciaron en
este bloque. La preparación de T064 no se cuenta como tarea completa.
