# T099–T102: preparación verificable de carga de identidad

2026-10-16, base `951dd93`, árbol inicial limpio. Sin AGENTS.md aplicable ni hooks;
skill speckit-implement limitada al bloque, checklist 16/16 sin modificar.
[Tareas](../tasks.md), [escenarios/umbrales](../verification.md), [plan](../plan.md),
[modelo](../data-model.md), [quickstart](../quickstart.md), contratos y constitución
revisados. T098 completa habilita T099→T100→T101→T102; no hay bloqueo de dependencia.
La ejecución completa de capacidad pertenece a **T103**, que permanece pendiente.

## T099 — k6 y cohortes privadas

[Herramientas y procedimiento](../../../load-tests/identity/README.md),
[prepare](../../../load-tests/identity/prepare.ts), [cleanup](../../../load-tests/identity/cleanup.ts).
Proyecto nuevo `identity-load-80c2b6fa22ce`, red interna sin puertos publicados,
BD/schema `academia_v00_test/t_load_identity` y volúmenes propios; no monta secretos
ni datos manuales. PostgreSQL 16.14, Node 22.23.1. k6 real:
**v1.6.0+dirty**, commit `d97957fc61-dirty`, Go 1.25.6; imagen fijada 1.6.0,
digest `sha256:be2a9ceb1b6ffc573277af4157135882a6d6433968b41e858ab02c5fd5847532`.
No se presenta el binario como una compilación limpia.

| Criterio | Resultado |
| --- | --- |
| Muestras completas | CLI real creó 1120 cuentas: sesiones 1000, warmup 20, autenticación 100. IDs/correos/contraseñas disjuntos; todas STUDENT/ACTIVE/verificadas y sin contraseña inicial pendiente. |
| Criptografía | 1120 hashes distintos, Argon2id v19 con m=19456/t=2/p=1 y verificación nativa de representantes de las tres cohortes. No hashes compartidos/reducidos. |
| Guardas T029 | Reutiliza assertFixtureEnvironment, configuración y criptografía existentes; añade schema t_load_*, marcador de BD aislada y comparación de BD/schema efectivos. Rechaza desarrollo, manual, schema ajeno, BD/origen/SMTP no permitidos antes de crear archivos/cuentas. |
| Secretos | Directorio/manifiesto 0700/0600 en volumen privado; no sobrescribe y conserva manifiesto ante interrupción. No emails reales ni envíos de correo. IDs/correo/índice únicos se validan antes de limpiar. |
| Limpieza | 1000 sesiones sintéticas solo para probar contador/limpiador: revocación dirigida 1000, repetición 0; eliminación explícita de 1120 fixtures y repetición 0. Preserva cuenta/sesión ajenas y singleton inicializado. No demuestra 1000 logins ni carga. |
| Pruebas reales | [fixtures.spec.ts](../../../load-tests/identity/fixtures.spec.ts): 9/9, más 26 regresiones de credentials/login: 35/35, cero omitidas. Los archivos temporales y schemas de esa suite son distintos del cohort de k6. |

Una ejecución inicial tuvo 8/9: la comprobación asumía orden textual m/t/p; el
proveedor serializa m/p/t. Se comparan los mismos valores ordenados, como el adaptador
vigente; no se cambió el algoritmo/costo ni se contó el fallo como aprobado.
La primera invocación del reportero carecía de su montaje; se leyó el resultado real
y se repitieron las pruebas necesarias con el archivo correcto.

## T100 — implementación ID-LOAD-01

[sessions.js](../../../load-tests/identity/sessions.js),
[cliente HTTP](../../../load-tests/identity/client.js) y
[perfiles](../../../load-tests/identity/profiles.js). `k6 inspect --execution-requirements`
real acepta 1000 VU máximos, 17 min de escenario + hasta 15 s de gracia y
noCookiesReset=true; warmup independiente 20 VU/1 min + hasta 15 s de gracia.
Las cinco etapas son exactamente 100/1 min, 500/2 min, 1000/2 min, 1000/10 min y 0/2 min.

Asignación por idInTest sin módulo ni cuentas compartidas; login una sola vez por VU,
/me con identidad/rol esperados y pausa 5–10 s. Error de login/identidad aborta, no
abandona silenciosamente la muestra. Se mide un slot por VU realmente validado;
el contador BD distingue sesiones/usuarios/hashes/actividad reciente y detecta duplicados.
La prueba sintética de 1000 filas valida ese contador, **no acredita carga de 1000**.
El cierre confirma rechazo reutilizando la cookie previa; está fuera de la meseta
y separado de errores del tráfico válido. Se registra logout completado y limpieza
dirigida posterior por separado.

Los controles del runner con dobles HTTP/reloj verifican asignación 1..1000, cohortes
disjuntas, fronteras de fase, cookies persistentes, login único, pausas, headers,
aborto por error/cruce y revocación con cookie anterior. Smoke real independiente:
2 VU, dos iteraciones por VU, 10 solicitudes, dos sesiones distintas y dos logouts;
errores/cruces/503/revocaciones aceptadas: cero. Las métricas finales se incorporan
con T102. No se reducen muestras/duraciones de los perfiles completos para aprobarlos.

## T101 — implementación ID-LOAD-02 y límites observables

[authentication.js](../../../load-tests/identity/authentication.js) usa las 100 cuentas
aparte y login/me/logout/pausa 5 s. Inspección k6 real: 100 VU máximos, cuatro escalones
constantes 10/25/50/100 de dos minutos, duración 8 min + hasta 15 s de gracia. No son
1000 logins simultáneos. [Controles del runner](../../../load-tests/identity/tooling.test.mjs):
12/12 con dobles HTTP/reloj para ambos escenarios y límites del watchdog.

Único cambio de producto: contadores numéricos en infraestructura de credenciales;
lectura sin IO/identidades/secretos y sin endpoint. El servidor de ensayo importa la
misma instancia compilada del gate de la API. Conserva Argon2, concurrencia 2, cola 50
y espera 5000 ms. [Credentials](../../../apps/api/tests/integration/credentials.spec.ts):
7/7, reforzadas para comprobar active=2/queued=50, rechazos, espera de 5000 ms y
salida numérica sin contraseña; no duplica la prueba de saturación ni baja su costo.

Smoke real independiente: 2 VU × dos iteraciones, cuatro logins/logout y 12 solicitudes,
errores/cruces/503: cero. Argon2 trabajo máximo 108.281 ms, espera máxima 0.082 ms,
cola observada 0; no mide aún saturación del perfil de 100 VU. La decisión de parada
por espera **>5000 ms** y margen RAM se verifica con controles de frontera; no se
afirma haber agotado RAM real. La parada ante fallo de monitor se ensaya con T102.

## T102 — captura y reporte comprobados

[measure.ps1](../../../load-tests/identity/measure.ps1),
[resumen](../../../load-tests/identity/summarize.mjs) y
[plantilla](../../../load-tests/identity/report-template.md). Cada ejecución registra
HEAD/diff privado, hashes de scripts/lock, imágenes/digests, SO/CPU/RAM/disco/red,
límites, pool y hash; captura recursos Docker y telemetría numérica del proceso API.
La imagen base se complementa con montaje del código actual y build: su digest solo
no identifica el código montado. Lock instalado y host coinciden:
`6f2c05e1f0f7fa2e0f084ac7977f4360e9260814728e0590db82bced925a6292`.

Entorno medido: Windows 11 Pro, Ryzen 7 3750H, ocho hilos, 14 966 218 752 bytes RAM
visible; Docker ocho CPU/7 236 882 432 bytes. Disco D: NTFS fijo lógico,
322 122 543 104 bytes, aproximadamente 316 963 MB libres durante el ensayo; no se
midió rendimiento físico de disco. API 2 CPU/1 GiB, BD 1 CPU/512 MiB y generador
1 CPU/512 MiB, en contenedores separados pero misma laptop/VM; contención declarada,
incluidos servicios manuales y costo del observador/pool. HTTP local sin TLS.

Los dos smokes finales son programas técnicos separados, **2 VU × 2 iteraciones**;
no sustituyen ni aprueban los perfiles completos. Duración/RPS de k6 se distingue
del tiempo externo de preparación/consulta de Docker:

| Métrica real | Sesiones `smoke-sessions-e9db9e6e` | Autenticación `smoke-authentication-a2d221cb` |
| --- | ---: | ---: |
| Duración del generador / orquestación | 16.733 / 20.103 s | 10.420 / 13.354 s |
| VU activos máximos / pico de solicitudes API en vuelo | 2 / 2 | 2 / 2 |
| Solicitudes totales / RPS total | 10 / 0.598 | 12 / 1.152 |
| Login p50 / p95 / p99 | 152.122 / 154.645 / 154.869 ms | 162.304 / 219.477 / 220.023 ms |
| /me p50 / p95 / p99 | 33.114 / 36.846 / 37.112 ms | 16.235 / 20.228 / 20.536 ms |
| Sesiones distintas observadas en cohorte ID-LOAD-01 | 2 | 0; cohorte diferente, sesiones muy breves entre login/logout |
| Logins / logouts completados | 2 / 2 | 4 / 4 |
| Errores inesperados / 503 / cruces / revocaciones aceptadas | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Trabajo Argon2 máximo / espera máxima | 72.139 / 0.076 ms | 108.281 / 0.082 ms |
| Cola hash máxima / espera pool máxima / locks esperando | 0 / 0 / 0 | 0 / 0 / 0 |
| Pico CPU Docker API / BD / generador | 30.75 / 11.88 / 1.77 % | 26.34 / 12.85 / 2.19 % |
| Pico memoria Docker API / BD / generador | 104.5 / 49.26 / 14.18 MiB | 143.4 / 52.92 / 14 MiB |
| Bytes k6 enviados / recibidos | 2514 / 5052 | 3244 / 6168 |
| Muestras servidor / recursos externos | 20 / 6 | 14 / 4 |
| Mayor hueco entre muestras servidor | 1027 ms | 1014 ms |
| Cuentas antes/después / cambios de User o singleton | 1120/1120 / ninguno | 1120/1120 / ninguno |
| Limpieza posterior / salida k6 y API | 0 sobrantes / 0 y 0 | 0 sobrantes / 0 y 0 |

Percentiles sobre muestras mínimas, sin conclusión de capacidad. El monitor de 1 s
puede no observar sesiones cortas de autenticación: se conservan cuatro logins/logout
reales y contadores k6, no se infiere ausencia de sesiones de un muestreo cero.
Recursos externos se consultan aproximadamente cada 3–4 s; timestamps/series crudas
conservan intervalos reales. IO/red Docker son contadores observados, no tasas; el
valor final del generador puede reiniciarse a cero al salir. Bytes HTTP de k6 y
series Docker quedan aparte. No se midió tráfico de otras aplicaciones del host.

**Prueba negativa controlada** `smoke-sessions-c4d2a267`: señal de monitor no disponible
con testInjected=true, sin agotar memoria ni alterar Argon2. Generador interrumpido:
**exit 105**, 2.824 s, cuatro solicitudes, dos sesiones y **cero logouts**. La API cerró
con 0; limpieza dirigida revocó **dos sobrantes**, sin borrar cuentas. El orquestador
devuelve fallo y reporta MONITOR_UNAVAILABLE, completeProfile=false. No se cuenta como
smoke exitoso ni evidencia de revocación durante meseta. Se archivó solo la señal
marcada como fixture; una parada real no se retira por ese comando.
Snapshot final: 1120 cuentas y cero sesiones válidas en las tres cohortes.

[Prueba de locks](../../../load-tests/identity/metrics.spec.ts): 1/1, con bloqueo real
entre dos transacciones y cero al liberar. Incluye locks de transactionid cuyo campo
database es NULL, sin ampliar permisos. El watchdog tiene controles de frontera de
espera 5000 ms y margen RAM; no se afirma haber provocado OOM real.

## Comprobaciones, fallos conservados y límites

Lint y build API/web, lint y tipos de herramientas, sintaxis PS5.1, **120/120 unitarias/
arquitectura**, **12/12 controles del runner**, **9/9 fixtures**, **1/1 locks** y
**26/26 regresiones credentials/login**, cero omitidas en los lotes válidos. Las siete
de credentials se repitieron con aserciones de telemetría. No se presenta esto como la
regresión integral/E2E de T106. Enlaces locales y git diff --check comprobados.

Se conservan como fallos de preparación: orden textual del PHC, reportero sin montaje,
primer chequeo con código web/plugin de arquitectura antiguos de la imagen (74/75 API,
no aprobado), selección ambigua de runner con otro contenedor de regresión activo,
propagación SIGTERM vía shell y alias SQL de locks convertido a minúsculas. Se corrigió
el montaje/selección, exec de Node y alias; se repitieron los controles pertinentes.
Las salidas API finales son 0; los intentos previos no se cuentan como captura aprobada.
No se alteraron requisitos, muestras de perfiles ni umbrales para aprobar.

Reproducción exacta de preparación, inspect, smokes y limpieza en el
[runbook](../../../load-tests/identity/README.md). Crudos en volumen privado y `.cache`
del contexto, ya ignorados junto con load-test-results por .gitignore; no se versionan
credenciales/cookies/logs crudos. Las 1120 cuentas permanecen para T103. Huellas antes/
después de las **15 cuentas manuales, 12 originales, credenciales y singleton idénticas**;
no se restaura, purga ni elimina un volumen de desarrollo/manual. Servicios del ensayo
detenidos al finalizar; volúmenes privados conservados.

T099–T102 completas como preparación, implementación y captura verificadas. **T103
sigue pendiente**: no se ejecutaron warmup completo 20/1 min, ID-LOAD-01 de 17 min ni
ID-LOAD-02 de 8 min. No se demuestran 1000 sesiones activas ni un SLA/capacidad de
producción, matrícula, clases, video o chat. D10/rúbrica y D13 siguen pendientes;
T104 necesita participantes reales y el hallazgo intermitente de bootstrap queda
abierto para T106. T095 continúa como CLI sin programación de purga. Siguiente: T103.
