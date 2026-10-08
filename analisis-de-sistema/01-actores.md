# Actores del sistema

La plataforma Academia Virtual considera actores humanos y servicios externos que
apoyan procesos de correo, pagos y transmisión de clases en vivo.
El [alcance del MVP](../docs/alcance-mvp.md) y la
[especificación de identidad](../specs/001-identidad-acceso-roles/spec.md) conservan
las reglas detalladas. El [inventario y estado comprobado](../arquitectura/arquitectura-inicial.md#inventario-y-estado-del-repositorio)
separa base técnica, diseño y funciones pendientes. Ningún actor dispone todavía de
los flujos de negocio descritos aquí.

## Actores humanos

| ID | Equivalencia | Actor | Descripción | Necesidades principales y límites |
| --- | --- | --- | --- | --- |
| A01 | ACT01 | Visitante | Persona sin sesión o cuenta habilitada. | Registrarse solo como alumno, verificar correo e iniciar sesión. La consulta pública de cursos requiere especificación; no se presupone un catálogo público aprobado. |
| A02 | ACT02 | Alumno | Usuario matriculado o interesado en matricularse. | Gestionar perfil, consultar cursos, grupos, horarios y cupos, seleccionar cursos y pagar su orden; acceder a materiales, video y chat autorizados. Vigencia y reservas pendientes D01–D06. Participa solo por chat, sin audio, cámara ni pantalla. |
| A03 | ACT03 | Docente | Responsable de actividades académicas de sus cursos. | Consultar sus cursos, emitir clases, publicar materiales y comunicarse por chat bajo permisos autorizados. Asignación de grupos y permisos de publicación/moderación pendientes de especificación; no administra cuentas ajenas. |
| A04 | ACT04 | Administrador | Responsable de administración de cuentas y oferta académica. | Gestionar usuarios, asignar un único rol y activar/desactivar con auditoría y revocación de sesiones, protegiendo al último administrador. Gestión de cursos, matrículas y paneles sujeta a la matriz académica pendiente; no se le atribuyen reembolsos ni lectura de secretos. |
| A05 | — | Responsable del entorno | Operador local; no es un cuarto rol de la aplicación. | Inicializar una sola vez al primer administrador mediante procedimiento restringido; gestionar configuración, migraciones, respaldos y recuperación según HU06, RF19 y V16. |

Los identificadores A01–A05 se conservan para la trazabilidad; ACT01–ACT04 son sus
equivalencias en el catálogo de actores. Alumno, docente y administrador comparten
acceso, verificación, recuperación y perfil. Los permisos académicos no especificados
mantienen denegación por defecto.

## Sistemas externos

| ID | Equivalencia | Sistema externo | Interacción prevista y módulo responsable | Estado |
| --- | --- | --- | --- | --- |
| E02 / E03 | SE01 | Correo electrónico | El módulo de correo entrega enlaces de verificación y recuperación; Mailpit sustituye al SMTP externo en desarrollo y pruebas. | Mailpit validado en Docker Compose; no acredita flujos de identidad ni entrega real. SMTP de producción pendiente de proveedor, TLS, remitente, DNS, cuotas y costo. E02 identifica salida externa y E03 captura local. |
| E01 | SE02 | Izipay | Pagos inicia la operación y verifica autenticidad, orden, importe y moneda mediante un adaptador. | Pasarela seleccionada; integración pendiente. D02 mantiene tarifas, límites, acceso a pruebas y Yape por confirmar. |
| E04 | SE03 | YouTube Live con OBS | El docente emite con OBS hacia YouTube Live; clases coordina el acceso previsto y la web reproduce el video. | Elección DA03/DEC01 para el MVP; integración y control de acceso pendientes. Autenticar una página u ocultar un enlace no demuestra protección del video. |

## Relaciones principales

| Actor | Interacción principal |
|---|---|
| Visitante | Se registra, verifica su correo electrónico e inicia sesión. |
| Alumno | Consulta cursos, se matricula, realiza pagos y accede al contenido académico. |
| Docente | Gestiona materiales e información académica de sus cursos. |
| Administrador | Administra usuarios, roles, cursos y matrículas. |
| Responsable del entorno | Inicializa el acceso administrativo y prepara la operación y recuperación. |
| Servicio de correo electrónico | Entrega mensajes de verificación y recuperación de acceso. |
| Izipay | Procesa y comunica el resultado de los pagos. |
| YouTube Live | Transmite las clases en vivo vinculadas a los cursos. |

Estas relaciones describen necesidades, no operaciones ya disponibles. Fuentes:
[decisiones pendientes](../docs/decisiones-pendientes.md),
[decisiones arquitectónicas](07-decisiones-arquitectonicas.md),
[plan de identidad](../specs/001-identidad-acceso-roles/plan.md) y
[verificación Docker](../ops/docker/verification.md). PostgreSQL es persistencia
interna; no es un actor ni una pasarela hacia servicios externos.
