# Catálogo vigente de componentes arquitectónicos

Identificadores compartidos por arquitectura y C1–C4. Frontera de APP02: un backend
NestJS; los componentes son responsabilidades de código, no procesos independientes.
Estado **I** implementado en el alcance indicado; **P** parcial; **F** futuro.
La [referencia de estado](../estado-documental.md) reúne versión, evidencia y límites;
las figuras se encuentran en [C3](../04-modelo-c4/03-componentes.md).

| ID | Responsabilidad y colaboración actual | Estado | Trazabilidad |
| --- | --- | --- | --- |
| C01 · Entrada y transporte REST | Controladores, DTO, cookies/CSRF/origen, errores; invoca C03/C04/C12 y usa C05 | I para identidad y preparación ADMIN | RF01–RF10; DA01/DA09; R03; EQ-07 |
| C02 · Salud | live sin IO; ready consulta AL01 por C09, independiente de SMTP | I local | RF19; DA08/DA10; EQ-04 |
| C03 · Identidad y acceso | Registro/verificación/inicial/login/logout/reset y cambios de acceso; sesiones persistidas; colabora con C04/C06/C07/C08/C09 | I funcional; aceptación integral/bootstrap pendientes | HU01–HU07; RF01–RF09; 001 US1–US7; R02/R04–R06/R09; EQ-03/07 |
| C04 · Usuarios | Reglas públicas, perfil y consultas/corrección de nombre; directorio docente mínimo para C12 | I en alcance actual | RF05/RF06/RF10; 002 T009; DA01/DA07 |
| C05 · Autorización | Guard, SessionLookup y permisos; consume SessionRepository implementado en C03; no concede matrícula | I; permisos futuros no crean recorridos | RF08; DA01; R02/R05; EQ-07/08 |
| C06 · Correo | DeliverPending, cifrado, leases, reintentos; scheduler dentro de APP02; captura en E03 | I local; E02 futuro | RF02/RF04; DA06/DA08; R07/R08; EQ-11 |
| C07 · Auditoría | Identidad: PostgresAuditWriter; oferta: offering-audit en C12; cambios atómicos y eventos privados sin secretos | I actual | RF09/002 FR-015; DA08; R05; EQ-07/10 |
| C08 · Límites persistidos | Cuotas de login/correo con transacciones cortas; sin hash/SMTP bajo locks prolongados | I actual | RF02–RF04; R04/R09; EQ-03/11 |
| C09 · Acceso compartido a datos | Pool único, Prisma/pg, account-locks/accountTransaction/academicTransaction; sin reglas de publicación propias | I soporte local | RF19/002 FR-015/016; DA02/DA07/DA10 |
| C10 · Configuración y composición | AppModule/main valida entorno e inyecta C03/C04/C05/C06/C12 y recursos | I; no es un orquestador de negocio | RT09; DA07/DA10; R01/R11/R12 |
| C11 · Entradas operativas restringidas | CLI bootstrap, retención e invalidación tras restaurar; reutiliza código fuera de HTTP | I local, operación final limitada | HU06/RF07/RF19; D13; EQ-04 |
| C12 · Oferta académica | Preparación ADMIN: cursos/grupos/franjas/capacidad/asignación; ledger/auditoría/revisión; consume C04/C05/C09 | P: T001–T029; T030 y publicación/ciclo/lecturas restantes pendientes | HU08/HU09/RF10; 002 US1–US4/FR-001–016; DA01/DA07/DA09; PA-01–05 |
| C13 · Órdenes | Selección, precios y total calculado en servidor; futura colaboración con C12/C14/C15 | F | HU10/HU11; RF11; DA02; D01–D06; EQ-05/09 |
| C14 · Pagos Izipay | Adaptador y confirmación auténtica/idempotente con orden antes de matrícula | F | HU11; RF12/RF13; DA02/DA06; D02; EQ-09 |
| C15 · Matrículas/cupos | Activar acceso tras pago, impedir duplicados/sobreventa, futura vigencia para C16–C18 | F | RF13/RF14/RF16/RF17; D01–D06; EQ-05/08/09 |
| C16 · Materiales | Publicación/acceso autorizado y AL02 por definir | F | HU12/HU13; RF14/RF15; D12; EQ-08 |
| C17 · Clases en vivo | Contexto/autorización de clase; no se afirma API de control YouTube | F | HU14/HU15; RF16; DEC01/D07/D08; EQ-06/08 |
| C18 · Chat de clase | Socket.IO propuesto, autorización y aislamiento; sin audio/cámara de alumno | F | HU16/RF17; DA01/DA05; EQ-06/08 |
| C19 · Paneles básicos | Consultas autorizadas por capacidades públicas; no accede a internos/tablas ajenas | F; inicio mínimo existente es RF05 | HU17/RF18; D12; EQ-10 |

## Unidades fuera de APP02

| ID | Unidad | Tecnología/relación y estado |
| --- | --- | --- |
| APP01 | Web | React/TypeScript/Vite; REST/JSON con cookie hacia APP02; identidad y preparación ADMIN implementadas |
| AL01 | Datos | PostgreSQL 16.14; cinco migraciones, identidad y oferta; no llama proveedores |
| AL02 | Archivos de materiales | Futuro, ubicación/tecnología sin decidir; no otro contenedor ya instalado |
| E01 / SE02 | Izipay | Elegida; integración/sandbox/condiciones pendientes |
| E02 / SE01 | Correo externo | SMTP real pendiente; no se equipara con captura local |
| E03 / SE01 | Mailpit | SMTP/HTTP de apoyo local, captura funcional comprobada |
| E04-YT / E04 / SE03 | YouTube Live | Distribución externa prevista; integración y protección pendientes |
| E04-OBS | OBS Studio | Herramienta del docente para emitir hacia E04-YT; no módulo backend |

## Colaboraciones y límites

C01 → C05 resuelve sesión/permiso, C01 → C03/C04/C12 invoca aplicación; C03 programa
entregas persistidas y C06 las procesa fuera de HTTP hacia E03. Los adaptadores usan
C09 → AL01. C10 ensambla capacidades al iniciar: es composición, no una solicitud.
C11 no es un endpoint ni un servidor adicional. Probe y rutas exclusivas de pruebas
no forman parte de la composición actual.

C12 usa superficies públicas de usuarios/autorización. Su SQL puede consultar la vista
AcademicTeacherDirectory, sin campos privados de User. Infraestructura común toma locks
de cuentas; AppModule inyecta la revalidación de C03 sin que C12 importe internos de
identidad. No hay llamadas HTTP ni callbacks identidad → oferta. Detalle en
[diseño interno](../03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md).

Las flechas de colaboración difieren de los imports descritos en
[Clean Architecture](enfoque-arquitectonico.md). C13–C19 y E01/E02/E04 mantienen
relaciones discontinuas futuras. Video circularía OBS → YouTube → navegador,
sin medios por AL01 ni control remoto de OBS. La constitución conserva obligaciones
de protección; DEC01 no acredita su compatibilidad.
