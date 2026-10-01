# Investigación y decisiones de identidad

Fecha: 2026-09-23. Estado: decisiones de diseño, sin implementación ni pruebas de capacidad.
Revisión de fuentes y coherencia: 2026-09-24. Versiones candidatas; compatibilidad práctica pendiente.
Entrada: [especificación](spec.md), checklist revisado y constitución 1.1.0.
Las fuentes oficiales se consultaron en esta fecha; los parámetros del proyecto que se
indican a continuación son decisiones propias y deberán verificarse en implementación.

**Actualización R12 — 2026-09-27:** desarrollo nativo Windows con Node, PostgreSQL 16.14 y Mailpit. Docker/WSL pendientes, fuera de la ruta crítica local; causa del incidente de arranque no determinada. Docker en Linux se conserva para despliegue futuro. V00-L se verifica temprano, tras V00 y antes de US1/T031 (checkpoint T030), sin contratar servicios. Procedimiento vigente: [native.md](../../ops/local/native.md); resultados: [compatibility.md](../../ops/local/compatibility.md). No se modifica el alcance funcional ni se afirma capacidad demostrada.

## R01 — Runtime y estructura para una sola persona

**Decisión de estructura y versiones candidatas:** monorepositorio con npm workspaces:
`apps/web` y `apps/api`, monolito modular con las capas internas descritas en [plan.md](plan.md).
React 19, Vite 8,
NestJS 12 con adaptador Express, TypeScript 6 en modo estricto y ESM; Prisma 7 con
`@prisma/adapter-pg` y `pg`; PostgreSQL 16.14 nativo según R12. Usar Node 22.23.1 y npm 10.9.8, presentes en el
equipo, como línea base inicial. Mantener coherentes las versiones de Prisma CLI/client/adapter.
Fijar parches concretos en `package-lock.json` y digests de imágenes al implementar, después
de verificar instalación/build/test en Windows. No se ejecutan generadores ni instalaciones aquí.

**Justificación:** el Node observado supera los mínimos citados de runtime y generadores,
pero esto no demuestra que todos los paquetes funcionen juntos. Su actualización no es
un prerrequisito para cerrar el plan. ESM evita mezclar convenciones con
el cliente Prisma elegido. Se excluyen Nx, servicios de identidad externos y microservicios.
Prisma 7 continúa soportado según su documentación; se prefiere una línea explícita a `latest`.

**Alternativas:** Node 24 LTS es una actualización posible durante mantenimiento; no es un
bloqueo actual. Varios repositorios y orquestación adicional elevan el trabajo para una persona.

Fuentes: [Nest: requisitos](https://docs.nestjs.com/first-steps),
[Nest 12](https://docs.nestjs.com/migration-guide),
[Vite 8](https://vite.dev/blog/announcing-vite8),
[Prisma 7 y ESM](https://docs.prisma.io/docs/orm/v6/more/upgrades/to-v7),
[línea Prisma 7 soportada](https://www.prisma.io/docs/prisma-orm/quickstart/postgresql),
[versiones PostgreSQL](https://www.postgresql.org/support/versioning/).

### Requisitos oficiales contrastados en la revisión

| Componente candidato | Evidencia oficial y límite de la conclusión |
| --- | --- |
| Node 22.23.1 / npm 10.9.8 | Versiones observadas localmente el 2026-09-23. Su presencia no acredita instalación de dependencias ni conexión a BD. |
| NestJS 12 / Express | La [guía oficial](https://docs.nestjs.com/migration-guide) distingue runtime Node 20.19+ o 22.12+ y generadores 22.22.3+, 24.15+ o 26+. Describe ESM, TypeScript 6 y transición a Vitest. Mantener majors compatibles entre paquetes Nest y su adaptador. |
| React 19 / Vite 8 | La [página de versiones de React](https://react.dev/versions) documenta React 19; [Vite](https://vite.dev/guide/) exige Node 20.19+ o 22.12+ y advierte que las plantillas pueden elevar el requisito. React/react-dom y el plugin React de Vite deben validarse en la instalación concreta. |
| TypeScript 6 | Las [notas oficiales](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) documentan cambios de resolución y tipos. Probar `NodeNext` en backend y resolución `bundler` en frontend, tipos explícitos y metadatos de decoradores con el runner; no se considera validado por fijar la major. |
| Prisma 7 / adapter-pg / pg | La [migración oficial a v7](https://docs.prisma.io/docs/orm/v6/more/upgrades/to-v7) declara Node mínimo 20.19 y TypeScript mínimo 5.4, recomienda 5.9 y exige revisar ESM, adaptadores y configuración. Ese mínimo no certifica TypeScript 6 con el cliente generado. Fijar y probar CLI/client/adapter de la misma versión compatible. |
| PostgreSQL 16.14 nativo / 16 en Linux futuro | La [política oficial](https://www.postgresql.org/support/versioning/) mantiene la rama 16; verificar cliente/servidor local y fijar después parche/digest Linux y [directorio de datos de su imagen](https://hub.docker.com/_/postgres). La conexión mediante el adaptador elegido sigue pendiente. |

Los mínimos documentados son restricciones individuales, no una matriz de compatibilidad
probada. Los otros paquetes (Argon2, Nodemailer, Vitest, Supertest, Playwright y herramientas
de lint) también necesitan versiones concretas y comprobación de `engines`/peer dependencies.
No aceptar una instalación con `--force` o `--legacy-peer-deps` para ocultar incompatibilidades.
La primera tarea futura del [quickstart](quickstart.md) producirá esa evidencia, lockfile y
decisión final de versiones. Si falla, ajustar la combinación y registrar el motivo antes
de desarrollar casos de uso; no cambiar las reglas de comportamiento aprobadas.

## R02 — Sesiones opacas persistidas

**Decisión:** identificador aleatorio de 32 bytes generado con `node:crypto`, enviado solo
en cookie HttpOnly; en PostgreSQL se guarda su SHA-256, usuario, versión de autorización,
inicio, última actividad aceptada, expiración absoluta y revocación. El backend consulta la
base primaria en cada operación protegida. No se conservan permisos en un caché de proceso.

**Justificación:** permite revocación, reinicios y varias sesiones por cuenta sin un segundo
servicio. Se cumplen 30 minutos de inactividad y 8 horas absolutas. Logout revoca una sesión;
reset, desactivación y cambio real de rol revocan todas. Un nuevo login genera otro secreto.

**Alternativas:** JWT con refresh exige resolver igualmente revocación y rotación; el store
en memoria incumple persistencia. `express-session` con PostgreSQL sería válido, pero una
tabla explícita con Prisma evita duplicar modelos para los estados específicos de esta función.

Fuentes: [OWASP sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[Nest sesiones](https://docs.nestjs.com/techniques/session).

## R03 — Un origen, cookies y CSRF coherentes

**Decisión:** la SPA usa `/api/v1` relativo. Vite proxifica `/api` en desarrollo; en publicación
futura Nginx sirve SPA y API bajo un único origen HTTPS. No habilitar CORS. Producción:
`__Host-av_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`. Local HTTP
exclusivamente loopback: `av_session_dev`, HttpOnly/Lax, sin Secure; nunca usar ese modo en
producción. Borrar cookies con los mismos atributos y no guardar la sesión en Web Storage.

Todas las mutaciones, incluidas registro, login, enlaces y logout, exigen JSON,
`X-CSRF-Protection: 1` y `Origin` exactamente igual a `APP_ORIGIN`; rechazar origen ausente,
`null` o externo y `Sec-Fetch-Site: cross-site` si está presente. No aceptar formularios
simples ni emitir permisos CORS en preflight. La cabecera fija no es un secreto: esta defensa
depende del navegador, del origen verificado y de mantener CORS cerrado. No existe token
CSRF de sesión ni sesión anónima en este diseño. Los tests y k6 envían los mismos encabezados.

**Alternativas:** token sincronizador es válido, pero añade sesiones previas al login y
rotación innecesarias para esta API exclusivamente JSON. SameSite por sí solo no basta.
Si se cambia a orígenes separados, se debe revisar este diseño antes de habilitar CORS.

Fuente: [OWASP: encabezados para AJAX/API](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#employing-custom-request-headers-for-ajaxapi).

## R04 — Contraseñas y presupuesto de cómputo

**Decisión:** Argon2id mediante biblioteca mantenida, salt por contraseña, formato codificado
con parámetros; inicio `m=19456 KiB`, `t=2`, `p=1`. Validar 12–128 caracteres Unicode, sin
trim ni truncado de contraseña; nombre 1–100 y correo hasta 254. Limitar cuerpo JSON a 16 KiB.
Usar comprobación ficticia de hash para identidades inexistentes y trabajo equivalente para
desactivadas/no verificadas; errores públicos indistinguibles. Limitar inicialmente a dos
hashes simultáneos y una espera máxima de 50 solicitudes por proceso, hasta 5 s; saturación
devuelve error genérico 503. Medir antes de ajustar; no bajar parámetros para lograr carga.

**Justificación:** las contraseñas requieren un hash costoso; SHA-256 solo se usa para secretos
aleatorios de alta entropía. No se cifran contraseñas de forma reversible.

**Alternativas:** bcrypt tiene restricciones de longitud en bytes que complican el requisito
de 128 caracteres; SHA-256 y texto claro no son opciones. El límite de CPU es protección de
recursos, no persistencia de sesiones ni autorización.

Fuente: [OWASP contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## R05 — Transacciones y revocación bajo concurrencia

**Decisión:** `authVersion` monotónica en cuenta y copia en sesión. Hash costoso fuera de la
transacción; al finalizar login se bloquea la cuenta y se comprueba nuevamente hash/versión,
estado, verificación y cambio inicial antes de insertar sesión. No basta el chequeo anterior
al hash. Reset, cambio de rol y desactivación incrementan versión y revocan sesiones en una
sola transacción; éxito HTTP solo después de commit.

Orden estable: fila singleton de gobierno, si aplica; usuarios por UUID ordenado; sesiones
y tokens; entregas de correo. Cambios administrativos revalidan también al actor dentro de
la transacción. Las lecturas consultan datos actuales; las escrituras protegidas repiten
validación bajo bloqueo. No mantener transacciones durante SMTP ni cálculo Argon2.
Reintentar deadlock/conflicto transaccional como máximo dos veces con espera breve y aleatoria;
las operaciones tienen que conservar idempotencia. Si falla, rollback y 503 sin detalles SQL.

**Alternativas:** comprobaciones de existencia fuera de transacción permiten carreras.
Singleton solo serializa bootstrap/cambios de roles o estados, no todo el tráfico de perfiles.
Las consultas SQL necesarias para bloqueos se parametrizan y permanecen en persistencia.

Fuentes: [bloqueos PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html),
[aislamiento](https://www.postgresql.org/docs/17/transaction-iso.html).

## R06 — Enlaces y credencial inicial

**Decisión:** enlaces con 32 bytes aleatorios y propósito; hash en BD, verificación 24 h y
reset 30 min, un único token vigente por cuenta/propósito. Emisión nueva revoca el anterior;
reintento SMTP reutiliza el mismo token. Consumir y modificar cuenta son una sola transacción.
Una contraseña inválida no consume el token; reset invalida sesiones y credencial inicial.

URL de la SPA con fragmento `#token=...`, generado desde `APP_ORIGIN`, nunca desde `Host`.
Leer fragmento en memoria, limpiar URL, confirmar con POST; GET no consume enlaces, evitando
que un escáner de correo realice acciones. `Referrer-Policy: no-referrer`, sin analítica en
esas pantallas. La credencial provisional se recibe por canal privado, se guarda solo como
hash Argon2id, vence en 24 h y sirve exclusivamente para establecer contraseña propia.

**Alternativas:** auto-login tras reset y contraseñas por correo incumplen el aislamiento
de propósitos. No se implementa recuperación manual de un buzón perdido.

Fuente: [OWASP recuperación](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## R07 — Correo local y futura salida SMTP

**Decisión:** Mailpit como servicio local de Docker Compose, SMTP 1025/UI 8025 publicados
solo en `127.0.0.1`; sin relay, forwarding ni credenciales reales. Un puerto interno `Mailer`
y adaptador SMTP con Nodemailer separan transporte de identidad. No se añade servicio remoto.
Producción se habilitará por configuración con SMTP autenticado, TLS validado y remitente
autorizado; bloquear el arranque en modo producción si faltan condiciones seguras.

**Pendientes externos:** proveedor, tarifas, cuota/velocidad, sandbox y destinatarios,
dominio/remitente, SPF/DKIM/DMARC, acceso de red desde alojamiento y gestión de rebotes.
Son bloqueos de publicación, no del diseño ni desarrollo con Mailpit. No se presupone una
cuota gratuita; correo debe caber en S/300 junto con despliegue, video y pruebas del proyecto.

**Alternativas:** envío directo real en desarrollo expone a destinatarios; un proveedor
acoplado a identidad dificulta reemplazarlo. Izipay no participa en este módulo.

Fuentes: [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/),
[opciones de Mailpit](https://mailpit.axllent.org/docs/configuration/runtime-options/),
[SMTP Nodemailer](https://nodemailer.com/smtp).

## R08 — Envío fuera de la solicitud, sin broker externo

**Decisión:** `MailDelivery` persistida en PostgreSQL en la misma transacción que el token.
Ejecutor interno del monolito consulta cada 5 s y reclama hasta dos entregas mediante lease
de 60 s y `SKIP LOCKED`; envía fuera de la transacción con timeout total de 20 s.
Tres intentos totales: primero disponible, +60 s y +300 s tras fallo transitorio. Fallos
permanentes, enlace obsoleto, cuenta inactiva o vencimiento cancelan; no hay bucles infinitos.
Si el proceso reinicia, recupera leases vencidos sin exceder el contador de intentos.

Solo el hash no permite reconstruir un enlace: el payload pendiente se cifra con AES-256-GCM,
nonce aleatorio, `keyId` y clave externa a BD/repositorio. Se borra al terminar/cancelar/expirar.
No se guarda contraseña en payload. Antes de cada envío se revalida vigencia; una revocación
que ocurra después de esa comprobación podría entregar un enlace ya inválido, pero consumirlo
siempre falla. SMTP puede duplicar la entrega del mismo enlace si cae después de aceptarlo;
no se promete entrega exactamente una vez, solo consumo único.

**Justificación:** la cuenta no espera al servidor de correo y los trabajos sobreviven
reinicios. `202` confirma recepción de solicitud, no entrega. No se crean workers separados.
Esto es una tabla operativa acotada para un único propósito, no una plataforma general de colas.

**Alternativas:** envío síncrono ralentiza el registro; promesas en memoria pierden envíos;
Redis/BullMQ o broker remoto añaden servicio, operación y costo sin necesidad demostrada.

Fuentes: [PostgreSQL SKIP LOCKED](https://www.postgresql.org/docs/17/sql-select.html),
[SMTP y timeouts](https://nodemailer.com/smtp),
[cifrado autenticado en Node](https://nodejs.org/api/crypto.html).

## R09 — Límites persistentes y prevención de enumeración

**Decisión:** contadores/ventanas persistentes en PostgreSQL, también para correos inexistentes;
claves HMAC de correo normalizado y origen de red, con secreto externo. No confiar en
`X-Forwarded-For` salvo proxy configurado y cerrado al público. Ventanas móviles: últimos
15 min para login y última hora para correo. Serializar por claves de límite para evitar
que envíos simultáneos superen el umbral; borrar eventos al dejar de ser necesarios.

Cumplir cinco fallos/15 min por correo-origen y bloqueo de esa combinación por 15 min;
para correo, un envío/minuto y cinco/hora por destinatario y propósito, veinte/hora por
origen. Cada solicitud admitida reserva cuota aunque no exista cuenta o SMTP falle.
Hay buckets separados para admisión pública y envío SMTP, con los mismos límites, para
no contar dos veces el primer envío. Reintentos internos del mismo mensaje no crean token
nuevo; reservan cuota SMTP antes de contactar transporte, posponiéndose hasta disponibilidad.
No consumir un intento SMTP hasta contactar transporte. No prolongar tokens por esperar cuota.

**Justificación:** resultado público y límites no dependen de existencia de usuario. Registro,
reenvío y solicitud de reset devuelven el mismo 202 genérico, salvo validación, límite o fallo
global. Los límites no son controles suficientes ante todo ataque distribuido; se verificará
capacidad y se evaluarán medidas adicionales solo con evidencia.

**Alternativas:** solo memoria pierde límites al reiniciar; contadores solo para usuarios
existentes exponen existencia. No se desactiva una cuenta por intentos públicos fallidos.

Fuente: [OWASP autenticación](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

## R10 — Pruebas, operación y capacidad

**Decisión propuesta, pendiente de prueba de herramientas:** Vitest para unidades de dominio
y componentes, Supertest contra Nest y PostgreSQL
real para integración/contratos, Playwright para navegador y k6 para carga HTTP de identidad.
Mailpit permite inspeccionar destinatarios y mensajes sin enviar correo real. La guía define
bootstrap restringido, migraciones revisadas, backup/restauración y validación de actualización.

**Justificación:** mocks de BD no prueban unicidad, locks ni consumo único. Mil usuarios
virtuales no representan automáticamente mil accesos/segundo. Se medirá sesión/perfil con
cuentas distintas y login gradual, además de un escenario específico de login. No se ejecutó
ninguno; no se extrapola a matrícula, chat ni consumo HLS.

**Alternativas:** solo pruebas unitarias dejan sin verificar garantías de concurrencia;
una carga única mezclada con video dificultaría atribuir los límites de identidad.

Fuentes: [k6 escenarios](https://grafana.com/docs/k6/latest/using-k6/scenarios/),
[persistencia de cookies entre iteraciones](https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/#no-cookies-reset).
ID-LOAD-01 requiere `noCookiesReset: true` para representar una sesión continua por VU;
el valor por defecto reinicia las cookies al terminar cada iteración.

## R11 — Disponibilidad real del entorno y continuidad del proyecto

**Decisión:** no instalar ni habilitar componentes en esta etapa. Node/npm/Git existen;
Docker CLI/Desktop/servicio no se encontraron. WSL 2.7.10.0 está instalado, pero informa
que WSL2 no puede arrancar por virtualización no habilitada. CIM informa firmware virtualizado
y SLAT disponibles, pero hipervisor no presente: hace falta revisar los componentes de
Windows/arranque, no asumir que basta cambiar BIOS. No hay distribuciones WSL instaladas;
una distribución de usuario no es requisito independiente si Docker gestiona su backend.
Evidencia completa y comprobaciones de salida en [quickstart](quickstart.md).

**Decisión histórica sustituida por R12:** Compose era el camino local; ahora PostgreSQL y
Mailpit nativos desbloquean el desarrollo autorizado. No se concluye incompatibilidad de
Docker/WSL con el hardware ni se vuelve a modificar Windows.

Se mantiene una investigación temprana independiente de video (D07–D09), antes de cerrar
alojamiento y antes de terminar identidad. Medir emisión, autorización HLS, ancho de banda,
costo y limitar conclusiones al escenario medido. Este plan no contrata ni implementa video.

Fuente: [Docker Desktop en Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## R12 — Windows nativo y validación Linux temprana

El usuario autoriza PostgreSQL 16.14 ya instalado, Node 22 y Mailpit portátil. Se evita
intervenir de nuevo en el arranque y no se añade costo de servicios. Prisma soporta
PostgreSQL 16; su conexión/transacción real sigue siendo requisito V00. Se mantienen
ESM, capas del monolito y separación de entornos. Bases academia_dev/academia_v00_test,
propietario de migración y runtime restringido distintos por base; nunca postgres en runtime.
T001/T002 conservan sus IDs y casillas pendientes, diferidas fuera de la ruta local.
T003 puede comenzar con Node/npm disponibles; T005 y T007 son independientes de las
credenciales SQL. T006/T008 siguen requiriendo PostgreSQL real y toda la evidencia.

Docker en Linux permanece como camino futuro, con V00-L inmediatamente tras V00 local
y antes de US1/T031, registrado en T030. Usar misma major PostgreSQL 16 para reducir
diferencias; ninguna prueba Windows acredita contenedores Linux. No contratar alojamiento.
Fuentes: [PostgreSQL soportado por Prisma](https://www.prisma.io/docs/orm/reference/supported-databases),
[Mailpit nativo](https://mailpit.axllent.org/docs/install/),
[opciones Mailpit](https://mailpit.axllent.org/docs/configuration/runtime-options/).
Procedimientos y evidencia en ops/local/native.md, environment.md y compatibility.md.

## Cierre de investigación

Las decisiones de diseño para la fase 1 están expresadas. La combinación de versiones
queda como candidata hasta la primera comprobación práctica, que todavía no se ha ejecutado.
No se repiten Q1–Q3. Los pendientes externos tienen un camino de resolución y criterios de desbloqueo;
no se presentan como servicios instalados, pruebas superadas o costos confirmados.
