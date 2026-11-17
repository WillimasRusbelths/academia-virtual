# Política técnica de admisión de intenciones — T032

Fecha: 2026-11-16, America/Lima. Decisión registrada antes de aplicar la cuota.

Se admiten como máximo **30 intenciones nuevas por actor en una ventana móvil de
60 segundos**, usando el instante servidor del coordinador. Cuenta toda intención
persistida de ese actor, PENDING o COMPLETED y en cualquier grupo. La ventana es
`at - 60 s < createdAt <= at`. No depende de IP, pestaña, sesión, rol o proceso.
Un actor autenticado conserva la misma cuota al abrir otro proceso o sesión.

Se reautoriza primero y se resuelve la identidad actor/intentionId antes de contar:
replay idéntico recupera el mismo resultado, payload distinto conserva 409 y no
genera otra fila. Consultar estado, enviar bytes de una intención existente y
publicar no consumen ni se bloquean por esta cuota de registro. Solo el INSERT
confirmado consume; rollback no consume. Las intenciones sembradas por fixtures
cuentan igual si su createdAt está dentro de la ventana.

Actor/cuentas ya se bloquean FOR UPDATE antes de consultar/inserir; el conteo y
registro comparten esa transacción, por lo que dos procesos no admiten dos últimas
plazas. Índice aditivo actorId/createdAt para no recorrer toda la historia del actor.
Sin mutex local, tabla de contadores divergente, TTL, expiración o purga de filas.

Al agotar: HTTP 429 RATE_LIMITED y Retry-After entero 1–60 segundos, calculado
desde la intención más antigua todavía contada; no se reserva una plaza ni se
promete que el siguiente intento será admitido. Error de BD/recurso produce 503
seguro, nunca una admisión sin comprobar. Un hecho del actor con createdAt posterior
a at produce 503 (reloj hacia atrás), sin abrir otra ventana ni modificar resultados.

La cuota limita creación rápida de metadatos y trabajo de registro. Es un valor
técnico inicial verificable, no una medición de capacidad ni protección suficiente
frente a abuso distribuido o almacenamiento acumulado. No cambia los límites de
archivo (20 000 000 bytes), transferencia (2 global/1 actor) y recepción (60 s).
Las cuotas de login no se consideran protección de uploads. No se introduce cuota
agregada de almacenamiento, borrado, cobro o restricción de negocio por curso.
Su ajuste requiere nueva evidencia; D10/D13 y mediciones T063 siguen pendientes.

## Ajuste verificado durante T032, antes de aplicar la corrección

La regresión previa T021 contiene una intención con fecha futura deliberada y
luego registra otra intención independiente del mismo actor. El rechazo global
503 anterior impedía esa operación legítima. Se conserva la prueba y se ajusta
esta regla: **las fechas futuras cuentan conservadoramente en la cuota**, en vez
de provocar rechazo global o excluirse como si no consumieran admisión.

Ventana normal intacta; para hechos anómalos se cuenta todo createdAt > at - 60 s,
incluidos futuros. Con menos de 30 se admite el registro independiente. Con 30 o
más, se deniega: 429 si el instante más antiguo permite Retry-After 1–60, o 503 si
todos los hechos contados son tan futuros que no cabe una espera válida. Nunca se
eliminan filas ni se liberan plazas debido a un retroceso del reloj. Esta sección
sustituye la regla inicial de rechazo por cualquier hecho futuro; el resto sigue.
