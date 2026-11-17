# Especificación inicial de clases y chat — 005

2026-11-17, America/Lima. Se inicia 005 por aceptación del responsable en esta
conversación, sin declarar terminado 004 ni alterar decisiones de 001–004.

Se resolvió la plantilla activa de Spec Kit y se redactó [spec.md](../spec.md)
con cuatro historias, 24 escenarios, 23 requisitos funcionales y ocho criterios
de éxito. El responsable confirmó tres decisiones: sesiones manuales/una en curso
por grupo, historial de solo lectura mientras siga vigente la matrícula y
moderación para ocultar mensajes/silenciar alumnos por clase. Las tres respuestas
se registran como V01–V03; límites de texto/frecuencia y otras delimitaciones se
declaran supuestos revisables, sin atribuirlos al responsable.

El [checklist de calidad](../checklists/requirements.md) tiene 16/16 criterios
documentales satisfechos. La trazabilidad relaciona requisitos con historias y
resultados exigidos; no son pruebas de producto ejecutadas.

La [revisión documental de video](../video-feasibility.md) consulta fuentes oficiales
y detecta que incrustar un enlace oculto tras el login no acredita control por
matrícula o revocación. Se conserva el requisito de autorización directa de
contenidos, se identifica la discrepancia entre propuestas documentales de emisión
y se exige prueba temprana antes de aceptar reproducción protegida. No se cambia
proveedor, constitución ni criterio del profesor, ni se realiza emisión real.

Se mantiene la rama existente y solo se actualiza el puntero local de Spec Kit a
005. Producto, pruebas, migraciones, dependencias, entorno manual y evidencia
anterior permanecen sin cambios. Materiales conserva 65/68 y T065/T066/T068
pendientes. No se crean plan/tareas, infraestructura, compras o servicios por este
bloque; no se ejecutan pruebas funcionales para una actualización documental.

Validación estructural, enlaces, hashes y preservación:
[specification-results.json](specification-results.json).

Siguiente bloque: plan técnico con investigación de video protegido, límites y
contratos de sesiones/chat/moderación; después tareas y análisis de consistencia
antes de implementar. La capacidad combinada y operación persistente conservan
D10/D13 como dependencias propias.
