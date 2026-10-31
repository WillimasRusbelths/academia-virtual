# Inventario previo — reservas, órdenes y matrícula (RP001)

**Fecha**: 2026-10-30, America/Lima. **Estado**: inventario documental de código existente.
**Rama de preparación**: `docs/003-reservas-inventario`.
**Base**: `adca8e6d6d3bafe66906a513dd4923de37df8c84`, desde `feat/002-oferta-academica`,
con Git limpio al iniciar. [Tarea RP001](../../docs/planificacion/tasks.md) y
[evidencia de revisión](evidence/rp001-results.json).

Este archivo precede a RP002/specify. No es un plan técnico aprobado, no contiene
implementación de reservas ni acredita pruebas nuevas de producto. `003` sigue la
numeración secuencial existente (001/002); se crea solo research y su evidencia.
No hay spec, checklist, plan, tareas de implementación ni nuevas migraciones de 003.
El puntero local `.specify/feature.json` se conserva en 002 hasta iniciar RP002;
no debe usarse para atribuir a 003 los prerrequisitos o checklist de 002.

## Base vigente, requisitos y continuidad

Fuentes: [constitución 1.2.0](../../.specify/memory/constitution.md),
[alcance](../../docs/alcance-mvp.md), [actores](../../docs/01-analisis-de-sistema/01-actores.md),
[HU10/HU11](../../docs/01-analisis-de-sistema/02-historias-del-usuario.md),
[RF11–RF13](../../docs/01-analisis-de-sistema/03-requisitos-funcionales.md),
[RC/RA/RE confirmados y pendientes](../../docs/planificacion/reservas-capacidad.md)
y [decisiones](../../docs/decisiones-pendientes.md).

RC-01–RC-07 permanecen confirmados: al menos 15 000 cuentas registradas; objetivo de
2500 usuarios concurrentes activos pendiente de demostrar; reserva previa al pago;
24 horas exactas (86 400 s desde confirmación del servidor); pago verificado confirma
matrícula; vencimiento sin pago libera cupo mediante conciliación consistente todavía
por diseñar; presupuesto S/300 total. Cuentas, usuarios activos, solicitudes en vuelo/RPS
e inventario/tasa de reservas son medidas distintas, sin evidencia de equivalencia.

Oferta [002](../002-oferta-academica/tasks.md) conserva 72/74 tareas completas,
PA-01–PA-05 y E1. [T073](../002-oferta-academica/evidence/human-acceptance.md) está
aplazada por el responsable, sin sesión ni resultados; [T074](../002-oferta-academica/evidence/acceptance.md)
sigue parcial y sin marcar. [H-CAP-01](../002-oferta-academica/evidence/h-cap-01.md)
corregido automáticamente en d9c8059; ese hallazgo no queda abierto ni se confunde
con la observación humana aún pendiente. Esta rama conserva ambos historiales del
merge b0af757, incluida la planificación 061b183, y todos los commits posteriores de 002.
No se declara 002 integrado en main ni se cambia o elimina su rama.

**INV-DOC-01, desfase documental (media)**: actores conserva «Ningún actor dispone
todavía de los flujos» y permisos académicos pendientes; RF conserva «Ningún RF de
esta tabla está implementado», RF08 académico pendiente y RF10 hasta T038. Esas
frases no describen la base adca8e6. Se usan esos documentos para IDs y alcance del
MVP; PA-01–PA-05, tareas y evidencia de 002 son la fuente del estado/permisos de
oferta efectivamente implementados. Los permisos de reservas/matrícula sí requieren
su propio spec. RP002 debe evitar arrastrar el estado obsoleto; este inventario no
reescribe esos documentos ni cambia una decisión de negocio aprobada.

La [puerta local T068](../002-oferta-academica/evidence/automated.md) registra API
335/335, web 188/188, integración PG/HTTP 1972/1972, crypto/mail 2/2, E2E identidad
203/203 y oferta 168/168 (84 casos por dos proyectos, incluidos auxiliares).
[Recuperación T069](../002-oferta-academica/evidence/recovery.md) ensaya actualización
0001–0004→0005 y restore; [H-CAP-01](../002-oferta-academica/evidence/h-cap-01.md)
añade 20/20 ejecuciones de catálogo tras esa puerta. Son resultados históricos,
no ejecuciones de RP001 ni validación de concurrencia o reservas.

Identidad conserva 106/108 tareas; [T103](../001-identidad-acceso-roles/evidence/load-resources.md)
completa como ejecución/informe, con capacidad sin aprobar; T104/T108 pendientes.
Bootstrap intermitente, timeouts históricos de arquitectura/B02/D10 E2E, CI remoto,
SMTP externo, D10/rúbrica y D13/custodia/retención/RPO/RTO permanecen abiertos.
Las repeticiones aprobadas no demuestran causa ni cierre de esos hallazgos.

## Interfaces comprobadas y límites de consumo

Los códigos I01–I12 identifican este inventario; no son requisitos o tareas aprobados.
Las referencias describen código de la base revisada, no servicios nuevos de 003.

| ID | Dueño y superficie real | Consumidor posible y límite |
| --- | --- | --- |
| I01 | Autorización: [SessionActor/SessionRepository/ACCESS_POLICY](../../apps/api/src/modules/authorization/public/session.ts). Actor con sessionId/userId/authVersion/role; lookup/accept/revoke. | Entradas y aplicación futuras pueden consumir la superficie public mediante inyección. Ni actor enviado por navegador ni rol guardado en UI son autoridad. No exponer sesión/authVersion en DTO de reserva. |
| I02 | [Permisos actuales](../../apps/api/src/modules/authorization/domain/permissions.ts), [AccessGuard](../../apps/api/src/modules/authorization/entrypoints/http/access.guard.ts) y [composición](../../apps/api/src/app.module.ts). | Matriz cerrada: profile:read, users:manage y tres permisos academic. Ninguno concede reservar/pagar/cancelar matrículas. Las operaciones y permisos 003 requieren especificación; no se reutiliza academic:manage para dar escritura al alumno. |
| I03 | Identidad: [access público](../../apps/api/src/modules/identity/public/access.ts); infraestructura [PostgresSessionStore](../../apps/api/src/modules/identity/infrastructure/session-store.ts) tiene revalidateInTransaction. | Composición ya enlaza la capacidad de revalidación dentro de la misma transacción. El nuevo módulo no importa la implementación interna de identidad ni consulta hashes, correos o secretos para autorizar. SessionRepository no expone PoolClient. |
| I04 | Usuarios: [Role/AccountStatus](../../apps/api/src/modules/users/public/account.ts) y [TeachingDirectory](../../apps/api/src/modules/users/public/teaching-directory.ts). | Tipos públicos reutilizables; directorio mínimo docente, sin email/credenciales. Su generación controla publicación de oferta; no es generación de matrícula, revocación de reserva ni capacidad de inventario. |
| I05 | Oferta: [public/offer.ts](../../apps/api/src/modules/academic-offering/public/offer.ts), CatalogCourse/CatalogGroup/Page, fechas civiles, Slot y errores. | DTO de consulta reutilizable para comprender el catálogo. CatalogGroup tiene capacidad y docente por nombre, sin revisión ni ID docente; no es una autorización transaccional ni un contrato para consumir una plaza. |
| I06 | [Catálogo HTTP](../../apps/api/src/modules/academic-offering/entrypoints/http/catalog.controller.ts) y [CatalogReads](../../apps/api/src/modules/academic-offering/application/queries.ts). | Cuatro GET autorizados: cursos, curso, grupos de curso y grupo. CatalogReads/OfferingStore son application de oferta, no superficies public para importar desde otro módulo. No llamar a un controlador ni a HTTP interno para resolver una transacción del monolito. |
| I07 | [Proyecciones SQL de oferta](../../apps/api/src/modules/academic-offering/infrastructure/offering-queries.ts) y [modelo](../../apps/api/prisma/schema.prisma). | Filtros antes de contar/paginar, proyección explícita en una sentencia; ocupación/disponibilidad null y NOT_CALCULATED. SQL/tablas/adaptadores internos no constituyen una API pública entre módulos. |
| I08 | Infraestructura: [accountTransaction](../../apps/api/src/infrastructure/database/account-transaction.ts), [lockAccounts](../../apps/api/src/infrastructure/database/account-locks.ts), [protocolo académico](../../apps/api/src/infrastructure/database/academic-transaction.ts). | Piezas existentes para evaluar en RP004; sin pg/Nest en dominio/aplicación. Un solo presupuesto de hasta tres intentos para abortos conocidos tras rollback; COMMIT ambiguo no se reejecuta ciegamente. No se aprueba un protocolo de reservas copiando este helper. |
| I09 | Oferta: [escritor/ledger](../../apps/api/src/modules/academic-offering/infrastructure/offering-store.ts), [auditoría](../../apps/api/src/modules/academic-offering/infrastructure/offering-audit.ts). | Atomicidad, revisiones, commandId, reautorización y replay ya demostrados para curso/grupo. Tipos, permisos, proyección y enum son académicos cerrados; no registrar pagos/reservas como GROUP_EDIT ni simular targetUserId de identidad. El nuevo contrato se diseña después de aclarar negocio. |
| I10 | [Transporte HTTP](../../apps/api/src/http/transport.ts), [errores seguros](../../apps/api/src/http/error.filter.ts), cookie de sesión existente. | JSON estricto, cuerpo 16 KiB, mismo origen/CSRF, no-store y requestId. Futuras rutas/campos/códigos requieren allowlists y permisos propios; no relajar estas garantías ni registrar secretos de pago. |
| I11 | Web: [ApiClient](../../apps/web/src/shared/api-client.ts), [HTTP](../../apps/web/src/app/http.ts), [router](../../apps/web/src/app/router.tsx), [API académica](../../apps/web/src/features/academic-offering/api.ts). | Reutilizar transporte/navegación desde app/shared; una feature no importa internos de otra. Lectores actuales exigen null/null/NOT_CALCULATED: añadir disponibilidad requiere contrato explícito y pruebas, no sustituir el valor por capacidad. |
| I12 | [Pool único/Prisma](../../apps/api/src/infrastructure/database/database.ts), [AppModule](../../apps/api/src/app.module.ts), [scheduler de correo](../../apps/api/src/modules/mail/infrastructure/delivery-scheduler.ts). | Composición actual monolítica y pool compartido; el scheduler existente entrega correo. No hay trabajador de conciliación de reservas, bus de cancelaciones académicas ni adaptador de Izipay integrado. No reutilizar entregas de correo como libro de pagos o autoridad del vencimiento. |

Reglas de consumo: [import-boundaries](../../ops/lint/import-boundaries.mjs) permite
entre módulos solo public; dominio/aplicación/public no importan paquetes externos ni
escapan a infraestructura. Las capacidades de conexión se ensamblan desde AppModule.
Este inventario no publica OfferingStore, no cambia la matriz y no añade interfaces.

## Estado real de datos, publicación y concurrencia

Hay cinco migraciones versionadas, [0001](../../apps/api/prisma/migrations/0001_identity_users/migration.sql)
a [0005](../../apps/api/prisma/migrations/0005_academic_offering/migration.sql).
Prisma contiene ocho modelos de identidad/correo/cuotas y cinco académicos:
AcademicCourse, AcademicGroup, AcademicSlot, AcademicCommand y AcademicAuditEvent.
No hay modelos de reserva académica, orden, pago o matrícula. La columna
RateEvent.reservationExpiresAt y el estado RESERVED pertenecen a cuotas de login,
no a cupos; los vencimientos de sesión/enlaces tampoco cumplen la reserva de 24 horas.

El curso puede ser DRAFT/PUBLISHED/WITHDRAWN; el grupo añade CANCELLED terminal.
Alumno ve curso publicado con grupo visible: grupo publicado, asignación igual a la
publicada, docente actualmente elegible y generación igual a la capturada. Perder
habilitación oculta; recuperarla no modifica el snapshot. Retirar curso oculta hijos
sin cambiar sus estados, y publicar curso no renueva la captura del grupo.

Capacidad 1–50 por grupo es configuración; no existe inventario consumible ni conteo
de ocupación. Franjas y vigencia en America/Lima son calendario académico; las fechas
no constituyen ventana de inscripción ni un reloj de vencimiento. Las 24 horas son
instantes del servidor y no se calculan desde el navegador o las horas del grupo.

El protocolo académico usa READ COMMITTED, cuentas ordenadas → sesión → cursos →
grupos → ledger/auditoría; redescubre topología y consulta conflictos después del
lock. Serializa publicaciones incompatibles del mismo docente; no demuestra último
cupo ni decide FIFO (RA-02). Un GET previo, una revisión del cliente o conocer la
capacidad no protege una reserva contra otra petición o una cancelación concurrente.

**Brecha confirmada**: public/offer.ts exporta DTO/errores, sin servicio público de
decisión de oferta dentro de una transacción que también confirme reserva. Los GET
actuales y las interfaces application no cubren ese contrato. RP002 debe explicitar
las condiciones de reserva y RP004 diseñar una superficie pública mínima con su
revalidación, locks y coordinación frente a retiro/cancelación/habilitación, sin
acceder directamente a tablas privadas ni envolver escritores que abren transacciones
independientes. Lo anterior identifica una necesidad; no aprueba firmas, SQL, estados
nuevos, política de inventario o reglas de cancelación.

## Dependencias a especificar, sin resolver decisiones

| Área | Confirmado o existente | Pendiente y siguiente tarea |
| --- | --- | --- |
| Reserva/orden | RC-03, RC-04; identidad y catálogo existentes. | Identidad/unicidad de la reserva, varios cursos/atomicidad y composición de la orden (RA-01); prioridad sin FIFO implícito (RA-02). RP002/RP003 antes de RP004. |
| Pago/matrícula | RC-05/06; proveedor Izipay elegido, integración ausente. | Precios/conceptos/total calculados por servidor; verificación auténtica orden/importe/moneda. No hay precio en curso/grupo ni contrato de fuente monetaria. RA-03/04 antes de RP006; sandbox y cuotas/costos D02 pendientes. |
| Vencimiento | 86 400 s persistidos desde confirmación servidor, sin extensión por reintento/reinicio. | Comparación exacta y precedencia pago/vencimiento, autoridad temporal, liberación idempotente y reasignación (RA-03/04); RP005/RP006, sin adoptar un worker o intervalos todavía. |
| Cancelación — RE-09 | Grupo cancelado terminal y datos conservados en 002; no efectos económicos actuales. | RA-05 debe definir efectos sobre reserva/orden/pago/matrícula y cambios de grupo/horario. No se asume reembolso, traslado o cancelación de reservas automáticos. Coordinación con oferta en RP004/RV003. |
| Abuso/permisos — RE-10 | Identidad/CSRF/cuotas de login existentes; permisos académicos actuales no autorizan reservas. | Definir operaciones/actores/propiedad del futuro módulo y RA-06 (cuotas, reiteraciones, excepciones); no imponer sanciones ni usar bloqueo de login como control de inventario. RP003/RV004. |
| Horarios/cupos | PA-01–PA-05/E1 inalteradas; agenda docente protegida. | D04 delimitada con 24 h confirmadas y resto abierto; D06 de conflictos/cambios tras matrícula no resuelta. Describir horarios no decide compatibilidad del alumno. |
| Capacidad/operación | NestJS/PostgreSQL/monolito y Compose existentes; T069 local. | D10/D13, VPS con k6 desde otro equipo, medidas separadas y presupuesto S/300 total. Sin proveedor/tamaño/AWS aprobados; VP001–VP008 conservan puertas y autorización de ejecución. |

RA-01–RA-06 siguen abiertas según su documento; no hay opción preseleccionada ni
respuesta atribuida al responsable. RC-04 no las cierra. RC-03/05 se trazan a I01–I12;
RE-09 a estados/ledger/ausencia de coordinación y RA-05; RE-10 a permisos/transporte,
privacidad y RA-06. RE-01–RE-08 deben entrar a RP002/RV001 sin simular resultados.

## Verificación reutilizable y límites del inventario

Scripts existentes: [package raíz](../../package.json), [API](../../apps/api/package.json),
[web](../../apps/web/package.json) y [workflow](../../.github/workflows/v00-linux.yml).
Reutilizar después UNIT, PG/HTTP con esquemas ficticios y E2E; el job validate actual
mantiene timeout de 20 minutos, sin validar todavía una ejecución remota de esa revisión.
No se añade infraestructura a CI ni pruebas vacías en RP001.

- Reglas: núcleo puro, pruebas de límites y tiempos de reserva solo tras spec/diseño.
- Integración real: [fixtures aislados](../../apps/api/tests/support/identity-database.ts),
  [dataset académico](../../apps/api/tests/support/academic-offering.ts),
  [barreras observadas](../../apps/api/tests/support/locks.ts),
  [casos de comandos](../../apps/api/tests/integration/academic-offering-commands.spec.ts)
  y [carreras](../../apps/api/tests/integration/academic-offering-concurrency.spec.ts).
  Son infraestructura/patrones y pruebas de otro dominio; no resultados de reservas.
- Navegador: [fixture API/PostgreSQL/Vite real](../../apps/web/tests/support/academic-offering-fixture.ts)
  y [configuración académica](../../apps/web/playwright.academic-offering.config.ts).
  El nuevo recorrido no debe alterar los de identidad/oferta ni simular la autorización.
- Operación: [ensayo de recuperación](../../ops/recovery/rehearse-academic.ps1),
  [evidencia de smokes](../../docs/planificacion/evidence/2026-10-23-smokes.md),
  [carga histórica](../001-identidad-acceso-roles/evidence/load.md) y
  [perfil local 10/25 preparado](../../load-tests/identity/followup-local.js), no ejecutado.
  No redirigir clientes históricos al VPS ni aumentar umbrales/quotas; generador
  separado y pagos simulados en la etapa futura prevista.

RP001 ejecuta solo lectura de archivos/Git y controles documentales de enlaces,
consistencia y conservación. No ejecuta tests de producto, Docker, SQL, smokes,
cargas, compras o llamadas a Izipay; no infiere el estado vivo de bases/servicios.
El entorno manual, cuentas/configuración/volúmenes y toda evidencia 001/002 quedan
fuera de sus operaciones. El resultado verificable y hashes públicos de fuentes se
registran en el JSON, sin credenciales, dumps ni datos de participantes.

Resultado de los controles de RP001: 12 puntos de integración, 450 enlaces en 19
documentos sin roturas; 72 archivos protegidos intactos. De los 677 archivos de la
base, solo README y el backlog cambian; los otros 675 se conservan, incluidos los
specs/evidencias 001/002 y cinco migraciones. Las 22 descripciones del backlog no
cambian: solo RP001 pasa a completa; CT001 ya lo estaba y las otras 20 siguen
pendientes. La rama de oferta conserva adca8e6; no se cambia el puntero de feature.
No se detectan secretos ni hooks registrados. El verificador corrigió su lectura
de Bootstrap/bootstrap antes de aprobar; no fue una prueba roja de producto.

Comando documental ejecutado: `node .cache/reservas-rp001/review.mjs`. Baseline,
verificador y reporte privados se conservan en ese directorio ignorado. Los hashes
de fuentes públicas y resultados están en el JSON versionado. No se ejecutan tipos,
lint o compilación porque no cambia código ni configuración de ejecución.

## Salida y siguiente bloque

RP001 se completa solo con este inventario contrastado y su revisión aprobada;
las marcas de 001/002 no cambian. RP002 es el siguiente bloque: usar
`$speckit-specify` con RC-01–RC-07/HU10/HU11 y RE-01–RE-10, conservar propuestas
pendientes RA-01–RA-06 y después aclararlas mediante RP003/`$speckit-clarify`.
No comenzar plan/tareas/migraciones/implementación mientras falten sus puertas.

Al iniciar RP002, reutilizar explícitamente `SPECIFY_FEATURE_DIRECTORY=specs/003-reservas-ordenes-matricula`
y conservar este research: el escaneo automático vería el prefijo 003 ya ocupado
por RP001. Resolver rama `feat/003-reservas-ordenes-matricula` y puntero con el
procedimiento de Spec Kit vigente; no renumerar a 004 ni sobrescribir investigación.
La rama documental se basa en 002 para disponer de código real; esto no integra
002 en main ni autoriza cerrar sus dos tareas humanas/integrales pendientes.

## Investigación de fase 0 — RP004, 2026-10-30

El inventario anterior se conserva íntegro como registro RP001. El estado corriente
de negocio está en [spec.md](spec.md), con quince aclaraciones; la constitución
vigente es 1.2.1. No se reinterpretan sus antiguos pendientes como reglas actuales.

**Decisión**: monolito/pool existentes, participantes públicos ligados a una misma
transacción, admisión y despacho persistidos con coordinadoras independientes,
conteo real bajo locks y snapshots históricos sin reactivación.
**Motivo**: cumplir prioridad, atomicidad, privacidad y continuidad aprobadas sin
consumir cupos mediante un GET ni duplicar autoridades.
**Alternativas consideradas**: cola en memoria, nextval como prioridad de commits,
SKIP LOCKED en despacho, contador de ocupación duplicado y transacciones anidadas.

La investigación completa, fuentes primarias y decisiones R01–R08 están en el
[suplemento RP004](research-rp004.md). [Plan](plan.md), [datos](data-model.md),
[contratos](contracts/integration.md) y [guía local](quickstart.md) son diseño futuro,
sin ejecución de producto. Reloj/worker RP005 y conciliación RP006 continúan pendientes
de revisión especializada antes de tareas; D02/D05/D10/D13 conservan sus puertas.
