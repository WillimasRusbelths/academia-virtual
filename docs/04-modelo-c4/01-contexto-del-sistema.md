# Contexto del sistema

## Propósito y frontera

Academia Virtual es un único sistema que permite organizar la oferta de cursos, gestionar el acceso de sus participantes y coordinar la adquisición y el uso de recursos académicos. Esta vista C1 describe a las personas y sistemas externos con los que se relaciona, sin descomponer su organización interna.

El [alcance del MVP](../alcance-mvp.md) y los [requisitos funcionales](../01-analisis-de-sistema/03-requisitos-funcionales.md) respaldan estas responsabilidades previstas:

- Gestionar registro de alumnos, verificación de correo, acceso, recuperación, perfil y administración de cuentas con permisos vigentes: RF01–RF09.
- Ofrecer cursos, grupos, horarios y cupos; registrar órdenes y coordinar pagos verificados y matrículas: RF10–RF13.
- Permitir publicación y acceso autorizado a materiales, clases en vivo, chat de clase y paneles básicos por rol: RF14–RF18.
- Permitir la inicialización administrativa restringida y la recuperación segura del servicio según las responsabilidades operativas existentes: RF07/RF19.

La plataforma decide los permisos y la habilitación académica previstos. Izipay procesa el pago; YouTube Live distribuye el video; un servicio de correo externo entrega los mensajes. No se atribuye a Academia Virtual procesamiento de tarjetas, emisión propia de video ni operación de un proveedor de correo. El chat de clase pertenece al alcance del sistema: no se presupone el uso del chat de YouTube.

Quedan fuera del MVP la participación audiovisual del alumno, grabaciones automáticas, garantías contra copia de pantalla, exámenes, certificados y aplicaciones móviles nativas. La consulta pública de cursos no está aprobada. Las políticas de reservas, vigencia, cancelaciones y reembolsos continúan sujetas a D01–D06; esta vista no las resuelve.

## Personas

Se conservan los identificadores y equivalencias de [actores](../01-analisis-de-sistema/01-actores.md). Alumno, docente y administrador son los tres roles de la aplicación; Visitante describe una condición de acceso y Responsable del entorno es un actor operativo.

| ID y equivalencia | Persona | Responsabilidades e interacción con Academia Virtual | Límites y fuente |
| --- | --- | --- | --- |
| A02 / ACT02 | Alumno | Gestionar acceso y perfil; consultar oferta, seleccionar cursos y pagar una orden; acceder a materiales, clases y chat autorizados | Participación en clase solo por chat, sin audio, cámara o pantalla. Vigencia y cupos pendientes D01–D06. Actores; HU02–HU04, HU08, HU10–HU12, HU15–HU17 |
| A03 / ACT03 | Docente | Gestionar acceso y perfil; consultar sus cursos, publicar materiales, emitir clases y comunicarse bajo permisos autorizados | Emite hacia YouTube mediante OBS. Asignación, publicación y moderación requieren especificación; no administra cuentas ajenas. Actores; HU02–HU04, HU13/HU14/HU17; RF15/RF16 |
| A04 / ACT04 | Administrador | Gestionar acceso y perfil; administrar cuentas y roles, activar/desactivar con auditoría y revocación; administrar oferta, matrículas y paneles según permisos por definir | Un rol por cuenta, protección del último administrador; sin lectura de secretos ni facultad de reembolso asumida. Actores; HU05/HU09/HU17; RF06/RF08–RF10 |
| A01 / ACT01 | Visitante | Registrarse solo como alumno, verificar correo e iniciar sesión; solicitar recuperación según el contrato de identidad | No obtiene acceso académico por visitar la plataforma. No se presupone catálogo público. Actores; HU01–HU03; [especificación de identidad](../../specs/001-identidad-acceso-roles/spec.md) |
| A05 / — | Responsable del entorno | Inicializar una sola vez el primer administrador y ejecutar las operaciones restringidas de conservación y recuperación | No constituye un cuarto rol ni un acceso administrativo público. Actores; HU06, RF07/RF19; D13 |

Alumno, docente y administrador comparten verificación, recuperación y perfil según identidad. Las facultades académicas todavía no especificadas no se conceden automáticamente por el nombre del rol. Estas responsabilidades son previstas; los fundamentos existentes no habilitan aún sus recorridos funcionales completos.

## Sistemas externos y herramientas de apoyo

| ID y equivalencia | Nombre vigente | Responsabilidad externa y relación prevista | Estado y fuente |
| --- | --- | --- | --- |
| E01 / SE02 | Izipay | Procesar pagos y proporcionar información que Academia Virtual pueda comprobar respecto de autenticidad, orden, importe y moneda | Elección aceptada; integración, condiciones comerciales y entorno de pruebas pendientes. D02, RF12/RF13, DA02/DA06 |
| E02 / SE01 | Correo externo | Entregar mensajes de verificación y recuperación y los enlaces de identidad definidos | Servicio previsto para producción; proveedor todavía sin seleccionar. R07/R08; RF02/RF04; [plan de identidad](../../specs/001-identidad-acceso-roles/plan.md) |
| E04 / SE03; referencia E04-YT | YouTube Live | Recibir la emisión del docente y distribuir su reproducción a los alumnos | Elección DEC01 aceptada; integración, emisión/reproducción y compatibilidad del control de acceso pendientes D07/D08. RF16, DA03 |
| E03 / SE01 | Mailpit local | Capturar mensajes de ensayo sin enviarlos a destinatarios reales | Apoyo de desarrollo y pruebas, comprobado técnicamente; no proveedor de producción ni flujo de correo funcional. R07 y [catálogo](../02-arquitectura-software/componentes-arquitectonicos.md) |

E04 agrupa la elección **YouTube Live con OBS** en el catálogo de actores. La referencia E04-OBS identifica **OBS Studio**, herramienta de captura y emisión utilizada por el docente, no un proveedor ni una capacidad de control remoto de Academia Virtual. En C1 puede indicarse «mediante OBS» en la relación de emisión, conservando YouTube Live como sistema externo de video.

Mailpit se incluye para aclarar su función y conservar E03; queda fuera del futuro diagrama principal del contexto de producción. No se duplica como segunda salida simultánea de correo. E02 conserva el nombre genérico porque faltan proveedor, remitente, condiciones de seguridad, cuotas y costo; no se introduce una marca no elegida.

## Relaciones del contexto

Las relaciones son interacciones de negocio o de uso, no imports ni conexiones internas. Las filas **previstas** tienen respaldo de alcance o decisión, pero no evidencia de integración funcional. La tabla mantiene separados el envío de solicitudes de pago y la comprobación de su resultado; no fija endpoints, mecanismos de notificación o modalidad de cobro todavía sin especificar.

| Origen | Destino | Propósito | Estado | Fuente |
| --- | --- | --- | --- | --- |
| A01 · Visitante | Academia Virtual | Registrarse como alumno, verificar correo y solicitar acceso o recuperación | Previsto; historias de identidad pendientes | [Actores](../01-analisis-de-sistema/01-actores.md), HU01–HU03; RF01–RF04 |
| A02 · Alumno | Academia Virtual | Gestionar perfil, consultar oferta, adquirir cursos y utilizar recursos académicos autorizados | Previsto; no hay recorrido académico operativo | Actores; HU04/HU08/HU10–HU12/HU15–HU17; RF05/RF10–RF14/RF16–RF18 |
| A03 · Docente | Academia Virtual | Consultar sus cursos, gestionar materiales y clases y participar según permisos | Previsto; permisos académicos detallados pendientes | Actores; HU13/HU14/HU17; RF15/RF16/RF18; D12 |
| A04 · Administrador | Academia Virtual | Gestionar cuentas y oferta y realizar administración académica autorizada | Previsto; gestión funcional y matriz académica pendientes | Actores; HU05/HU09/HU17; RF06/RF08–RF10/RF18 |
| A05 · Responsable del entorno | Academia Virtual | Inicializar el acceso administrativo y realizar recuperación restringida | Previsto para esos procedimientos funcionales; sin aceptación completa | Actores; HU06; RF07/RF19; D13 |
| Academia Virtual | E01 · Izipay | Solicitar y verificar operaciones de pago vinculadas a una orden | Previsto; modalidad exacta de integración por especificar | [Requisitos](../01-analisis-de-sistema/03-requisitos-funcionales.md), RF12/RF13; [D02](../decisiones-pendientes.md); catálogo |
| E01 · Izipay | Academia Virtual | Comunicar información del resultado del pago para comprobarla antes de habilitar matrículas | Previsto; contrato de confirmación pendiente | RF12/RF13; D02; [decisiones arquitectónicas](../01-analisis-de-sistema/07-decisiones-arquitectonicas.md); catálogo |
| Academia Virtual | E02 · Correo externo | Solicitar entrega de mensajes de verificación y recuperación definidos por identidad | Previsto; proveedor y flujo funcional pendientes | RF02/RF04; R07/R08; plan de identidad |
| E02 · Correo externo | A01/A02/A03/A04 · Destinatarios de identidad | Entregar mensajes que permitan verificar correo o recuperar acceso cuando corresponda | Previsto; entrega externa no acreditada | Actores; RF02/RF04; plan y [contrato de identidad](../../specs/001-identidad-acceso-roles/contracts/api.md) |
| A03 · Docente | E04 · YouTube Live | Emitir la clase mediante OBS | Previsto; sin ensayo reproducible registrado | [Alcance](../alcance-mvp.md), RF16; DEC01; D07/D08; catálogo |
| E04 · YouTube Live | A02 · Alumno | Distribuir el video reproducido en la experiencia de clase de Academia Virtual | Previsto; reproducción e integración pendientes, acceso restringido por validar | RF16; HU15; DEC01; D07/D08; catálogo |
| Academia Virtual | E03 · Mailpit local | Capturar correos en el entorno de ensayo, en sustitución de la salida externa | Captura técnica comprobada en pruebas; envío funcional de identidad pendiente. Relación local, fuera del C1 de producción | Catálogo; [evidencia de compatibilidad y fundamentos](../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md); R07 |

El alumno es el pagador de la orden según A02/HU11. La modalidad contratada de Izipay todavía no define cómo se presenta la experiencia de pago ni quién captura cada dato. No se establece una conexión técnica directa alumno–Izipay como confirmada ni se atribuye a Academia Virtual almacenamiento o procesamiento de datos de tarjeta. La interacción del pagador con la pasarela deberá precisarse al especificar pagos; una pantalla de éxito nunca sustituye la comprobación del proveedor.

Para video se distingue solicitar acceso a la clase en Academia Virtual de emitir o recibir el video en YouTube. La relación de distribución ocurre durante la reproducción del alumno; no implica que el servidor de Academia Virtual consulte una API de YouTube, retransmita video o controle OBS. La elección vigente no demuestra que los permisos de la plataforma restrinjan el acceso directo al proveedor.

## Elementos del futuro diagrama C1

El diagrama principal deberá mostrar una sola caja **Academia Virtual**, las personas A01–A05 y los sistemas externos E01 · Izipay, E02 · Correo externo y E04 · YouTube Live. Alumno, docente y administrador conservarán sus nombres e identificadores; Visitante y Responsable del entorno se distinguirán de los roles de cuenta.

Las conexiones deberán expresar los propósitos de la tabla: cada persona utiliza o administra Academia Virtual; la plataforma solicita/verifica pagos y recibe su confirmación; solicita entrega de correo a E02; el servicio entrega mensajes a los destinatarios; el docente emite a YouTube mediante OBS y el alumno recibe su reproducción. La entrega a destinatarios puede agruparse visualmente sin inventar otra persona ni duplicar el servicio. Las direcciones de video conservarán el flujo emisor–proveedor–espectador, separado de la interacción de esas personas con Academia Virtual.

No se añadirá una conexión de control Academia Virtual–YouTube ni una conexión técnica de pago alumno–Izipay hasta contar con especificación que las respalde. Mailpit no formará parte de esta vista principal; su condición de sustituto local puede explicarse mediante una nota textual. La leyenda distinguirá diseño previsto de funcionamiento comprobado y no presentará las relaciones funcionales externas como validadas. Esta entrega no incluye todavía el diagrama.

## Estado e incertidumbres

El [catálogo vigente](../02-arquitectura-software/componentes-arquitectonicos.md), contrastado con las evidencias de [credenciales y límites](../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md) y [sesiones y autorización](../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md), respalda fundamentos de identidad y controles compartidos. No respalda registro, acceso, perfil o administración completos ni operaciones académicas. Se conserva la [arquitectura vigente](../02-arquitectura-software/arquitectura-inicial.md) como referencia del diseño; el estado funcional se obtiene de la evidencia posterior. Esta vista no declara nuevas pruebas.

| Incertidumbre | Efecto sobre el contexto y condición pendiente |
| --- | --- |
| Pagos y matrículas · D01–D06 | Especificar modalidad de integración, confirmación, cupos, vigencia y políticas; confirmar condiciones comerciales, pruebas y disponibilidad de Yape para la modalidad contratada. No se promete esa opción ni reembolsos |
| Video · DEC01, D07/D08 | Validar emisión, reproducción y compatibilidad con RF16, incluido acceso directo y permisos vencidos; autenticar la página u ocultar un enlace no prueba protección del video |
| Correo · R07/R08 | Seleccionar proveedor y comprobar condiciones, costo y entrega; implementar los flujos antes de atribuir correos funcionales. Captura local no demuestra recepción real |
| Facultades académicas · D12 y actores | Definir asignación, publicación, moderación y operaciones mínimas por rol; mantener permisos no definidos sin concesión automática |
| Recuperación y capacidad · D13/D10 | Completar recuperación verificable y pruebas de carga; 1000 usuarios concurrentes siguen siendo un objetivo no demostrado, con matrícula y clases diferenciadas |

Las decisiones abiertas se mantienen en el [registro de pendientes](../decisiones-pendientes.md), sin ampliar el alcance desde esta descripción del contexto.
