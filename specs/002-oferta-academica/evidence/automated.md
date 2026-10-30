# Puerta automática — T068

Cierre 2026-10-29, America/Lima; ejecuciones del 26 al 29 de octubre. Rama `feat/002-oferta-academica`. Producto **3a94331**
con el patch CI/lint de [T067](t067.md) y la adaptación de auditoría descrita abajo,
identificados por SHA-256 en
[automated-results.json](automated-results.json). **T068 completa como puerta automática local**.
No equivale a aceptación integral, humana, capacidad o validación remota de CI.

## Ejecución y resultados

| Nivel | Resultado nuevo |
| --- | ---: |
| Lint y tipos/build API/web | Aprobados |
| UNIT API, incluye arquitectura | 335/335 |
| UNIT web | 188/188 |
| Generación Prisma probe/app, probe:migrate y probe:check | Aprobados |
| Integración API/PostgreSQL y compatibilidad | 1972/1972 en 70 archivos |
| Compatibilidad Argon2/SMTP local | 2/2 |
| E2E identidad, diez configuraciones originales | 203/203 |
| E2E oferta, configuración íntegra | 168/168: 84 casos únicos × dos proyectos |

Las cantidades incluyen controles auxiliares de infraestructura. UNIT con mocks,
controles de barreras y harness no se presentan como transacciones académicas
aprobadas. Cada archivo/caso y su nivel, comando, estado, duración y hash del reporte
están en resultados; no se suman diagnósticos históricos a las ejecuciones nuevas.
Se comprueba descubrimiento y ejecución de todo tests/integration más compatibilidad
runtime/postgres, sin filtros que omitan identidad, migraciones o correo.
E2E de oferta conserva desktop/mobile, teclado, fixtures y límites originales.

| Configuración E2E identidad original | Ejecuciones |
| --- | ---: |
| Infraestructura | 5/5 |
| Acceso | 21/21 |
| Registro | 14/14 |
| Primer ADMIN | 14/14 |
| Administración | 20/20 |
| Recuperación | 36/36 |
| Seguridad | 28/28 |
| Perfil | 8/8 |
| Accesibilidad | 56/56 |
| Tiempos secuenciales | 1/1 |

El caso temporal ejecuta veinte accesos secuenciales con el umbral original; no es
carga concurrente ni evidencia de 1000/2500 usuarios. Las pruebas auxiliares de
transporte/componentes del grupo base se cuentan aparte de pruebas de negocio.

## Interrupción y reanudación

La ejecución de oferta del 26 de octubre quedó interrumpida por el usuario tras
104 pases parciales, sin JSON ni salida final. Ese log se conserva con su hash;
no se acredita como suite aprobada ni se suma a los casos únicos. El 29 se
reanudó Docker y se verificaron de nuevo aislamiento, volumen y estado manual.
Solo quedó t_academic_browser_41af30add81c, esquema ficticio del harness.
Se comprobó su propietario y se limpió ese identificador exacto en la BD aislada,
según la limpieza del harness; sin borrar volúmenes ni reinicializar bases.
Se repitió íntegra la configuración de oferta, con los mismos límites y casos.
Los resultados completos de las otras suites se conservan: fuentes de producto,
pruebas y configuraciones coinciden con la revisión ensayada.

## Incidencia de integración corregida

Primer lote completo: 1966/1971, cinco fallos en afterEach de secret-redaction
por una lista histórica de logs de identidad que rechazaba commandId/referencias
y códigos académicos ya aprobados en [T015](t015-t017.md) y
[contrato](../contracts/integration.md#auditoría-y-privacidad).
Se adaptó únicamente esa prueba: conserva la lista de identidad separada, añade
solo metadatos académicos cerrados y comprueba UUID, actor y vínculo plantilla/recurso.
No se modifica el logger de producto ni ninguna regla aprobada. El nuevo control
usa SecurityEvents real y exige rechazar email, body, motivo de cancelación,
expectedRevision y commandId inválido. Las comprobaciones de secretos/PII originales
permanecen intactas. Dirigidas: 6/6; repetición completa y lint/build posteriores
registrados arriba. Un caso nuevo explica el aumento de 1971 a 1972 definiciones;
no se suman las repeticiones como casos únicos nuevos. Las verificaciones posteriores
al antiguo fallo de allowlist se acreditan por la ejecución corregida, no por el
primer lote fallido. El JSON conserva su reporte/hash y los seis casos dirigidos.

## Trazabilidad V-A01–V-A12

| Verificación | Evidencia automática actual y límite |
| --- | --- |
| V-A01 | UNIT course/group/lifecycle; PG state/preparation/commands; E2E preparación y mantenimiento, revisión y persistencia tras recargar. |
| V-A02 | UNIT schedule/rules-regression; PG schema/preparation/publication: fechas civiles America/Lima, ocurrencia efectiva, medianoche, adyacencia y solapamientos. No resuelve conflictos de matrícula. |
| V-A03 | UNIT group y PG schema/preparation/publication, E2E formularios: capacidad 1/50, omitida frente a inválida. Sin ocupación/disponibilidad ficticia. SC-002 humano pendiente. |
| V-A04 | PG authorization y permissions, guardas HTTP y E2E por actor: matriz 350 combinaciones + 84 pérdidas de acceso; códigos seguros y cero efectos/datos denegados. |
| V-A05 | PG privacy/audit/HTTP-errors y UNIT clientes: DTO cerrado, filtros/conteos/páginas, pertenencia y logs mínimos, cancelación solo administrativa. |
| V-A06 | PG eligibility/teacher/privacy y E2E review: pérdida/recuperación sin lecturas, reset sin cambiar generación, curso no limpia revisión y republicación explícita. |
| V-A07 | PG concurrency/publication-races/transaction: dos conexiones y observador independiente, locks efectivos y redescubrimiento. Los controles I01/I02 no sustituyen los casos funcionales R/P. |
| V-A08 | PG teacher/state/lifecycle y E2E mantenimiento: publicación contra rol/estado en ambos órdenes, retiro/cancelación y revisión obsoleta, estado final persistido. |
| V-A09 | PG commands/transaction/audit: replay, digest distinto, commit ambiguo, autorización y rollback de agregado/ledger/auditoría; E2E reintento manual sin duplicación. |
| V-A10 | E2E oferta completa: administrador, alumno, docente, vacíos/errores/conflictos, móvil/escritorio y teclado. No sustituye observación humana. |
| V-A11 | PG migration/schema: instalación nueva e incremental, datos previos conservados, restricciones, trigger y vista con runtime. Restauración operativa sigue en T069. |
| V-A12 | UNIT arquitectura, regresión identidad completa PG/E2E, CSRF/CSP y guardas de entorno. Recuperación operativa pendiente T069; bootstrap no se considera resuelto. |

SC-001/003/004/005/006 se comprueban en el alcance automatizado indicado; SC-002/V-A13
requieren alumno real y siguen pendientes de T073. La porción de recuperación de
V-A11/V-A12 no se marca como ejecutada ni se sustituye por pruebas SQL de migración.

## Entorno y procedimiento

Skill speckit-implement; checklist 16/16 de solo lectura, sin AGENTS.md aplicable ni
hooks antes/después. Constitución vigente 1.2.0, cinco aclaraciones, E1, dependencias,
plan/modelo/contratos y quickstart revisados y conservados. T067 depende de los cuatro
checkpoints aprobados; no se inicia T069 ni se modifica negocio.

Proyecto aislado existente academic-offering-fa3d46bddbb8, APP_ENV=test, volumen
retenido y cero puertos publicados/mounts manuales. Docker estaba detenido al
comenzar: se reanudó en segundo plano y se aprobaron guardas antes de probar.
No se confundió ese prerrequisito operativo con pruebas en rojo.

Lanzador privado .cache/academic-offering-validation/t067-t068/run.ps1; reportes en
t067-t068-reports. Acciones secuenciales checks, discovery, unit-api, unit-web,
probe, integration, crypto-mail y las once configuraciones E2E (base/identidad/oferta).
Cada runner genera cliente y compila API; el script E2E compila web. Se reutilizan
los scripts npm existentes, maxWorkers=1 en Vitest y límites E2E intactos.

La integración usa el script completo test:integration de API y una configuración
privada que extiende vitest.config.ts sin cambiar archivos incluidos ni timeouts.
Su globalSetup levanta AppModule/transporte/pool reales en 127.0.0.1:3000 dentro
del contenedor, con un esquema t_ exclusivo generado por identityDatabase. Así
mail-delivery comprueba /health/ready real (200), sin mocks ni una API manual.
La API y su esquema se cierran/limpian al terminar. Solo se aplican migraciones
versionadas existentes a esquemas ficticios; probe usa únicamente la BD aislada.
El grupo base E2E ancla los dos nombres originales y usa Vite loopback aislado.

No se reconstruye ni se atribuye una ejecución remota del workflow; se prueban
imágenes existentes con fuentes actuales montadas. IDs/digests, plataforma, Node/npm,
lockfile y snapshot de recursos (no prueba de carga) quedan registrados en JSON.
Los pasos/jobs originales y el timeout CI de 20 minutos se conservan; validar el
workflow y duración en GitHub sigue requiriendo una ejecución remota de esa revisión.

## Revisión documental

Comprobados 823 enlaces locales en 33 documentos, sin enlaces rotos nuevos
ni preexistentes dentro del conjunto revisado. Se conserva constitución 1.2.0,
las 22 tareas de planificación futura, los siete requisitos confirmados,
las seis abiertas y los diez escenarios; T103/T104/T108 mantienen sus textos
y estados previos. El JSON incluye estos controles y los lanzadores exactos
del ensayo local, con hashes y sin valores de credenciales. No hay hooks
after_implement registrados porque .specify/extensions.yml no existe.

## Conservación y pendientes

72 archivos protegidos intactos, incluidos configuración/secretos locales, migraciones,
spec/clarificaciones y evidencia 001. Criterios de las 74 tareas sin cambios; solo
marcas T067/T068. Base manual sin SQL ni arranque, mismo ID/estado/fechas, volúmenes
conservados; cero esquemas t_ residuales y DB/Mailpit aislados detenidos al cierre.

Se conservan íntegros el timeout D10 de T066 y los seis diagnósticos/repetición
aprobados. Un pase actual no identifica su causa ni acredita una solución: D10
sigue abierto. Igual bootstrap intermitente y los timeouts anteriores B02/arquitectura
con sus repeticiones históricas, sin reescribir la evidencia. T103 permanece completo
como ejecución/informe con capacidad sin aprobar; T104/T108, SMTP externo, D04/D06
matrícula, D10/D13, aceptación humana e integral siguen pendientes.
No se ejecutan smokes ni cargas completas, AWS ni reservas/matrícula/pagos.
La reserva exacta de 24 horas y sus decisiones abiertas siguen en su spec futuro.
No se atribuye capacidad para 1000/2500 concurrentes.

**Siguiente bloque: T069**, actualización incremental y recuperación controladas
en destino ficticio. Después T070–T072 documentación/protocolo humano, T073 con
participante y T074 con evidencia completa; ninguna aceptación integral anticipada.
