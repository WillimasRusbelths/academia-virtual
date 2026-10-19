# Recuperación local de identidad (T096–T098)

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
