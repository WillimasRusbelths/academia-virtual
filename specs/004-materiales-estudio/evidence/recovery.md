# Recuperación de materiales — T061–T062 / MV12

Fecha de ejecución: 2026-11-17, America/Lima. Ensayo automático local con datos
ficticios. T061–T062 completadas; estado 62/68. Continúa T063, recursos locales.
Resultado estructurado: [t061-t062-results.json](t061-t062-results.json).

## Ejecución reproducible y aislamiento

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-materials.ps1 -ApiImage academic-offering-fa3d46bddbb8-api:latest
```

Proyecto nuevo: `materials-recovery-3e77cfc34ca8`, PostgreSQL 16.14, Mailpit ficticio,
red interna sin puertos publicados y volumen nuevo. Origen `academia_v00_test`;
destino `recovery_3e77cfc34ca8_test`, otra BD del mismo laboratorio/servidor.
No usa la BD ni el volumen manual. Roles owner/runtime separados y ACL comprobadas.
Imagen API: `sha256:c13d8310193527418bb97f706420959e5ba9dc33815f6e99a46d179ed8fc68a8`.
HEAD: `cfc001eac89292c1b135dbba79be9a9ca8cc0b8b`; fuente de trabajo con cambios previos preservados,
identificada por `source-manifest.json` y su hash en el resultado estructurado.
La configuración privada y los hashes de fuente permanecieron iguales durante
la ejecución. No se atribuye el ensayo solamente al commit de base.

## Resultados observados

| Fase | Resultado |
| --- | --- |
| legacy | 0001–0007 desplegadas realmente; Material ausente; identidad, oferta y finanzas ficticias inventariadas; respaldo cifrado previo a materiales |
| upgrade | 0008/0009 aplicadas; huellas anteriores conservadas; seis materiales creados mediante HTTP real |
| restart | Dos procesos API con PID distintos; bytes/estados conservados y carga pendiente sin completar |
| postbackup | Retiro y publicación reales posteriores a la copia, dos decisiones conocidas que la copia no contiene |
| restore | Nueva BD, igualdad de snapshot/catálogo/ACL, inventario y bytes completos antes de invalidación; permisos y decisiones revisados |

Cinco fases aprobadas (1/1 cada una, sin omitidos); lint API, build API y tipos
del ensayo aprobados. Cifrado autenticado: 7/7 pruebas. Guardas operativas: 5/5
(no sobrescribir copia, mantenimiento obligatorio, clave incorrecta/copia corrupta
sin crear destino, destino existente intacto y limpieza de texto plano parcial).
Tiempo UTC/America-Lima: 2/2. Cuatro scripts PowerShell analizados sin errores.

El corpus incluye PDF/JPEG/PNG, estados PREPARED/PUBLISHED/WITHDRAWN,
un grupo cancelado y una intención PENDING sin archivo. Cada bytea se compara
completo con el fixture y SHA-256 persistido, además de tamaño, grupo, autor
original, revisión y estado. Las descargas reales del administrador comparan
buffers completos y `Cache-Control: no-store`. Textos/nombres participan en
hashes de metadata; no se exportan archivos ni contenido privado a esta evidencia.

La copia reúne metadatos/bytea/intenciones/ledger/auditoría en un solo pg_dump.
El inventario opcional verifica los hashes desde PostgreSQL y restore-check
exige igualdad antes de retornar `materialsVerified=true` y `trafficReady=false`.
Conserva formato ACADBKP1 y respaldo sin inventario para el origen 0007.

Una migración 0010 deliberadamente inválida se ejecutó solo en una copia temporal
de Prisma. Quedó una entrada fallida real y ninguna tabla parcial de su transacción.
La recuperación conservó la fuente fallida y creó otra BD desde el respaldo;
no reescribió migraciones ni ejecutó down migration. Reaplicar las nueve
migraciones existentes al destino fue idempotente.

Se comprobaron restricciones de autor/contenido y falta de DDL para runtime.
Tras invalidar el estado restaurado, todas las sesiones antiguas dieron 401;
login nuevo y permisos se probaron para administrador, docente original,
docente sucesor, alumno vigente, alumno histórico y alumno ajeno. El autor
original sigue siendo el original pese al cambio de docente; el docente anterior
no recupera acceso. La matrícula vencida no habilita descargas, y la carga
pendiente no se completa. Catálogo/ACL y datos financieros permanecen iguales.
Los logs de invalidación registran inicio/éxito sin emails, contraseñas o secretos
de los actores ficticios.

El replay de un comando anterior conserva su recibo y no agrega filas de
material/contenido/intención/ledger/auditoría. Las dos decisiones posteriores
no existen en la copia. En cuarentena, el operador ficticio revisa y reaplica
solo el retiro conocido; repetirlo es idempotente y el alumno recibe 404.
El preparado permanece inaccesible: su publicación perdida no se reejecuta
automáticamente. Esto acredita el procedimiento para esas dos decisiones
conocidas, sin prometer recuperar otros cambios posteriores al respaldo.

## Hashes y tiempos del laboratorio

- Archivo cifrado: 198688 bytes; SHA-256 `4c59a55f9ba3e747cd641e566ce5d2d1412b0c9ba74f318289be81e4dffa9463`.
- Dump descifrado: SHA-256 `8762187854ad6295311e446f4c8e3f3defae23c1e3d9b1121fc80ba66256bf89`.
- Inventario: SHA-256 `1f153d5bdd37d544c93dc7d8fe715946d575de9e4946088bd8b75113a3253675`;
  6 materiales, 1522 bytes de contenido.
- SQL deliberadamente fallido: SHA-256 `2a8d81ab2a22385583f91232df44f43a8819188ebf37560d381c74035aae57cf`.
- Inicio de respaldo: 2026-11-17T15:13:08.6470533Z; copia terminada: 2026-11-17T15:13:09.9428673Z.
- Fallo confirmado: 2026-11-17T15:13:57.4144740Z; verificación completa: 2026-11-17T15:15:04.3026176Z.
- Intervalo máximo observado desde inicio de copia hasta fallo: 48.767 s.
- Intervalo desde fallo confirmado hasta verificación completa: 66.888 s.

Son intervalos de este laboratorio, con pruebas incluidas; no son RPO/RTO
acordados ni tiempo de restitución de tráfico público. No se abrió tráfico.

## Incidente inicial, preservación y límites

El primer intento `materials-recovery-12ff4747a212` pasó legacy/upgrade/restart
y se detuvo al limpiar el SQL temporal del inventario: docker cp lo creaba como
root y postgres no podía borrarlo del directorio /tmp con sticky bit. Se corrigió
la limpieza del único archivo temporal, sin cambiar datos o reglas de materiales,
y se repitió todo en el proyecto nuevo registrado arriba. Ambos laboratorios
quedaron detenidos, con volúmenes y archivos privados conservados.

La comparación con 1094 archivos previos permite solo herramientas/documentos
de recuperación y actualización de estado; producto, pruebas previas,
migraciones, dependencias, rama y entorno manual preservados. No se repitieron
las suites amplias de T060: sus resultados históricos permanecen en
[automated.md](automated.md); aquí se ejecutaron los controles específicos de recuperación.

Resultados privados: `.cache/materials-recovery-3e77cfc34ca8`. No publicar handoff.json, archivos de entorno,
claves, dumps, logs ni reportes completos. Clave y copias están en directorios
separados con ACL privada del mismo host: no acreditan custodia externa ni
recuperación ante pérdida física del host. Fuente/destino comparten servidor.
No se aceptan D13, retención, custodio, destino externo o RPO/RTO; tampoco recursos
T063, capacidad D10, humanos T064/MV13, CI remoto, proveedor de pago, 24 h reales,
despliegue ni cierre integral de 001–003. No se purgaron copias o volúmenes.
