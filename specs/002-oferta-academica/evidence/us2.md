# Checkpoint US2 — publicar y comparar oferta (T042)

Fecha: 2026-10-23, America/Lima. Rama `feat/002-oferta-academica`.
Base limpia: **249df75**, con merge **b0af757** y ambos historiales conservados.
Alcance exclusivo: T042; no avanzar a T043. Resultados por caso, comandos y
conservación en [us2-results.json](us2-results.json).

## Procedimiento y alcance

Se utiliza `.agents/skills/speckit-implement/SKILL.md`. Prerrequisitos correctos,
checklist requirements.md 16/16, sin cambios; sin AGENTS.md aplicable ni extensions.yml
con hooks. Se revisaron constitución **1.2.0**, spec/PA-01–PA-05, tareas/dependencias,
plan, investigación, modelo y contratos HTTP, integración e interfaz. Los archivos
de diseño con referencias a 1.1.0 describen su etapa histórica; no se reescriben.

Se comprueba HU08/HU09/RF10 en publicación y comparación, junto con regresión de
preparación US1 y políticas de las operaciones existentes. No se cambian código,
tests, aserciones, timeouts, retries, dependencias, infraestructura ni reglas de negocio.
No se necesitan aclaraciones nuevas para ejecutar el checkpoint aprobado.

| Escenario US2 | Evidencia ejecutada y criterio |
| --- | --- |
| US2.1 | B01: datos incompletos asociados a campos, sin publicación ni cambios parciales. T032 y publicación directa enumeran faltantes y verifican rollback desde observador. |
| US2.2 | B02: cancelar confirmación no escribe; publicar curso no publica sus grupos; publicación explícita de dos grupos y acceso desde Inicio al catálogo como alumno. |
| US2.3 | B03: curso/grupo, docente por nombre, días, horas, fechas y America/Lima; DTO cerrado, sin email ni causas administrativas. T033 comprueba cada ruta como ADMIN/STUDENT. |
| US2.4 | B03: «Capacidad máxima: 45 alumnos» y «Ocupación y disponibilidad no calculadas»; compara también capacidad 50. Cero acciones de compra/reserva y cero escrituras académicas durante consulta. |
| US2.5 | B04/B05: catálogo vacío distinto de fallo SQL real; reintento manual tras recuperar permisos. Catálogo PG valida filtros antes de paginar/contar y una sentencia por proyección. |
| US2.6 | B06, dos casos: enlace previo de grupo o curso retirado retorna «Oferta no disponible», sin causa privada. Los estados se preparan por fixture SQL; no se atribuye implementación de rutas de retiro/cancelación. |

B07 comprueba visitante y docente sin catálogo general; B08 usa la misma proyección
pública como administrador. P01–P05 amplían cancelación/foco, ediciones sin guardar,
revisión concurrente, repetición tras respuesta perdida, curso bloqueado y segunda
página real de grupos. Se conserva la prueba original T035 sin modificar expectativas.
El recorrido automatizado no sustituye al alumno real que exige SC-002.

## Suites y resultados

**T042 aprobada**. Todas las suites terminaron con código 0, sin fallos inesperados,
omitidos, flaky ni reintentos. Solo se cierra T042 en tasks.md, con el registro del
checkpoint y la referencia vigente de continuidad en planificación.

| Suite del checkpoint | Resultado |
| --- | --- |
| API unitarias, reglas, permisos y arquitectura | **308/308**; incluye 150 casos T019/T020, 42 de T031 y 14 de arquitectura. |
| T031, repetición UTC | **42/42**; mismos casos que America/Lima dentro de API, no 42 escenarios nuevos. |
| Integración PostgreSQL/HTTP | **310/310**, ocho archivos; detalle abajo. |
| Unitarias web | **156/156**, incluidos DTO, rutas, allowlists y cancelación de respuesta tardía tras AUTH_REQUIRED. |
| Tipos/lint/compilación | API compilada antes de cada suite que carga composición; build web incluye tsc --noEmit; lint de ambos workspaces aprobado. |
| E2E conjuntos US1/US2 | **92/92**, 9,7 minutos. 45 casos funcionales × dos perfiles = 90; un control auxiliar × dos = 2. |

Desglose de navegador: T035 original 10 casos × dos perfiles = 20; P01–P05 cinco ×
dos = 10; preparación US1 original 19 × dos = 38; controles funcionales UI de US1
11 × dos = 22; harness auxiliar uno × dos = 2. Los dos perfiles son repeticiones
de los mismos casos, no 92 escenarios de negocio diferentes. T031 también conserva
42 casos únicos y 84 ejecuciones entre America/Lima y UTC; el grupo de Lima ya está
contado dentro de las 308 unitarias API.

Integración: publicación HTTP T032 **58**, catálogo HTTP T033 **44**, carreras T034
**16**, preparación HTTP US1 **74**, protección HTTP **24**, habilitación docente
**18**, publicador directo **35** y catálogo directo **41**. Todos aprobados con
PostgreSQL real. T032 contiene dos controles, tres proyecciones previas y 53 casos
de publicación; T033 separa dos controles y 42 casos de catálogo; T034 separa dos
controles de barreras y 14 casos del publicador. US1 incluye seis controles de
infraestructura y 68 casos académicos. Los controles no se convierten en evidencia
de publicación o de concurrencia por sí solos.

Se ejercen rechazos 400/401/403/404/409/413/415 y 503 provocados de forma controlada,
según el archivo: campos/UUID/revisión/query inválidos, sesión revocada, rol denegado,
recurso no consultable, versión/estado/habilitación/agenda, protección HTTP y fallo
SQL real. Un rechazo esperado y su rollback verificado son un caso aprobado; no se
presentan como fallos finales del sistema ni se ignoran las aserciones posteriores.

## Carreras y estado final persistido

T034 llama al publicador real con pools/conexiones distintas; instrumenta SQL real,
no fabrica filas ni respuestas. El observador independiente comprueba bloqueos
PostgreSQL efectivos y estado final. T032 y B02/P03 ejercen las rutas HTTP reales.

| Casos T034 | Resultado persistido exigido y comprobado |
| --- | --- |
| R01, ambos órdenes controlados | Un grupo PUBLISHED; otro DRAFT/revision 1; una fila de ledger y una de auditoría. Segunda publicación recibe TEACHER_SCHEDULE_CONFLICT con referencia administrativa del ganador. Nueva consulta de agenda después del lock. |
| R02 | Docentes/cursos/actores distintos confirman sin esperar un mutex global: dos grupos publicados y dos efectos/eventos. |
| R03, contiguas/días distintos/fechas disjuntas/sin ocurrencia común | Ambas publicaciones confirman; dos efectos/eventos. |
| R03, lunes común solo en extremo incluido | Un éxito y un conflicto; un efecto/evento. Se respetan fechas inclusivas y horas contiguas permitidas. |
| R04, padre retirado o revisión requerida | Otro grupo aún PUBLISHED bloquea la agenda; rechazo sin cambio del fingerprint académico. No equivale a reservar una plaza de alumno. |
| R05, grupo WITHDRAWN/CANCELLED de fixture | No bloquea la agenda; el nuevo comando confirma una publicación y un efecto/evento. No demuestra las rutas futuras de transición. |
| R06, mismo commandId simultáneo | Dos respuestas, replayed false/true, misma revisión aplicada 2; solo un grupo publicado, un ledger y un evento. |
| R07, desactivación confirma mientras publicación espera | TEACHER_NOT_ELIGIBLE después del bloqueo; fingerprint académico anterior conservado, sin publicación/ledger/evento nuevos. |

Las pruebas directas adicionales verifican redescubrimiento del conjunto/hijo/docente
sin tomar nuevos locks fuera de orden, rechazo cuando cambia el segundo docente,
revalidación de curso sin refrescar snapshots, revisión obsoleta, replay y rollback
completo ante fallo de auditoría. Recuperar habilitación no publica automáticamente;
solo la publicación explícita de un grupo apto renueva la captura. Reset de contraseña
no incrementa la generación docente. La suite de habilitación incluye revocación y
auditoría atómicas con identidad, también al fallar.

No se infiere FIFO ni una política de orden de llegada desde los locks. Los dos
órdenes de R01 son intercalaciones controladas de prueba, no una decisión RA-02.

## Reproducción y entorno

Wrappers revisados e ignorados en `.cache/academic-offering-validation/t042/`; reportes
privados en `t042-reports/`. Fijan el proyecto `academic-offering-fa3d46bddbb8`,
APP_ENV=test, sin puertos publicados ni montajes manuales y con volumen persistente
existente. Se sincroniza src/tests/Prisma/lint desde la base 249df75; no configuración
ni credenciales. Compose recreó únicamente el contenedor db aislado al arrancar:
se verificó que monta el mismo `academic-offering-fa3d46bddbb8_postgres_data`.

Acciones secuenciales, deteniéndose ante cualquier código distinto de 0:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t042/environment-before.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t042/run.ps1 -Action up
foreach ($action in @('unit','visibility-utc','integration','web','lint','build','browser')) {
  powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t042/run.ps1 -Action $action
  if ($LASTEXITCODE -ne 0) { throw "Checkpoint no aprobado: $action" }
}
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t042/close.ps1
```

Los comandos internos reutilizan npm/Vitest/Playwright existentes: test:unit de API
y web; Vitest con los ocho archivos enumerados; visibility.test.ts en TZ=UTC; npm
run lint; npm run build --workspace apps/web; Playwright con la configuración
academic-offering completa. No cambian perfiles escritorio/Pixel 7, límites, workers
o retries. Se genera Prisma y dist API en los contenedores antes de importar AppModule,
evitando el problema histórico de dist antiguo. No se crean nuevas migraciones; los
fixtures aplican el historial solo a sus esquemas t_ y cuentas ficticias.

Los smokes k6 no se repiten: no cambia identidad, transporte ni recorridos desde el
bloque anterior; el checkpoint verifica sus políticas mediante las suites indicadas.
Los 21/21 de acceso y 8/8 de perfil de [T039–T041](t039-t041.md) son evidencia previa
con fuente conservada, no ejecuciones nuevas aquí. Tampoco se ejecutan cargas completas,
el seguimiento 10/25, compras, VPS o AWS. No se opera contra el entorno manual.

## Conservación, constitución y pendientes

La comparación final confirma **72/72 archivos protegidos sin cambios** y fuente,
tests, migraciones, configuración y evidencia histórica sin cambios respecto de
249df75. Se mantienen las definiciones completas de las 74 tareas; únicamente T042
cambia de pendiente a completa. Los tres volúmenes inspeccionados conservan nombre
y creación; el entorno manual sigue detenido con los mismos instantes de inicio/parada,
sin SQL ni operaciones sobre sus cuentas/datos. Cero esquemas t_ residuales. Se
detienen únicamente db/Mailpit del proyecto aislado y se conserva su volumen.
La verificación de enlaces y coherencia se registra en us2-results.json.
Los avisos NativeCommandError de PowerShell por stderr de Docker se distinguen de
códigos de salida y JSON reales; no se cuentan como fallos de pruebas. La incidencia
histórica de timeout de arquitectura y su repetición aprobada permanecen en sus
[evidencias originales](t014.md); no reapareció y no se aumentaron límites.

Constitución I/II/IX/X/XI aplicada al alcance comprobado: SDD, autorización backend,
separación, historial de migraciones conservado y evidencia sin extrapolar capacidad.
IV–VII no autorizan reservas/matrícula/pagos en 002; VIII/video queda fuera. No hay
nueva excepción ni decisión de negocio. PA-01–PA-05 y E1 intactos; las garantías
académicas se atribuyen a publicador/HTTP/SQL reales, no a los helpers de barreras.

SC-002 humano sigue **pendiente de T073**. SC-001, matriz completa SC-003, resto de
fronteras/ciclo editorial SC-004, recorridos US3/US4 de SC-005 y el resto de SC-006
no se dan por aceptados a partir de este checkpoint. Docente propio/ajeno, retiro,
cancelación y sus carreras completas permanecen en sus tareas posteriores.

D04, matrícula de D06, D10/D13, SMTP real, T104/T108 y bootstrap histórico siguen
abiertos. T103 conserva ejecución/informe con capacidad sin aprobar. Se preservan
historial de carga 1000, ≥15 000 cuentas como requisito y objetivo 2500 activos sin
demostrar, sin confundirlos con solicitudes simultáneas o capacidad configurada.
Reserva de 24 horas exactas sigue en su spec futuro; RA-01–RA-06 no se aprueban aquí,
y el presupuesto continúa siendo S/300 total.

Siguiente bloque tras aprobar T042: pruebas de US3 T043–T047, ordenadas por sus
dependencias, antes de T048/T049. Este checkpoint no las inicia.
