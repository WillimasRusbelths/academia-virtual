# T087: comparación temporal de respuestas públicas

## Protocolo y alcance

Se aplica [U2](../verification.md#protocolo-temporal-de-enumeración--t087-u2), sin modificar
muestras, cuotas, parámetros criptográficos ni umbrales. El [runner](../../../apps/api/tests/security/enumeration.ts)
usa la composición HTTP real, PostgreSQL y fixtures restringidos a un esquema nuevo `t_*`.
Los [cálculos](../../../apps/api/tests/security/enumeration-protocol.ts) tienen
[pruebas independientes](../../../apps/api/tests/security/enumeration-protocol.spec.ts).

Por ruta: tres rondas; cada una, 10 calentamientos por clase con identidades separadas y
100 muestras por clase, incluido un segundo grupo de referencia equivalente. Se intercalan
las clases en bloques con semilla **20261015**. Solo una solicitud en vuelo, pausa fija de
**200 ms**, reloj real, cuerpos del mismo tamaño por ruta y claves ASCII de 43 caracteres.
Cada solicitud usa un correo nuevo; los hashes tienen sales distintas y Argon2id
`m=19456 KiB, t=2, p=1`, sin reducir su costo.

| Ruta | Referencia y control | Clases comparadas | Estado exigido |
| --- | --- | --- | --- |
| `/auth/login` | ACTIVE verificado, clave propia incorrecta | Inexistente; DISABLED y no verificado con clave incorrecta/coincidente; cambio inicial pendiente con provisional incorrecta/coincidente | 401 |
| `/auth/password/initial` | ACTIVE, provisional vigente incorrecta | Inexistente; DISABLED con provisional incorrecta/coincidente; provisional vencida coincidente; ya sustituida | 401 |
| `/auth/register` | Registro elegible con correo nuevo | Duplicado | 202 |
| `/auth/verification/request` | ACTIVE no verificado | Inexistente, DISABLED, ya verificado | 202 |
| `/auth/password/forgot` | ACTIVE verificado | Inexistente, DISABLED, no verificado | 202 |

Son **29 clases**, con 8700 respuestas medidas y 870 calentamientos ejecutados. No se mezclan
login/cambio inicial exitosos, errores, cuotas ni rutas distintas en las estadísticas.

Se miden envío → cuerpo completo con reloj monotónico. Mediana: media de posiciones 50/51;
p95: posición `ceil(0.95×100)`. Una comparación cruza si su diferencia absoluta supera:

- Mediana: `max(20 ms, 10 % de la mediana de referencia)`.
- p95: `max(50 ms, 20 % del p95 de referencia)`.

Cruce del mismo umbral/dirección en dos rondas: **fallo**. Cero cruces: **sin señal detectada
bajo este protocolo**. Otros resultados, ruido del control, 5xx o timeout: **inconcluso**.
Un 429 se registra con Retry-After y obliga a esperar la ventana real y repetir íntegramente;
un resultado público inesperado es fallo funcional. No se descartan muestras lentas ni se
seleccionan rondas favorables. La repetición permitida exige diagnóstico previo.

## Condiciones y trazabilidad

API y generador comparten proceso Node y contenedor efímero; PostgreSQL está en `db:5432`. Mailpit
permanece disponible y el ejecutor interno se detiene antes de calentar, dejando la cola
persistida sin procesar. No se ejecutan otras suites durante las mediciones. Los servicios
manuales permanecen disponibles, sin usar sus cuentas o esquema para el ensayo.

Se preparan **330 IP de loopback reales** dentro del namespace Linux, comprobadas mediante
el socket y `request.ip` del backend; no se usa X-Forwarded-For. El bloque
`(ronda−1)×110+bloque` determina el origen, común a todas las clases/rutas. Las tres rutas
públicas suman **13 admisiones por IP**, incluidos calentamientos, por debajo de 20/h; cada
destinatario/propósito recibe una sola admisión. No se borran contadores ni se reinicia la
API entre muestras. Política única: HTTP/1.1 keep-alive, un agente por IP, `maxSockets=1`.

Se comparan cuerpos completos y cabeceras de seguridad/tipo/longitud. Solo se normalizan
Date y requestId después de validar sus formatos. No se normalizan códigos, contenido,
cookies o Retry-After. Los ETag derivados del cuerpo aleatorio no son cabeceras de seguridad.
Los archivos ignorados conservan muestras `{round,order,class,duration,status}`, orden,
calentamientos, configuración, incidencias y cálculos; no incluyen correos, claves o cuerpos.

## Ejecución y resultados

La repetición completa finalizó con el resultado indicado abajo. El cierre técnico de US5 se registra por separado en [T088](us5.md).

El primer arranque no recogió muestras: se corrigió la firma de opciones del wrapper para
Vitest 5 antes de iniciar la medición. Se conserva su registro y se distingue de una ronda
inválida de muestreo. No se alteró el protocolo.

El siguiente intento se invalidó íntegramente: en la primera ronda de login, el control
tenía p95 de 188,68 ms frente a 248,50 ms de referencia (diferencia −59,82 ms, umbral 50 ms).
El diagnóstico del orden confirmó que las semillas consecutivas de Xorshift fijaban el
control en la última posición de los 100 bloques. Se detuvo el contenedor temporal, se
conservaron sus **1475 muestras y 180 calentamientos**, y se limpió solo su esquema aislado
verificado: 7590 usuarios sintéticos, cero administradores, sesiones o entregas.

Se corrigió el mezclado de semillas con Mulberry32, manteniendo la semilla prefijada,
y se añadió una prueba que detecta posiciones fijas. Cálculos/orden: 5/5 pruebas aprobadas.
Además, la repetición escribe muestras al filesystem local y las copia al host al terminar
cada ronda, evitando IO síncrono por muestra sobre el bind mount de Windows. No se atribuye
todo el ruido a una causa única: el sesgo del runner sí quedó demostrado; su efecto concreto
en cada latencia no. La repetición vuelve a ejecutar las tres rondas de las cinco rutas,
sin reutilizar muestras, relajar umbrales ni cambiar el código productivo.

## Resultados completos de la repetición

Las cifras se muestran con tres decimales; los cruces se calculan con precisión completa.

| Ruta / clase | Mediana R1 / R2 / R3 (ms) | p95 R1 / R2 / R3 (ms) | Cruces mediana/p95 R1 / R2 / R3 |
| --- | --- | --- | --- |
| login / reference | 53.134 / 53.117 / 54.514 | 71.431 / 74.081 / 171.286 | — · — · — |
| login / control | 54.829 / 53.817 / 54.548 | 71.909 / 77.541 / 151.948 | 0/0 · 0/0 · 0/0 |
| login / absent | 53.576 / 53.202 / 54.784 | 70.665 / 74.368 / 168.953 | 0/0 · 0/0 · 0/0 |
| login / disabled-wrong | 54.009 / 53.976 / 55.668 | 68.823 / 72.163 / 158.774 | 0/0 · 0/0 · 0/0 |
| login / disabled-match | 53.498 / 53.018 / 56.211 | 83.331 / 87.291 / 155.104 | 0/0 · 0/0 · 0/0 |
| login / unverified-wrong | 55.010 / 53.013 / 54.608 | 74.113 / 70.401 / 138.096 | 0/0 · 0/0 · 0/0 |
| login / unverified-match | 53.084 / 52.926 / 56.266 | 78.073 / 71.768 / 129.337 | 0/0 · 0/0 · 0/0 |
| login / pending-wrong | 53.290 / 54.018 / 53.016 | 76.098 / 68.408 / 140.473 | 0/0 · 0/0 · 0/0 |
| login / pending-match | 53.703 / 53.939 / 54.482 | 72.486 / 74.640 / 143.884 | 0/0 · 0/0 · 0/0 |
| initial / reference | 52.608 / 53.058 / 53.265 | 70.300 / 79.471 / 69.676 | — · — · — |
| initial / control | 53.172 / 53.752 / 52.346 | 80.284 / 73.035 / 76.179 | 0/0 · 0/0 · 0/0 |
| initial / absent | 52.748 / 53.885 / 51.749 | 65.856 / 75.654 / 69.564 | 0/0 · 0/0 · 0/0 |
| initial / disabled-wrong | 53.851 / 54.149 / 52.708 | 71.854 / 73.261 / 74.797 | 0/0 · 0/0 · 0/0 |
| initial / disabled-match | 52.236 / 52.285 / 52.934 | 69.106 / 77.245 / 69.979 | 0/0 · 0/0 · 0/0 |
| initial / expired-match | 52.076 / 53.662 / 52.819 | 71.119 / 77.175 / 75.068 | 0/0 · 0/0 · 0/0 |
| initial / replaced | 52.972 / 54.795 / 52.164 | 75.419 / 75.419 / 71.918 | 0/0 · 0/0 · 0/0 |
| register / reference | 51.290 / 53.774 / 52.495 | 75.308 / 83.452 / 70.842 | — · — · — |
| register / control | 51.473 / 52.126 / 53.064 | 79.883 / 92.010 / 72.446 | 0/0 · 0/0 · 0/0 |
| register / duplicate | 47.280 / 48.944 / 48.677 | 68.719 / 89.401 / 66.538 | 0/0 · 0/0 · 0/0 |
| verification / reference | 15.900 / 15.730 / 15.175 | 35.183 / 25.322 / 22.885 | — · — · — |
| verification / control | 16.809 / 15.390 / 15.344 | 49.443 / 24.482 / 28.888 | 0/0 · 0/0 · 0/0 |
| verification / absent | 11.786 / 11.431 / 11.207 | 32.487 / 21.243 / 22.324 | 0/0 · 0/0 · 0/0 |
| verification / disabled | 14.685 / 13.067 / 13.134 | 48.176 / 19.844 / 21.580 | 0/0 · 0/0 · 0/0 |
| verification / verified | 14.254 / 12.856 / 13.193 | 33.280 / 22.034 / 21.661 | 0/0 · 0/0 · 0/0 |
| forgot / reference | 15.233 / 14.963 / 15.212 | 24.637 / 26.621 / 27.232 | — · — · — |
| forgot / control | 15.325 / 15.306 / 15.476 | 28.368 / 26.784 / 23.491 | 0/0 · 0/0 · 0/0 |
| forgot / absent | 11.279 / 11.359 / 11.447 | 20.226 / 19.509 / 21.622 | 0/0 · 0/0 · 0/0 |
| forgot / disabled | 12.920 / 13.050 / 13.280 | 23.051 / 27.045 / 25.313 | 0/0 · 0/0 · 0/0 |
| forgot / unverified | 12.867 / 12.982 / 13.254 | 18.150 / 24.125 / 22.209 | 0/0 · 0/0 · 0/0 |

Resultado: **sin señal detectada bajo este protocolo**. Recalculado independientemente desde las muestras: 8700 respuestas medidas, 870 calentamientos y 0 comparaciones con cruces.

La mayor diferencia absoluta entre clases y referencia fue **4,830 ms en mediana** y
**41,949 ms en p95**, incluidos los controles. En estas rondas los mínimos absolutos
dominan las fórmulas: umbrales efectivos de **20 ms** y **50 ms**. Login R3 tuvo un p95
de referencia de 171,286 ms, superior a R1/R2; se conserva esa variación y todas sus
muestras. Ni sus comparaciones ni el control cruzaron el umbral.

Configuración registrada: revisión productiva `8a20214609829cfaea2b1c2c119994828bd1d020` más el runner local identificado por SHA-256 `27a4e2838b4dc634dc4d581bb1ea69c1429612db67734e7e418093c653e775c4`; lockfile `6f2c05e1f0f7fa2e0f084ac7977f4360e9260814728e0590db82bced925a6292`.

Diff local al iniciar: SHA-256 `1e04fbbec41872768e4653d2202f73e9ddf7863fe4d6d2476d6d10705bc23e4d`; protocolo/orden: `99379e5c7227c2b9c7845753a13c086c9226570906da2f2f9896de97c3a2dee0`. Versión del runner: `2`; semilla: `20261015`.

Node `v22.23.1`, linux `6.18.33.2-microsoft-standard-WSL2`, CPU AMD Ryzen 7 3750H with Radeon Vega Mobile Gfx (8 hilos visibles); RAM de la VM 6.74 GiB, cpu.max `max 100000`, memory.max `max`, pool 10. PostgreSQL: `PostgreSQL 16.14 (Debian 16.14-1.pgdg12+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit`.

Medición UTC: `2026-10-15T21:13:01.207Z` → `2026-10-15T21:52:06.916Z`. Duración total, incluida preparación: 42.12 minutos. Los resultados crudos y el informe JSON íntegro quedan en `.cache/us5/u2/attempt-03/`, ignorados por Git.

Estado final del esquema aislado: 8250 cuentas; cero sesiones/eventos de auditoría y
marca de bootstrap sin establecer; 1980 tokens y 1980 entregas pendientes, sin procesamiento
SMTP. Las cuentas preexistentes permanecieron sin cambios. Orígenes con cuota persistida:
330, mínimo/máximo 13/13 admisiones por IP. La limpieza final del esquema terminó correctamente.

En la repetición completa: ninguna respuesta 429/5xx ni timeout, ninguna exclusión selectiva y ninguna diferencia pública. Los 870 calentamientos se excluyen solo de las estadísticas, como exige U2. El intento invalidado anterior permanece separado y no aporta muestras a estos cálculos.

## Reproducción

Usar un contenedor efímero API con las fuentes/pruebas actuales montadas, la configuración
de pruebas de Compose, PostgreSQL y Mailpit existentes. Compilar la API con
`npm run build --workspace @academia/api`; desde `apps/api`, ejecutar primero
`npx vitest run tests/security/enumeration-protocol.spec.ts --maxWorkers=1` y luego
`npx vitest run tests/security/enumeration.spec.ts --maxWorkers=1`.

El segundo comando requiere `APP_ENV=test`, `U2_OUTPUT` bajo `/enumeration-results/`
apuntando a un directorio nuevo de un volumen de resultados ignorado, `U2_REVISION` con
el SHA completo de HEAD y `U2_DIFF_SHA256` con la huella del diff al iniciar. No publica
puertos ni utiliza el esquema manual. No ejecutar otras suites durante las mediciones.
Las migraciones existentes se despliegan únicamente en el esquema nuevo de cada ensayo.

## Limitaciones

Estas mediciones buscan señales temporales en respuestas equivalentes del entorno local.
No prueban ausencia de todo canal lateral, disponibilidad pública ni capacidad de 1000
usuarios. La contención del host compartido, la topología y el estado del worker limitan
la extrapolación. Retención, restauración, carga y aceptación humana siguen en sus tareas.
