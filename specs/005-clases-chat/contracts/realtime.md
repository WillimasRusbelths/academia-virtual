# Contrato Socket.IO propuesto — avisos de clase

2026-11-17. Transporte todavía no implementado. Mensajes/comandos y recuperación
autoritativa usan [HTTP](api.md); ningún evento de socket envía un texto de chat.

## Conexión y procedencia

Socket.IO 4.x, path Engine.IO `/api/v1/classes/socket.io`, namespace `/classes`,
solo transport WebSocket. Sin polling, fallback de Engine.IO, CORS abierto o
conexión cross-origin. Navegador usa mismo origen y cookie HttpOnly existente.
`allowRequest` comprueba Origin exacto también en Upgrade, ruta y límites antes
de admitir; solo validar CORS no protege WebSocket.

1. POST socket-tickets con sesión y controles HTTP: ticket uniuso de 30 s, respuesta
   no-store `{data:{ticket,expiresAt}}`, ligado a actor/sesión/authVersion/clase.
2. Cliente lo entrega en auth del namespace `{classId,ticket}`; nunca query string.
   El servidor comprueba cookie/identidad actual y consume ticket atómicamente;
   otro socket no reutiliza el secreto. Conexión rechazada no revela datos de clase.
3. Revalidar clase/permiso; solo entonces registrar socket y avisar que sincronice.
   Una conexión tiene una clase; cambiar requiere conexión/ticket nuevos.

Ticket efímero guardado como hash, no credencial de video ni derecho académico.
Reinicio invalida tickets; reconexión obtiene otro mediante POST autorizado.
No registrar auth/cookies/paquetes. Origin ausente/incorrecto falla cerrado; clientes
de prueba deben enviarlo explícitamente. No deshabilitar TLS en pruebas HTTPS.

## Eventos

| Dirección / nombre | Cuerpo permitido | Semántica |
| --- | --- | --- |
| Servidor→cliente `sync.required` | `{}` | Obtener delta HTTP, sin mensajes/IDs/contadores privados |
| Cliente→servidor | Ningún evento de negocio | Enviar/moderar/cambiar clase usa HTTP |
| Conexión/fallo técnico | Código seguro | AUTH_REQUIRED/NOT_FOUND/RATE_LIMITED/TEMPORARILY_UNAVAILABLE, sin causas privadas |

Revalidar autoridad antes de cada aviso; ante error/revocación cerrar sin entregar
contenido. Barrido de sockets cada ≤5 s ayuda a cerrar inactivos o revocados, pero
no sustituye comprobación antes de operación/aviso. Heartbeats técnicos no renuevan
`lastAcceptedAt`. Lectura intencional y comandos HTTP siguen política existente de
aceptación; el endpoint de sondeo automático/sync no debe renovar por mero tráfico
de fondo. Adaptar esa distinción explícitamente en el interceptor con sus pruebas,
sin cambiar caducidad absoluta o reglas de identidad.
La política fija excluye GET changes, GET video y POST socket-tickets de accept, incluso al
reconectar. No usa un indicador del cliente para decidir si renueva inactividad.

Un commit puede generar un aviso por socket autorizado; agrupar avisos cuando ya
hay uno pendiente. Post-commit fallido/perdido no altera el mensaje confirmado.
El cliente solicita delta tras conectar, tras aviso y cada 5 s mientras el aula
está visible, con una sola lectura en vuelo y sin acumulación de trabajo. Si no hay
socket, mostrar degradación y conservar lectura HTTP autorizada. Backoff acotado
en fallos/429/503, detener al perder permiso; no sondear en bucle infinito inmediato.

## Recuperación sin replay privado

`connectionStateRecovery` deshabilitado; no restaurar rooms/paquetes como autoridad.
No habilitar retries/offline write buffer para comandos: el socket no los acepta.
Desconexión no cambia estado de clase ni duplica mensajes. Reconectar dentro de la
misma sesión puede recuperar consultas; enviar pendiente exige resolver la misma
intención HTTP, sin autoenvío de borradores. Cambio/login de cuenta invalida toda
generación anterior, tickets/intenciones locales y respuestas tardías.

Flujo: snapshot con H → conectar/avisar → delta `after=H` hasta hasMore=false.
Si se conecta antes del snapshot tampoco se aplica nada desde el socket: es solo
señal para consultar. Los cambios confirmados entre pasos permanecen en PostgreSQL.
IDs deduplican mensajes; eventSeq ordena cambios; viewVersion/tombstones impiden
que una respuesta anterior restaure contenido ocultado.

## Recursos, integración y comprobación

Límites técnicos propuestos: 4 sockets por actor entre sesiones, 3.000 por proceso;
reservar/liberar plaza exactamente en connect/disconnect/error. No consumir una
conexión del pool por socket. Ticket map máximo 3.000 y 4 pendientes por sesión.
Socket lleno/lento recibe cierre seguro, sin cola ilimitada ni datos históricos.
Estos límites no acreditan soportar esa cantidad en la infraestructura.

Adjuntar al servidor HTTP existente antes de listen; cerrar sockets/admisiones
antes de cerrar BD. Vite/Compose deben permitir Upgrade en esta ruta con `ws:true`,
preservando Origin y proxy actual. Transport JSON existente no se debilita ni admite
POST de Engine.IO polling. Revisar CSP `connect-src` para mismo origen WS/WSS,
sin wildcard o unsafe-inline; comprobar HTTP local y HTTPS en su entorno posterior.

Pruebas usan `socket.io-client` compatible: conexión, avisos tras commit, múltiples
sesiones, ticket replay/cross-session, origen, revocación, matrícula exacta,
socket abierto al finalizar y desconexiones/cliente lento. WebSocket crudo aislado
no prueba este contrato. Medir carga del protocolo real cuando se ejecute D10/007.
