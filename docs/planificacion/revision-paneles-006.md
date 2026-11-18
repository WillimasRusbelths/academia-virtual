# Revisión previa de paneles por rol — candidato 006

2026-11-17, America/Lima. Revisión del código y evidencia versionados hasta
`1592736` y de la especificación actual de 005. **No es alcance final aprobado
de 006, implementación o ejecución nueva de pruebas.** Revalidar al terminar 005.
[Hoja de ruta](hoja-ruta-005-007.md).

## Cómo decidir qué entra

- **Organizar**: el dato, permiso y acción ya existen; 006 puede presentarlos y
  enlazarlos, conservando su autorización en servidor y prueba de regresión.
- **Consulta pequeña candidata**: solo lee datos existentes bajo permisos actuales;
  006 puede incluirla tras estimar alcance, con tarea explícita, contrato mínimo y
  pruebas de resultado, denegación y pérdida de acceso. Si cambia reglas o permisos,
  deja de ser una consulta pequeña y se deriva al spec dueño.
- **Brecha funcional**: falta dominio, permiso o función sustancial; se identifica
  responsable y dependencia. Solo bloquea su tarjeta/acción, no todo el pulido.

No confundir un total de página con el total del conjunto, horario de grupo con
una sesión de clase creada, o un enlace visible con permiso para acceder. Cada
tarjeta necesita dato real, estado vacío/error y destino operativo; si falta, se
omite o informa indisponibilidad, sin números o acciones ficticios.

## Alumno

| Necesidad del panel | Datos, permiso y operación que necesita | Contraste actual y prueba disponible | Decisión para 006 |
| --- | --- | --- | --- |
| Identificación/perfil y salir | Nombre/rol propios; sesión activa; leer perfil/cerrar sesión | Inicio y perfil existen; pruebas de perfil/accesibilidad de identidad | Organizar enlaces y estados; no mostrar datos de otro alumno |
| Mis cursos/grupos | Matrículas propias: curso/grupo, estado, período y vigencia originales; `enrollment:read-own` | Lista/detalle de matrículas y enlaces existentes; pruebas de navegación propia y E2E NM02/NM03 | Organizar cursos a partir de matrículas, sin inferir acceso por oferta o pago pendiente |
| Órdenes y reserva vigente | Estado/plazo, total y pago permitido de órdenes propias; `enrollment:read-own`, `reserve-own`, `pay-own` | Mis órdenes y reservar existen; NM01, permisos de rutas y T084 de 003 | Enlazar acciones existentes; mostrar el estado real y pago indisponible si no hay integración |
| Materiales | Grupos autorizados, publicados y descarga; `materials:read-enrolled` | `/materiales` y enlace desde matrícula vigente; E2E MS01–MS02, T060 y aceptación en laptop de 004 | Organizar acceso directo; hoy Inicio no tiene enlace propio a Materiales, aunque la ruta existe |
| Próxima clase/en curso y chat | Sesión real del grupo, estado y permiso de matrícula actual | No hay módulo de clases/chat implementado; 005 los especifica. El DTO de matrícula solo contiene horario, no próximas sesiones | Depende de 005: enlazar solo tras implementación y pruebas; no inventar “próxima clase” a partir del horario |
| Conteos separados vigentes/históricas | Proyección propia con la misma regla temporal de 003 | Paginación tiene total del listado; no hay resumen separado de ambos estados | Consulta pequeña Q006-01 candidata, opcional; el panel puede avanzar con lista paginada sin contadores |

## Docente

| Necesidad del panel | Datos, permiso y operación que necesita | Contraste actual y prueba disponible | Decisión para 006 |
| --- | --- | --- | --- |
| Perfil y grupos asignados | Perfil y grupos del docente actual, período/horarios/capacidad; `academic:read-own` | Inicio enlaza Mis grupos; lista/detalle y E2E D01/D06/D08/D09 prueban navegación, aislamiento y pérdida de acceso | Organizar grupos/horario y navegación; no usar el permiso docente para gestión administrativa de oferta |
| Preparar/publicar/corregir/retirar materiales | Grupo actual, habilitación y `materials:manage-own` | Pantalla de gestión, enlace desde grupo docente y E2E de gestión/acciones de 004 | Organizar accesos; conservar revalidación actual, revisión, incertidumbre y confirmación |
| Conducir clase y moderar | Sesión del grupo, emisión vigente, chat y permiso actual | Definido en 005, todavía sin módulo/rutas/permisos implementados | Resolver en 005; incorporar al panel cuando haya prueba positiva y negativa, sin frenar otras tarjetas |
| Ocupación o listado nominal de alumnos | Datos actuales de matrícula y permiso docente para esa proyección | La vista docente informa capacidad máxima y “ocupación y disponibilidad no calculadas”; no hay lista de alumnos ni permiso de lectura financiera docente | Brecha sustancial: ampliación académica de matrícula/oferta en spec propio posterior, si se requiere. No entrar por `read-all` administrativo ni mostrar pagos al docente |
| Asistencia y notas | Nuevas reglas, entidades y permisos | Fuera de 001–005; no hay evidencia | Nuevo spec funcional, solo si se amplía el MVP; no es pulido ni bloquea 006 |

## Administrador

| Necesidad del panel | Datos, permiso y operación que necesita | Contraste actual y prueba disponible | Decisión para 006 |
| --- | --- | --- | --- |
| Gestionar cuentas | Lista/detalle, roles/estados y comandos; `users:manage` | Rutas y pruebas admin-users de identidad implementadas | Organizar accesos/lista; no convertir la tarjeta en permiso nuevo ni exponer secretos |
| Gestionar oferta | Cursos/grupos, publicación, docentes y restricciones de compromisos; `academic:manage` | Rutas y pruebas de oferta/mantenimiento existentes, integradas con 003 | Organizar; conservar bloqueo de cambios incompatibles y conflictos de revisión |
| Precios, órdenes e incidencias | Precios PEN, órdenes globales y seguimientos; `enrollment:price-manage`, `read-all`, `incident-follow-up` | Rutas administrativas y E2E de 003; EN04/EN05 restringen acceso de alumno/docente | Organizar acciones probadas; seguimiento no equivale a resolver económicamente una incidencia |
| Acceder a materiales | Gestión por grupo y `materials:manage-all` | Pantallas y T060 de 004; enlace desde grupo administrativo | Organizar acceso a grupos; revalidar backend en cada acción |
| Controlar clases/chat | Datos y acciones de sesión/moderación globales | Pendiente de implementación de 005 | Integrar después de 005 y sus pruebas; no frena el pulido de administración existente |
| Contadores de registros | Totales de listados ya permitidos, con filtros explícitos | Existen listados paginados; no hay un panel agregado global | Usar el total cuando el contrato realmente lo devuelva; consulta agregada solo si se justifica según Q006-02 |
| Ingresos, devoluciones y resolución económica | Definiciones financieras nuevas o integración del proveedor | No se deducen de órdenes o seguimientos; integración Izipay y política económica siguen pendientes en 003/D02 | Resolver en ampliación funcional de pagos/003 con spec propio; 007 valida integración real cuando exista, no la implementa por desplegar |

## Consultas pequeñas que se evaluarán antes del alcance final

| ID candidato | Consulta y límites | Pruebas exigidas si se incluye | Decisión de corte |
| --- | --- | --- | --- |
| Q006-01 | Resumen de cantidades de matrículas propias vigentes/históricas, usando el instante y fin original de 003; sin permisos ni tablas nuevos | Cero/varias páginas, límite exacto de vigencia, matrícula ajena, sesión revocada y docente/admin sin permiso propio; no alterar finanzas | Incluir solo con tarea y contrato explícitos; si no es pequeña, usar lista existente y derivar ampliación a matrícula |
| Q006-02 | Resumen administrativo de cantidades ya consultables de cuentas/órdenes/incidencias registradas, sin “ingresos”, “resueltas” o indicadores cuyo significado no existe | Mismo alcance/filtros que listados, conjunto mayor que página, vacío/error, denegación alumno/docente y revocación; sin textos internos innecesarios | Opcional: reutilizar totales existentes primero; si exige permiso/semántica nuevos, derivar al dominio y omitir tarjeta |

No se implementan estas consultas en esta pasada ni se crean tareas ejecutables
de 006. El futuro spec debe registrar explícitamente cuáles admite/rechaza tras
revisión al finalizar 005 y estimación de complejidad.

## Fuentes de código y prueba contrastadas

| Referencia | Qué sustenta y límite |
| --- | --- |
| [HomePage](../../apps/web/src/features/profile/home-page.tsx), [App](../../apps/web/src/app/App.tsx), [router](../../apps/web/src/app/router.tsx) | Inicio actual es identidad y enlaces por rol; no hay resumen académico agregado |
| [Rutas de matrícula y pruebas](../../apps/web/src/app/enrollment-routes.test.tsx), [navegación propia](../../apps/web/src/features/enrollment/own-navigation.test.tsx), [E2E NM01–NM06](../../apps/web/tests/e2e/enrollment-navigation-maintenance.spec.ts) | Rutas/enlaces propios, historial, denegaciones y compromisos; existencia de prueba no es una ejecución nueva |
| [Consultas de matrícula](../../apps/api/src/modules/enrollment/application/queries.ts), [pantalla de matrículas](../../apps/web/src/features/enrollment/enrollments-page.tsx) | Datos actuales de cursos/horario/vigencia; sin identidad de próxima clase |
| [Vista docente](../../apps/web/src/features/academic-offering/teaching-groups-page.tsx), [E2E docente](../../apps/web/tests/e2e/academic-offering-teaching.spec.ts) | Asignación, horarios, capacidad máxima y aislamiento; no ocupación ni padrón de alumnos |
| [Permisos backend](../../apps/api/src/modules/authorization/domain/permissions.ts), [consultas administrativas](../../apps/api/src/modules/enrollment/entrypoints/http/admin.controller.ts) | Matriz cerrada actual; sin permisos implementados de clases/chat |
| [Rutas de materiales](../../apps/web/src/app/materials-routes.tsx), [E2E alumno](../../apps/web/tests/e2e/materials-student.spec.ts), [E2E gestión](../../apps/web/tests/e2e/materials-management.spec.ts) | Acceso por audiencia y enlaces reales; gestión no equivale a matrícula de alumno |
| [Evidencia 002 US4](../../specs/002-oferta-academica/evidence/us4.md), [T084 de 003](../../specs/003-reservas-ordenes-matricula/evidence/acceptance.md), [T060 de 004](../../specs/004-materiales-estudio/evidence/automated.md) | Ejecuciones históricas locales, sin ampliar su aceptación ni sustituir pruebas del futuro panel |
| [E2E accesibilidad](../../apps/web/tests/e2e/accessibility.spec.ts), [spec 005](../../specs/005-clases-chat/spec.md) | Base previa de teclado y alcance futuro; no acredita accesibilidad de todas las pantallas nuevas |

Al preparar 006 se debe anexar un inventario actualizado de pantallas, campos,
permisos, consultas, pruebas y brechas. Esta revisión inicial evita fijar paneles
por intuición; las cifras o botones solo entran tras contrastar su contrato real.
