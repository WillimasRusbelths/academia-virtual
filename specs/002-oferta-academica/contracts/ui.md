# Contrato de interfaz y recorridos

**Estado**: diseño futuro. No se han creado pantallas.
[Contrato HTTP](api.md), [modelo](../data-model.md) y [spec](../spec.md) son normativos.

## Composición y rutas

Una sola feature `apps/web/src/features/academic-offering`, con DTO y validación propios.
Recibe ApiClient, usuario vigente y navegación desde app; no importa auth, profile ni
admin-users internos. Reutiliza shared/ui para campos y feedback.

| Ruta web prevista | Actor | Vista y operación |
| --- | --- | --- |
| /admin/oferta | ADMIN | Cursos en cualquier estado, búsqueda y paginación; crear curso. |
| /admin/oferta/cursos/:id | ADMIN | Datos/estado del curso, grupos, crear grupo y acciones de curso. |
| /admin/oferta/grupos/:id | ADMIN | Datos, docente, periodo/franjas, capacidad y acciones del grupo. |
| /oferta | STUDENT o ADMIN | Catálogo visible; acceso administrativo aquí usa la misma proyección del alumno. |
| /oferta/cursos/:id | STUDENT o ADMIN | Descripción y grupos visibles paginados. |
| /oferta/cursos/:courseId/grupos/:id | STUDENT o ADMIN | Detalle para comparar sin comprar ni reservar. |
| /mis-grupos | TEACHER | Grupos asignados, cualquier estado, sin acciones de gestión. |
| /mis-grupos/:id | TEACHER | Datos del grupo y contexto de curso, sin hermanos ajenos. |

Agregar enlaces desde inicio por rol: gestionar oferta, consultar oferta o Mis grupos.
Conservar perfil/logout y gestión de cuentas del administrador.
`RouteAccess` y ProtectedRoute deberán expresar student/teacher además de admin/
authenticated; incluir todas estas rutas en isProtectedPath.
La guarda visual orienta navegación; backend decide permisos y pertenencia.

Sin sesión, redirigir a acceso sin pedir datos de oferta. Con rol incorrecto, mostrar
denegación segura y retorno a inicio, sin cambiar identidad ni reenviar comandos.
Mantener las reglas existentes de destinos internos y no guardar retorno arbitrario.

## Recorrido A — Administrador prepara y publica

1. Inicio → Gestionar oferta. Distinguir cargando, lista vacía y error.
2. Crear curso con nombre; descripción puede completarse durante preparación.
   Guardar confirma referencia/estado DRAFT. Cancelar no escribe.
3. Abrir curso → crear grupo DRAFT. Mostrar referencia del curso y nombre de grupo.
   Configurar capacidad 1–50, periodo y America/Lima; datos todavía omitidos aparecen
   «Sin configurar». Capacidad enviada vacía/inválida no se guarda.
4. Seleccionar docente usando solo candidatos activos/verificados y rol Docente.
   Nombre + referencia administrativa distinguen homónimos. No UserView ni email.
5. Configurar franjas semanales con día ISO traducido al español y horas HH:mm.
   Añadir/quitar filas reemplaza el conjunto al guardar; sin autosave.
   Mostrar periodo y zona explícitos. Validar fechas, ocurrencias, fin>inicio,
   duplicados y solapamientos internos; permitir franjas contiguas.
6. Publicar curso válido. No publica sus grupos ni lo ofrece al alumno si aún no hay
   grupos visibles; distinguir «Curso publicado» de «Visible para alumnos».
7. Publicar grupo: resumen de datos y confirmación explícita. Si falta un dato o hay
   conflicto, no afirmar éxito y asociar la explicación al formulario/acción.
8. Abrir catálogo como administrador para comprobar la misma proyección del alumno.

Botones de mutación se deshabilitan mientras su petición está pendiente, sin sustituir
idempotencia de servidor. No crear mediante doble click dos commandId para la misma intención.

## Recorrido B — Administrador mantiene la oferta

- Publicado: edición deshabilitada con explicación «Retira la oferta antes de editar».
  Retirar requiere confirmación; el guardado directo también se rechaza en backend.
- Curso retirado: todos sus grupos dejan de ofrecerse, pero los que sigan Publicados
  mantienen programación y no admiten edición hasta su propio retiro.
- Grupo retirado: permite corregir datos, asignación y franjas; guardar no republica.
  Presentar una acción distinta para publicar después de validar.
- Cancelar grupo: confirmación explícita y motivo; conservar consulta y deshabilitar
  toda edición/republicación posterior. No lenguaje de reembolso o cancelación de clases.
- Cambio concurrente: 409 de revisión conserva las entradas y ofrece recargar para
  comparar. No mezclar ni aplicar automáticamente cambios sobre otra revisión.
- Publicar curso bloqueado por grupos: mostrar referencias administrativas seguras
  de los afectados, sin incluir estados privados de cuenta. Permitir abrirlos.
  Retirar/revisar grupos afectados y republicar explícitamente según el contrato.

## Recorrido C — Pérdida de habilitación docente

Administración ve docente asignado y «Docente no habilitado» o «Revisión docente requerida».
El grupo puede seguir editorialmente Publicado y tener «No visible para alumnos».
No inventar un estado editorial ni trasladar el diagnóstico a vistas alumno/docente.

Tras reactivación/cambio de rol de vuelta, no mostrar «publicado de nuevo».
Administración retira el grupo si sigue Publicado, confirma o sustituye asignación y
lo publica de nuevo. Un simple guardado, refresco o publicación del curso no hace esto.
Si el grupo está cancelado, la revisión no habilita su recuperación.

No crear/activar cuenta ni cambiar rol desde el selector. Mantener enlace normal a
gestión de cuentas si el administrador necesita esa función existente, sin automatizarla.

## Recorrido D — Alumno compara

Inicio → Oferta → curso → grupos visibles → detalle de un grupo.
Mostrar nombre/descripcion de curso, grupo, docente asignado, días/horas, fechas y
America/Lima; no convertir según navegador.

Mostrar exactamente las distinciones:
- «Capacidad máxima: N alumnos».
- «Ocupación y disponibilidad no calculadas».

No barras de progreso, «quedan N», «0 inscritos», «agotado», cupos de muestra o botones
de compra/reserva. Elegir equivale a comparar; no genera una selección persistida.

Si no hay curso/grupo visible: listado vacío o «Oferta no disponible» en enlace directo.
No explicar al alumno si el motivo es desactivación docente, borrador o retiro.
Una nueva consulta debe respetar visibilidad vigente; no hay actualización en tiempo real.

## Recorrido E — Docente consulta sus grupos

Inicio → Mis grupos → detalle, con curso como contexto.
Mostrar estado editorial, nombre, periodo, America/Lima, franjas y capacidad; campos
sin configurar son visibles como tales. Puede ver borradores/retirados/cancelados propios.

No muestra selector docente, acciones de edición/publicación, motivo administrativo
de cancelación, cuentas no habilitadas, generación ni teacherReviewRequired.
No permite enumerar grupos del mismo curso que no estén asignados.
Asignación vacía o eliminada deja de pertenecer al listado propio en la siguiente consulta.

## Feedback, transporte y comandos

| Estado | Presentación y comportamiento |
| --- | --- |
| Cargando | Indicador accesible; no mostrar vacío antes de tener respuesta. |
| Vacío | Explicar falta de cursos/grupos consultables; en admin ofrecer creación. |
| Validación | Catálogo local junto al campo; foco al resumen/primer error; conservar entradas. |
| Éxito | Mostrar solo tras confirmación del servidor, recurso y revisión devueltos. |
| Conflicto de agenda | Solo admin: explicación y referencias académicas permitidas; volver a revisar docente/horario. |
| Revisión obsoleta | Conservar borrador, opción de recargar/comparar, nueva intención explícita si corrige. |
| Respuesta incierta / 503 | No afirmar que no se guardó. Mantener commandId/payload y permitir comprobar o repetir manualmente la misma intención. |
| Sesión perdida | Cancelar peticiones pendientes, limpiar datos privados y volver a acceso; nunca replay tras login. |
| 403 / 404 | Denegación o no disponible sin causas privadas; navegación segura al inicio/listado autorizado. |
| Cancelación del formulario | No escribir; si ya existe petición incierta, avisar que salir no deshace un comando que pudiera haberse aplicado. |

ApiClient compartido amplía catálogo de códigos/campos y queries permitidas por ruta
según api.md. UUID de comando y expectedRevision viajan en body; no nuevas cabeceras
arbitrarias. La feature valida DTO cerrados antes de renderizar.

Una intención corregida usa commandId nuevo; un reintento idéntico conserva el anterior.
Solo memoria de la vista, sin guardar sesiones/secretos en localStorage/sessionStorage.
Tras recargar sin la intención, comprobar estado antes de crear otra: nombres iguales
no son una clave de deduplicación.

## Accesibilidad, privacidad y verificación

- Formularios con label, instrucciones de zona, aria-describedby, errores textuales y
  foco visible; todos los controles operables con teclado.
- Confirmaciones sin depender de color; cancelación conserva acceso al control de origen.
- Listas/formularios utilizables en móvil y escritorio, sin exigir arrastrar franjas
  ni usar un calendario visual como único método de entrada.
- No cookies/tokens en URL, logs, capturas compartidas o mensajes de error.
  Capturas/trazas usan solo datos ficticios y almacenamiento privado de pruebas.
- E2E comprueba los cinco recorridos, vacíos, fallos, pérdida de sesión, conflictos
  y tamaños/teclado. SC-002 requiere además observación real del alumno sin ayuda;
  automatización o inspección del agente no la sustituyen.
