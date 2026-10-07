# Decisiones arquitectónicas

Las decisiones responden a los [drivers arquitectónicos](06-driver-arquitectonicos.md) y establecen cómo organizar el sistema, proteger sus operaciones y verificar su comportamiento. Una decisión aceptada orienta el diseño; no demuestra por sí misma que la funcionalidad esté implementada.

Se conservan los identificadores R01–R12 de la [investigación de identidad](../specs/001-identidad-acceso-roles/research.md) y D02 y D13 del [registro de decisiones pendientes](../docs/decisiones-pendientes.md). R11 y R12 se presentan conjuntamente por tratar el mismo entorno local. DEC01 identifica la elección de video vigente en DA03. Los estados se contrastan con la [verificación de identidad](../specs/001-identidad-acceso-roles/verification.md) y la [validación de Docker](../ops/docker/verification.md).

| ID | Decisión arquitectónica | Driver relacionado | Justificación | Resultado |
| --- | --- | --- | --- | --- |
| R01 | Monolito por capas organizado en módulos, con Clean Architecture para las dependencias internas. | DA04, DA07 | Reducir la complejidad operativa y permitir cambios sin afectar innecesariamente otros módulos. | Decisión aceptada; módulos funcionales pendientes. |
| R02 | Autenticación y autorización en el servidor con sesiones opacas persistidas en PostgreSQL. | DA01, DA08 | Consultar permisos vigentes y permitir revocación efectiva. | Decisión aceptada; identidad pendiente de implementación y validación funcional. |
| R03 | API REST y aplicación web bajo un mismo origen, con cookies y protección CSRF. | DA01, DA09 | Separar presentación y casos de uso mediante un contrato HTTP seguro. | Decisión aceptada; contrato de identidad definido, operaciones pendientes. |
| R04 | Argon2id para contraseñas y límites de cómputo medidos. | DA01, DA05 | Proteger credenciales y limitar la saturación del proceso. | Decisión aceptada; compatibilidad de la biblioteca comprobada, flujo funcional pendiente. |
| R05 | Transacciones y control de concurrencia para cambios de identidad y revocación. | DA01 | Evitar sesiones válidas después de cambios incompatibles de cuenta o permisos. | Decisión aceptada; escenarios de concurrencia pendientes. |
| R06 | Enlaces secretos de un solo uso y credencial inicial restringida. | DA01, DA06 | Limitar exposición, reutilización y privilegios durante verificación y recuperación. | Decisión aceptada; flujos pendientes. |
| R07 | Interfaces y adaptadores para integraciones; Mailpit local y futura salida SMTP. | DA06, DA07 | Sustituir proveedores sin trasladar sus detalles al dominio. | Decisión aceptada; servicio Mailpit comprobado, envío funcional y proveedor externo pendientes. |
| R08 | Entrega de correo persistida en PostgreSQL y ejecutada fuera de la solicitud HTTP. | DA06, DA08 | Permitir reintentos y recuperación sin bloquear las operaciones del usuario. | Decisión aceptada; ejecutor y garantías funcionales pendientes. |
| R09 | Límites persistentes de solicitudes y respuestas que reduzcan enumeración de cuentas. | DA01, DA05 | Contener abuso y mantener controles coherentes entre solicitudes. | Decisión aceptada; implementación y pruebas pendientes. |
| R10 | Pruebas de carga y optimización basada en mediciones. | DA05 | Dimensionar consultas, conexiones y recursos con evidencia. | Estrategia aceptada; 1000 usuarios concurrentes pendientes de demostrar. |
| R11, R12 | Docker Compose para una operación local reproducible. | DA04, DA10 | Ejecutar dependencias y aplicaciones con configuración y procedimiento comunes. | Entorno local comprobado en el commit 47c8338. |
| D02 | Izipay mediante un adaptador; PostgreSQL, transacciones e idempotencia para pagos y matrículas. | DA02, DA06 | Verificar el pago y evitar duplicados o inconsistencias entre cobro y acceso. | Pasarela elegida; integración y reglas pendientes. |
| DEC01 | Video mediante YouTube Live con OBS. | DA03 | Externalizar emisión y distribución dentro de las restricciones del proyecto. | Elección aceptada; integración y control de acceso pendientes de validación. |
| D13 | Respaldo y recuperación verificables, con políticas operativas por definir. | DA08 | Recuperar datos y restablecer un estado seguro tras un incidente. | Necesidad aceptada; políticas propuestas y restauración pendientes. |

## R01 — Estructura y dependencias internas

- **Contexto:** el proyecto dispone de una persona, cuatro meses y un presupuesto total de S/300; requiere evolución modular (RT01, RT02, AC06).
- **Decisión:** mantener un monolito por capas organizado en módulos. Aplicar Clean Architecture: presentación invoca aplicación; aplicación depende del dominio; infraestructura implementa sus interfaces y la raíz de composición conecta adaptadores. Se mantienen las tecnologías vigentes.
- **Justificación:** la modularidad y las dependencias hacia el dominio permiten modificar funcionalidades sin afectar innecesariamente otros módulos, con contratos públicos y separación de responsabilidades.
- **Consecuencias y limitaciones:** cada módulo debe evitar acceso a detalles internos de otros y dependencias circulares. Clean Architecture es el enfoque interno; Docker no determina el estilo arquitectónico.
- **Estado:** decisión aceptada en el [plan de identidad](../specs/001-identidad-acceso-roles/plan.md) y la [arquitectura inicial](../arquitectura/arquitectura-inicial.md); módulos funcionales pendientes.

## R02 — Autenticación, autorización y sesiones

- **Contexto:** RF03, RF08 y AC04 exigen cuentas habilitadas, permisos vigentes y denegación de acceso no autorizado.
- **Decisión:** usar sesiones opacas persistidas en PostgreSQL, con secreto en cookie HttpOnly y huella almacenada. Revalidar cuenta, sesión y autorización en el servidor; contemplar caducidad y revocación.
- **Justificación:** la persistencia permite invalidar acceso después de cambios de rol, desactivación o recuperación de contraseña.
- **Consecuencias y limitaciones:** las operaciones protegidas dependen de PostgreSQL. Los controles de identidad no sustituyen la futura comprobación de matrícula para recursos académicos.
- **Estado:** decisión aceptada; funcionalidad y pruebas de autorización pendientes.

## R03 — Comunicación mediante API REST

- **Contexto:** DA09 requiere un contrato entre la aplicación web y los casos de uso; AC04 exige protección del transporte autenticado.
- **Decisión:** exponer API REST bajo `/api/v1`, con JSON y rutas relativas bajo el mismo origen. Usar cookies de sesión y controles de origen y CSRF en operaciones de escritura; el adaptador HTTP traduce solicitudes, respuestas y errores.
- **Justificación:** separar el contrato HTTP del dominio facilita pruebas y evolución de la presentación.
- **Consecuencias y limitaciones:** HTTPS y cookies seguras son necesarios en producción. La configuración de desarrollo no demuestra protección de un despliegue público.
- **Estado:** decisión aceptada y [contrato de identidad](../specs/001-identidad-acceso-roles/contracts/api.md) definido; endpoints funcionales pendientes.

## R04 — Protección de contraseñas y recursos

- **Contexto:** RF01 y RF03 requieren credenciales protegidas; AC01 demanda rendimiento verificable.
- **Decisión:** emplear Argon2id y acotar las solicitudes y el trabajo de hashing conforme a R04 de la investigación.
- **Justificación:** el costo de protección de contraseñas debe presupuestarse sin debilitar la seguridad para alcanzar una cifra de concurrencia.
- **Consecuencias y limitaciones:** límites y tiempos deben medirse bajo carga; comprobar la biblioteca no demuestra seguridad ni rendimiento del flujo completo.
- **Estado:** decisión aceptada; compatibilidad criptográfica comprobada en Docker, implementación funcional y carga pendientes.

## R05 — Consistencia de cambios de identidad

- **Contexto:** RF03, RF04 y RF06 requieren que revocaciones y cambios de cuenta tengan efecto ante solicitudes concurrentes.
- **Decisión:** usar transacciones PostgreSQL, versión de autorización y bloqueos con orden definido para revalidar y confirmar cambios. Mantener hashing y llamadas externas fuera de transacciones prolongadas.
- **Justificación:** evitar que una solicitud concurrente confirme una sesión o escritura con permisos obsoletos.
- **Consecuencias y limitaciones:** deben comprobarse carreras, rollback y manejo de conflictos; los reintentos no deben producir efectos duplicados.
- **Estado:** decisión aceptada; comportamiento concurrente de identidad pendiente de implementación y verificación.

## R06 — Verificación, recuperación y acceso inicial

- **Contexto:** RF02, RF04 y RF07 requieren verificar correo, recuperar acceso y crear el primer administrador de forma controlada.
- **Decisión:** utilizar secretos aleatorios, persistidos mediante huella, con propósito, caducidad y consumo único; restringir la credencial inicial y exigir su cambio.
- **Justificación:** reducir reutilización de enlaces y acceso indebido durante operaciones sensibles.
- **Consecuencias y limitaciones:** consumo y cambios asociados deben ser atómicos. Los secretos no deben aparecer en registros ni permitir eludir las restricciones de cuenta.
- **Estado:** decisión aceptada; flujos de identidad pendientes.

## R07 — Integraciones sustituibles y correo

- **Contexto:** DA06 y AC06 requieren independencia de proveedores; RT07 distingue correo local de entrega externa.
- **Decisión:** definir interfaces para integraciones e implementar adaptadores de infraestructura. Para correo, usar Mailpit local y preparar una futura salida SMTP con autenticación y TLS según el proveedor elegido.
- **Justificación:** las reglas de negocio pueden conservarse al cambiar proveedor o usar sustitutos en pruebas.
- **Consecuencias y limitaciones:** deben resolverse costo, cuotas, remitente y configuración del correo externo. Capturar correo local no demuestra entrega real ni el flujo de recuperación.
- **Estado:** decisión aceptada; Mailpit validado como servicio local; adaptador funcional y proveedor externo pendientes.

## R08 — Entrega diferida de correo

- **Contexto:** AC07 requiere tolerar fallos y reintentos de correo sin bloquear solicitudes ni crear nuevos secretos por cada intento.
- **Decisión:** persistir entregas junto con la operación correspondiente y procesarlas mediante un ejecutor interno con reintentos acotados. Proteger el contenido sensible y descartar entregas caducadas o canceladas.
- **Justificación:** separar la confirmación de la operación del tiempo y disponibilidad de SMTP.
- **Consecuencias y limitaciones:** se deben comprobar reinicios y concurrencia del ejecutor; SMTP puede entregar duplicados, aunque el enlace deba consumirse una sola vez.
- **Estado:** decisión aceptada; persistencia y ejecutor funcional pendientes.

## R09 — Contención del abuso

- **Contexto:** RF02–RF04 y AC04 requieren controlar solicitudes repetidas sin revelar la existencia de cuentas.
- **Decisión:** persistir límites en PostgreSQL y emitir respuestas públicas coherentes; separar cuotas de admisión y entrega de correo.
- **Justificación:** mantener controles entre solicitudes y limitar abuso de autenticación y enlaces.
- **Consecuencias y limitaciones:** los controles generan consultas adicionales y requieren medir contención y falsos bloqueos; no garantizan protección frente a todo ataque distribuido.
- **Estado:** decisión aceptada; controles y pruebas pendientes.

## R10 — Capacidad y rendimiento verificables

- **Contexto:** AC01, AC03 y RT11 establecen el objetivo de 1000 usuarios concurrentes; D10 mantiene criterios de evaluación por acordar.
- **Decisión:** realizar pruebas de carga reproducibles, medir latencias, errores y recursos, y optimizar consultas, índices, conexiones y recursos según resultados.
- **Justificación:** elegir ajustes a partir de cuellos de botella observados y separar carga interna de pruebas de proveedores externos.
- **Consecuencias y limitaciones:** caché o escalamiento horizontal son posibilidades por validar si las mediciones las justifican. Un escenario de identidad no demuestra capacidad de chat, video o de toda la academia.
- **Estado:** estrategia aceptada; protocolo definitivo y prueba de 1000 concurrentes pendientes. Las comprobaciones técnicas existentes no acreditan esa capacidad.

## R11 y R12 — Operación local reproducible

- **Contexto:** RT04 y DA10 requieren un entorno ejecutable sin depender de instalaciones manuales de cada servicio.
- **Decisión:** usar Docker Compose para PostgreSQL, Mailpit, API y web, con versiones definidas, configuración privada, comprobaciones de salud y volumen de datos.
- **Justificación:** reproducir instalación, arranque y verificaciones del entorno local.
- **Consecuencias y limitaciones:** Docker Compose es una decisión del entorno de ejecución. La persistencia del volumen no equivale a respaldo y la validación local no demuestra disponibilidad en producción.
- **Estado:** decisión aceptada y resultado comprobado en el commit `47c8338`: los cuatro servicios funcionan y las verificaciones técnicas están registradas. Las funcionalidades del dominio permanecen pendientes.

## D02 — Pagos y matrículas consistentes

- **Contexto:** RF11–RF13 y AC05 requieren confirmación auténtica del cobro y prevención de duplicados y sobreventa.
- **Decisión:** integrar Izipay mediante un adaptador. Persistir órdenes, pagos y matrículas en PostgreSQL; usar transacciones, restricciones e idempotencia para confirmar operaciones sin duplicarlas.
- **Justificación:** la confirmación del proveedor debe sustentar la matrícula; la pantalla de éxito del cliente no acredita el pago.
- **Consecuencias y limitaciones:** condiciones comerciales y acceso a pruebas de Izipay están pendientes. D01–D06 deben resolver atomicidad por orden, cupos, vigencia y demás reglas antes de implementar; los mecanismos técnicos no resuelven esas políticas.
- **Estado:** elección de pasarela aceptada y mecanismos exigidos por los requisitos; integración e implementación pendientes. No hay pagos ni matrículas validados.

## DEC01 — Emisión y acceso al video

- **Contexto:** DA03 exige viabilidad económica y acceso restringido; RF16, AC04 y RT08 mantienen condiciones de protección por comprobar.
- **Decisión:** utilizar YouTube Live con OBS para emisión y distribución, conforme a la selección vigente en DA03.
- **Justificación:** delegar distribución evita operar infraestructura propia de video dentro del plazo y presupuesto disponibles.
- **Consecuencias y limitaciones:** validar compatibilidad con los controles exigidos por RF16, incluido acceso directo y permisos vencidos. Una página autenticada o un enlace no publicado no demuestran restricción del video; tampoco se garantiza impedir grabaciones. Si la elección no satisface esos controles, se requiere revisar la decisión.
- **Estado:** elección aceptada; integración, reproducción y control de acceso pendientes de validación. Las formulaciones de protección de video en otros documentos permanecen pendientes de compatibilidad con esta elección.

## D13 — Disponibilidad y recuperación

- **Contexto:** RF19 y AC02 requieren recuperación segura; ubicación, retención, responsables y tiempos aceptables aún no están definidos.
- **Decisión:** exigir un procedimiento de respaldo y restauración comprobable antes de operar con datos persistentes en una demostración o producción. Mantener como propuestas las políticas operativas aún sin aprobar.
- **Justificación:** recuperar datos debe incluir invalidar sesiones y enlaces restaurados y cancelar correos obsoletos antes de reabrir el acceso.
- **Consecuencias y limitaciones:** definir RPO, RTO, almacenamiento, retención y responsables; ensayar restauración en una base separada. Un volumen persistente o servicios saludables no acreditan recuperación ni una disponibilidad contractual.
- **Estado:** necesidad aceptada; políticas pendientes de validación y restauración funcional no comprobada, según V16 de la verificación de identidad.
