# 01. Actores de Academia Virtual

Revisión: 2026-10-01. Análisis del proyecto existente, no una aplicación nueva.
El [alcance del MVP](../docs/alcance-mvp.md) y la
[especificación de identidad](../specs/001-identidad-acceso-roles/spec.md) conservan
las reglas detalladas. El [inventario y estado comprobado](../arquitectura/arquitectura-inicial.md#inventario-y-estado-del-repositorio)
separa base técnica, diseño y funciones pendientes. Ningún actor dispone todavía de
los flujos de negocio descritos aquí.

## Actores humanos

| ID | Actor | Necesidades e interacción prevista | Límites y origen |
| --- | --- | --- | --- |
| A01 | Visitante / futuro alumno | Registrarse como alumno, verificar su correo y acceder a su cuenta. | No puede elegir un rol privilegiado; identidad US2, FR-001–004/029–031. No se presupone un catálogo público. |
| A02 | Alumno | Acceder/cerrar sesión, recuperar contraseña y consultar perfil; consultar cursos, grupos, horarios y cupos, seleccionar cursos y pagar su orden; acceder a materiales, video y chat autorizados. | Un rol por cuenta. Las funciones académicas son MVP previsto; vigencia de matrícula y reservas pendientes D01–D06. Participa en clase solo por chat, sin cámara, audio ni pantalla. |
| A03 | Docente | Acceder a su perfil e inicio; emitir clases de los grupos que le correspondan y disponer de las operaciones autorizadas de materiales y chat. | No administra cuentas ni perfiles privados ajenos. Asignación de grupos y permisos de publicación/moderación aún deben especificarse; alcance, D07–D08/D12. |
| A04 | Administrador | Crear y consultar cuentas, corregir nombres, asignar un único rol y activar/desactivar con auditoría; administrar la oferta académica y consultar sus operaciones desde un panel básico. | Identidad US4: revocación de sesiones y protección del último administrador. La gestión de oferta se propone para este actor y requiere matriz detallada; no se le atribuyen reembolsos ni lectura de secretos. |
| A05 | Responsable del entorno (operador local) | Inicializar una sola vez al primer administrador mediante procedimiento restringido; preparar configuración, migraciones, respaldo y recuperación. | Actor operativo, no cuarto rol de aplicación. Identidad US6, plan y verificación V16. No existe alta pública de administradores. |

Las cuentas de alumno, docente y administrador comparten acceso, verificación, recuperación
y perfil. La distinción visitante/cuenta no habilitada permite describir los flujos previos
a la sesión sin crear otro rol persistente. Para permisos académicos todavía no aprobados,
se conserva la denegación por defecto hasta especificarlos.

## Sistemas y herramientas externos

| ID | Sistema / herramienta | Interacción prevista y módulo responsable | Estado respaldado |
| --- | --- | --- | --- |
| E01 | Izipay | El módulo de pagos inicia la operación y verifica autenticidad, orden, importe y moneda de la confirmación mediante un adaptador. | Elegida el 2026-09-23; sustituye a Culqi. Sin integración ni contratación acreditada. D02: sandbox, tarifas, límites y Yape pendientes. |
| E02 | Servicio SMTP de producción | El módulo de correo entrega enlaces de verificación/recuperación solicitados por identidad. | Proveedor sin elegir/contratar; TLS, remitente, DNS, cuota y costo pendientes. Nodemailer está instalado y probado solo en compatibilidad local. |
| E03 | Mailpit local | Recibe y permite inspeccionar correos ficticios en desarrollo/pruebas, sustituyendo al SMTP externo. | Captura local comprobada en V00; no implica envío real ni flujos de identidad implementados. Ruta actual Docker Compose. |
| E04 | OBS del docente y servidor SRS/HLS | OBS emite; SRS distribuye HLS. El módulo de clases/video debe coordinar permisos para emisión y reproducción; el navegador reproduce HLS. | Cadena técnica propuesta, no integrada. Autorización de manifiestos/segmentos, calidad, latencia, simultaneidad y costo pendientes D07–D08. SRS es infraestructura de medios prevista, no proveedor comercial contratado. |

Fuentes: [decisiones D01–D13](../docs/decisiones-pendientes.md),
[plan de identidad](../specs/001-identidad-acceso-roles/plan.md),
[compatibilidad local](../ops/docker/compatibility.md). PostgreSQL es la persistencia
interna del sistema; no se modela como actor humano ni como pasarela de integraciones.
