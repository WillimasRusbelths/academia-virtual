# Actores del sistema

La plataforma Academia Virtual considera actores humanos y servicios externos que
apoyan procesos de correo, pagos y transmisión de clases en vivo.
El [alcance del MVP](../alcance-mvp.md) y la
[especificación de identidad](../../specs/001-identidad-acceso-roles/spec.md) conservan
las reglas detalladas. Actualizado 2026-11-15: identidad y oferta conservan sus checkpoints locales;
reservas/matrícula incorporan el [checkpoint 003/T084](../../specs/003-reservas-ordenes-matricula/evidence/acceptance.md).
Las capacidades de cada actor se distinguen abajo de materiales/video/chat previstos.

## Actores humanos

| ID | Equivalencia | Actor | Descripción | Necesidades principales y límites |
| --- | --- | --- | --- | --- |
| A01 | ACT01 | Visitante | Persona sin sesión o cuenta habilitada. | Registro solo como alumno, verificación y login implementados. Sin catálogo público aprobado ni acceso financiero anónimo. |
| A02 | ACT02 | Alumno | Usuario matriculado o interesado en matricularse. | Perfil, oferta 002 y reserva/órdenes/matrículas propias 003 implementados y verificados localmente. Reserva de 24 h, inventario real en /reservar y consultas propias; sin cobros reales mientras D02/economía estén pendientes. Materiales, video y chat previstos; participación audiovisual excluida. |
| A03 | ACT03 | Docente | Responsable de actividades académicas de sus cursos. | Perfil y grupos propios bajo asignación/habilitación 002 implementados. Sin acceso financiero ni administración de cuentas ajenas. Emisión, materiales y chat previstos, con sus permisos pendientes. |
| A04 | ACT04 | Administrador | Responsable de administración de cuentas y oferta académica. | Cuentas y oferta implementadas; fija precio PEN, consulta compromisos/incidencias y anota seguimiento 003. Revocación, último administrador y auditoría conservados. No confirma pagos o matrículas manualmente ni resuelve economía. Panel académico completo pendiente. |
| A05 | — | Responsable del entorno | Operador local; no es un cuarto rol de la aplicación. | CLI de primer administrador con checkpoint local; intermitencia histórica de bootstrap pendiente. Configuración/migraciones y ensayos de backup/restore 001/002/003 disponibles; T086 verificada localmente. Custodia, retención y objetivos operativos D13 pendientes. |

Los identificadores A01–A05 se conservan para la trazabilidad; ACT01–ACT04 son sus
equivalencias en el catálogo de actores. Alumno, docente y administrador comparten
acceso, verificación, recuperación y perfil. Los permisos académicos no especificados
mantienen denegación por defecto.

## Sistemas externos

| ID | Equivalencia | Sistema externo | Interacción prevista y módulo responsable | Estado |
| --- | --- | --- | --- | --- |
| E02 / E03 | SE01 | Correo electrónico | El módulo de correo entrega enlaces de verificación y recuperación; Mailpit sustituye al SMTP externo en desarrollo y pruebas. | Flujos de identidad implementados y comprobados con Mailpit. SMTP externo pendiente de proveedor, TLS, remitente, DNS, cuotas y costo; no se acredita entrega real. |
| E01 | SE02 | Izipay | Pagos inicia la operación y verifica autenticidad, orden, importe y moneda mediante un adaptador. | Izipay elegida; núcleo local de pagos 003 probado con fixtures simuladas, sin adaptador/SDK o sandbox real. T056–T059/D02 y política económica pendientes; sin cobros reales. |
| E04 | SE03 | YouTube Live con OBS | El docente emite con OBS hacia YouTube Live; clases coordina el acceso previsto y la web reproduce el video. | Elección DA03/DEC01 para el MVP; integración y control de acceso pendientes. Autenticar una página u ocultar un enlace no demuestra protección del video. |

## Relaciones principales

| Actor | Interacción principal |
|---|---|
| Visitante | Se registra, verifica su correo electrónico e inicia sesión. |
| Alumno | Consulta cursos, se matricula, realiza pagos y accede al contenido académico. |
| Docente | Gestiona materiales e información académica de sus cursos. |
| Administrador | Administra usuarios, roles, oferta y precios; consulta compromisos y anota seguimiento. |
| Responsable del entorno | Inicializa el acceso administrativo y prepara la operación y recuperación. |
| Servicio de correo electrónico | Entrega mensajes de verificación y recuperación de acceso. |
| Izipay | Procesa y comunica el resultado de los pagos. |
| YouTube Live | Transmite las clases en vivo vinculadas a los cursos. |

Las relaciones resumen necesidades del MVP; su disponibilidad está delimitada por
las tablas anteriores. Izipay y video siguen sin integración real. Fuentes:
[decisiones pendientes](../decisiones-pendientes.md),
[decisiones arquitectónicas](07-decisiones-arquitectonicas.md),
[plan de identidad](../../specs/001-identidad-acceso-roles/plan.md) y
[verificación Docker](../../ops/docker/verification.md). PostgreSQL es persistencia
interna; no es un actor ni una pasarela hacia servicios externos.
