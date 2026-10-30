# Alcance del MVP de academia-virtual

**Vigente al 2026-10-29**, según solicitud confirmada y
[constitución 1.2.0](../.specify/memory/constitution.md). Identidad conserva sus
checkpoints y aceptación integral pendiente; oferta [002](../specs/002-oferta-academica/tasks.md)
tiene sus cuatro historias con [puerta automática aprobada](../specs/002-oferta-academica/evidence/automated.md)
y [recuperación aislada verificada](../specs/002-oferta-academica/evidence/recovery.md).
Su observación humana SC-002/T073 y aceptación integral siguen pendientes.
Reservas/matrícula/pagos/video y capacidad objetivo no están demostrados. [Planificación detallada](planificacion/reservas-capacidad.md) y
[backlog](planificacion/tasks.md). Evidencia histórica de 1000 intacta, T103 ejecución/informe completa.

## Objetivo y restricciones

Construir una academia virtual como trabajo final de curso durante cuatro meses, con
desarrollo local. Se requieren **al menos 15 000 cuentas registradas** y se plantea
**2500 usuarios concurrentes activos**, pendiente de demostrar bajo escenario y rúbrica
D10. Cuentas persistidas, usuarios activos, solicitudes en vuelo/RPS e inventario/tasa
de reservas son magnitudes diferentes. Oferta mantiene capacidad configurada 1–50
por grupo (PA-04), sin inventar ocupación/disponibilidad.

El presupuesto de infraestructura y servicios es **S/300 en total**, destinado al despliegue
y las pruebas necesarias. No financia una operación permanente. Las decisiones de alojamiento
deben considerar duración, transferencia, almacenamiento y pruebas, sin asumir servicios
gratuitos ni precios todavía no comprobados.

## Funcionalidades previstas

| Área | Alcance previsto | Pendiente de definir |
| --- | --- | --- |
| Identidad | Registro, verificación, sesiones, recuperación y administración implementados; un rol y permisos backend. | T104/T108, bootstrap histórico, SMTP real/costo; no aceptación integral. |
| Oferta académica | Cuatro historias implementadas: preparación, publicación/consulta, mantenimiento y grupos propios del docente; horarios America/Lima, capacidad 1–50, revisión docente, retiro previo y cancelación terminal. | T073 humano y T074 integral pendientes; [H-CAP-01 corregido automáticamente](../specs/002-oferta-academica/evidence/h-cap-01.md). Documentación/protocolo T070–T072 preparados. D04 y conflictos de matrícula D06 en otro spec; capacidad no es disponibilidad. |
| Reserva, orden y matrícula | Reserva previa al pago por 24 h exactas desde confirmación servidor; varios cursos todos juntos o ninguno. Precio por curso en PEN fijado por administrador y conservado durante la reserva; una orden desglosada/un pago total/una matrícula por curso y grupo elegido. Solo una orden con reservas vigentes por alumno. Vencimiento sin pago válido libera cupo por conciliación consistente. | RP003 conserva prioridad, condiciones/unicidad entre compras, resolución económica, cancelación voluntaria/cambios, reiteraciones/excepciones, permisos y D03/D06 pendientes; no implementado. No cancelar grupos con reservas vigentes, matrículas o incidencias de pago sin resolver. |
| Pago | Izipay elegida para el MVP, integración pendiente. Un pago total por orden; solo verificación terminada antes de vencer permite matrícula. Exactamente al vencer o después, incidencia sin matrícula ni reembolso automáticos ni extensión. | Resolución económica/responsables de incidencias y otros pagos sin plaza, tarifas finales, límites, acceso al entorno de pruebas y habilitación de Yape para la modalidad contratada. |
| Materiales | Acceso a materiales por curso sujeto a autorización. | Formatos, límites, almacenamiento y reglas de publicación. |
| Clase en vivo | Emisión del docente con OBS hacia YouTube Live; alumnos como espectadores con participación solo por chat. | Calidad, latencia, simultaneidad, costo y compatibilidad del control de acceso con RF16. |
| Paneles | Vistas básicas para cada rol según sus operaciones autorizadas. | Acciones y datos mínimos por panel. |

## Exclusiones de esta etapa y del MVP

Este bloque T070–T072 actualiza documentación y prepara observación humana; no
ejecuta esa observación, smokes, cargas ni implementa matrícula o infraestructura.
Los [smokes de planificación](planificacion/evidence/2026-10-23-smokes.md), el perfil
local 10/25 preparado y la evidencia histórica de carga conservan sus estados.
No se contratan servicios ni se despliega.

Quedan fuera del MVP, salvo modificación explícita del alcance:

- Audio, cámara o transmisión de pantalla de alumnos en las clases.
- Grabación automática, biblioteca de grabaciones y garantías contra copia de pantalla.
- Operación permanente financiada con S/300 o infraestructura no justificada por
  mediciones. Las 15 000 cuentas son población, no un requisito de 15 000 concurrentes.
- Funciones adicionales como exámenes, certificados o aplicaciones móviles nativas.
- Microservicios, Kubernetes, Redis y balanceadores sin una necesidad comprobada.

## Propuesta técnica inicial

Las elecciones siguientes distinguen base técnica e implementación funcional.
Docker Compose, identidad y oferta cuentan con validación local registrada. Los
dominios de reservas/matrícula y las integraciones externas permanecen pendientes.

| Componente | Propuesta | Validación necesaria |
| --- | --- | --- |
| Frontend | React, TypeScript y Vite; identidad y oferta integradas. | Recorridos E2E locales comprobados; SC-002 humano, reproducción/video y aceptación integral pendientes. |
| Backend | NestJS y TypeScript; monolito modular, con identidad/usuarios/autorización/oferta. | Reglas, permisos y carreras académicas verificadas en T068; capacidad concurrente global no demostrada. |
| Datos | PostgreSQL y Prisma; cuatro migraciones de identidad más 0005 académica aditiva. | Transacciones/restricciones verificadas y restore ficticio T069; D13 operativo y datos persistentes requieren revisión. |
| Chat | Socket.IO con autorización por clase. | Aislamiento de clases, reconexión y carga definida. |
| Video | OBS del docente → YouTube Live, elección DA03/DEC01 para el MVP. | Integración, acceso directo, permisos vencidos y compatibilidad con RF16; latencia, consumo y costo. |
| Entorno local | Docker Compose con PostgreSQL, Mailpit, API y web. | Arranque y verificaciones locales comprobados en `47c8338`; no acredita funcionalidades ni producción. |
| Publicación propuesta | VPS, Nginx/HTTPS y acceso controlado durante apertura de matrícula, manteniendo monolito/PostgreSQL. | D09/D10/D13, costo total y pruebas desde otro equipo; sin despliegue ni contratación. AWS se evaluará después, no se adopta. |

La elección de Izipay del 2026-09-23 sustituye a Culqi, candidata inicial; no acredita
contratación ni capacidad ilimitada. La integración del proveedor debe quedar separada
de las reglas de órdenes y matrículas para permitir sustituirlo. Los pendientes y el
contexto de esta decisión se registran en D02 de decisiones pendientes.

El diseño debe conservar límites de módulos que permitan evolucionar sin anticipar
infraestructura distribuida. La viabilidad del video exige una prueba temprana: una
emisión autorizada, reproducción real, solicitudes directas sin permiso y medición del
tráfico. Esa prueba no demuestra por sí sola la carga combinada ni el objetivo de 2500 activos.

## Evidencia requerida para la capacidad

| Escenario | Carga que debe describirse | Evidencia específica |
| --- | --- | --- |
| Reservas/matrícula | Población ≥15 000 cuentas ficticias; k6 desde otro equipo contra VPS; usuarios activos y peticiones en vuelo medidos; pagos simulados. | Último cupo, reserva de 24 h, reinicios, vencimiento/pago/cancelación, duplicados, latencia/errores, cupos finales y matrícula única según reglas aprobadas. |
| Chat | Clases/grupos, conexiones, mensajes y reconexiones con cliente compatible con Socket.IO. | Autorización, entregas, latencia, errores y recursos consumidos. |
| Video | Emisiones simultáneas con OBS y reproducción real de YouTube Live; calidad, consumidores y protocolo de prueba por validar. | Tráfico observable, fallos, reproducción y acceso; sin extrapolar un ensayo aislado al objetivo agregado de 2500 activos. |

Cada informe debe registrar versión del código, infraestructura, scripts/configuración,
duración, carga alcanzada, latencia, errores, consumo de recursos y consistencia de matrículas
o su no aplicabilidad justificada. Los usuarios virtuales no equivalen automáticamente a
solicitudes por segundo. Abrir páginas no demuestra reproducciones simultáneas.

El escenario de aceptación de 2500 usuarios activos, sus umbrales y duración se acordarán según
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
