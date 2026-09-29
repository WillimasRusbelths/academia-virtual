# Guía de ejecución local y recuperación

**Actualización R12 — 2026-09-27:** desarrollo nativo Windows con Node, PostgreSQL 16.14 y Mailpit. Docker/WSL pendientes, fuera de la ruta crítica local; causa del incidente de arranque no determinada. Docker en Linux se conserva para despliegue futuro. V00-L se verifica temprano, tras V00 y antes de US1/T031 (checkpoint T030), sin contratar servicios. Procedimiento vigente: [native.md](../../ops/local/native.md); resultados: [compatibility.md](../../ops/local/compatibility.md). No se modifica el alcance funcional ni se afirma capacidad demostrada.

## Entorno vigente y arranque V00

Seguir [ops/local/native.md](../../ops/local/native.md): instalación reproducible,
aprovisionamiento SQL interactivo con contraseña oculta, roles distintos para migración/runtime,
base separada de ensayo, Mailpit sin relay y comandos reales de V00.
Evidencia actual: [environment.md](../../ops/local/environment.md). La consulta SQL del
usuario se distingue de las verificaciones del agente en [compatibility.md](../../ops/local/compatibility.md).
No hay historias de identidad implementadas. Los scripts de producto siguientes siguen
siendo futuros; no ejecutarlos como parte de V00. No cambiar Windows para desbloquearlos.

## Variables y ejemplos sin credenciales

Se crearán `.env.example` y `.env.test.example` con campos secretos vacíos e instrucciones.
Los archivos reales `.env`/`.env.test` quedan ignorados. Un único cargador explícito en API,
Prisma CLI y comandos operativos leerá el archivo indicado desde la raíz, sin depender de
que el directorio actual sea `apps/api`. Vite solo recibe configuración pública y usa `/api`.

| Variable | Local previsto / significado | Regla |
| --- | --- | --- |
| NODE_ENV | development o test; producción explícita | No inferir producción por hostname |
| APP_ENV | development, test, demo o production | Guardas de fixtures y operaciones |
| APP_ORIGIN | `http://localhost:5173` | Coincidencia exacta; HTTPS obligatorio en producción |
| API_HOST / API_PORT | `127.0.0.1` / 3000 | No publicar directamente en producción |
| POSTGRES_USER / POSTGRES_DB | academia_runtime / academia_dev | Identificadores locales, no secretos |
| POSTGRES_PASSWORD | Vacío en ejemplo; generado localmente | Nunca valor real versionado |
| DATABASE_URL | Vacío en ejemplo; conexión local con contraseña privada | BD separada por entorno; URL nunca en logs |
| DB_POOL_MAX | 10 inicial | Medir; no aumentar conexiones sin revisar memoria/carga |
| MAIL_MODE | capture en desarrollo/test, smtp en producción | Producción rechaza capture; local rechaza SMTP externo |
| SMTP_HOST / SMTP_PORT | `127.0.0.1` / 1025 | Solo Mailpit en capture |
| SMTP_SECURE / SMTP_REQUIRE_TLS | false/false solo en capture local | Producción TLS validado: 465 directo o 587 STARTTLS requerido |
| SMTP_USER / SMTP_PASSWORD | Vacíos localmente | Secretos externos solo al habilitar proveedor |
| MAIL_FROM | `academia@example.test` | Remitente real verificado antes de publicación |
| MAIL_PAYLOAD_KEY / MAIL_KEY_ID | Clave aleatoria de 32 bytes en base64; ID de versión | Fuera de BD/repositorio; distinta por entorno |
| RATE_HMAC_KEY | Otra clave aleatoria de 32 bytes | Distinta de la de mail y entre entornos |
| TRUSTED_PROXY | Vacío local; dirección/red concreta de Nginx después | Nunca confiar en cualquier proxy/origen |
| MAIL_WORKER_ENABLED | true, false solo en pruebas que controlen el worker | No altera estados persistidos |
| LOG_LEVEL | info | Sin cuerpos ni secretos incluso en debug |

Cookies y límites normativos se derivan de modo de entorno y constantes testeadas; no se
añade un `.env` que permita desactivar CSRF o eludir verificación en producción. Los ejemplos
no contendrán cuenta administrativa, contraseña provisional ni claves compartidas.
Para crear claves al implementar puede usarse una herramienta criptográfica local; nunca
se generan dentro del documento ni se pegan en archivos versionados.

## Arranque futuro, después de implementar los archivos

Todos los comandos siguientes son **contratos de scripts por crear**. No se han ejecutado.
Suponen completada la tarea inicial anterior y un lockfile generado; `npm ci` no lo crea.
Usar `npm.cmd` en Windows para evitar depender de la política de ejecución de `npm.ps1`.

```powershell
# Copiar solo si .env no existe; conservar cualquier configuración local previa.
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
# Completar .env en editor local con valores privados antes de continuar.
npm.cmd ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ops/local/start-mailpit.ps1
# PostgreSQL nativo y roles/bases ya preparados; no arrancar ni reconfigurar el servicio global.
npm.cmd run db:generate --workspace @academia/api
npm.cmd run db:migrate:deploy --workspace @academia/api
npm.cmd run dev --workspace @academia/api
```

En otra terminal, desde la misma raíz:

```powershell
npm.cmd run dev --workspace @academia/web
```

Resultados esperados: API con `/health/ready` 200, SPA accesible y Mailpit capturando correo.
Una BD vacía se prepara con migraciones ya revisadas; solo desarrollo usa
`npm.cmd run db:migrate:dev --workspace @academia/api -- --name descripcion` para generar
una migración nueva. `db:generate` se ejecuta explícitamente: no depender de generación o
seed implícito en Prisma. No usar `db push` como sustituto de migraciones.

### Primer administrador

```powershell
npm.cmd run admin:bootstrap --workspace @academia/api
```

Comando futuro interactivo: solicitar nombre, correo propio del operador y credencial
provisional con entrada oculta, sin argumentos con secretos. No imprimir esa credencial ni
registrar entrada. Operador con acceso local restringido a BD y configuración; la aplicación
web no puede invocar el comando. SystemState hace la acción única incluso en paralelo.
Verificar el correo en Mailpit, establecer contraseña propia y acceder. Repetir debe fallar
sin cambiar ninguna cuenta. No se incluye administrador predeterminado en seeds.

Precisión U1 (2026-09-25): bootstrap y `security:invalidate-restored-state` solicitan al
responsable un `operatorRef` no secreto, sin valor por defecto, con 1–64 caracteres
ASCII `[A-Za-z0-9_-]`. Es un alias operativo declarado, no cuenta ni método de autenticación;
el acceso al equipo/configuración/BD sigue restringido. No usar correo, nombre de Windows
o hostname como alias automático. Cada ejecución genera su correlación y eventos privados
de inicio/resultado, sin secretos; la invalidación usa destino global, sin FK a User.
AuditEvent de bootstrap solo se escribe junto con la cuenta creada. Véanse listas permitidas
en [data-model.md](data-model.md#registros-operativos-y-de-seguridad-sin-tabla-de-cuentas-ni-fk).
Los registros estructurados se capturan en un destino privado fuera del repositorio, con
rotación y retención máxima de 30 días, sin contratar un servicio adicional.

### Datos y escenarios de prueba

Comando futuro `npm.cmd run fixtures:identity --workspace @academia/api` exige APP_ENV=test,
BD de nombre terminado en `_test`, MAIL_MODE=capture y destino loopback. Abortará ante demo/
producción o SMTP remoto. Genera alumnos/docentes/admins ficticios, activos/desactivados,
verificados/pendientes y dos sesiones por cuenta cuando un test lo requiera. Contraseñas
aleatorias en archivo privado ignorado con acceso limitado, sin salida a logs ni Git.
La preparación de fixtures no valida el registro: V01/V02 prueban el flujo real por separado.

Para pruebas no se debe sobrescribir DATABASE_URL del entorno normal accidentalmente.
Los scripts de test cargan `.env.test` explícitamente y validan las guardas anteriores.

```powershell
npm.cmd run test:unit --workspaces
npm.cmd run test:integration --workspace @academia/api
npm.cmd run test:e2e --workspace @academia/web
npm.cmd run lint --workspaces
npm.cmd run build --workspaces
```

Tras implementarse los scripts, recorrer [V01–V16](verification.md). Validación manual mínima:
registrarse → abrir Mailpit → confirmar correo → login → perfil → logout; recuperar clave
y comprobar rechazo de dos sesiones previas; crear docente como ADMIN; desactivarlo y probar
acceso directo denegado; comprobar primer admin único. Usar dos navegadores/contextos.
Ninguna prueba de correo usa destinatarios reales ni verifica tarifas de proveedor.

## Actualización y recuperación previstas

Antes de demo persistente o publicación, comprobar este procedimiento con datos ficticios:

1. Registrar revisión anterior/nueva, lockfile y versiones; detener escrituras y worker de
   correo en ventana de mantenimiento. No migrar mientras se consumen tokens o cambian roles.
2. Crear backup lógico consistente con cliente PostgreSQL 16 (misma major que servidor), verificar código de salida y
   tamaño, calcular hash y guardar copia cifrada fuera del repositorio. Retener revisión y
   configuración anterior en ubicación privada; nunca adjuntar secretos al informe.
3. Restaurar el backup en una BD separada; verificar schema, cantidades y lectura. Una copia
   sin ensayo de restauración no es evidencia de recuperación.
4. Aplicar migraciones revisadas con `prisma migrate deploy` mediante el script npm y generar
   cliente; ejecutar smoke de permisos/acceso. No editar una migración ya aplicada.
5. Si falla antes de abrir tráfico: conservar evidencia y evaluar corrección hacia adelante.
   Solo `migrate resolve` después de comprobar manualmente qué se aplicó; no marca arreglada
   una BD por sí mismo. No asumir que todo cambio tiene downgrade reversible.
6. Si es preciso recuperar: restaurar backup en una BD nueva, usar revisión compatible y
   cambiar conexión de forma controlada. Documentar pérdida de cambios posteriores al backup.
   Antes de abrir acceso, comando operativo restringido futuro `security:invalidate-restored-state`
   revoca todas las sesiones/enlaces, cancela correos restaurados y limpia payloads, manteniendo
   SystemState. Esto evita resucitar credenciales revocadas después de la copia. No resetear
   bootstrap; verificar nuevamente las cuentas y decisiones administrativas críticas.
7. Probar login, roles, bloqueo, recuperación y correo; abrir tráfico/worker solo después.
   Registrar tiempos reales de backup/restauración y dejar RPO/RTO como mediciones pendientes
   de D13. Conservar último backup previo a actualización y siete copias diarias cifradas
   como política inicial, ajustando costo/almacenamiento antes de producción.

Ejemplo **futuro** de backup/restauración de comprobación local, desde raíz y con directorio
`backups` privado ya preparado. No usar redirección binaria de PowerShell 5.1 para `pg_dump`:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe' -W -h 127.0.0.1 -U academia_owner -d academia_dev -Fc -f backups/academia-before.dump
Get-FileHash -LiteralPath backups/academia-before.dump -Algorithm SHA256
# Un operador autorizado crea primero academia_restore_check con rol propietario exclusivo.
# academia_owner no tiene CREATEDB; no elevar privilegios del runtime.
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' -W -h 127.0.0.1 -U academia_restore_owner -d academia_restore_check --exit-on-error backups/academia-before.dump
```

El ejemplo supone que `academia_restore_check` no existe; elegir otra BD de ensayo si ya
existe, sin borrarla automáticamente. Verificar cada comando antes del siguiente. La copia
extraída debe cifrarse para conservarla. Las copias de claves de cifrado se protegen por
separado y no se mezclan con dumps; al recuperar no se reenvían payloads antiguos.

## Producción y bloqueos restantes

- **Local:** ruta nativa Windows; roles y credenciales SQL exclusivos deben verificarse.
  Docker/WSL quedan pendientes, sin bloquear integración nativa. V00-L Linux temprano
  se exige antes de US1 y producción. No se considera probado por funcionar en Windows.
- **Publicación:** SMTP real, dominio/remitente, TLS/DNS, cuotas y precio aún no elegidos;
  alojamiento y respaldos deben caber junto con pruebas/video en S/300 totales. Este plan
  define cómo cambiar adaptador/configuración, no contrata ni verifica un proveedor real.
- **Capacidad:** SC-008, Argon2, pool de BD y escenario de 1000 sesiones no probados. Rúbrica
  del profesor pendiente; no se atribuyen resultados a esta máquina por tener 15.4 GiB RAM.
- **Video:** iniciar investigación independiente D07–D09 temprano, antes de comprometer
  alojamiento y sin esperar a finalizar identidad. Izipay queda fuera de estas pruebas.

Estos puntos no requieren reabrir las decisiones de correo obligatorio, recuperación por
enlace o rol único. El diseño está preparado para tareas; la ejecución local necesita los
prerrequisitos señalados.
