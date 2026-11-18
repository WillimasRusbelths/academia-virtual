# Contrato de interfaz propuesto — 005

2026-11-18. Gestión para docente/admin implementada en T024–T026:
[pruebas unitarias y navegador con API simulada](../evidence/t024-t026.md).
E2E con API real T027, aula del alumno y chat siguen pendientes. Pulido global/paneles quedan en 006;
estas pantallas sí requieren teclado, móvil y estados accesibles al entregarse.

## Navegación por rol

- `/clases`: grupos autorizados. Alumno desde su matrícula vigente; docente desde
  asignación/habilitación actual; admin gestión de grupos. Enlace desde Inicio
  y composición de rutas por rol, sin nuevo dashboard agregado.
- `/clases/grupos/:groupId`: sesiones preparadas/en curso/finalizadas del alumno;
  gestor ve también canceladas y puede preparar. No confundir horario del grupo
  con una sesión creada o su estado real.
- `/clases/sesiones/:classId`: aula y chat. Responsables pueden corregir textos,
  iniciar/finalizar/cancelar según estado y moderar; alumno participa por chat.

Acciones visibles orientan; backend decide. Enlace directo se reautoriza y muestra
404/permiso seguro. Oferta retirada o cambio docente no elimina derecho vigente
del alumno; cancelación/grupo y vencimiento sí se comprueban para contenido.

## Gestión de clase

Preparar con título/descripcion, validación junto al campo y resumen accesible.
No iniciar por guardar. Confirmar explícitamente inicio/final/cancelación;
mostrar revisión actual y conflicto recuperable, sin sobrescribir automáticamente.
Una clase en curso no demuestra señal disponible. Terminales no muestran reinicio.
Resultado incierto conserva intención y ofrece consultar; nunca crea otro commandId
solo por timeout. Recurso actualizado no pierde atribución original.

Las rutas actuales exigen classes-manager (docente/admin); alumno se incorpora
en T032. Inicio y grupos de oferta/asignación enlazan a gestión por composición.
La generación de sesión forma parte de la identidad del render; consulta de sesión
o logout desmonta/aborta la gestión, sin transferir borradores a otro contexto.
Una escritura confirmada refresca solo la lista, sin repetir comandos; una
intención incierta bloquea cambios hasta consultar y decidir un reintento manual.

## Aula y video

Separar estado de clase, transporte de chat y reproducción. Estados vacío/cargando,
PREPARED, LIVE, FINISHED, no habilitado, esperando emisión, desconexión y error no se
deducen unos de otros. Referencia y player del ensayo siguen [contrato](video.md):
gestor actual asocia ID sin secretos, alumno obtiene ID solo en LIVE vigente.
Aviso visible de enlace compartible y prueba YouTube. La configuración no confirma
señal; eventos del player y observación real distinguen reproducción/pausa/fallo.
Al perder autoridad o recibir cierre/cambio de referencia, destruir iframe y
reautorizar; sin reutilizar callbacks de otra generación. Emisión/detención en
OBS/YouTube son manuales. No prometer corte del enlace externo.

## Chat, recuperación y moderación

Ordenar por messageSeq confirmado; borrador local no aparece como enviado. Durante
envío mostrar pendiente; respuesta incierta requiere consulta de la misma intención.
Límite/rechazo/silencio no borra texto corregible dentro de la misma sesión.
Al finalizar, lectura vigente y composer deshabilitado con explicación.

Reconexión recupera cambios por cursor, no reenvía borradores. Deducir duplicados
por ID confirmado, aplicar tombstones/versiones y rechazar respuestas de generación
previa. Mostrar indicador de ocultado sin texto, también al moderador y en historial
antiguo. Confirmar ocultación irreversible y silencio/rehabilitación de esa clase;
no ofrecer bloqueo global o restauración de mensaje.

Sin roster general: moderar alumno referenciado en mensajes autorizados; servidor
verifica que objetivo sea alumno vigente. Mostrar restricción propia al alumno;
no exponer silencios/motivos privados ajenos. Avisar conexión degradada y lectura
desactualizada; no presentar borradores como confirmados o silencio como expulsión.

## Sesión, accesibilidad y dispositivos

Logout/cambio cuenta/pérdida de permiso aborta requests, cierra socket, elimina
tickets, texto, borradores, intenciones locales y cursores; respuestas tardías no
restauran estado. Detectar inicio de logout para congelar envíos y ocultar aula;
si logout falla, resolver estado explícitamente, sin reconectar o reenviar mensajes
como efecto colateral. Identidad de render incluye generación, no solo userId.

Probar al menos 360 px y 1280 px, reflow/zoom, foco visible no recortado, recorrido
completo con teclado, labels, errores asociados y avisos con región live moderada.
Lista de chat no roba foco ni fuerza scroll cuando se lee historial; botón explícito
para mensajes recientes. Operación moderadora devuelve foco a posición estable.
Nombres/textos inertes; no HTML ni activación automática de URL. UI móvil no exige
hover. Observación humana registra dispositivo, modalidad, ayuda y dificultad sin
identificadores; teclado/móvil no observados permanecen señalados como pendientes.
