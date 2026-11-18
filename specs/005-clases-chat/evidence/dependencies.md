# T004 — Dependencias Socket.IO

2026-11-17. Servidor y cliente fijados en **4.8.4**, licencia **MIT**.
Se consultaron la [instalación del servidor](https://socket.io/docs/v4/server-installation/),
la [compatibilidad del cliente](https://socket.io/docs/v4/client-installation/)
y el [release oficial](https://github.com/socketio/socket.io/releases/tag/socket.io%404.8.4).
Los metadatos se contrastaron con npm oficial, con TLS y confianza del sistema:
`https://registry.npmjs.org/socket.io/4.8.4` y
`https://registry.npmjs.org/socket.io-client/4.8.4`.

| Paquete | Declaración directa | Compatibilidad declarada |
| --- | --- | --- |
| socket.io 4.8.4 | dependencies de API | Node ≥10.2.0; se verifica con Node 22.23.1 |
| socket.io-client 4.8.4 | dependencies de web | Node ≥10; cliente 4.x compatible con servidor 4.x |
| socket.io-client 4.8.4 | devDependencies de API | Las futuras pruebas de protocolo importan el cliente directamente, sin depender del workspace web |

`package-lock.json` mantiene resueltos/integridades y añade 20 entradas transitivas;
ninguna versión de un paquete previo cambia. npm 10.9.8, `save-exact` y
`engine-strict` existentes. No se añaden Redis, gateway Nest, servicio permanente,
add-ons binarios opcionales o scripts de inicio de clases.

Comandos de actualización ejecutados en host, solo manifiestos/lockfile:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm.cmd install --workspace @academia/api --save-exact --package-lock-only --ignore-scripts --no-audit --no-fund socket.io@4.8.4
npm.cmd install --workspace @academia/web --save-exact --package-lock-only --ignore-scripts --no-audit --no-fund socket.io-client@4.8.4
npm.cmd install --workspace @academia/api --save-dev --save-exact --package-lock-only --ignore-scripts --no-audit --no-fund socket.io-client@4.8.4
```

La instalación real y reproducible se comprueba con `npm ci --no-audit --no-fund`
del Dockerfile API, no con esos comandos de actualización de lockfile. Se construyó
la imagen Linux del proyecto T002; los clientes Prisma y API compilaron.

El [comprobador de dependencias](../../../ops/docker/check-classes-dependencies.mjs)
verifica versiones/licencias/lockfile y abre un servidor temporal en loopback del
contenedor: ambos clientes de API/web reciben una señal del namespace `/classes`
por transporte WebSocket, path `/api/v1/classes/socket.io`. Se monta el comprobador
en la imagen del ensayo, pues no forma parte del arranque del producto:

```powershell
$checkFile = Join-Path $PWD 'ops/docker/check-classes-dependencies.mjs'
docker @argsClasses run --rm --no-deps --volume "${checkFile}:/workspace/ops/docker/check-classes-dependencies.mjs:ro" api node ops/docker/check-classes-dependencies.mjs
```

El descriptor y `$argsClasses` se recuperan como indica [T002](implementation-environment.md).
También se comprueban tipos TS 6.0.3 con interfaces de aviso `sync.required` para
Server/Socket y las suites de lint/build/unitarias existentes. Resultados y
cantidades ejecutadas se registran en [t001-t004-results.json](t001-t004-results.json).

Esto prueba instalación, tipos y compatibilidad básica del protocolo. No implementa
ni valida aún permisos del aula, tickets, expiración, CSP/proxy de navegador, WSS,
persistencia/chat o 2.500 usuarios. Las respectivas tareas conservan su aceptación
pendiente; no se inició YouTube, OBS o una integración de Cloudflare.
