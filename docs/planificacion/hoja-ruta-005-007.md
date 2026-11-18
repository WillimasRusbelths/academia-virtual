# Hoja de ruta: 005 clases/chat → 006 pulido → 007 despliegue y validación

2026-11-17, America/Lima. Dirección solicitada por el responsable durante specify
de 005. **En esta pasada se termina la especificación de 005 y se documentan los
dos incrementos siguientes.** No se crean ramas ni implementaciones de 006/007,
se contrata infraestructura o se publica en producción. El puntero de Spec Kit
permanece en 005; esta hoja no sustituye specify/plan/tasks de los futuros specs.

Actualización de implementación (2026-11-18): T001–T017 de 005 completadas
(base, contratos/persistencia, fixtures, permisos/participantes y fundamentos).
La matriz del coordinador pasa; faltan operaciones, transporte y recorridos completos.
[Último bloque](../../specs/005-clases-chat/evidence/t014-t017.md). [Resultados](../../specs/005-clases-chat/evidence/t005-t007.md).
Clases/chat y su aceptación siguen pendientes; no se inició 006/007.

## Secuencia y dependencias

**Aclaración posterior V04 — proveedor de video**: YouTube Live + OBS se usará
como prueba del MVP. Cloudflare se prevé para una etapa posterior y queda fuera
del alcance de 005, 006 y 007; no se exige implementarlo o contratarlo para esos
incrementos. Conservar la integración desacoplada facilita esa evolución, sin
prometer compatibilidad ya implementada. Distinguir la reproducción de prueba
de YouTube de la protección futura. V05 aprobó después la propuesta concreta y
constitución 2.0.0: controles propios y límite externo explícito; D07/D08 siguen
pendientes de evidencia real. Validación académica pendiente si afecta evaluación.

| Incremento | Alcance y salida exigida | Qué puede avanzar sin esperar otras brechas |
| --- | --- | --- |
| 005 — Clases en vivo y chat por grupo | [Spec, plan y tareas preparados](../../specs/005-clases-chat/spec.md); T001–T017 completadas; fundamentos verificados y gestión manual/acceso/chat/moderación pendientes | Gestión/chat pueden avanzar sin cuenta/señal de ensayo YouTube; el enlace externo compartible no se presenta como video protegido |
| 006 — Pulido de la aplicación | Revisión de paneles por rol, clasificación de consultas y brechas; alcance final acotado, diseño coherente y regresión de pantallas anteriores/005 operativas | Pulir pantallas existentes y componentes comunes aunque una tarjeta de clases o función nueva siga pendiente |
| 007 — Despliegue y validación del MVP | Spec separado para entorno de pruebas, seguridad/configuración, migración/recuperación, costo, recorridos e integraciones y volumen/carga | Preparar documentación y pruebas aisladas; no contratar/publicar ni acreditar el MVP completo con funciones o puertas sin validar |

Finalizar specify de 005 no es implementar ni aceptar 005. D07/D08 (protección y
viabilidad del video), D02 (proveedor de pagos), D10 (rúbrica/capacidad) y D13
(operación recuperable) conservan sus evidencias y condiciones. 007 recogerá y
comprobará los pendientes operativos heredados, sin marcar retroactivamente tareas
de 001–004 ni omitir decisiones de sus responsables.

## 005: alcance que queda cerrado documentalmente

- Cuatro historias: preparar/conducir sesión, entrar/seguir clase autorizada,
  intercambiar/recuperar chat y moderar. Son 24 escenarios, 23 FR y ocho SC.
- Sesiones manuales por docente actual habilitado de su grupo o administrador;
  una en curso por grupo, inicio/finalización explícitos y estados terminales.
- Matrícula vigente del grupo y permiso actual para entrar, recibir contenido y
  participar; aislamiento entre clases, revocación y fin original exacto de 003.
- Chat textual con confirmación/repetición segura y recuperación; finalizado,
  historial de solo lectura mientras siga vigente el acceso. Ocultación de
  mensajes y silencio/rehabilitación del alumno solo durante esa clase.
- Ensayo YouTube real con negativas propias de aula/referencia/chat y límites
  externos conforme a V05/constitución 2.0.0. La [revisión inicial histórica](../../specs/005-clases-chat/video-feasibility.md)
  no demuestra protección; el [registro de adopción](../../specs/005-clases-chat/evidence/video-scope-adoption.md)
  documenta el cambio explícito, sin incluir Cloudflare o video protegido completo.
- No incorpora paneles agregados globales, asistencia/notas, nuevas reglas de
  pagos, grabaciones, participación audiovisual del alumno o despliegue del MVP.

## 006: pulido con revisión previa de paneles

La [revisión inicial por alumno/docente/administrador](revision-paneles-006.md)
contrasta datos, permisos, acciones, código y pruebas. Debe actualizarse al
terminar 005 **antes de fijar el alcance final de 006**. Cada necesidad se clasifica:

1. Ordenar datos y enlazar acciones ya existentes: incluir como pulido y probar
   navegación, permisos reales y regresión. Ejemplos: cursos desde matrículas,
   grupos del docente y accesos administrativos existentes.
2. Consulta pequeña sobre datos/permisos actuales: evaluar e incluir solo con
   tarea explícita y prueba. Q006-01/Q006-02 son candidatas, no implementadas ni
   aprobadas automáticamente por esta hoja. No añadir privilegios para ahorrar una consulta.
3. Regla, permiso o función importante ausente: registrar brecha, dueño y spec
   recomendado. Próxima sesión/chat se resuelven en 005; padrones/asistencia o
   informes económicos requieren ampliación funcional aparte. No bloquean el resto.

### Pulido transversal obligatorio

- Inventariar pantallas públicas y de identidad (login, registro, verificación,
  recuperación/contraseña), perfil/inicio, cuentas, catálogo/oferta/grupos,
  reserva/órdenes/matrículas, precios/compromisos/incidencias, materiales y clases/chat
  cuando estén operativas. Unificar tipografía, espaciado, controles y jerarquía.
- Navegación por rol, enlaces profundos/recarga, volver al listado y estado activo;
  ninguna acción de otro rol ni destino que simule una función ausente. El backend
  sigue autorizando; ocultar navegación no sustituye sus permisos.
- Escritorio y móvil: comprobar al menos anchos de 360, 768 y 1280 píxeles; reflujo,
  formularios, tablas/listas y acciones legibles sin desbordamiento accidental.
  La emulación no acredita observación en teléfono físico.
- Teclado completo, foco visible y recuperado tras acciones/errores, etiquetas,
  estructura de encabezados y avisos de estado accesibles; contrastes verificables.
  Revisar flujo con lector de pantalla y documentar herramientas/dispositivos reales.
- Estados de carga, vacío, error, confirmación, conflicto, incertidumbre,
  desconexión y acceso perdido. Mantener borradores cuando corresponda; no repetir
  escrituras o pagos automáticamente al refrescar, reconectar o volver a iniciar sesión.
- Regresión de los recorridos existentes, denegaciones por rol/grupo/cuenta,
  vencimiento/revocación y respuestas tardías. Probar adaptabilidad/accesibilidad
  con interacción y observación humana, distinguiendo ambas de tests automatizados.

Salida de 006: inventario y matriz de paneles actualizados, consultas incluidas
con su contrato/prueba, brechas derivadas, pantallas pulidas y regresión aprobada.
Una brecha aislada no impide aceptar el pulido independiente; la funcionalidad
ausente queda explícita y no se declara completada mediante una tarjeta.

## 007: spec separado de despliegue y validación del MVP

Su futura especificación debe incluir historias de preparar el entorno de pruebas,
actualizar/restaurar, ejecutar recorridos por rol y evaluar volumen/carga/costo.
Es un incremento operativo independiente del pulido visual; no un permiso de
publicación productiva o compra dado en esta pasada.

### Entorno, configuración y operación que deberá definir

| Área | Definición y evidencia exigidas en 007 |
| --- | --- |
| Entorno de pruebas | Destino autorizado, región, CPU/RAM/disco/red, duración, límites del proveedor, datos ficticios, accesos de operador y aislamiento del entorno local/productivo; versión por commit e imágenes identificadas |
| Web/API | Web y API bajo mismo origen controlado, rutas/SPA, reverse proxy, límites/timeouts de JSON/binarios y conexiones persistentes; no publicar puertos internos de BD ni relajar CSRF/autorización para probar |
| HTTPS | Dominio/origen y DNS acordados, certificado válido/renovación, redirección, cookies y cabeceras acordes al transporte, comportamiento de proxy/conexiones y rechazo de orígenes ajenos comprobados |
| Base de datos | Versión compatible, persistencia de volumen, roles runtime/migración separados, permisos mínimos, pool, índices y espacio para población/materiales/WAL/dumps; monitoreo de conexiones/bloqueos |
| Secretos | Inventario por servicio, provisión fuera de Git, custodia, separación de entornos, rotación/revocación, recuperación y logs saneados; nunca volcar valores en informes |
| Migraciones | Copia consistente previa, mantenimiento de escritores, upgrade desde versión de partida real, checksums preservados, comprobación de salud e invariantes; fallo deja destino en cuarentena, sin asumir down migration segura |
| Copias | Completar D13: origen/destino externo concreto y disponible, custodios de copia/clave separados, frecuencia, retención, espacio, RPO/RTO, evidencias cifradas y responsables de incidentes |
| Recuperación | Restaurar desde copia externa a destino nuevo, verificar datos y bytes de materiales/mensajes, invalidar sesiones/secretos restaurados y revisar decisiones posteriores perdidas; medir y contrastar RPO/RTO antes de abrir |
| Observación y detención | Relojes, intervalos y pérdidas de muestreo, salud, CPU/RAM/I/O/red por componente, BD y generador separados; detener ante exposición, corrupción, destino incorrecto, falta de espacio o límite de gasto |
| Costo | Total acumulado del proyecto y ventana: VPS, dominio/certificado si tiene costo, generador si se contrata, tráfico, almacenamiento/copias, correo y otros servicios; fuente/fecha/moneda e impuestos/conversión cuando aplique; total máximo S/300 |

El equipo externo elegido para copias aún requiere identificación y comprobación.
El custodio de la copia será el encargado receptor del software, según respuesta
del responsable; la custodia de la clave aún no fue definida. Para carga, una
laptop puede ser el generador separado **cuando el sistema evaluado esté en un
VPS/equipo distinto**, si sostiene el patrón sin saturarse. Un contenedor en la
misma laptop que aloja API/BD no cumple esa separación física. No se contrata un
segundo VPS por defecto ni se asume que la laptop soporte 2500 usuarios simulados.

### Recorridos e integraciones: registrar real, simulado, pendiente o fallido

| Flujo | Qué debe probarse y cómo declarar límites |
| --- | --- |
| Visitante/alumno | Registro/verificación/login, oferta, reserva conjunta, orden/plazo, estado de pago, matrícula, materiales y clase/chat propios; historial y pérdida de permiso, referencias ajenas y logout |
| Docente | Login, grupos propios, materiales y sesión/emisión/chat/moderación de 005; anterior/ajeno/inhabilitado denegados, sin acceso financiero administrativo |
| Administrador | Cuentas, oferta, precios/compromisos/incidencias y seguimiento, materiales y gestión de clases; conservación de bloqueos y auditoría, sin inventar resolución económica |
| Correo | Mailpit es simulación local; entrega externa, remitente, recuperación, límites y costo necesitan prueba propia para calificarse como integración real |
| Pagos | Adaptador/proveedor Izipay y sandbox se validan por separado según 003/D02. La carga usa pagos simulados; nunca es evidencia de integración real ni genera cobros reales |
| Video | Ensayo YouTube con reproducción real, negativas propias según 005 y límites externos declarados; iframe/página o doble no acredita consumidores reales. No exige protección multimedia externa al ensayo ni Cloudflare en el MVP |
| Chat | Clientes compatibles con el protocolo realmente implementado y autorización de clase; conectividad genérica no acredita intercambio ni recuperación |

Incluir recorrido de extremo a extremo con personas reales por rol y medios
observados; referencias/versiones/hash sin credenciales. Las funciones/integraciones
ausentes se reportan y derivan al dominio; desplegar no las implementa ni permite
aceptar el MVP completo. Registrar también la ejecución remota de CI si se realiza.

## Metas de volumen y carga para 007

**Metas solicitadas:** al menos **15.000 cuentas registradas** y **2.500 usuarios
concurrentes activos**. Son objetivos de evaluación, no capacidad conseguida. Los
patrones y umbrales siguientes son una **línea base propuesta, numérica y comprobable**
para el futuro 007; deben contrastarse con la rúbrica del profesor/D10 antes de
aceptarlos como criterios definitivos. No alteran criterios históricos de otros specs.

### Población y definición de actividad

- Persistir al menos 15.000 cuentas ficticias con índices y relaciones reales de
  curso/grupo/matrícula/sesión requeridas por cada escenario. Registrar conteos por
  rol/estado y huella de almacenamiento; suficientes cuentas activas/verificadas
  para los participantes distintos de cada corrida. No crear cuentas sobre datos reales.
- En la meseta, medir cada 5 segundos usuarios distintos autenticados con al menos
  una operación real autorizada a Academia en los últimos 60 segundos; mantener
  2.500 durante toda la meseta. El patrón de cada cohorte tiene actividad cada
  10–30 segundos. Reportar intentos/rechazos y usuarios con operaciones exitosas
  por separado; 2500 VU creados o cookies guardadas no demuestran actividad.
- Contabilizar sesiones, conexiones abiertas, mensajes, peticiones en vuelo y RPS
  aparte. En combinado, los identificadores de cohortes no se solapan: sumar personas
  únicas, no las distintas actividades del mismo alumno.
- Fase inicial propuesta por corrida: 5 minutos de calentamiento, 5 minutos de
  rampa (500→1000→1500→2000→2500 por minuto), 15 minutos de meseta y 5 minutos de
  recuperación; dos repeticiones con estado inicial controlado y métricas por fase.
  No llegar a la meseta objetivo es un resultado no aprobado, no motivo para ocultarla.

### Escenarios definidos por comportamiento

| ID | Participantes y patrón objetivo durante meseta | Qué evalúa y qué no |
| --- | --- | --- |
| E007-01 Volumen | ≥15.000 cuentas persistidas; consultas paginadas y por identificador con roles y datos ficticios representativos | Volumen, permisos, tamaño/índices y costo de consultas; no significa 15.000 conectados |
| E007-02 Reservas/acceso | 2500 alumnos distintos: leer oferta/inventario u orden cada 10 s; cada uno hace una reserva válida durante la corrida y consulta su resultado hasta confirmación/rechazo autoritativos; subconjunto acordado usa pago simulado y comprueba matrícula | Academia atiende sesiones, lecturas, admisión, orden y conciliación. Preparar suficientes grupos/plazas/horarios no conflictivos; separar competencia controlada por último cupo y errores de negocio esperados |
| E007-03 Clases/chat | 2450 alumnos y 50 docentes: 50 grupos con 49 alumnos cada uno, una clase en curso por grupo; conexiones de chat autorizadas, lectura de clase cada 10 s y un mensaje por participante cada 30 s; reconectar 5% de clientes una vez cada 5 min | 2500 activos en Academia, entrega/orden/aislamiento y recuperación de chat. Primero se puede medir sin video, declarando esa exclusión; eso no cumple la prueba de reproducción |
| E007-04 Combinado | Cohortes distintas: 2000 alumnos en 40 clases de 50 (consultar clase cada 10 s, mensaje cada 30 s), 400 alumnos en reservas/órdenes como E007-02, 90 docentes (40 conducen/moderan; 50 consultan grupos/materiales cada 15 s) y 10 administradores (listados cada 15 s) = 2500 | Mezcla completa de carga propia de Academia. Cuentas, asignaciones y horarios válidos; todas las actividades exigidas deben existir y ejecutarse antes de aceptar un combinado |
| E007-05 Video externo | Sobre E007-03 o E007-04, cohortes autorizadas de espectadores que realmente reproduzcan señal del docente; medir 2450 o 2000 reproducciones objetivo, respectivamente, además de emisiones realmente activas | El proveedor externo distribuye video; reportar sus consumidores, señal, calidad, tráfico y fallos separados. Si solo es viable un subconjunto, reportarlo y mantener pendiente la parte no medida del combinado |
| E007-06 Materiales | Subensayo con dos actores autorizados distintos, PDF/JPEG/PNG válidos de tamaños 100 KB/1 MB/5 MB/20 MB y entropía medida; hasta dos transferencias simultáneas por proceso y una por actor, esperar la anterior y al menos 5 s entre intenciones nuevas de cada actor; alternar carga/descarga 15 min, con saturación aparte | Integridad/latencia/recursos de binarios; no sumar sus usuarios a 2500 como si fueran personas adicionales ni forzar 2500 transferencias sobre una admisión de dos |
| E007-07 Integridad/fallos | Subensayos separados de último cupo, repetición, revocación/vencimiento, reconexión, retiros, caída de dependencias y recuperación desde copia | Cero acceso indebido, sobreventa/duplicados y cambios parciales; resultados negativos intencionales no se mezclan con tráfico principal válido |

La matrícula de las clases no se crea con una reserva sin pago verificado. En carga
puede generarse por el mecanismo de prueba autorizado de 003 y se declara simulado.
Preparar al menos 50 grupos para 2500 reservas si todos deben confirmarse con
capacidad máxima 50; una selección de varios cursos necesita aún más inventario.
Para el último cupo usar un subconjunto específico con resultado esperado definido.

### Límites propuestos de latencia, errores y consistencia

Medir de extremo a extremo desde el generador y por operación durante meseta,
incluyendo respuestas fallidas/timeouts en los conteos y sin borrar muestras lentas.
Informar muestras, p50/p95/p99 y tasa lograda; no sumar percentiles de corridas.

| Operación / indicador | Límite de la línea base propuesta para 007 |
| --- | --- |
| Sesión, listados y detalle de cursos/grupos/órdenes/matrículas/materiales/clase | p95 ≤750 ms y p99 ≤1500 ms, por familia |
| Login gradual | p95 ≤3 s y p99 ≤6 s, con cuotas activas y rampa; no exige 2500 verificaciones simultáneas de contraseña |
| Reserva válida hasta decisión autoritativa | p95 ≤3 s y p99 ≤6 s desde envío autenticado hasta confirmación/rechazo definitivo, incluyendo admisión/consulta; un recibo de ingreso no se cuenta como reserva confirmada |
| Comandos de clase/moderación y consultas de chat | p95 ≤1 s y p99 ≤2 s hasta resultado durable/visible según operación |
| Mensaje de chat confirmado y recibido por destinatario autorizado | p95 ≤1 s y p99 ≤2 s, desde envío hasta recepción; medir confirmación y entrega también por separado con relojes correlacionados |
| Reconexión y recuperación de confirmados | p95 ≤3 s y p99 ≤5 s desde conexión autorizada hasta historial recuperado, sin duplicados ni huecos silenciosos |
| Tráfico principal válido de Academia | Errores inesperados y timeouts <1% por operación; 429/503 de saturación cuentan como fallos en ese tráfico, sin reclasificarlos como éxitos |
| Transferencia de materiales completa | p95 ≤5 s para ≤1 MB, ≤15 s para >1–5 MB y ≤60 s para >5–20 MB; bytes/hash completos en 100% de las exitosas. Registrar ancho de banda y no usar la latencia de JSON para un archivo de 20 MB |
| Inicio y continuidad de video externo | Inicio p95 ≤5 s desde solicitud de reproducir; fallos de inicio <1%; tiempo detenido por buffering ≤1% del tiempo reproducido observado por consumidor, excluida pausa voluntaria. Registrar resolución/bitrate, latencia de emisión observada y diferencias entre descarga y reproducción |
| Autorización e integridad | Cero entregas nuevas indebidas, cruces de clase, sobreventas, matrículas/efectos duplicados, archivos/mensajes corruptos o pérdidas silenciosas de confirmados |

Los errores de negocio/denegaciones intencionales tienen su propio subescenario y
oráculo, informando cantidades/códigos. Si ocurren inesperadamente en una solicitud
válida del principal, cuentan como fallos. No aceptar un perfil con cero éxitos
porque sus rechazos sean seguros. Los límites de video son métricas del proveedor
y experiencia del reproductor; no se convierten en latencia de API propia.

La prueba debe separar tráfico: login/matrícula/autorización/clases/chat y sus
servidores son Academia; señal y reproducción externa son el proveedor. Si la
solución elegida hace pasar video por el VPS, medir y presupuestar ese tráfico
propio adicional; no seguir llamándolo externo para ocultar costos o saturación.
V05/constitución 2.0.0 exige negativas directas/vencidas de recursos propios y
reproducción real del ensayo, declarando límite del enlace externo. Protección
multimedia completa se valida en un incremento posterior, fuera del MVP.

### Aprobación, discrepancias y resultados

- La [planificación RC-01/RC-02](reservas-capacidad.md) y la constitución 1.2.1 ya
  establecen ≥15.000/2500. No hay cambio numérico frente a esas metas actuales.
- [AC01](../01-analisis-de-sistema/04-atributos-de-calidad.md) y el
  [protocolo/informe de identidad de 1000](../../specs/001-identidad-acceso-roles/evidence/load.md)
  corresponden a otro escenario histórico. Sus criterios de identidad y resultados
  no se reescriben ni se convierten en prueba de 2500 o del MVP completo.
- Los nuevos límites propuestos para 007 no convierten en aprobados/fallidos de
  nuevo ensayos cerrados con otros criterios. Antes de ejecutar 007, contrastar
  rúbrica D10, mezcla, duración, calidad y costo; registrar cambios prospectivos
  con versión y responsable. No presentar esta tabla como aprobación del profesor.
- Informe por corrida: commit/configuración, entorno/destinos, población, usuarios
  únicos activos y exitosos, VU, operaciones, RPS/en vuelo, latencias/errores,
  recursos de cada componente/generador, tráfico del proveedor y costo acumulado.
  Exigir invariantes posteriores y aceptar, rechazar o dejar no probado cada criterio.
- Si el presupuesto o medios no permiten medir el objetivo, registrar el alcance
  menor real y la meta incumplida/no demostrada. No extrapolar por multiplicación
  de pruebas aisladas, ventanas aceleradas o número de páginas abiertas.

## Criterios para abrir cada siguiente etapa

Antes del alcance final de 006: actualizar revisión por rol contra lo realmente
implementado y probado, elegir consultas pequeñas y derivar brechas. Antes de
aceptar 006: regresión, accesibilidad y evidencia humana en el alcance observado.
Antes de contratar o ejecutar 007: especificación propia, rúbrica/escenarios
versionados, destino y ventana autorizados, estimación/cap de gasto y responsables
D13. Antes de publicar el MVP: recorridos e integraciones exigidos, HTTPS/secretos,
recuperación desde copia externa comprobada, evaluación de capacidad con límites
reales y aceptación de pendientes por su alcance; no se publica producción por
haber escrito esta hoja de ruta.
