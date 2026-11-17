# Aceptación parcial de oferta académica — T074 pendiente

Revisión documental: **2026-10-29, America/Lima**. Rama `feat/002-oferta-academica`.
Base revisada: **d9c8059e9054e74dafde5aba8669b20ba21e4418**.
**Sin aceptación integral ni humana. T073/T074 permanecen pendientes (72/74 tareas completas).**

Este documento reúne evidencia existente conforme al alcance textual de T074.
El responsable aplazó la observación humana el 2026-10-29; no hay participante,
sesión ni resultado registrado en el [protocolo T073](human-acceptance.md).
No se aprueba SC-002 ni se sustituye al alumno por el agente o Playwright.
[Índice y comprobaciones de esta revisión](acceptance-review-results.json).
Las métricas de producto citadas abajo son históricas: no son pruebas nuevas de este bloque.

## Alcance y fuentes normativas

[Spec y cinco aclaraciones](../spec.md), [plan](../plan.md),
[modelo](../data-model.md), contratos [HTTP](../contracts/api.md),
[integración](../contracts/integration.md) e [interfaz](../contracts/ui.md),
[tareas](../tasks.md) y [constitución 1.2.0](../../../.specify/memory/constitution.md).
Las referencias a constitución 1.1.0 y formulaciones futuras del diseño conservan
su fecha/etapa; este cierre parcial se evalúa contra 1.2.0 sin reescribirlas.

HU08/HU09/RF10: preparar, publicar, consultar y mantener cursos/grupos con horarios,
capacidad configurada 1–50, docente y acceso por rol. Curso y grupo tienen datos,
revisiones y estados propios. Solo administración escribe; alumno consulta oferta
visible, docente únicamente sus grupos asignados y visitante no accede. America/Lima,
franjas contiguas y fechas inclusivas; sin cruce de medianoche. Retirar antes de editar,
republicación explícita y cancelación terminal. Reactivar docente no recupera visibilidad.

PA-01–PA-05 y E1 permanecen vigentes: las pruebas de T012 exigen ledger/auditoría y
aserciones persistidas antes de cerrar T014; los controles auxiliares del helper no
sustituyen al protocolo académico. No se adoptan reglas nuevas ni excepciones.
Sin órdenes, reservas, matrículas, pagos, materiales, clases, video, chat o AWS.

## Cuatro checkpoints y evidencia posterior

| Checkpoint | Revisión y fecha atribuidas | Resultado registrado y límite |
| --- | --- | --- |
| [US1 — T030](us1.md) | Base cf2fc85; 2026-10-22 | Preparación, validación, dos grupos independientes y persistencia. API 266/266, PG/HTTP 74/74, web 141/141, E2E funcionales 60/60 más dos controles auxiliares. No atribuía publicación implementada. |
| [US2 — T042](us2.md) | Base 249df75; 2026-10-23 | Publicación, consulta y carreras reales. API 308/308, PG/HTTP 310/310, web 156/156, E2E conjuntos 92/92 incluidas dos ejecuciones auxiliares. SC-002 humano quedó pendiente. |
| [US3 — T053/T054](us3.md) | Backend e95eb8c y ajustes web identificados por hash; cierre 2026-10-26 | Diez escenarios de mantenimiento, retiro, cancelación, revisiones y replay. API 335/335, PG/HTTP 579/579, web 169/169 y E2E 120/120 incluidas dos ejecuciones auxiliares. |
| [US4 — T066](us4.md) | Producto f6aa09f más corrección de fixture por hash; 2026-10-26 | Permisos, pertenencia, habilitación y revisión. PG/HTTP 695/695; 24 casos únicos docentes/revisión × dos perfiles = 48/48. Harness y M09 se registran separados. T065 conserva la regresión de identidad. |

No se suman estas suites: se solapan y pertenecen a revisiones distintas. Las
repeticiones UTC/America/Lima y escritorio/móvil son ejecuciones de los mismos casos;
los controles de infraestructura, locks, readiness o fixtures se conservan separados
de los comportamientos académicos que habilitan.

| Puerta posterior | Evidencia atribuida a su ejecución |
| --- | --- |
| [T068 local](automated.md) | Producto 3a94331 más patch CI/lint y prueba de redacción identificados por hash; cierre 2026-10-29. API UNIT 335/335; web 188/188; PG/HTTP 1972/1972, 70 archivos; crypto/mail 2/2; E2E identidad 203/203; oferta 168/168, 84 casos únicos por dos proyectos, incluidos auxiliares. Lint/tipos/build aprobados. |
| [T069 recuperación](recovery.md) | Base 666dc11 más archivos de ensayo por hash; 2026-10-29. Cuatro fases ejecutadas: legacy, upgrade, postbackup y restore. Una prueba parametrizada por fase, sin atribuir cuatro suites diferentes. Siete casos auxiliares de cifrado, cinco guardas y dos de tiempos registrados aparte. |
| [H-CAP-01](h-cap-01.md) | Corrección incorporada en d9c8059, base 48a8087; 2026-10-29. Rojo B03 por aviso ausente; después catálogo 10 casos únicos × dos perfiles = 20/20, web 188/188, lint/capas/tipos/build aprobados. Las aserciones posteriores de comparación y privacidad se alcanzaron. |

T068 no cubre por sí sola el cambio posterior del catálogo: H-CAP-01 aporta su
verificación dirigida. Esta revisión documental no vuelve a ejecutar la puerta
completa, E2E, smokes, migraciones, restauraciones ni cargas, y no modifica código.
Los comandos y artefactos privados originales siguen referenciados en cada informe.
La instalación del workflow [T067](t067.md) no acredita una ejecución remota ni la
suficiencia de sus 20 minutos; ambas verificaciones permanecen pendientes.

## Matriz de requisitos funcionales

Estado de las 16 filas: **evidencia automatizada registrada en el alcance indicado**.
La columna de evidencia no otorga aceptación humana ni integral; FR-006/009/014
conservan su porción observacional mediante SC-002/V-A13. Las verificaciones V-Axx
corresponden al plan; no son nuevas pruebas ejecutadas aquí.

| Requisito | Comportamiento y límite comprobados | Trazabilidad y evidencia |
| --- | --- | --- |
| FR-001 | Crear, listar, consultar y editar; persistencia e independencia de grupos. | V-A01, V-A10; [us1](us1.md), [us3](us3.md), [automated](automated.md) |
| FR-002 | Datos de curso separados de grupo; referencia y pertenencia estables, hermano sin cambios. | V-A01; [us1](us1.md), [t023](t023.md), [automated](automated.md) |
| FR-003 | Fechas inclusivas, días/horas semanales y America/Lima explícita. | V-A02; [t023](t023.md), [us1](us1.md), [us2](us2.md), [automated](automated.md) |
| FR-004 | Ocurrencias efectivas, medianoche, adyacencia y conflictos docentes al publicar/republicar, también concurrentes. | V-A02, V-A07, V-A08; [t023](t023.md), [us2](us2.md), [us3](us3.md), [automated](automated.md) |
| FR-005 | Enteros 1–50; omisión inicial frente a valor inválido; retirar antes de cambiar capacidad publicada. | V-A03; [t023](t023.md), [us1](us1.md), [us3](us3.md), [automated](automated.md) |
| FR-006 | Capacidad configurada sin ocupación/disponibilidad ficticias; aviso también en catálogo inicial tras H-CAP-01. | V-A03, V-A10, V-A13; [us2](us2.md), [h-cap-01](h-cap-01.md); porción humana pendiente en SC-002. |
| FR-007 | Validación backend, confirmación, un docente habilitado y curso publicado; publicación de grupos explícita. | V-A01, V-A06, V-A07; [us2](us2.md), [us3](us3.md), [us4](us4.md), [automated](automated.md) |
| FR-008 | Retiro previo, hijos conservados, republicación validada y cancelación terminal sin efectos económicos. | V-A01, V-A08; [us3](us3.md), [us4](us4.md), [automated](automated.md) |
| FR-009 | Inicio→oferta y comparación; docente solo Mis grupos; visitante denegado. | V-A04, V-A10, V-A13; [us2](us2.md), [us4](us4.md), [h-cap-01](h-cap-01.md); porción humana pendiente en SC-002. |
| FR-010 | Backend revalida sesión/rol/habilitación y pertenencia; matriz y accesos directos permitidos/denegados. | V-A04, V-A06, V-A08, V-A12; [us4](us4.md), [us4-authorization-matrix](us4-authorization-matrix.md), [automated](automated.md) |
| FR-011 | DTO/directorio mínimos, filtros antes de paginar, sin correo, credenciales ni causas privadas. | V-A05; [us2](us2.md), [us4](us4.md), [automated](automated.md) |
| FR-012 | Pérdida y recuperación de habilitación no republican; revisión persistente y publicación explícita; cancelación terminal. | V-A06, V-A08; [us3](us3.md), [us4](us4.md), [automated](automated.md) |
| FR-013 | Carga/vacío/error/reintento, revisión y resultado incierto, sesión perdida, entradas conservadas y cancelar sin escribir. | V-A05, V-A09, V-A10; [us1](us1.md), [us2](us2.md), [us3](us3.md), [us4](us4.md), [automated](automated.md), [h-cap-01](h-cap-01.md) |
| FR-014 | Teclado, móvil/escritorio, foco/etiquetas/errores y navegación existente. | V-A10, V-A12; [us1](us1.md), [us2](us2.md), [us3](us3.md), [us4](us4.md), [automated](automated.md), [h-cap-01](h-cap-01.md); porción humana pendiente en SC-002. |
| FR-015 | Locks observados, revisiones, commandId, replay reautorizado y atomicidad de negocio/ledger/auditoría sin secretos. | V-A05, V-A07, V-A08, V-A09; [t014](t014.md), [us2](us2.md), [us3](us3.md), [automated](automated.md), [recovery](recovery.md) |
| FR-016 | Regresión de identidad, migración incremental/restore y conservación de datos/evidencia; pendientes explícitos. | V-A06, V-A11, V-A12; [identity-regression](identity-regression.md), [automated](automated.md), [recovery](recovery.md), [h-cap-01](h-cap-01.md) |

## Matriz de criterios de éxito

| Criterio | Estado de la evidencia | Resultado y límite |
| --- | --- | --- |
| SC-001 | Demostrado en el alcance automatizado | Crear/revisar/publicar/retirar/corregir/republicar curso y dos grupos; recarga e independencia. [us1](us1.md), [us3](us3.md), [automated](automated.md) |
| SC-002 | **Pendiente** | Recorrido y avisos automatizados; falta alumno real que identifique sin ayuda los datos de dos grupos. H-CAP-01 corregido; T073 aplazada. [us2](us2.md), [h-cap-01](h-cap-01.md), [human-acceptance](human-acceptance.md) |
| SC-003 | Demostrado en el alcance automatizado | 21 rutas/métodos, cinco perfiles de actor: 350 combinaciones de estado y 84 pérdidas de acceso, sin datos/efectos denegados. [us4](us4.md), [us4-authorization-matrix](us4-authorization-matrix.md), [automated](automated.md) |
| SC-004 | Demostrado en el alcance automatizado | Horarios/capacidad/estados/habilitación, rechazo sin cambios parciales y ocultamiento vigente. No incluye conflictos de matrícula. [t023](t023.md), [us2](us2.md), [us3](us3.md), [us4](us4.md), [automated](automated.md) |
| SC-005 | Demostrado en el alcance automatizado | US1–US4 en móvil/escritorio y teclado con vacíos/errores/conflictos/éxitos; sin órdenes/pagos/matrícula. [us1](us1.md), [us2](us2.md), [us3](us3.md), [us4](us4.md), [automated](automated.md) |
| SC-006 | Demostrado en el alcance automatizado | Ediciones concurrentes, repetición/commit ambiguo y atribución mínima; sin sobrescritura silenciosa ni duplicados en los casos registrados. [us2](us2.md), [us3](us3.md), [automated](automated.md), [recovery](recovery.md) |

V-A01–V-A12 se trazan en [T068](automated.md), con la porción incremental/restore de
V-A11/V-A12 completada por [T069](recovery.md). V-A13 sigue pendiente de alumno real.
SC-003 se limita a la [matriz explícita](us4-authorization-matrix.md); no afirma
cobertura de cualquier operación futura ni sustituye la medición de capacidad.

## Comprobación constitucional vigente

| Principio | Evidencia dentro de 002 | Límite o pendiente |
| --- | --- | --- |
| I. Incrementos y evidencia | Spec/aclaraciones/plan/tareas; cuatro checkpoints, T068/T069 y H-CAP-01 con versiones y resultados separados. Checklist documental 16/16, solo lectura. | T073 no ejecutada; T074 parcial y sin marcar. No se introduce aceptación por casillas ni se cambian criterios. |
| II. Autorización backend | Matriz US4/SC-003, consultas filtradas y revalidación transaccional; regresión T065/T068 de identidad. | No concede matrícula ni permisos de materiales/clases futuras. Guarda visual no es autorización. |
| IV. Integridad de cupos | Capacidad 1–50 configurada, sin ocupación/disponibilidad; comprobación de atomicidad y duplicados de comandos académicos. | No demuestra reserva, último cupo o matrícula. La reserva de 24 h está confirmada para el futuro spec; D04 y conciliación siguen delimitadas. |
| IX. Entornos y secretos | Checkpoints/T068/H-CAP-01: proyecto aislado, esquemas ficticios, guardas de puertos/mounts y configuración manual conservada. T069 usa sus proyectos exclusivos. | Este bloque solo lee archivos y prepara documentación; no arranca Docker ni consulta bases, no crea cuentas ni maneja participantes. |
| X. Recuperación | T069 aplica 0001–0004→0005, compara identidad y restaura 14 tablas con revisiones, generación, snapshots, ledger/auditoría. Invalida 4 sesiones, 2 enlaces y 2 correos; revisa tres decisiones posteriores al backup. | Solo preupdate.enc restaurado; preacademic.enc no se atribuye como restaurado. RTO observado 55.19 s y ventana superior no protegida 64.68 s no son SLA/RPO aprobados. D13 sigue abierta. No habilita demo persistente ni publicación. |
| XI. Capacidad demostrable | Se conservan informes históricos sin rebautizar resultados ni convertir E2E/readiness en carga. | Al menos 15 000 cuentas requeridas y objetivo de 2500 usuarios activos pendientes de su evidencia; sin capacidad aprobada para 1000/2500. S/300 total, sin contratación ni despliegue. |

III/V/VI/VII/VIII no se acreditan como flujos de este incremento: precios, pagos,
idempotencia de pagos, pasarela y video siguen fuera de 002. El ledger académico
no demuestra procesamiento de pagos. No se conceden excepciones constitucionales.

## Conservación, hallazgos y decisiones pendientes

H-CAP-01 queda corregido y verificado automáticamente; se conservan tanto el
[descubrimiento T072](t070-t072.md) como el rojo y verde posteriores. La observación
humana aún debe usar una revisión que incluya la corrección y registrar los datos
realmente publicados; no se anticipan los resultados del protocolo.

Persisten los hallazgos de bootstrap intermitente y timeouts históricos de
arquitectura/B02/D10 E2E. Los pases posteriores no confirman causa ni estabilidad;
no se amplían límites ni se elimina evidencia de fallos. El caso E2E D10 es distinto
de D10/rúbrica. T068 conserva la interrupción y el fallo inicial de allowlist junto
a sus correcciones y repeticiones aprobadas; T069 conserva intentos fallidos de
configuración/fixtures y el fallo SQL deliberado del ensayo sin ocultarlos.

Identidad mantiene [T103 completa como ejecución/informe](../../001-identidad-acceso-roles/evidence/load-resources.md),
con capacidad sin aprobar. [T104 y T108](../../001-identidad-acceso-roles/tasks.md)
permanecen pendientes: diez participantes y aceptación integral propias, no sustituidas
por T073. Se conservan configuración, credenciales, cuentas, datos, volúmenes, lockfile,
Compose, migraciones históricas y evidencias del primer spec. La revisión de hashes
de este bloque comprueba archivos; no se atribuye una nueva inspección del motor/BD.

Reservas, órdenes y matrícula continúan en la [planificación futura](../../../docs/planificacion/reservas-capacidad.md)
y su [backlog](../../../docs/planificacion/tasks.md). No se crea rama, carpeta ni
implementación de ese spec. Se confirman reserva previa al pago y 24 horas exactas
(86 400 s desde confirmación servidor), pago verificado confirma matrícula y
vencimiento sin pago libera cupo mediante conciliación consistente por diseñar.
Configurar capacidad no reserva plazas; describir horarios no resuelve conflictos
de matrícula D06. RA-01–RA-06 siguen abiertas: varios cursos/atomicidad, prioridad,
pago en límite, reembolso/pago tardío, cancelación/cambios y abuso de cupos.

CI remoto y duración, D10/rúbrica, D13/custodia/retención/RPO/RTO, SMTP externo y
video/protección/alojamiento siguen pendientes. VPS/k6 desde otro equipo y el perfil
local 10/25 conservan su etapa prevista, sin cargas completas ni contratación.
No se implementa ni se prepara infraestructura AWS.

## Próximo bloque y condición de cierre

Comprobaciones de este bloque documental: prerrequisitos Spec Kit y checklist
16/16 aprobados; 16 FR, seis SC, 13 IDs V-A y cuatro checkpoints trazados; métricas
históricas contrastadas con sus JSON. Se verificaron 544 enlaces en 28 documentos
sin roturas nuevas ni preexistentes en el conjunto revisado. De 675 archivos de la
base, 673 no cambian; solo README y notas de tasks se actualizan, más este cierre y
su índice nuevos. Los 72 archivos protegidos, 74 descripciones/marcas y seis puntos
de historial comprobados se conservan; ningún secreto detectado. Sin hooks registrados.
El verificador local corrigió la lectura de casillas históricas [x]/[X] antes de
aprobar; ese error del control no se atribuye a una prueba de producto ni a T103.

Prerrequisitos ejecutados con
`powershell -NoProfile -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`.
Revisión ejecutada con `node .cache/academic-acceptance-t074/review.mjs`;
fuentes de la matriz, baseline y reporte locales permanecen en ese directorio
privado ignorado. Sin cambios de código, no se repiten tipos/lint/build ni suites
funcionales: **cero pruebas de producto nuevas** en este bloque.

T073: cuando se acuerde la sesión, responsable y alumno real recorren desde Inicio
con datos ficticios en un proyecto exclusivo. Registrar revisión exacta, guardas,
curso/dos grupos, observaciones, ayudas e incidencias según el protocolo. No hay
fecha o participante confirmados; la observación sigue aplazada por el responsable.
Si falla algún criterio, conservarlo pendiente e identificar la corrección necesaria.

Después, T074 deberá incorporar la evidencia real, revisar esta matriz y las puertas
pendientes que correspondan al alcance, registrar el resultado y solo marcarse si
cumple íntegramente su descripción. **Estado actual: aceptación parcial; T073/T074
sin marcar.** La evidencia de capacidad y decisiones futuras conservan sus puertas
propias; este documento no autoriza despliegue ni aceptación global del MVP.
