# Revisión técnica local integrada T084

Fecha: 2026-11-15, America/Lima. **T084 completada; aceptación integral T094 pendiente.**
Base Git `cfc001eac89292c1b135dbba79be9a9ca8cc0b8b`, rama `feat/003-reservas-ordenes-matricula`. Se registraron los
hashes de 948 archivos existentes antes del bloque, incluidos cambios
sin commit. [Resultados por caso, ejecución, fuente y requisito](verification-results.json).

La revisión integra reservas/órdenes US1, núcleo local de pagos US2, vencimiento US3
y consultas/seguimiento/mantenimiento US4. Sus dependencias T041, T055, T069 y T082
estaban completas. T083 no es dependencia de esta revisión técnica y sigue pendiente
de observaciones reales del responsable, que confirmó disponibilidad en computador.

## Resultados finales

4135 casos únicos y 4336 ejecuciones finales aprobadas, cero fallos,
omitidos o flaky en la selección final. Los conteos de checkpoints anteriores no se
suman a esta ejecución. Los títulos parametrizados iguales se distinguen por orden
de declaración dentro del mismo archivo y se respaldan con el manifiesto de fuente.

| Suite | Casos únicos en la suite | Ejecuciones finales | Resultado |
| --- | --- | --- | --- |
| us4-unit | 753 | 753 | Aprobado |
| web-all | 486 | 486 | Aprobado |
| integrated-pg | 2798 | 2798 | Aprobado |
| guard-lima | 93 | 93 | Aprobado |
| crypto-mail | 2 | 2 | Aprobado |
| integrated-browser | 80 | 160 | Aprobado |
| browser-stability | 2 | 12 | Aprobado |
| offering-browser | 16 | 32 | Aprobado |

Las suites se solapan: no sumar la columna de únicos para obtener el total global.
UTC/America-Lima y escritorio/móvil son repeticiones de casos. Navegador:
96 casos únicos/204 ejecuciones; 93
ejercitan pantallas y 3 ejecutan el cliente de producto contra
HTTP/API/PG desde Playwright, sin acreditar UX móvil para estos últimos.

Lint de ambos workspaces, compilación API/web, arquitectura y tipos de aplicación,
tests y configuración de matrícula aprobados. Se comprobó adicionalmente el tipado
de las fixtures corregidas y de la regresión E2E de mantenimiento/revisión docente.
El JSON enlaza 23 FR del alcance local de T084, con límites expresos para proveedor,
humanos y operación. FR-023/capacidad conserva la puerta D10.

## Corrección encontrada al ampliar la revisión

El primer intento de revisión integrada descubrió fixtures históricas de identidad/oferta
que hacían TRUNCATE de tablas anteriores sin incluir nuevas referencias financieras.
Fallaban en preparación/limpieza, antes de las aserciones de producto. Se adaptaron
nueve suites mediante [truncateFixtureTables](../../../apps/api/tests/support/fixture-truncate.ts),
que calcula dependencias dentro del mismo esquema aleatorio de test y solo incorpora
tablas adicionales vacías. Rechaza filas dependientes, otros entornos y TRUNCATE CASCADE.
No elimina coordinadoras ni cambia permisos, tablas o comportamiento de producto.
La comprobación antigua de cinco migraciones se actualizó a las siete vigentes.

Se añadieron tres pruebas PG FT01–FT03: referencias vacías y coordinadoras conservadas,
rechazo ante precio existente sin borrar curso/precio, y rechazo de CASCADE/entorno
ajeno. Se reconstruyeron ambas imágenes y verificaron sus fuentes. La ejecución del13 se interrumpió antes de producir los reportes completos. Se
conservaron los logs parciales como diagnóstico y se repitieron completas las
suites de integración y navegador el15. La ejecución completa de integración
detectó además una prueba de correo que suponía una API externa en puerto3000.
Se adaptó esa prueba para iniciar una composición API real propia con puerto
dinámico y cerrarla al terminar. También se actualizó la lista histórica de seis
a siete migraciones y la lista cerrada de campos administrativos para incluir la
descripción nullable aprobada en T080; se añadió su comprobación explícita de null.
Las listas cerradas públicas y docentes mantienen su contrato. La prueba antigua
de ausencia de consultas financieras ahora comprueba la lista administrativa
autorizada y la ausencia de confirmación financiera manual, manteniendo CSRF,
origen, tamaño y huella financiera intactos. Se repitieron las
cuatro suites completas: los resultados finales sustituyen esas suites y conservan
los casos de archivos sin cambios. El
JSON identifica ambos reportes, hashes y sustituciones; no presenta esa selección
como una segunda ejecución completa. Lint, tipos y build se comprobaron otra vez
tras esta corrección. Las unitarias del13 conservan fuente inmutable verificada
por hash y se identifican como tales, sin sumar checkpoints históricos.

Los diagnósticos de preparación, expectativas históricas y carrera de fixture se conservan,
separados del resultado final y del conteo de casos únicos. No se relajaron tiempos,
aserciones ni cuotas para obtener el resultado. Los módulos compilados de producto
coinciden con T081–T082; no se añadieron endpoints de aprobación ni simuladores productivos.

La ejecución completa de navegador obtuvo159 aprobadas y un fallo NM02 en escritorio.
Su preparación adelantaba el reloj antes de actualizar las sesiones ficticias,
exponiendo estados incoherentes a una petición en vuelo. Se añadió una transacción
de fixture para publicar ambos cambios juntos, aplicada en NM02 y U4E03; las
sesiones y las reglas de autenticación de producto no se modificaron. Se repitieron
las dos suites completas en escritorio y móvil (18 ejecuciones) y ambos casos
tres veces por proyecto (12 ejecuciones adicionales). El reporte final sustituye
los dos archivos por sus resultados corregidos y conserva el diagnóstico original.
No se ampliaron tiempos de espera ni se habilitaron reintentos automáticos.

## Entorno y preservación

Proyecto aislado `academic-offering-fa3d46bddbb8`, PostgreSQL 16.14 (Debian 16.14-1.pgdg12+1),
APP_ENV=test, base `academia_v00_test` y roles runtime/migración separados. Compose
de regresión conserva cero puertos publicados. Las imágenes corresponden a los
533 archivos apps del manifiesto; fuente e imagen coinciden.
Siete migraciones y 74 archivos protegidos permanecen
intactos, al igual que la evidencia previa y los checklists. T042 conserva sus bytes
originales y sus datos. No se eliminaron volúmenes ni se ejecutó bootstrap manual.

El ensayo temporal T083 del13 usó un esquema nuevo y un contenedor propio con puerto
exclusivo 127.0.0.1:5175. Su proceso terminó y no se ofrece el enlace como activo; [guion y alcance](t083-guide.md). La comprobación técnica
de ADMIN y STUDENT obtuvo login/me/consulta autorizada 200 y logout 204; no acredita
participación ni aceptación humana. El proceso preparatorio histórico de hasta ocho horas
no se cuenta como caso aprobado T084 ni como observación operacional de 24 horas.

## Puertas pendientes

| Puerta | Estado |
| --- | --- |
| T042 humana US1 | Resultado histórico favorable comunicado por el responsable; solo computador. |
| T083 humana US4 | Sesión y guion preparados; faltan resultados humanos reales. |
| T056–T059/D02 | Adaptador y sandbox reales pendientes. Hechos económicos locales explícitamente simulados en fixtures. |
| T085 | Ajuste CI y comandos pendientes; ninguna ejecución CI remota acreditada aquí. |
| T086/D13 | Ensayo separado de upgrade/restore y requisitos operativos pendientes. Las pruebas PG de migración no cierran esa tarea. |
| T087/INV-DOC-01 | Sincronización de documentación general pendiente; no se acredita por crear este informe. |
| T088 | Revisión específica de datos/logs/fronteras pendiente. Pruebas negativas verdes no sustituyen ese informe. |
| T089 | Aceptación humana integrada y proveedor real pendientes. |
| T090 | Observación operacional real de 24 horas/D13 pendiente; reloj de fixture no la sustituye. |
| T091–T093/D10 | Escenario aprobado, VPS y cargas autorizadas pendientes; no se acredita capacidad de 2500 activos. |
| T094 | Aceptación integral pendiente de sus dependencias y puertas. |

La política económica mantiene aprobación propia fuera de este incremento. No se
habilitan cobros reales, devoluciones, traslados, cancelación financiera o matrícula
manual. Tampoco se cierran tareas humanas pendientes de las especificaciones 001/002.
El siguiente bloque técnico es T085; T083 puede completarse al recibir el ensayo real.


## Seguimiento T087 — INV-DOC-01

2026-11-15, America/Lima. INV-DOC-01 corregido en su alcance documental:
README, alcance del MVP y actores/HU/RF distinguen implementación, verificación
local y propuesta. Se conservan IDs, descripciones de requisitos, decisiones y
evidencia histórica. El catálogo 002 conserva capacidad sin disponibilidad
calculada; el inventario financiero y /reservar pertenecen a 003. No se atribuyen
pagos reales a la simulación de test ni se amplían permisos económicos.

La tabla anterior registra el estado del checkpoint T084. Posteriormente
[T085](t085.md) completó la configuración de CI y comandos, y
[T086](recovery.md) completó el upgrade 0005→0007 y restore aislado. Actions remoto,
D13 operativo/24 horas, proveedor D02, T083 humana, T089, D10 y T094 siguen abiertos.
Los resultados locales T084 y los humanos históricos T042 no se presentan como
pruebas nuevas. T104/T108 de 001 y T073/T074 de 002 conservan sus pendientes.

Se revisaron las rutas web, composición de pagos sin adaptador conectado, permisos,
migraciones y evidencias locales. Este bloque solo cambia documentación; no ejecuta
suites de producto, servicios, pagos, cargas o despliegues. La comprobación de enlaces,
IDs, preservación y trazabilidad se registra en [t087-results.json](t087-results.json).
Los hallazgos INV-DOC-01 en inventarios de diseño siguen intactos como historia;
este cierre no valida otros documentos fuera de los cinco resúmenes actualizados.
Checklist 12/16 conservado; sin hooks de implementación. Siguiente bloque: T088,
revisión específica de datos, errores, logs y fronteras.


## Seguimiento T088 — revisión de seguridad local

2026-11-15, America/Lima. [Revisión acotada](security-review.md) completada con
409 pruebas seleccionadas aprobadas: 224 API/PG/HTTP y 185 web con Vitest.
Los [resultados y fuentes](security-review-results.json) distinguen pruebas de
componente, HTTP real y clientes, sin sumar conteos T084 ni acreditar E2E nuevo.
No requirió cambios de producto, tests o migraciones; permisos, cuotas, CSRF y
privacidad de proyecciones/registros de aplicación conservados. La revisión no
aprueba D02, retención/custodia D13, operación de 24 horas o aceptación integral.

La tabla histórica T084 mantiene su fecha y estado de entonces. T085–T088 están
completas en su alcance local. Siguiente pareja por orden: T089–T090; requiere
proveedor/sandbox T059, observaciones reales T083 y autorización/acuerdos D13
según cada dependencia. No se cierran con simulación ni disponibilidad del participante.


## Preparación T089–T090 — puertas pendientes

2026-11-15, America/Lima. [Guion humano integrado](human-integrated-guide.md) y
[plan operacional de 24 horas](operation.md) preparados. El
[registro de preparación](t089-t090-preparation-results.json) acredita revisión
documental y preservación, no participantes, sandbox o transcurso físico.
No se ejecutaron nuevas pruebas de producto ni se iniciaron servicios en este bloque.

T083 continúa pendiente de acciones/observaciones humanas reales; T056–T059/D02
requieren modalidad, documentación y sandbox autorizados. D13 requiere responsables,
destino, custodia/retención, RPO/RTO, salud horaria y autorización concretos antes de
iniciar T090. El restore T086 completo no cierra por sí solo esas decisiones.
T089 y T090 permanecen sin marcar; avance total conservado en 83/94. Tampoco
se cierra T094, se habilitan cobros reales o se acredita capacidad por esta preparación.


## Cierre humano T083 comunicado por el responsable

Registro del 2026-11-15, America/Lima. El responsable confirmó haber probado los
pasos de precio, consulta, seguimiento y vista del alumno en computador, y que
la anotación se conservó con incidencia pendiente, sin matrícula ni devolución.
Se cierra T083 conforme a ese resultado comunicado, sin observación directa del
agente ni atribución de otro participante, móvil, teclado o tiempos no informados.
[Evidencia y límites](human-acceptance.md); [registro](t083-human-results.json).

El responsable indicó que no tiene acceso al sandbox de Izipay. T059/D02 sigue
pendiente y bloquea el cierre T089 y la ejecución T090, que además requiere D13.
Los estados pendientes anteriores describen su momento histórico; esta confirmación
no convierte la preparación integrada en sesión ejecutada ni inicia las 24 horas.
Avance actualizado: 84/94 tareas completas; T094 integral sigue abierta.
