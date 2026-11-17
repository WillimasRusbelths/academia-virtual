# Especificación: materiales de estudio por grupo

**Cierre T064/T067 — 2026-11-17, America/Lima.** El responsable confirmó «ahora si funciona todos los recorridos», después de repetir el ensayo tras la corrección del PDF. T064 queda completada para el recorrido global de gestor y alumno en laptop, con consentimiento previamente comunicado. Es un resultado comunicado por el responsable, sin observación directa del agente ni desglose de cada paso, formato, ayuda o duración. Móvil no observado; SO, navegador y uso específico de puntero/teclado no informados. H-PDF-01 queda resuelta tras esta repetición humana. T067 completa la sincronización documental; D13/T065, D10/T066 y el cierre integral T068 permanecen pendientes. Avance **65/68**, tres pendientes. [Registro de cierre](evidence/t064-t067-report.md).

**Estado actual — 2026-11-17, America/Lima**: implementación local US1–US3
verificada; T001–T064 y T067 completadas, **65/68**, tres pendientes. T064 tiene confirmación favorable en laptop; T067 sincronizada. T065/D13 y T066/D10 preparados, sin acuerdos o medición externa. T068 conserva dependencias pendientes.

Evidencia: [matriz](verification.md), [verificación automática](evidence/automated.md),
[recuperación real](evidence/recovery.md), [recursos locales](evidence/local-resources.md)
y [revisión de aceptación pendiente](evidence/final-acceptance.md).
[Operación](operation.md) y [capacidad](capacity.md) registran decisiones por acordar.
Aceptación humana limitada al reporte en laptop; D10/D13, CI remoto y cierre integral de 001–003 pendientes.
Las reglas y escenarios originales se conservan; esta actualización informa
ejecución, sin modificar M01–M03, vigencia de matrícula o reglas financieras.

## Registro original de especificación (2026-11-15–16)

Los estados «pendiente de plan/tareas/implementación» y las delimitaciones de
etapa del registro siguiente describen su fecha original; el estado vigente
es el indicado arriba y en tasks.md. Se conserva el texto original completo.


**Feature Branch**: no se crea una rama nueva en esta etapa; trabajo actual en
`feat/003-reservas-ordenes-matricula`. El directorio 004 identifica el incremento
independientemente de la rama Git.

**Created**: 2026-11-15, America/Lima.

**Última revisión**: 2026-11-16, America/Lima.

**Status**: Especificado; pendiente de plan, tareas, implementación y verificación.

**Input**: «continuemos entonces con el spec 4», referido a materiales de estudio
del MVP. El responsable confirmó en esta conversación: materiales por grupo;
docente de sus grupos y administrador de todos; PDF, JPG y PNG hasta 20 MB por archivo.

Fuentes: [alcance MVP](../../docs/alcance-mvp.md), HU12/HU13 y RF14/RF15 del
[análisis](../../docs/01-analisis-de-sistema/03-requisitos-funcionales.md),
[constitución 1.2.1](../../.specify/memory/constitution.md),
[oferta 002](../002-oferta-academica/spec.md) y
[matrícula 003](../003-reservas-ordenes-matricula/spec.md).
Estas referencias conservan sus reglas e IDs; este documento no acredita código
nuevo ni cierre de sus pendientes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar y publicar materiales del grupo (Priority: P1)

Como docente habilitado asignado actualmente a un grupo, quiero cargar y publicar
un material con título y descripción opcional para entregar recursos de estudio
a sus alumnos. El administrador puede realizar estas operaciones en todos los grupos.

**Why this priority**: permite preparar el contenido del grupo y controlar cuándo
se comparte, sin distribuir archivos mediante enlaces públicos.

**Independent Test**: con un grupo existente y cuentas ficticias de docente asignado,
docente ajeno y administrador, preparar/publicar un archivo y comprobar el listado
de gestión, su estado y los accesos permitidos/denegados. No requiere cobrar ni
crear una matrícula durante esta historia.

**Acceptance Scenarios**:

1. **Given** un docente activo, habilitado y asignado a un grupo no cancelado,
   **When** carga un archivo permitido con título válido, **Then** el material queda
   preparado para ese grupo, con archivo completo y datos de autoría, sin acceso del alumno.
2. **Given** un material preparado con archivo completo, **When** el responsable
   autorizado confirma su publicación, **Then** aparece como publicado en gestión
   y queda disponible únicamente a alumnos con acceso vigente a ese grupo.
3. **Given** un administrador activo, **When** prepara/publica material en un grupo
   no cancelado, **Then** puede hacerlo aunque no sea su docente, conservando atribución.
4. **Given** visitante, alumno, docente ajeno o docente sin habilitación actual,
   **When** intenta cargar/publicar material, incluso usando una referencia conocida,
   **Then** se deniega sin guardar una publicación ni revelar archivos ajenos.
5. **Given** archivo incompatible, vacío, incompleto o mayor al máximo,
   **When** se intenta completar su carga, **Then** se rechaza sin material visible
   para alumnos y se conserva el título/descripcion introducidos para corregir el intento.
6. **Given** una carga/publicación con respuesta perdida, **When** el responsable
   consulta o repite la misma intención, **Then** recupera su resultado sin duplicar
   el material o su publicación; una intención nueva se distingue de un reintento.

---

### User Story 2 - Consultar y descargar materiales autorizados (Priority: P1)

Como alumno con matrícula vigente de un grupo, quiero consultar y descargar sus
materiales publicados para estudiar los recursos que me corresponden.

**Why this priority**: entrega el valor principal al alumno y evita que una cuenta,
reserva o enlace compartido conceda acceso fuera de la matrícula aplicable.

**Independent Test**: preparar material publicado y matrículas ficticias vigentes,
históricas y de otro grupo; comprobar listado y archivo completo con cada actor.
Usar referencias de matrícula de 003 sin alterar pagos, cupos o fechas de negocio.

**Acceptance Scenarios**:

1. **Given** alumno activo con matrícula vigente de un grupo, **When** abre sus
   materiales, **Then** ve solo los publicados de ese grupo, con título, descripción
   si existe, formato, tamaño y fecha de publicación; puede descargar el archivo completo.
2. **Given** alumno con reserva, pago pendiente o incidencia sin matrícula,
   **When** intenta consultar/descargar, **Then** ese estado financiero no le concede acceso.
3. **Given** material de otro grupo, **When** un alumno comparte o cambia una referencia
   o solicita directamente el contenido, **Then** no obtiene archivo ni datos privados;
   una matrícula del mismo curso en otro grupo no basta.
4. **Given** matrícula que llega a su fin original, **When** el alumno realiza una
   nueva consulta o solicitud de contenido en ese instante o después, **Then** se deniega;
   inmediatamente antes puede acceder si cumple los demás permisos.
5. **Given** una matrícula todavía vigente y material publicado, **When** el curso/grupo
   se retira de la oferta o su docente pierde habilitación, **Then** esos hechos no
   revocan por sí solos la matrícula ni el acceso del alumno a ese material ya publicado.
6. **Given** grupo sin materiales publicados o un fallo temporal, **When** el alumno
   consulta, **Then** distingue listado vacío de error y puede reintentar la consulta
   sin interpretar el fallo como retiro de su matrícula.
7. **Given** cierre/revocación de sesión o deshabilitación de cuenta, **When** se solicita
   nuevamente el contenido con una referencia previamente obtenida, **Then** se deniega
   y la interfaz no muestra como vigente una respuesta tardía de la sesión anterior.

---

### User Story 3 - Corregir y retirar materiales sin perder su control (Priority: P2)

Como responsable autorizado del grupo, quiero corregir título/descripción y retirar
material de la vista de alumnos para mantener el contenido adecuado y trazable.

**Why this priority**: permite corregir errores sin reemplazar silenciosamente el
archivo que ya se compartió ni eliminar la atribución de acciones anteriores.

**Independent Test**: con materiales preparados, publicados y retirados, comprobar
edición, retiro, publicación explícita y cambio de docente con las cuentas autorizadas;
no requiere modificar la oferta o una matrícula real del usuario.

**Acceptance Scenarios**:

1. **Given** material preparado o publicado, **When** su responsable actual corrige
   título/descripción, **Then** se conserva el archivo y grupo originales, y se registra
   la acción; otro cambio concurrente no se sobrescribe silenciosamente.
2. **Given** material publicado, **When** un responsable autorizado confirma retirarlo,
   **Then** deja de aparecer al alumno y las nuevas solicitudes de archivo se deniegan,
   aunque conserven una referencia anterior; la gestión conserva el registro.
3. **Given** material retirado, **When** un responsable autorizado lo publica de nuevo
   explícitamente, **Then** vuelve a ser accesible solo según permisos vigentes;
   consultar, editar textos o volver a iniciar sesión no lo republica por sí solo.
4. **Given** cambio de docente asignado al grupo, **When** el docente anterior intenta
   gestionar el material, **Then** se deniega; el nuevo docente habilitado puede
   gestionarlo y se conserva la atribución del autor original y de los cambios.
5. **Given** material publicado cuyo archivo debe cambiar, **When** se requiere la
   corrección, **Then** se prepara un material nuevo y se retira el anterior;
   no se cambia el contenido bajo una referencia ya entregada.
6. **Given** un responsable que pierde permiso durante una carga o edición,
   **When** intenta completar la operación, **Then** no se publica ni modifica
   usando una autorización obsoleta.

---

### Edge Cases

- Archivo de exactamente 20 MB frente a uno con un byte adicional; carga vacía o truncada.
- Extensión permitida con contenido incompatible, doble extensión y nombre que intente
  alterar la ubicación del archivo; nombres iguales no deben sustituir otro contenido.
- Desconexión antes/después de completar carga o publicación; repetir intención y
  consultar el resultado no deben crear publicaciones involuntarias adicionales.
- Falta de espacio/capacidad del entorno: rechazar la nueva carga sin perder archivos
  anteriores ni publicar un registro cuyo contenido no está disponible.
- Dos responsables editan/retiran/publican a la vez: conflicto visible y estado coherente,
  sin sobrescritura silenciosa ni acceso decidido solo por una pantalla antigua.
- Material preparado/retirado solicitado con su referencia directa, grupo ajeno o
  referencia inexistente; no exponer archivos, rutas internas o detalles ajenos.
- Cuenta o sesión revocada, docente reasignado, rol cambiado o matrícula que vence
  entre abrir el listado e iniciar una descarga.
- Una matrícula histórica no se reactiva porque la oferta se edite o republique.
- El retiro de oferta no equivale a retiro del material. El responsable puede retirar
  el material explícitamente; una matrícula vigente no habilita contenido retirado.
- Grupo cancelado: sin nuevas cargas/publicaciones/republicaciones; gestión histórica
  de consulta/retiro por administrador. No cambiar reglas de cancelación 002/003.
- Solicitud que ya autorizó y empezó a entregar bytes cuando ocurre retiro o revocación:
  no prometer recuperar lo entregado. Toda nueva solicitud debe volver a autorizarse.
- El alumno conserva fuera de la plataforma un archivo que descargó legítimamente:
  no se promete impedir copias ni borrar archivos de su equipo.
- Reinicio o restauración conserva vínculos y contenido, sin publicar borradores,
  volver públicos los archivos ni dar por recuperados cambios posteriores al backup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada material DEBE pertenecer a exactamente un grupo existente. No se
  comparte automáticamente con otros grupos del mismo curso ni se traslada de grupo;
  compartirlo en otro requiere una publicación independiente autorizada.
- **FR-002**: El docente activo y habilitado DEBE poder gestionar materiales solo
  de grupos que tiene asignados actualmente y no están cancelados. El administrador
  activo DEBE poder gestionarlos en todos los grupos no cancelados. En grupos
  cancelados, solo el administrador puede consultar/descargar el histórico y retirar;
  nadie puede crear, editar textos o publicar/republicar material. Visitante y alumno
  no pueden crear, editar, publicar o retirar materiales.
- **FR-003**: El responsable DEBE poder preparar un material con un archivo, título
  no vacío y descripción opcional. El título/descripcion se tratan como texto,
  sin ejecutar contenido incorporado por el usuario.
- **FR-004**: Solo se DEBEN aceptar PDF, JPEG —extensiones .jpg/.jpeg— y PNG,
  con tamaño mayor que cero y máximo de **20 MB, definidos como 20 000 000 bytes**
  por archivo. Debe comprobarse contenido compatible con el tipo declarado;
  cambiar una extensión no convierte un archivo no permitido en válido.
- **FR-005**: La carga completa y su vínculo con el material DEBEN ser consistentes.
  No publicar archivos incompletos o inaccesibles, sustituir archivos por coincidencia
  de nombre ni afectar material previo por un fallo de carga. Nombre y referencias
  proporcionados no deben permitir salir del contenido autorizado.
- **FR-006**: Los estados observables DEBEN distinguir preparado, publicado y retirado.
  Solo una confirmación explícita autorizada publica o republica un material completo.
  Editar textos no cambia su estado por sí mismo.
- **FR-007**: Un alumno activo DEBE poder listar/descargar únicamente materiales
  publicados de grupos con matrícula propia vigente según las condiciones originales
  de 003. Reserva, pago pendiente, incidencia sin matrícula, matrícula histórica
  o matrícula de otro grupo no conceden ese acceso.
- **FR-008**: Cada consulta de material y cada nueva solicitud del contenido DEBE
  verificar cuenta, sesión, rol y permiso actuales; para alumno, propiedad/vigencia
  de matrícula, y para docente, asignación/habilitación vigentes. Una referencia
  compartida, URL directa o respuesta antigua no sustituyen autorización.
- **FR-009**: El alumno DEBE dejar de obtener nuevas respuestas de material al
  alcanzar el fin original de su matrícula, sin depender del reloj de su equipo
  ni de mantener sesión abierta. Retiro de oferta o pérdida de habilitación docente
  no revocan por sí solos el acceso respaldado por matrícula todavía vigente.
- **FR-010**: La gestión DEBE permitir consultar material preparado/publicado/retirado;
  el alumno solo recibe los publicados que puede acceder. La vista del alumno DEBE
  limitarse a datos necesarios del material y contenido autorizado, sin información
  de otros alumnos, credenciales, ubicación privada o detalles internos de almacenamiento.
- **FR-011**: El responsable DEBE poder corregir título/descripción y retirar material.
  El retiro DEBE impedir listado y nuevas solicitudes de contenido del alumno,
  conservar autoría/historial y requerir publicación explícita para habilitarlo otra vez.
- **FR-012**: El archivo y grupo de un material ya creado NO DEBEN cambiarse bajo
  la misma referencia. Reemplazar contenido requiere material nuevo y, si corresponde,
  retiro del anterior. Nuevos docentes autorizados gestionan lo institucional del
  grupo sin apropiarse de la autoría original.
- **FR-013**: Repetir la misma intención de carga/publicación/retiro ante respuesta
  perdida DEBE recuperar su resultado sin duplicar efectos. Usar la misma identidad
  para otra intención DEBE producir conflicto. Distintas intenciones pueden publicar
  contenido igual; no se exige una deduplicación global que una grupos ajenos.
- **FR-014**: Cambios concurrentes DEBEN detectar revisión obsoleta y revalidar permisos
  antes de confirmar. No sobrescribir silenciosamente cambios, publicar tras perder
  autoridad ni usar estado anterior para autorizar solicitudes nuevas después de retiro.
- **FR-015**: La interfaz DEBE distinguir carga en progreso, preparado, publicado,
  retirado, vacío, archivo rechazado, conflicto, acceso denegado y fallo recuperable.
  Debe conservar textos/entrada recuperable sin anunciar éxito de una operación incierta
  ni reenviar automáticamente una escritura al recargar o iniciar sesión.
- **FR-016**: Los recorridos DEBEN poder completarse con teclado y en computador/móvil,
  con etiquetas y resultados perceptibles. Cerrar sesión o cambiar de cuenta DEBE
  retirar datos anteriores e impedir presentar una respuesta tardía como autorizada.
- **FR-017**: Carga, publicación, cambio de textos y retiro DEBEN conservar actor,
  grupo/material, momento, operación y resultado. Los registros y errores NO DEBEN
  copiar bytes del archivo, credenciales, URLs privadas, rutas del almacenamiento
  o causas internas; usar solo referencias y mensajes necesarios autorizados.
- **FR-018**: El reinicio y recuperación DEBEN conservar tanto el archivo completo
  como su vínculo, estado y atribución. Antes de demo persistente/publicación,
  backup/restore DEBE comprobar conjuntamente archivos y registros en destino separado;
  recuperar solo los registros sin sus archivos no acredita recuperación.
- **FR-019**: Se DEBEN conservar cuentas, configuración, datos, migraciones y evidencia
  anteriores; no modificar reglas de cupos, pagos, vigencia original o catálogo de
  002/003 para conceder acceso a materiales. Retiro de material no cancela matrícula
  ni resuelve incidencias económicas. Los nuevos permisos deben denegarse por defecto.
- **FR-020**: La preparación y pruebas DEBEN usar datos ficticios y entornos separados,
  sin cobros reales ni depender de activar un proveedor de pagos para probar permisos
  con matrículas ficticias. Custodia/retención y capacidad/costo deben revisarse en
  sus puertas operativas, sin deducirlas de una carga de archivo exitosa.

### Matriz de acceso

Las acciones suponen cuenta/sesión activas. La descarga de gestión no requiere
una matrícula del responsable; la del alumno siempre exige matrícula propia vigente.
Las denegaciones se aplican también al pedir directamente el archivo.

| Actor y relación con el grupo | Consultar/descargar material | Crear, editar textos y publicar/republicar | Retirar |
| --- | --- | --- | --- |
| Administrador, grupo no cancelado | Preparado, publicado y retirado | Sí | Sí |
| Administrador, grupo cancelado | Histórico en cualquier estado | No | Sí |
| Docente habilitado y asignado actualmente, grupo no cancelado | Preparado, publicado y retirado del grupo | Sí | Sí |
| Docente ajeno, sin habilitación o grupo cancelado | No | No | No |
| Alumno, matrícula propia vigente del grupo | Solo publicado | No | No |
| Alumno sin matrícula vigente de ese grupo o visitante | No | No | No |

La autoría original no es una excepción a esta matriz: perder la asignación o el
permiso impide acceder como gestor aunque se haya creado el archivo. Un material
publicado de oferta retirada sigue accesible al alumno con matrícula vigente;
retirar el material es una acción diferente y revoca su acceso para nuevas solicitudes.

### Key Entities *(include if feature involves data)*

- **Material del grupo**: recurso con identidad, grupo inmutable, título, descripción
  opcional, estado y referencia de archivo; autor original y atribución de cambios.
- **Archivo del material**: contenido completo de tipo/tamaño admitidos, con nombre
  mostrado y referencia privada; no se vuelve público por publicar el material.
- **Autoridad de gestión**: cuenta/rol vigente, asignación docente/habilitación y
  grupo aplicables; no es un cuarto rol ni propiedad exclusiva del autor inicial.
- **Derecho de consulta**: matrícula vigente del alumno en el grupo según 003,
  combinada con cuenta/sesión habilitadas y estado publicado del material.
- **Resultado de intención y registro de cambio**: identidad para recuperar una
  operación, referencias afectadas, revisión, actor, momento y resultado sin archivo
  ni secretos en el registro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un responsable autorizado puede preparar/publicar cada uno de los tres
  formatos admitidos y un alumno con acceso puede descargar su contenido completo,
  idéntico al original, vinculado al grupo correcto y con los textos registrados.
- **SC-002**: En la matriz de actores y estados, cero consultas/descargas/gestiones
  no autorizadas entregan contenido o información privada ajena. Incluir visitante,
  alumno de otro grupo, reserva sin matrícula, matrícula histórica, docente ajeno,
  sesión revocada y cuenta deshabilitada, también mediante referencia directa.
- **SC-003**: Archivos admitidos de exactamente 20 000 000 bytes se aceptan;
  uno vacío, truncado, de tipo incompatible o de 20 000 001 bytes se rechaza sin
  publicación parcial ni pérdida de material previamente publicado.
- **SC-004**: Reintentos de la misma intención producen un único material/efecto;
  ediciones concurrentes o intención distinta con la misma identidad muestran
  conflicto recuperable, conservando el resultado y la atribución coherentes.
- **SC-005**: Tras retiro o pérdida de permiso, todas las nuevas solicitudes de
  alumnos afectados se deniegan; inmediatamente antes del fin de matrícula se permite
  acceso vigente y en el límite/después se deniega, sin cambiar fechas o estados financieros.
- **SC-006**: La verificación de recuperación restablece la totalidad del conjunto
  ficticio de archivos y sus registros al punto respaldado, con contenido, grupo,
  estados y permisos coincidentes; no atribuye recuperación de cambios posteriores.
- **SC-007**: Responsable y alumno reales pueden realizar los recorridos de publicación,
  consulta/descarga y retiro, distinguiendo los estados y errores. Registrar acciones,
  dificultades y resultados reales de teclado, computador y móvil por separado;
  lo no observado conserva su pendiente, sin inventar porcentajes o tiempos humanos.

Estos criterios son exigencias a verificar después de implementar, no resultados
alcanzados. No se fija un SLA, costo de almacenamiento o capacidad concurrente nuevo
sin escenario, medición y aprobación de las puertas del proyecto.

### Trazabilidad de aceptación

| Requisitos | Escenarios que permiten verificarlos | Resultados exigidos |
| --- | --- | --- |
| FR-001–FR-003 | US1.1–US1.4, US2.3, matriz de acceso | SC-001, SC-002 |
| FR-004–FR-005 | US1.5, límites/tipos/carga interrumpida/falta de espacio | SC-001, SC-003 |
| FR-006 | US1.2, US3.2–US3.3 | SC-001, SC-005 |
| FR-007–FR-010 | US2.1–US2.7, matriz de acceso, límite de matrícula y referencias directas | SC-002, SC-005 |
| FR-011–FR-012 | US3.1–US3.5, cancelación y conservación del autor | SC-001, SC-002, SC-005 |
| FR-013–FR-014 | US1.6, US3.1/US3.6, concurrencia y respuestas perdidas | SC-002, SC-004 |
| FR-015–FR-016 | US1.5–US1.6, US2.6–US2.7, recorridos de teclado/computador/móvil | SC-004, SC-007 |
| FR-017 | Atribución US1/US3, errores seguros y ausencia de secretos/archivo en registros | SC-002, SC-004, SC-006 |
| FR-018 | Reinicio/restore con comparación conjunta de archivos, registros y permisos | SC-006 |
| FR-019–FR-020 | Regresión de permisos/reglas de 001–003 y preservación; revisión de entorno/operación | SC-002, SC-005, SC-006 |

USx.y identifica el escenario y de la historia x de este documento. La matriz
no sustituye los casos concretos del plan ni afirma haber ejecutado ninguno.

## Assumptions

### Decisiones confirmadas por el responsable

| ID | Decisión | Procedencia |
| --- | --- | --- |
| M01 | Materiales por grupo; cada grupo tiene su propio conjunto. | Respuesta explícita en esta conversación, 2026-11-15. |
| M02 | Docente de sus grupos y administrador de todos pueden publicar/administrar. | Respuesta explícita en esta conversación, 2026-11-15. |
| M03 | PDF, JPG y PNG, máximo 20 MB por archivo. | Respuesta explícita en esta conversación, 2026-11-15. |

### Delimitaciones adoptadas para este MVP

- MB usa unidad decimal; .jpg y .jpeg corresponden al mismo formato JPEG, sin
  añadir otro tipo. El control de tipo/tamaño no promete detectar todo documento malicioso.
- La gestión permite preparar/publicar en grupos propios no cancelados, incluso
  fuera de la oferta visible. Los alumnos requieren material publicado y matrícula
  vigente; no se concede acceso anticipado por reserva o pago aún no confirmado.
- La matrícula vigente se conserva conforme a 003 aunque la oferta se oculte;
  no se introduce una revocación adicional por ese hecho. No se extiende su vigencia
  para mantener acceso a archivos después de finalizar el período original.
- Se entrega listado y descarga completa autorizada. Quedan fuera visor/edición en
  línea, enlaces externos como material, carpetas, versionado de archivos, cargas de
  alumnos, tareas/calificaciones, mensajería, chat/video, publicación programada y
  distribución automática a otros grupos.
- La corrección del contenido usa archivo/material nuevo y retiro del anterior;
  no hay reemplazo silencioso ni borrado físico autoservicio. El retiro es lógico;
  retención, limpieza de temporales y borrado físico se definirán con la operación
  aprobada, sin prometer conservación infinita ni activar purgas por este spec.
- No se aprueba un límite agregado de almacenamiento ni un servicio contratado.
  El plan debe definir capacidad/configuración del entorno y fallo seguro al agotarse,
  con datos de prueba separados y costo dentro de las restricciones existentes.
- El responsable de prueba puede usar cuentas ficticias con roles docentes o
  administrativos; los resultados humanos deben distinguir quién participó realmente.

### Dependencias, estado y puertas conservadas

- Identidad 001 aporta cuenta, sesión y roles; oferta 002 aporta grupo, docente,
  asignación/habilitación y estado; matrícula 003 aporta titular, grupo y vigencia
  original. La planificación debe establecer colaboraciones autorizadas sin cambiar
  esos contratos ni inferir permisos desde la interfaz.
- 003 conserva **84/94 tareas completas** al iniciar este spec. T056–T059/D02,
  T089/T090, D10/D13 y aceptación integral T094 siguen pendientes; los checkpoints
  locales no acreditan proveedor real, 24 horas físicas ni capacidad del VPS.
- T083 quedó completada según resultado comunicado por el responsable en computador;
  no se transforma en aceptación humana de materiales. T104/T108 de 001 y T073/T074
  de 002 conservan sus pendientes.
- D12 se concreta aquí para el alcance de materiales M01–M03; paneles siguen aparte.
  D13 sigue siendo puerta de custodia/retención/recuperación antes de demo persistente
  o publicación. Archivos y registros deben recuperarse juntos, ampliando la cobertura
  del procedimiento existente cuando se implemente esta función.
- La evaluación de capacidad D10 debe incluir el volumen/tráfico de materiales
  cuando se acuerde el escenario. No se acredita el objetivo de 2500 activos por
  especificar o implementar descargas individuales.
- Este bloque solo especifica 004. No inicia plan, tareas, código, migraciones,
  servicios, compra de almacenamiento, pruebas funcionales ni despliegue.
