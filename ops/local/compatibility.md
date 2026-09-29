# V00 nativo — evidencia de compatibilidad

Fecha de cierre de esta ejecución: **2026-09-28**. Windows x64, rama
`feat/001-identidad-acceso-roles`. **V00 nativo APROBADO**. V00-L Linux y alertas npm pendientes.
No se implementaron historias de identidad, no se ejecutó V00-L Linux ni se modificó Windows.
Los cambios existentes se conservaron. No se ejecutó nuevamente `provision.sql`, ni se
recrearon/modificaron bases o roles, ni se editó `.env.test`.

## Evidencia aportada por el responsable

- PostgreSQL cliente/servidor 16.14; consulta `SELECT version()` exitosa con postgres.
- Windows volvió a arrancar; VirtualMachinePlatform Disabled, HypervisorPresent False.
  Causa del incidente no determinada; no demuestra incompatibilidad Docker/WSL.
- `npm ci`, builds API/web y dos smoke satisfactorios antes de esta ejecución.
- Bases academia_dev/academia_v00_test y cuatro roles creados; contraseñas corregidas
  mediante `\password`; permisos de ambos esquemas y default privileges aplicados sin error.
- `.env.test` configurado y exclusión de Git comprobada.

Esos resultados se distinguen de las verificaciones del agente siguientes. No se toman
los permisos declarados como prueba del acceso efectivo del runtime.

## Verificaciones ejecutadas por el agente

| Comprobación | Resultado observado |
| --- | --- |
| Rama / cambios | Rama correcta; cambios previos conservados |
| `git check-ignore -v .env.test` | Ignorado por `.gitignore`; no se imprimió su contenido |
| `npm.cmd ci --offline=false` | Exit 0; 302 paquetes añadidos, 305 auditados; sin force ni legacy-peer-deps |
| `npm.cmd run build` | Exit 0; TypeScript Nest/ESM y TypeScript/Vite React compilados |
| `npm.cmd run test:smoke` | 2/2: Nest construye controlador/provider con metadatos, HTTP real loopback 200; React renderiza componente mínimo |
| `npm.cmd run probe:generate` | Exit 0; cliente Prisma 7.10.0 generado; salida ignorada por Git |
| `npm.cmd run probe:migrate` | Exit 0; migración 0001_probe aplicada exclusivamente en academia_v00_test con academia_v00_owner |
| `npm.cmd run probe:check` | Owner: conexión y permisos básicos aprobados; servidor **16.14**, sin privilegios globales elevados, CREATE en public y sin CONNECT a academia_dev. Runtime: conexión y permisos básicos aprobados en el reintento final (sin CREATE de esquema ni CONNECT a academia_dev) |
| `npm.cmd run test:postgres` | Reintento final: 1/1 aprobado, escritura/lectura dentro de transacción real, rollback y ausencia del registro después; permisos restringidos y cierre del pool. Fallo histórico 28P01 resuelto |
| Mailpit | ZIP 1.31.3 verificado contra SHA256 publicado en GitHub Releases; EXE validado por script de inicio; captura local satisfecha |
| `npm.cmd run test:crypto-mail` | **2/2**: Argon2id m=19456 KiB, t=2, p=1, verifica clave correcta y rechaza distinta; SMTP loopback y mensaje ficticio encontrado vía API Mailpit |
| Repetición tras `npm ci` | Builds, 2 smoke, generación Prisma y 2 pruebas crypto/mail volvieron a pasar |
| `npm.cmd run verify:v00` | Reintento final exit 0: builds, dos smoke, generación, conexión/permisos, migración, un test PostgreSQL y dos crypto/mail; cinco pruebas aprobadas |
| Auditoría | 4 paquetes con severidad alta; tres avisos subyacentes, detalle abajo. No se declara auditoría limpia |

Mailpit iniciado en esta ejecución por `ops/local/start-mailpit.ps1` (PID observado 18520);
puertos 1025/8025 solo en 127.0.0.1, sin relay/forwarding, destinatarios `@example.test`.
El PID es evidencia histórica, no permiso para detener otro proceso con ese número después.
El script verifica ejecutable y rechaza puertos ocupados. No se borraron mensajes existentes.

La migración crea solo CompatibilityProbe y el historial Prisma en la base de ensayo;
ningún modelo de identidad. No se ejecutaron pruebas destructivas sobre academia_dev.
No hay prueba aprobada de capacidad, funcionalidad de identidad, recuperación operativa o Linux.

## Versiones realmente instaladas

Fuente: `npm.cmd ls --depth=0`, binarios locales y respuesta SQL limitada a versión.
Lockfile v3 conserva versiones/integridad reproducibles; las ranges de manifests se resuelven
por ese lockfile durante `npm ci`.

| Componente | Versión |
| --- | --- |
| Node / npm | 22.23.1 / 10.9.8 |
| TypeScript / Vitest | 6.0.3 / 5.0.2 |
| Nest common/core/platform-express/testing | 12.1.0 |
| React / react-dom | 19.3.0 |
| Vite / plugin-react | 8.3.1 / 6.1.1 |
| Prisma CLI/client/adapter-pg | 7.10.0, coherentes |
| pg | 8.23.0 |
| PostgreSQL | cliente y servidor 16.14 |
| Argon2 / Nodemailer | 0.45.1 / 10.0.11 |
| reflect-metadata / rxjs | 0.2.2 / 7.8.2 |
| Mailpit Windows amd64 | 1.31.3; ZIP/EXE SHA256 en native.md |

Esta combinación está validada para V00 nativo Windows con el lockfile actual. La
instalación reproducible fue verificada antes del reintento final; verify:v00 completo
añadió transacción/rollback y repitió las comprobaciones. No acredita Linux ni producción.

## Incidentes resueltos dentro del bloque

- npm inicialmente no pudo validar la cadena TLS. Se usó `NODE_OPTIONS=--use-system-ca`
  solo en el proceso/terminal; TLS siguió activo y no se modificó configuración global.
- Un intento inicial con Vitest 4 produjo error interno de resolución npm (`edgesOut`).
  Se fijó Vitest 5.0.2 compatible con Vite 8 antes de la primera instalación exitosa.
  Esto ocurrió en la preparación anterior; en este cierre no se cambió ninguna major.
- Build/runner dentro del sandbox devolvieron `spawn EPERM`; las mismas comprobaciones
  autorizadas fuera del sandbox pasaron. No era una incompatibilidad demostrada de Windows.
- La prueba Argon2 asumía el orden PHC `m,t,p`; la librería serializa `m,p,t`. Se corrigió
  la comparación para verificar algoritmo, versión y mapa de parámetros sin mostrar
  salt/hash/contraseñas. Los parámetros y controles se conservan.
- `prisma.config.ts` leía una URL heredada sin validar ante invocación directa del CLI.
  Ahora reutiliza `probeUrl('migration')`; solo generate se permite sin conexión. El
  cargador exige base, rol, host, puerto y protocolo exactos, sin parámetros ni fragmentos.
  `probe:check` hace consultas de solo lectura y emite solo estados, versión y códigos seguros.

## Auditoría npm — pendiente explícito

`npm audit --json --offline=false` del 2026-09-28 informa cuatro paquetes altos:
prisma, @prisma/config, deepmerge-ts y mysql2. No son cuatro vulnerabilidades independientes.
`npm explain` muestra las cadenas:

- prisma 7.10.0 → @prisma/config 7.10.0 → deepmerge-ts **7.1.5**.
- prisma 7.10.0 → mysql2 **3.15.3**.

| Aviso | Evaluación y siguiente acción |
| --- | --- |
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | Recursión no acotada al fusionar objetos cíclicos; corregido en deepmerge-ts 8.0.0. La configuración actual es local y no recibe grafos del usuario, lo cual limita exposición pero no elimina el aviso. Una sustitución major necesita consulta y pruebas. |
| [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) | mysql2 puede degradar autenticación y revelar clave a servidor MySQL malicioso; afecta <3.22.0. El proyecto usa PostgreSQL/pg, sin conexiones MySQL. No se declara corregido. |
| [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) | Descompresión no acotada en protocolo MySQL comprimido, afecta <=3.23.0. No se usa ese protocolo en V00; permanece en el árbol de Prisma CLI. |

Prisma CLI está declarado como herramienta de desarrollo; la instalación incluye estos
paquetes transitivos. No se ha verificado todavía su exclusión del artefacto Linux final.
El arreglo automático sugerido por audit cambia Prisma a 6.19.3 (major distinta): **no se
aplicó**. Tampoco se añadieron overrides ni se usó `audit fix --force`. Revisar actualización
compatible oficial de Prisma 7 o proponer cambio justificado al responsable; cualquier major
requiere consulta previa. Reauditar y verificar el artefacto antes de producción. Estos avisos
no se ocultan con omisiones del informe ni se confunden con el bloqueo de autenticación.

## Reintento final y precedencia de configuración

El fallo histórico 28P01 no se reprodujo después de la revisión local informada por el
usuario. `probe:check` aprobó ambos roles y `verify:v00` terminó con exit 0.
No se restablecieron claves ni recrearon bases/roles; el agente no editó `.env.test`.
No se atribuye la causa exacta a una clave o codificación concreta sin evidencia.

Revisión del cargador: `env.mjs` resuelve `.env.test` desde import.meta.url, lee el archivo
y usa el objeto devuelto por parseEnv directamente. No combina esos valores con process.env;
una variable PROBE_DATABASE_URL heredada no prevalece. Prisma config reutiliza el mismo
cargador para migraciones. Los destinos permanecen restringidos a academia_v00_test,
owner para migraciones y runtime para transacciones. No fue necesario cambiar código.

Mailpit existente respondió v1.31.3 y se reutilizó sin reiniciarlo. La comprobación de
permisos del runtime confirmó ausencia de superusuario/CREATEDB/CREATEROLE/BYPASSRLS,
sin CREATE de esquema y sin CONNECT a academia_dev; probe:check añade NOREPLICATION.
El ensayo usa UUID nuevo y revierte su única escritura; no elimina filas preexistentes.

La creación y permisos de academia_dev proceden de evidencia del responsable; no se
conectó ni se ejecutaron pruebas destructivas allí. El alcance de ejecución verificado
es la base aislada de V00. No queda intervención de autenticación pendiente para V00.

## Estado de tareas

- **Completadas con evidencia:** T003–T008 (seis tareas de la ruta nativa).
  En este reintento se cierran T004, T006 y T008; T003/T005/T007 ya estaban verificadas.
- **V00 nativo aprobado**, sin equivaler a auditoría limpia ni aprobación de producción.
- **Diferidas y sin marcar:** T001/T002 Docker/WSL Windows. Compose tampoco se declara
  realizado. V00-L Linux queda pendiente según R12, temprano y antes de US1/producción.
- T009 en adelante e historias funcionales no iniciadas. Izipay, video y pruebas de carga
  fuera de este bloque; se conserva investigación temprana de video independiente.
