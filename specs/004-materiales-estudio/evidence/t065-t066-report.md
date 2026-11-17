# Informe de preparación T065–T066

2026-11-17, America/Lima. **63/68 tareas completas; cinco pendientes.**
Se preparó el bloque T065–T066. Ambas tareas conservan su checkbox pendiente:
el responsable confirmó que los acuerdos D13 aún no están definidos y que la
rúbrica/escenario/infraestructura D10 aún no están disponibles.

| Trabajo realizado | Resultado concreto | Pendiente para completar la tarea |
| --- | --- | --- |
| [T065: operación](../operation.md) | Registro O01–O12, mantenimiento, backup conjunto e inventario, restore en cuarentena, invalidación de sesiones, revisión de decisiones perdidas y respuesta a incidentes/espacio | Custodio, destino cifrado externo y clave, retención, RPO/RTO, espacio/observación/costo y comprobación del destino acordado |
| [T066: capacidad](../capacity.md) | Registro C01–C10, mezcla combinada, cuentas/activos/VU/solicitudes separados, corpus/volumen/tráfico/recursos/costo, preflight, métricas y evaluación de cada corrida | Rúbrica y criterios acordados, mezcla/duración, infraestructura autorizada y generador en otro equipo, ejecución y evaluación real |
| Estado y trazabilidad | Tareas, guía y matriz enlazan ambos documentos y la respuesta del responsable | No se atribuye aceptación a la preparación documental |

Las herramientas y mediciones previas de [recuperación](recovery.md) y
[recursos](local-resources.md) se reutilizan como evidencia de alcance local:
no se volvieron a ejecutar ni se promovieron a D10/D13. El procedimiento conserva
las guardas de los scripts (BD nueva recovery_*_test, schema permitido, roles
separados y trafficReady=false), y no propone eludir restricciones del entorno manual.
El escenario distingue copia de archivos, bytes de red, memoria, WAL, cuentas,
usuarios activos, solicitudes y tasas; preserva 20 MB y admisión 2 por proceso/1
por actor. No se fijaron umbrales, porcentajes de mezcla o plazos de retención.

## Validación del bloque

Cambio documental: revisión de argumentos/guardas contra las herramientas
existentes, referencias locales verificadas y comparación de hashes con la
cadena previa de evidencia. Conteo de tareas 63 completas/5 pendientes;
T064/T065/T066/T067/T068 siguen sin marcar. Checklist requirements.md 16/16,
sin cambios. Ver [resultado estructurado](t065-t066-results.json).

Producto, pruebas, migraciones, dependencias, rama y evidencia histórica
conservados. No se ejecutaron tests de producto para este cambio documental.
No se inició Docker, carga, respaldo del entorno manual, compra, purga o despliegue.
No se cierran Izipay, 24 h físicas, humanos, CI remoto, D10/D13 o 001–003.

## Continuación del trabajo

- Retomar T064 cuando haya gestor/alumno y consentimiento; usar el
  [protocolo preparado](human-acceptance.md), registrando modalidades realmente observadas.
- Resolver O01–O12 y comprobar el destino operativo para completar T065.
- Resolver C01–C10 y ejecutar/evaluar la carga autorizada para completar T066.
- Después de T064, T067 podrá consolidar estado/arquitectura/guía con los límites
  reales. T068 requiere el cierre de sus dependencias y evidencia integral;
  no se adelanta por redactar estos documentos.

La próxima acción útil es aportar participantes o los acuerdos/referencias que
faltan. Hasta entonces el bloque está preparado; no hay un ensayo externo listo
para ejecutarse con las decisiones disponibles.
