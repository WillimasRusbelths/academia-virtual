# T069 — actualización y recuperación aisladas

2026-10-29, America/Lima. Rama `feat/002-oferta-academica`. **T069 completa**
como ensayo automático local, sin aceptación integral ni apertura de tráfico.
Base **666dc118a55654c3b0b1c51197677b1311712de2** más los tres archivos de ensayo identificados por SHA-256 en
[resultados verificables](recovery-results.json). No cambió código de producto ni
SQL versionado; PA-01–PA-05, E1 y constitución 1.2.0 conservados.

## Procedimiento y resultados

Comando ejecutado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-academic.ps1
```

[Procedimiento](../../../ops/recovery/README.md#ensayo-de-oferta-académica-t069),
[lanzador](../../../ops/recovery/rehearse-academic.ps1),
[prueba por fases](../../../apps/api/tests/recovery/academic-rehearsal.spec.ts) y
[comparación de instantáneas](../../../apps/api/tests/recovery/academic-snapshot.ts).
Se reutilizan backup.ps1, restore-check.ps1, check-guards.ps1 y AES-256-GCM sin
modificarlos, con PostgreSQL 16.14 y las imágenes registradas en JSON.

| Comprobación | Resultado real |
| --- | --- |
| Lint API, build, generación Prisma y tipos estrictos del ensayo | Cuatro comandos finales, salida 0 |
| Fase legacy | 1/1; deploy real 0001–0004, doce cuentas y respaldo previo |
| Fase upgrade | 1/1; deploy aditivo 0005 e identidad conservada |
| Fase postbackup | 1/1; tres decisiones ficticias registradas |
| Fase restore | 1/1; comparación, invalidación, comandos y reinicio reales |
| Cifrado autenticado, corrupción y no sobrescritura | 7/7 casos auxiliares únicos |
| Guardas PostgreSQL/archivos | 5/5 controles auxiliares |
| Normalización de tiempos UTC/America/Lima | 2/2 controles auxiliares |

Son cuatro ejecuciones de una prueba parametrizada por fase, no cuatro suites
independientes ni una cifra de concurrencia. Las repeticiones de controles en
contenedor/host no se suman como casos únicos adicionales. No hubo skips, retries
ni límites ampliados. Tipos se comprueban con la configuración estricta explícita
y allowJs/checkJs=false para resolver el JavaScript del harness; el build de
producto usa el tsconfig vigente montado y genera declaraciones.

### Actualización y punto consistente

Prisma aplica únicamente las cuatro migraciones originales en un esquema t_
nuevo; se crean fixtures reales de identidad, sesiones, dos enlaces/correos,
auditoría y singleton bootstrap. La huella de las ocho tablas de identidad es
igual tras aplicar 0005, excluyendo solo la columna técnica nueva comprobada
separadamente en default 0. No se alteran hashes ni migraciones históricas.

Los comandos HTTP reales preparan un curso y tres grupos con franjas contiguas,
capacidad 1/50 y America/Lima. Tras desactivar/reactivar al docente, generación 1:
un grupo conserva snapshot 0 y queda oculto/requiere revisión; otro se retira y
republica explícitamente con snapshot 1; el tercero queda cancelado terminal.
El backup conserva 14 comandos y 14 auditorías académicas, tres franjas, doce
usuarios, seis filas de sesión, dos tokens y dos correos.

La API/worker se cierran y los runners terminan antes de cada pg_dump: no quedan
escritores de aplicación durante la copia. Los flags de mantenimiento siguen
siendo una declaración del operador; no son detección automática de escritores.
El correo sintético PENDING se retiene con nextAttemptAt futuro; el SENDING usa
un lease futuro. Se detiene el scheduler real y no se envía correo obsoleto.

Se generan dos copias cifradas con claves separadas. **Solo preupdate.enc fue
restaurada y verificada funcionalmente**; preacademic.enc se conservó como copia
previa, sin atribuirle una restauración que no se ejecutó.

### Fallo y recuperación

Después del backup se desactiva al docente, se cancela el grupo revisado y se
cambia el nombre de un alumno ficticio mediante sus operaciones públicas.
Una migración deliberadamente inválida 0006 se añade solo a una copia temporal
de Prisma dentro del contenedor. Se verifican salida fallida, una fila de migración
fallida y ausencia de RecoveryInterrupted por rollback SQL. PostgreSQL registra
la funci?n deliberadamente ausente; Prisma imprime despu?s transacci?n abortada.
Se contrast? la causa primaria en el log del servidor: no fue un error de conexi?n
y no se atribuye un c?digo P3018/SQLSTATE que la CLI no imprimi?. Es el fallo esperado
del escenario; no se modifica 0005, no se usa migrate resolve ni se promete downgrade.

restore-check.ps1 verifica hash/autenticación y usa pg_restore --single-transaction
a una BD nueva recovery_20b834abdb1a_test, con PUBLIC revocado y CONNECT explícito
a owner/runtime. La fuente fallida se conserva para inspección. Todas las filas
de catorce tablas coinciden con la instantánea, incluidos generación, snapshots,
revisiones, ledger y auditoría; también columnas, índices, restricciones, enums,
funciones, triggers, vistas y grants. CHECK se compara mediante la reescritura de
PostgreSQL/EXPLAIN, como V16, sin quitar condiciones. Deploy compatible conserva
exactamente esa instantánea; runtime no puede crear tablas y capacidad 0 se rechaza.

Antes de cualquier reapertura se ejecuta la invalidación real existente:
**4 sesiones, 2 enlaces y 2 correos**; conserva usuarios, singleton, auditoría,
cuotas y las cinco tablas académicas. Cookies/enlaces anteriores rechazados;
nuevo login de los tres roles y denegaciones académicas correctas. El ledger
restaurado permite replay del alta original sin nuevo efecto y rechaza un cuerpo
diferente con IDEMPOTENCY_CONFLICT. Republicar el cancelado devuelve
OFFERING_STATE_CONFLICT sin cambios. Se comprueban logs STARTED/SUCCEEDED y
ausencia de credenciales/PII, sin publicar sus valores.

Las tres decisiones posteriores se identifican desde el registro privado del
ensayo: restaurar por sí solo deja docente activo y grupo publicado como estaban
en el backup. El operador ficticio las revisa/reaplica por las interfaces reales,
con el mismo commandId de cancelación perdido, generación docente 2 y exactamente
un comando/auditoría académicos adicionales. No hay conciliación automática ni
una política nueva de negocio. Un proceso Node nuevo verifica persistencia,
acepta la sesión nueva y rechaza la anterior. Se mantienen trafficReady=false,
cero correos enviados y cero tráfico público.

RTO observado del ensayo: **55.19 s**, desde detectar el fallo hasta completar
las verificaciones de recuperación. Ventana superior de cambios no protegidos:
**64.68 s**, desde iniciar el dump hasta detectar el fallo; no es un SLA ni un
RPO aprobado. Tres decisiones conocidas se pierden al restaurar y se reaplican
explícitamente; no se asegura recuperar otros cambios fuera del backup.

## Intentos y limitaciones conservados

- Primer intento ad92578a43bb: TS5112 de invocación y TS7016 de resolución del
  harness en el control dirigido. Se corrigieron flags y montaje del tsconfig;
  no llegó a acreditar fases de recuperación.
- ddabc3344536: fase legacy falló por enlace sintético ajeno a la plantilla de
  correo; se corrigió el fixture, sin modificar la validación de producto.
- 935f65fdd447: legacy pasó; upgrade recibió 404 por PATCH en estado de identidad.
  Se corrigió a PUT según contrato, manteniendo la expectativa 200.
- Los resultados finales pertenecen a 20b834abdb1a. Los intentos previos, archivos,
  cifrados y volúmenes permanecen privados, sin contarlos como ensayos aprobados.
- El intento local de node --test bajo sandbox no cargó casos por spawn EPERM;
  la repetición autorizada ejecutó los siete controles reales y pasó. No se
  atribuye el error de entorno al cifrado.

## Conservación y alcance

Proyecto final exclusivo, red interna, sin puertos publicados. Los cuatro proyectos
del ensayo quedaron detenidos, con sus volúmenes conservados y claves/archivos
privados bajo .cache. No se comparte la configuración ni las cuentas del ensayo
manual. Se comparan metadatos del contenedor manual y los tres volúmenes previos:
idénticos; sin SQL manual, reinicializaciones ni down -v. Los 72 archivos
protegidos permanecen intactos. No se publican env, handoff, dumps, claves ni
reportes brutos con datos privados.

Revisión documental: 830 enlaces locales en 33 documentos, sin enlaces rotos
en el conjunto comprobado; 22 tareas futuras, siete requisitos confirmados y seis
decisiones abiertas conservados. Auditoría final: 74 descripciones de tareas
intactas, solo T069 marcada, ningún secreto detectado ni dump temporal local
restante. Sintaxis PowerShell revisada; sin hooks after_implement registrados.

V-A11/V-A12 completan aquí su porción de ensayo incremental/restore; la regresión
automática integral de producto continúa respaldada por [T068](automated.md),
sin repetir cargas, smokes o E2E ajenos al cambio. El control de diff preparado
detect? CRLF mezclado en dos archivos nuevos; solo se normalizaron a LF y se
retiraron l?neas vac?as finales. JSON conserva hashes ensayados y normalizados;
no se atribuye una nueva ejecuci?n funcional por ese cambio de formato. CI remoto no ejecutado.
Constitución IX/X comprobada en este alcance; D13 sigue abierta para custodia,
ubicación, responsables y objetivos operativos. No demuestra pérdida del equipo,
custodia externa, retención real ni capacidad para 1000/2500 concurrentes.

T104/T108, bootstrap, timeout histórico D10, SMTP externo, D04/D06 de matrícula,
aceptación humana SC-002/T073 e integral siguen pendientes. Las reservas exactas
de 24 horas permanecen en su spec futuro, con sus decisiones abiertas intactas.

**Siguiente bloque: T070–T072**, documentación vigente, pendientes y protocolo de
aceptación humana. T073 exige participante; este ensayo no lo sustituye.
