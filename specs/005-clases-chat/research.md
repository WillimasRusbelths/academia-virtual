# Investigación y decisiones de diseño — 005

2026-11-17, America/Lima. Lectura de código y documentación oficial; sin instalar
dependencias, ejecutar la aplicación, emitir video o contratar servicios.
Las decisiones técnicas siguientes son propuestas para implementación. V01–V03
siguen siendo las únicas respuestas funcionales del responsable registradas aquí.

## R005-01 — propietarios, sesión y autorización

**Decisión**: nuevo módulo `classes`; participantes públicos específicos de oferta
y matrícula, compuestos sobre la misma conexión. Reusar revalidación transaccional
de identidad por inyección; ningún import de infraestructura ajena desde el módulo.

**Razón/evidencia**: `authorization/public/session.ts` define SessionActor y políticas
cerradas. `authorization/application/session-lookup.ts` solo admite las tuplas
de materiales existentes: clases necesita sus propias políticas y matriz, no una
tupla genérica permisiva. `identity/infrastructure/session-store.ts` revalida
User→Session, authVersion/rol/estado y expiración; no renueva por revalidar.
`infrastructure/database/materials-transaction.ts` demuestra el patrón de
descubrimiento/locks/recheck/instante exacto/capacidad temporal. Es referente,
no código que deba importarse desde `classes`.

**Alternativas**: filtrar por catálogo, creador original o cookie al conectar no
demuestra responsabilidad ni vigencia. Reusar nombres de puertos de materiales
acoplaría dos features sin necesidad. No consultar tablas de matrícula desde clases.

## R005-02 — transacciones y tiempo

**Decisión**: coordinador propio en infraestructura sobre `accountTransaction`, con
su único presupuesto de reintentos y locks ordenados. Instante PostgreSQL exacto
en microsegundos después de locks/recheck; `confirmedAt ≤ t < validUntil` original
de 003. No convertir a Date para decidir el límite.

**Razón**: `account-transaction.ts` solo repite abortos conocidos después de rollback
confirmado, nunca COMMIT incierto. Participante temporal de matrícula ya define
esa frontera. Deshabilitar docente no revoca por sí solo la matrícula del alumno.

**Alternativas**: mutex de Node falla con procesos/reinicio; timestamp de cliente,
fecha truncada a milisegundos o vencimiento recalculado cambian reglas de 003.

## R005-03 — una clase en curso y orden de cambios

**Decisión**: estado/revisión de clase, exclusión por grupo bajo lock e índice único
parcial LIVE. Contador de eventos por clase incrementado en la transacción y
`UNIQUE(classId,eventSeq)`. Escrituras toman clase UPDATE desde el inicio, lecturas
SHARE; nunca promover dos lectores a escritores de la misma clase.

**Razón**: dos alumnos poseen cuentas distintas pero compiten por la clase. Una
secuencia global puede asignar valores antes del commit y generar omisiones si
se usa como watermark. El contador bajo lock ordena cambios confirmados.

**Alternativas**: ordenar solo por fecha/UUID no resuelve empates ni commits
invertidos. Promoción SHARE→UPDATE puede producir deadlocks evitables.

## R005-04 — HTTP para texto, Socket.IO para avisos

**Decisión**: HTTP JSON conserva CSRF, comandos/receipts y lecturas autorizadas.
Socket.IO 4.x, transport WebSocket exclusivamente, avisa `sync.required` sin
texto/autor/estado privado; la aplicación obtiene proyección actual por HTTP.
Sin recuperación automática de paquetes ni escrituras offline del socket.

**Razón/fuentes**: Socket.IO preserva orden, pero su entrega por defecto es como
máximo una vez; persistencia/offset de aplicación requieren diseño propio.
[Garantías oficiales](https://socket.io/docs/v4/delivery-guarantees/).
El middleware de conexión se ejecuta una vez, no en cada mensaje posterior.
[Middleware oficial](https://socket.io/docs/v4/middlewares/).
La recuperación de conexión puede conservar paquetes/estado y saltar middleware:
no sustituye autorización ni proyección de ocultaciones.
[Recuperación oficial](https://socket.io/docs/v4/connection-state-recovery/).
Los eventos del cliente pueden almacenarse desconectados; evitar ese mecanismo
para acciones de negocio. [Offline oficial](https://socket.io/docs/v4/client-offline-behavior/).

**Alternativas**: broadcast directo de texto entrega información a sockets con
autorización vieja y complica ocultación. Solo polling sería viable como degradación,
pero los avisos reducen espera normal; se deberá medir el costo de lecturas por fanout.
WebSocket bruto no prueba protocolo Socket.IO. Gateway Nest es alternativa si
se justifica; no se necesita añadir dependencias de gateway para el diseño elegido.

## R005-05 — origen y ticket de conexión

**Decisión**: endpoint POST con controles HTTP existentes emite ticket opaco
aleatorio, uniuso, 30 s, ligado a sesión/authVersion/clase. Solo hash en memoria
acotada del único proceso; el secreto viaja en respuesta no-store y `socket.auth`,
nunca URL. Consumo y cada entrega revalidan permiso actual. Reiniciar invalida
tickets, no mensajes. Cliente obtiene ticket nuevo al reconectar dentro de la
misma generación autenticada; no conserva credenciales de otra sesión.

**Razón**: WebSocket del navegador no admite el mismo header CSRF personalizado
que HTTP. Origin exacto en `allowRequest`, cookie opaca y ticket ligado cierran
esa diferencia; CORS no protege WebSocket.
[CORS y allowRequest oficiales](https://socket.io/docs/v4/handling-cors/).

**Alternativas**: token en query filtraría secretos en URLs/logs. Usar guard HTTP
en socket falla porque `AccessGuard` e interceptor usan `switchToHttp`. Habilitar
polling exigiría otra excepción de transporte; no se introduce para esta etapa.

## R005-06 — replay, cuota y texto

**Decisión**: ledger `(actorId,commandId)` y digest canónico operación/destino/cuerpo;
solo referencias/resultados, sin DTO con texto. Autorizar antes de consultar ledger.
Replay confirmado se resuelve antes de silencio/cuota/estado de envío nuevo;
no reemite ni consume cuota. Intención nueva cuenta confirmados del actor/clase
en `(t−10 s,t]`; incluso ocultos. Diez admitidos, el undécimo se rechaza.

**Razón**: cuota durable compartida entre conexiones y reinicios; leer receipt
no puede recuperar texto que ya fue ocultado. Reloj que retrocede frente a hechos
conocidos falla seguro. Ventana fija o contador local no satisface cualquier intervalo.

**Texto**: puntos de código Unicode (`Array.from(text).length`/`char_length`),
sin normalización NFC implícita. Título trim 1–160, descripción nullable hasta 2000,
mensaje trim 1–1000; rechazar NUL y surrogates sueltos. Contrato de trim idéntico
en web/API/BD. Texto inerte y enlaces sin activación automática.

## R005-07 — ocultación y recuperación

**Decisión**: registro durable SEND/HIDE/MUTE/UNMUTE/estado/textos con referencias,
sin originales serializados. Snapshot consistente con highWatermark y delta por
cursor; cada evento antiguo vuelve a proyectar el estado actual. Tombstone domina
respuestas anteriores en UI; filtros por generación y una sola sincronización.

**Razón**: cursor de mensajes omite ocultaciones posteriores al último mensaje.
Historial de mensajes no cambia orden al ocultar; log de cambios sí registra la
acción. Nuevas consultas/replays omiten texto ocultado incluso para moderador.
Bytes ya autorizados/en tránsito no pueden retirarse; probar el orden lógico y
que una respuesta tardía no restaure texto después de observar su ocultación.

**Alternativas**: borrar mensaje rompe orden/auditoría; guardar DTO completo en
receipt o outbox permite recuperar original. Reproducir paquetes antiguos es inseguro.

## R005-08 — recuperación y recursos

**Decisión**: migración aditiva y dump de BD conjunto; ampliar ensayo aislado de
`ops/recovery` con clases/mensajes/revisiones/moderación/ledgers. Invalidar accesos
restaurados y revisar decisiones perdidas antes de abrir. No reabrir clase o emitir
automáticamente. Sin purga o retención implícita; medir crecimiento del registro.

**Alternativas**: memoria como fuente del chat pierde confirmados; otra base/broker
añade coordinación sin evidencia de necesidad. D13 externo sigue pendiente.

## R005-09 — video, investigación sin decisión sustitutoria

**Decisión**: **G-V005 NO PASADO**, adaptador deshabilitado. DEC01 continúa vigente;
no hay contrato final de emisión/segmentos o aprobación de implementación real.
Sesiones/chat se diseñan como alcance independiente; plan completo sigue parcial.

**Razón/fuentes**: la ayuda de YouTube permite ver/compartir videos ocultos a quien
posea enlace. [Privacidad oficial](https://support.google.com/youtube/answer/157177?hl=es).
IFrame API documenta reproducción/eventos, no autorización por matrícula en cada
entrega. [API oficial](https://developers.google.com/youtube/iframe_api_reference).
Inferencia limitada: iframe oculto detrás de login no cumple FR-008; no se afirma
haber probado todas las opciones de YouTube.

**Alternativas condicionales**: distribuidor externo con autorización vigente en
cada entrega, o SRS/HLS privado con control propio. Ambas requieren revisar DEC01
y medir costo. SRS genera HLS y tiene callbacks; `on_hls` notifica generación,
no autoriza cada descarga. [HLS SRS](https://ossrs.net/lts/en-us/docs/v6/doc/hls),
[callbacks SRS](https://ossrs.net/lts/en-us/docs/v6/doc/http-callback).
Nginx `auth_request` permite subsolicitud de autorización, pero no prueba que la
imagen/proxy actuales lo incluyan o que el origen esté aislado.
[Módulo oficial](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html).
Validar solo `on_publish` no corta emisión abierta de un docente revocado.

**Pendiente real, no resuelto por investigación**: mecanismo/proveedor compatible
y prueba temprana de [G-V005](video-gate.md). Reducir protección exigiría enmienda;
no se propone adoptarla. D07/D08/D10/D13 permanecen abiertos con su alcance propio.
