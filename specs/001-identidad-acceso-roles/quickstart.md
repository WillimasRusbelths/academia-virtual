# Guía de ejecución local y recuperación

**Entorno vigente — 2026-10-06:** Docker Compose con PostgreSQL 16.14, Mailpit 1.31.3, API NestJS y web React/Vite en contenedores Linux. Procedimiento: [entorno Docker](../../ops/docker/README.md). Resultados: [verificación](../../ops/docker/verification.md). No cambia el alcance funcional ni se afirma capacidad demostrada.

## Entorno vigente y arranque V00

Seguir [ops/docker/README.md](../../ops/docker/README.md) para configurar `.env`, iniciar
los cuatro servicios, aplicar la migración de ensayo y ejecutar pruebas. Resultados en
[verification.md](../../ops/docker/verification.md). Las historias de identidad siguen
sin implementar; los comandos de producto descritos más adelante son futuros.

## Variables y ejemplos sin credenciales

Los ejemplos y el cargador de T011 ya existen. `APP_ENV` se selecciona explícitamente;
desarrollo lee `.env`, test solo `.env.test` y demo/producción solo variables inyectadas.
En Compose no se montan archivos privados: las variables llegan al contenedor desde `.env`.
Los archivos reales `.env`/`.env.test` quedan ignorados. El cargador compartido por API y
Prisma CLI lee el archivo indicado desde la raíz, sin depender de
que el directorio actual sea `apps/api`. Vite solo recibe configuración pública y usa `/api`.

| Variable | Local previsto / significado | Regla |
| --- | --- | --- |
| NODE_ENV | development o test; producción explícita | No inferir producción por hostname |
| APP_ENV | development, test, demo o production | Guardas de fixtures y operaciones |
| APP_ORIGIN | `http://localhost:5173` | Coincidencia exacta; HTTPS obligatorio en producción |
| API_HOST / API_PORT | `0.0.0.0` / 3000 (publicado solo en loopback del host) | No publicar directamente en producción |
| POSTGRES_USER / POSTGRES_DB | academia_runtime / academia_dev | Identificadores locales, no secretos |
| POSTGRES_PASSWORD | Vacío en ejemplo; generado localmente | Nunca valor real versionado |
| DATABASE_URL | Vacío en ejemplo; conexión local con contraseña privada | BD separada por entorno; URL nunca en logs |
| MIGRATION_DATABASE_URL | Conexión del propietario al mismo destino | Usuario y contraseña diferentes del runtime |
| TEST_DATABASE_URL / TEST_MIGRATION_DATABASE_URL | `academia_v00_test`; runtime y propietario de prueba | Solo se seleccionan con APP_ENV=test |
| TEST_MAIL_PAYLOAD_KEY / TEST_RATE_HMAC_KEY | Dos claves de prueba de 32 bytes en base64 | Distintas de las claves de desarrollo |
| DB_POOL_MAX | 10 inicial | Medir; no aumentar conexiones sin revisar memoria/carga |
| MAIL_MODE | capture en desarrollo/test, smtp en producción | Producción rechaza capture; local rechaza SMTP externo |
| SMTP_HOST / SMTP_PORT | `mailpit` / 1025 | Solo Mailpit en capture |
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

## Generación y migraciones de identidad

`db:generate` y `db:migrate:deploy` existen y se comprobaron en Docker: generación offline
y aplicación a esquemas aislados de prueba. El segundo comando siguiente aplica las
migraciones a desarrollo; revisar SQL y respaldos antes de usarlo sobre datos persistentes:

```sh
docker compose exec -T api npm run db:generate --workspace @academia/api
docker compose exec -T api npm run db:migrate:deploy --workspace @academia/api
```

Hay tres migraciones de identidad y, por separado, las de ensayo `probe:generate` y
`probe:migrate`. Los ensayos no migraron desarrollo. `db:migrate:dev` solo acepta desarrollo,
usa `--create-only` y requiere una BD sombra con permisos para Prisma; ese flujo no se
comprobó. Los CHECKs, triggers y el índice parcial requieren conservar y revisar su SQL.
Evidencia: [T011–T016](evidence/fundamentos-datos.md). Los comandos de bootstrap,
retención y recuperación de las secciones siguientes permanecen previstos.
El endpoint existente es `/health/live`; no se afirma implementación de `/health/ready`.
No usar `db push` como sustituto de migraciones.

### Primer administrador

```powershell
docker compose exec api npm run admin:bootstrap --workspace @academia/api
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

Comando futuro `docker compose exec -T api npm run fixtures:identity --workspace @academia/api` exige APP_ENV=test,
BD de nombre terminado en `_test`, MAIL_MODE=capture y servicios db/mailpit de Compose. Abortará ante demo/
producción o SMTP remoto. Genera alumnos/docentes/admins ficticios, activos/desactivados,
verificados/pendientes y dos sesiones por cuenta cuando un test lo requiera. Contraseñas
aleatorias en archivo privado ignorado con acceso limitado, sin salida a logs ni Git.
La preparación de fixtures no valida el registro: V01/V02 prueban el flujo real por separado.

Para pruebas no se debe sobrescribir DATABASE_URL del entorno normal accidentalmente.
Compose inyecta las variables de ensayo desde `.env`; no se monta el `.env.test` del host. Las guardas exigen db:5432, academia_v00_test y roles de prueba.

```powershell
docker compose exec -T api npm run test:unit --workspaces
docker compose exec -T api npm run test:integration --workspace @academia/api
docker compose --profile tests run --rm browser-tests
docker compose exec -T api npm run lint --workspaces
docker compose exec -T api npm run build --workspaces
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

El backup y la restauración deben implementarse con las herramientas PostgreSQL 16
del contenedor, archivos privados y una BD nueva de comprobación; V16 sigue pendiente.
No redirigir un dump binario con PowerShell 5.1: escribirlo en un archivo dentro del
contenedor y extraerlo mediante `docker compose cp`. Cifrar las copias conservadas,
verificar sus hashes y mantener las claves por separado. No borrar volúmenes ni
sobrescribir bases para ensayar recuperación.

## Producción y bloqueos restantes

- **Local:** Docker Compose es el procedimiento principal; estado verificado en
  ops/docker/verification.md. El entorno no implementa historias de identidad.
- **Publicación:** SMTP real, dominio/remitente, TLS/DNS, cuotas y precio aún no elegidos;
  alojamiento y respaldos deben caber junto con pruebas/video en S/300 totales. Este plan
  define cómo cambiar adaptador/configuración, no contrata ni verifica un proveedor real.
- **Capacidad:** SC-008, costo de Argon2 bajo carga, pool de BD y escenario de 1000 sesiones no probados. Rúbrica
  del profesor pendiente; no se atribuyen resultados a esta máquina por tener 15.4 GiB RAM.
- **Video:** iniciar investigación independiente D07–D09 temprano, antes de comprometer
  alojamiento y sin esperar a finalizar identidad. Izipay queda fuera de estas pruebas.

Estos puntos no requieren reabrir las decisiones de correo obligatorio, recuperación por
enlace o rol único. El diseño está preparado para tareas; la ejecución local necesita los
prerrequisitos señalados.
