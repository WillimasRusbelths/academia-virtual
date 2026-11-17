# US4: checkpoint técnico integrado T081–T082

Fecha: 2026-11-13, America/Lima. Rama `feat/003-reservas-ordenes-matricula`, base Git `cfc001eac89292c1b135dbba79be9a9ca8cc0b8b`. El inventario previo contiene 944 archivos; se conservan también los cambios sin commit mediante hashes.

**T081 y T082 completadas. Checkpoint técnico US4 aprobado:** 2242 casos únicos y 2385 ejecuciones aprobados, sin fallos, omitidos o flaky en las ejecuciones finales. Se añaden siete casos únicos: cuatro carreras PG y tres E2E. Los 212 casos preparados en T070–T072 se repiten y pasan, incluidos sus 89 rojos históricos, ya implementados en los bloques anteriores. No se presentan esos 89 como implementación nueva de este bloque. [Resultados por caso/ejecución, trazabilidad y límites](us4-results.json).

## Alcance y criterios

T081 exige mantenimiento protegido con reservas/matrículas/incidencias, vencimiento e historial, ambas serializaciones de cancelación/pago y habilitación/reserva/confirmación. T082 integra T070–T072, los trece escenarios US4, UI y regresión afectada de002/identidad, junto con arquitectura, lint, tipos y compilación. La matriz siguiente enlaza familias técnicas ejecutadas; el JSON contiene las referencias individuales exactas. Las familias se superponen entre criterios y no se suman como casos adicionales.

| Escenario | Criterio verificado | Evidencia ejecutada |
| --- | --- | --- |
| US4.01 | Consulta propia, historial y snapshots | 5 casos; 5 E2E |
| US4.02 | Acceso sin sesión/permiso y propiedad | 26 casos; 4 E2E |
| US4.03 | Cancelación bloqueada por cada compromiso | 19 casos; 2 E2E |
| US4.04 | Resultado incierto, consulta y replay | 20 casos; 6 E2E |
| US4.05 | Una orden con reservas vigentes | 1 casos; 1 E2E |
| US4.06 | Precio, consulta y seguimiento atribuible | 7 casos; 5 E2E |
| US4.07 | Docente, visitante y alumno ajeno denegados | 25 casos; 4 E2E |
| US4.08 | Seguimiento mantiene economía pendiente | 4 casos; 2 E2E |
| US4.09 | Sin cancelación o modificación voluntaria | 9 casos; 1 E2E |
| US4.10 | Intención nueva tras vencer, sin renovar anterior | 3 casos; 3 E2E |
| US4.11 | Atributos protegidos y curso inmutable | 16 casos; 2 E2E |
| US4.12 | Textos/docente con retiro y publicación explícitos | 8 casos; 3 E2E |
| US4.13 | Historial finalizado no bloquea ni revive | 13 casos; 2 E2E |

Los casos de navegador se ejecutan en escritorio y móvil. Sus 50 casos únicos producen 100 ejecuciones: 47 ejercitan pantallas y tres (CA01–CA03) ejecutan el cliente de producto desde Playwright contra HTTP/API/PG, sin interacción con pantallas. Repetir esos tres en móvil no acredita UX móvil. Las repeticiones UTC/America-Lima de guard, pagos y carreras conservan identidad de caso y se registran como ejecuciones adicionales. Cuando existen títulos parametrizados repetidos, el JSON identifica cada declaración por su posición dentro del mismo archivo/título, respaldada por el manifiesto de fuente; no convierte una repetición de ejecución en caso nuevo. Los seis rechazos distintos de admin-users siguen siendo seis entradas de su bucle previo, sin modificar esa suite.

## T081: integridad, mantenimiento y concurrencia

La suite enrollment-maintenance ejecuta EMT01–EMT17: reservas y matrículas vigentes e incidencias bloquean período/capacidad/horario/cancelación sin parcialidad; solo historial vencido/finalizado no bloquea. Nombres/descripción/docente conservan snapshots y requieren retiro/revisión/publicación explícitos. Curso siempre inmutable, descripción opcional, guard ausente falla cerrado, replay reautoriza según contrato y seguimiento no resuelve. EMT08/09 coordinan el escritor HTTP con un compromiso preparado por fixture o el participante lector: son controles auxiliares del guard y su espera, no una confirmación completa del despachador. Las carreras de escritores de producto se acreditan por PP19 y U4C, descritas a continuación. No se usa una pausa como única prueba de bloqueo.

PP19/PV19 ejecuta ambos órdenes con escritor real de cancelación y finalizador real de un hecho económico técnico tardío: cancelar primero conserva CANCELLED e incidencia; incidencia primero impide cancelar. PP17/PP18/PP20/PP28/PP31 mantienen ocultamiento, matrícula original y condiciones/plazo después de retiro, cambio docente, republicación y seguimiento. TC02 verifica los límites de vigencia originales y no reactivación al pasar el fin del grupo.

[enrollment-us4-checkpoint.spec.ts](../../../apps/api/tests/integration/enrollment-us4-checkpoint.spec.ts) añade cuatro carreras U4C. Cada caso prepara una admisión real o una orden real del despachador. Ejecuta el escritor real ChangeAccess de identidad para deshabilitar docente frente al despachador de reserva o al finalizador de pago; pausa antes del COMMIT del primer escritor, observa al segundo mediante pg_blocking_pids y libera la barrera. Ambos órdenes se ejecutan:

- Habilitación pierde primero: la reserva queda REJECTED sin orden/plazas; el hecho económico de pago queda INCIDENT sin matrícula.
- Compromiso confirma primero: se conserva la orden y sus dos plazas/exactamente 86 400 segundos, o el pago aplicable y las dos matrículas. La deshabilitación posterior no revoca esos hechos ni reescribe los detalles originales.

El ensayo de pago usa recibo/evidencia ficticios del harness existente y el finalizador de producto, con aserciones finales de todas las tablas relevantes. No demuestra autenticidad de proveedor externo. Los cuatro casos se repiten en UTC y America/Lima. Las suites de admisión/despacho, lectura, autorización, auditoría y HTTP completan la regresión de propiedad, una orden vigente, plazos, privacidad y efectos atómicos.

## T082: recorrido integrado y regresión

Se repiten las suites preparadas de compromisos/follow-up, precios/incidencias web, administración/autorización PG/HTTP y enrollment.spec. Precios usan revisión e identidad estables, preservan entrada en conflicto, requieren comparar/adoptar explícitamente y no reprecian órdenes. Respuestas perdidas de precio y seguimiento se consultan mediante GET sin reenvío; replay manual idéntico recupera un recibo sin duplicar nota/revisión/auditoría. Registro de seguimiento conserva actor/hora del servidor y aviso económico pendiente. Docente/visitante/alumno sin facultad administrativa no obtienen formularios ni acceso HTTP.

NM01–NM06 comprueban navegación propia, referencias ajenas/desconocidas, logout, historial oculto/finalizado, PATCH mínimo y bloqueos de capacidad/horarios/cancelación. EU02/EU06/EU15 verifican recuperación tras pérdida de acuse, exclusión de otra orden vigente y navegación/roles. EE04/EE08 verifican nueva intención tras vencer, recuperación de inventario tras error y ausencia de renovación/sanción automática.

[enrollment-us4-checkpoint.spec.ts](../../../apps/web/tests/e2e/enrollment-us4-checkpoint.spec.ts) añade tres recorridos U4E:

- U4E01/US4.09: la pantalla no ofrece cancelación/modificación voluntaria; PATCH/DELETE por URL directa de orden/reserva siguen404 y conservan huella económica/plazo.
- U4E02/US4.12: docente no editable estando publicado; tras retirar se sustituye por otro docente habilitado y se guarda WITHDRAWN. Una confirmación posterior publica y actualiza la referencia docente de publicación, conservando orden original, dinero y plazo.
- U4E03/US4.13: pago técnico aplicable produce matrículas reales; el reloj exclusivo del ensayo pasa su vigencia original. Retirar/editar un período más largo/republicar/cancelar es válido con solo historial, pero la vista del alumno mantiene ambas matrículas históricas y su fecha original, sin revivirlas ni reescribir compromisos. El grupo cancelado conserva controles bloqueados.

La regresión de oferta incluye preparación, revisión, publicación, retiro, cancelación, lector público/docente, generación de habilitación y directorio. En navegador se repiten M01–M10 y R01–R05: confirmaciones, conflicto,503, replay, pérdida/recuperación de habilitación vía identidad, foco, teclado y móvil/escritorio. Identidad repite login, ciclo de sesión, lectura/logout y casos de uso afectados. Se conserva la separación de permisos financieros. Las pruebas de arquitectura comprueban capas, dependencias y políticas de endpoints; no se añaden permisos o rutas de aprobación.

## Resultados finales

| Acción | Casos en esa acción | Ejecuciones | Aprobadas |
| --- | ---: | ---: | ---: |
| race-pg | 4 | 4 | 4 |
| us4-unit | 753 | 753 | 753 |
| web-all | 486 | 486 | 486 |
| core-pg | 466 | 466 | 466 |
| offering-identity | 483 | 483 | 483 |
| guard-lima | 93 | 93 | 93 |
| checkpoint-browser | 3 | 6 | 6 |
| us4-browser | 25 | 50 | 50 |
| student-browser | 3 | 6 | 6 |
| abandonment-browser | 3 | 6 | 6 |
| offering-browser | 16 | 32 | 32 |
| Total sin duplicar casos | 2242 | 2385 | 2385 |

Los casos de guard-lima ya se incluyen en race-pg/core-pg. La columna por acción no se suma para obtener únicos; el JSON conserva la unión de IDs y todas las ejecuciones. Las verificaciones locales de preparación y descubrimiento no se agregan a los tests ejecutados. Las cien ejecuciones E2E usan UI/cliente/HTTP/API/PostgreSQL reales y cuentas sintéticas; los hechos económicos simulados se declaran expresamente, sin controlador ficticio de aprobación ni respuesta de éxito fabricada.

Lint completo, build API/web y tipos de producto, tests y soportes configurados pasan. Se amplía únicamente apps/api/tsconfig.enrollment.json para incluir el nuevo ensayo PG; la configuración web ya incluye el nuevo E2E por glob. Un config local adicional comprueba las dos suites académicas ejecutadas y sus soportes sin relajar opciones. La revisión inicial detectó una unión de fixtures que TypeScript no podía estrechar; se retuvo una referencia tipada de pago separada y se repitieron los checks. Fue un fallo de preparación del test, no un rojo de negocio.

La primera regresión visual de oferta obtuvo 28/32 ejecuciones aprobadas y cuatro fallos (R02 status/role por dos proyectos). Esperaba un PATCH al guardar un formulario sin cambios, mientras T080 ya evita preparar/enviar comandos vacíos. Se actualiza esa suite existente para exigir primero el aviso de ausencia de cambios y cero PATCH, después editar la descripción con una revisión docente explícita y exigir un único PATCH con solo commandId/expectedRevision/description. Se conservan las aserciones de identidad inalterada, retiro, ocultamiento, publicación explícita, generación nueva, vista del alumno y dimensiones. Se repite la suite completa; no se eliminan comprobaciones ni se amplían timeouts. Solo cambió el ensayo; se actualizaron hashes/imágenes y se repitieron lint y tipos de las pruebas afectadas. Los diagnósticos no se suman a las cifras finales.

## Entorno y conservación

Proyecto Docker aislado academic-offering-fa3d46bddbb8, APP_ENV=test, academia_v00_test, runtime/migración separados, cero puertos publicados. PostgreSQL16.14 y volumen de2026-10-19 conservados. Ambas imágenes coinciden con 531 archivos fuente de apps; nueve módulos backend compilados coinciden con T079–T080. Se conservan todos los archivos productivos, siete migraciones y 74 archivos protegidos. Los únicos cambios previstos son dos ensayos nuevos, la suite de revisión docente adaptada al guardado sin cambios, la inclusión tipada del ensayo PG, este informe/JSON y marcas/estado/evidencia de T081/T082 en tasks.md.

Scripts y reportes crudos en .cache/reservas-t081-t082/: setup, prepare/build/start, run/validate/classify, pruebas de fuente/compilado, record/complete/audit y finalize. PG y navegador se ejecutan secuencialmente. Al terminar se detienen solo db/mailpit del ensayo. Se mantienen el volumen, contenedor manual T042 y esquemas anteriores de upgrade/aceptación humana; no hay limpieza de datos ajenos, commit ni despliegue. Contratos, quince respuestas, checklist12/16, verification.md y evidencias previas quedan intactos.

## Puertas y continuidad

**78/94 tareas completas,16 pendientes.** Sigue **T083**, observación humana del recorrido administrativo con un responsable real y alumno cuando corresponda. Este checkpoint automatizado no sustituye esa observación ni acredita comprensión humana/SC-007. T042 conserva exclusivamente su ensayo anterior en computador. La aceptación técnica global T084 de toda la feature también permanece pendiente.

D02/T056–T059 y política económica bloquean proveedor/cobros reales; D10/capacidad y D13/24h/operación mantienen sus puertas. No se habilitan resolución económica, devolución, traslado, cancelación financiera o matrícula manual. No se ejecutan cargas/perfil10/25 ni se aprueban capacidad, operación real24h, publicación o aceptaciones pendientes de001/002.
