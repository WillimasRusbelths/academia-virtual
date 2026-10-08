# 06. Drivers arquitectónicos

Fecha: 2026-10-07. Los drivers son requisitos y restricciones que condicionan la
estructura, las dependencias y la viabilidad del sistema. Sus orígenes se encuentran en
los [requisitos funcionales RF](03-requisitos-funcionales.md),
los [atributos de calidad AC](04-atributos-de-calidad.md) y las
[restricciones RT](05-restricciones.md).
Un driver se prioriza por cuánto condiciona la estructura, las dependencias o la
viabilidad del proyecto, no por ser una funcionalidad visible.

El estilo arquitectónico es un **monolito por capas, organizado en módulos**. El
enfoque interno es **Clean Architecture**, con dependencias dirigidas hacia los casos
de uso y el dominio. **Docker Compose es una decisión del entorno de ejecución**,
independiente del estilo arquitectónico. PostgreSQL es la base de datos, Izipay la
pasarela elegida y YouTube Live con OBS la solución de video seleccionada.

## Identificación de drivers

| ID | Driver arquitectónico | Origen | ¿Por qué influye en la arquitectura? |
| --- | --- | --- | --- |
| DA01 | Seguridad: autorización y aislamiento por usuario, rol, matrícula y clase. | RF03, RF08, RF16, RF17; AC04; RT09 | Exige controles en API y casos de uso, sesiones revocables y permisos vigentes. Ocultar elementos de la web no protege los recursos ni sustituye la autorización. |
| DA02 | Integridad de pagos, órdenes, cupos y matrículas ante concurrencia y reintentos. | RF11, RF12, RF13; AC05; RT06 | Exige totales calculados en servidor, verificación con Izipay, idempotencia y transacciones con restricciones en PostgreSQL para evitar duplicados y sobreventa. |
| DA03 | Viabilidad y acceso autorizado a clases por video. | RF16; AC03, AC04; RT02, RT08 | La distribución externa condiciona el reproductor, los permisos y la dependencia del proveedor. Requiere validar emisión, reproducción, calidad, simultaneidad y costo; el acceso a la página no demuestra protección del video externo. |
| DA04 | Viabilidad del desarrollo dentro del plazo, equipo y presupuesto disponibles. | RT01, RT02, RT03, RT05 | Una persona, cuatro meses y S/300 totales requieren una estructura comprensible, pocos componentes operativos y reutilización de capacidades, sin complejidad distribuida injustificada. |
| DA05 | Rendimiento y escalabilidad con un objetivo de 1000 usuarios concurrentes. | AC01, AC03; RT11 | Condiciona consultas, índices, pool de conexiones y recursos. Deben medirse latencias, errores, concurrencia real y consumo antes de dimensionar o adoptar tácticas de escalamiento. |
| DA06 | Integraciones sustituibles y continuidad ante fallos de correo. | RF02, RF04, RF12; AC06, AC07; RT06, RT07 | La dependencia de Izipay y SMTP debe quedar en adaptadores. El correo requiere entregas persistidas, reintentos y vencimientos, sin bloquear la respuesta HTTP ni prometer una entrega exitosa. |
| DA07 | Mantenibilidad y evolución modular. | AC06; RT01, RT03 | Modificar una funcionalidad debe afectar solo los módulos necesarios. La modularidad, separación por capas y Clean Architecture aíslan reglas de negocio del transporte, la persistencia y los proveedores, con contratos públicos y pruebas de regresión. |
| DA08 | Disponibilidad, recuperación segura y protección de datos y secretos. | RF09, RF19; AC02; RT09 | Exige migraciones controladas, respaldos, restauración comprobada, revocación del estado restaurado y registros sin secretos. Los responsables y objetivos de recuperación deben definirse antes de operar con datos persistentes. |
| DA09 | Comunicación mediante API REST con contratos y controles de transporte. | RF01, RF03, RF05, RF08; AC04, AC06; RT03; contrato HTTP de identidad | Separa la interfaz web de los casos de uso mediante rutas, DTO y respuestas definidos. La presentación adapta HTTP y errores públicos sin introducir dependencias de transporte en el dominio. |
| DA10 | Operación y reproducibilidad del entorno local. | RF19; AC06; RT03, RT04, RT09 | Las mismas versiones, configuración e inicialización deben permitir ejecutar y probar el sistema de forma repetible, separando secretos, datos persistentes y resultados generados del repositorio. |

DA01–DA05 condicionan la base y viabilidad del proyecto; DA06–DA10 condicionan su
evolución y operación. Pagos y clases pertenecen al MVP, aunque no estén implementados
en el incremento de identidad.

## Relación con las decisiones

| Driver | Problema que plantea | Decisión que responde |
| --- | --- | --- |
| DA01 | Acceso directo, permisos revocados o recursos de otro usuario o clase. | Verificar sesión, cuenta y autorización en backend y revalidar las invariantes en el caso de uso. Sesiones persistidas en PostgreSQL; controles académicos y aceptación funcional pendientes. |
| DA02 | Confirmaciones falsas o repetidas, cobros inconsistentes y competencia por cupos. | Izipay mediante adaptador; verificación del proveedor, idempotencia y transacciones PostgreSQL. La integración y las reglas detalladas de D01–D06 siguen pendientes. |
| DA03 | Distribuir clases sin asumir capacidad, costo ni protección de acceso del proveedor. | OBS emite a YouTube Live. La integración y la compatibilidad con todas las condiciones de RF16, AC03, AC04 y RT08 deben validarse; la selección no acredita control del enlace externo ni reproducción autorizada. |
| DA04 | Complejidad de desarrollo y operación incompatible con recursos limitados. | Monolito por capas organizado en módulos, con PostgreSQL y componentes justificados por requisitos. Docker Compose facilita la ejecución local; no define el estilo arquitectónico. |
| DA05 | Capacidad y tiempos de respuesta desconocidos al aumentar la carga. | Medir con los escenarios de carga definidos y ajustar consultas, índices, pool y recursos según resultados. Los 1000 concurrentes siguen pendientes. El escalamiento horizontal es una posibilidad por validar si las mediciones lo justifican, no una implementación existente. |
| DA06 | Cambios de proveedor y solicitudes dependientes de fallos SMTP. | Contratos de aplicación y adaptadores Izipay/SMTP; Mailpit para captura local. Entregas persistidas y ejecutor interno con reintentos son diseño previsto, sin integración funcional acreditada. |
| DA07 | Cambios que se propagan innecesariamente entre módulos o tecnologías. | Clean Architecture dentro de cada módulo: entrada → aplicación → dominio; infraestructura implementa contratos internos y la composición conecta adaptadores. Consumir solo interfaces públicas entre módulos; lint y pruebas verifican los límites. |
| DA08 | Pérdida de datos, recuperación insegura o exposición de secretos. | Volumen persistente PostgreSQL y configuración privada por entorno; procedimientos de migración, backup y restauración con invalidación de sesiones y tokens. El volumen no sustituye al respaldo; D13 y V16 siguen pendientes, sin disponibilidad de producción demostrada. |
| DA09 | Acoplamiento de la web con persistencia, reglas de negocio o proveedores. | API REST NestJS en presentación, con contratos JSON y rutas relativas; los casos de uso conservan las reglas. El contrato de identidad define DTO, cookies, origen y errores; los endpoints funcionales siguen pendientes. |
| DA10 | Diferencias de ejecución y pruebas entre equipos, o pérdida de datos al detener el entorno. | Docker Compose con PostgreSQL, Mailpit, API y web, health checks y espera de dependencias saludables; npm ci con lockfile, nombres de servicio y volumen persistente. Entorno local validado en 47c8338; no equivale a publicación ni prueba de carga. |

El [plan de identidad](../specs/001-identidad-acceso-roles/plan.md) y la
[vista de arquitectura](../arquitectura/arquitectura-inicial.md#responsabilidades-y-dependencias)
describen las capas y responsabilidades. El
[contrato HTTP](../specs/001-identidad-acceso-roles/contracts/api.md) sustenta DA09;
los [límites de importación](../ops/local/architecture.md) concretan DA07 y la
[verificación del entorno](../ops/docker/verification.md) respalda DA10.
Las [decisiones pendientes](../docs/decisiones-pendientes.md) conservan D01–D06,
D10 y D13; la [estrategia de verificación](../specs/001-identidad-acceso-roles/verification.md)
define los escenarios de carga y V16. Ningún driver ni decisión de diseño demuestra
por sí solo el cumplimiento de los requisitos de origen.
