# Entorno local con Docker Compose

Ejecutar todos los comandos desde la raíz del repositorio. Se conserva el monorepo
con NestJS, React/Vite, Prisma, PostgreSQL 16.14 y Mailpit 1.31.3. Este entorno sirve
para desarrollo y pruebas de la aplicación mínima; no es un despliegue de producción.
Identidad, pagos y video no están implementados. Los 1000 usuarios concurrentes siguen
pendientes de demostrar con pruebas de carga.

## Requisitos previos

Docker Desktop iniciado con motor Linux y WSL2 operativo en Windows, o Docker Engine
Linux con Compose. Comprobar `docker info` y `docker compose version`. Se usa Compose
v5.5.1. No se necesita PostgreSQL, Mailpit ni Node instalado en el host. La construcción
requiere acceso a los registros de imágenes y npm; la red de ejecución es interna.

## Configuración privada

Copiar `.env.example` a `.env` solo si no existe y completar las cinco contraseñas con
valores aleatorios independientes, hexadecimales de 64 caracteres. No usar contraseñas
reales de otros sistemas ni compartir `.env`. Las URL se construyen dentro de Compose
con nombres de servicio; no se deben pegar las conexiones del host en contenedores.

Además, completar `MAIL_PAYLOAD_KEY`, `RATE_HMAC_KEY`, `TEST_MAIL_PAYLOAD_KEY` y
`TEST_RATE_HMAC_KEY` con cuatro claves independientes de 32 bytes en base64. El generador
crea también estas claves. Si `.env` ya existe, conservar sus contraseñas y añadir solo
las claves de identidad faltantes:

```powershell
docker run --rm --mount "type=bind,source=$PWD,target=/workspace" -w /workspace node:22.23.1-bookworm-slim node ops/docker/configure.mjs --identity-keys
```

Alternativamente, este comando genera `.env` y rechaza sobrescribirlo (PowerShell):

```powershell
docker run --rm --mount "type=bind,source=$PWD,target=/workspace" -w /workspace node:22.23.1-bookworm-slim node ops/docker/configure.mjs
```

En Linux/macOS usar `"type=bind,source=$(pwd),target=/workspace"` para el montaje.
Si Node compatible ya está disponible, `node ops/docker/configure.mjs` hace lo mismo.
Las claves no se imprimen. `.env.test.example` documenta las variables de prueba; Compose
las inyecta en `api` desde `.env`. No se copia ni se monta `.env.test` del host.

## Construcción e inicio

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Para construir por separado: `docker compose build`. Los Dockerfiles usan Node 22.23.1,
el lockfile existente y `npm ci`; no cambian versiones de frameworks. No se montan
`node_modules` ni builds del host. Después de editar código, repetir `up -d --build`.
La web usa Vite en modo de desarrollo; la API ejecuta el JavaScript compilado.

## Servicios, red y puertos

| Servicio | Acceso desde el host por defecto | Dirección interna | Health check |
| --- | --- | --- | --- |
| PostgreSQL | `127.0.0.1:55432` | `db:5432` | `pg_isready` por TCP |
| Mailpit SMTP | `127.0.0.1:11025` | `mailpit:1025` | Mailpit `readyz` |
| Mailpit web | `http://localhost:18025` | `http://mailpit:8025` | Mismo servicio Mailpit |
| API | `http://localhost:3000/health/live` | `http://api:3000` | GET `/health/live` |
| Web | `http://localhost:5173` | `http://web:5173` | GET `/` |

Los puertos publicados se cambian en `.env`; los internos permanecen fijos. Solo se
publica en loopback. La red `local` tiene `internal: true` para la comunicación entre
servicios. La red adicional `access` permite publicar puertos en el host: este motor
no publica los de contenedores conectados únicamente a una red interna. Es una red
bridge con salida posible; la aplicación no necesita Internet en ejecución.
Vite dirige `/api` a `http://api:3000`, conservando la ruta;
se autoriza explícitamente el host `web` para la prueba interna de Chromium, sin
permitir hosts arbitrarios.
Los endpoints de identidad previstos aún no existen. El endpoint de salud actual se
consulta directamente en el puerto API. Las páginas usan `localhost` de forma consistente.

La API espera a PostgreSQL y Mailpit saludables; la web espera a la API saludable.
El health check de la API demuestra que el proceso HTTP responde, no prueba por sí
solo acceso a datos o SMTP. Esas conexiones se verifican con las pruebas indicadas abajo.

## Datos, roles y migraciones

El volumen `postgres_data` persiste con `docker compose down`. PostgreSQL ejecuta
`ops/docker/init-databases.sql` únicamente en un volumen nuevo: crea `academia_dev` y
`academia_v00_test`, cada una con propietario y runtime restringido. Las pruebas no
pueden conectarse a desarrollo ni crear objetos con el runtime. No se importa, elimina
ni modifica la instalación PostgreSQL del host.

El modelo de ensayo `CompatibilityProbe` permanece separado del esquema de identidad.
Generar y aplicar la migración de compatibilidad dentro de `api`:

```sh
docker compose exec -T api npm run probe:generate
docker compose exec -T api npm run probe:migrate
docker compose exec -T api npm run probe:check
```

Las guardas exigen `db:5432`, `academia_v00_test` y los roles exclusivos de ensayo.

El esquema de identidad contiene ocho modelos y tres migraciones revisadas. La imagen
genera el cliente con `db:generate`, sin conexión a la BD. `db:migrate:deploy` aplica solo
migraciones versionadas al entorno explícito: desarrollo por defecto en Compose o prueba
mediante `-e APP_ENV=test`. No se ejecuta automáticamente al iniciar la API. Revisar SQL
y respaldos antes de aplicarlo sobre datos persistentes. `db:migrate:dev` está restringido
a desarrollo y solicita solo crear la migración; necesita una BD sombra con permisos
adecuados para Prisma. No se otorgó CREATEDB al propietario ni se validó ese flujo aquí.

Las pruebas de integración migran esquemas vacíos aislados de `academia_v00_test`,
verifican una copia ficticia incremental y eliminan exclusivamente sus propios esquemas.
Los resultados de T011–T016 están en [fundamentos de configuración y persistencia](../../specs/001-identidad-acceso-roles/evidence/fundamentos-datos.md).

No usar `db push`, reset ni ejecutar el inicializador de bases sobre un volumen existente.
Cambiar contraseñas en `.env` no cambia las almacenadas: para una rotación hay que
actualizar los roles mediante un procedimiento controlado y conservar los datos.

## Logs y comprobaciones HTTP

```sh
docker compose logs --tail=100 db mailpit api web
docker compose logs -f api web
docker compose ps
```

Abrir la web y Mailpit en las direcciones de la tabla. La API debe devolver
`{"status":"ok"}`. No publicar la salida completa de `docker compose config` ni
`docker inspect`: pueden incluir claves. `config --quiet` valida sin imprimirlas.

## Pruebas

Con los cuatro servicios saludables y la migración de ensayo aplicada:

```sh
docker compose exec -T api npm run lint
docker compose exec -T api npm run build
docker compose exec -T api npm run test:unit
docker compose exec -T api npm run test:integration
docker compose exec -T api npm run test:crypto-mail
docker compose --profile tests build browser-tests
docker compose --profile tests run --rm browser-tests
```

La integración comprueba PostgreSQL real, permisos, rollback y esquema aislado. El ensayo
SMTP conecta desde el contenedor API a Mailpit, solo con destinatarios `@example.test`;
no borra mensajes existentes. El contenedor opcional de navegador usa Chromium contra
la web real del servicio `web`; no añade un quinto servicio permanente. Su imagen instala
solo el navegador y las dependencias necesarias para la prueba existente. Los reportes
de esa ejecución efímera no se copian al repositorio.

`docker compose exec -T api npm run verify:v00` agrupa las comprobaciones de compatibilidad;
no reemplaza lint, límites de capas ni navegador. El workflow manual
[v00-linux.yml](../../.github/workflows/v00-linux.yml) usa el mismo Compose en un proyecto
aislado y ejecuta estos comandos. Una validación local no acredita una ejecución de Actions.
Antes de ejecutar el workflow remoto, revisar autorización, visibilidad y cuota disponible
de la cuenta; no habilitar gastos adicionales. Esta migración no lo dispara.

## Detención

```sh
docker compose down
```

No añadir `-v`. Se eliminan los contenedores y la red del proyecto, pero se conserva
`postgres_data`. Reiniciar con `docker compose up -d` reutiliza los datos. No detener
servicios de otros proyectos ni eliminar volúmenes para solucionar un error de claves.

## Problemas frecuentes

- Motor no accesible: iniciar Docker Desktop y comprobar que `docker info` muestra
  servidor Linux. No reinstalar ni cambiar virtualización automáticamente.
- Puerto ocupado: cambiar solo el puerto publicado en `.env`; mantener los nombres y
  puertos internos. Los valores de BD/Mailpit evitan los puertos habituales del host.
- Build sin acceso a registros: revisar conectividad, proxy y confianza de certificados;
  no desactivar TLS ni sustituir `npm ci` por instalación sin lockfile.
- PostgreSQL rechaza claves en un volumen existente: conservarlo y revisar la configuración
  usada al crearlo; `.env` y roles deben coincidir. No reinicializar ni borrar datos.
- Prueba falla por tabla inexistente: ejecutar `probe:migrate`, no aplicar migraciones
  de producto que todavía no existen.
- Mailpit no responde: revisar `docker compose ps`, logs y `mailpit readyz`. Dentro de
  API usar `mailpit`, no `localhost` ni el puerto publicado del host.
- Cambios de código no aparecen: reconstruir imágenes. Dependencias y compilaciones
  se mantienen dentro de Linux, separadas de las del host.

La evidencia de ejecución se registra después de las pruebas; no se considera aprobado
el entorno solo porque `config` sea válido o las imágenes se hayan construido.

### Red con inspección TLS

Si npm devuelve `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, comprobar el emisor del certificado
de la conexión usando la confianza del sistema. Exportar únicamente la CA pública
correspondiente, ya confiada por el equipo, en formato PEM a `.cache/docker/npm-ca.crt`.
No exportar claves privadas ni confiar en certificados obtenidos sin verificación.
Copiar `ops/docker/compose.ca.example.yml` a `compose.override.yml` solo si no existe.
Compose carga ese archivo automáticamente; `docker compose up -d --build` no cambia.

Los Dockerfiles reciben la CA mediante un secret de BuildKit y `NODE_EXTRA_CA_CERTS`
solo durante las descargas de npm/Chromium. La CA no queda en las imágenes. El archivo
local y el override están ignorados; no se incorporan al workflow ni son necesarios en
una red con certificados públicos verificables. Se mantiene la validación TLS activada.
