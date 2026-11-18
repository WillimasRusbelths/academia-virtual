# Integración, autoridad y orden transaccional — 005

2026-11-18. Fronteras de autorización/oferta/matrícula/autores implementadas y
probadas en T010–T013 ([evidencia](../evidence/t010-t013.md)). Coordinador, ledger y
composición fundacional verificados en [T014–T017](../evidence/t014-t017.md).
T020–T023 verifica efectos y seis rutas de gestión ([evidencia](../evidence/t020-t023.md));
COMMAND descubre referencias propias, revalida topología/autoridad bajo locks y
solo después lee receipts. Aula/chat y su transporte siguen en tareas posteriores.

## Fronteras públicas

| Propietario | Contrato / autoridad |
| --- | --- |
| Autorización | `classes:manage-all` ADMIN; `classes:manage-own` TEACHER; `classes:participate-enrolled` STUDENT; denegación por defecto |
| Oferta | `public/classes-access.ts`: descubrir grupo/curso/docente, snapshots mínimos/estado/elegibilidad, grupos gestionables |
| Matrícula | `public/classes-access.ts`: descubrir referencias propias, hasAccess/groups al instante exacto y, para moderación, verificar alumno del grupo |
| Usuarios | Proyección pública mínima por IDs de autores: id/name/role, sin UserView completo con correo/estado |
| Clases | Puertos de clase/chat/ledger/eventos/video sin SQL, Nest o Socket.IO |

Políticas HTTP cerradas `CLASSES_MANAGEMENT_POLICY` (dos permisos) y
`CLASSES_PARTICIPATION_POLICY` (los tres). Extender SessionPermission/SessionLookup
e inventarios explícitos; no aceptar cualquier array o usar permisos de materiales.
La participación general nunca basta: recurso/estado/matrícula se comprueban en
transacción. API de usuarios mínima para autores es una extensión técnica explícita
con prueba de privacidad; no crear consulta de cuentas o roster global en el chat.

AppModule conecta estos adaptadores al mismo PoolClient del coordinador.
La proyección de autores recibe un scope activo que valida los IDs referenciados
por contenido ya autorizado; no expone correo, estado privado o búsqueda global.
El participante de matrícula puede validar el derecho original de un alumno objetivo
con hasAccess. El coordinador comprueba su rol objetivo y clase/grupo y revalida
la cuenta/sesión del actor en la transacción.
Clases no consulta tablas ajenas ni importa infrastructure ajena. Descubrimiento
de matrícula no autoriza; usar sus fechas originales y condiciones de 003.
No nested BEGIN, coordinadores anidados o presupuesto adicional de retry.

## Operación transaccional

1. Validar forma/capacidad; descubrir destino y topología mínima. Para alumno,
   no bloquear cuenta del docente como requisito de su derecho. Para gestión,
   incluir cuentas necesarias de responsable actual; para silencio, alumno objetivo.
2. `accountTransaction`: bloquear cuentas por UUID canónico (protocolo existente),
   luego revalidar sesión del actor con el permiso concreto. Curso→grupo, UUID
   ordenados; gestión/transiciones de clase con grupo UPDATE, consulta SHARE.
   Toda operación que escriba mensajes/eventos/restricción toma clase UPDATE desde
   el inicio; lecturas SHARE. No promover un lock SHARE de clase a UPDATE.
3. Releer topología/asignación después de locks. Si cambió, abortar/redescubrir
   dentro del presupuesto existente; no adquirir cuentas tardías fuera de orden.
   Recursos de clase: clase→mensaje/restricción→ledger, orden estable. Reasignación,
   cancelación y revocación compiten bajo los mismos locks de sus propietarios.
4. Emitir token temporal exacto después de locks/recheck. Sesión/cuenta activas,
   rol vigente, grupo no cancelado para contenido, estado y responsabilidad o
   matrícula `confirmedAt≤t<validUntil`. Retroceso temporal frente a hechos conocidos
   produce indisponibilidad segura. Revalidar sesión antes de terminar callback.
5. Autorizar antes de ledger. Replay mismo digest retorna referencia/resultado con
   proyección actual permitida; no reproduce contenido histórico ocultado. Otro
   digest da conflicto. Para intención nueva: revisión esperada, estado y silencio.
6. Enviar: contar mensajes confirmados propios en `(t−10 s,t]` bajo clase UPDATE,
   incluyendo ocultos; admitir hasta 10. Insertar mensaje, evento secuencial,
   receipt y auditoría en la misma transacción. Cambio de estado/moderación también
   conserva efecto, revisión/sequence y resultado juntos.
7. COMMIT confirmado antes de ack HTTP o aviso. COMMIT incierto no se reintenta
   internamente; consultar misma intención. Avisos son post-commit y prescindibles.
   Soltar transacción/conexión antes de esperar red. No emitir eventos de rollback.

No locks financieros, cambios de fechas de matrícula o mutaciones de reserva/pago.
Grupo UPDATE para gestión serializa inicios entre sesiones diferentes; índice
parcial actúa como segunda defensa. Mensajes no incrementan revisión de gestión.
Revalidación de lectura siempre actual; temporizadores de UI/socket son auxiliares.

## Carreras y contenido ya autorizado

La decisión de lectura bajo locks define su orden lógico respecto a HIDE, FINISH,
MUTE, revocación y cancelación. Una decisión nueva posterior respeta el cambio;
una ya autorizada no permite retirar bytes en tránsito. UI mantiene versión por
recurso y generación, tombstones dominantes y cursor aplicado. Respuesta antigua
no puede restaurar texto después de procesar su ocultación. Consultas/replay
posteriores siempre proyectan estado actual, aunque el evento leído sea SEND antiguo.

Pruebas con barreras deben demostrar ambos órdenes y COMMIT efectivo, incluida
matrícula un microsegundo antes/en/después del fin y rechazo sin entrega ante BD
indisponible. Un barrido de sockets o cache de permisos no prueba esas condiciones.

## Transporte y sesión

HTTP conserva origen, CSRF, JSON 16 KiB y errores seguros por familia. Agregar
allowlists de campos/códigos y puerta de rutas sin alterar contratos previos.
No invocar guard/interceptor HTTP sobre un objeto WebSocket. El ticket une
autorización HTTP y upgrade; [realtime](realtime.md) define su procedencia.

Extender aceptación de sesión para distinguir acción/lectura intencional de
sync automático. Heartbeats/avisos/sondeo no renuevan inactividad; acción aceptada
puede hacerlo como en 001. Nunca ampliar caducidad absoluta, renovar por rechazo
o reutilizar una identidad de otra generación. Pruebas de identidad y sesión son
regresión obligatoria de esta adaptación.

Política fija del servidor: GET changes, GET video y POST socket-tickets nunca llaman accept,
incluida su reconexión automática; upgrade/barrido/avisos tampoco. GET messages
para abrir/paginar y comandos confirmados siguen aceptación HTTP existente. No
decidir renovación por un flag cliente `intentional`. Sondeo automático usa
GET changes y GET video, nunca GET messages u otro endpoint que renueve sesión por actividad.

## Recuperación

El dump completo incluye tablas de clases/chat; no nuevo volumen de archivos o
reconstrucción desde memoria. Ensayo debe cubrir upgrade desde 0009, reinicio y
restore en BD nueva, cuarentena e invalidación existente de accesos restaurados.
Tickets/sockets descartados; estados y moderación permanecen; no reapertura,
reenvío o emisión automática. Registrar decisiones posteriores perdidas y su
revisión antes de abrir. D13 externo y rúbrica/capacidad D10 siguen pendientes.

## Referencia del ensayo audiovisual

ClassVideoReference se gestiona con clase UPDATE y revisión independiente, ledger/
evento/auditoría conjuntos. Cambiar/retirar asociación no controla la cuenta YouTube
o señal externa. Deltas no incluyen ID de video a alumnos; notifican revisión para
invalidar player y consultar referencia autorizada LIVE. [Contrato](video.md).
