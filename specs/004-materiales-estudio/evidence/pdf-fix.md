# H-PDF-01 — corrección de actualizaciones incrementales PDF

2026-11-17, America/Lima. **Corregida y verificada técnicamente; repetición del
participante pendiente.** T064 no se marca completa: estado 63/68.

El archivo indicado por el responsable tiene 1 342 144 bytes y versión PDF 1.7.
Su última actualización contiene una subsección xref 0 0 sin objetos nuevos y
Prev apunta a la sección anterior. El validador rechazaba count=0 y exigía
entradas nuevas en cada sección. Se reprodujo el rechazo sin extraer contenido
del documento. No se atribuye invalidez a su origen Classroom/WhatsApp/Word.

La [aclaración de PDF Association / ISO WG8](https://github.com/pdf-association/pdf-issues/issues/147)
contempla subsecciones con enteros no negativos y actualizaciones solo de trailer.
La corrección admite cero entradas y sigue la cadena Prev; requiere subsección
presente y un predecesor válido cuando no hay entradas nuevas. Conserva validación
de objetos/catálogo, límites de offsets/tamaños, terminaciones y rechazo de ciclos.

| Comprobación | Resultado |
| --- | --- |
| Regresiones nuevas antes de corregir | 3 fallos / 2 aprobadas; solo fixtures sintéticas |
| Regresiones nuevas después | 5/5 |
| Formatos, carga, gestión HTTP, descarga y auditoría, más regresiones | 107/107 en seis archivos, cero fallos/omitidos |
| Lint API, tipos de regresión y build API | Aprobados |
| PDF indicado, a través de la web/proxy | 201, PREPARED |
| Descarga del preparado técnico | 200; buffer completo y SHA-256 iguales al original |
| Reinicio del laboratorio humano | Mismo schema y conteos preservados; sin fixtures/migraciones; mismas cuentas |

El grupo y las cuentas del ensayo materials-human-60e9aab3c9b5 permanecen activos
en http://localhost:5173 con la corrección. Se mantiene el vencimiento original
de dos horas y el comando detener.ps1. Solo se recreó el runner; BD/Mailpit,
volumen y datos anteriores se conservaron. El preparado de comprobación no se
publicó y no cuenta como observación humana. Sesión técnica cerrada.

[Resultados estructurados](pdf-fix-results.json), [protocolo/observaciones](human-acceptance.md)
y [diagnóstico previo](pdf-diagnostic.md). El PDF del usuario no se añade al corpus
del repositorio ni se imprime; las pruebas nuevas generan sus propios archivos.
El cambio de producto se limita a pdf-structure.ts y se añade una suite; pruebas
anteriores, migraciones, dependencias, rama y entorno manual preservados.

Pendiente: que el participante repita con este y sus otros PDF, y completar el
recorrido humano de publicación/listado/descarga/retiro y modalidades observadas.
No se cierran D10/D13, CI remoto, 24 h físicas, proveedor o pendientes de 001–003.
