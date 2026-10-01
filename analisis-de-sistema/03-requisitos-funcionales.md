# 03. Requisitos funcionales

RF01–RF19 son requisitos de síntesis del MVP. Los
FR-001–FR-033 de la [especificación de identidad](../specs/001-identidad-acceso-roles/spec.md)
conservan sus IDs, detalles, límites y criterios de aceptación; no se renumeran.
Ningún RF de esta tabla está implementado como flujo de negocio. La base técnica y las
pruebas auxiliares existentes no equivalen a su cumplimiento.

| ID | El sistema debe… | Fuente / condición |
| --- | --- | --- |
| RF01 | Registrar públicamente solo alumnos con nombre, correo único normalizado y contraseña; rechazar elevación de privilegios y duplicados, incluso simultáneos. | Identidad FR-001–003; especificado. |
| RF02 | Verificar el correo antes de conceder acceso protegido mediante enlace de un solo uso, con vencimiento, reenvío y cuotas; programar entregas sin prometer éxito ante fallo SMTP. | FR-004/029–031; especificado. Verificación no inicia sesión ni cambia contraseña. |
| RF03 | Autenticar cuentas habilitadas, mantener y cerrar sesiones, expirar a los 30 minutos de inactividad o a las 8 horas y rechazar sesiones revocadas con errores públicos seguros y límites de intentos. | FR-005–009/022–023; especificado. |
| RF04 | Restablecer la contraseña de una cuenta activa/verificada con enlace de un solo uso de 30 minutos; revocar sesiones y credenciales anteriores, exigir nuevo login y proteger los secretos. | FR-024/030–033; especificado. |
| RF05 | Mostrar al titular su nombre, correo, único rol, estado e inicio mínimo accesible; ofrecer perfil/logout y gestión de cuentas solo al administrador. | FR-010–012/021/023; especificado; no panel académico completo. |
| RF06 | Permitir solo al administrador consultar/crear cuentas, corregir nombres y cambiar rol/estado; entregar credencial provisional restringida, revocar sesiones al cambiar accesos y proteger al último administrador activo. | FR-013–017; especificado. No borrar cuentas, autoalterar privilegios ni recuperar secretos almacenados. |
| RF07 | Inicializar al primer administrador una única vez por entorno mediante operación restringida, sin credenciales predeterminadas y resistiendo ejecuciones repetidas o concurrentes. | FR-027–028; especificado. |
| RF08 | Verificar en backend sesión, cuenta, permisos actuales y propiedad en cada operación protegida; denegar por defecto y comprobar pertenencia/matrícula cuando el dominio académico lo requiera. | FR-018–020, constitución II; cuentas especificadas, extensión académica pendiente. |
| RF09 | Registrar los cambios administrativos con actor, destino, momento, acción y resultado, excluyendo contraseñas, enlaces y tokens de errores y registros. | FR-025–026/033; modelo de datos U1 distingue auditoría aceptada y registros de denegación/operación. |
| RF10 | Permitir consultar y gestionar cursos, grupos, horarios y cupos bajo permisos definidos, reflejando la oferta disponible. | Alcance: oferta; previsto. Administración propuesta en HU09, solapamientos/cambios/reservas pendientes D04/D06. |
| RF11 | Crear una orden con varios cursos, precios válidos, conceptos y total calculados en servidor, conservando el detalle para comprobar el cobro. | Alcance y constitución III; previsto. No confiar en importes enviados por el cliente. |
| RF12 | Tramitar pagos con Izipay mediante un adaptador y reconocerlos solo tras comprobar autenticidad, orden, importe y moneda con el proveedor, procesando reintentos/notificaciones de forma idempotente. | Constitución V–VII; previsto, integración pendiente D02. La pantalla de éxito no confirma pago. Un pago por total sigue sujeto a D01. |
| RF13 | Activar matrículas pagadas únicamente tras pago verificado y garantizar ausencia de duplicados y sobreventa en matrículas/asignación de cupos mediante transacciones y restricciones persistentes. | Constitución IV–VI; previsto. D01–D06 deben fijar atomicidad de la orden, identidad/vigencia de matrícula, momento de reserva/asignación, pago tardío y cancelaciones antes de implementar. |
| RF14 | Permitir al alumno acceder a materiales solo con la autorización académica vigente. | Alcance y constitución II; previsto, D03/D12. |
| RF15 | Permitir publicar materiales a los responsables autorizados de cada curso. | Área materiales; descomposición propuesta HU13. Docente y reglas exactas de publicación por validar en D12; no se aprueban formatos/límites nuevos. |
| RF16 | Habilitar la emisión de clases por el docente autorizado y la reproducción por alumnos habilitados, comprobando acceso a manifiestos y segmentos HLS incluso por URL directa o con permiso vencido. | Alcance, constitución VIII; previsto, D03/D07–D08. |
| RF17 | Habilitar chat autorizado por clase para alumnos con acceso vigente y aislar los mensajes entre clases/grupos. | Alcance y constitución II; previsto, Socket.IO propuesto; no incluye participación audiovisual del alumno. |
| RF18 | Mostrar paneles básicos por rol con las acciones y datos autorizados que se definan para el MVP. | Alcance; previsto, mínimos pendientes D12; no presume métricas académicas/financieras. |
| RF19 | Permitir ejecutar migraciones controladas, respaldar/restaurar datos y recuperar el servicio mediante procedimientos operativos verificables antes de demo persistente o publicación. | Constitución X, plan y V16; previsto. No es una pantalla nueva; responsables y objetivos de recuperación pendientes D13. |

## Relación HU y RF

| Historia / necesidad | Requisitos que la realizan |
| --- | --- |
| HU01 | RF01, RF02 |
| HU02 | RF03, RF08 |
| HU03 | RF02, RF04, RF08 |
| HU04 | RF05, RF08 |
| HU05 | RF02, RF06, RF08, RF09 |
| HU06 | RF02, RF07, RF09 |
| HU07 | RF08, RF09 |
| HU08 | RF10, RF08 |
| HU09 | RF10, RF08 |
| HU10 | RF10, RF11, RF08 |
| HU11 | RF11, RF12, RF13, RF08 |
| HU12 | RF14, RF08 |
| HU13 | RF15, RF08 |
| HU14 | RF16, RF08 |
| HU15 | RF13, RF16, RF08 |
| HU16 | RF13, RF17, RF08 |
| HU17 | RF18, RF08 |
| Necesidad operativa de A05 y constitución X | RF19 (requisito derivado operativo, sin inventar una HU de producto) |

Para HU06, RF09 se aplica mediante el registro operativo del inicializador según U1;
no exige una cuenta ficticia del operador en la auditoría. Cada RF tiene origen explícito;
la tabla también permite recorrer desde un RF hacia todas sus HU. Los escenarios de
calidad complementarios se encuentran en [04-atributos-de-calidad.md](04-atributos-de-calidad.md).

## Correspondencia con el detalle de identidad

Las 17 HU y los 19 RF describen el MVP general; las siete historias y los 33 FR detallan
solo identidad. La relación es de refinamiento y puede ser de varios a varios: no deben
sumarse ni esperarse cantidades iguales. US1–US7 son los nombres de plan/tareas para
las historias numeradas 1–7 de spec.md; allí también se usan referencias de aceptación
como HU1.1, distintas de los IDs HU01–HU17 de AS-002.

| Historia detallada de identidad | HU general correspondiente | RF generales principales |
| --- | --- | --- |
| US1 · Acceder y cerrar sesión | HU02 | RF03, RF08 |
| US2 · Registrarse como alumno | HU01 | RF01, RF02 |
| US3 · Perfil e inicio | HU04 | RF05, RF08 |
| US4 · Administrar cuentas | HU05 | RF02, RF06, RF08, RF09 |
| US5 · Proteger operaciones y datos privados | HU07 | RF08, RF09; controles transversales de RF01–RF07 |
| US6 · Primer administrador | HU06 | RF02, RF07, RF09 |
| US7 · Recuperar contraseña | HU03 | RF02, RF04, RF08 |

| RF general de identidad | Requisitos detallados que agrupa o reutiliza |
| --- | --- |
| RF01 | FR-001, FR-002, FR-003 |
| RF02 | FR-004, FR-029, FR-030, FR-031 |
| RF03 | FR-005, FR-006, FR-007, FR-008, FR-009, FR-022, FR-023 |
| RF04 | FR-001, FR-024, FR-030, FR-031, FR-032, FR-033 |
| RF05 | FR-010, FR-011, FR-012, FR-021, FR-023 |
| RF06 | FR-012, FR-013, FR-014, FR-015, FR-016, FR-017 |
| RF07 | FR-027, FR-028; reutiliza FR-004, FR-014 y FR-029 para habilitar la cuenta |
| RF08 | FR-018, FR-019, FR-020 |
| RF09 | FR-025, FR-026, FR-033 |

La unión cubre los 33 FR sin eliminarlos ni cambiar sus condiciones. RF10–RF18 y HU08–HU17
corresponden al alcance académico futuro; no se les atribuyen FR de identidad inexistentes.
RF08 se ampliará con permisos académicos. RF19 procede de la constitución y del plan
operativo/V16, no de un supuesto FR-034. El detalle de aceptación permanece en
[spec.md](../specs/001-identidad-acceso-roles/spec.md) y
[verification.md](../specs/001-identidad-acceso-roles/verification.md).
