# Auditoría del seguimiento de identidad

Fecha local: 2026-10-07. Rama: `feat/001-identidad-acceso-roles`.
Implementación auditada: `1040952`, sin cambios locales de código ni pruebas.
Al comenzar, solo `tasks.md` tenía cambios locales sin commit; no había staging.
No se encontraron AGENTS.md aplicables. Esta auditoría no modifica implementación,
configuración del equipo, datos, volúmenes ni resultados anteriores.
El responsable confirmó que no había cambios sin guardar en VS Code antes de editar
tasks.md. Se conservó una copia de sus bytes previos en `.cache/auditoria-seguimiento/`,
ignorada por Git. Se corrigieron las referencias nativas obsoletas de preparación, T030
y T097 conforme al entorno Docker ya aprobado, conservando IDs y dependencias vigentes.

## Discrepancia y procedencia

Los commits `696b488`, `597e530` y `1040952` incluyen respectivamente las casillas
T011–T016, T017–T020 y T021–T023 marcadas. `47c8338` adaptó las tareas a Docker.
La copia local encontrada volvió a instrucciones nativas y casillas anteriores: coincide
en casi todo con el documento anterior a Docker de `ca9372f`, con diferencias en el
encabezado, el resumen y espacios. Git no permite identificar quién o qué editor realizó
esa sustitución sin commit; no se atribuye a una causa no demostrada.

Había además un error independiente en HEAD: la tabla de totales conservaba
«10 completadas (T001–T010), 98 pendientes» pese a sus 23 casillas completas.
Por tanto, los informes y las casillas de los commits coincidían, pero el resumen
versionado y la copia local encontrada estaban desactualizados.

## Matriz de auditoría

Se revisaron las descripciones y restricciones completas, sus dependencias, los modelos,
SQL, adaptadores, helpers de aplicación y aserciones de las pruebas correspondientes.
«Completa» se refiere al criterio de cada fundamento, no a historias o flujos posteriores.

| Tarea | Estado real | Evidencia | Criterio pendiente |
| --- | --- | --- | --- |
| T001 | Completa | [Docker](../../../ops/docker/verification.md), `47c8338` y comprobaciones WSL/hipervisor de esta auditoría | Ninguno del entorno vigente |
| T002 | Completa | [Docker](../../../ops/docker/verification.md), [procedimiento](../../../ops/docker/README.md), `47c8338` y versiones/servicios/volumen/espacio de esta auditoría | Ninguno del entorno vigente |
| T011 | Completa | [Datos](fundamentos-datos.md), `696b488`; environment.ts, prisma.config.ts, plantillas, main/CLI y 23 pruebas environment.spec.ts | Ninguno: entorno explícito, separación de BD/roles/claves, SMTP local, TLS/HTTPS/proxy y ausencia de secretos en Vite |
| T012 | Completa | [Datos](fundamentos-datos.md), `696b488`; modelo User, SQL 0001/0004 y migrations.spec.ts | Ninguno del modelo: UUID, Unicode, canonical UNIQUE, enums, credenciales/provisional/versión, fechas UTC y conservación del correo |
| T013 | Completa | [Datos](fundamentos-datos.md), `696b488`; Session/ActionToken, SQL 0002, migrations.spec.ts y pruebas posteriores de secretos/sesiones | Ninguno del modelo: FK, hashes únicos de 32 bytes, caducidades, estados terminales e índice parcial sin now() |
| T014 | Completa | [Datos](fundamentos-datos.md), `696b488`; AuditEvent/SystemState, SQL 0002 y pruebas de constraints/rollback/singleton | Ninguno del modelo: actor/destino/acciones/resultados, FK sin cascada y marca irreversible |
| T015 | Completa | [Datos](fundamentos-datos.md), `696b488`; SQL 0003, modelos e índices y pruebas de correo/cuotas | Ninguno del modelo: payload/token activos, claim/lease, terminales, intentos 0–3, fases y reservas |
| T016 | Completa | [Datos](fundamentos-datos.md), `696b488`; pool compartido, scripts/CLI y 11 pruebas migrations.spec.ts | Ninguno: generate/deploy, BD vacía/copia ficticia, constraints/índices/FK/rollback; alcance de migrate:dev aclarado abajo |
| T017 | Completa | [Reglas](reglas-credenciales-limites.md), `597e530`; account/access y pruebas; reutilización en aplicación y session-store | Ninguno: validación pura, rol/estado, contraseña 12–128 sin transformación y fronteras 30 min/8 h/24 h/30 min |
| T018 | Completa | [Reglas](reglas-credenciales-limites.md), `597e530`; contratos/adaptadores y 7 pruebas credentials.spec.ts | Ninguno: salt/Argon2id, trabajo ficticio, máximo 2, cola 50/5 s, sobrecarga tipada y secretos/huellas |
| T019 | Completa | [Reglas](reglas-credenciales-limites.md), `597e530`; limits/delivery-policy, pruebas de fronteras y fases en rate-limits.spec.ts | Ninguno: cinco fallos/15 min, bloqueo sin extensión, éxito/reserva 30 s y cuotas de correo 1/min, 5/h, 20/h |
| T020 | Completa | [Reglas](reglas-credenciales-limites.md), `597e530`; rate-store y 12 pruebas PostgreSQL reales | Ninguno: upsert/locks ordenados, reservas vencidas, persistencia con nuevo pool/adaptador, concurrencia equivalente y liberación de locks |
| T021 | Completa | [Sesiones](sesiones-autorizacion-http.md), `1040952`; SessionLookup/session-store y 15 pruebas | Ninguno: consulta primaria, elegibilidad/versión/caducidad, revocación, GREATEST y expiración absoluta invariable |
| T022 | Completa | [Sesiones](sesiones-autorizacion-http.md), `1040952`; permissions, guard, composición y 18 pruebas | Ninguno: denegación por defecto, permisos antes de destinos, ausencia de ciclo y revalidación transaccional ante cambios concurrentes |
| T023 | Completa | [Sesiones](sesiones-autorizacion-http.md), `1040952`; transporte/cookies/filtro/salud y 17 pruebas, más ensayo de Mailpit pausado | Ninguno: JSON 16 KiB, DTO estricto, CSRF/Origin/CORS, cookies, cabeceras, errores/logs seguros y salud sin actividad de sesión |

## Comprobaciones adicionales del entorno

Las primeras consultas WSL/CIM bajo sandbox devolvieron acceso denegado; se repitieron
con permiso de lectura fuera del sandbox y se obtuvieron estos resultados:

| Consulta realizada | Resultado observado |
| --- | --- |
| `wsl.exe --status`, `wsl.exe --list --verbose` | Versión predeterminada 2; docker-desktop Running, versión 2 |
| CIM Win32_ComputerSystem | HypervisorPresent = True |
| CIM Win32_OptionalFeature | VirtualMachinePlatform InstallState = 1; Microsoft-Windows-Subsystem-Linux InstallState = 2 |
| `docker version`, `docker compose version` | Client/Server 29.8.1; Compose v5.5.1 |
| `docker info` con campos seleccionados | Linux, Docker Desktop, kernel 6.18.33.2-microsoft-standard-WSL2 |
| `docker compose config --quiet`, `docker compose ps` | Configuración válida; API, web, PostgreSQL y Mailpit healthy |
| `docker volume inspect` con campos seleccionados | academia-local_postgres_data, driver local |
| CIM Win32_LogicalDisk | C: 228509392896 bytes libres; D: 317017767936 bytes libres, en el instante consultado |

WSL informó también incompatibilidad de WSL1 con la configuración actual. Se registra
esa salida; WSL2 sí está Running. No se habilitó WSL1, reinstaló Docker, modificó BIOS,
reinició Windows ni efectuó una nueva instalación o aceptación de licencia.
Los puertos publicados actuales son 5173/3000/55432/11025/18025, todos en loopback;
5432/1025/8025 corresponden a los servicios dentro de la red de Compose.
La conservación y reutilización del volumen ya constan en la evidencia Docker histórica;
no se repitió down/up ni se recrearon servicios para esta auditoría.

## Límites y regla de seguimiento

Los resultados anteriores de pruebas se reutilizan porque el código y las pruebas actuales
coinciden con los commits verificados. No se vuelven a ejecutar las suites ni se presentan
sus resultados como una ejecución nueva: [datos](fundamentos-datos.md),
[reglas](reglas-credenciales-limites.md) y [sesiones](sesiones-autorizacion-http.md).

T012–T015 modelan persistencia: no completan registro, cambios de acceso, bootstrap,
escritura de auditoría funcional, cifrado ni worker. Esos flujos siguen en sus tareas.
T016 implementa los scripts; generate/deploy están probados. migrate:dev requiere una BD
sombra preparada y validada, y su ejecución sigue sin comprobarse. La descripción de
T016 exige aplicar migraciones versionadas, no ejecutar ese flujo de generación.
T022 tiene un helper transaccional probado; las futuras mutaciones deberán usarlo.
T023 mantiene las rutas de prueba fuera de AppModule. No se cierran V01–V16 ni T087.
Los 1000 usuarios concurrentes continúan pendientes de pruebas de carga.

Antes de informar un bloque completo se deben actualizar sus casillas, enlazar evidencia,
recalcular totales y comparar los IDs marcados con el informe final y el staging.
La sincronización deja T001–T023 marcadas y T024–T108 pendientes: 23 + 85 = 108.
La comprobación documental confirmó 108 IDs únicos, dependencias iguales a HEAD,
35 enlaces locales válidos entre tasks.md y este informe, y `git diff --check` sin errores.
