# Contrato HTTP de identidad — v1

Estado: normativo para la implementación futura; no hay API ejecutándose. Base relativa
`/api/v1`; UTF-8 JSON. Referencias: [modelo](../data-model.md), [pantallas](ui.md),
[decisiones](../research.md). Las rutas no incluyen proveedor de pagos ni recursos académicos.

Revisión: 2026-09-24. Este contrato describe entrada/salida HTTP, no la ubicación de reglas:
controladores validan transporte y adaptan resultados de aplicación; el dominio conserva
invariantes y la infraestructura garantiza su persistencia atómica. Véanse las capas de
[plan.md](../plan.md). Los códigos HTTP no se propagan al dominio ni a los casos de uso.

## Transporte, sesión y seguridad

- SPA/API del mismo origen. Local: `http://localhost:5173`, con proxy Vite a Nest en
  `127.0.0.1:3000`; producción futura: un único origen HTTPS configurado en `APP_ORIGIN`.
  No admitir intercambiar `localhost` y `127.0.0.1` como orígenes equivalentes.
- Toda mutación exige `Content-Type: application/json`, `X-CSRF-Protection: 1` y `Origin`
  exacto de APP_ORIGIN. Se rechazan ausente/null/ajeno y `Sec-Fetch-Site: cross-site`.
  CORS no habilitado: no hay `Access-Control-Allow-Origin`, reflexión ni credenciales
  cross-origin. OPTIONS no concede acceso. GET/HEAD no consume enlaces ni altera cuentas.
- La cabecera CSRF es pública y fija: funciona por la restricción del navegador a cabeceras
  personalizadas cross-origin, junto con comprobación de origen y rechazo de tipos simples.
  No hay endpoint de token CSRF ni credencial de sesión legible por JavaScript.
- Cookie en producción `__Host-av_session`: Secure, HttpOnly, SameSite=Lax, Path=/, sin
  Domain, Max-Age=28800 al acceder, sin extender ese máximo. En desarrollo loopback HTTP:
  `av_session_dev`, mismos atributos salvo Secure. Producción rechaza configuración insegura.
  El servidor aplica adicionalmente inactividad de 1800 s y revocación de BD.
- Login exitoso rota el identificador; no reutiliza cookies propuestas por el cliente.
  Logout elimina cookie con el mismo nombre/path y la revoca. La respuesta no contiene
  token de sesión; no se acepta `Authorization: Bearer` como alternativa.
- `Cache-Control: no-store` para toda identidad; `Referrer-Policy: no-referrer`. No registrar
  Cookie, Set-Cookie, campos de contraseñas, tokens, cuerpos completos ni enlaces.
  Solo IDs de correlación propios; evitar reflejar cabeceras arbitrarias en logs.
- El backend confía en la IP remota. En producción solo acepta forwarding del Nginx conocido,
  con puerto de API no público y sobrescritura de cabeceras de IP en el proxy.

## Formatos y validaciones compartidas

`UserView`: `{id, name, email, role, status, emailVerified, mustSetPassword, createdAt}`.
`role`: STUDENT/TEACHER/ADMIN; `status`: ACTIVE/DISABLED. Sin hash, versión de autorización,
credencial provisional, sesiones o secretos. `/me` siempre corresponde a la cookie y no
acepta `userId` de cliente. Fechas ISO 8601 UTC y UUID válidos.

Campos JSON desconocidos se rechazan con 400; sin conversión implícita de arrays a strings.
Nombre 1–100 caracteres Unicode tras trim; correo validado hasta 254 tras trim, comparación
case-insensitive; contraseñas 12–128 caracteres Unicode sin trim, normalización ni truncado.
Tokens recibidos como strings base64url de 43 caracteres, correspondientes a 32 bytes; nunca
UUID de entidad ni parámetro de consulta. Cuerpo máximo 16 KiB (413 si se supera).

Error: `{error: {code, message, requestId, fields?}}`, con `fields` como lista de nombres y
mensajes seguros, nunca valores enviados. Éxitos con datos: `{data: ...}`. 204 sin cuerpo.
No se devuelven stack traces, SQL, mensajes SMTP ni distinciones sobre existencia en rutas públicas.

| HTTP | Código | Semántica |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Forma/campo inválido; no cambiar credenciales ni consumir enlaces |
| 400 | INVALID_ACTION_LINK | Token mal formado, alterado, usado, vencido, reemplazado o no elegible; misma respuesta |
| 401 | INVALID_CREDENTIALS | Acceso inválido por cualquier condición; sin distinguir correo/contraseña/estado/verificación |
| 401 | AUTH_REQUIRED | Sesión ausente, expirada, revocada, versión vieja o cuenta no habilitada |
| 403 | REQUEST_NOT_ALLOWED | Origen/CSRF inválido; no ejecutar operación |
| 403 | FORBIDDEN | Rol insuficiente; comprobar antes de buscar el recurso solicitado |
| 404 | NOT_FOUND | Recurso inexistente solo tras autorizar al administrador; rutas de perfil ajeno no existen |
| 409 | ACCOUNT_CONFLICT | Correo duplicado en alta administrativa; no en registro público |
| 409 | ADMIN_INVARIANT | Cambio propio prohibido o último administrador; sin aplicar cambios |
| 415 | UNSUPPORTED_MEDIA_TYPE | Mutación sin JSON; también formularios simples |
| 429 | RATE_LIMITED | Aviso genérico y Retry-After en segundos; independiente de existencia de cuenta |
| 503 | TEMPORARILY_UNAVAILABLE | BD/hash saturado/fallo global; sin prometer éxito; reintento manual |

Una mutación denegada nunca actualiza `lastAcceptedAt`. Un fallo antes de commit hace
rollback, salvo la separación explícita registro/cupo de correo descrita más adelante.

## Endpoints públicos y de sesión

Todas las operaciones POST llevan las protecciones anteriores, aun sin sesión. Los secretos
de enlace se transfieren desde el fragmento de URL a la memoria de la SPA y luego al cuerpo JSON.

| Método y ruta | Solicitud | Respuesta y efectos |
| --- | --- | --- |
| POST `/auth/register` | `{name,email,password}` | 202 genérico para correo nuevo o existente. Nuevo: STUDENT, pendiente de correo y entrega encolada si hay cuota. Duplicado: no sobrescribir, no emitir nuevo token desde esta ruta. Nunca devuelve UserView ni sesión. |
| POST `/auth/verification/request` | `{email}` | 202 genérico en todos los estados; emitir/reemplazar enlace solo para cuenta activa no verificada, sujeto a cuota. No activa sesión. |
| POST `/auth/verification/confirm` | `{token}` | 204 si consume VERIFY_EMAIL válido; marca correo verificado. 400 INVALID_ACTION_LINK para cualquier caso inválido. No establece contraseña ni sesión. |
| POST `/auth/login` | `{email,password}` | 200 `{data: UserView}` más cookie nueva únicamente si activa, verificada y sin contraseña provisional pendiente. Cualquier otro caso: 401 genérico; cuota agotada 429. |
| POST `/auth/logout` | `{}` | 204 incluso sin sesión o ya cerrada; revoca solo cookie actual y la elimina. Nunca un GET. |
| POST `/auth/password/forgot` | `{email}` | 202 genérico; enlace RESET_PASSWORD solo a cuenta activa con correo verificado. Solicitar no cambia contraseña ni revoca sesiones. |
| POST `/auth/password/reset` | `{token,newPassword}` | 204 al consumir enlace, sustituir hash, fijar mustSetPassword=false y revocar sesiones, otros reset pendientes y provisional. No inicia sesión y limpia cookie del navegador actual. |
| POST `/auth/password/initial` | `{email,provisionalPassword,newPassword}` | 204 al sustituir credencial provisional vigente y habilitar contraseña propia; no verifica correo ni inicia sesión. Credencial inválida/inexistente/inactiva/vencida: 401 genérico, sin consumo. |
| GET `/me` | Sin cuerpo ni filtros | 200 `{data: UserView}` del usuario de sesión; 401 en otro caso. |

Mensaje de 202 para registro/reenvío/recuperación: **“Si la cuenta cumple las condiciones,
recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.”** El
cliente no interpreta 202 como correo entregado ni como prueba de que una cuenta exista.
Las pantallas muestran enlace de reenvío/recuperación en todos los casos pertinentes.

### Semántica de límites y solicitudes repetidas

- Login y establecimiento inicial comparten limitador por correo/origen: cinco fallos en
  últimos 15 min, luego 15 min de limitación. Contraseña propia no sirve como provisional.
- Correo: mínimo 60 s entre admisiones, máximo cinco/hora por destinatario/propósito y
  veinte/hora por origen sumando propósitos; registrar admisiones también para inexistentes.
  Solicitudes limitadas no generan ni revocan tokens. Retry-After usa únicamente buckets
  públicos equivalentes, sin depender del estado de la cuenta.
- Si el registro válido se recibe sin cuota de correo, se conserva una nueva cuenta pendiente
  pero no se crea token/entrega; devolver 429 genérico igual para correos existentes. La UI
  informa que solicite reenvío al terminar la espera y no supone que deba volver a registrarse.
  Esta excepción es deliberada por FR-031: el límite de envío no elimina la cuenta creada.
- La doble alta se resuelve con índice único: máximo una cuenta, contraseña original intacta.
  Reintentar por timeout no duplica usuarios. Un reenvío admitido revoca enlaces anteriores;
  un reintento SMTP de la misma entrega no crea enlace nuevo.
- Verificación, reset y credencial inicial se consumen solo al confirmar una operación válida;
  doble consumo concurrente produce un éxito como máximo. Un GET de un escáner no los consume.

## Endpoints administrativos

Exigen sesión habilitada con rol ADMIN y revalidación transaccional del actor para mutaciones.
Alumno/docente recibe 403 antes de consultar existencia de ID. No existe endpoint de edición
general de User; cada comando tiene una lista pequeña de campos admitidos.

Precisión U1 (2026-09-25): operaciones aceptadas auditan actor/destino existentes en el mismo
commit. Denegaciones usan el registro de seguridad privado definido en
[el modelo](../data-model.md#registros-operativos-y-de-seguridad-sin-tabla-de-cuentas-ni-fk):
un UUID solicitado es referencia sin FK, sin lookup adicional ni indicador de existencia.
Un fallo de ese registro no modifica el 401/403 público. No se devuelve información de
auditoría/logging ni se crea un usuario para representar a un visitante u operador.

| Método y ruta | Solicitud | Respuesta y regla |
| --- | --- | --- |
| GET `/admin/users` | `q?`, `role?`, `status?`, `page=1`, `pageSize=20` | 200 `{data:{items:UserView[],page,pageSize,total}}`. page>=1; pageSize 1–50; q máximo 254, búsqueda por subcadena en nombre/correo sin case; escapar comodines SQL. Orden createdAt,id. |
| POST `/admin/users` | `{name,email,role,provisionalPassword}` | 201 `{data:UserView}`; contraseña provisional aportada por administrador, nunca devuelta. Correo único; enlace de verificación asíncrono. La cuenta se crea aunque deba esperar cuota de correo. |
| GET `/admin/users/{id}` | UUID | 200 `{data:UserView}` o 404 si no existe. |
| PATCH `/admin/users/{id}/name` | `{name}` | 200 `{data:UserView}` y auditoría; sin cambio de correo/rol/estado. |
| PUT `/admin/users/{id}/role` | `{role}` | 200 `{data:UserView}`; cambio real revoca todas las sesiones. Cambio propio prohibido; no quitar último ADMIN activo. Mismo rol es idempotente y no revive sesiones. |
| PUT `/admin/users/{id}/status` | `{status}` | 200 `{data:UserView}`; desactivación revoca sesiones/enlaces/correos pendientes. Prohibido desactivarse o dejar cero ADMIN activos. Reactivación no restaura nada revocado. |

El administrador conserva la credencial provisional solo para entregarla por el canal privado;
la interfaz la borra tras éxito. No se recupera desde API, perfil, listado o auditoría. Si
se pierde una respuesta de creación, consultar la cuenta por correo y usar verificación/
recuperación; no sobrescribir ni generar automáticamente otra credencial al reintentar.
No se ofrece recuperación manual ni cambio de correo en esta funcionalidad.

## Contrato operativo independiente de HTTP

Comando futuro `npm.cmd run admin:bootstrap --workspace @academia/api`: diálogo interactivo
local restringido al operador con acceso a configuración y BD. Solicita nombre, correo y
credencial provisional con entrada oculta; ningún secreto por argumento, historial ni stdout.
Transacción con SystemState garantiza ejecución única. Resultado: ID y correo administrativo
sin secretos; error “entorno ya inicializado” sin cambios. Debe verificar correo y sustituir
credencial antes del primer login. No existe `/bootstrap` público ni contraseña predeterminada.

La entrada CLI solicita además `operatorRef`, alias operativo no secreto validado según el
modelo, para correlacionar el intento LOCAL_OPERATOR con el evento SYSTEM_BOOTSTRAP exitoso.
No es una credencial ni un nuevo dato de la cuenta; no se obtiene de entradas HTTP. El comando
restringido de invalidación tras restaurar usa el mismo contexto, con destino global
IDENTITY_SCOPE y registro operativo, no un AuditEvent con usuario destino inexistente.

Rutas de salud separadas: `/health/live` indica proceso disponible; `/health/ready` devuelve
200/503 según BD y configuración esencial, sin nombres internos ni credenciales. Mailpit caído
no detiene sesiones; se registra estado operativo seguro y entregas pendientes. Estas rutas
no cuentan como actividad de sesión ni constituyen prueba de envío de correo.

## Matriz efectiva de permisos

| Familia | Visitante | STUDENT | TEACHER | ADMIN |
| --- | --- | --- | --- | --- |
| Registro/solicitudes de enlace | Sí, con límites | Mismas reglas públicas | Mismas reglas públicas | Mismas reglas públicas |
| Confirmar enlace/credencial inicial | Solo secreto válido y condiciones de cuenta | Igual | Igual | Igual |
| Login/logout | Condiciones propias; logout idempotente | Igual | Igual | Igual |
| GET /me | No | Propio | Propio | Propio |
| /admin/users y comandos | No | No | No | Sí, con invariantes |
| Ver secretos de otra cuenta | No | No | No | No |

No hay acceso de docente a alumnos en esta entrega. El backend aplica denegación por defecto
para cualquier operación no declarada; los controles visuales no autorizan solicitudes.
