# Alcance del MVP de academia-virtual

> **Nota de vigencia — 2026-10-01:** se conserva el alcance funcional de este documento.
> Las menciones siguientes a «esta etapa» y a tecnologías aún no instaladas describen
> el estado histórico del 2026-09-23. Ya existe una base técnica con V00 nativo y T009/T010
> documentados, sin historias de negocio implementadas. R12 establece Windows nativo,
> PostgreSQL 16.14 y Mailpit. El responsable confirma Docker operativo en su computadora;
> la ejecución/validación de la aplicación con Docker y V00-L siguen sin evidencia. Véanse el
> [inventario y decisiones vigentes](../arquitectura/arquitectura-inicial.md) y la
> [evidencia local](../ops/local/compatibility.md). Esta nota no aprueba reglas pendientes
> ni acredita integraciones o capacidad de 1000 concurrentes.

Estado al 2026-09-23: documentación y primera especificación. La aplicación no está implementada y su
capacidad no está validada. Este alcance está sujeto a la
[constitución](../.specify/memory/constitution.md).

## Objetivo y restricciones

Construir una academia virtual como trabajo final de curso durante cuatro meses, con
desarrollo local. Se prevén aproximadamente 1000 estudiantes y grupos de 40 a 50 alumnos
por curso. El objetivo de 1000 usuarios concurrentes requiere pruebas reproducibles bajo
un escenario definido y acordado con el profesor.

El presupuesto de infraestructura y servicios es **S/300 en total**, destinado al despliegue
y las pruebas necesarias. No financia una operación permanente. Las decisiones de alojamiento
deben considerar duración, transferencia, almacenamiento y pruebas, sin asumir servicios
gratuitos ni precios todavía no comprobados.

## Funcionalidades previstas

| Área | Alcance previsto | Pendiente de definir |
| --- | --- | --- |
| Identidad | Registro de alumnos, correo verificado, sesiones, recuperación por correo, un rol por cuenta y gestión administrativa; permisos en backend. | Plan e implementación de la especificación de identidad; viabilidad y costo del envío de correo. |
| Oferta académica | Cursos, grupos, horarios y cupos; grupos de 40 a 50 alumnos. | Cambios de grupo, reglas de horarios y reservas. |
| Orden y matrícula | Selección de varios cursos, precio por curso, conceptos y total calculados por servidor. | Regla definitiva de pago, vigencia y momento de asignación de cupos. |
| Pago | Propuesta: un pago por el total de la orden y matrícula por cada curso adquirido. Izipay elegida para el MVP; integración no implementada. | Validación de la regla de pago, tarifas finales, límites, acceso al entorno de pruebas y habilitación de Yape para la modalidad contratada. |
| Materiales | Acceso a materiales por curso sujeto a autorización. | Formatos, límites, almacenamiento y reglas de publicación. |
| Clase en vivo | Emisión del docente; alumnos como espectadores con participación solo por chat. | Calidad, latencia, simultaneidad, costo y mecanismo de autorización HLS. |
| Paneles | Vistas básicas para cada rol según sus operaciones autorizadas. | Acciones y datos mínimos por panel. |

## Exclusiones de esta etapa y del MVP

En esta etapa solo se prepara documentación y el repositorio. No se implementa la
aplicación, se contratan servicios ni se despliega infraestructura.

Quedan fuera del MVP, salvo modificación explícita del alcance:

- Audio, cámara o transmisión de pantalla de alumnos en las clases.
- Grabación automática, biblioteca de grabaciones y garantías contra copia de pantalla.
- Infraestructura dimensionada para 10 000 usuarios u operación permanente financiada
  con los S/300.
- Funciones adicionales como exámenes, certificados o aplicaciones móviles nativas.
- Microservicios, Kubernetes, Redis y balanceadores sin una necesidad comprobada.

## Propuesta técnica inicial

Todas las opciones siguientes están propuestas; todavía no se han instalado ni validado
como parte de la aplicación.

| Componente | Propuesta | Validación necesaria |
| --- | --- | --- |
| Frontend | React, TypeScript y Vite. | Flujos mínimos y compatibilidad de reproducción. |
| Backend | NestJS y TypeScript; monolito modular. | Límites de módulos, autorización y comportamiento concurrente. |
| Datos | PostgreSQL y Prisma. | Transacciones, restricciones, migraciones y restauración. |
| Chat | Socket.IO con autorización por clase. | Aislamiento de clases, reconexión y carga definida. |
| Video | OBS del docente → SRS → HLS → HLS.js o reproducción nativa. | Autorización de manifiestos y segmentos, latencia, consumo y costo. |
| Entorno local | Docker Compose. | Arranque reproducible y configuración sin secretos versionados. |
| Publicación | Nginx y HTTPS. | Alojamiento, costo total y controles de acceso de extremo a extremo. |

La elección de Izipay del 2026-09-23 sustituye a Culqi, candidata inicial; no acredita
contratación ni capacidad ilimitada. La integración del proveedor debe quedar separada
de las reglas de órdenes y matrículas para permitir sustituirlo. Los pendientes y el
contexto de esta decisión se registran en D02 de decisiones pendientes.

El diseño debe conservar límites de módulos que permitan evolucionar sin anticipar
infraestructura distribuida. La viabilidad del video exige una prueba temprana: una
emisión autorizada, reproducción real, solicitudes directas sin permiso y medición del
tráfico. Esa prueba no demuestra por sí sola 1000 espectadores.

## Evidencia requerida para la capacidad

| Escenario | Carga que debe describirse | Evidencia específica |
| --- | --- | --- |
| Matrícula | Cuentas diferentes, selección de cursos, órdenes y pagos simulados con k6. | Latencia, errores, cupos finales, matrículas únicas y totales correctos. |
| Chat | Clases/grupos, conexiones, mensajes y reconexiones con cliente compatible con Socket.IO. | Autorización, entregas, latencia, errores y recursos consumidos. |
| Video | Emisiones simultáneas, calidad, bitrate y consumidores descargando segmentos HLS. | Tráfico, segmentos recibidos, fallos y observaciones de reproducción real. |

Cada informe debe registrar versión del código, infraestructura, scripts/configuración,
duración, carga alcanzada, latencia, errores, consumo de recursos y consistencia de matrículas
o su no aplicabilidad justificada. Los usuarios virtuales no equivalen automáticamente a
solicitudes por segundo. Abrir páginas no demuestra reproducciones simultáneas.

El escenario de aceptación de 1000 usuarios, sus umbrales y su duración se acordarán según
la rúbrica del profesor. No se extrapolarán pruebas separadas a una carga combinada sin
medirla. La integración de pagos se validará aparte en el sandbox de la pasarela.

## Orden inicial de trabajo

La primera funcionalidad en especificación es
[identidad, autenticación y acceso por roles](../specs/001-identidad-acceso-roles/spec.md):
acceso de administrador, docente y alumno, sesión y denegación de operaciones ajenas al rol.
La pertenencia a cursos y la matrícula se incorporarán cuando se especifiquen esos dominios.

La viabilidad del video debe investigarse al inicio del proyecto, antes de cerrar la
arquitectura y contratar alojamiento. Las siguientes funcionalidades se dividirán en
incrementos de oferta académica, órdenes/matrícula, pagos, materiales y clases/chat/paneles,
según dependencias y resultados de esa investigación.

Las decisiones abiertas se mantienen en [decisiones pendientes](decisiones-pendientes.md).
