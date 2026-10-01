# V00-L remoto — preparado, NO ejecutado

Se conserva la puerta obligatoria: **V00-L aprobado antes de US1/T031**, en el
checkpoint T030. Preparar archivos o validar YAML en Windows no acredita Linux.

## Entorno sin contratar servicios

Preferencia: una VM Linux existente de la universidad/equipo, con acceso autorizado,
Node 22.23.1/npm 10.9.8 y Docker Engine + Compose disponibles. Conectar por SSH desde
Windows; Docker y los contenedores se ejecutan exclusivamente en Linux. No abrir puertos
de BD/correo a Internet, no instalar un runner en la laptop ni cambiar WSL/Windows.
No se ha proporcionado host/acceso ni se ha abierto una sesión remota en esta revisión.

Alternativa preparada: [`.github/workflows/v00-linux.yml`](../../.github/workflows/v00-linux.yml)
usa un runner estándar `ubuntu-24.04` con ejecución exclusivamente manual
`workflow_dispatch`, permisos `contents: read`, timeout 20 minutos y sin despliegue ni caché
de npm. El workflow valida Docker/Compose, resuelve los digests usados, aprovisiona bases y
roles efímeros con `ops/linux/provision-ci.mjs`, ejecuta V00-L y detiene solo su proyecto.
Los repositorios públicos tienen runners estándar gratuitos; los privados consumen
cuota incluida. Antes de habilitarlo, el responsable debe comprobar visibilidad, saldo
gratuito y bloqueo de gasto adicional. No usar runners grandes, Codespaces facturable,
pruebas gratuitas con tarjeta ni subir artefactos/cachés de secretos.
[Condiciones oficiales de Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
No se verificó la visibilidad ni la cuota de la cuenta y el workflow **no se ejecutó**. Antes
de dispararlo, el responsable debe revisar en GitHub la visibilidad y los minutos disponibles;
si no hay gratuidad comprobada, no ejecutarlo. El checkout efímero genera sus propias claves,
no reutiliza claves Windows ni publica artefactos. Preparar el archivo no acredita V00-L.

Cuando el workflow esté disponible en el remoto con autorización posterior, abrir Actions,
seleccionar «V00-L Linux manual» y usar «Run workflow» sobre la revisión que se desea probar.
Conservar como evidencia el SHA, enlace de la ejecución, resumen con digests y resultados; no
copiar logs con valores privados. Solo un job satisfactorio permite registrar V00-L y cerrar
la parte Linux del checkpoint T030.

## Ensayo en Linux existente (manual, futuro)

1. Usar checkout/directorio nuevo con estos archivos revisados. No copiar `.env*` reales,
   node_modules, dumps, caché o ejecutables de Windows. Identificar revisión exacta y hash
   del lockfile. Publicar/subir código requiere autorización posterior; este paso no hace push.
2. Confirmar `node --version`, `npm --version`, `docker version` (Client/Server Linux),
   `docker compose version`, arquitectura, espacio y puertos 5432/1025/8025 libres.
   Si hay servicios existentes, no pararlos ni borrar sus datos: elegir un host aislado.
3. Desde raíz Linux, ejecutar lo siguiente; elegir V00_PROJECT único y comprobar que no
   identifica contenedores/volúmenes anteriores antes de `up`:

```sh
umask 077
export V00_PROJECT="academia-v00-$(date +%s)"
node ops/linux/prepare-secret.mjs
docker compose -f compose.linux.yml config --quiet
docker compose -f compose.linux.yml pull
docker image inspect postgres:16.14-bookworm axllent/mailpit:v1.31.3 --format '{{json .RepoDigests}}'
docker compose -f compose.linux.yml up -d
docker compose -f compose.linux.yml ps
docker compose -f compose.linux.yml exec db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f /provision.sql
```

Los tags son candidatos hasta descargarlos realmente. Registrar los digests devueltos y
fijarlos en Compose para la repetición final. El secreto postgres se genera en Linux sin
imprimirse y Docker lo monta como archivo. `provision.sql` solo se permite en la BD nueva
del ensayo Linux: **no volver a ejecutarlo en Windows**. Introducir sus cuatro contraseñas
localmente mediante los prompts ocultos. No usar `set -x`, logs de SQL ni `docker inspect`
completo que pueda revelar configuración privada. No montar datos Windows.

4. Crear `.env.test` solo si no existe y con permisos 600, siguiendo `.env.test.example`.
   Usar credenciales nuevas del ensayo, owner/runtime y `127.0.0.1:5432/academia_v00_test`.
   Mantener MAILPIT local al host remoto; no enviar correos reales. Confirmar salud de BD
   y respuesta HTTP Mailpit antes de continuar. Si falla, no declarar preparación aprobada.
5. Ejecutar `npm ci`, `npm run verify:v00` y `npm audit --json` (auditoría separada de éxito
   de compatibilidad). El mismo lockfile debe compilar sin ignorar engines/peers. El ensayo
   cubre filesystem sensible a mayúsculas, binario Argon2 Linux, ESM, cliente Prisma/pg,
   rollback, permisos y SMTP. No equivale a empaquetar/desplegar la aplicación completa.
6. Registrar revisión, SO/arquitectura, Node/npm, versiones/digests, hash del lockfile,
   comandos, códigos de salida y cinco pruebas satisfactorias. Documentar diferencias y
   repetir lo afectado; no subir `.env`, secretos, logs brutos o dumps como evidencia.
7. Detener solo el proyecto propio con `docker compose -f compose.linux.yml stop`.
   No borrar volúmenes/bases de este u otros ensayos automáticamente. En VM compartida,
   acordar conservación/limpieza privada con su responsable.

Si no hay host gratuito autorizado ni cuota Actions comprobada, V00-L permanece bloqueado
por acceso/infraestructura, sin impedir T009–T010 locales. No comenzar US1/T031 hasta aprobarlo.
