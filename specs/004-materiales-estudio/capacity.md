# Capacidad con materiales — preparación T066 / D10

2026-11-17, America/Lima. **Escenario preparado, sin rúbrica acordada ni ensayo
en infraestructura autorizada. T066/D10 pendientes.** No hay carga externa
ejecutada, infraestructura contratada, capacidad aprobada o umbrales nuevos.
Este documento incorpora materiales al escenario combinado conservando los
[requisitos de capacidad](../../docs/planificacion/reservas-capacidad.md) y las
[decisiones D10/D13](../../docs/decisiones-pendientes.md).
El responsable confirmó: «Todavía no están disponibles; conservar pendientes»
para rúbrica, escenario y destino/generador. No se inició carga para sustituirlos.
Actualización 2026-11-17: el responsable informa que **no cuenta con otro equipo**
para generar la carga. C07 queda bloqueado por disponibilidad material; no se
ejecuta carga externa ni se sustituye el generador físico separado por un
contenedor o proceso en la misma laptop. No se aportó rúbrica en esta respuesta.

## Magnitudes y evidencia separadas

| Magnitud | Significado | Estado |
| --- | --- | --- |
| ≥15 000 cuentas | Población persistida de cuentas ficticias y sus índices | Requisito; no se generó esa población en este bloque |
| 2500 activos concurrentes | Usuarios distintos activos en una ventana/mezcla definida | Objetivo; ventana, mezcla y cumplimiento pendientes |
| VU del generador | Trabajadores de un cliente de carga | No equivalen por sí solos a personas/usuarios activos |
| Solicitudes en vuelo | Peticiones simultáneas observadas en API/proxy/BD | Deben medirse aparte de VU, cuentas y sesiones |
| RPS y transferencias/s | Operaciones terminadas por unidad de tiempo | No equivalen a 2500 activos |
| 2 transferencias/proceso, 1/actor | Admisión binaria implementada | Protección técnica, sin cuota global distribuida o capacidad demostrada |

[T063](evidence/local-resources.md) midió un proceso API separado del generador en
la misma VM, con PDF de 20 MB muy compresible, dos cargas retenidas y siete ventanas.
Pico RSS API 299,63 MiB, generador 183,63 MiB; backup 278 381 bytes para 40 001 455
bytes lógicos. Esas cifras no dimensionan datos de alta entropía, internet, proxy,
2500 activos o el VPS. T062 aporta restore local y T060 suites automáticas; ninguno
sustituye D10. Los perfiles/umbrales históricos de 1000 usuarios en 001 conservan
su resultado original y no se rebautizan como un escenario aprobado de 2500.

## Registro previo de acuerdos D10

Completar valor, responsable, fecha y referencia de acuerdo. No rellenar faltantes
con valores de pruebas históricas ni inferir autorización de una orden de continuar.

| ID | Decisión necesaria | Estado actual |
| --- | --- | --- |
| C01 | Rúbrica del profesor y criterios de aprobación por actividad/escenario | Pendiente |
| C02 | Ventana de actividad, distribución de 2500 activos, sesiones y think time | Pendiente |
| C03 | Mezcla de identidad, oferta, reservas/matrícula, materiales, chat y video; alcance implementado | Pendiente |
| C04 | Duración, calentamiento, escalones, sostenimiento, recuperación y repeticiones | Pendiente |
| C05 | Corpus: formatos, tamaños, entropía, número por grupo y estados/retirados/intenciones | Pendiente |
| C06 | Destino autorizado: equipo/VPS, red/origen HTTPS, proxy, DB, almacenamiento y límites | Pendiente |
| C07 | Generador en otro equipo físico, k6 para reservas/matrícula y clientes adecuados para binarios/Socket.IO/HLS; versiones y límites de emisión | No disponible: responsable informa el 2026-11-17 que no cuenta con otro equipo; ejecución pendiente |
| C08 | Latencia, disponibilidad, integridad, recursos y criterios de suspensión aceptables | Pendiente |
| C09 | Costo de toda la ventana, servicios y tráfico dentro de S/300 total | Pendiente |
| C10 | Preflight, recuperación/custodia D13, responsables y alcance autorizado | Pendiente |

No hay destino ni cuotas contratadas para completar estos campos. El futuro
preflight de VPS debe tener evidencia propia; no se presume que documentos
futuros de evaluación ya existan. Si el ensayo incluye pagos, T059/D02 y sandbox
válido siguen siendo dependencias; los pagos simulados se declaran como tales.

## Matriz del escenario combinado por acordar

Las cantidades/porcentajes/tiempos de estas filas están **pendientes**. Registrar
usuarios distintos y operaciones reales de cada flujo, evitando sumar dos veces
usuarios que participan en varias actividades. La distribución acordada debe
explicar el objetivo combinado; no añadir transferencias ficticias para alcanzarlo.

| Actividad | Operación real y permisos | Carga que debe definirse | Comprobación durable |
| --- | --- | --- | --- |
| Identidad/oferta | Login, renovación/consulta de sesión y consulta de grupos | Cuentas/sesiones, tasa de login y navegación | Sin datos ajenos o autenticación eludida |
| Reservas/matrícula | Orden/reserva, pago simulado y conciliación según 003 | Tasa, mezcla, grupos, último cupo y plazos originales | Sin sobreventa, duplicados, extensión de 24 h o matrícula indebida |
| Listar materiales | Alumno vigente lista solo publicados; gestor consulta sus estados | Frecuencia, paginación y distribución por grupo | Sin bytes en listado ni datos de otros grupos |
| Descargar | GET completo autorizado, contar bytes y SHA-256 | Formatos/tamaños, concurrencia, tasa y clientes lentos | Solo publicado/matrícula vigente; retiro deniega solicitudes nuevas |
| Preparar | POST intención + PUT exacto binario por docente/admin permitido | Archivos/s, actores distintos, mezcla de tamaños y replays | Un material PREPARED, archivo íntegro y resultado durable único |
| Mantener | Editar/publicar/retirar/republicar con revisión | Frecuencia, colisiones y reintentos explícitos | Archivo/autor/grupo inmutables; comando y auditoría atómicos |
| Denegaciones/incidentes | Actor ajeno, matrícula vencida, abortos y exceso de plazas | Subescenario separado con cantidades acordadas | 401/403/404/429/503 seguros, sin escritura/bytes indebidos ni plazas filtradas |
| Chat | Cliente autorizado que hable Socket.IO | Grupos, conexiones, mensajes, reconexión y duración | Pendiente de implementación/evidencia propia; no WebSocket genérico |
| Video | Consumidores autorizados que descarguen manifiestos y segmentos HLS | Emisiones, bitrate/calidad, consumidores y duración | Pendiente de implementación/evidencia propia; abrir páginas no prueba reproducción |

No presentar como ejecutadas actividades aún no implementadas. Un subescenario de
materiales puede medirse por separado; el informe debe decir qué actividades quedan
fuera y no acreditar un combinado ausente. No desactivar cuotas, CSRF, Origin,
autorización, revisión, auditoría o checks de archivos para facilitar la carga.

## Datos, volumen y costo de materiales

Usar datos ficticios exclusivos, usuarios con relaciones de grupo/matrícula válidas
y formatos completos PDF/JPEG/PNG; no solo firmas/extensiones. Incluir tamaños
representativos, el límite decimal 20 000 000 y contenido con compresibilidad
medida. Registrar número de archivos y bytes lógicos por formato/estado/grupo;
intenciones pendientes y retirados siguen ocupando espacio conforme al modelo.

Las estimaciones siguientes son contabilidad, no mediciones o capacidad:

- Volumen lógico = suma de tamaños de archivos confirmados, incluidos retirados.
  BD/índices/TOAST, filas pendientes, WAL y espacio reutilizable se miden aparte.
- Tráfico binario útil de descarga por segundo = suma de bytes completos entregados
  en la ventana / segundos de ventana. Multiplicar por 8 convierte bytes/s en bit/s;
  cabeceras, TLS, reintentos, proxy y tráfico API↔BD añaden consumo propio.
- Presupuesto de almacenamiento incluye BD, WAL, dump interno, temporal del host,
  archivo cifrado, retención y copias externas. No deducirlo del backup compresible
  T063 ni asumir ratio fijo de compresión o purga.
- Medir memoria API, proxy, PostgreSQL y generador por separado; registrar RSS,
  heap/external/arrayBuffers y copias del driver sin asumir RAM constante por bytea.
  La línea base y GC afectan incrementos; no multiplicar un único pico por 2500.
- Costo total = infraestructura y generador contratados + tráfico + almacenamiento/
  respaldo + correo/dominio y demás servicios del periodo, con fuente/fecha/moneda
  y conversión cuando aplique. Presupuesto S/300 total, no mensual. No hay una
  cotización, gasto o contratación aprobados en este documento.

## Preflight para la futura ejecución autorizada

1. Completar C01–C10, O01–O12 de [operación](operation.md), disponibilidad del
   responsable y destino/ventana permitidos. D10 no autoriza por sí solo cambios
   productivos, compras o carga contra sistemas externos.
2. Inventariar código/dirty tree por hash, imagen, dependencias, CPU/RAM/disco/red,
   región y límites efectivos. Identificar por separado el otro equipo generador,
   su herramienta/versiones, ancho de banda y uso de CPU/RAM; comprobar que puede
   emitir el patrón sin saturarse. El harness T063 no cumple esa separación física.
3. Crear población y corpus ficticios en un entorno exclusivo del ensayo, separado
   de la sesión humana y del entorno manual. Registrar inventario inicial e
   invariantes; no ejecutar reset o bootstrap sobre datos existentes.
4. Verificar HTTPS/mismo origen, proxy y límites/framing/timeout/buffering de la
   ruta PUT binaria y GET completa, sin ampliar JSON 16 KiB o activar caché privada.
   No hay configuración pública de proxy aprobada por los ensayos directos T063.
5. Correlacionar relojes sanos del generador y destino, muestreos y huecos de
   observación. No alterar clock_timestamp, plazos de negocio o timers para
   convertir un smoke en 24 horas físicas.
6. Verificar backup/restore/custodia y espacio con corpus acordado. Aplicar las
   fases de carga acordadas, y comprobar antes de cada una el criterio de suspensión.
   No aumentar transferencias, pool, timeouts o procesos sin registrar nueva versión
   y justificar el cambio con mediciones.

## Registro y evaluación de cada corrida

| Área | Campos de evidencia saneada requeridos |
| --- | --- |
| Identidad de corrida | Inicio/fin UTC y America/Lima, versión, hashes de scripts/configuración, destinos autorizados por referencia |
| Patrón alcanzado | Cuentas totales, activos únicos por ventana/actividad, sesiones, VU, RPS y solicitudes en vuelo observadas |
| Resultado HTTP | Cantidades/status por endpoint/rol/operación, abortos, timeouts, longitud/hash y replays; sin tokens/cuerpos |
| Latencia | Muestras suficientes, percentiles acordados y distribución por operación/tamaño; separar espera, transferencia y confirmación cuando sea observable |
| Admisión | Transferencias simultáneas por actor/proceso, 429 y 503 de saturación, rechazos y recuperación; distinguirlos de fallos de BD |
| Sistema evaluado | CPU/RSS/buffers por proceso, pool/locks, BD/TOAST/WAL/disco, I/O, red y proxy; método/intervalo y pérdida de muestras |
| Generador separado | CPU/RAM/red, conexiones, emisiones logradas y límites; no mezclar sus recursos con el destino |
| Persistencia | Material/Content/Upload/Command/Audit, hashes/estados/revisiones/autoría; finanzas invariantes en subescenario solo materiales |
| Combinado matrícula | Reconciliar órdenes/pagos/matrículas/cupos con operaciones esperadas, no exigir huella financiera idéntica si se realizaron cambios legítimos |
| Recuperación | Reintentos revisados, ausencia de duplicados/parciales, retorno tras abortos, backup/restore y cambios posteriores conocidos |
| Costo | Periodo, recursos/tráfico/servicios y costo total comparado con presupuesto; sin precios asumidos |
| Evaluación | Cada criterio C01/C08 con evidencia, resultado, límites e incidencias; firma/referencia y fecha de aceptación |

429/503 esperados de un subensayo de saturación no se ocultan ni reclasifican
como operaciones completadas. La evaluación de disponibilidad del escenario
principal debe usar la rúbrica acordada. Las operaciones denegadas no cuentan
como descargas exitosas. No calcular percentiles a partir de los siete agregados
de T063 ni convertir dos plazas de admisión en concurrencia alcanzada de usuarios.

Detener la carga ante los criterios acordados o pérdida de integridad, fuga de
datos, destino equivocado o incapacidad de observar el ensayo. Preservar evidencia,
no purgar para continuar. Registrar el motivo, estado durable y decisiones de
reanudación. Toda prueba no ejecutada queda identificada como pendiente.

## Estado de cierre T066

No hay horas de inicio/fin, solicitudes, latencias, recursos/costo del VPS ni
aceptación D10 registrados aquí. Para cerrar: acuerdos C01–C10, ejecución desde
otro equipo sobre destino autorizado, corpus y mezcla acordados, resultados
reproducibles y evaluación de integridad/recursos/costo por la rúbrica. T064,
D13, proveedor de pagos y 24 h físicas mantienen dependencias propias.
[Informe de preparación](evidence/t065-t066-report.md).
