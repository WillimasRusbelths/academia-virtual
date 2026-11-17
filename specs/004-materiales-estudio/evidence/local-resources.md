# Recursos locales de materiales — T063

Fecha: 2026-11-17, America/Lima. **T063 completada** con medición real en laboratorio
aislado. No acepta D10, 2500 usuarios activos ni capacidad del VPS. Estado 63/68;
T064 preparada, pendiente por participantes no disponibles según el responsable.
[Resultado estructurado y hashes](t063-t064-results.json).

## Reproducción y configuración

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-materials-resources.ps1 -ApiImage academic-offering-fa3d46bddbb8-api:latest
```

Proyecto nuevo `materials-resources-46d285396ecb`, red interna sin puertos publicados, volumen y
credenciales exclusivos, PostgreSQL 16.14 y Mailpit ficticio. API y generador
son procesos Node distintos en el contenedor runner; PostgreSQL está en otro
contenedor de la misma VM Docker Desktop. No hay generador en infraestructura
separada ni proxy HTTPS. El entorno manual queda preservado. Todos los servicios
de este ensayo quedaron detenidos; se conservaron volumen y evidencia privada.

- Imagen: `sha256:c13d8310193527418bb97f706420959e5ba9dc33815f6e99a46d179ed8fc68a8`; HEAD base `cfc001eac89292c1b135dbba79be9a9ca8cc0b8b`.
- La fuente real incluye cambios de trabajo previos: source-manifest.json identifica
  cada archivo API/recovery y su hash; ver hash del manifiesto en el resultado.
  Configuración y fuente verificadas sin cambios durante el ensayo.
- Runtime observado: Node v22.23.1, V8 12.4.254.21-node.56,
  linux/x64; kernel Linux 6.18.33.2-microsoft-standard-WSL2 x86_64 GNU/Linux.
- Materiales: 20000000 bytes por archivo, 2
  transferencias por proceso, 1 por actor; pool máximo
  10, timeout de upload 60000 ms.
- PostgreSQL: shared_buffers 16384 páginas
  (128 MiB), max_connections 100,
  wal_level replica, full_page_writes
  on, wal_compression
  off, TOAST
  pglz.
- Sin límites CPU/RAM adicionales de Compose. La lectura docker stats muestra
  el límite de memoria de su VM/contenedor; no representa RAM física del VPS.
- Corpus: PDF sintético estructuralmente válido de 20000000 bytes,
  SHA-256 `0d97becb3537c80e0ae700b9b503c6ea035f0f1b5c13e81fbb328ec7b8eae9d4`. Relleno muy compresible: los tamaños físicos
  y del backup NO son representativos de imágenes o documentos de alta entropía.

## Mediciones de procesos y WAL

Un caso Vitest integrado aprobado (sin fallos/omitidos), con siete ventanas
medidas. Memoria API por IPC desde el hijo; memoria del generador desde el padre.
Muestreo de 25 ms y muestras adicionales al observar operaciones Buffer/SQL.
RSS, heapUsed, external, arrayBuffers, muestras y valores finales se conservan
en JSON. No se fuerza GC ni se reinicia la API entre ventanas: la línea base
incluye asignaciones retenidas y GC de operaciones anteriores.

| Ventana | Duración observada (ms) | RSS API base → pico (MiB) | Pico arrayBuffers API (MiB) | Pico RSS generador (MiB) | Delta WAL (bytes) |
| --- | --- | --- | --- | --- | --- |
| Carga de 20 MB | 929.82 | 146.37 → 237.62 | 79.16 | 151.88 | 247960 |
| Descarga de 20 MB | 727.91 | 199.55 → 299.50 | 121.29 | 183.63 | 560 |
| Dos cargas retenidas, exceso y aborto | 966.38 | 299.50 → 299.63 | 140.51 | 172.25 | 1928 |
| Carga lenta | 2431.90 | 219.96 → 257.91 | 95.40 | 172.25 | 247864 |
| Descarga lenta | 1805.49 | 257.91 → 290.00 | 121.30 | 172.75 | 888 |
| Fallo SQL 53100 | 980.29 | 258.12 → 264.25 | 108.47 | 172.88 | 247400 |
| Fallo SQL 53200 | 1076.20 | 257.62 → 262.00 | 97.38 | 172.88 | 248256 |

Máximo observado API: **299.63 MiB RSS**; generador:
**183.63 MiB RSS**, informados por separado. Son máximos muestreados
por proceso, no la suma ni el pico simultáneo de toda la máquina. Las duraciones
incluyen instrumentación, aserciones y comprobaciones del escenario; no son
latencia p95, benchmark sin instrumentación o SLA. Los deltas WAL por ventana
incluyen actualizaciones legítimas de sesión y demás SQL de ese escenario.

## Copias y transferencia

El proceso de prueba observa Buffer.copy, from, alloc/allocUnsafe/allocUnsafeSlow
y concat conservando los argumentos/retornos originales; también cuenta Buffer
en parámetros/resultados de consultas reales. No escribe bytes, SQL, credenciales
o rutas privadas en el informe. Los contadores son volúmenes acumulados por
operación observada: pueden solaparse, incluyen protocolo y no equivalen a copias
simultáneas vivas. No ven todas las asignaciones nativas ni strings internos del
driver. Esta instrumentación introduce sobrecosto y se limita al proceso de test.

| Ventana | Bytes Buffer.copy | Bytes resultado Buffer.from | Bytes Buffer en parámetros SQL | Bytes Buffer en resultados SQL |
| --- | --- | --- | --- | --- |
| Carga de 20 MB | 60007726 | 40000539 | 20000032 | 0 |
| Descarga de 20 MB | 106782852 | 126 | 32 | 20000000 |
| Dos cargas retenidas, exceso y aborto | 98911403 | 878 | 160 | 20000000 |
| Carga lenta | 60007726 | 40000539 | 20000032 | 0 |
| Descarga lenta | 106726935 | 323 | 64 | 20000000 |
| Fallo SQL 53100 | 156925927 | 40000377 | 20000064 | 20000000 |
| Fallo SQL 53200 | 149864101 | 40000377 | 20000064 | 20000000 |

La carga de 20 MB observó 60007726 bytes
acumulados en copy y 40000539 en resultados
from; el pico arrayBuffers fue 79.16 MiB.
Estos datos confirman que el tamaño del archivo no es el consumo total de memoria.
No se afirma streaming bytea con RAM constante ni un multiplicador universal.

La carga completa respondió 201; PostgreSQL verificó octet_length y SHA-256
calculado desde el bytea. La descarga respondió 200, Content-Length exacto,
20 000 000 bytes contados y hash completo igual al corpus. Se publicó mediante
acción explícita y se descargó con matrícula vigente, usando HTTP real.

Dos cargas de actores distintos se retuvieron tras 1024 bytes cada una, con
Content-Length 20 MB. La solicitud adicional del mismo actor respondió 429 y
la de un tercer actor 503, antes de consumir sus cuerpos. Se abortaron las dos
cargas; sus intenciones siguieron pendientes, sin material parcial, y una nueva
descarga acreditó liberación de la admisión. No se agregó cola de espera.

La carga lenta envió bloques de 256 KiB con 25 ms entre bloques. La descarga
lenta pausó lectura 500 ms y continuó con 2 ms entre bloques recibidos. Comparó
longitud y hash completos; mientras estuvo pausada, el mismo actor recibió 429.
Durante la espera se observó el pool completo idle, sin waiting ni transacciones
SQL idle in transaction. No hay conexión SQL retenida por esa red lenta.

## BD, disco, tráfico y respaldo

Tras fixtures: 5 contenidos/1455
bytes lógicos; al final: 7/40001455.
Dos nuevas cargas de 20 MB confirmadas; las cargas abortadas/fallidas no agregaron
materiales. Datos financieros ficticios y contenido previo verificado permanecieron
intactos. Intenciones fallidas se conservan; no se purga ni se redefine retención.

| Medición | Antes | Después | Alcance |
| --- | --- | --- | --- |
| pg_database_size, con fixtures (bytes) | 10222615 | 11213847 | BD del ensayo, delta 991232 |
| pg_total_relation_size MaterialContent (bytes) | 32768 | 1024000 | Incluye TOAST/índices/espacio reutilizable |
| Clúster du -sk (KiB) | 46688 | 50384 | Desde BD vacía a fin de test; incluye catálogo/fixtures |
| pg_wal du -sk (KiB) | 16392 | 16392 | Segmentos asignados; no confundir con bytes WAL escritos |
| Memoria contenedor PostgreSQL | 31.97MiB / 6.74GiB | 40.37MiB / 6.74GiB | Dos lecturas docker stats, no RSS PostgreSQL ni pico |
| Red contenedor PostgreSQL, entrada/salida | 1.57kB / 126B | 80.7MB / 201MB | Acumulada; incluye fixtures, consultas y comprobaciones |
| Block I/O contenedor PostgreSQL | 4.1kB / 52.3MB | 8.19kB / 61.4MB | Lecturas/escrituras acumuladas, no disco físico exclusivo |

df -Pk después del ensayo (bloques de 1024 bytes), en la VM compartida:

```text
Filesystem     1024-blocks     Used Available Capacity Mounted on
/dev/sdd        1055762868 42929372 959130024       5% /var/lib/postgresql/data
```

No asignar cambios de ese filesystem compartido exclusivamente a la aplicación.
No se llenó el disco físico ni se redujeron volúmenes. WAL también existe cuando
una transacción se revierte: en este ensayo se observaron
247400/248256
bytes WAL en las ventanas de fallo.

Con escritores y proceso API detenidos, pg_dump conjunto cifrado AES-256-GCM:
278381 bytes en 2.447 s, inventario de
7 materiales/40001455 bytes
lógicos; hashes completos verificados desde bytea.
Cifrado SHA-256 `49eb18f489e59b932b27405d6b7ca53bc1355cfd8eca1b40870fef8de7e37774`; dump SHA-256
`a14396607821af68932f56a42c9944b3bfe8e4245be4221d0e393572b7d5010f`; inventario SHA-256
`e9797d887d7bb4890bdabf33cfef04a9b59db22f9469c1c310992fd938cbb6ef`.
El pequeño tamaño comprimido refleja este corpus artificial. El campo privado
backupNotYetMeasured describe el cierre de la fase API; el respaldo posterior
está medido por el wrapper y registrado en summary.backup. No se repitió restore
en T063; la recuperación real de T062 conserva su [evidencia](recovery.md).

## Fallos, validación y preservación

Se inyectaron SQLSTATE 53100 (espacio) y 53200 (memoria) después de ejecutar
realmente INSERT MaterialContent, antes del commit. Ambos devolvieron 503 seguro;
la transacción revirtió material/contenido/auditoría, intención PENDING conservada,
sin cambio de finanzas o del archivo confirmado anterior y con plaza liberada.
Es inyección en el proceso de test, no un agotamiento físico de disco/RAM.

Primer arranque materials-resources-b06e72c0972a: falló la conversión de salida
du antes de transferencias. Se corrigió el parser del prefijo numérico y se repitió
todo en el proyecto nuevo. Ambos quedaron detenidos y preservados.
Los controles previos de tipos/lint detectaron imports de tipos y declaraciones
de Node del harness; se corrigieron antes de la ejecución válida.
Lint API, tipos del ensayo, build API y parser PowerShell aprobados.

1099 archivos previos comparados: producto, pruebas previas, migraciones,
dependencias, rama y entorno manual preservados. Solo se agregan herramientas de
ensayo y evidencia/estado de este bloque. No se repitieron suites amplias T060.
No CI remoto, compras, despliegue o tráfico público; no aceptación humana, D10,
D13, RPO/RTO, 24 h reales, proveedor de pago o cierre de 001–003.
Evidencia privada en `.cache/materials-resources-46d285396ecb`; no publicar entorno, claves, dumps o reportes/logs
completos. No extrapolar este volumen pequeño y compresible a 2500 activos,
datos de alta entropía, móvil o red externa.
