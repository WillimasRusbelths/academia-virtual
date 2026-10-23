# Constitución de academia-virtual

## Principios fundamentales

### I. Desarrollo por funcionalidades pequeñas

Cada funcionalidad DEBE recorrer especificación, aclaraciones, plan, tareas,
implementación y verificación mediante Spec Kit. Si no necesita aclaraciones, se DEBE
registrar esa conclusión. El alcance y los criterios de aceptación DEBEN existir antes
de implementar. La documentación del proyecto DEBE escribirse en español y distinguir
lo propuesto, lo implementado y lo verificado. Esto permite entregar un trabajo evaluable
dentro del plazo académico.

### II. Autorización en el backend

El backend DEBE verificar permisos según rol, pertenencia y matrícula cuando corresponda
en cada operación protegida, incluido el acceso al chat por clase. Los roles son
administrador, docente y alumno. Las restricciones visuales del frontend NO constituyen
autorización. La verificación DEBE incluir accesos permitidos y denegados, especialmente
intentos de acceder a recursos de otro alumno, grupo o curso.

### III. Precios y totales confiables

El servidor DEBE obtener los precios válidos, calcular los conceptos y el total de la
orden y conservar el detalle utilizado para cobrar. Los importes recibidos del cliente
NO DEBEN ser la fuente de verdad. El importe y la moneda confirmados por el proveedor
DEBEN corresponder a la orden antes de reconocer su pago.

### IV. Integridad de cupos y matrículas

La asignación de cupos y la creación de matrículas DEBEN impedir sobreventa y duplicados
mediante transacciones y restricciones de base de datos. La especificación DEBE definir
la identidad de una matrícula y el momento en que se ocupa o libera un cupo. Las pruebas
DEBEN cubrir competencia por el último cupo y solicitudes repetidas, verificando el estado
final persistido. El alumno DEBE reservar un cupo antes de pagar. Una reserva confirmada
por el servidor dura exactamente 24 horas (86 400 segundos desde esa confirmación);
el servidor DEBE persistir su inicio y vencimiento, sin depender del navegador.
El pago verificado confirma la matrícula; el vencimiento sin pago libera el cupo mediante
una política consistente de conciliación, sin doble consumo ni sobreventa.
Antes de implementar DEBEN resolverse o delimitarse reservas de varios cursos, orden de
llegada, pagos en el límite o tardíos, reembolsos, cancelaciones y abuso. La duración
confirmada no aprueba automáticamente esas decisiones ni una extensión del plazo.

### V. Confirmación de pagos

Una matrícula pagada SOLO DEBE activarse tras verificar el pago con el proveedor mediante
su mecanismo de autenticidad y confirmación, vinculándolo a la orden correcta. Una pantalla
de éxito o una redirección del navegador NO son evidencia suficiente. La integración DEBE
probar confirmaciones válidas, inválidas y pagos no confirmados.

### VI. Idempotencia de pagos

Los reintentos y las notificaciones de pago DEBEN procesarse de forma idempotente, incluso
si llegan simultáneamente o fuera de orden. Se DEBEN persistir identificadores y transiciones
de estado que eviten repetir efectos sobre órdenes, cupos y matrículas. Las pruebas DEBEN
demostrar que una confirmación repetida no duplica matrículas ni consume cupos adicionales.

### VII. Pruebas de pagos separadas

Las pruebas de carga DEBEN utilizar pagos simulados y cuentas de prueba. La integración
real DEBE validarse por separado en el sandbox de la pasarela seleccionada. NO se DEBEN
realizar cobros reales ni someter la pasarela a la carga del sistema. Izipay es la pasarela
elegida para el MVP desde el 2026-09-23; sustituye a Culqi, candidata inicial no integrada.
Su integración NO está implementada. Siguen pendientes tarifas finales, límites, acceso
al entorno de pruebas y habilitación de Yape para la modalidad contratada. NO se DEBE
presentar el servicio como ilimitado. Una simulación exitosa NO valida la integración real.

### VIII. Acceso protegido al video

El acceso a manifiestos y segmentos HLS DEBE exigir autorización acorde con la clase y
la matrícula aplicable, también al solicitar directamente sus URL. Ocultar enlaces NO es
control de acceso. Se DEBEN probar solicitudes autorizadas, no autorizadas y con autorización
vencida, según el mecanismo elegido. NO se DEBE prometer impedir grabaciones de pantalla.

### IX. Separación de entornos

Configuración, secretos y datos de desarrollo, demo y producción DEBEN mantenerse separados.
NO se DEBEN versionar credenciales ni archivos de entorno reales; los ejemplos compartidos
DEBEN carecer de credenciales. Las pruebas DEBEN usar datos de prueba. Esta separación NO
exige servidores permanentes por entorno: el desarrollo es local y los demás entornos
pueden habilitarse temporalmente dentro del presupuesto.

### X. Operación recuperable

Los cambios de base de datos DEBEN realizarse con migraciones controladas y versionadas.
Antes de una demo con datos persistentes o un despliegue público, DEBEN existir copias de
seguridad y evidencia de restauración, registros de errores sin secretos y un procedimiento
de actualización y recuperación. El procedimiento DEBE indicar cómo recuperar datos y
servicio ante una actualización fallida, sin asumir que toda migración es reversible.

### XI. Capacidad demostrable

Soportar 2500 usuarios concurrentes activos es un objetivo por validar. NO se DEBE afirmar que se
alcanza hasta disponer de resultados reproducibles para un escenario definido y criterios
de aceptación acordados con la rúbrica del profesor. Las conclusiones DEBEN limitarse a la
versión, infraestructura, duración y carga realmente medidas. El número de alumnos
registrados NO demuestra concurrencia y los usuarios virtuales NO equivalen automáticamente
a solicitudes por segundo ni a solicitudes simultáneas en vuelo. Se DEBEN distinguir
al menos 15 000 cuentas registradas (población persistida), usuarios activos durante una
ventana y mezcla de operaciones definidas, solicitudes concurrentes observadas y capacidad
de reservas (inventario/consistencia y tasa de confirmación). Una cifra no demuestra las otras.
La evidencia histórica de 1000 usuarios se conserva con sus perfiles, criterios y fallos;
no se rebautiza como validación de 2500 ni se elimina por el nuevo objetivo.

## Restricciones y orientación del proyecto

- El proyecto es un trabajo final de curso con un plazo de cuatro meses. El presupuesto
  de infraestructura y servicios es **S/300 en total**, reservado para despliegue y pruebas
  necesarias; NO es un presupuesto mensual ni garantiza operación permanente.
- La población requerida es de **al menos 15 000 cuentas registradas**; el objetivo es
  **2500 usuarios concurrentes activos**, todavía sin demostrar. Son magnitudes distintas.
  La oferta configura capacidad de **1 a 50** alumnos por grupo según PA-04 del spec 002;
  la capacidad configurada no calcula disponibilidad hasta implementar reservas/matrícula.
- El MVP comprende autenticación y roles; cursos, grupos, horarios y cupos; selección de
  varios cursos con órdenes desglosadas; matrículas; materiales; clases emitidas por el
  docente con participación de alumnos solo mediante chat; y paneles básicos por rol.
- Un pago por el total de la orden y una matrícula por cada curso adquirido constituyen
  una **propuesta pendiente de validación**, no una regla ya aprobada.
- La integración de Izipay DEBE permanecer separada de las reglas de órdenes y matrículas,
  para permitir cambiar de pasarela sin redefinir esas reglas. La elección del proveedor
  NO resuelve las decisiones de reservas, vigencia, reembolsos ni confirmación de pagos.
- La base técnica propuesta es React, TypeScript y Vite; NestJS y TypeScript como monolito
  modular; PostgreSQL con Prisma; Socket.IO autorizado por clase; OBS → SRS → HLS con
  HLS.js o reproducción nativa; Docker Compose local; y Nginx con HTTPS para publicación.
  Estas tecnologías DEBEN evaluarse en los planes; su registro NO acredita instalación
  ni viabilidad. Los cambios DEBEN justificar su relación con alcance, costo y evidencia.
- La viabilidad del video, su autorización, ancho de banda y costo DEBEN someterse a una
  prueba temprana antes de considerarse resueltos o comprometer alojamiento.
- NO se DEBEN incorporar microservicios, Kubernetes, Redis ni balanceadores sin una
  necesidad comprobada y una justificación documentada compatible con plazo y presupuesto.
- La dirección técnica propuesta mantiene NestJS, PostgreSQL y monolito modular;
  prepara VPS y acceso controlado durante apertura de matrícula. No implica contratación,
  despliegue ni una política de cola/FIFO aprobada. AWS se evaluará después con mediciones
  y presupuesto; no se adopta ni se prepara infraestructura AWS en este bloque.

El alcance detallado se registra en `docs/alcance-mvp.md` y las decisiones abiertas en
`docs/decisiones-pendientes.md`. Las decisiones que afecten una funcionalidad DEBEN resolverse
o delimitarse explícitamente antes de su implementación.

## Flujo de trabajo y validación

Cada funcionalidad DEBE producir una especificación verificable, resolver sus ambigüedades,
documentar un plan compatible con esta constitución y ordenar tareas antes de implementarse.
El flujo utiliza `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks` y
`$speckit-implement`, con revisión de consistencia mediante `$speckit-analyze` antes de
implementar. La verificación DEBE aportar evidencia de aceptación y de los principios
aplicables; ejecutar un comando NO equivale a aprobar sus resultados.

La validación de capacidad DEBE documentar por separado:

- **Reservas y matrícula:** operaciones con k6 desde otro equipo contra VPS, cuentas
  ficticias diferentes y pagos simulados; población de al menos 15 000 cuentas, carga
  activa y solicitudes en vuelo medidas por separado. Probar último cupo, duplicados,
  desconexión/reinicio, reserva exacta de 24 h, conciliación del vencimiento/pago y
  cancelación de grupos. Órdenes de varios cursos siguen sujetas a D01/D04. Comprobar
  precios, matrículas únicas, liberación correcta y ausencia de sobreventa al terminar.
  No sustituir la espera de 24 h por un smoke de identidad ni acortar la regla de producto.
- **Chat:** conexiones autorizadas por clase, distribución por grupos, frecuencia de
  mensajes, duración y reconexiones. La herramienta y el cliente de prueba DEBEN hablar
  el protocolo Socket.IO utilizado; una conexión WebSocket aislada no basta para validarlo.
- **Video:** consumidores que descarguen realmente manifiestos y segmentos HLS durante
  el período de medición, con la autorización prevista. Abrir 1000 páginas NO demuestra
  1000 reproducciones. Registrar tasa de descarga, calidad/bitrate, emisiones simultáneas,
  tráfico y fallos; distinguir descarga de segmentos de reproducción fluida en navegador.

Cada informe DEBE registrar versión del código, configuración y scripts reproducibles sin
secretos, infraestructura, duración, patrón y carga alcanzada, concurrencia, solicitudes
por segundo cuando corresponda, latencia, errores, recursos y consistencia de matrículas.
DEBE distinguir el consumo del generador de carga del sistema evaluado. Los criterios
definitivos, incluida la distribución de los 2500 usuarios activos entre actividades y las
condiciones de aprobación, DEBEN alinearse con la rúbrica del profesor antes de concluir
que el objetivo se cumple. Una prueba aislada NO acredita un escenario combinado no medido.

## Gobernanza

Esta constitución rige las especificaciones, planes, tareas, revisiones y entregas del
proyecto. Toda revisión DEBE comprobar los principios aplicables y enlazar su evidencia
o registrar un incumplimiento pendiente. Un trabajo que incumpla un principio obligatorio
NO DEBE presentarse como terminado. Las propuestas técnicas NO tienen el mismo estado
que las reglas obligatorias.

Una enmienda DEBE documentar motivo, texto anterior y propuesto, impacto en artefactos y
adaptaciones necesarias. La persona responsable del proyecto DEBE aprobarla antes de su
adopción; si cambia criterios de evaluación, DEBE validarlos con el profesor. La versión
y la fecha de última modificación DEBEN actualizarse manteniendo la fecha de ratificación.
El informe temporal de sincronización DEBE revisarse y retirarse antes del commit.

Se utiliza versionado semántico: MAJOR para eliminar o redefinir principios de forma
incompatible; MINOR para añadir principios o ampliar materialmente las obligaciones;
PATCH para aclaraciones y correcciones sin cambio de obligaciones. La versión 1.0.0
corresponde a la primera adopción, en sustitución de una plantilla sin ratificar.

**Versión**: 1.2.0 | **Ratificación**: 2026-09-22 | **Última modificación**: 2026-10-23
