# Contrato de integración y consistencia

Fecha: 2026-11-16; propuesta, sin interfaces implementadas.

## Autoridades y fronteras

- Autorización: permisos nuevos `materials:manage-all` (ADMIN),
  `materials:manage-own` (TEACHER), `materials:read-enrolled` (STUDENT). Matriz
  cerrada; capacidad no sustituye pertenencia. Desconocido se deniega.
- Oferta: participante público `MaterialsGroupAccess`, descubrimiento y snapshot
  mínimo grupo/curso/docente, estado y elegibilidad actual. Elegibilidad se obtiene
  mediante contrato público de usuarios existente; no SQL de columnas privadas.
  No confundir visibilidad de oferta con permiso de preparar o matrícula vigente.
- Matrícula: participante público `MaterialsEnrollmentAccess` recibe alumno,
  grupo y token temporal de la unidad de trabajo y responde derecho vigente
  mínimo. confirmedAt ≤ token.at < validUntil congelado de 003; no entrega precio,
  órdenes/pagos o datos de terceros. No modifica matrícula ni reserva.
- Raíz conecta ambos sobre la misma conexión. Materiales no consulta tablas
  ajenas ni importa internos de módulos. Puertos de aplicación no exponen SQL,
  PoolClient, Buffer o Nest; contrato temporal público exacto, sin Date intermedio.

## Unidad de trabajo

Coordinador propio en infraestructura usa accountTransaction y su presupuesto;
sin anidar coordinadores de oferta/matrícula o añadir bucle de reintentos.

1. Actor/permiso, descubrimiento de topología mínima; cuentas UUID ordenadas,
   sesión revalidada en la transacción. Gestión incluye docente si corresponde;
   alumno no depende de elegibilidad docente y bloquea solo su cuenta.
2. Curso antes de grupo, ordenados; SHARE al leer, UPDATE al escribir. Releer
   asignación/referencias después de locks; cambio aborta y redescubre, sin adquirir
   una cuenta tardía. No tomar locks de pagos o coordinadoras de reservas.
3. Después del grupo, material e intención/comando en orden estable. Permiso
   precede ledger: mismo digest recupera resultado; distinto produce conflicto.
   Replay no publica de nuevo; proyecta vista actual permitida e appliedRevision
   original. No usa autorización anterior para entregar referencia/contenido.
4. Capturar tiempo exacto después de locks/recheck; validar matrícula/estado/revisión.
   Retroceso frente a hechos conocidos implica indisponibilidad segura.
5. Commit conjunto de material/contenido/resultado/auditoría. Lectura de descarga
   obtiene un único buffer autorizado; su instante de decisión define inicio lógico
   de respuesta. Soltar locks/conexión antes de red. No recuperar bytes ya autorizados.

Grupo compartido se opone a cancelación/reasignación y operaciones financieras
que lo bloquean exclusivo; material exclusivo ordena comandos. Nunca bloquear
grupo desde material ya bloqueado. Pruebas con barreras comprueban orden/carreras.

## Upload e incertidumbre

JSON crea intención, no material. Antes de consumir binario: comprobar actor,
pertenencia/intención y obtener plaza; soltar transacción durante recepción.
Después: validar longitud/hash/formato y reautorizar dentro de nueva unidad de
trabajo que inserta todo o revierte. Dos PUT concurrentes iguales crean solo uno;
el segundo recupera resultado. Contenido distinto bajo misma intención se rechaza.

COMMIT incierto consulta upload/comando con permiso actual; no asumir fallo ni
crear alternativa automáticamente. Caída durante buffer no persiste contenido;
caída posterior se recupera por intención. Pérdida de permiso bloquea completar
y consultar intención vieja. No mutex distribuido, temporales o reconciliación FS.

## Adaptaciones de transporte, sesión y operación

Excepción a JSON exclusivamente PUT `/materials/uploads/:uuid/content`, con Origin,
CSRF y Sec-Fetch-Site intactos. Sin parser binario global, compresión de entrada,
CORS nuevo o logging de cuerpo. Handler controla bytes/plazo/abortos tras permiso.

AcceptedSessionInterceptor necesita envoltura binaria interna explícita: no ejecutar
JSON.stringify(Buffer), aceptar sesión antes de headers/primer byte. Si falla,
no descargar. Mantener comprobaciones actuales para JSON y expiración absoluta;
no renovar por operación denegada o fallo previo a aceptación. Error tras headers
cierra respuesta y registra código seguro; SafeErrorFilter no escribe segundo JSON.

Inicialmente 2 transferencias binarias por proceso y 1 por actor; admisión antes
de leer blob, plaza hasta finish/close/error, liberación garantizada en abortos.
No cola ilimitada o conexión SQL durante cliente lento. Medir copias reales del
driver; no prometer streaming de BD con RAM constante.

Vite ya usa proxy `/api`, mismo origen y changeOrigin false. Publicación futura
debe comprobar límite binario/timeouts y buffering del proxy HTTPS; no existe
configuración Nginx aprobada que se pueda dar por preparada.

Backup existente usa pg_dump completo; verificar inclusión de contenido, ampliar
manifiesto/ensayo con hashes/estados y restore separado. D13 sigue custodia/retención;
no purgas, backup manual o cambios de datos reales durante planificación.
