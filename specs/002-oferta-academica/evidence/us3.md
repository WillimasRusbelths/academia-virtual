# Checkpoint US3 — mantener, retirar y cancelar oferta (T053/T054)

Inicio: 2026-10-25; reanudación y cierre: 2026-10-26, America/Lima.
Rama `feat/002-oferta-academica`.
Base limpia: **e95eb8c**. Alcance: T053 y guía T054; sin iniciar T055/US4.
Estado: **T053/T054 completas; checkpoint automatizado US3 aprobado**.
Resultados por caso y comandos en [us3-results.json](us3-results.json).

## Preparación y criterios

Skill speckit-implement; prerrequisitos correctos, checklist requirements 16/16
en solo lectura, sin AGENTS.md aplicable ni hooks de implementación. Constitución
1.2.0, tareas/dependencias, spec y PA-01–PA-05, modelo, investigación, contratos
HTTP/integración/UI y guía local revisados. Las referencias históricas a 1.1.0
del diseño no se reescriben ni se presentan como constitución vigente.

T043–T047 y T052 deben aprobar sus comprobaciones reales. Se ejecutan regresiones
US1/US2 y los diez escenarios US3, sin cambiar reglas, fixtures, aserciones,
timeouts, workers o retries. La regresión motivó una corrección de avisos web 503
descrita abajo; no modifica el protocolo ni negocio. La guía T054 es una actualización documental autorizada;
no habilita matrícula, reembolsos o reservas.

## Matriz de los diez escenarios US3

| Escenario | Ejecución y aserción final requerida |
| --- | --- |
| US3.1 | Reglas course/group y lifecycle; state S02/S13, preparación/HTTP y E2E M01/M06: publicado exige retiro propio antes de editar; el padre retirado no habilita editar al hijo publicado. Huellas/revisión conservadas ante rechazo. |
| US3.2 | State S01/S03, lifecycle L01/L02 y E2E M01/M06: retiro confirmado oculta oferta al alumno y conserva filas, franjas y snapshots administrativos; solo retirar/cancelar el grupo libera su agenda. |
| US3.3 | State S04, lifecycle L03, maintenance-http M01/M06 y E2E M02: motivo obligatorio e instante servidor; datos/snapshots/hermano conservados, auditoría/ledger atómicos. Ningún efecto sobre matrícula o reembolsos. |
| US3.4 | Commands K01/K06/K07, E2E M04 y C01: dos administradores, revisión obsoleta sin sobrescritura, borrador conservado, consulta para comparar y reemplazo consciente antes de nueva intención. Persistencia final y commandId verificados. |
| US3.5 | State S01/S07 y publicación P12–P14/P22–P24: curso retirado invisible con hijos intactos; revalidar hijos al republicar, sin renovar sus snapshots ni liberar programación. Rechazo del curso bloqueado revierte todo. |
| US3.6 | State S03, lifecycle L02, E2E M01/M05: guardar grupo retirado no publica; publicación explícita válida con padre publicado recupera visibilidad. |
| US3.7 | State S05/S13, publicación P11, lifecycle L03 y E2E M03: cancelado consultable por administración y terminal; no editar, retirar o republicar, tampoco no-op exitoso con otro ID. |
| US3.8 | Publicación-races R01/R03 y reglas schedule: mismo docente y fecha efectiva común rechazan superposición; franja contigua permitida. Barrera real observada desde tercera conexión y resultados persistidos. |
| US3.9 | Publicación-races R02/R03 y reglas schedule: otros docentes, fechas disjuntas y periodos sin día efectivo común admitidos; extremo incluido sí se considera. No interpreta conflictos de matrícula D06. |
| US3.10 | Publicación-races R01 con primer administrador 0 y 1: espera por User observada, una publicación y un conflicto, lectura posterior al lock y estado final sin doble programación. Concurrency R01–R07 amplía intercalaciones de retiro/cancelación/curso y cambio de conjunto. |

T052 A01–A08 agrega hechos mínimos, NO_CHANGE, snapshot conservado y replay sin
segundo APPLIED sobre HTTP/SQL reales. M07/M08 y C02/C03 ejercen fallo SQL real o
respuesta descartada después de commit; no fabrican éxito de negocio. M09 comprueba
sesión revocada y ausencia de replay tras login; M10, cancelación sin escritura/foco.

Las barreras se atribuyen al adaptador/publicador real y sus estados finales. Los
controles auxiliares de locks, READ COMMITTED, composición y agregados ficticios se
identifican por nombre/archivo en el JSON; aprobarlos no sustituye la aceptación
académica. Los dos órdenes de carrera no aprueban FIFO ni decisiones RA-02.

## Resultados finales y puertas

| Suite | Resultado |
| --- | --- |
| UNIT API | **335/335**, incluidas 14 de arquitectura; sin repetir su timeout histórico. |
| Lifecycle en UTC | **27/27**; mismos 27 casos que en UNIT bajo America/Lima, no casos nuevos. |
| PostgreSQL/HTTP | **579/579**, 16 archivos; 529 casos académicos, 17 controles de contexto y 33 del protocolo con agregados ficticios, identificados en JSON. |
| UNIT web final | **169/169**, incluidas fronteras con ApiClient simulado; no sustituyen SQL/HTTP reales. |
| Tipos, lint y compilación | Salida cero; web/tipos/lint/build repetidos tras corregir avisos. API/PG conservan su resultado porque su fuente no cambió. |
| E2E completos | **120/120**, 13,2 minutos; 60 únicos por dos perfiles, 118 ejecuciones funcionales y dos del harness; cero omitidos, flaky o retries. |

Puertas: T043 27 reglas, T044 47 casos state, T045 18 commands, T046 12 concurrency
(11 académicos y un control), T047 diez originales × dos perfiles = 20, T052 28
audit. Todos aprobados, además de las capas y HTTP correspondientes. Las 14
comprobaciones de arquitectura pasaron sin ampliar límites; no se atribuye resolución
del hallazgo histórico. Se cierran solo T053/T054; US4 permanece pendiente.

## Reproducción y alcance de la regresión

Harness privado ignorado: `.cache/academic-offering-validation/t053-t054/`.
Reportes privados: `t053-t054-reports/` bajo el mismo padre. Se sincronizó la fuente
versionada de API/web/tests/Prisma/lint y no hubo diferencias con la copia existente.
Las suites API/PG ejecutaron e95eb8c, cuya fuente backend permanece idéntica. Web y
navegador se repiten con los tres ajustes de avisos 503 y el resto de fuente intacta;
los hashes de esos archivos se registran en el JSON, además de los cambios documentales.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t053-t054/environment-before.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t053-t054/run.ps1 -Action up
foreach ($action in @('unit','lifecycle-utc','integration','web','types','lint','build','browser')) {
  powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t053-t054/run.ps1 -Action $action
  if ($LASTEXITCODE -ne 0) { throw "Checkpoint no aprobado: $action" }
}
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/academic-offering-validation/t053-t054/close.ps1
```

- UNIT API incluye dominio, permisos y arquitectura; lifecycle se repite en UTC,
  sin contar los mismos casos como nuevos.
- PG/HTTP incluye los 16 archivos academic-offering de preparación, publicación,
  catálogo, elegibilidad, protocolo, mantenimiento, concurrencia y auditoría. Se
  excluyen solo harness/migración/schema porque no hay cambios en esas capas ni
  se sustituye el ensayo de recuperación T069. Detalle exacto en JSON.
- UNIT web, tipos estrictos de las pruebas pertinentes, lint de ambos workspaces
  y build web. Generar Prisma y compilar API antes de importar composición evita
  ensayar dist antiguo; no aplica migraciones al entorno manual.
- Playwright usa la configuración académica completa actual, escritorio y Pixel 7,
  con origen local/fixtures propios, teclado y límites originales. Incluye US1,
  US2 y US3; no es una ejecución de las configuraciones de identidad T065.

No se repiten k6/smokes: no cambian identidad, transporte o secuencias de solicitudes;
el ajuste de texto se comprueba con las suites web/E2E completas. Cargas completas, seguimiento 10/25,
matrícula, VPS y AWS permanecen fuera. La regresión completa de identidad corresponde
a T065/T068; resultados anteriores no se cuentan como ejecuciones nuevas.

## Incidencias conservadas y corrección de regresión

El lote inicial anunció 120 ejecuciones, pero su log termina tras 57 resultados
(55 aprobados y P03/U04 escritorio fallidos), sin JSON ni código final del comando.
Al retomar la sesión el motor Docker estaba detenido; no se atribuye una causa
no observada al corte ni se contabilizan las otras 63 ejecuciones como realizadas.
Los logs parciales se conservan como `interrupted-browser*`, sin aprobación del lote.

Tras iniciar Docker Desktop sin ventana interactiva, las guardas confirmaron los
metadatos manuales y volúmenes intactos. Compose recreó únicamente db del proyecto
aislado con su mismo volumen. Una inspección posterior al diagnóstico encontró
cero esquemas t_ residuales y cero runners previos activos; no fue necesario purgar
esquemas ni reinicializar datos para continuar.

Reproducción dirigida con pruebas originales y límites intactos: P03/U04 × dos
perfiles = cuatro fallos confirmados. P03 se detenía porque la alerta compartida y
un párrafo de publicación repetían «El resultado es incierto» y el selector estricto
encontraba dos elementos. U04 exigía «temporalmente» en la alerta; el cambio previo
T051 había reemplazado esa descripción por el aviso de incertidumbre. No eran fallos
de imports, conexión o sintaxis. Las aserciones posteriores de reintento/ledger no
se dan por verificadas en esa reproducción.

Se corrige producto, sin modificar las pruebas: offering-state.tsx conserva
«Servicio temporalmente no disponible» junto al aviso de resultado incierto y la
advertencia de que salir no deshace un posible commit. publication-action.tsx y
maintenance-action.tsx eliminan la repetición y conservan la instrucción de retry
manual. Tres cambios de texto; cero cambios de códigos, payload, estado, revisión,
commandId, autorización, locks o reintentos. Se repiten UNIT web, tipos, lint,
build y el lote completo de 120 E2E sobre esa fuente. El diagnóstico de cuatro
ejecuciones y el lote interrumpido quedan separados del cierre definitivo.

## Guía T054, conservación y límites

T054 actualiza [quickstart.md](../quickstart.md) con retiro/edición/publicación,
cancelación terminal, diferencia padre/hijo, recuperación de conflictos y 503 incierto,
intención solo en memoria y comprobación después de recargar o iniciar sesión.
Conserva recetas y guardas de aislamiento; enlaza este checkpoint sin habilitar
operaciones futuras ni atribuir observación humana.

La guía figura entre los 72 archivos de referencia protegidos del inventario:
su cambio es el objeto explícito de T054 y se informa como excepción autorizada;
los otros **71 coinciden con su huella previa**. Backend, tests, migraciones,
configuración, constitución, contratos, cinco aclaraciones y evidencia histórica
permanecen intactos. Los únicos cambios web son las tres sustituciones exactas de
texto revisadas; los comandos originales de la guía se compararon y permanecen
idénticos. E1 conserva T012 antes de T014 y su puerta verde, además del único
presupuesto de reintentos; no se modifica ningún protocolo.

Solo proyecto aislado academic-offering-fa3d46bddbb8, APP_ENV=test, sin puertos
publicados ni mounts manuales; conservar el volumen. No reset/db push/down -v,
purga o bootstrap. Comprobar cero esquemas t_ residuales y detener solo db/Mailpit
propios; comparar metadatos manuales y volúmenes antes/después, sin SQL manual.

Cierre comprobado: **cero esquemas t_ residuales**, db/Mailpit aislados detenidos,
volumen retenido y metadatos/volúmenes manuales iguales a la base y a la inspección
de reanudación. Sin SQL manual. Las 74 descripciones de tareas se conservan;
solo cambian las casillas T053/T054. Revisión de **812 enlaces en 33 documentos**,
sin enlaces rotos, y `git diff --check` aprobado. No hay bloqueo para preparar
las pruebas de US4 desde T055; su implementación no forma parte de este cierre.

El timeout histórico de arquitectura y el de B02 conservan sus reportes y repeticiones
aprobadas; nuevas aprobaciones no demuestran resuelta su variación ni bootstrap.
No se atribuye a Playwright observación humana SC-002/T073 ni aceptación integral.
US4, matriz completa SC-003 y final de SC-005 siguen en sus tareas posteriores.
D04, matrícula de D06, D10/D13, SMTP real y T104/T108 permanecen pendientes.
T103 conserva ejecución/informe con capacidad sin aprobar. ≥15 000 cuentas es
requisito y 2500 activos es objetivo sin demostrar; capacidad configurada 1–50 no
calcula ocupación o disponibilidad. Reservas exactas de 24 horas y RA-01–RA-06
siguen en su spec futuro, con S/300 total y sin decisiones abiertas inventadas.
