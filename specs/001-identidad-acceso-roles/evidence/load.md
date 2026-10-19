# T103 — ejecución de ID-LOAD-01/02

2026-10-16; ejecución automatizada por el agente, sin aceptación humana atribuida.
Base funcional `d8e433613f4295f372b8e6c9dbc5f607b2cb16ac`, árbol inicial limpio.
[T103 y dependencias](../tasks.md), [protocolo](../verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas),
[preparación válida T099–T102](load-preparation.md) y
[procedimiento reproducible](../../../load-tests/identity/README.md) revisados.
Checklist 16/16; sin AGENTS.md aplicable ni hooks. No se cambian requisitos ni umbrales.

## Procedencia, aislamiento y condiciones

Reutilizado exclusivamente `identity-load-80c2b6fa22ce`: red interna sin puertos,
PostgreSQL/volúmenes propios, schema `t_load_identity`, guardas T029 y marcador de BD.
1120 cuentas STUDENT activas/verificadas: 1000 de sesiones, 20 de calentamiento y 100
de autenticación, disjuntas y con contraseñas/hashes distintos. Cero sesiones válidas
antes de empezar; manifiesto privado conservado. Las cuentas manuales no participan.
No se envían correos, no hay SMTP real, Izipay ni operaciones académicas.

Windows 11 Pro, Ryzen 7 3750H, ocho hilos; RAM visible 14 966 218 752 bytes,
libre al iniciar ID-LOAD-01: 4 162 355 200 bytes. Docker Linux: ocho CPU y
7 236 882 432 bytes RAM. Disco D: NTFS fijo lógico, 322 122 543 104 bytes,
316 963 069 952 libres; rendimiento físico de disco no medido.
API **2 CPU/1 GiB**, BD **1 CPU/512 MiB**, generador **1 CPU/512 MiB**.
Contenedores separados en la misma laptop/VM, con servicios manuales conservados:
hay contención del host. Observador cada segundo comparte CPU/pool con API;
captura externa Docker aproximadamente cada 3–4 s, con intervalos reales conservados.
HTTP interno sin TLS; no representa publicación.

Node 22.23.1, PostgreSQL 16.14; k6 **1.6.0+dirty**, commit `d97957fc61-dirty`, Go 1.25.6.
Lock host/instalado SHA-256 `6f2c05e1f0f7fa2e0f084ac7977f4360e9260814728e0590db82bced925a6292`.
Digests: API `sha256:c1cb1ac44556058ef8f6e0726b0c1f74b69b20f8812676d8ef9fa1520ba52a2b`,
PostgreSQL `sha256:64154d0babcb1741988719e703419af0382b19953706149f9872fbd0f438efa8`,
k6 `sha256:be2a9ceb1b6ffc573277af4157135882a6d6433968b41e858ab02c5fd5847532`.
La API monta y compila el código actual; el digest de la imagen base por sí solo
no lo identifica. Metadatos privados registran HEAD, diff y hashes de scripts.

Pool 10, Argon2id v19 m=19456 KiB/t=2/p=1/hash 32 bytes, dos trabajos simultáneos,
cola máxima 50 y espera máxima 5000 ms: **sin cambios**. No se desactivan cuotas,
CSRF, cookies, autorización ni comprobación de identidad; no se usan excepciones.
Paradas conservadas: espera hash >5000 ms, margen cgroup API <128 MiB, RAM Windows
<256 MiB, OOM o monitor no disponible. No son nuevos umbrales de aceptación.

Únicas correcciones de herramientas: admitir diff vacío en PowerShell; separar
duración completa de umbrales aprobados (k6 99); limitar la meseta al perfil de
sesiones; exigir una muestra coincidente para afirmar 1000; añadir estados HTTP y
cola de correo a los agregados. No cambia código de producto ni carga. El primer
intento falló antes de generar tráfico por diff vacío; se conserva ese antecedente.

## Perfiles y resultados

Calentamiento `sessions-warmup-c632761b`: 20 VU/20 cuentas aparte, 60 s más gracia,
67.765 s reales de generador (71.387 s externos); 229 solicitudes, 209 de tráfico
válido, 20 comprobaciones 401 separadas, 20 logins y 20 logouts, cero sobrantes.
Login p50/p95/p99: 1080.516/1509.203/1519.204 ms;
/me: 15.675/116.122/141.263 ms. Cero errores, 503, cruces o aceptaciones revocadas.
Cola hash pico 18, espera máxima 1116.605 ms, trabajo máximo 190.874 ms; sin parada.

**ID-LOAD-01 `sessions-a99bc32c`: ejecutado completo con resultado desfavorable.**
0→100/1 min→500/2 min→1000/2 min, meseta 10 min, descenso 2 min, sin alteraciones.
Inicio de escenario UTC 12:34:53.402, 1020.476 s generador / 1025.586 s externos.
k6 **exit 99** por latencias, API exit 0; ninguna parada ni OOM.

| Métrica | Resultado ID-LOAD-01 |
| --- | ---: |
| VU activos máximos / slots distintos validados en meseta | 1000 / 1000 |
| Sesiones válidas / usuarios / secretos / actividad reciente máximos coincidentes | 1000 / 1000 / 1000 / 1000 |
| Solicitudes API simultáneas, pico global incluido cierre | 555 |
| Solicitudes totales / tráfico válido / RPS total / RPS válido | 95 635 / 94 669 / 93.716 / 92.769 |
| Login p50 / p95 / p99 (ms), 1000 logins únicos | 105.565 / 1328.946 / 2077.204 |
| /me p50 / p95 / p99 (ms) | 319.202 / 1551.978 / 2794.672 |
| Errores inesperados / 503 / cruces / aceptaciones revocadas | 0 / 0 / 0 / 0 |
| Logouts completados / sobrantes revocados después | 966 / 34 |
| Muestras servidor / meseta / meseta con los cuatro conteos=1000 | 929 / 520 / 518 |
| Mayor hueco de observación / muestras externas | 4848 ms / 298 |
| Argon2 espera / trabajo máximos (ms) / cola pico / rechazados | 0.319 / 245.001 / 0 / 0 |
| Trabajos hash terminados, incluido dummy de arranque | 1001 |
| Conexiones PG observadas / pool máximo / espera pool pico / locks esperando | 11 / 10 / 546 / 0 |
| Bytes k6 enviados / recibidos | 21 775 924 / 54 832 027 |

Meseta UTC 12:39:53.402–12:49:53.402: primeras muestras 993 (12:39:53.510) y
998 (12:39:54.017); las 518 restantes muestran los cuatro conteos=1000 desde
12:39:54.603 hasta 12:49:53.266. Se alcanzan 1000, pero **no se acredita la totalidad
de los diez minutos con 1000**: retraso inicial 1.201 s y muestreo con huecos,
no observación continua. Actividad reciente significa lastAcceptedAt en últimos 15 s,
aparte de validez absoluta/inactividad/authVersion/estado. No se deducen sesiones de VU.

| Recurso | API | PostgreSQL | k6 |
| --- | ---: | ---: | ---: |
| Pico CPU Docker (%) | 189.32 | 100.01 | 100.89 |
| Pico memoria (MiB) | 192.9 | 71.7 | 479.7 |
| Último BlockIO observado, lectura/escritura | 77.8 kB / 242 kB | 0 / 2.25 MB | 0 / 328 MB |
| Último NetIO observado, entrada/salida | 508 / 546 MB | 468 / 462 MB | 82.8 / 49.8 MB |

CPU Docker 100 % corresponde aproximadamente a un núcleo; IO/red son contadores,
no tasas ni deltas exclusivos. BD conserva tráfico de preparación y perfiles previos.
El valor del generador puede reiniciarse al salir; conservar serie y bytes k6 aparte.
El conteo global de 11 conexiones no equivale al pool API: puede incluir conexiones
auxiliares; no se atribuyó su origen ni se elevó el pool de diez. Cuello visible:
espera de pool hasta 546 y BD en su
CPU asignada; hash sin cola. El generador también alcanza su CPU y 93.68 % de RAM,
limitando interpretación. Sin perfilado causal fino no se atribuye todo a una consulta.
No se ajusta pool/CPU/seguridad ni se repite el ensayo para buscar aprobación.

Recuperación separada `smoke-sessions-1b1a3d0f`: readiness aceptada, 2 VU, 14.811 s,
10 solicitudes, dos login/logout, ocho solicitudes válidas y dos 401 con cookies
anteriores. /me p95 33.066 ms, login p95 179.893 ms; cero errores/503/cruces/
aceptaciones revocadas y cero sobrantes. Prueba funcional posterior, sin carga de meseta.

**ID-LOAD-02 `authentication-a9f06111`: ejecutado completo.** Escalones constantes
10/25/50/100 VU, dos minutos cada uno, más gracia; inicio UTC 12:54:06.665.
485.917 s de generador / 489.017 s externos, k6 y API exit 0, sin paradas ni OOM.
100 cuentas distintas, ciclo login→/me→logout→pausa 5 s; sin 401 añadidos por ciclo.

| Métrica | Resultado ID-LOAD-02 |
| --- | ---: |
| VU máximos / pico solicitudes API simultáneas | 100 / 65 |
| Sesiones válidas distintas simultáneas, pico muestreado | 24 |
| Logins / consultas / logouts completados | 3770 / 3770 / 3770 |
| Solicitudes totales/válidas / RPS | 11 310 / 23.276 |
| Login p50 / p95 / p99 (ms) | 365.038 / 2239.718 / 2941.030 |
| /me p50 / p95 / p99 (ms) | 72.557 / 602.740 / 814.106 |
| Errores inesperados / 503 / cruces | 0 / 0 / 0 |
| Argon2 espera / trabajo máximos (ms) / cola pico / rechazados | 2426.521 / 493.065 / 35 / 0 |
| Trabajos hash terminados, incluido dummy de arranque | 3771 |
| Conexiones PG / espera pool pico / locks esperando | 10 / 32 / 0 |
| Muestras servidor / externas / hueco servidor máximo | 486 / 142 / 1866 ms |
| Bytes k6 enviados / recibidos | 3 060 410 / 5 819 220 |
| Limpieza dirigida: sobrantes / cuentas borradas | 0 / 0 |

| Recurso | API | PostgreSQL | k6 |
| --- | ---: | ---: | ---: |
| Pico CPU Docker (%) | 206.79 | 81.04 | 24.01 |
| Pico memoria (MiB) | 171.8 | 73.91 | 60.96 |
| Último BlockIO observado, lectura/escritura | 0 / 217 kB | 0 / 7.66 MB | 0 / 32 MB |
| Último NetIO observado, entrada/salida | 62.4 / 74.7 MB | 537 / 522 MB | 7.23 / 4.32 MB |

El máximo CPU es una muestra Docker y puede exceder ligeramente la cuota nominal
por el intervalo de medida; no se amplió la cuota. Dos hashes simultáneos y cola
acotada observados; espera <5 s, sin reducir Argon2. La API llega a su CPU asignada.
La muestra de 24 sesiones breves no representa 100 sesiones persistentes ni 100
solicitudes simultáneas. La aprobación nativa de k6 cubre login/errores/cruces;
**/me p95=602.740 ms incumple la referencia de 500 ms**, que ese script no configura
como threshold. El reporte contrasta el criterio aunque k6 termine con cero.

Desglose por tiempo de finalización de solicitudes, respecto al inicio del escenario
(no son ciclos completos por escalón; hay operaciones que cruzan fronteras):

| Escalón | Solicitudes | Respuestas login 200 | Login p50 / p95 / p99 (ms) |
| --- | ---: | ---: | --- |
| 10 VU, 0–120 s | 711 | 237 | 88.117 / 427.862 / 658.229 |
| 25 VU, 120–240 s | 1755 | 585 | 97.171 / 398.698 / 619.432 |
| 50 VU, 240–360 s | 3435 | 1145 | 115.407 / 791.215 / 1407.972 |
| 100 VU, 360–480 s | 5358 | 1788 | 1264.874 / 2496.792 / 3160.374 |
| Gracia, >480 s | 51 | 15 | 1206.967 / 1386.827 / 1388.275 |

Recuperación separada `smoke-sessions-7e001172`: readiness aceptada, 2 VU, 18.626 s,
10 solicitudes, dos login/logout y dos rechazos 401 con cookies previas; cero errores,
503, cruces, aceptaciones revocadas o sobrantes. /me p95 61.675 ms, login p95
293.274 ms. Se observó recuperación funcional al reiniciar el proceso aislado;
no se midió recuperación automática sin reinicio ni se aprobó un SLA.

## Cumplimiento, conservación y reproducción

| Criterio contrastado | ID-LOAD-01 | ID-LOAD-02 |
| --- | --- | --- |
| Programa/muestra/duración prescritos ejecutados | Sí, 17 min | Sí, 8 min más gracia |
| /me p95 <500 ms | **Incumplido: 1551.978** | **Incumplido como referencia: 602.740** |
| /me p99 <1000 ms | **Incumplido: 2794.672** | Cumplido: 814.106 |
| Login p95 <3000 ms | Cumplido: 1328.946 | Cumplido: 2239.718 |
| Errores inesperados <1 % de tráfico válido | Cumplido: 0/94 669 | Cumplido: 0/11 310 |
| Cruces de identidad / duplicados observados | 0 / 0 | 0 / 0 |
| Rechazo tras revocación, escenario funcional aparte | Dos cookies previas rechazadas tras el perfil | Dos cookies previas rechazadas tras el perfil |
| 1000 VU y sesiones válidas distintas alcanzados | Sí, condición independiente demostrada | No aplicable al escenario de 100 cuentas |
| 1000 durante los diez minutos íntegros | **No acreditado**, dos muestras iniciales incompletas y huecos | No aplicable |
| Espera hash ≤5 s; memoria suficiente; controles conservados | Sí; sin paradas | Sí; sin paradas |

Los ceros de cruces provienen de validar ID/rol en cada respuesta válida y los de
duplicados de asignación exclusiva, hashes/usuarios distintos y diferencias cero
en las muestras de sesiones válidas. No equivalen a observación continua entre
muestras. Auditoría posterior de filas reales: calentamiento 20 sesiones/20 cuentas/
20 secretos; ID-LOAD-01 1000/1000/1000; ID-LOAD-02 3770/100/3770. Todas revocadas
al auditar, incluido efecto de limpieza; nunca se usa ese estado posterior como
prueba de revocación en meseta. Auth no comprobó cookie vieja en cada uno de sus
3770 ciclos: esa verificación es el escenario funcional separado.

Estados HTTP crudos: calentamiento login 200×20, /me 200×169, logout 204×20 y
comprobación 401×20; ID-LOAD-01 login 200×1000, /me 200×92 703, logout 204×966 y
comprobación 401×966; ID-LOAD-02 login 200×3770, /me 200×3770, logout 204×3770.
Ambos smokes posteriores suman cuatro comprobaciones 401 adicionales, fuera de
tráfico válido. No se observaron 429/503, fallos de transporte ni otros estados.

1120 User y singleton conservan sus huellas antes/después de **cada ejecución**.
Limpieza exclusivamente dirigida al manifiesto del ensayo: 34 sobrantes revocados
tras ID-LOAD-01, cero en las demás ejecuciones; repetición final revoca cero y borra
cero. Snapshot final: 1120 cuentas, cero sesiones válidas en las tres cohortes.
MailDelivery sin filas antes/después de los perfiles medidos y auditoría final;
Mailpit final: cero mensajes capturados. No se caracteriza rendimiento SMTP.
Las **15 cuentas manuales**, incluidas las 12 originales, credenciales y SystemState
mantienen huellas idénticas; ningún dato/volumen manual fue restaurado, purgado o borrado.

Crudos originales en volumen privado del proyecto, y copia con ACL exclusiva del
operador en `load-test-results/identity/t103-20261016/`, ignorada por Git y Docker.
Incluye las cinco ejecuciones identificadas arriba: JSONL k6, resumen nativo,
metadatos/diff/recursos/logs, snapshots, limpieza, detalles, auditoría y telemetría.
`manifest.json` contiene tamaños/SHA-256; no se incluyen fixtures.json ni private.env.
Los metadatos conservan hashes de scripts al lanzar; `postprocessing-sources.json`
identifica las herramientas finales de análisis. Se conservan resultados originales
sin reejecutar perfiles ni sustituirlos por los smokes posteriores.

Reproducción: usar [README de carga](../../../load-tests/identity/README.md), ejecutar
secuencialmente `measure.ps1` con sessions-warmup, sessions y authentication sobre
contexto aislado; ejecutar `details.mjs <nombre>` y `audit-run.ts <nombre>` después.
Los smokes de recuperación usan `-Scenario smoke-sessions`. Una salida 99 conserva
resultado desfavorable: no silenciarla ni tratarla como capacidad aprobada.
`details.mjs` verifica conteos de HTTP/tráfico válido/logouts/503 y percentiles
p50/p95/p99 de login y /me contra el resumen nativo: cinco ejecuciones coincidentes.
Auditorías son solo lectura y exigen las guardas del ensayo.

Build API, lint y tipos de herramientas en Docker: aprobados; controles del runner
**12/12**, sin omitidos. Se reutilizan las regresiones funcionales de T102 porque
no cambió producto, dependencias ni perfiles. El build API se repitió al arrancar
cada proceso. Sintaxis y caso diff vacío PowerShell 5.1 comprobados. El archivador
privado falló solo al sumar diccionarios para imprimir su total; las copias y el
manifiesto ya estaban escritos y se verificaron todos sus tamaños/hashes después.
No se repitió carga por ese fallo de presentación. Enlaces locales y diff se
comprueban antes del commit. Servicios de ensayo detenidos al cierre, volúmenes y
cuentas de carga conservados para inspección; entorno manual disponible.

**T103 completa como ejecución y reporte de contraste, no como aprobación de
capacidad.** Persisten los incumplimientos indicados. Antes de repetir ID-LOAD-01
o el aspecto afectado de ID-LOAD-02, investigar costo de transacciones/espera pool,
CPU de API/BD y límite del generador, justificar cualquier corrección y conservar
estos resultados. No se introduce una optimización especulativa en este bloque.
D10/rúbrica siguen pendientes: ni este ensayo local ni los ceros funcionales
acreditan capacidad general, producción, matrícula, clases, video o chat.
T104 requiere participantes reales; siguiente bloque recomendado T104/T105 según
disponibilidad. Bootstrap intermitente continúa abierto para T106. T095 permanece
CLI sin programación activada; D13 no tiene SLA aprobado. T104–T108 no se adelantan.

## Seguimiento posterior, conservando este resultado

[Investigación de capacidad](load-investigation.md): corrección acotada y ensayos
dirigidos/completos posteriores; ID-LOAD-01 conserva incumplimientos de latencia y
activación tardía, mientras ID-LOAD-02 satisface las referencias en el nuevo ensayo.
Los 1.201 s de este informe corresponden a la primera publicación completa, no a
un instante exacto de commit. No se modifican estos valores, los crudos originales
ni la clasificación provisional pendiente de D10. T103 sigue completa como reporte;
la aceptación de capacidad permanece abierta.

[Seguimiento adicional](load-followup.md): import reproducible corregido, medición
interna de SQL/CPU y candidatos retirados; rampa diagnóstica interrumpida y control
desfavorable. Conserva estos resultados y la capacidad sin aprobar.
