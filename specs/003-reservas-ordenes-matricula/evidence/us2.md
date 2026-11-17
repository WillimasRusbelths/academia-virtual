# US2: checkpoint técnico local T055

Fecha: 2026-11-09, America/Lima. Rama `feat/003-reservas-ordenes-matricula`, base `533b4b618b7d1ad972741e855d67d3fbb14e5a0f`.

T055 verifica el núcleo local de pagos construido en T043–T054. **2079 casos únicos aprobados; 2259 ejecuciones**, sin fallos, flaky ni omisiones finales. [Resultados por caso, trazabilidad PV/US2, versiones y manifiestos](us2-results.json). La autenticidad del proveedor, el adaptador externo y su sandbox siguen pendientes en T056–T059/PV29. Este informe no habilita cobros reales.

## Alcance y cambios

Se vuelven a ejecutar las suites preparadas en T043–T047, junto con iniciación, recuperación, matrículas propias y regresiones temporales/transaccionales, migración, identidad, oferta, web y arquitectura. Los controles auxiliares, UNIT y protocolo PG/HTTP se distinguen en el JSON: un helper aprobado no sustituye una prueba de atomicidad.

Se añaden dos casos de integración a enrollment-payments.spec.ts. PP31 reserva antes del inicio del período, retira/republica el curso y finaliza el pago una hora después de reservar, ya comenzado el período. Comprueba dos matrículas y conserva las 24 h y todos los snapshots originales. El soporte paymentFixture acepta reservedAt solo para preparar ese instante antes de la admisión real; sus consumidores anteriores conservan el comportamiento por defecto.

PP32 prepara una matrícula antecedente del mismo alumno/curso en un grupo oculto diferente. La finalización real rechaza la conversión de toda la orden como COURSE_COMMITMENT_EXISTS, conserva la matrícula previa y registra la incidencia del hecho adicional. El antecedente es un dato ficticio explícito; la nueva incidencia sí la produce el finalizador de producto. La regresión de oferta detectó además un inventario desactualizado de seis migraciones: I01 ahora exige siete, incluida 0007, sin modificar SQL ni retirar sus comprobaciones de identidad/observador. No se modifica código de negocio, rutas, dependencias, migraciones o contratos del spec.

## Entorno y ejecución

Proyecto Docker aislado `academic-offering-fa3d46bddbb8`, base `academia_v00_test`, APP_ENV=test, roles runtime/migración separados y cero puertos publicados. Se conserva el volumen creado el 2026-10-19T10:45:57Z y la configuración existente. La comprobación inicial valida destinos/mounts y hashes antes de reanudar únicamente DB/Mailpit.

Se reutiliza la imagen anterior para la regresión del producto sin cambios; la imagen final se reconstruye con las tres fuentes de test actualizadas y se repiten la suite PG de 53, la regresión de oferta y las comprobaciones de lint/build/tipos. Los siete módulos compilados de producto coinciden por SHA256 entre imagen inicial, final y navegador. Se verifican 27 fuentes en API y 23 en navegador; los cambios de test no alteran el código ejecutable del producto. Los identificadores exactos están en el JSON. Chromium instalado se reutiliza, sin descargas.

Versiones observadas: Node 22.23.1, Vitest 5.0.2, Playwright 1.63.0, PostgreSQL 16.14; ICU 78.2, tzdata de Node 2026a y de sistema/PostgreSQL 2026b. Se conservan límites originales derivados al reservar, sin recalcularlos desde la zona del cliente.

Runner privado: `powershell -NoProfile -ExecutionPolicy Bypass -File .cache/reservas-t055/run.ps1 -Action <acción>`. Las guardas de destino se ejecutan antes de cada acción. Las suites PG son secuenciales y usan esquemas propios; arquitectura se ejecuta sin compilación pesada concurrente. No se amplían timeouts ni se cambian aserciones previas por skip/fails. No se ejecuta carga.

## Resultados finales

| Conjunto | Casos únicos | Aprobados |
| --- | ---: | ---: |
| Reglas de pago UNIT | 48 | 48 |
| Finalización PG T044, incluidos PP31/PP32 | 53 | 53 |
| Intentos concurrentes T045 | 28 | 28 |
| Iniciación/recepción adicional | 17 | 17 |
| HTTP T046 | 35 | 35 |
| Recuperación | 15 | 15 |
| Matrículas propias HTTP | 9 | 9 |
| Web de pagos/matrículas T047 y adicionales | 45 | 45 |
| Reserva/orden/D06 UNIT | 121 | 121 |
| Lecturas críticas/persistencia/HTTP | 47 | 47 |
| Fundamentos transaccionales/autorización/fronteras | 104 | 104 |
| Auditoría/ledger | 18 | 18 |
| Migración e integridad | 122 | 122 |
| Upgrade 0006→0007 con datos existentes | 1 | 1 |
| Composición y cierre | 1 | 1 |
| Admisión | 38 | 38 |
| Despacho | 32 | 32 |
| Guard de mantenimiento | 36 | 36 |
| Regresión de oferta/seguridad | 365 | 365 |
| Regresión de identidad/sesiones | 78 | 78 |
| Regresión web | 331 | 331 |
| Dominio/contratos/arquitectura | 524 | 524 |
| E2E pagos, casos distintos | 11 | 11 |
| Total | 2079 | 2079 |

Las 48 reglas de pago y 121 de reserva/orden/D06 se repiten en America/Lima: 169 repeticiones, sin casos únicos adicionales. Los 11 E2E se ejecutan en escritorio y móvil: 22 ejecuciones. Total 2259 = 2068 Vitest distintos + 169 repeticiones por zona + 22 ejecuciones de navegador. Los dos casos añadidos pertenecen a PG; el resto es regresión o verificación preparada anteriormente, ejecutada de nuevo en este checkpoint. Los ensayos preliminares no se suman a estos totales.

Lint, compilación y comprobación explícita de tipos de aplicaciones/soportes/tests/configuración E2E pasan. La matriz de endpoints cerrada exige las rutas reales y sus permisos contractuales. Los manifiestos registran los archivos de test y del producto efectivamente utilizados.

## PV cubiertos y aserciones finales

Hay referencias ejecutadas a 29 familias de diseño local: PV01–PV28 y PV30. Son familias de diseño, no 29 pruebas ni aprobación de todos los niveles previstos. El JSON identifica cada caso, capa, variante, comando, duración, resultado y aserciones alcanzadas. PV29 queda expresamente sin ejecutar. Firma/autenticidad del proveedor no se acreditan por el puerto de fixture.

| Familias / casos | Aserciones finales alcanzadas |
| --- | --- |
| PV01, PP01 y PP31 | Un VerifiedPayment APPLIED de 25000/PEN, dos Enrollment vinculadas a estudiante/curso/grupo/detalle/pago, dos reservas CONVERTED, cero reservas activas/incidencias y ninguna plaza adicional. Orden ENROLLED revisión 2; nombres, importes, períodos, franjas, confirmedAt/expiresAt y validUntil originales. Una auditoría SYSTEM por pago. |
| PV02, PU02/PP02 | −1µs aplica; igualdad/+1µs generan incidencia sin matrículas nuevas. No gracia, backdating, devolución o extensión. |
| PV03–PV07, PP03–PP07 | Barreras/locks reales: evidencia anterior no gana si la verificación termina tarde; pago primero conserva ENROLLED; vencimiento/reasignación primero impiden resurrección. Recibo durable permanece tras reinicio y no retiene otra plaza. |
| PV08/PV09, PP00f/PP00j/PP08/PP09 | Fallo real de matrícula, segunda matrícula o auditoría revierte todos los efectos finales y conserva recibo. COMMIT antes/después se recupera por identidad económica, sin otra aplicación. |
| PV10–PV13, PP10–PP13b | Duplicados simultáneos/tardíos conservan fecha y resultado. Otro pago de orden matriculada abre incidencia sin otras matrículas. Identidad económica no cambia de orden/dinero/moneda; scopes distintos no se confunden. |
| PV14/PV15, PP14/PP15/PF adicionales | Importe/escala/moneda auténticos incompatibles se conservan como incidencia, sin suma parcial ni falsificarlos como PEN. Referencia desconocida deja orderId nulo y grupos vacíos; cero adjudicación o bloqueos arbitrarios. |
| PV16/PV27, PH00–PH09/SP | Retorno del navegador, URLs de aprobación inventadas y origen SYSTEM falsificado no crean matrícula. Autorización/propiedad, CSRF/origen y DTO cerrados; 404 ajeno seguro, sin recibos/secretos privados en respuestas. Sin excepción global para callbacks. |
| PV17/PV18, PP17/PP18/SP01 | Retiro, docente deshabilitado o revisión inválida antes de finalizar generan incidencia total. Ocultamiento posterior conserva las matrículas y su consulta propia. |
| PV19, PP19 | Cancelación primero mantiene terminalidad ante pago tardío; incidencia primero bloquea cancelación. No se resuelve economía por modificar oferta. |
| PV20/PV28, PP20/PP28/PP31 | Cambios permitidos/docente no sustituyen snapshots. Republicar/anotar seguimiento no resuelve incidencia ni matricula. PP31 demuestra pago válido tras comenzar el período, dentro del plazo restante original. |
| PV21–PV24, PA/PIA/PH10 | Un intento canónico y una llamada externa por iniciación. SUBMITTING queda durable antes de red, sin locks/conexión de negocio durante ella. Caída/timeout/404 aislado no autorizan otro cobro. Solo rechazo definitivo sin movimiento permite otro inicio explícito. Callback terminal no regresa por PENDING/UNKNOWN/FAILED tardíos; SYSTEM sigue tras logout, usuario debe reautorizar. |
| PV25/PV26, PP25/PP26/RQ | Conversión pausada cruza vencimiento: lector espera y luego observa reserved=0/occupied=1/available=0 con evaluatedAt posterior. Nueva topología exige rollback/redescubrimiento antes de locks tardíos; solo referencias cubiertas. |
| PV30, PP30/PR/EP | Reinicio real de Node y recuperación durable con sesión revocada, sin otro cobro ni efecto duplicado. Recuperación consulta fuera de locks, comparte vuelo, avanza por examinada y conserva horizonte finito/presupuesto/55P03. |
| D06, PU12–PU15/PI06/PP01/PP32 | UNIT diferencia auto-reserva, compromisos ocultos, contiguos e historial. PG confirma el conjunto propio sin autoconflicto; PP32 detecta matrícula oculta previa del curso y registra una incidencia con cero matrículas nuevas, conservando el antecedente. |
| Vigencia, SP04/WM | En validUntil original la matrícula pasa a histórica; fechas, nombres y horario permanecen. Sin reapertura de oferta, cancelación, devolución o nueva vigencia. |

En PP32 el estado total incluye el antecedente explícito: dos pagos (uno anterior y el nuevo incidente), una matrícula anterior inalterada, una incidencia, dos reservas de la orden original aún CONFIRMED y una reserva histórica CONVERTED. La orden no aplicada sigue RESERVED revisión 1; no se convierte parcialmente el segundo curso ni se libera antes del plazo por registrar incidencia.

Las barreras del protocolo usan dos conexiones, observación de pg_blocking_pids/waitForBlockedBy, latches y transacciones reales. Las consultas de filas/fingerprints y auditoría se afirman antes de eliminar cada esquema propio. UNIT sobre dinero/tiempo o un control del harness no se cuentan como prueba de estos efectos.

## Recorrido de navegador

EP00a–EP00c comprueban orden original, éxito en URL sin autoridad y ausencia de botones de simulación/aprobación. EP01 inicia por teclado y distingue pendiente de matrícula con una llamada. EP02–EP03 consultan respuesta perdida/inicio desconocido sin otro cobro o plazo. EP04 aplica por el puerto técnico de test y consulta las dos matrículas con vigencia original. EP05 al límite muestra conciliación sin matrícula o devolución; EP06 conserva vencimiento y permite nueva selección. EP07 recupera tras reload/logout/login sin reenvío y elimina datos privados; EP08 muestra error recuperable de consulta sin fabricar matrícula.

Los 11 casos pasan en escritorio y móvil con servidor/PG reales y gateway/evidencia ficticios explícitos. No hay capturas, vídeo o trazas privadas. No constituyen aceptación humana ni integración Izipay. Los escenarios US2.01–US2.12 tienen referencias locales en el JSON, con sus capas y límites; no se declara la historia externa completa.

## Preservación y siguientes puertas

Se conservan 74 archivos protegidos, las siete migraciones, configuración/volumen, evidencia previa y checklist 12/16. T042 sigue cerrado por confirmación humana con consentimiento y computador; no se le añade aceptación móvil/teclado. El sondeo final conserva exactamente los esquemas existentes al inicio, incluido T042 y el ensayo de upgrade anterior; los nuevos fixtures limpian solo sus propios esquemas. DB/Mailpit quedan detenidos.

No hay nuevas rutas, proveedor por defecto, worker automático de pagos habilitado, cambios económicos, cobros, despliegue, carga o commit. La recuperación/lifecycle interna sí está probada; su uso con un proveedor real requiere contrato/configuración explícitos. Los límites derivados se conservan; el reloj controlado no demuestra 24 h operacionales ni resistencia universal a saltos del host. D10/D13 y la política económica mantienen sus puertas.

T055 queda completada como checkpoint técnico local. T056 requiere acceso autorizado y modalidad/contrato reales del proveedor antes de preparar adaptador y sandbox T057–T059. Según el plan, se puede desarrollar independientemente US3 desde T060–T062 sin esperar D02. Ninguna de esas tareas se marca completada por este informe.
