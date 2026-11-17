# Ensamblaje y límites del monolito modular

Estado actual 2026-11-17, America/Lima: materiales 004, T067 completada.
US1–US3 implementadas y verificadas localmente; T001–T064 y T067 completas, 65/68.
T064: resultado global favorable en laptop comunicado por el responsable; móvil no observado y teclado sin desglose. T065/T066 preparadas con D13/D10 pendientes. T068 conserva el cierre integral pendiente.
El parser PDF admite actualizaciones incrementales de trailer con xref vacía y /Prev válido; 107 pruebas y comprobación HTTP real documentadas en [corrección PDF](../../specs/004-materiales-estudio/evidence/pdf-fix.md). Los registros T034 y T070 se
conservan íntegros abajo y no describen por sí solos el estado vigente.

## Composición actual de materiales tras US1–US3

Un monolito Nest, un pool PostgreSQL compartido y composición React/Vite desde
app. Materiales no añade servicios, almacenamiento público, Redis o cuotas
distribuidas de transferencia. Identidad, oferta y matrícula conservan autoridad.

| Frontera actual | Responsabilidad implementada |
| --- | --- |
| materials/domain y application | Estados, archivos admitidos, intenciones/comandos/revisiones y consultas por puertos; sin SQL/Nest/IO en núcleo |
| materials/infrastructure | Material/bytea/Upload/Command/Audit en PostgreSQL, integridad y revalidación transaccional |
| materials/entrypoints/http | 12 combinaciones método/ruta; binarios separados de JSON, HEAD explícito, errores seguros y permisos por audiencia |
| academic-offering/public y users/public | Grupo/docente/elegibilidad actuales, sin SQL de columnas ajenas desde materiales |
| enrollment/public/materials-access | Descubrimiento de referencias y derecho vigente usando confirmedAt ≤ at < validUntil original, a microsegundos |
| infrastructure/database y authorization | Orden de locks cuentas/sesión/curso/grupo/material, decisión temporal y aceptación de sesión antes de headers |
| web/features/materials y app | Gestión, pantalla alumno, edición/retiro y navegación desde grupos/matrículas; ApiClient/sesión inyectados |

Ambas audiencias usan /materiales y /materiales/grupos/:groupId; app compone la
pantalla según rol. Los enlaces desde /mis-matriculas no conceden autoridad.
Docente actual habilitado/admin gestionan según estado de grupo; alumno activo
solo obtiene PUBLISHED con matrícula propia vigente. Retirar oculta y deniega
solicitudes nuevas; editar o reiniciar no republica. Oferta oculta/docente
inhabilitado no revocan por sí solos matrícula vigente del alumno.

0008/0009 mantienen archivo/grupo/autor inmutables y ledger/auditoría atómicos.
Comandos comparan expectedRevision; replay conserva appliedRevision y devuelve
vista actual autorizada. No actualizan pagos, cupos, fechas o matrículas.
El retiro es lógico; reemplazar exige nuevo material y no hay purga implícita.

PUT exacto recibe hasta 20 000 000 bytes tras autorización/admisión y revalida al
completar. GET libera SQL/locks antes de red y conserva plaza hasta finish/close;
HEAD solo lee metadata y no ocupa plaza binaria. La transferencia usa contadores
en memoria de 2 por proceso/1 por actor, sin cola ilimitada. Es distinta de la
cuota durable de 30 intenciones nuevas por actor/60 s en PostgreSQL. Timeout de
upload por defecto 60 s; JSON sigue en 16 KiB. Los buffers/driver consumen RAM.

El cliente valida generación de sesión, aborta ante logout/cambio de cuenta,
revoca Blob URLs y exige reintento manual ante incertidumbre. No introduce URL
pública, caché persistente de archivos o autorización basada solo en UI.

Evidencia actual: [T060](../../specs/004-materiales-estudio/evidence/automated.md),
[restore](../../specs/004-materiales-estudio/evidence/recovery.md),
[recursos locales](../../specs/004-materiales-estudio/evidence/local-resources.md),
[operación](../../specs/004-materiales-estudio/operation.md),
[capacidad](../../specs/004-materiales-estudio/capacity.md) y
[revisión pendiente](../../specs/004-materiales-estudio/evidence/final-acceptance.md).
No prueban capacidad 2500, aceptación humana, D10/D13, 24 h físicas, proveedor,
CI remoto, proxy HTTPS productivo o cierre integral de 001–003.

## Registro histórico T034 (2026-11-16), con registro T070 preservado


Estado 2026-11-16; materiales 004, T034. Constitución 1.2.1.
El [checkpoint US1](../../specs/004-materiales-estudio/evidence/us1-checkpoint.md)
respalda preparación/publicación local. US2/US3, aceptación humana y puertas
operativas siguen pendientes. El registro T070 se conserva íntegro abajo como
historia; sus descripciones de funcionalidades entonces ausentes no son el estado actual.

## Composición vigente

AppModule compone autorización, identidad, usuarios, oferta, matrícula y materiales,
salud, correo y auditoría en un proceso Nest con un pool PostgreSQL compartido.
Los schedulers existentes permanecen en el proceso. Materiales no crea un servicio
externo ni un almacén público. React/Vite compone las features desde app y les
inyecta sesión, navegación y ApiClient; no introduce imports laterales.

| Frontera | Responsabilidad actual |
| --- | --- |
| materials/domain | Formatos, reglas de tamaño, estados y revisiones sin Nest/pg/IO. |
| materials/application | Preparar/completar/publicar y consultar gestión por puertos; sin SQL. |
| materials/infrastructure | Intenciones, bytea privado, material, ledger y auditoría PostgreSQL; recepción acotada y admisión durable. |
| materials/entrypoints | Ocho rutas de gestión bajo /api/v1/materials; políticas cerradas, validación y errores seguros. |
| academic-offering/public y users/public | Participación mínima de grupo/docente y elegibilidad actual, sin leer internals desde materiales. |
| infrastructure/database | Coordinación transaccional y revalidación de sesión compartidas; acceso físico limitado a adaptadores/raíz. |
| web/features/materials | Preparación/publicación del gestor; cliente binario dedicado inyectado desde app. |
| enrollment/public para materiales | Derecho temporal del alumno pendiente de US2; no se acredita por la gestión US1. |

Rutas de gestor: `/materiales` y `/materiales/grupos/:groupId`, conectadas desde
grupo administrativo/docente. ADMIN o TEACHER con permiso actual; el docente debe
seguir asignado/habilitado y el grupo debe permitir la operación. Una intención
pertenece a su actor: ni otro administrador puede completarla como propia.
La UI no sustituye la autorización backend. El [uso local](../../specs/004-materiales-estudio/quickstart.md)
detalla las operaciones y recuperación manual.

## Persistencia y transporte de materiales

0008 crea el modelo y 0009 añade el índice de admisión actorId/createdAt. Archivo,
grupo y autor originales son inmutables. El completado confirma bytes, metadatos,
vínculo de intención y auditoría juntos. La publicación explícita usa commandId,
digest y revisión canónica int64 en texto; replay conserva el recibo histórico y
devuelve el recurso actual. PREPARED nunca publica por cargar o reiniciar.

El coordinador descubre participantes y bloquea cuentas por UUID, revalida sesión,
curso/grupo y luego material/intención en orden consistente. Comprueba topología,
token compartido y sesión antes del commit. La recepción no retiene transacción
mientras llega el cuerpo; al completar vuelve a comprobar permisos. No adquiere
bloqueos financieros ni modifica reservas, órdenes, pagos o matrículas.

JSON conserva 16 KiB; la excepción PUT binaria tiene ruta y cabeceras exactas,
same-origin/CSRF y máximo real de 20 000 000 bytes. Dos plazas globales y una por
actor por proceso, sin cola; timeout por defecto 60 s. El buffer y las copias del
driver consumen RAM: estos límites no prueban capacidad. La cuota durable de
30 intenciones nuevas por actor/60 s se comparte por PostgreSQL; replay precede a
cuota y estado/completado/publicación no consumen admisión. Política completa en
[upload-limits](../../specs/004-materiales-estudio/evidence/upload-limits.md).
No hay cuota global de almacenamiento, expiración/purga de intenciones o bytes.

Los DTO de gestión omiten bytes y datos financieros. El archivo no tiene URL
pública. El navegador envía File directamente, conserva File/textos solo en memoria,
usa no-store/redirect error y descarta generaciones viejas de sesión. Logout o
desmontaje aborta y borra estado; la incertidumbre requiere consulta/reintento
manual con la misma identidad, sin replay automático al login. La validación de
formato no constituye antivirus.

## Alcance probado y puertas pendientes

US1 cuenta con pruebas reales de PostgreSQL y navegador, autorización, formato,
transporte, rollback, carreras, reinicio y respuesta perdida. Los comandos,
resultados y preservación se registran en el checkpoint. La configuración de
ensayo usa esquemas sintéticos y ningún puerto publicado; no desplegó migraciones
en la base manual. El modelo contempla estados futuros pero US2 aún debe entregar
matrícula temporal/listado/descarga/HEAD; US3, edición/retiro/republicación.

E2E no acredita observación humana, restore cifrado o recuperación ante corte
físico. D10 debe medir capacidad con materiales; D13 debe acordar custodia,
destino cifrado, retención y recuperación antes de demo persistente/publicación.
No se cierran Izipay, 24 h reales, VPS o pendientes de aceptación de 001–003.
La cobertura local tampoco acredita ejecución de CI remoto.

<details>
<summary>Registro histórico T070 (2026-10-29), conservado</summary>

Estado 2026-10-29; T070. El registro inicial T009/T021–T023 se conserva al final
como historia. Estado vigente respaldado por [T068](../../specs/002-oferta-academica/evidence/automated.md)
y [T069](../../specs/002-oferta-academica/evidence/recovery.md); aceptación humana e
integral pendientes. Constitución vigente 1.2.0, PA-01–PA-05/E1 conservadas.

## Composición actual

Un proceso Nest y un pool PostgreSQL compartido. AppModule compone autorización,
identidad, usuarios, oferta, salud y los adaptadores de correo/auditoría. El scheduler
de correo usa el mismo proceso; no es un servicio distribuido nuevo. React/Vite
compone las features desde app, con ApiClient y elementos shared; mantiene identidad,
perfil, administración de cuentas y cierre al navegar hacia oferta.

| Componente | Responsabilidad y frontera |
| --- | --- |
| academic-offering/domain | Curso, grupo, ciclo, fechas y franjas como reglas puras; sin Nest/pg/IO. |
| academic-offering/application | Comandos y consultas mediante puertos; sin SQL ni transacciones manuales en casos de uso. |
| academic-offering/infrastructure | Stores/queries PostgreSQL, escritura atómica de negocio/ledger/auditoría; proyección mínima por audiencia. |
| academic-offering/entrypoints | HTTP y validación estricta, guardas backend y errores seguros; no credenciales ni datos internos de identidad. |
| users/public y AcademicTeacherDirectory | Contrato mínimo del docente: referencia/nombre/elegibilidad/generación. Oferta no consulta columnas privadas de User. |
| identity/public y authorization | Actor/sesión/capacidades existentes; permiso desconocido denegado. Revalidación transaccional inyectada desde la raíz. |
| infrastructure/database | AccountLocks/accountTransaction y protocolo académico; solo adaptadores/raíz conocen PoolClient y locks físicos. |
| web/features/academic-offering | Gestión, catálogo y grupos propios; app inyecta sesión, ApiClient y navegación, sin imports laterales de auth/profile/admin-users. |

Rutas web: ADMIN /admin/oferta y detalles; STUDENT/ADMIN /oferta y detalles;
TEACHER /mis-grupos y detalle. Inicio conserva perfil/logout; ADMIN conserva cuentas.
El visitante no recibe oferta. AccessGuard y filtros/revalidaciones del backend
son obligatorios aunque exista guarda visual.

## Consistencia, privacidad y estados

La propiedad de generación docente sigue en usuarios/identidad; la migración 0005
añade User.teacherEligibilityVersion, cinco tablas académicas, restricciones,
trigger y vista mínima. Identidad cambia acceso/generación en su misma transacción;
recuperar habilitación no modifica snapshots académicos ni republica. Las lecturas
filtran publicación/elegibilidad/snapshot en una sentencia, antes de conteos y
paginación. Docente solo lee grupos propios, sin causa privada de cancelación.

El protocolo de oferta usa READ COMMITTED y una conexión: descubre participantes,
bloquea cuentas por UUID, sesión, curso y grupos en orden consistente y consulta
conflictos después de adquirir los locks. Comparte el presupuesto de reintentos
de accountTransaction; no añade mutex global ni otro bucle de reintentos. Identidad
puede adquirir SystemState antes de cuentas; oferta no lo adquiere después de ellas.
Revisiones impiden sobrescritura; commandId/digest gobiernan repetición de intención.
Negocio, resultado persistido y auditoría se confirman/revierten atómicamente.

Retirar precede a editar Publicado; retirar padre oculta sin editar hijos.
Republicación explícita revalida lo requerido; cancelación de grupo terminal.
Horarios America/Lima, ocurrencias efectivas, adyacencia permitida y sin medianoche.
Capacidad 1–50, sin inventario de reservas/ocupación/disponibilidad. Detalle normativo
en [integración](../../specs/002-oferta-academica/contracts/integration.md),
[modelo](../../specs/002-oferta-academica/data-model.md) y
[HTTP](../../specs/002-oferta-academica/contracts/api.md).

## Verificación y límites

T068 reúne reglas/arquitectura, PostgreSQL real, autorización/privacidad/carreras y
E2E de las cuatro historias e identidad. T069 prueba migración incremental, restore
a BD nueva, invalidación y revisión de decisiones posteriores al backup. Son
resultados de esas revisiones, no ejecuciones nuevas por documentar.
T067 añade E2E al job existente; CI remoto y su duración no están acreditados.
La revisión estática T072 identificó H-CAP-01 en el catálogo inicial. La
[corrección posterior](../../specs/002-oferta-academica/evidence/h-cap-01.md) añade el
aviso de ocupación/disponibilidad no calculadas en CatalogPage, sin modificar
OfferingLayout ni las capas de API/datos. El [protocolo](../../specs/002-oferta-academica/evidence/human-acceptance.md)
sigue sin ejecutar: SC-002 no se demuestra por los pases automáticos.

Sin nuevos servicios, Redis, pools, infraestructura AWS, reservas/matrícula/pagos,
materiales, video o chat. Compose manual y datos/configuración existentes se
conservan. D04, parte de matrícula D06, D10/D13, SMTP externo, T104/T108, bootstrap
y timeout E2E D10 siguen abiertos. Este último es distinto de la decisión D10.
No hay evidencia aprobatoria para 1000/2500 concurrentes ni aceptación integral.

<details>
<summary>Registro histórico T009/T021–T023; no es el estado vigente</summary>

# Ensamblaje y límites — T009

Fecha: 2026-09-29. Implementación mínima previa a módulos funcionales.

`AppModule` es la raíz de composición del único proceso Nest. En T009 ensamblaba únicamente
el módulo Probe de compatibilidad, conservado para su smoke aislado. T021–T023 añaden
`AuthorizationModule`, `SessionLookup`, el adaptador de sesiones sobre el pool compartido y
los controladores de salud. La composición inyecta los contratos sin importar IdentityModule
desde autorización. El guard no accede a SQL y los permisos pertenecen al dominio.
`main.ts` crea el proceso y usa `API_HOST=0.0.0.0`
en Compose; su puerto se publica solo en loopback del host.

Los módulos futuros viven en `src/modules/<módulo>/`. La regla ESLint comprobada aplica:

- entrypoints HTTP → application/domain/public del mismo módulo; nunca Prisma/pg/hash/SMTP;
- application → domain/public y contratos pequeños; nunca Nest/HTTP/IO o infraestructura;
- domain → TypeScript relativo puro; nunca paquetes externos o infraestructura;
- infrastructure → application/domain/public y librerías de IO; nunca Nest/Express;
- entre módulos solo se importa la superficie `public`, no carpetas internas;
- la raíz Nest conecta adaptadores. No se introducen repositorios genéricos, CQRS ni clases
  que solo reenvíen llamadas.

En web, `shared` no depende de app/features; una feature solo depende de sí misma y shared;
app puede componer ambas. La prueba de reglas incluye casos permitidos y denegados para que
las rutas futuras no conviertan la configuración en una declaración sin efecto.

Comprobación real del 2026-09-29: `npm run lint` terminó con exit 0 y
`npm run test:unit` aprobó los tres casos de arquitectura más el smoke unitario web.
La suite prueba importaciones permitidas y rechaza dominio→Nest, dominio→infraestructura,
aplicación→internos de otro módulo y dependencias laterales entre features. T009 queda
completada con esa evidencia. La comprobación Linux está en
[verificación Docker](../docker/verification.md); no se deriva del lint. Izipay y
dominios académicos no se ensamblan aquí.

La revalidación del actor pertenece al adaptador de persistencia y debe ejecutarse dentro
de la transacción de cada mutación protegida, respetando gobierno → usuarios por UUID →
sesiones. El savepoint exige una transacción explícita; liberar el savepoint no libera los
bloqueos. El interceptor renueva actividad solo tras un resultado autorizado satisfactorio
y serializable, sin emitir cookie ni ampliar la expiración absoluta. Los controladores de
prueba permanecen en `tests/`; la composición de producción solo expone salud. Registro,
login y administración siguen pendientes. Evidencia en
[sesiones, autorización y transporte](../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md).

</details>

</details>
