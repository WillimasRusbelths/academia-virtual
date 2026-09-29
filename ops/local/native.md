# Arranque nativo de Windows — decisión R12

Decisión autorizada el 2026-09-27: Node.js + PostgreSQL 16.14 + Mailpit nativo,
sin Docker local. Docker/WSL quedan pendientes; la causa del incidente de arranque
no está determinada y no se ha demostrado incompatibilidad con el equipo.
No repetir cambios de características, BIOS o arranque. Docker en Linux se conserva
para despliegue futuro, con validación temprana V00-L antes de producción.

## Preparación de PostgreSQL por el responsable

**Actualización 2026-09-28:** el responsable informa bases/roles ya creados, contraseñas
corregidas con `\password`, permisos y `.env.test` configurados. **No volver a ejecutar
provision.sql en este equipo ni recrear objetos.** Las instrucciones de aprovisionamiento
que siguen se conservan exclusivamente para una instalación nueva. Estado real de las
comprobaciones posteriores en [compatibility.md](compatibility.md).

El agente comprobó cliente 16.14 y respuesta de autenticación del servidor en localhost;
en el primer intento no disponía de contraseña. La consulta SQL exitosa y versión servidor 16.14 fueron
aportadas por el usuario. No equivalen a transacción Prisma verificada.

Desde la raíz, **PowerShell normal, sin administrador de Windows ni reinicio**:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -X -W -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -f ops/local/provision.sql
```

Introducir la contraseña de postgres solo en el prompt oculto. El script solicita
también, mediante `\password`, cuatro claves nuevas y distintas con entrada oculta.
Usar un gestor de contraseñas local; nunca copiarlas al chat, argumentos, SQL o Git.
El script crea exclusivamente `academia_dev`, `academia_v00_test` y cuatro roles nuevos:

| Base | Migraciones/propietario | Ejecución |
| --- | --- | --- |
| academia_dev | academia_owner | academia_runtime |
| academia_v00_test | academia_v00_owner | academia_v00_runtime |

Todos carecen de superusuario, CREATEDB, CREATEROLE, replicación y BYPASSRLS. Los roles
de ejecución solo tienen CONNECT/USAGE/DML y secuencias en su base; no CREATE de schema
ni membresía en el propietario. PUBLIC pierde acceso únicamente en estas bases nuevas.
Las migraciones usan el propietario y los tests el rol de ejecución de ensayo.
No se cambia configuración global PostgreSQL ni objetos de bases existentes.
Si cualquier nombre ya existe, aborta antes de crear objetos. La creación de bases no
es transaccional: ante fallo parcial conservar lo creado, revisar el error y preparar
continuación explícita; no volver a ejecutar a ciegas ni borrar objetos.

Copiar `.env.test.example` a `.env.test` **solo si no existe**; completar en editor local:
`PROBE_MIGRATION_URL` y `PROBE_DATABASE_URL` con formato PostgreSQL URI, host `127.0.0.1`,
puerto `5432`, base `academia_v00_test` y los roles respectivos. Codificar caracteres
reservados de las claves en la URI localmente. Los valores no deben imprimirse.
La futura `DATABASE_URL` de `.env` usará academia_runtime/academia_dev, nunca postgres.
No usar la base `postgres` para pruebas ni migraciones. Los ejemplos dejan secretos vacíos.

Para revisar la configuración existente sin mostrar valores: `npm.cmd run probe:check`.
La configuración Prisma valida también el destino ante invocación directa del CLI;
solo `generate` puede ejecutarse sin conexión. Las pruebas nunca usan el propietario.

## Node y dependencias

Usar `npm.cmd`, sin cambiar la política global de PowerShell. En esta máquina la
validación TLS de npm necesitó las CA del sistema; mantener TLS activado:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm.cmd ci --offline=false
npm.cmd run build
npm.cmd run test:smoke
```

`NODE_OPTIONS` solo afecta esta terminal y sus hijos. No usar force, legacy-peer-deps,
strict-ssl=false ni NODE_TLS_REJECT_UNAUTHORIZED=0. Lockfile y evidencia en compatibility.md.

## Mailpit portátil

Binario oficial v1.31.3 Windows amd64 en `.cache/mailpit-1.31.3/mailpit.exe`, no versionado.
Descargar [archivo oficial](https://github.com/axllent/mailpit/releases/download/v1.31.3/mailpit-windows-amd64.zip)
si falta. SHA256 ZIP: `863e9502d4e0f14a78c0f91c5091797b1c7b7b7e3fc7e5eab62e5770ce44b76e`;
comprobado contra digest publicado por GitHub Releases. SHA256 EXE:
`ee0b025bc9f61e6856d6032128408ee6fe1627f510c118a4fa0faa7bfdb7cd33`.
Extraer solo en directorio nuevo; no sobrescribir instalaciones previas.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ops/local/start-mailpit.ps1
```

No necesita administrador/reinicio. Script inicia ventana oculta, elimina configuración
MP_* solo del hijo y no habilita relay/forwarding/webhooks. Puertos 1025/8025 solo loopback;
acepta destinatarios `@example.test`. Guarda mensajes en almacenamiento temporal propio;
no borra buzones existentes. UI http://127.0.0.1:8025. Conservar el PID informado para
detener únicamente ese proceso al terminar; comprobar su ruta antes de `Stop-Process`.

## Cierre V00

Tras configurar la base aislada y arrancar Mailpit:

```powershell
npm.cmd run verify:v00
```

Exige build, smoke React/Nest HTTP con metadatos, generación Prisma, migración controlada,
transacción con rollback real y permisos restringidos, Argon2id y captura SMTP local.
Falta de configuración es fallo, nunca skip o aprobación parcial. Registrar resultados.
`npm ci` reproducible forma parte del cierre T008. No ejecutar historias funcionales.

## V00-L — validación temprana independiente en Linux

Preparación remota y opciones sin contratación: [ops/linux/README.md](../linux/README.md).
Compose está preparado, no ejecutado ni aprobado; no requiere Docker/WSL en Windows.

Programar inmediatamente después del primer V00 local y **antes de empezar US1/T031**:
en equipo/runner Linux autorizado, sin contratar alojamiento, ejecutar `npm ci`, ambos
builds, smoke, Prisma/migración/rollback/roles y Argon2/SMTP contra PostgreSQL 16 y Mailpit
en Docker. Preparar entonces Compose Linux con versiones/digests concretos, datos nuevos,
puertos loopback y secretos externos. Registrar SO, arquitectura, lockfile y resultados,
sensibilidad a mayúsculas, binarios nativos y conexión. No montar datos Windows ni
afirmar portabilidad por las pruebas locales. Bloquea iniciar US1 y publicación, no V00
nativo; usar el checkpoint T030 existente para conservar IDs de tareas. Docker/WSL en
Windows no es requisito de esta validación. Sigue pendiente, no ejecutada.

La prueba temprana de video D07–D09 sigue independiente; no esperar a terminar identidad.
Presupuesto S/300 total y 1000 concurrentes siguen siendo restricciones/objetivos, sin
capacidad demostrada. Izipay no interviene en V00.
