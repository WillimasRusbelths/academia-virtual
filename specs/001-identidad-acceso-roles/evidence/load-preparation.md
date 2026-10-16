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

T099–T101 completas como preparación/implementación; T102 aún cierra captura y reporte.
La ejecución completa y los 1000 activos por diez minutos siguen en T103. T104,
bootstrap/T106 y D13 se conservan pendientes; no purga programada ni SLA aprobado.
