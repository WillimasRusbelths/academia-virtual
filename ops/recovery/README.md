# Recuperación local de identidad (T096–T098)

El procedimiento también incluye oferta, matrícula y materiales en el dump completo.
El [ensayo de materiales](#materiales-004-t061t062) añade inventario de contenido y
verificación de restauración; no sustituye los acuerdos operativos D13.

Procedimiento de mantenimiento con PostgreSQL 16, Docker y Node 22; scripts compatibles
con Windows PowerShell 5.1. No es un servicio de backups ni una programación activada.
El ensayo se documenta en [evidencia](../../specs/001-identidad-acceso-roles/evidence/recovery.md).
La ubicación definitiva, custodia, responsable y tiempos aceptables siguen en
[D13](../../docs/decisiones-pendientes.md). La purga T095 sigue siendo una CLI explícita.

## Preparación y respaldo

1. Registrar revisión anterior/nueva, lockfile, configuración privada y versiones de
   PostgreSQL/Node. Revisar compatibilidad de código y migraciones; no modificar una
   migración ya aplicada. Guardar configuración/secretos aparte del repositorio y copia.
2. Activar mantenimiento y detener **todos** los escritores: API, worker de correo,
   tareas y sesiones de operador que escriban. No ejecutar migraciones mientras haya
   consumo de enlaces o cambios de rol. Confirmar procesos detenidos; los switches de
   estos scripts son una declaración del operador, no una detección automática.
3. Preparar un directorio de copias privado, fuera de Git y con ACL de usuario local;
   en Linux usar 0700. También contendrá temporalmente el dump sin cifrar. Separar la
   clave binaria aleatoria de 32 bytes en otro directorio privado/almacén; nunca pasar
   su contenido como argumento ni imprimirlo. Por ejemplo, con Node:

   ```powershell
   node -e "require('node:fs').writeFileSync(process.argv[1],require('node:crypto').randomBytes(32),{flag:'wx',mode:0o600})" C:/privado/keys/identity.key
   ```

4. Ejecutar usando nombres reales del contenedor/BD, rutas absolutas y revisión:

   ```powershell
   ./ops/recovery/backup.ps1 -Container recovery-db -Database academia_v00_test -ArchiveFile C:/privado/backups/preupdate.enc -KeyFile C:/privado/keys/identity.key -Revision <commit> -MaintenanceConfirmed
   ```

   `pg_dump --format=custom --file` escribe dentro del contenedor y `docker cp` copia
   el archivo. No hay redirección de bytes de pg_dump en PowerShell. Se comprueban
   códigos de salida, tamaño y SHA-256; AES-256-GCM autentica cabecera y contenido.
   El manifiesto acompaña al cifrado, con revisión, tiempos, hashes y `restored=false`.
   El manifiesto no es una firma frente a un atacante con acceso a la clave.
   Fallar no autoriza actualizar. Los temporales se retiran en `finally`; un cierre
   forzado del host puede dejarlos: revisarlos en el directorio privado y `/tmp` del
   contenedor sin borrados masivos. No se sobrescriben copias existentes.

## Restauración y apertura controlada

1. Mantener tráfico/worker detenidos. Usar otro contenedor/volumen para ensayos. La
   restauración solo acepta un nombre **nuevo** `recovery_*_test`, nunca una BD existente.
   Verificar previamente los roles globales/contraseñas y privilegios del destino:
   pg_dump de una BD no incluye roles. No copiar roles superusuario al runtime.
2. Restaurar, sin `--clean`, `--create` ni borrados de BD:

   ```powershell
   ./ops/recovery/restore-check.ps1 -Container recovery-db -NewDatabase recovery_trial_test -ArchiveFile C:/privado/backups/preupdate.enc -KeyFile C:/privado/keys/identity.key -MaintenanceConfirmed
   ```

   Hash y autenticación se comprueban antes de crear la BD. Se retira el acceso de
   PUBLIC a la BD nueva; conceder CONNECT únicamente a owner/runtime revisados antes
   de las comprobaciones funcionales. El dump sin `--create` no provisiona roles ni
   permisos de conexión a la BD. `pg_restore --single-transaction --exit-on-error`
   conserva owners/ACL de los objetos restaurados y aborta ante error. Si falla tras crearla, la BD
   permanece en cuarentena para inspección: no se elimina ni se reusa automáticamente.
   La salida `restored=true, trafficReady=false` solo acredita la restauración del
   archivo; no la compatibilidad funcional. No se modifica el manifiesto original.
3. Comparar schema, constraints/FKs/índices, cantidades y datos esperados con el punto
   de respaldo. Verificar permisos runtime/owner, marca SystemState y cuentas.
   Preparar variables privadas apuntando **solo** a la BD nueva y revisión compatible;
   ejecutar generación del cliente y `db:migrate:deploy` con migraciones revisadas.
4. Ante actualización fallida, conservar estado/error saneado y corregir hacia adelante.
   **No** invocar `prisma migrate resolve` automáticamente: requiere revisión humana
   del SQL realmente aplicado y plan de corrección. No existe downgrade automático.
   Si se restaura, asumir perdidos los cambios posteriores al punto consistente y
   registrar su alcance; no importar indiscriminadamente sesiones/tokens posteriores.
5. **Antes de arrancar API/worker o abrir tráfico**, invalidar el estado restaurado:

   ```sh
   npm run security:invalidate-restored-state --workspace apps/api -- --operator-ref Williams --schema t_restore_trial --maintenance-confirmed
   ```

   Requiere configuración explícita de destino. Rechaza desarrollo, schemas manuales
   y schemas de test fuera de `t_*`. No hay endpoint HTTP. La autorización es el acceso
   local al proceso/credenciales BD; el alias atribuye la acción. Una transacción revoca
   sesiones/tokens abiertos y cancela PENDING/SENDING borrando payload/claim. Conserva
   tokens consumidos, marcas terminales, usuarios, singleton, auditoría y cuotas.
   Se comprueba OPERATION/RESTORED_STATE_INVALIDATION, LOCAL_OPERATOR/IDENTITY_SCOPE,
   alias, correlación y SUCCEEDED con cantidades en el registro privado global. No
   crea AuditEvent ficticio ni incluye secretos. Si el registro falla antes del cambio,
   no opera; si falla después del commit, devuelve error: mantener cierre y repetir.
   Los locks terminan con la transacción; no impiden nuevas escrituras posteriores:
   la pausa de todos los escritores es obligatoria, incluido un envío SMTP en curso.
6. Revisar cookies/enlaces previos rechazados, nuevo login/roles/denegaciones, correo
   obsoleto cancelado, configuración y readiness. Reiniciar de forma controlada y
   comprobar persistencia antes de abrir. Registrar inicio/fin, RPO (ventana de cambios
   no protegidos), RTO medido y cambios efectivamente perdidos. No comparar contra un
   SLA inventado: D13 no tiene objetivo aprobado. No exponer cadenas de conexión,
   enlaces, correos, cookies, contraseñas ni claves en evidencia versionada.

## Copias y límites

Retención **prevista**: siete copias cifradas más la copia previa a cada actualización.
No hay cron, eliminación automática ni custodia externa implementados. Inventariar
las copias manualmente; no retirar una copia previa hasta contar con restauración
verificada y decisión del responsable. Un archivo generado y con hash no es por sí
solo un respaldo funcional verificado. Mantener las claves aparte y probar su
recuperación. El ensayo local no acredita resistencia a pérdida del equipo, siete
días de operación real, ni aceptación con participantes (T104).

## Reproducir V16 sin tocar el entorno manual

Con Docker Desktop activo y la imagen local de API construida según el quickstart:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse.ps1
```

[rehearse.ps1](rehearse.ps1) crea un proyecto con nombre aleatorio, red interna sin
puertos publicados, volumen PostgreSQL nuevo y credenciales/claves exclusivas en
`.cache/recovery-*` con ACL privada. No usa Compose/volúmenes del entorno manual.
La [prueba por fases](../../apps/api/tests/recovery/rehearsal.spec.ts) exige el marcador
de BD aislada antes de escribir: prepara doce fixtures, pausa el worker, crea backup,
hace un cambio ficticio posterior y ejecuta una migración deliberadamente fallida.
Restaura en otra BD, compara schema/datos, aplica una migración correctiva en una
copia temporal de Prisma, invalida mediante T096 y verifica acceso/reinicio.
No edita migraciones del repositorio ni ejecuta migrate resolve.

Los JSON de prueba, logs y credenciales quedan privados. `summary.json`,
`guards-summary.json` y `restore-summary.json` contienen el resumen saneado;
**handoff.json contiene secretos** y no debe publicarse. Los servicios nuevos se
detienen en finally, sin `down -v`; archivos y volumen se conservan para inspección.
Los fallos se informan sin volcar URLs/secretos. El reporte detallado de Vitest también
es privado. Una ejecución fallida no cuenta como aceptación. No ejecutar la suite
de fases directamente contra desarrollo/manual ni reutilizar sus cuentas.

Referencias oficiales: [pg_dump 16](https://www.postgresql.org/docs/16/app-pgdump.html),
[pg_restore 16](https://www.postgresql.org/docs/16/app-pgrestore.html),
[crypto de Node](https://nodejs.org/docs/latest-v22.x/api/crypto.html).

## Ensayo de oferta académica (T069)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-academic.ps1
```

Usa los mismos scripts de cifrado, respaldo, guardas y restauración. Crea un proyecto
`academic-recovery-*` exclusivo, red interna sin puertos y volumen nuevo retenido;
no reutiliza cuentas, claves, bases ni volúmenes manuales. Requiere la imagen local
de API indicada por `-ApiImage` (por defecto `academia-local-api:latest`). Monta las
fuentes, Prisma y tsconfig actuales; no instala servicios ni ejecuta cargas.

Las fases explícitas de `academic-rehearsal.spec.ts` comprueban:

1. Migraciones 0001–0004 mediante Prisma y doce cuentas ficticias; respaldo cifrado
   previo a la incorporación académica.
2. Aplicación aditiva de 0005 con las mismas huellas de identidad; publicación real,
   pérdida/recuperación docente, revisión explícita y cancelación terminal.
3. Backup consistente con escritores/worker detenidos, incluidos generación,
   snapshots, ledger y auditoría. Dos entregas sintéticas permanecen retenidas para
   comprobar su cancelación al invalidar el estado restaurado, sin enviarlas.
4. Tres decisiones ficticias posteriores al backup y una migración inválida 0006
   solo en una copia temporal de Prisma. Se exige fallo real y ausencia de tabla
   parcial; no se modifica ninguna migración aplicada ni se usa migrate resolve.
5. Restauración transaccional a una base nueva; comparación de filas, esquema,
   restricciones, funciones, vistas y permisos; deploy compatible sin cambios.
6. Invalidación real de sesiones/enlaces/correo antes de abrir tráfico; conservación
   del ledger y auditoría académicos, replay y rechazo de intención diferente.
   Revisión y reaplicación controlada de las tres decisiones ficticias perdidas,
   accesos por rol y reinicio mediante otro proceso Node.

Los archivos de `.cache/academic-recovery-*`, dumps, claves y `handoff.json` son
privados. Las fases generan reportes saneados `*-summary.json`; el resumen final
solo existe si todas completaron sus aserciones. Los fallos se conservan y los
servicios se detienen en `finally`, sin borrar volúmenes. Ninguna fase abre tráfico
público. Registrar revisión y hashes del código no versionado que se haya ensayado.

Este ensayo no recupera automáticamente cambios posteriores al backup: los tres
cambios se conocen por el registro privado del ensayo. Sus tiempos observados no
establecen un SLA ni cierran D13. La evidencia efectiva y sus limitaciones se
registran en [T069](../../specs/002-oferta-academica/evidence/recovery.md).

## Ensayo de reservas, órdenes y matrícula (T086)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-enrollment.ps1 -ApiImage academic-offering-fa3d46bddbb8-api:latest
```

Indicar una imagen API local revisada que contenga las dependencias del lockfile
vigente. El lanzador registra su ID y monta fuentes, pruebas, Prisma y configuración
de compilación actuales. Verifica el manifiesto de fuentes y la configuración
privada al terminar; no editar estos archivos mientras se ejecuta.

El ensayo crea un proyecto `enrollment-recovery-*`, volumen nuevo retenido, red
interna y cero puertos publicados. Genera claves y credenciales propias en un
directorio con ACL del usuario actual. No requiere las cuentas ni el volumen del
ensayo manual. Reutiliza `backup.ps1`, `restore-check.ps1`, cifrado AES-256-GCM y
guardas existentes. Nunca ejecutar sus fases directamente contra datos manuales.

Las cuatro fases de `apps/api/tests/recovery/enrollment-rehearsal.spec.ts` verifican:

1. Deploy Prisma real de 0001–0005, doce cuentas ficticias y filas académicas previas;
   respaldo cifrado anterior a matrícula.
2. Deploy aditivo de 0006–0007, preservación de las filas previas y comprobación del
   default nullable de descripción. Preparación de un grafo financiero ficticio y
   lectura real de la orden. Estas filas físicas no acreditan pagos del proveedor.
3. Backup con escritores detenidos: cada runner terminó y no hay API ni worker
   persistentes. Registro de una anotación ficticia posterior al punto consistente.
   Migración 0008 deliberadamente inválida únicamente en una copia temporal de
   Prisma; fallo real y ausencia de tabla parcial, sin `migrate resolve`.
4. Restore transaccional de la versión nueva a otra BD `recovery_*_test`, comparando
   todas las filas y catálogo, owners/ACL y deploy compatible. Runtime sin DDL y
   pagos terminales inmutables. Invalidación real de sesiones/enlaces/correo antes
   del acceso de prueba; las filas ajenas a esos accesos permanecen intactas.
   Nuevos logins por rol, lecturas de matrícula, denegaciones, reaplicación revisada
   de la anotación perdida, replay sin duplicación y rechazo de intención distinta.
   Otro proceso Node comprueba persistencia y rechazo de la sesión anterior.

Solo la copia posterior al upgrade se restaura en este ensayo; la copia 0005 se
conserva sin atribuirle una restauración. Un fallo deja sus bases, archivos y volumen
en cuarentena; repetir el lanzador crea un proyecto diferente. `finally` detiene solo
los servicios nuevos y conserva sus recursos. No borrar volúmenes ni reutilizar una
BD de restore existente para intentar corregir un fallo.

Los resúmenes y manifiestos son privados en `.cache/enrollment-recovery-*`.
La [evidencia T086](../../specs/003-reservas-ordenes-matricula/evidence/recovery.md)
publica resultados saneados y límites. La restauración no recupera automáticamente
cambios posteriores al backup: se revisa y reaplica únicamente la anotación conocida.
Los tiempos observados no aprueban RPO/RTO, custodia, retención ni operación física
de 24 horas. D13, D02, aceptación humana y capacidad siguen siendo puertas separadas.


## Preparación del ensayo operacional 003 (T090, pendiente)

El [plan de 24 horas](../../specs/003-reservas-ordenes-matricula/evidence/operation.md)
coordina T090 con VP004 y este procedimiento. Es una preparación documental, sin
servicios iniciados, destino autorizado ni reloj físico observado. T059/D02 y los
acuerdos D13 siguen pendientes. La recuperación T086 no fija objetivos de RPO/RTO
ni aprueba custodia, retención o una demo persistente.

Antes de ejecutar: identificar responsables, destino exclusivo, ventana/costo,
fuente horaria y observación, custodia/retención, RPO/RTO y límites de interrupción;
registrar autorización explícita y evidencia sandbox T059. Verificar fuentes, roles,
backups/restauración y ausencia de relojes/timers de fixture. No promover el reloj
controlado de ensayos humanos o automatizados como observación de 24 horas físicas.

Durante backup/restore mantener detenidos todos los writers del destino acordado,
incluidos despacho de reservas, vencimiento, conciliación de pagos, API y correo.
Si el futuro callback del proveedor no puede pausarse, aplicar únicamente el
procedimiento validado con T059 para su entrega/recuperación; no asumir que detener
la API detiene los hechos externos ni que un backup contiene eventos posteriores.
Restaurar siempre a otra BD, invalidar accesos y reconciliar solo hechos conocidos
y autorizados antes de abrir. No cambiar plazos, prometer downgrade o reejecutar
cobros para resolver incertidumbre. Conservar fuente fallida, copias y evidencia.

## Materiales 004 (T061–T062)

Con todos los escritores detenidos, `backup.ps1` sigue haciendo pg_dump de la BD
completa: metadatos, bytea, intenciones pendientes/completadas, ledger y auditoría
permanecen juntos en el archivo cifrado. El parámetro opcional `-MaterialsSchema`
añade al manifiesto un inventario del schema explícito que ya tiene 0008/0009:

```powershell
./ops/recovery/backup.ps1 -Container recovery-db -Database academia_v00_test -ArchiveFile C:/privado/backups/materials.enc -KeyFile C:/privado/keys/archive.key -Revision <commit> -MaintenanceConfirmed -MaterialsSchema t_materials_trial
```

El dump sigue incluyendo toda la BD; el inventario corresponde al schema indicado.
Se calculan hashes completos desde cada bytea, se comparan con SHA-256 y tamaño
persistidos, y se registran grupo, autor original, último actor, estado y revisión.
Los textos y nombres solo participan en el hash de metadata, nunca se imprimen.
Intenciones, comandos y eventos llevan conteos y hashes de todas sus filas. Una
inconsistencia impide generar la copia. Se conserva compatibilidad con respaldos
sin materiales y con el formato cifrado ACADBKP1; no se modifican copias previas.

El mantenimiento declarado debe impedir escrituras durante inventario y dump.
Los hashes no sustituyen esa exclusión ni autentican por sí solos un manifiesto.
Cuando el manifiesto incluye materiales, `restore-check.ps1` compara automáticamente
`Get-RecoveryMaterialsInventory` con el inventario original antes de devolver
`materialsVerified=true`; mantiene `trafficReady=false`. Después se invalidan
accesos y se ejecutan los controles funcionales. Revisar primero
los roles/ACL: el dump de una BD no incluye sus roles globales.

Para el laboratorio ficticio, con Docker Desktop activo y una imagen API local:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-materials.ps1 -ApiImage <imagen-local-api>
```

El script crea otro proyecto `materials-recovery-*`, red interna sin puertos,
volumen nuevo y credenciales/clave exclusivas en `.cache/materials-recovery-*`
con ACL privada y clave separada de las copias. No usa la BD/volumen manual.
Comprueba 0007 real, conserva identidad/oferta/finanzas, aplica 0008/0009 y prepara
PDF/JPEG/PNG mediante API real, en tres estados, más una intención pendiente.
Comprueba dos procesos API distintos antes de respaldar. Una migración 0010
deliberadamente inválida existe solo en una copia temporal de Prisma; debe fallar
y no dejar su tabla parcial. No se reescriben migraciones ni se ejecuta downgrade.

La restauración se hace en una BD nueva `recovery_*_test`, preservando la fuente
fallida. Antes de abrir tráfico se comparan inventario, bytes completos, catálogo,
ACL, datos, hashes, grupo, autor y estados; se invalidan todas las sesiones
restauradas y se prueban login nuevo, permisos de gestor/alumno y matrícula histórica.
Replay conserva el ledger anterior; reiniciar no completa una intención pendiente.

El ensayo registra un retiro y una publicación posteriores al backup. La copia no
los contiene: restaurar puede volver a mostrar el estado anterior al retiro. Por
eso se mantiene cuarentena hasta revisar decisiones conocidas. El operador ficticio
reaplica únicamente el retiro revisado y comprueba replay idempotente; no publica
automáticamente el preparado ni pretende recuperar todos los cambios posteriores.
Las comprobaciones HTTP son internas al laboratorio, sin abrir tráfico público.

`handoff.json`, archivos de entorno, dumps, claves y logs completos quedan privados.
Los `*-summary.json`, `summary.json` y `guards-summary.json` contienen resultados
saneados. El script detiene solo sus servicios, sin eliminar volumen o archivos.
Ver [evidencia de materiales](../../specs/004-materiales-estudio/evidence/recovery.md).
Este ensayo local no acepta custodia/retención D13, RPO/RTO, recursos/capacidad D10,
operación física de 24 horas, aceptación humana o cierre integral de 001–003.
