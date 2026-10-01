# Especificación de funcionalidad: Identidad, autenticación y acceso por roles

**Rama de trabajo**: `main`

**Directorio de funcionalidad**: `specs/001-identidad-acceso-roles`

**Creada**: 2026-09-23

**Estado**: Especificación revisada; Q1–Q3 resueltas el 2026-09-23. Lista para planificación.

**Entrada**: Permitir que alumnos, docentes y administradores accedan al sistema con permisos
adecuados: registro de alumnos, sesión, perfil propio, inicio por rol, protección en backend,
gestión básica de cuentas y tratamiento de errores. Interfaz para celular y computadora.
Decisiones confirmadas: correo verificado antes del acceso, recuperación por correo con
enlace de un solo uso y un único rol por cuenta.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 — Acceder y cerrar sesión (Prioridad: P1)

Como alumno, docente o administrador con cuenta habilitada, quiero acceder con mis credenciales
y cerrar mi sesión para utilizar únicamente las operaciones que me corresponden.

**Motivo de prioridad**: habilita el acceso seguro al sistema para todos los roles.

**Prueba independiente**: usar cuentas de prueba ya habilitadas de cada rol; no requiere
registro público, cursos ni pagos. Requisitos FR-005–FR-009 y FR-022–FR-024.

**Escenarios de aceptación**:

1. **Dada** una cuenta activa y habilitada para acceder, **cuando** presenta credenciales
   correctas, **entonces** inicia sesión y llega a su pantalla inicial correspondiente.
2. **Dadas** credenciales incorrectas, un correo inexistente o una cuenta desactivada,
   **cuando** se intenta acceder, **entonces** no se crea sesión y se muestra el mismo mensaje
   de fallo, sin revelar si existe la cuenta o por qué no puede acceder.
3. **Dada** una sesión vigente, **cuando** se cierra, **entonces** deja de autorizar operaciones
   protegidas, incluso si se reutiliza su identificador o se navega hacia atrás. Las sesiones
   independientes de otros dispositivos siguen vigentes, salvo revocación administrativa.
4. **Dada** una sesión, **cuando** alcanza 30 minutos sin actividad protegida o 8 horas desde
   el acceso, **entonces** la siguiente operación protegida se deniega y se solicita iniciar
   sesión otra vez, sin ejecutar ni reenviar automáticamente la operación pendiente.
5. **Dados** cinco intentos fallidos de acceso en 15 minutos para un mismo correo desde un
   mismo origen, **cuando** se intenta de nuevo durante los siguientes 15 minutos, **entonces**
   se limita temporalmente ese intento, sin desactivar la cuenta ni revelar su existencia.
6. **Dada** una interrupción del servicio durante el acceso, **cuando** no se puede confirmar
   el resultado, **entonces** se informa que no pudo completarse y se permite reintentar sin
   mostrar un acceso exitoso inexistente ni detalles internos del fallo.

### Historia de usuario 2 — Registrarse como alumno (Prioridad: P1)

Como visitante, quiero crear una cuenta de alumno con los datos mínimos para poder acceder
al sistema sin depender de que un administrador me registre manualmente.

**Motivo de prioridad**: es la entrada pública de los futuros alumnos.

**Prueba independiente**: registrar una cuenta nueva y comprobar sus datos, estado y permisos,
con verificación obligatoria del correo. Requisitos FR-001–FR-004 y FR-029–FR-031.

**Escenarios de aceptación**:

1. **Dado** un visitante con nombre, correo no registrado y contraseña válidos, **cuando** se
   registra, **entonces** se crea exactamente una cuenta de alumno pendiente de verificar
   correo, se envía el enlace de verificación y aún no se permite acceso protegido.
2. **Dados** campos obligatorios vacíos, correo mal formado o contraseña fuera de los límites,
   **cuando** se envía el formulario, **entonces** se identifican los campos inválidos y no se
   crea ninguna cuenta; nunca se repite la contraseña en el mensaje ni se conserva al recargar.
3. **Dado** un intento que agrega o modifica rol, permisos o estado desde el registro público,
   **cuando** el backend lo recibe, **entonces** lo rechaza sin crear cuentas privilegiadas ni
   alterar cuentas existentes, aunque el envío no provenga del formulario de la web.
4. **Dados** dos registros con el mismo correo, también con mayúsculas o espacios exteriores,
   **cuando** se procesan simultáneamente o se reintentan, **entonces** existe como máximo una
   cuenta y ninguna credencial o dato previo se sobrescribe. El intento no creado recibe una
   respuesta que no confirma públicamente si el correo ya tiene cuenta.
5. **Dada** una cuenta activa con correo pendiente, **cuando** su destinatario usa un enlace
   vigente de verificación, **entonces** se verifica solo ese correo y puede iniciar sesión
   con su contraseña; abrir el enlace no inicia sesión ni cambia su rol.
6. **Dado** un enlace alterado, vencido, ya utilizado o sustituido por un reenvío,
   **cuando** se utiliza, **entonces** no habilita ninguna cuenta ni revela sus datos y se
   ofrece solicitar otro enlace. Una cuenta ya verificada conserva ese estado.
7. **Dada** una solicitud de reenvío, **cuando** cumple los límites de FR-031, **entonces**
   se envía un nuevo enlace solo si la cuenta está activa y pendiente de verificar. La
   respuesta pública es genérica para todos los correos y no confirma si existen.
8. **Dado** un fallo de envío, **cuando** el registro o reenvío termina, **entonces** la
   cuenta permanece pendiente, no se afirma que el mensaje fue entregado y se informa cómo
   reintentar sin crear otra cuenta. Al desactivar la cuenta se invalidan sus enlaces pendientes.

### Historia de usuario 3 — Consultar mi perfil e inicio (Prioridad: P2)

Como usuario autenticado, quiero reconocer mi cuenta y ver una pantalla inicial básica acorde
con mis permisos, tanto en celular como en computadora.

**Motivo de prioridad**: permite comprobar que se accedió a la identidad y al espacio correctos.

**Prueba independiente**: usar una sesión de prueba por rol y consultar su propio perfil e
inicio. Requisitos FR-010–FR-012 y FR-021.

**Escenarios de aceptación**:

1. **Dada** una sesión válida, **cuando** se consulta el perfil propio, **entonces** se muestra
   nombre, correo, único rol autorizado y estado, sin contraseña ni secretos de sesión.
2. **Dado** un alumno, docente o administrador autenticado, **cuando** abre el inicio,
   **entonces** ve su identidad, el espacio de su rol, acceso al perfil y cierre de sesión;
   solo el administrador dispone de acceso a la gestión de cuentas.
3. **Dado** cualquier flujo incluido, **cuando** se usa a 360 × 800 o 1366 × 768 píxeles,
   **entonces** todos los controles y mensajes son accesibles, sin desplazamiento horizontal
   de la página ni acciones disponibles exclusivamente al pasar el puntero.
4. **Dada** una navegación con teclado, **cuando** se recorre un formulario, **entonces** sus
   campos tienen etiquetas, el foco es visible y los errores se comunican también con texto.

### Historia de usuario 4 — Administrar cuentas (Prioridad: P1)

Como administrador, quiero consultar y gestionar cuentas para habilitar a las personas
correctas y retirar accesos cuando corresponda.

**Motivo de prioridad**: permite incorporar docentes y controlar accesos sin registro público
privilegiado ni modificaciones manuales de datos.

**Prueba independiente**: usar un administrador y cuentas de prueba; demostrar altas, cambios
y revocaciones sin datos académicos. Requisitos FR-013–FR-017 y FR-025.

**Escenarios de aceptación**:

1. **Dado** un administrador activo, **cuando** busca cuentas por nombre o correo y filtra por
   rol o estado, **entonces** ve los resultados coincidentes con nombre, correo, rol y estado;
   puede consultar una cuenta y corregir su nombre, sin acceder a contraseñas o sesiones.
2. **Dado** un administrador activo, **cuando** crea una cuenta con nombre, correo único y
   rol autorizado, **entonces** el destinatario obtiene una credencial provisional por un
   canal privado ajeno al repositorio y debe sustituirla antes de acceder a datos protegidos.
   Repetir la creación no debe generar otra cuenta. La cuenta tiene exactamente un rol y
   debe verificar su correo antes de acceder a datos protegidos.
3. **Dada** una cuenta con sesiones en dos dispositivos, **cuando** el administrador confirma
   su desactivación, **entonces** todas sus sesiones quedan invalidadas; cualquier operación
   protegida recibida después de la confirmación se deniega y el acceso nuevo también falla.
4. **Dada** una cuenta activa, **cuando** se cambian sus permisos, **entonces** todas sus
   sesiones anteriores dejan de autorizar, incluso si se agregaron privilegios; debe iniciar
   sesión nuevamente y solo recibe los permisos de su único rol actual.
5. **Dada** una cuenta desactivada, **cuando** se reactiva, **entonces** puede volver a iniciar
   sesión con credenciales válidas; ninguna sesión anterior vuelve a ser válida.
6. **Dados** administradores activos, **cuando** se intenta desactivar la propia cuenta,
   cambiar los propios roles o retirar el último administrador activo, **entonces** se rechaza
   la operación sin cambios. La protección del último administrador también rige ante cambios
   simultáneos realizados por administradores diferentes.

### Historia de usuario 5 — Proteger operaciones y datos privados (Prioridad: P1)

Como usuario, quiero que mis datos privados estén protegidos aunque otra persona manipule
la navegación o envíe solicitudes directamente al sistema.

**Motivo de prioridad**: la autorización debe sostenerse en el backend y no en ocultar controles.

**Prueba independiente**: usar cuentas A y B de alumno, una de docente y una de administrador;
intentar accesos permitidos y prohibidos sin otros módulos. Requisitos FR-018–FR-020 y FR-026.

**Escenarios de aceptación**:

1. **Dado** un visitante o una sesión inválida, **cuando** solicita un recurso protegido,
   **entonces** no obtiene datos ni ejecuta modificaciones y recibe una indicación de acceso
   requerido, sin información privada en la respuesta.
2. **Dado** el alumno A, **cuando** intenta consultar o modificar datos privados del alumno B
   cambiando identificadores o enviando una solicitud directa, **entonces** no recibe los datos
   ni cambia el estado de B. La respuesta no confirma si B existe.
3. **Dado** un alumno o docente, **cuando** intenta listar cuentas, crear docentes o
   administradores, cambiar roles, activar o desactivar cuentas, **entonces** se deniega
   cada operación en el backend y ninguna cuenta cambia.
4. **Dada** una secuencia de registro, verificación, recuperación, acceso fallido, acceso
   exitoso, cierre, expiración y gestión administrativa, **cuando** se revisan los registros
   de esos eventos y sus errores, **entonces** no contienen contraseñas, credenciales
   provisionales, tokens de sesión ni enlaces completos o secretos de verificación/recuperación.
   Los cambios administrativos sí permiten identificar responsable, cuenta afectada, fecha,
   acción y resultado, sin guardar credenciales ni cuerpos completos con datos sensibles.

### Historia de usuario 6 — Establecer el primer administrador (Prioridad: P1)

Como responsable del entorno, quiero crear la primera cuenta administradora mediante un
procedimiento restringido para iniciar la operación sin credenciales públicas o predeterminadas.

**Motivo de prioridad**: evita depender del registro público o de una cuenta privilegiada fija.

**Prueba independiente**: usar un entorno aislado sin cuentas y ejecutar el procedimiento
operativo autorizado. Requisitos FR-027–FR-028.

**Escenarios de aceptación**:

1. **Dado** un entorno sin ningún administrador creado, **cuando** su responsable autorizado
   realiza la inicialización restringida aportando nombre, correo y credencial privada,
   **entonces** se crea un único administrador y se exige sustituir la credencial inicial
   y verificar el correo antes de usar funciones administrativas.
2. **Dado** un entorno ya inicializado, **cuando** se repite el procedimiento, incluso en
   paralelo o después de desactivar cuentas, **entonces** no crea otro administrador ni
   sobrescribe credenciales. No funciona como puerta alternativa de recuperación.
3. **Dado** un visitante sin acceso al procedimiento operativo, **cuando** intenta inicializar
   administradores desde la interfaz pública, **entonces** no puede hacerlo. La documentación,
   los ejemplos, los logs y el repositorio no incluyen credenciales reales ni valores por defecto.

### Historia de usuario 7 — Recuperar una contraseña olvidada (Prioridad: P1)

Como usuario con correo verificado, quiero restablecer mi contraseña mediante un enlace de
un solo uso enviado a ese correo para recuperar el acceso sin compartir mi contraseña.

**Motivo de prioridad**: el usuario confirmó la recuperación autónoma como parte de esta entrega.

**Prueba independiente**: usar una cuenta activa con correo verificado y acceso al buzón de
prueba; no requiere gestión académica. Requisitos FR-024 y FR-030–FR-033.

**Escenarios de aceptación**:

1. **Dada** una solicitud de recuperación, **cuando** se acepta, **entonces** la respuesta es
   genérica tanto para cuentas existentes como inexistentes, desactivadas o sin verificar.
   Solo una cuenta activa con correo verificado recibe un enlace; solicitarlo no cambia la
   contraseña ni invalida sesiones vigentes por sí solo.
2. **Dado** un enlace vigente, **cuando** el destinatario confirma una nueva contraseña válida,
   **entonces** se reemplaza la anterior, se invalidan todas las sesiones y todos los enlaces
   de recuperación pendientes, y se pide iniciar sesión; el enlace no inicia sesión por sí solo.
3. **Dado** un enlace vencido, alterado, usado o reemplazado, **cuando** se intenta restablecer,
   **entonces** no cambia la contraseña ni revela datos y se permite solicitar otro enlace
   dentro de los límites. Un enlace de verificación no sirve para recuperar y viceversa.
4. **Dado** el mismo enlace presentado simultáneamente dos veces, **cuando** se procesan ambas
   solicitudes, **entonces** como máximo una modifica la contraseña y la otra se rechaza.
5. **Dada** una cuenta desactivada después de emitir el enlace, **cuando** intenta usarlo,
   **entonces** se rechaza y no se reactiva la cuenta. Reactivarla tampoco revive el enlace.
6. **Dada** una nueva contraseña inválida o un fallo temporal, **cuando** no se completa el
   restablecimiento, **entonces** se conserva la contraseña anterior y no se consume el enlace
   por el error de validación. El fallo no incluye secretos ni afirma un éxito inexistente.
7. **Dado** un fallo de entrega del correo, **cuando** se solicita recuperación, **entonces**
   no se promete entrega y se ofrece reintentar; no se altera la contraseña ni el estado.

### Casos límite, errores y abuso

- **Correo duplicado y doble envío:** aplicar HU2.4 incluso si llegan a la vez; no fusionar
  cuentas ni confirmar su existencia a visitantes.
- **Sesión expirada durante una acción:** denegar antes de efectuar cambios, pedir nuevo
  acceso y no repetir automáticamente la operación (HU1.4).
- **Desactivación con una pantalla abierta:** el contenido ya visualizado no puede retirarse
  de la memoria del usuario, pero la siguiente solicitud protegida debe denegarse y la interfaz
  debe limpiar el perfil y pedir acceso. No prometer borrar copias tomadas anteriormente.
- **Cambio de permisos o reactivación:** los identificadores de sesión anteriores nunca
  recuperan validez; la nueva sesión usa los permisos actuales (HU4.4–HU4.5).
- **Intento de conservar privilegios mediante datos del cliente:** se ignoran como fuente
  de autoridad; el backend determina identidad y permisos (HU2.3, HU5.3).
- **Retirada concurrente de administradores:** nunca dejar cero administradores activos
  mediante las operaciones de gestión incluidas (HU4.6).
- **Fuerza bruta:** limitar intentos según HU1.5; este control mínimo no demuestra resistencia
  a ataques distribuidos. El plan deberá evaluar medidas adicionales sin permitir bloqueos
  administrativos permanentes provocados por visitantes.
- **Fallos inesperados y reintentos:** no mostrar mensajes internos ni secretos; indicar
  que no se completó la acción y no duplicar cuentas al reintentar (HU1.6, HU2.4).
- **Correo no verificado:** no permite acceso protegido; se puede solicitar reenvío limitado
  sin que la respuesta revele si existe la cuenta (HU2.5–HU2.8).
- **Robo o reutilización de enlaces:** comprobar finalidad, caducidad y uso único; los enlaces
  no conceden sesión ni roles, y nunca aparecen en logs (HU2.6, HU7.2–HU7.5).
- **Cuenta con más de un rol en una solicitud:** rechazar la creación o cambio sin modificaciones;
  no sumar permisos ni seleccionar un rol a partir de datos enviados por el cliente.
- **Pérdida de acceso al buzón:** queda fuera la recuperación manual de identidad; no se puede
  reemplazar el correo ni restablecer contraseñas por una petición pública sin ese control.

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001:** El registro público DEBE solicitar solo nombre para identificar al usuario,
  correo y contraseña. NO DEBE exigir DNI, teléfono, dirección ni datos de pago. Nombre:
  entre 1 y 100 caracteres tras retirar espacios exteriores; correo válido de hasta 254
  caracteres; contraseña entre 12 y 128 caracteres, permitiendo espacios y sin truncarla.
- **FR-002:** El sistema DEBE considerar único el correo sin distinguir mayúsculas ni espacios
  exteriores. Una cuenta desactivada sigue ocupando su correo. Los registros duplicados o
  simultáneos NO DEBEN crear más de una cuenta ni reemplazar datos existentes.
- **FR-003:** El registro público DEBE crear únicamente alumnos y rechazar asignaciones de rol,
  permisos o estado enviadas por el visitante. Ningún dato del cliente puede elevar privilegios.
- **FR-004:** Toda cuenta DEBE verificar su correo antes de acceder a datos protegidos,
  incluidas las cuentas creadas por administración y el primer administrador. Registro,
  verificación, reenvío, establecimiento de contraseña inicial y recuperación son flujos
  de acceso restringido a su propósito; no conceden por sí mismos una sesión de aplicación.
- **FR-005:** El acceso DEBE aceptar correo y contraseña correctos únicamente para cuentas
  activas y habilitadas; las cuentas desactivadas no pueden iniciar sesiones.
- **FR-006:** Credenciales inválidas, correo inexistente y cuenta desactivada DEBEN producir
  el mismo mensaje público de fallo, sin revelar detalles de la cuenta.
- **FR-007:** Cerrar sesión DEBE invalidar la sesión utilizada y limpiar los datos de usuario
  visibles en esa interfaz. Reutilizar esa sesión NO DEBE permitir una operación protegida.
- **FR-008:** La sesión DEBE expirar tras 30 minutos sin operaciones protegidas aceptadas o
  al cumplir 8 horas desde el acceso, lo que ocurra primero. Una solicitud rechazada NO
  prolonga la sesión. Varias sesiones de una misma cuenta se permiten con expiración propia.
- **FR-009:** Al detectar expiración o revocación, el sistema DEBE denegar la operación, pedir
  nuevo acceso y evitar reenvíos automáticos de cambios pendientes.
- **FR-010:** El usuario autenticado DEBE poder consultar su nombre, correo, único rol y
  estado. El perfil NO DEBE devolver contraseñas ni secretos de sesión.
- **FR-011:** Cada usuario DEBE disponer de una pantalla inicial básica acorde con el rol
  autorizado, con identidad, acceso al perfil y cierre de sesión. El administrador también
  tiene entrada a gestión de cuentas; no se incluyen indicadores académicos ni financieros.
- **FR-012:** Cada cuenta DEBE tener exactamente un rol: alumno, docente o administrador.
  Las solicitudes con varios roles DEBEN rechazarse sin cambios. No existe selección de
  rol activo ni acumulación de privilegios; cambiar de rol reemplaza al anterior.
- **FR-013:** Solo un administrador DEBE poder listar y buscar cuentas por nombre/correo,
  filtrar por rol/estado, consultar el detalle mínimo y corregir el nombre de una cuenta.
- **FR-014:** Solo un administrador DEBE poder crear cuentas de alumno, docente o administrador
  y asignar un único rol. Debe exigir correo único y entregar una credencial provisional mediante
  un canal privado controlado; la verificación del correo usa el flujo de FR-029.
  Esa credencial permite únicamente establecer una contraseña propia con la política FR-001,
  queda inutilizable tras hacerlo y no aparece en perfiles, listados ni registros.
  Caduca a las 24 horas. Si vence, el destinatario puede verificar su correo y usar la
  recuperación para establecer su contraseña; no se permite eludir verificación o desactivación.
- **FR-015:** Desactivar una cuenta DEBE invalidar todas sus sesiones. Toda operación protegida
  recibida tras confirmar la desactivación DEBE denegarse. Se conserva la cuenta; no se borra.
- **FR-016:** Cambiar los permisos de una cuenta DEBE invalidar todas sus sesiones, tanto al
  agregar como al retirar privilegios. Reactivarla NO DEBE restaurar sesiones anteriores.
- **FR-017:** El administrador NO DEBE desactivar su propia cuenta ni cambiar sus propios
  roles. El sistema DEBE impedir retirar el último administrador activo, incluso ante
  operaciones simultáneas. Las acciones rechazadas no modifican permisos ni estado.
- **FR-018:** Toda operación protegida DEBE verificar en el backend la identidad, vigencia de
  sesión, estado de cuenta y permisos actuales; ocultar una pantalla NO satisface el requisito.
- **FR-019:** Alumnos y docentes NO DEBEN consultar ni modificar perfiles privados ajenos ni
  gestionar cuentas. Alterar identificadores o enviar solicitudes directas DEBE denegarse
  sin filtrar datos ni confirmar la existencia de cuentas fuera de su alcance.
- **FR-020:** Las operaciones ajenas a la matriz de esta funcionalidad DEBEN denegarse por
  defecto. Los permisos sobre cursos y matrículas se definirán en sus futuras especificaciones.
- **FR-021:** Todos los flujos incluidos DEBEN cumplir las condiciones de pantalla, teclado,
  etiquetas y errores de HU3.3–HU3.4 en celular y computadora.
- **FR-022:** Tras cinco intentos fallidos en una ventana de 15 minutos por correo y origen,
  el sistema DEBE limitar nuevos intentos de esa combinación durante 15 minutos, con aviso
  genérico. Esto NO DEBE desactivar la cuenta ni bloquear otras combinaciones por esa regla.
- **FR-023:** Los formularios DEBEN identificar campos inválidos sin exponer contraseñas ni
  conservarlas tras recargar. Los fallos inesperados DEBEN usar mensajes comprensibles sin
  detalles internos ni confirmaciones falsas de éxito.
- **FR-024:** Una cuenta activa con correo verificado DEBE poder recuperar su contraseña
  mediante un enlace de un solo uso enviado exclusivamente a ese correo. La respuesta
  pública NO DEBE revelar existencia, estado o verificación de cuentas. La recuperación
  no sustituye la verificación del correo ni permite cambiarlo.
- **FR-025:** Los cambios administrativos DEBEN dejar evidencia de actor, cuenta afectada,
   momento, acción y resultado. Los administradores no pueden consultar secretos almacenados
   de acceso; la entrega inicial privada de FR-014 no permite recuperarlos posteriormente.
- **FR-026:** Ningún registro de aplicación, error o auditoría DEBE contener contraseñas,
  credenciales provisionales ni tokens de sesión, incluidos errores de validación.
- **FR-027:** El primer administrador DEBE crearse mediante un procedimiento operativo
  restringido al responsable del entorno, sin registro público privilegiado. Solo procede
  si el entorno nunca tuvo un administrador; la cuenta requiere nombre, correo y credencial
  privada aportados en ese momento, sin valores predeterminados ni secretos versionados.
- **FR-028:** Inicializar administradores DEBE ser una acción única por entorno: repetirla o
  ejecutarla simultáneamente NO DEBE crear cuentas adicionales ni reemplazar credenciales.
  La credencial inicial se sustituye antes de acceder a la administración, igual que FR-014.
- **FR-029:** Verificar correo DEBE requerir un enlace de un solo uso válido durante 24 horas
  desde su emisión. Solo modifica la verificación de la cuenta y correo destinatarios si la
  cuenta sigue activa; no cambia roles, contraseñas ni inicia sesión. Abrir enlaces inválidos
  no debe modificar ninguna cuenta ni revelar datos; se permite solicitar un reenvío.
- **FR-030:** Los enlaces de recuperación DEBEN caducar a los 30 minutos desde su emisión.
  Emitir un enlace nuevo de verificación o recuperación DEBE invalidar todos los anteriores
  del mismo propósito. Un enlace NO DEBE servir para otro propósito ni funcionar dos veces,
  incluso con solicitudes simultáneas. Desactivar la cuenta invalida ambos tipos de enlaces.
- **FR-031:** Los envíos iniciales y reenvíos DEBEN limitarse por propósito a uno por minuto
  y cinco por hora por correo destinatario, además de veinte por hora por origen. Las
  respuestas y límites se aplican sin confirmar existencia de cuentas. Rebasar un límite
  no envía mensajes ni desactiva cuentas. Un fallo de envío no habilita el acceso ni promete
  entrega; el usuario puede reintentar dentro de los límites, sin duplicar cuentas. Crear
  la cuenta no evita el límite de envío: si se supera, queda pendiente de verificación y
  se informa de forma genérica cuándo puede solicitarse nuevamente el envío.
- **FR-032:** Confirmar una recuperación válida DEBE sustituir la contraseña según FR-001,
  invalidar todas las sesiones y enlaces de recuperación de la cuenta y cualquier credencial
  provisional pendiente, y exigir nuevo inicio de sesión. No debe reactivar cuentas ni cambiar
  rol o correo. La contraseña anterior deja de permitir acceso.
- **FR-033:** Los registros NO DEBEN incluir enlaces completos ni secretos de verificación o
  recuperación. Una contraseña nueva inválida NO DEBE modificar la anterior ni consumir un
  enlace que siga vigente. Los errores deben permitir reintentar sin exponer detalles internos.

### Matriz de acceso base

Esta matriz define permisos para el único rol asignado a cada cuenta.
Una sesión expirada, revocada o de una cuenta desactivada no otorga permisos.

| Operación | Visitante | Alumno | Docente | Administrador |
| --- | --- | --- | --- | --- |
| Registro público como alumno | Permitido | Sin elevación de privilegios | Sin elevación de privilegios | Sin elevación de privilegios |
| Iniciar sesión | Cuenta activa y habilitada | Cuenta activa y habilitada | Cuenta activa y habilitada | Cuenta activa y habilitada |
| Verificar correo o recuperar contraseña | Solo con el enlace válido para el propósito | Mismas condiciones | Mismas condiciones | Mismas condiciones |
| Consultar perfil propio e inicio | Denegado | Permitido | Permitido | Permitido |
| Cerrar la sesión propia | Sin sesión: sin efecto | Permitido | Permitido | Permitido |
| Consultar perfiles privados ajenos | Denegado | Denegado | Denegado | Solo detalle mínimo de gestión |
| Crear cuentas y asignar roles | Denegado | Denegado | Denegado | Permitido según FR-014 y FR-017 |
| Corregir nombre de cuentas | Denegado | Denegado | Denegado | Permitido |
| Desactivar/reactivar cuentas | Denegado | Denegado | Denegado | Permitido según FR-015–FR-017 |
| Consultar contraseñas o secretos almacenados | Denegado | Denegado | Denegado | Denegado |

### Entidades principales

- **Cuenta:** identidad con nombre, correo único, estado activo/desactivado, verificación
  de correo pendiente/completada, necesidad de cambiar credencial inicial y un único rol.
- **Rol:** categoría alumno, docente o administrador y operaciones permitidas en esta etapa;
  cada cuenta pertenece a una sola categoría.
- **Sesión:** acceso asociado a una cuenta con inicio, última actividad aceptada, expiración
  y posible revocación. No se define aquí su formato ni almacenamiento técnico.
- **Evento de administración:** actor, cuenta afectada, fecha, acción y resultado sin secretos.
- **Autorización de verificación o recuperación:** permiso limitado a una cuenta y propósito,
  con fecha de emisión, caducidad y estado usado o invalidado. No se fija su representación técnica.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

Estos son objetivos de aceptación, no resultados obtenidos. Todos los escenarios deberán
verificarse antes de declarar aprobada la implementación de la funcionalidad.

- **SC-001:** En pruebas guiadas con 10 participantes, al menos 9 completan el registro de
  alumno sin ayuda en menos de 3 minutos de interacción activa; se mide aparte la espera
  de entrega y se incluye el paso obligatorio de verificación en el resultado del flujo.
- **SC-002:** En el conjunto de aceptación, el 100 % de los accesos con cuentas habilitadas
  y credenciales correctas llega al inicio autorizado; ninguno de los casos de credenciales
  inválidas, cuentas desactivadas, sesiones revocadas o expiradas obtiene acceso protegido.
- **SC-003:** El 100 % de los intentos de alumno/docente contra perfiles ajenos o gestión de
  cuentas es denegado sin datos privados ni cambios; ninguna manipulación de registro público
  concede privilegios de docente o administrador.
- **SC-004:** Tras desactivar una cuenta o cambiar permisos, el 100 % de las solicitudes
  protegidas posteriores desde sus dos sesiones de prueba se deniega; reactivar la cuenta
  no rehabilita ninguna sesión anterior.
- **SC-005:** El 100 % de los escenarios incluidos puede completarse a 360 × 800 y 1366 × 768
  píxeles sin desplazamiento horizontal de página, acciones inaccesibles ni errores sin texto;
  registro, acceso, perfil y cierre también pueden recorrerse usando solo teclado.
- **SC-006:** Dos registros simultáneos de un mismo correo generan como máximo una cuenta;
  dos inicializaciones simultáneas generan como máximo un primer administrador; ninguna
  retirada concurrente permitida deja al sistema sin administradores activos.
- **SC-007:** El 100 % de los eventos revisados en HU5.4 está libre de contraseñas, credenciales
  provisionales, tokens y enlaces completos o secretos de verificación/recuperación; todos
  los cambios administrativos permiten atribuir actor y resultado.
- **SC-008:** En 20 accesos válidos secuenciales en el entorno de evaluación documentado,
  al menos 19 muestran el inicio autorizado dentro de 3 segundos desde el envío. Esta
  medición de usabilidad no acredita el objetivo de 1000 usuarios concurrentes.
- **SC-009:** Ninguna cuenta sin correo verificado accede a datos protegidos. El 100 % de los
  enlaces vencidos, usados, reemplazados, alterados o de otro propósito se rechaza sin cambios;
  los casos válidos de verificación y recuperación completan únicamente su propósito.
- **SC-010:** Tras cada recuperación exitosa, la contraseña anterior y las dos sesiones de
  prueba quedan invalidadas; la nueva contraseña permite iniciar sesión. Al menos 9 de 10
  participantes completan la recuperación sin ayuda en menos de 3 minutos de interacción,
  registrando por separado la espera de entrega del correo.

## Supuestos

- Se conserva la arquitectura propuesta en la [constitución](../../.specify/memory/constitution.md)
  y el [alcance del MVP](../../docs/alcance-mvp.md). Esta especificación no elige protocolos,
  bibliotecas, formato de credenciales de sesión, almacenamiento ni mecanismos de protección.
- Nombre, correo y contraseña son los datos mínimos propuestos. Los límites de longitud,
  expiración y restricción de intentos aquí definidos son valores de comportamiento iniciales
  revisables durante aclaraciones; no son afirmaciones de seguridad ya demostrada.
- El correo se usa como identificador. Su normalización no transforma alias del proveedor.
  No se exige nombre legal ni se recopilan datos académicos para crear la identidad.
- Gestión básica significa las operaciones de HU4. No incluye edición del correo ni borrado
  de cuentas. Se incluye recuperación por correo y sustitución de la credencial inicial,
  pero no una pantalla adicional de cambio ordinario de contraseña desde el perfil.
- El responsable del entorno entrega en privado las credenciales provisionales de cuentas
  administradas. No se elige aún herramienta ni canal técnico para esa entrega; el requisito
  verificable es que solo el destinatario autorizado reciba la credencial y la sustituya.
- Se proponen 24 horas para verificar correo o usar la credencial inicial, 30 minutos para
  recuperar contraseña y los límites de FR-031 para envíos. Son valores de comportamiento
  verificables del borrador, ajustables mediante revisión, sin elegir tecnología de correo.
- La revocación aplica a solicitudes recibidas después de confirmar el cambio; no revierte
  acciones ya completadas ni garantiza retirar información ya vista. El plan resolverá cómo
  cumplir esta regla también ante solicitudes concurrentes.

### Alcance excluido

- Pagos, órdenes, matrículas, cursos, materiales, streaming y chat.
- Paneles completos, indicadores académicos o financieros y reportes administrativos avanzados.
- Acceso con proveedores externos, autenticación multifactor y aplicaciones móviles nativas.
- Borrado definitivo, importación masiva de usuarios y modificación autónoma del perfil.
- Elección de detalles técnicos de autenticación; corresponde al plan posterior.
- Implementación, contratación, despliegue y pruebas de carga durante esta etapa documental.
- Recuperación manual por administrador cuando el usuario pierde acceso al buzón; no se
  define una vía alternativa de recuperación del primer administrador fuera de su correo.

### Dependencias y restricciones del proyecto

- No hay funcionalidades previas implementadas que esta especificación presuponga disponibles.
  Los flujos se verificarán con cuentas y entornos de prueba, sin datos reales de alumnos.
- El responsable del entorno debe poder ejecutar la inicialización restringida y entregar
  credenciales privadas; el plan documentará el procedimiento sin secretos reales.
- La verificación y recuperación requieren un medio de envío de correo y buzones de prueba.
  El plan deberá validar acceso, entrega y costo compatibles con S/300; no se elige ni se
  contrata un servicio aquí. Los criterios de caducidad, reenvío y fallos ya están definidos.
- Continúan los cuatro meses de plazo, el presupuesto total de **S/300** y el objetivo de
  **1000 usuarios concurrentes** bajo un escenario reproducible alineado con la rúbrica.
  Esta especificación y sus criterios no demuestran esa capacidad ni la garantizan.
- La prueba temprana de viabilidad del video, ancho de banda y costo sigue siendo necesaria
  a nivel de proyecto, aunque no forma parte de identidad.
- Izipay es la pasarela elegida, con condiciones pendientes registradas en
  [D02](../../docs/decisiones-pendientes.md). Su integración no está implementada, debe quedar
  separada de órdenes/matrículas y no es dependencia para desarrollar ni verificar identidad.

### Aclaraciones resueltas y preguntas pendientes

El responsable del proyecto confirmó el 2026-09-23:

- **Q1:** acceso solo después de verificar el correo; incorporado en FR-004 y FR-029–FR-031.
- **Q2:** recuperación por correo con enlace de un solo uso; incorporada en HU7 y FR-024,
  FR-030–FR-033, con revocación de todas las sesiones al completarla.
- **Q3:** un solo rol por cuenta; incorporado en FR-012 y la matriz de acceso.

No quedan preguntas de comportamiento bloqueantes. El plan debe revisar la viabilidad del
envío de correo y concretar el procedimiento operativo de inicialización y entrega privada,
respetando estos requisitos; no son decisiones de proveedor o tecnología tomadas aquí.
