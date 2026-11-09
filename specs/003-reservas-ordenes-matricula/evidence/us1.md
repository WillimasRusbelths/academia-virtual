# US1: composición y checkpoint T039–T040

Fecha: 2026-11-04, America/Lima. Base: `533b4b618b7d1ad972741e855d67d3fbb14e5a0f`, rama `feat/003-reservas-ordenes-matricula`.

T039 y T040 completadas. **1811 casos únicos aprobados**, 1932 ejecuciones al repetir 121 casos de dominio en UTC y America/Lima; cero fallos u omisiones finales. [Detalle por caso y manifiesto](us1-results.json). T041 (navegador) y T042 (aceptación humana) continúan pendientes.

## Implementación

La aplicación registra /reservar, /mis-ordenes y /mis-ordenes/:id con acceso exclusivo STUDENT e hidratación de sesión al abrir una URL directa. Inicio y las tres vistas de oferta reciben enlaces desde composición. El cliente financiero permanece estable entre renders; las pantallas conservan sus controladores y limpieza al salir. ADMIN conserva su acceso previo a oferta, sin recibir acceso a las órdenes propias de alumnos. El catálogo 002 conserva NOT_CALCULATED y el mensaje de disponibilidad no calculada.

AppModule construye el despachador con el pool y la revalidación de sesión existentes y el participante público de oferta. Arranca en onApplicationBootstrap; beforeApplicationShutdown detiene el sondeo y espera transacciones antes de que onApplicationShutdown cierre el pool. EC01 prueba automáticamente una admisión persistida anterior al arranque, consulta HTTP de la orden y cierre con DispatchState bloqueado por otra conexión.

Los fixtures HTTP pausan únicamente el temporizador por defecto para observar ADMITTED y coordinar barreras deterministas. EC01 habilita el ciclo real. No se sustituyen las reglas, consultas, controladores o transacciones. No se añaden servicios, dependencias, migraciones ni rutas de pago.

## Ejecución y comandos

Se reutilizó el proyecto Docker aislado academic-offering-fa3d46bddbb8, APP_ENV=test, base academia_v00_test, roles runtime/migración separados y cero puertos publicados. Volumen existente creado 2026-10-19T10:45:57Z, conservado. Imagen ensayada: `sha256:82a0d20a63eac2a434cc6bd44436c35e5cae6c9552de299923c1c22e8f48815c`. Fuente sincronizada con hashes; evidencia privada de comandos/reportes en .cache/reservas-t039-t040/.

Prerrequisitos: powershell -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks. Checklist 12/16 conservado; se mantiene autorización previa para continuar. Hooks de extensión ausentes.

Runner: powershell -ExecutionPolicy Bypass -File .cache/reservas-t039-t040/run.ps1 -Action <acción>. Secuencia: config, sync, up (hasta healthy), build, composition, checks, web-all, unit-preparation-utc/lima, admission, dispatch, reads, regression, pg, prices, errors, maintenance, offering, identity, api, state, stop e inspect. api se ejecuta sin las suites pesadas concurrentes. El runner invoca Vitest con maxWorkers=1 y reporters default/json; api produce core.json y pg produce audit.json. checks ejecuta lint, build y tipos de pruebas/config de ambos workspaces. No se amplían timeouts ni límites de arquitectura.

| Suite | Ejecutados | Aprobados | Fallidos/omitidos |
| --- | ---: | ---: | ---: |
| unit-preparation-utc | 121 | 121 | 0 |
| unit-preparation-lima | 121 | 121 | 0 |
| admission | 38 | 38 | 0 |
| dispatch | 32 | 32 | 0 |
| reads | 47 | 47 | 0 |
| composition | 1 | 1 | 0 |
| web-all | 328 | 328 | 0 |
| regression | 104 | 104 | 0 |
| audit | 18 | 18 | 0 |
| prices | 52 | 52 | 0 |
| errors | 67 | 67 | 0 |
| maintenance | 36 | 36 | 0 |
| offering | 365 | 365 | 0 |
| identity | 78 | 78 | 0 |
| core | 524 | 524 | 0 |

Core incluye dominio de identidad/oferta, contratos y arquitectura. identity ejecuta session-lifecycle, login.contract, us1-read-logout.contract y us1-use-cases con PG/HTTP real. offering repite las once suites afectadas de oferta, seguridad HTTP y composición. web-all incluye los 321 casos anteriores más siete nuevos. composition añade EC01. Los títulos administrativos repetidos se distinguen por archivo e índice de caso; no se cuentan como nuevos los 121 repetidos por zona horaria.

## Aserciones posteriores y filas finales

La tabla resume el estado final consultado y afirmado por las suites, antes de que cada fixture elimine su esquema. No representa datos de alumnos reales ni aprobación de pagos.

| Caso | Estado final verificado en PG |
| --- | --- |
| RD02: conjunto de dos grupos | Una EnrollmentOrder RESERVED, totalMinor=25000; dos SeatReservation CONFIRMED; expiresAt−confirmedAt=86400000000 µs; un token y un COMMIT. |
| RD03: último cupo y RA-02 | Dos conexiones y cabeza bloqueada: ambas solicitudes siguen ADMITTED mientras espera. Después, primera CONFIRMED y segunda REJECTED/CAPACITY_UNAVAILABLE; una sola plaza retenida; sin SKIP LOCKED ni acceso a AdmissionSequence desde despacho. |
| RD04: grupo sin precio | Solicitud REJECTED/OFFERING_NOT_RESERVABLE; cero órdenes, ítems o plazas parciales. |
| RD05: precio concurrente | Espera al curso bloqueado; EnrollmentOrderItem.priceMinor=17000 tras el commit del escritor. |
| RD06, RP01/RP01b: fallo de auditoría o escritura omitida | Fingerprint financiero completo idéntico al anterior; solicitud sin resultado terminal parcial. |
| RD07/RD16: abortos | Rollback y token nuevo para intento posterior; 40001 persistente realiza tres intentos y conserva ADMITTED, con cero orden/ítems/plazas. |
| RD13: caída antes/después de COMMIT | Reinicio confirma o recupera según el punto de caída; una única orden, sin duplicar resultado durable. |
| RD10/RD14: orden anterior fuera de selección | Bloquea también sus grupos y normaliza EXPIRED junto con la nueva RESERVED, en la misma unidad de trabajo. |
| RD15: docente cambia durante descubrimiento | ROLLBACK antes del primer token y redescubrimiento; una sola orden final con cobertura de locks nueva. |
| RQ08/RQ08b: lectura espera conversión | Tras esperar lock real, reserved=0, occupied=1, available=0 y evaluatedAt posterior al COMMIT; cuenta propia se bloquea antes de grupos. Son hechos de conversión ficticios, no prueba de finalizador de pago. |
| RQ11: topología nueva | Solo devuelve referencias ya cubiertas; incorporar la nueva exige rollback/redescubrimiento, sin locks tardíos ni FOR UPDATE sobre oferta. |
| EH01–EH04 | Visitante 401, ADMIN/TEACHER 403; orden ajena e inexistente 404; JSON/CSRF/query cerrados y no-store; rechazo sin efectos financieros. |
| EC01: composición automática | Una solicitud CONFIRMED, una orden y dos plazas; HTTP200 con totalMinor=25000; cierre espera al despacho bloqueado antes de terminar. |

Tras las suites, consulta real de pg_namespace: schemas t_ = []. DB y Mailpit detenidos; volumen conservado. Se preservan los 74 archivos protegidos, seis migraciones, checklist y evidencias anteriores.

## Incidencias y límites

Docker Desktop estaba detenido; se inició desde su instalación local. PostgreSQL hizo recuperación automática de su volumen existente y se esperó healthy antes de ejecutar pruebas. Una invocación inicial de Vitest sin escalación falló por spawn EPERM; se ejecutó con autorización del entorno. La prueba inicial de navegación detectó el módulo de composición ausente durante carga: es diagnóstico de preparación, no caso de negocio rojo ni resultado final. Un comando de bucle PowerShell tuvo interpolación prematura y se reemplazó por archivo .ps1; no alteró producto ni criterios.

Este informe acredita UNIT/PG/HTTP locales de US1. La comprobación móvil/escritorio, teclado y US1.01–US1.17 en navegador corresponde a T041; la participación de personas reales corresponde a T042. No se acredita aceptación integral de spec003, cobros, Izipay, despliegue, operación ni capacidad. Quedan 54 de las 94 tareas previstas.


## Actualización T041 — E2E de US1, 2026-11-04

**T041 completada.** 28 casos únicos de navegador aprobados en escritorio (Desktop Chrome) y móvil (Pixel 7): **56 ejecuciones verdes**, sin omisiones, reintentos automáticos ni flakiness. La corrida completa aprobó54/56: EU03 falló en ambos proyectos por preparar una edición de capacidad sobre un grupo publicado. Se corrigió la preparación retirando/editando/republicando y se repitió únicamente EU03 en los dos proyectos, ambos verdes. Se conservaron las otras54 ejecuciones, cuyas fuentes/casos no cambiaron; total58 ejecuciones en este tramo y56 resultados finales aprobados. Además, 329 casos web, 524 de dominio/contratos/arquitectura y 36 PG de mantenimiento: 889 casos únicos de regresión aprobados en esta ejecución. Total del bloque: 917 casos únicos, 945 resultados finales aprobados y947 ejecuciones del tramo completo más corrección dirigida. Las ejecuciones iniciales de diagnóstico se detallan aparte. Los 1.811 casos del checkpoint T040 anterior siguen siendo evidencia histórica separada; no se suman otra vez. [Detalle de casos y resultados](t041-results.json).

Se corrigió un fallo de producto: un 404 NOT_FOUND al consultar una orden o solicitud ahora muestra «Orden o solicitud no encontrada» y conserva la ausencia de datos privados. Antes mostraba «Resultado incierto». La nueva prueba OC09 se ejecutó roja antes de la corrección y verde dentro de la suite web completa.

Se actualizaron las pruebas preparadas para la ruta aprobada /reservar, previsualización, consentimiento y consulta manual implementados. El selector de espera se hizo específico para distinguir los dos anuncios status. El logout se recorre por Inicio, donde está el control real. La fixture de enrollment habilita el despachador de AppModule; las pruebas que necesitan observar ADMITTED retienen DispatchState mediante una conexión PG distinta. La fixture académica mantiene el temporizador pausado por defecto para sus otros recorridos.

| Aceptación | E2E aprobado y aserción persistida |
| --- | --- |
| US1.01–02 | ER01: selección por teclado, consentimiento, ADMITTED sin pago ni retención, luego CONFIRMED y detalle original; expiresAt−confirmedAt=86400000000 µs, una orden y una plaza. ER03 recupera espera tras recarga y segunda sesión. |
| US1.03 | EU01: importe cliente adicional rechazado400; solicitud válida usa PEN12500 del servidor y cero efectos del intento alterado. |
| US1.04 | EU02: se descarta el acuse de un POST realmente procesado; consulta manual recupera CONFIRMED y replay conserva id, inicio y vencimiento; una orden/plaza. |
| US1.05/10 | EU03: dos alumnos, capacidad1, DispatchState retenido; primera respuesta demorada hasta recibir la segunda. Mismo admittedAt SQL y secuencias1/2; antes del desbloqueo cero plazas. Después primera CONFIRMED, segunda REJECTED/CAPACITY_UNAVAILABLE y una sola plaza. |
| US1.06 | EU04: segundo grupo lleno por reserva real de otro alumno; se rechaza todo el conjunto del titular y crea cero órdenes/plazas para él. |
| US1.07–08 | EU05: una orden de dos cursos, dos ítems y plazas, total19500; cambiar precio del curso a19000 no altera ítem12500 ni el total original. |
| US1.09 | EU06: dos intenciones simultáneas del titular producen una CONFIRMED y una REJECTED/ACTIVE_ORDER_EXISTS; una orden/plaza vigente. |
| US1.11 | EU07: UI impide elegir segundo grupo del mismo curso; entrada directa de dos grupos se rechaza sin orden ni plaza. |
| US1.12 | EU13: matrícula histórica vigente de grupo retirado impide duplicar curso; no crea otra orden ni matrícula. Es un hecho ficticio, no aceptación del finalizador de pagos. |
| US1.13 | EU11: 2090-01-02T04:59:59.999999Z confirma; 05:00:00.000000Z y 05:00:00.000001Z rechazan sin efectos parciales. El reloj se controla solo en un schema t_, no mediante el navegador. |
| US1.14 | EU08: retiro de oferta después del resumen rechaza el conjunto sin retención. Las variantes de docente/precio/capacidad conservan además la evidencia UNIT/PG/HTTP de T040. |
| US1.15 | EU12: cruzar inicio del período tras confirmar y repetir intención conserva estado RESERVED, inicio y vencimiento originales. |
| US1.16 | EU09 y EU13: solapamiento del conjunto o contra matrícula vigente de grupo oculto rechaza sin efectos nuevos. |
| US1.17 | EU10 y EU14: franjas contiguas y reserva histórica vencida permiten confirmar. La ausencia de fecha efectiva común y matrícula finalizada se conservan verificadas en UNIT/PG de T040. |

ER02/ER07 verifican falta de precio y vacío; ER04 aislamiento y404 seguro; ER05 desconexión/error/recuperación; ER06 logout/login sin otro POST ni intención en localStorage; ER08 lock real de grupo devuelve error recuperable sin inventar disponibilidad. EU15 comprueba Inicio→oferta→reserva, mensaje legado no calculado y denegaciones de docente/administrador/visitante. ER01 comprueba foco, Space/Enter y ausencia de desborde horizontal; son verificaciones automatizadas, no observación de personas.

Comandos privados reproducibles: powershell -ExecutionPolicy Bypass -File .cache/reservas-t041/run.ps1 -Action config|sync|up|checks|web-all|browser|api|maintenance|types-final|state|stop|inspect, una acción por invocación y espera de healthy antes del ensayo. browser ejecuta playwright test --config playwright.enrollment.config.ts --reporter=list,json con workers1, retries0 y timeout15000 originales. No se amplían límites. La imagen Chromium instalada conserva Node22.23.1, Playwright1.63.0 y el mismo lock; se montan únicamente fuentes revisadas, dist API y clientes generados de la imagen aprobada en T040. El código API de producto no cambió. Manifiestos y logs privados en .cache/reservas-t041/.

Incidencias separadas de aceptación: descubrimiento inicial sin cliente generado corregido antes del ensayo; una prueba inicial detectó /reservas obsoleta; primer recorrido actualizado16/20 por selector ambiguo y mensaje404; tipos detectaron sobrecarga de Pool.connect en la nueva fixture y se corrigió con PoolClient explícito. La ejecución final reemplaza esos resultados; no se ocultan ni se cuentan como casos aprobados.

Consulta PG final: cero esquemas t_. DB y Mailpit detenidos, mismo volumen conservado. 74 archivos protegidos, seis migraciones, checklist12/16 y evidencia anterior conservados. us1-results.json mantiene intactos los resultados T040; esta sección se añade al informe sin reescribirlos.

**T042 sigue pendiente**: [guía y estado de aceptación humana](human-acceptance.md), sin participantes ni resultados inventados. 41/94 tareas completadas; 53 pendientes. Siguiente bloque desarrollable: T043–T044, preparación de pruebas de verificación de pagos; no requiere cerrar la observación humana de US1. No se acredita Izipay, cobro real, despliegue o aceptación integral de spec003.
