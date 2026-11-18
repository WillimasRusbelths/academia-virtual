# Cierre documental de specify 005 y secuencia 006/007

2026-11-17, America/Lima. Solicitud: terminar 005 con su alcance actual y entregar
hoja de ruta, sin ramas ni implementación de 006/007, contratación o producción.

## Resultado de esta pasada

- [005](../spec.md) conserva las cuatro historias, 24 escenarios, 23 requisitos y
  ocho criterios y V01–V03. Se declara terminado specify, pendiente el resto del
  ciclo de desarrollo y prueba de viabilidad del video. No cambia requisitos o
  proveedor, ni traslada el incumplimiento de protección al despliegue.
- [Hoja de ruta](../../../docs/planificacion/hoja-ruta-005-007.md) delimita 006 como
  pulido transversal y 007 como spec operativo separado. Son incrementos futuros
  documentados; no se crean sus directorios, ramas, planes, tareas o código.
- [Revisión de paneles](../../../docs/planificacion/revision-paneles-006.md)
  contrasta necesidades por rol con fuentes, permisos y pruebas existentes;
  clasifica organización, consultas pequeñas opcionales Q006-01/Q006-02 y brechas
  funcionales con destino recomendado. No afirma que la presencia de un test sea
  una nueva ejecución o que haya paneles agregados ya implementados.
- 006 exige inventario actualizado antes de su alcance final, navegación por rol,
  coherencia visual, móvil/escritorio, accesibilidad, estados y regresión de
  pantallas anteriores. No bloquea el pulido independiente por brechas aisladas.
- 007 incluye entorno web/API/BD, HTTPS, secretos, migraciones, respaldo externo,
  recuperación, responsables, costos acumulados frente a S/300 y recorridos por rol,
  diferenciando pruebas reales/simuladas/pendientes.
- Volumen ≥15.000 cuentas y 2.500 activos quedan como metas no demostradas. Siete
  escenarios especifican patrones, cohortes, fases y umbrales numéricos propuestos;
  usuarios únicos/operaciones/VU/RPS se separan. Video externo se mide aparte del
  tráfico de Academia y no elimina obligaciones de autorización del contenido.
- Se identifica la evidencia histórica de identidad de 1000 como otro escenario;
  la meta actual de 2500 ya constaba en constitución/RC-02. No se alteran specs
  anteriores ni se presentan los nuevos umbrales como aprobación de la rúbrica D10.

## Validación y límites

Checklist de 005: 16/16 criterios documentales. Revisión estructural y de enlaces,
trazabilidad de FR/SC/decisiones y comparación de hashes de archivos previos.
Solo cambia documentación de 005 y se añaden documentos de hoja de ruta. Código,
pruebas, migraciones, dependencias, constitución y specs 001–004 preservados;
puntero local en 005 y rama existente conservados. No se ejecutan nuevas pruebas
funcionales, carga, emisión o recuperación por redactar estos documentos.

[Resultados y hashes](scope-roadmap-results.json). La especificación/checkpoint
anterior y sus hashes se conservan como historia; no se reescriben para simular
que incluían esta hoja de ruta. Continúa plan de 005 cuando se solicite el bloque
siguiente, con análisis de viabilidad y sin aprobación implícita de infraestructura.
