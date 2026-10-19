# Retención de identidad y registros privados

T095 incorpora mantenimiento explícito por lotes; no añade rutas HTTP ni una purga al
arranque de la API. [RetainRecords](../../apps/api/src/modules/identity/application/retain-records.ts)
coordina los adaptadores de [correo](../../apps/api/src/modules/mail/infrastructure/retention.ts)
e [identidad](../../apps/api/src/modules/identity/infrastructure/retention.ts).

## Plazos y eventos de referencia

Todos los cálculos SQL usan un instante de PostgreSQL por lote, conservando microsegundos.
Un registro es elegible **en el límite exacto** (`evento <= ahora - plazo`), además de las
condiciones siguientes. No se usa indiscriminadamente la fecha de creación de cada tabla.

| Datos | Referencia y condición |
| --- | --- |
| Session | 24 h desde que dejó de ser utilizable: el menor de revokedAt, absoluteExpiresAt, createdAt+8 h y lastAcceptedAt+30 min. La inactividad ya es vencimiento; no se cuenta desde el login ni se necesita una marca posterior. |
| ActionToken | 24 h desde el menor de consumedAt, revokedAt y caducidad efectiva (expiresAt, acotada a createdAt+24 h para VERIFY_EMAIL o +30 min para RESET_PASSWORD). Sin una entrega PENDING/SENDING vinculada. |
| MailDelivery | Solo estados terminales; 7 días desde **finishedAt**. El modelo fija siete días de metadatos sin otro anclaje: se concreta desde la finalización para conservar la historia completa después del último intento, aunque la creación sea anterior. Nunca se purga una entrega activa por edad. |
| Payload de correo | Se borra al alcanzar SENT/FAILED/CANCELLED, sin esperar siete días: payload, nonce, authTag y keyId. Ya lo garantizaban los adaptadores y el CHECK de BD; el mantenimiento también lo hace al cancelar una entrega obsoleta. |
| AuditEvent | 30 días desde occurredAt. Se conservan actor/destino User; la auditoría no se borra por desactivar una cuenta. |
| RateEvent | 24 h desde occurredAt; una reserva vigente no se elimina. El CHECK limita las reservas a 30 s y la admisión existente transforma las vencidas en fallo en su instante de vencimiento. Se conservan ventanas/cuotas y bloqueos actuales. |
| RateBucket | Sin eventos restantes y al menos 24 h desde updatedAt; blockedUntil debe ser nulo o haber vencido (inclusive en el instante exacto). No se añaden otras 24 h al final del bloqueo. El trigger de BD actualiza updatedAt al modificar el bucket. Se bloquea como en el adaptador de cuotas; se conservan reservas, eventos y bloqueos vigentes. |
| User / SystemState | Nunca se borran ni modifican por este mantenimiento; tampoco se modifica una provisional dentro de User. |

Los nulos de LEAST se ignoran en PostgreSQL. No se añaden columnas, migraciones
ni marcas terminales redundantes: se reutilizan relojes, CHECKs, FKs y revocaciones existentes.

## Ejecución y programación

Compilar la API con el código actual. La CLI exige los tres argumentos, en este orden:

```sh
npm run maintenance:retain --workspace @academia/api -- --schema t_retention_ensayo --batch-size 100 --batches 10
```

El ejemplo necesita un esquema de pruebas aislado existente y configurado en ambas URL
de test; no lo crea. `--schema` debe coincidir con la configuración cargada. En `test`
solo admite esquemas `t_*`, y rechaza `public` y el ensayo manual; rechaza `development`.
Para `demo`/`production` requiere la configuración válida de ese entorno y el esquema
explícito. No se ha ejecutado allí ni en desarrollo o el ensayo manual.

Cada vuelta ejecuta primero correo y luego identidad, en transacciones separadas. Cada
grupo afecta como máximo `batch-size` filas (1–1000); cada invocación permite entre 1 y
1000 vueltas. Identidad confirma o revierte juntas sus cinco operaciones. Locks de fila
con SKIP LOCKED, orden de bucket compartido, lock_timeout=3 s y statement_timeout=10 s
acotan la espera; un fallo produce salida 1 segura y permite repetir.

La salida es JSON con cantidades, vueltas y `noChanges`. **noChanges significa que esa
vuelta no cambió filas**, no que toda la BD esté vacía de trabajo: filas bloqueadas por
otra operación pueden haberse omitido. Llegar al tope tampoco equivale a purga completa.
Repetir la CLI reanuda por elegibilidad, sin cursor/archivo que perder; no reinicia plazos
ni cuotas y no duplica efectos de lotes ya confirmados.

Puede programarse esta invocación, con el entorno configurado y rutas absolutas, cada
hora mediante el programador local del operador. Este cambio no instala esa programación
ni la activa en Docker/manual. Con ejecución horaria, la eliminación física puede retrasarse
hasta la siguiente ejecución o más si hay locks, fallos o más trabajo que el límite; la
caducidad/autorización no dependen de que la fila ya haya sido purgada. Vigilar código de
salida y repetir hasta una vuelta sin cambios con el tráfico/locks estabilizados.

Una entrega obsoleta se cancela y limpia antes de purgar el token. Si está bloqueada, el
token permanece hasta otra ejecución. ON DELETE SET NULL conserva sus metadatos terminales;
un claim SMTP antiguo no puede revivirla. No hay garantía de exactamente una entrega SMTP:
un envío ya aceptado externamente no se puede retirar mediante limpieza de BD.

## SECURITY y OPERATION: rotación existente

[SecurityEvents](../../apps/api/src/infrastructure/logging/security-events.ts), ya conectado
al ciclo de vida de Nest, usa `apps/api/logs/security/YYYY-MM-DD.jsonl`: directorio 0700,
archivos 0600, UTC, campos permitidos y sin secretos. `.gitignore` y `.dockerignore`
excluyen los registros. No se incorpora ningún servicio externo ni nuevo logger.

Se conserva el día UTC actual y los 29 anteriores: máximo 30 días desde occurredAt;
al agrupar por día puede borrarse una entrada hasta casi un día antes de cumplir 30 días,
nunca se promete una retención mínima de 30 días exactos por línea. La rotación se ejecuta
al registrar, al arrancar y cada medianoche UTC, aun sin tráfico. Al reanudar tras una
parada prolongada se eliminan los archivos antiguos antes de continuar.

Solo se eliminan archivos regulares con nombre de fecha; no se siguen enlaces simbólicos
ni se borran otros nombres/directorios. Un fallo de almacenamiento avisa con texto seguro
y no convierte una denegación HTTP en éxito. Si el proceso está detenido, no ejecuta
rotación; proteger y eliminar el volumen fuera de servicio corresponde al operador.

Las pruebas crean esquemas `t_*` y directorios mkdtemp propios del contenedor efímero.
No prueban borrados sobre desarrollo, el ensayo manual, sus archivos privados o volúmenes
persistentes. Las cuentas y credenciales originales se comparan solo por lectura.
