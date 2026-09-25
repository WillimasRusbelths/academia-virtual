# Guía de ejecución local y recuperación

Fecha: 2026-09-23. **Guía planificada, no aplicación ejecutable todavía.** Solo existen
documentación y Spec Kit. No existen `package.json`, workspaces de aplicación, Compose,
esquema Prisma, comandos npm de producto ni pruebas de aplicación. Los comandos de las
secciones de arranque serán ejecutables después de implementarlos y generar el lockfile.

Revisión documental: 2026-09-24. La evidencia del equipo corresponde al 2026-09-23; no se
ha reconfigurado Windows ni se ha ejecutado la aplicación durante esta revisión.

## Comprobaciones realizadas en esta máquina

| Comprobación de solo lectura | Resultado observado |
| --- | --- |
| Git | 2.51.1.windows.1; rama `feat/001-identidad-acceso-roles`; árbol limpio al comenzar |
| Node / npm | Node v22.23.1; `npm.cmd` 10.9.8 |
| PowerShell | Windows PowerShell 5.1.26100.9168; `pwsh` no localizado |
| Windows | Windows 11 Pro, build 26200; WSL informa 10.0.26200.9168 |
| RAM / CPU | 15.4 GiB utilizables según CIM; SLAT true y VirtualizationFirmwareEnabled true |
| Hipervisor | HypervisorPresent false |
| WSL | 2.7.10.0 instalado; versión predeterminada 2; sin distribuciones de usuario |
| `wsl --status` | WSL2 no puede iniciar por virtualización no habilitada; pide revisar Plataforma de máquina virtual y firmware |
| Docker | No encontrado en PATH, rutas habituales de Desktop/bin ni servicio com.docker.service |
| Compose / daemon / contenedores | No verificables sin Docker disponible; ningún contenedor arrancado |
| Spec Kit | `setup-plan.ps1 -Json` resuelve la funcionalidad y copia plantilla; ejecución con política Bypass solo para ese proceso |

Las consultas WSL/CIM fallaron inicialmente por permisos del entorno del agente; se repitieron
como consultas autorizadas de solo lectura. Los datos posteriores muestran firmware habilitado,
pero hipervisor inactivo. No se atribuye el fallo exclusivamente a BIOS. No se instalaron
componentes, habilitaron características, reiniciaron servicios ni descargaron imágenes.

## Prerrequisitos que debe resolver la implementación

1. Revisar características de Windows para WSL2/Plataforma de máquina virtual y el arranque
   del hipervisor, con el responsable del equipo; reiniciar si la habilitación lo exige.
   Confirmar que `wsl --status` ya no informa imposibilidad de iniciar WSL2.
2. Instalar/configurar Docker Desktop con contenedores Linux y backend WSL2, verificando
   licencia aplicable y requisitos de su [documentación oficial](https://docs.docker.com/desktop/setup/install/windows-install/).
   No es necesario instalar una distribución de usuario aparte si Docker gestiona su backend.
3. Validar `docker version` con secciones Client **y Server**, `docker compose version` y
   `docker info`; tener solo el ejecutable no demuestra que el motor funcione.
4. Mantener Node/npm indicados en [investigación](research.md). Verificar dependencias nativas
   de Argon2 y Visual C++ Redistributable requerido por herramientas elegidas. Fijar versiones
   en lockfile y comprobar build en Windows; no se ha hecho esa instalación en esta etapa.
5. Disponer de los puertos locales 5173, 3000, 5432, 1025 y 8025 y espacio para imágenes/BD.
   k6 y navegadores Playwright se instalan al preparar sus pruebas, no se suponen disponibles.

Comprobaciones repetibles de solo lectura desde PowerShell:

```powershell
node --version
npm.cmd --version
git --version
wsl --version
wsl --status
docker version
docker compose version
docker info
```

## Disposición local prevista

Desde la raíz del repositorio, npm workspaces ejecuta frontend/backend en Windows. Compose
levanta únicamente `db` (PostgreSQL 17-bookworm) y `mailpit`. Fijar parche/digest en el futuro
archivo `compose.local.yml`; bind de todos sus puertos solo a `127.0.0.1`, volumen nombrado
para `/var/lib/postgresql/data` de PostgreSQL 17 y healthcheck de BD. Mailpit sin relay,
forwarding, release SMTP ni credenciales reales. No usar imágenes `latest`.

Frontend: `http://localhost:5173`, proxy `/api` a `127.0.0.1:3000` conservando Origin.
API se liga solo a loopback local; frontend usa rutas relativas. Mailpit UI:
`http://localhost:8025`. En producción futura Nginx sirve frontend/API bajo un único HTTPS;
la topología publicada no queda instalada ni desplegada aquí.

## Primera tarea futura: validar instalación, compilación y conexión a PostgreSQL

**Pendiente, no ejecutada.** Debe ser el primer bloque de trabajo al descomponer este plan,
antes de implementar reglas de identidad. Docker/WSL bloquea su parte de conexión mediante
Compose; no impide redactar el plan ni generar `tasks.md` posteriormente.

1. Comprobar los mínimos y dependencias de la tabla R01 de [research.md](research.md),
   elegir parches concretos y crear únicamente el esqueleto de los dos workspaces con las
   versiones candidatas. Instalar sin ignorar `engines` ni conflictos de peer dependencies.
   Esta primera instalación genera `package-lock.json`; después comprobar `npm.cmd ci`.
2. Compilar TypeScript y build de Vite y Nest, ejecutar una prueba mínima del runner del
   backend que construya un provider/controlador con metadatos de decoradores y una prueba
   de componente React. Usar scripts obligatorios: su ausencia es fallo, no un éxito vacío.
   Si ESM, TypeScript 6, el cliente Prisma o los tipos no encajan, documentar el error y
   ajustar la combinación antes de iniciar la funcionalidad.
3. Con Docker/WSL operativo, iniciar PostgreSQL 17 y Mailpit según Compose previsto.
   Generar el cliente Prisma con adapter-pg, aplicar una migración mínima de ensayo en BD
   aislada y realizar lectura/escritura seguida de rollback. Confirmar conexión desde Nest
   y cierre del pool. Esto comprueba conexión y transacción, no las reglas de identidad.
4. Probar un hash y verificación Argon2id en Windows con los parámetros propuestos y una
   captura SMTP en Mailpit sin relay. Esas comprobaciones revelan dependencias nativas y
   problemas de red local sin contratar ni enviar correo a destinatarios reales.
5. Guardar informe sin secretos: versiones instaladas, SO, lockfile/digests, comandos,
   resultados de instalación/build/pruebas/conexión y cambios de versión justificados.
   La combinación pasa a validada solo cuando todo lo anterior tenga evidencia reproducible.

Esta tarea aún no existe en un `tasks.md` ni se ha ejecutado como parte de la revisión.
El escenario completo de aceptación y los 1000 usuarios siguen pendientes después de ella.

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
| POSTGRES_USER / POSTGRES_DB | academia / academia_dev | Identificadores locales, no secretos |
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
docker compose --env-file .env -f compose.local.yml up -d db mailpit
docker compose --env-file .env -f compose.local.yml ps
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
2. Crear backup lógico consistente con cliente PostgreSQL 17, verificar código de salida y
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
docker compose --env-file .env -f compose.local.yml exec -T db pg_dump -U academia -d academia_dev -Fc -f /tmp/academia-before.dump
docker compose --env-file .env -f compose.local.yml cp db:/tmp/academia-before.dump backups/academia-before.dump
Get-FileHash -LiteralPath backups/academia-before.dump -Algorithm SHA256
docker compose --env-file .env -f compose.local.yml exec -T db createdb -U academia academia_restore_check
docker compose --env-file .env -f compose.local.yml exec -T db pg_restore -U academia -d academia_restore_check --exit-on-error /tmp/academia-before.dump
```

El ejemplo supone que `academia_restore_check` no existe; elegir otra BD de ensayo si ya
existe, sin borrarla automáticamente. Verificar cada comando antes del siguiente. La copia
extraída debe cifrarse para conservarla. Las copias de claves de cifrado se protegen por
separado y no se mezclan con dumps; al recuperar no se reenvían payloads antiguos.

## Producción y bloqueos restantes

- **Local:** Docker no disponible y WSL2 no operativo; bloquean levantar Compose y ejecutar
  integración/carga. Hay que resolverlos y repetir las comprobaciones; no se instaló nada.
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
