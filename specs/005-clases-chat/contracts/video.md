# Contrato del ensayo YouTube — 005

2026-11-17. Alcance V05/constitución 2.0.0 aprobado por el responsable; **diseño
sin implementación ni prueba real**. Cloudflare y distribución HLS propia quedan
fuera del MVP. Referencias del proveedor no son secretos ni acceso exclusivo.

## Superficie propia y autorización

Rutas bajo `/api/v1`, JSON estricto 16 KiB, cookie/origen/CSRF existentes.
No OAuth, YouTube Data API, credenciales de emisión o tráfico de video a través
del backend. Emisión y detención en YouTube/OBS son operaciones manuales.

| Método/ruta | Contrato |
| --- | --- |
| GET /classes/sessions/:classId/video-reference | Solo gestor actual. Configuración propia y revisión, incluso histórico permitido; sin credencial externa. |
| PUT /classes/sessions/:classId/video-reference | Solo gestor actual, clase PREPARED/LIVE, grupo no cancelado. `{commandId,expectedRevision,videoId}`; videoId null retira asociación, no detiene YouTube. |
| GET /classes/sessions/:classId/video | Participante con permiso vigente. LIVE configurada devuelve referencia de prueba; no entrega ID en otros estados o sin derecho. |

Permisos: manage-all ADMIN, manage-own TEACHER propio habilitado. Alumno nunca
escribe configuración. Autoridad de referencia no depende de creador original.
PUT compara revisión de referencia independiente de revisión de clase/chat, usa
ledger compartido y clase UPDATE; genera VIDEO_REFERENCE_CHANGED sin secretos.
Registro actor/fecha/resultado y evento se confirman juntos. Comando repetido no
vuelve a emitir evento; digest distinto produce IDEMPOTENCY_CONFLICT.

`videoId`: null o string de **11 caracteres ASCII `[A-Za-z0-9_-]`**, sin trim o
conversión implícita. La UI solicita solo ID, no URL, HTML, playlist o streamKey.
El backend no visita direcciones del cliente ni certifica existencia/disponibilidad
del ID. Enlace/iframe se construyen exclusivamente desde el ID validado.
Se prueba que queries, `javascript:`, hosts ajenos, rutas y atributos HTML son rechazados.

Vista gestor: `{classId,provider:'YOUTUBE_DEMO',videoId,revision,updatedAt}`.
Sin fila todavía: videoId null, revision `'0'`, updatedAt null; primera escritura
crea revisión 1. Fila persistida usa revisión positiva; retirar deja videoId null
y aumenta revisión, sin borrar trazabilidad o alterar estado de clase.

GET video, tras autoridad actual y decisión exacta:

- LIVE con ID: `{status:'CONFIGURED',provider:'YOUTUBE_DEMO',videoId,revision,
  checkedAt,externalAccessLimited:true}`. CONFIGURED permite intentar reproducción;
  no afirma señal disponible, video existente o player reproduciendo.
- LIVE sin ID: `{status:'NOT_CONFIGURED'}`, sin referencia.
- PREPARED/FINISHED con contexto autorizado: `{status:'CLASS_NOT_LIVE'}`, sin ID.
- Recurso ajeno/no visible/cancelado o matrícula vencida: NOT_FOUND seguro; sesión
  ausente/revocada: AUTH_REQUIRED. Recurso desconocido es indistinguible de ajeno.

GET video y GET changes son consultas pasivas: no llaman accept ni renuevan
inactividad. La política se fija en servidor por ruta/método, no por flag cliente.
GET de configuración es lectura intencional y PUT sigue aceptación existente.
Todo DTO/lectura/command replay se reautoriza; no almacenar autorización positiva.

## Reproductor y detección de pérdida de acceso

La UI obtiene ID solo desde GET video autorizado. Construye iframe HTTPS
`https://www.youtube.com/embed/{videoId}` con `enablejsapi=1`, `origin` exacto de la
aplicación, `autoplay=0` y controles del proveedor; no recibe HTML arbitrario.
Usa API IFrame oficial cargada desde `https://www.youtube.com/iframe_api`, con
timeout y carga única. Contenedor responsive de al menos 200×200 cuando visible,
título accesible y acción explícita para reproducir; no cubrir controles del player.
No modificar UI/cookies del proveedor para presentar una protección inexistente.

Eventos oficiales onReady/onStateChange/onError ayudan a distinguir inicialización,
reproducción, pausa, buffering, final de señal/error. onReady no significa que esté
reproduciendo; PLAYING observado tampoco demuestra fluidez prolongada o capacidad.
Error de embedding/origen/referer se muestra recuperable; no degradar a proxy del
video, scraping o descarga de segmentos para evitar restricciones del proveedor.

Cada 5 s mientras el aula está visible, revalidar GET video con una solicitud en
vuelo/backoff. Al recibir cambio de referencia o cierre desde delta, retirar el
player antes de consultar otra referencia. Al ocultar página, perder conexión
autoritativa/permiso, recibir 401/404/CLASS_NOT_LIVE, iniciar logout o cambiar
generación, destruir player/iframe y descartar callbacks/respuestas anteriores.
Al volver a la página, reautorizar antes de montarlo; no reconectar automáticamente
después de nuevo login o reusar un ID de otra cuenta.

UI: «Video de prueba con YouTube. Su enlace puede compartirse fuera de la plataforma».
No promete corte externo ni control de manifiestos/segmentos. El intervalo de
detección del cliente no sustituye la autorización exacta de cada nueva entrega propia.
El responsable detiene señal manualmente en YouTube al finalizar; finalizar clase
no espera una confirmación automática inexistente ni revierte si la señal continúa.

## CSP, cabeceras y privacidad

Extensión mínima de CSP: `script-src` permite origen HTTPS `https://www.youtube.com`
para API/widget; `frame-src https://www.youtube.com`; sin wildcard, unsafe-inline
o unsafe-eval, manteniendo las restantes directivas. La SPA comparte esa allowlist;
no se agregan otros orígenes ni se carga el proveedor en otras pantallas. La carga ocurre solo
al montar player autorizado, no al entrar a cualquier página. Mantener navegación
y chat funcionales si la carga externa falla. El player requiere identificación
de origen/referer; para iframe se propone `referrerPolicy='strict-origin'`, sin ruta
o query privadas. Revisar la política efectiva y error 153 en navegador real; no
confundir un doble de API con comprobación de cabeceras o reproducción del proveedor.

El video viaja del proveedor al navegador, nunca desde el VPS de Academia como
relay. No usar Google Analytics, chat YouTube o grabación automática como parte
del incremento. Logs propios no incluyen ID/enlace privado de ensayo, cookies,
texto libre o credenciales; el ID no se trata como contraseña de acceso exclusivo.

## Pruebas y respaldo

Unitarias/PG/HTTP/E2E: matriz propia de permisos y exactitud μs, revisión/replay,
set/clear, rechazo de HTML/URL, cambio docente, fin de clase, player tardío/timeout,
logout y CSP. Dobles del player prueban interfaz y teardown, **no YouTube real**.
Prueba humana/autorizada separada confirma emisión/reproducción y limitación de
referencia externa compartida. Cuenta/señal disponibles siguen siendo prerequisitos
reales; no se declara G-V005 pasado por completar este contrato.

Backup conserva solo referencia/revisiones/atribución/eventos; no contiene video,
cuenta YouTube, grabaciones o señales. Tras restore, accesos propios invalidados,
player no se monta sin nueva autorización y no inicia emisión automáticamente.
D13 y acuerdos externos siguen pendientes; no se restaura ni reabre por el borrador.

Fuentes oficiales consultadas para el diseño: [IFrame API](https://developers.google.com/youtube/iframe_api_reference),
[parámetros](https://developers.google.com/youtube/player_parameters).
La [privacidad de YouTube](https://support.google.com/youtube/answer/157177?hl=es)
explica el límite del enlace; no se atribuye autorización por matrícula al proveedor.
