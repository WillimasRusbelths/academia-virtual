# Actores del sistema

La plataforma Academia Virtual considera actores humanos que utilizan sus funcionalidades y servicios externos que apoyan procesos específicos, como el envío de correos, los pagos y la transmisión de clases en vivo.

## Actores humanos

| ID | Actor | Descripción | Necesidades principales |
|---|---|---|---|
| ACT01 | Visitante | Persona que todavía no ha iniciado sesión o no posee una cuenta en la plataforma. | Consultar información pública de los cursos, registrarse, verificar su correo electrónico e iniciar sesión. |
| ACT02 | Alumno | Usuario matriculado o interesado en matricularse en los cursos de la academia. | Gestionar su perfil, consultar cursos, realizar el proceso de matrícula, efectuar pagos, acceder a materiales, participar en el chat y asistir a clases en vivo. |
| ACT03 | Docente | Usuario responsable de desarrollar y administrar las actividades académicas de uno o más cursos. | Consultar sus cursos, publicar materiales, compartir información de las clases en vivo y comunicarse con los alumnos. |
| ACT04 | Administrador | Usuario encargado de la configuración y administración general de la plataforma. | Gestionar usuarios, asignar roles, administrar cursos, supervisar matrículas y controlar el acceso a las funciones del sistema. |

## Sistemas externos

| ID | Sistema externo | Interacción con Academia Virtual | Estado |
|---|---|---|---|
| SE01 | Servicio de correo electrónico | Envía mensajes para verificar cuentas y recuperar contraseñas mediante enlaces de un solo uso. | Mailpit se utiliza en desarrollo. El servicio para producción está pendiente de selección y configuración. |
| SE02 | Izipay | Procesará los pagos correspondientes a la matrícula de los alumnos en los cursos. | Pasarela seleccionada; integración pendiente de implementación y validación. |
| SE03 | YouTube Live | Proporcionará la transmisión de video de las clases en vivo mediante enlaces asociados a los cursos. | Servicio seleccionado para el MVP; integración y reglas de acceso pendientes de validación. |

## Relaciones principales

| Actor | Interacción principal |
|---|---|
| Visitante | Se registra, verifica su correo electrónico e inicia sesión. |
| Alumno | Consulta cursos, se matricula, realiza pagos y accede al contenido académico. |
| Docente | Gestiona materiales e información académica de sus cursos. |
| Administrador | Administra usuarios, roles, cursos y matrículas. |
| Servicio de correo electrónico | Entrega mensajes de verificación y recuperación de acceso. |
| Izipay | Procesa y comunica el resultado de los pagos. |
| YouTube Live | Transmite las clases en vivo vinculadas a los cursos. |
