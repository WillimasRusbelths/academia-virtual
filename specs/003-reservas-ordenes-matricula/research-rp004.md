# Investigación técnica — RP004

**Fecha**: 2026-10-30, America/Lima. **Base**: `a1de79b`.
**Estado**: decisiones técnicas propuestas para el núcleo funcional; sin código,
migraciones, pruebas de producto ni operación de servicios.

El [inventario RP001](research.md) permanece íntegro como evidencia de aquella base.
Este suplemento utiliza las quince respuestas del [spec](spec.md), no los antiguos
pendientes del inventario. Investigación de tres agentes de solo lectura: protocolo
transaccional, datos y verificación/contratos. Las decisiones se consolidan aquí;
ningún agente ejecutó ensayos o modificó código.

## R01 — Integración en el monolito

**Decisión**: módulo `enrollment`, con dominio puro, aplicación, entradas HTTP,
infraestructura y superficie pública. Reutilizar cuenta/sesión/permisos por
composición, pool único y `accountTransaction`. Incorporar participantes públicos de
oferta y un guard de compromisos ligado a la misma conexión de cada unidad de trabajo.

**Motivo**: `academic-offering/public/offer.ts` solo ofrece DTO/errores; no protege una
reserva. `CatalogReads`, `OfferingStore` y tablas internas no son interfaces consumibles
entre módulos. [Integración propuesta](contracts/integration.md) define la brecha y su cierre.

**Alternativas**: descartar HTTP interno, GET previo como autorización, transacciones
anidadas y publicación de adaptadores privados. Otro pool o servicio distribuido
añadiría coordinación sin evidencia de necesidad.

## R02 — Admisión persistida y prioridad

**Decisión**: dos filas coordinadoras independientes del módulo. Admisión breve con
contador transaccional y registro único por alumno/intención; despacho que mantiene
su propia coordinadora hasta confirmar la decisión de la menor secuencia pendiente.
Sin `SKIP LOCKED` ni salto de cabeza en el despacho de reservas.

**Motivo**: RA-02 promete orden de admisión válida registrado por servidor. El contador
se asigna mientras la fila de admisión está bloqueada hasta COMMIT: una solicitud
posterior no puede volverse visible antes de que la anterior confirme o aborte.
El despacho conserva secuencia al fallar, reintentar o reiniciar. Una denegación real
puede ser resultado terminal sin reservas; un fallo de infraestructura no lo es.

**Alternativas**: `nextval()` aislado solo ordena asignaciones numéricas; no los commits.
Locks de grupo, orden de respuestas o selección de filas disponibles no prueban RA-02.
Una cola en memoria pierde continuidad al reiniciar. Un broker no es necesario para
este diseño inicial. El despacho global es un posible cuello de botella deliberado,
pendiente de medición; no se atribuye capacidad de 2500 activos.

## R03 — Locks, inventario y unicidad

**Decisión**: conservar READ COMMITTED y orden cuentas UUID → sesión → cursos UUID →
grupos UUID → registros financieros. Admisión/despacho tienen prefijos independientes
descritos en el contrato. Descubrir todas las referencias antes de bloquear; cambios
de topología provocan rollback y redescubrimiento con el presupuesto único existente.

**Motivo**: releer en sentencias posteriores a los locks observa el estado ya confirmado
por el escritor anterior. Reserva, edición, ocultamiento, cancelación, verificación y
vencimiento comparten las autoridades pertinentes, incluidas cuenta docente y grupo.

**Decisión de inventario**: calcular reservas y matrículas vigentes bajo lock de grupo,
sin contador mutable adicional. Capacidad − reservas vigentes − matrículas vigentes;
una conversión no cuenta reserva y matrícula simultáneamente. La oferta oculta también
consume sus compromisos; el historial finalizado no. Incidencias no ocupan plazas por
sí solas, pero sí bloquean mantenimiento protegido/cancelación.

**Alternativas**: un contador separado exige conciliación adicional sin aportar una
fuente de verdad. Índices únicos separados no garantizan unicidad entre reserva y
matrícula; serializar por alumno y comprobar ambos conjuntos evita una tabla duplicada
de claims. No crear un índice con predicado dependiente de `now()`.

## R04 — Reloj y aplicación del pago

**Decisión base**: instantes UTC persistidos y una autoridad temporal de servidor
obtenida después de esperar locks. Las fechas civiles y coincidencias efectivas usan
America/Lima. `confirmedAt + 86 400 segundos` es el vencimiento, sin días civiles ni
plazo desde admisión. Referencia de pago: fin de verificación del servidor, no recepción,
fecha del proveedor, navegador o consulta posterior.

**Motivo**: el reloj del inicio de transacción puede anteceder una espera larga. Un
worker retrasado no mantiene una reserva vigente. La lectura de disponibilidad utiliza
el mismo predicado temporal aunque el estado materializado aún espere conciliación.

**Límite de RP004**: RP005 debe completar precisión/captura del reloj, normalización,
worker y matriz antes/igual/después/reinicio. RP006 debe cerrar el protocolo detallado
de verificación/conciliación/reasignación y evidencia durable. No basta anotar una
verificación anterior y matricular después sin comprobar plaza válida; no se recupera
una plaza reasignada por backdatear el efecto. Este plan base no cierra esas tareas.

## R05 — Datos históricos y dinero

**Decisión**: precio explícito por curso en PEN, representación exacta en unidades
menores y cadenas en JSON; conservar desglose confirmado. Ausencia de precio no se
convierte en cero. No aprobar descuentos, mínimos comerciales ni gratuidad por una
elección de tipo de datos; límites y modalidades cobrables se contrastan con D02/RP006.
No existe confirmación de matrícula por precio cero sin pago verificado aprobado.

Guardar período, zona, franjas y límite de vigencia originales en detalle/matrícula.
Edición/republicación no reescribe el historial ni reactiva matrículas terminadas.
Una orden puede tener una incidencia sin perder antes de tiempo sus reservas: separar
estado de compromiso, hechos de pago y estado de incidencia.

**Alternativas**: números de coma flotante, total del cliente, reconstruir el historial
desde el grupo actual o un único estado «pago en conciliación» que libere plazas al
abrirse una incidencia incumplirían reglas aprobadas.

## R06 — Compatibilidad de oferta y descripción

**Decisión**: proyección reservable propia, con disponibilidad real e instante de
evaluación. Mantener los DTO 002 `null/null/NOT_CALCULATED` para sus consumidores
existentes hasta una evolución explícita, sin rebautizar capacidad como disponibilidad.

El grupo sigue perteneciendo inmutablemente a su curso por 002/0005: RA-05 no habilita
traslados cuando no existen compromisos. Para expresar la edición de descripción de
grupo aprobada en FR-014/US4.12, se prevé un campo opcional de texto en el dueño oferta,
actualmente ausente; no se sustituye silenciosamente por otro dato. La extensión es
aditiva y se limita a metadatos, retiro previo, revisión y republicación. Sin nuevos
límites comerciales de longitud; rige el límite de transporte y las validaciones
textuales existentes aplicables. No se añade dicho campo ahora.

## R07 — HTTP, interfaz y proveedor

**Decisión**: admisión responde 200 con DTO explícito `ADMITTED`, recuperable por
intención; nunca se interpreta como reserva. El cliente actual descarta cuerpos 202:
elegir 200 evita introducir una modificación global innecesaria. Ampliar allowlists
de rutas/campos/errores para la nueva familia, manteniendo mismas garantías.

Puerto de pagos independiente del proveedor; simulación solo test. D02 determina
autenticación, formato, endpoints y SDK reales. No inventar un webhook Izipay, ni
desactivar globalmente Origin/CSRF para recibirlo. Una excepción futura debe ser
estrecha, autenticada y verificada en sandbox antes de incorporarse.

**Alternativas**: 202 con ticket sin adaptar cliente, callback del navegador como pago,
simulación accesible en producción o confirmación manual administrativa quedan descartadas.

## R08 — Verificación, evolución y puertas

**Decisión**: pruebas de reglas antes de implementación; PG/HTTP reales con barreras y
estado final; E2E móvil/escritorio y aceptación humana diferenciadas. Reutilizar
scripts, harness y Actions; añadir solo config/step de matrícula cuando existan.
La guía [quickstart](quickstart.md) no es evidencia de ejecución.

Migración futura aditiva posterior a 0005; conservar 0001–0005, cuentas/configuración
y volumen aislado. RP004 no produce SQL ni modelos Prisma. Reloj/conciliación RP005/006
y matriz RV001 deben revisarse antes de tareas/análisis; no saltar a implementación.
Izipay/economía antes de cobros reales, D10 antes de afirmar capacidad y D13 antes de
demo persistente/publicación siguen siendo puertas, no incumplimientos ocultados.

## Fuentes primarias revisadas

Fuentes técnicas consultadas el 2026-10-30; las decisiones del diseño son inferencias
aplicadas al código local, no garantías del producto demostradas por esas fuentes.

- [READ COMMITTED, PostgreSQL 16](https://www.postgresql.org/docs/16/transaction-iso.html): instantáneas por sentencia.
- [Locks explícitos, PostgreSQL 16](https://www.postgresql.org/docs/16/explicit-locking.html): orden consistente y duración de locks.
- [SELECT, PostgreSQL 16](https://www.postgresql.org/docs/16/sql-select.html): límites de SKIP LOCKED para una cola con prioridad estricta.
- [Funciones temporales, PostgreSQL 16](https://www.postgresql.org/docs/16/functions-datetime.html): reloj actual frente a inicio de transacción.
- [CREATE INDEX, PostgreSQL 16](https://www.postgresql.org/docs/16/sql-createindex.html): inmutabilidad de expresiones/predicados.

Versiones y convenciones locales: [package raíz](../../package.json),
[API](../../apps/api/package.json), [web](../../apps/web/package.json),
[arquitectura](../../ops/lint/import-boundaries.mjs),
[transacciones](../../apps/api/src/infrastructure/database/academic-transaction.ts) y
[CI existente](../../.github/workflows/v00-linux.yml).
