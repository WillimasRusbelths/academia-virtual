# Diagnóstico H-PDF-01 — rechazo de PDF en T064

2026-11-17, America/Lima. **Actualización: causa reproducida y corregida
técnicamente; repetición humana pendiente.** [Resultado de corrección](pdf-fix.md).

## Registro inicial, antes de recibir la muestra

Incidencia inicialmente abierta, con causa aún no reproducida en esa etapa.
El responsable reporta PNG preparado y PDF de Classroom de 1 342 144 bytes ausente
de preparados. No se recibió ni leyó el documento del usuario; tampoco se accedió
a Classroom. La consulta del laboratorio se limitó a tamaños/tipos/estados de
intenciones y códigos agregados, sin nombres, contenido o credenciales.
Después amplió que fallan varios PDF: descargados de WhatsApp y Classroom, y uno
de la laptop convertido de Word. Esto no identifica todavía un archivo concreto
para reproducirlo ni permite atribuirlo a corrupción de una única descarga.

| Comprobación técnica | Resultado |
| --- | --- |
| Intenciones PDF de tamaños comunicados | Pendientes; los PNG probados se completaron |
| PDF mínimo ficticio de 417 bytes | Aceptado por validador compilado |
| PDF generado por Chromium de 16 451 bytes | Aceptado por validador y HTTP web/proxy; 201, PREPARED |
| PDF sintético de exactamente 1 342 144 bytes | HTTP web/proxy 201, PREPARED |

Se usó la API real del laboratorio materials-human-60e9aab3c9b5 y sus credenciales
ficticias privadas. Las sesiones técnicas se cerraron. Los dos preparados de
diagnóstico quedaron sin publicar; no cuentan como resultados humanos.
No se modificó producto, migraciones, cuotas o validación para hacerlos pasar.

Una primera generación fue rechazada por la revisión automática porque montaba
el directorio privado completo. Se sustituyó por un montaje del único script
sintético conocido y una carpeta de salida vacía verificada, sin credenciales y
con red deshabilitada; esa generación terminó correctamente.

Los resultados no permiten identificar la estructura o condición que rechaza el
PDF concreto. Pendiente: ruta local de una muestra sin información privada cuyo
uso autorice el responsable, o un ejemplo equivalente. No atribuir el fallo al
origen Classroom, al tamaño o a invalidez del documento sin reproducirlo.
Los resultados sintéticos están en .cache/pdf-diagnostic-synthetic; los logs,
cuentas y entorno del laboratorio permanecen privados. T064 y H-PDF-01 pendientes.
