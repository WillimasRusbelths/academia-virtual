# 03. Requisitos funcionales

> Actualizado 2026-11-15 (T087): [requisitos RC, decisiones RA y escenarios RE](../planificacion/reservas-capacidad.md).

RF01–RF19 son requisitos de síntesis del MVP. Los
FR-001–FR-033 de la [especificación de identidad](../../specs/001-identidad-acceso-roles/spec.md)
conservan sus IDs, detalles, límites y criterios de aceptación; no se renumeran.
Identidad, oferta y el núcleo local de matrícula cuentan con implementación y
checkpoints enlazados abajo. Verificación local no equivale a aceptación integral:
proveedor, humanos, operación y capacidad conservan sus puertas. Los FR de cada spec
son identificadores propios de ese incremento.

| ID | El sistema debe… | Fuente / condición |
| --- | --- | --- |
| RF01 | Registrar públicamente solo alumnos con nombre, correo único normalizado y contraseña; rechazar elevación de privilegios y duplicados, incluso simultáneos. | Identidad FR-001–003; implementado y verificado localmente, incluyendo concurrencia de duplicados. |
| RF02 | Verificar el correo antes de conceder acceso protegido mediante enlace de un solo uso, con vencimiento, reenvío y cuotas; programar entregas sin prometer éxito ante fallo SMTP. | Identidad FR-004/029–031; implementado y verificado con Mailpit. Verificación no inicia sesión ni cambia contraseña; SMTP real pendiente. |
| RF03 | Autenticar cuentas habilitadas, mantener y cerrar sesiones, expirar a los 30 minutos de inactividad o a las 8 horas y rechazar sesiones revocadas con errores públicos seguros y límites de intentos. | Identidad FR-005–009/022–023; implementado y verificado localmente. |
| RF04 | Restablecer la contraseña de una cuenta activa/verificada con enlace de un solo uso de 30 minutos; revocar sesiones y credenciales anteriores, exigir nuevo login y proteger los secretos. | Identidad FR-024/030–033; implementado y verificado localmente con Mailpit. |
| RF05 | Mostrar al titular su nombre, correo, único rol, estado e inicio mínimo accesible; ofrecer perfil/logout y gestión de cuentas solo al administrador. | Identidad FR-010–012/021/023; implementado y verificado; inicio mínimo sin panel académico completo. |
| RF06 | Permitir solo al administrador consultar/crear cuentas, corregir nombres y cambiar rol/estado; entregar credencial provisional restringida, revocar sesiones al cambiar accesos y proteger al último administrador activo. | Identidad FR-013–017; implementado y verificado localmente. Sin borrar cuentas, autoalterar privilegios ni recuperar secretos almacenados. |
| RF07 | Inicializar al primer administrador una única vez por entorno mediante operación restringida, sin credenciales predeterminadas y resistiendo ejecuciones repetidas o concurrentes. | Identidad FR-027–028; CLI implementada con checkpoint US6 local. Intermitencia histórica de bootstrap pendiente; sin cierre operativo por este documento. |
| RF08 | Verificar en backend sesión, cuenta, permisos actuales y propiedad en cada operación protegida; denegar por defecto y comprobar pertenencia/matrícula cuando el dominio académico lo requiera. | Identidad FR-018–020, oferta PA-01–PA-05 y 003 FR-015/016: permisos/propiedad backend implementados y verificados localmente. Acceso a materiales/video/chat pendiente. |
| RF09 | Registrar los cambios administrativos con actor, destino, momento, acción y resultado, excluyendo contraseñas, enlaces y tokens de errores y registros. | Identidad FR-025–026/033 y 003 FR-019: auditoría y registros operativos implementados con pruebas locales. T088 revisión específica y D13 custodia/retención pendientes. |
| RF10 | Consultar/gestionar oferta bajo PA-01–PA-05 de 002: cursos/grupos, horarios America/Lima y capacidad configurada 1–50, sin presentarla como disponibilidad. | 002 PA-01–PA-05/E1 implementadas y verificadas T068/T069; T073 humano y T074 integral pendientes. Capacidad 1–50 del catálogo sin disponibilidad calculada. Inventario real solo en el recorrido 003. |
| RF11 | Confirmar reserva antes del pago por 24 h exactas desde confirmación del servidor, persistiendo vencimiento; tramitar orden con precios/conceptos/total del servidor. | 003 FR-001–006/010–012/017/018/020: implementado y verificado localmente T084. Selección conjunta, PEN conservado, prioridad servidor, elegibilidad antes de fecha inicial America/Lima y conflictos efectivos propios; contiguos permitidos. Una orden con reservas vigentes, un grupo por curso, sin modificación/cancelación voluntaria. Nueva intención tras vencer sin sanción/espera por abandono. |
| RF12 | Tramitar pagos con Izipay mediante un adaptador y reconocerlos solo tras comprobar autenticidad, orden, importe y moneda con el proveedor, procesando reintentos/notificaciones de forma idempotente. | 003 FR-007/008/013/019/024: núcleo local de intentos/conciliación implementado y probado con simulación de test. Adaptador Izipay/sandbox T056–T059/D02 pendientes; este RF no está cumplido con proveedor real. Ocultamiento pausa inicio/confirmación sin renovar plazo; tardío/oculto/incompatible produce incidencia sin matrícula. Economía requiere aprobación propia antes de cobros reales; éxito del navegador no confirma pago. |
| RF13 | Confirmar matrícula tras pago verificado y liberar reserva vencida sin pago mediante conciliación consistente, sin duplicados, doble consumo/liberación ni sobreventa. | 003 FR-008–014/018/020/021: conversión/vencimiento y coordinación implementados y verificados localmente con pagos simulados en tests. Vigencia hasta fin de fecha final original America/Lima e historial sin reactivación por editar/republicar. Retiro no revoca matrículas previas; bloqueantes protegen estructura y cancelación. Integración real D02, humanos T089 y operación T090 pendientes. |
| RF14 | Permitir al alumno acceder a materiales solo con la autorización académica vigente. | Alcance y constitución II; previsto, D03/D12. |
| RF15 | Permitir publicar materiales a los responsables autorizados de cada curso. | Área materiales; descomposición propuesta HU13. Docente y reglas exactas de publicación por validar en D12; no se aprueban formatos/límites nuevos. |
| RF16 | Habilitar la emisión de clases por el docente autorizado y la reproducción por alumnos habilitados, comprobando acceso a manifiestos y segmentos HLS incluso por URL directa o con permiso vencido. | Alcance, constitución VIII; previsto, D03/D07–D08. YouTube Live con OBS es la elección DEC01; la compatibilidad de estos controles con el proveedor sigue pendiente de validación. |
| RF17 | Habilitar chat autorizado por clase para alumnos con acceso vigente y aislar los mensajes entre clases/grupos. | Alcance y constitución II; previsto, Socket.IO propuesto; no incluye participación audiovisual del alumno. |
| RF18 | Mostrar paneles básicos por rol con las acciones y datos autorizados que se definan para el MVP. | Alcance; previsto, mínimos pendientes D12; no presume métricas académicas/financieras. |
| RF19 | Permitir ejecutar migraciones controladas, respaldar/restaurar datos y recuperar el servicio mediante procedimientos operativos verificables antes de demo persistente o publicación. | Procedimientos implementados y ensayos locales 001/002/003 acreditados; 003 T086 verifica upgrade 0005→0007, restore separado, accesos invalidados y runtime sin DDL. D13 custodia/retención/RPO/RTO y 24 h operacionales pendientes; no es una pantalla nueva. |

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
como HU1.1, distintas de los IDs HU01–HU17 del análisis.

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

La unión cubre los 33 FR sin eliminarlos ni cambiar sus condiciones. RF10–RF13 y HU08–HU11
tienen implementación local en 002/003; RF14–RF18 y HU12–HU17 siguen previstos.
No se les atribuyen FR de identidad inexistentes. RF08 ya incluye permisos de
oferta y propiedad financiera; materiales/video/chat requieren ampliación posterior. RF19 procede de la constitución y del plan
operativo/V16, no de un supuesto FR-034. El detalle de aceptación permanece en
[spec.md](../../specs/001-identidad-acceso-roles/spec.md) y
[verification.md](../../specs/001-identidad-acceso-roles/verification.md).

## Correspondencia con oferta y matrícula

| Requisito general | Refinamiento y evidencia | Límite de la verificación |
| --- | --- | --- |
| RF08–RF10 / HU08–HU09 | Oferta 002 PA-01–PA-05/E1; [T068 local](../../specs/002-oferta-academica/evidence/automated.md). | Catálogo con capacidad configurada; T073/T074 humana/integral pendientes. |
| RF11 / HU10 | 003 FR-001–006/010–012/017/018/020; [T084 local](../../specs/003-reservas-ordenes-matricula/evidence/acceptance.md). | Reserva, orden, precio, disponibilidad y recuperación; T042 humana solo en computador. |
| RF12–RF13 / HU11 | 003 FR-007–014/018–021/024; [T084 y procedencia](../../specs/003-reservas-ordenes-matricula/evidence/verification-results.json). | Núcleo local con simulación financiera de test. Proveedor/sandbox D02, economía y aceptación integrada pendientes. |
| RF19 / operación | 003 FR-022; [T086 upgrade y restore](../../specs/003-reservas-ordenes-matricula/evidence/recovery.md). | Ensayo aislado; custodia/retención/RPO/RTO y 24 horas físicas D13 pendientes. |

Los conteos de [identidad T106](../../specs/001-identidad-acceso-roles/evidence/regression.md),
oferta y matrícula pertenecen a sus revisiones registradas, sin sumarlos como nuevas
pruebas por esta actualización. RF14–RF18 conservan su estado previsto. El ajuste
[T085](../../specs/003-reservas-ordenes-matricula/evidence/t085.md) configura CI sin
acreditar ejecución remota o suficiencia del presupuesto de 20 minutos.
