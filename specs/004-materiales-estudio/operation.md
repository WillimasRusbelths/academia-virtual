# Operación de materiales — preparación T065 / D13

2026-11-17, America/Lima. **Procedimiento preparado; T065 y D13 pendientes de
acuerdos reales.** Este documento no habilita demo persistente, publicación,
purga, compra, cambio del entorno manual o ejecución de un ensayo de 24 horas.
El estado de ejecución se registra en [tasks.md](tasks.md).
Inicialmente el responsable pidió conservar los acuerdos D13 pendientes.
Actualización 2026-11-17: eligió **otro equipo** como destino de la copia y al
**encargado que reciba el software** como custodio de la copia. Son acuerdos
parciales: no se identificó el equipo concreto ni se confirmó disponibilidad,
custodia separada de la clave, sustituto, retención, RPO/RTO o recuperación.
No se ha transferido una copia ni comprobado ese destino.

## Alcance y evidencia disponible

Materiales conserva metadatos, bytea, intenciones, comandos y auditoría en la misma
BD. El archivo confirmado es inmutable; retirar cambia visibilidad, no borra bytes.
La matrícula vigente y el permiso actual se verifican en cada solicitud nueva.
No conceder acceso por ser autor antiguo ni extender matrículas al recuperar.

| Evidencia existente | Qué acredita | Qué sigue pendiente |
| --- | --- | --- |
| [T061–T062](evidence/recovery.md) | Upgrade real 0007→0009, reinicio, dump cifrado y restore en otra BD; bytes/hashes/catálogo/ACL, sesiones y permisos; revisión de dos decisiones perdidas | Destino de recuperación acordado, pérdida física del host, custodia externa y objetivos aceptados |
| [T063](evidence/local-resources.md) | Mediciones locales con dos archivos nuevos de 20 MB, cliente lento, fallos SQL inyectados y respaldo | Volumen realista y límites operativos del entorno acordado |
| [T064](evidence/human-acceptance.md) | Resultado global favorable en laptop comunicado tras corregir PDF | Móvil no observado; teclado sin desglose. No acredita acuerdos D13 |

Los ensayos usan datos ficticios, fuentes por hash y otra BD del mismo servidor;
clave y archivo están separados por directorio en el mismo host. No equivalen a
copias externas ni a continuidad ante pérdida del equipo. Los tiempos observados
en T062 no son RPO/RTO aceptados. Los pendientes de operación de 003, pagos D02 y
24 h físicas conservan su alcance: [preparación T090](../003-reservas-ordenes-matricula/evidence/operation.md).

## Registro de acuerdos D13 por completar

Cada decisión requiere valor explícito, referencia anónima del responsable,
fecha y evidencia de acuerdo. No registrar contraseñas, claves o datos personales.
Las opciones técnicas descritas aquí son preparación, sin decisiones adoptadas.

| ID | Decisión necesaria | Valor / acuerdo actual | Evidencia necesaria para cierre |
| --- | --- | --- | --- |
| O01 | Custodio de copia y clave; sustituto y quién autoriza recuperar/abrir | Parcial: la copia la custodiará el encargado que reciba el software, según responsable el 2026-11-17; clave/sustituto/autorización de apertura pendientes | Responsables y disponibilidad confirmados |
| O02 | Origen autorizado: equipo, proyecto, BD/schema, roles y datos | Pendiente | Inventario saneado, versión e identificación privada del destino |
| O03 | Ubicación cifrada de copia externa y alcance ante pérdida del host | Parcial: otro equipo elegido por responsable el 2026-11-17; referencia/disponibilidad/acceso y recuperación aún no comprobados | Destino concreto identificado y recuperación desde él comprobada |
| O04 | Custodia separada de clave, permisos y recuperación de acceso | Pendiente | Responsable y mecanismo comprobado, sin publicar secreto |
| O05 | Frecuencia de copias y puntos de corte consistentes | Pendiente | Calendario y responsables; mantenimiento verificable |
| O06 | Retención de copias, retirados, intenciones y evidencia; eliminación operada | Pendiente | Plazos/alcance y decisión de conservación; sin purga activada |
| O07 | RPO: pérdida máxima aceptable de datos/decisiones | Pendiente | Objetivo acordado y comparación con ensayo del destino |
| O08 | RTO: tiempo aceptable y definición de servicio restituido | Pendiente | Objetivo, inicio/fin y criterio de apertura acordados |
| O09 | Espacio disponible para BD/TOAST/WAL, temporales y copias | Pendiente | Volumen/crecimiento/margen y respuesta a umbrales acordados |
| O10 | Observación: reloj, recursos, cadencia, alertas e incidentes | Pendiente | Fuente de observación y responsables; umbrales definidos |
| O11 | Restore en destino nuevo, compatibilidad y revisión posterior al backup | Pendiente | Ensayo funcional del destino y aceptación explícita de pérdidas |
| O12 | Costo total y autorización del alcance operativo | Pendiente | Costo acumulado compatible con S/300 total; autorización identificada |

No hay una política automática de retención o cuota agregada aprobada. La falta
de acuerdo impide iniciar persistencia de demo/publicación; no convierte los datos
en conservables infinitamente ni autoriza eliminarlos para liberar espacio.

## Antes de actualizar o respaldar

1. Confirmar O01–O12 y el alcance concreto. Registrar commit y archivos sin commit
   por SHA-256, imagen por ID, lockfile, PostgreSQL/Node y configuración identificada
   mediante hash privado. No publicar archivos de entorno ni secretos.
2. Verificar compatibilidad de código/migraciones. Las migraciones aplicadas se
   conservan: no corregir checksums ni asumir que una down migration recupera datos.
   Mantener la fuente anterior y el destino nuevo identificados.
3. Detener todos los escritores del punto de corte: API, despacho de reservas,
   vencimiento, conciliación de pagos, correo, tareas y sesiones de operador. Las
   herramientas no detectan automáticamente su detención: MaintenanceConfirmed
   es una declaración que exige comprobación del operador. No detener servicios
   ajenos al alcance acordado.
4. Delimitar hechos externos que no se detienen con la API. Pagos/callbacks requieren
   el procedimiento validado de 003/T059; no reejecutar cobros ni inventar conciliación.
5. Comprobar roles runtime/migración separados, ACL, salud de reloj y espacio para
   dump dentro del contenedor, dump temporal del host, cifrado y manifiesto. El pico
   de espacio incluye copias simultáneas y WAL, no solo tamaño lógico de archivos.
   El corpus compresible T063 no dimensiona documentos reales.
6. Preparar directorios privados fuera de Git, copia y clave separadas. La clave
   binaria es de 32 bytes. Revisar ACL de Windows o permisos del entorno Linux
   según el [procedimiento existente](../../ops/recovery/README.md). Registrar su
   custodia sin copiar el contenido a argumentos, logs o informes.

## Respaldo conjunto y verificación

Plantilla para el alcance ya acordado; las variables deben resolverse privadamente.
No se ejecutó sobre el entorno manual durante esta preparación:

```powershell
./ops/recovery/backup.ps1 -Container $BackupContainer -Database $SourceDatabase -ArchiveFile $NewArchive -KeyFile $SeparateKeyFile -Revision $SourceRevision -MaintenanceConfirmed -MaterialsSchema $MaterialsSchema
```

El dump incluye la BD completa, no solo el schema del inventario. Guardar el
archivo cifrado ACADBKP1 junto al manifiesto, nunca junto a la clave. La herramienta
no sobrescribe copias existentes. Comprueba hashes y cifra con AES-256-GCM; el
manifiesto por sí solo no es una firma ni una política de custodia.

MaterialsSchema agrega conteos y hashes completos desde bytea, tamaño, grupo,
autor, último actor, estado/revisión y metadata; intenciones/ledger/auditoría
incluyen hashes de todas las filas. No exporta contenido o textos privados.
Corresponde al schema indicado: si el alcance incluye otros schemas de materiales,
inventariarlos y verificarlos explícitamente; no atribuir cobertura total al único
inventario. Los escritores siguen detenidos durante inventario y pg_dump.

Registrar exit code, tiempos UTC, bytes/hash del cifrado y del dump, inventario,
versión y referencia privada de la copia. Verificar recepción y lectura en el
destino de custodia acordado. Un archivo copiado no acredita recuperación:
requiere restore funcional. No programar backups o retención por este documento.

Si falla el respaldo, no continuar la actualización. Conservar la copia previa,
identificar el fallo y comprobar temporales exactos. finally limpia normalmente
el dump; pérdida de host o cierre forzado puede dejar texto plano. No hacer
borrados masivos ni reutilizar un destino fallido automáticamente.

## Restauración en cuarentena y actualización fallida

1. Mantener tráfico/escritores detenidos y preservar origen fallido. Preparar otra
   BD/volumen del alcance aprobado; los roles globales y credenciales no vienen
   en pg_dump. Revisar owners/ACL y CONNECT mínimos, sin superusuario en runtime.
2. La herramienta actual solo admite una BD nueva con nombre recovery_*_test;
   rechaza destinos existentes, sin clean/create ni borrados. Esta es una
   restricción del ensayo, no un procedimiento productivo aprobado. Si un destino
   no cumple las guardas, detenerse y validar su procedimiento; no eludirlas.

   ```powershell
   ./ops/recovery/restore-check.ps1 -Container $RestoreContainer -NewDatabase $NewRecoveryDatabase -ArchiveFile $VerifiedArchive -KeyFile $SeparateKeyFile -MaintenanceConfirmed
   ```

3. Verificar cifrado/hash antes de crear el destino. Tras restore, comparar
   inventario completo, catálogo, ACL, autor/grupo, estados, revisiones y datos
   de identidad/oferta/finanzas. Un fallo deja la BD en cuarentena para inspección.
   materialsVerified=true y trafficReady=false no autorizan abrir tráfico.
4. Ejecutar invalidación de estado restaurado con la CLI existente en el entorno
   permitido, schema exacto y referencia de operador. Registrar STARTED/SUCCEEDED
   y receipt privado. Sus guardas rechazan development/manual_*; no cambiarlas
   ni usar credenciales manuales para hacer pasar el ensayo.

   Tras configurar privadamente el destino restaurado permitido:

   ```powershell
   npm.cmd run security:invalidate-restored-state --workspace apps/api -- --operator-ref $OperatorRef --schema $RestoredSchema --maintenance-confirmed
   ```
5. Comprobar sesiones antiguas denegadas y login nuevo. Verificar administrador,
   docente actual/anterior/ajeno, alumno vigente/histórico y otro grupo; probar
   archivos en los tres estados y sus formatos. PENDING no se completa ni publica.
6. Reconstruir las decisiones conocidas desde el punto de corte: un retiro posterior
   perdido puede volver a aparecer publicado al restaurar. Registrar qué se perdió,
   quién revisó y qué acción autorizó. Reaplicar explícitamente solo lo revisado,
   con revisión/idempotencia vigentes; no publicar preparados ni reintentar todos
   los comandos a ciegas. No extender matrícula o cambiar hechos financieros.
7. Registrar intervalos observados y alcance de la pérdida, comparar con O07/O08,
   resolver incidencias y obtener aceptación del responsable. Solo abrir el acceso
   acordado tras controles funcionales y decisión explícita. Sin esa evidencia,
   mantener cuarentena. No afirmar recuperación de todos los cambios posteriores.

El ensayo reproducible de T062 ejecuta esta secuencia con migración deliberadamente
fallida solo en copia temporal. No ejecutar esa migración de fallo en ningún otro
entorno. Para repetir únicamente el laboratorio aislado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-materials.ps1 -ApiImage $LocalApiImage
```

## Incidentes, espacio y registro de operación

Ante indisponibilidad de BD/espacio, denegar el intento nuevo sin perder archivos
confirmados. Observar 429 por actor, 503 global/fallo, abortos, plazas, pool,
RSS/buffers, TOAST/WAL/disco y backup. No ampliar límites/timeout/pool o activar
purga automáticamente. Los límites vigentes son 20 000 000 bytes, 2 transferencias
por proceso y 1 por actor; no son capacidad del despliegue. Si hay varios procesos,
la admisión no constituye una cuota global distribuida.

Registrar incidentes con fecha UTC, componente, código seguro, efecto durable,
evidencia por hash, responsable y resolución. Para 24 h físicas se requiere la
ventana real y dependencias de 003, sin TestClock ni timers acelerados. No hay
ensayo operacional persistente iniciado por redactar esta guía.

Registro de cierre T065 pendiente: O01–O12, comprobación del destino de custodia,
restore y permisos del alcance elegido, pérdidas revisadas, costos y aceptación
del responsable. [Informe de preparación](evidence/t065-t066-report.md).
