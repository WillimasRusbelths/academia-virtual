# Arquitectura inicial de Academia Virtual

Revisión del entorno: **2026-10-06**, sobre el repositorio `academia-virtual` existente.
Esta es una vista inicial de **tres capas lógicas**
del MVP, no una implementación terminada ni tres servidores obligatorios. Se conserva
el monolito modular del [plan de identidad](../specs/001-identidad-acceso-roles/plan.md).

## Inventario y estado del repositorio

| Material revisado | Qué aporta | Estado que permite afirmar |
| --- | --- | --- |
| [README](../README.md) | Nombre, propósito, presupuesto y navegación. | Distingue base técnica, diseño y funcionalidades pendientes. |
| [Constitución 1.1.0](../.specify/memory/constitution.md) | Seguridad, precios, integridad, pagos, video, entornos, recuperación, capacidad y gobernanza. | Obligaciones del proyecto; no pruebas superadas. |
| [Alcance MVP](../docs/alcance-mvp.md) y [decisiones D01–D13](../docs/decisiones-pendientes.md) | Áreas funcionales, exclusiones, presupuesto e integraciones. | Fuente del alcance general; las reglas pendientes conservan sus identificadores y condiciones de cierre. |
| [Spec de identidad](../specs/001-identidad-acceso-roles/spec.md) y [checklist](../specs/001-identidad-acceso-roles/checklists/requirements.md) | 7 historias, 33 FR, 10 criterios de éxito, roles y flujos definidos. | Calidad documental revisada; sin historias implementadas. |
| [Plan](../specs/001-identidad-acceso-roles/plan.md) y [research](../specs/001-identidad-acceso-roles/research.md) | Monolito modular, sesiones opacas, correo persistido, decisiones R01–R12. | Diseño aprobado; Ejecución local mediante Docker Compose con PostgreSQL 16.14. |
| [Modelo de datos](../specs/001-identidad-acceso-roles/data-model.md), [API](../specs/001-identidad-acceso-roles/contracts/api.md) y [UI](../specs/001-identidad-acceso-roles/contracts/ui.md) | Entidades/invariantes, contratos HTTP y pantallas de identidad. | Diseños de destino; no tablas/endpoints/pantallas funcionales existentes. |
| [Quickstart](../specs/001-identidad-acceso-roles/quickstart.md), [verification](../specs/001-identidad-acceso-roles/verification.md) y [tasks](../specs/001-identidad-acceso-roles/tasks.md) | Procedimientos, V00/V01–V16, ensayos de carga y 108 tareas. | 10 tareas de entorno completadas T001–T010; 98 pendientes. Sin ejecución de carga ni aceptación funcional. |
| [Entorno Docker](../ops/docker/README.md), [verificación](../ops/docker/verification.md) y [compatibilidad](../ops/docker/compatibility.md) | Ejecución local y resultados del entorno. | Cuatro servicios Linux; auditoría de dependencias y aceptación funcional pendientes. |
| [T009: arquitectura](../ops/local/architecture.md) y [T010: pruebas](../ops/docker/test-harness.md) | Composición Nest, límites de importación y soporte de pruebas. | Límites y soporte conservados; resultados actuales en [verificación Docker](../ops/docker/verification.md). |
| [Código API](../apps/api/src/app.module.ts), [Probe](../apps/api/src/probe.module.ts) y [web](../apps/web/src/app/App.tsx) | AppModule ensambla Probe; `GET /health/live` devuelve estado; React muestra «En preparación». | Base técnica implementada. No login, cuentas, cursos, órdenes, pagos, matrícula, materiales, clases, chat ni paneles funcionales. |
| [Paquetes](../package.json), [API](../apps/api/package.json), [web](../apps/web/package.json) y [lockfile](../package-lock.json) | npm workspaces y dependencias reales de React/Vite, NestJS/TypeScript, Prisma/pg, Argon2 y Nodemailer; herramientas de pruebas. | Instalación y compatibilidad documentadas, no prueba de uso en funciones inexistentes. El [schema de ensayo](../ops/local/compatibility/prisma/schema.prisma) solo contiene CompatibilityProbe. |
| [Compose](../compose.yml), [procedimiento](../ops/docker/README.md) y [workflow](../.github/workflows/v00-linux.yml) | PostgreSQL, Mailpit, API y web como entorno principal. | Validación local según evidencia; no ejecución remota de CI ni integración de video. |

El estado del entorno se mantiene en [verificación Docker](../ops/docker/verification.md).
La vista de capas y los módulos de negocio no cambian por el empaquetado local.

## Decisiones vigentes y discrepancias resueltas

Para alcance y obligaciones se conservan constitución/especificación; para entorno y
estado se usa la actualización fechada más reciente respaldada por código/evidencia.
Una lista de tareas futuras no cuenta como implementación.

| Diferencia encontrada | Decisión usada y fundamento |
| --- | --- |
| README/alcance indicaban que no había aplicación ni scripts; ahora existen workspaces y pruebas. | Hay esqueleto técnico y herramientas verificadas, pero no funciones de negocio. Código y evidencia T009/T010 del 2026-09-29 prevalecen para estado. |
| Entorno de ejecución | Docker Compose con PostgreSQL 16.14, Mailpit y aplicaciones Linux. El procedimiento y los resultados se mantienen en ops/docker/. No cambia el diseño de negocio. |
| D11/checklist dicen «lista para planificar», pero ya hay plan y tareas. | Comportamiento y diseño de identidad definidos; fundamentos T003–T010 completados, historias aún pendientes. Se preserva el registro histórico y se aclara en docs/README. |
| Estado de tareas de entorno | T001–T010 completadas según la evidencia local; las historias y el resto de T030 siguen pendientes. |
| Culqi aparece como candidata histórica. | Izipay elegida desde 2026-09-23 según D02 y constitución; sin integración. La regla de un pago por orden sigue pendiente independiente de la pasarela. |
| Plan describe entradas/aplicación/dominio/infraestructura; la vista general muestra tres capas. | Son niveles de detalle compatibles: presentación = web/entradas; negocio = aplicación/dominio; datos = persistencia. Adaptadores externos quedan en el límite del módulo que los usa; no son una cuarta capa de negocio ni parten de PostgreSQL. |
| Selección y protección de video | YouTube Live con OBS es la elección vigente según DA03 y DEC01. La compatibilidad con los controles de RF16, el acceso directo y los permisos vencidos permanece pendiente; no se considera suficiente ocultar enlaces. |

## Vista propuesta de tres capas

El [diagrama de arquitectura](diagrama-arquitectura.md) presenta los actores, las tres
capas, los grupos de módulos y los servicios externos. Es una vista del diseño previsto,
no de funcionalidades desplegadas. Mantenerla separada permite consultar esta
síntesis sin duplicar el diagrama.

El [estilo arquitectónico](estilo-arquitectonico.md) documenta el monolito por capas;
el [enfoque arquitectónico](enfoque-arquitectonico.md) detalla Clean Architecture.
La decisión R01 conserva una sola aplicación backend con módulos internos; Docker
Compose es el entorno local validado, no un estilo ni una división en microservicios.

## Responsabilidades y dependencias

| Capa | Responsabilidad | Dependencias y límites |
| --- | --- | --- |
| Presentación | Web por rol, formularios/reproductor; API REST adapta DTO, cookies y errores; gateway adapta chat; CLI restringida adapta operaciones locales. | Invoca casos de uso. No calcula el precio confiable, decide permisos finales ni consulta BD directamente. API REST se ubica aquí por su función de entrada aunque ejecute en el backend. |
| Lógica de negocio | Aplicación coordina casos de uso/transacciones; dominio contiene reglas puras de cuentas, permisos, precios, cupos, pago y acceso académico. | Consume contratos pequeños de persistencia y proveedores. Sin Request/Response, SQL, Prisma ni SMTP en las reglas. Los módulos colaboran por capacidades públicas; no importan internos ajenos ni crean ciclos. |
| Datos | Adaptadores implementan consultas, migraciones y transacciones sobre PostgreSQL; índices/restricciones preservan invariantes. Almacenamiento de materiales por decidir. | Implementa contratos del negocio. No autentica pagos ni orquesta SMTP/video; no devuelve modelos Prisma al navegador. Una BD por entorno, sin obligación de separar servidores. |

La dirección de imports conserva el plan: entrada → aplicación → dominio;
infraestructura → contratos de aplicación/dominio. En ejecución los casos de uso llaman
a los adaptadores inyectados; Nest los ensambla en la raíz de composición. El límite
de tres capas no obliga al negocio a importar una implementación de datos. Los
adaptadores Izipay/SMTP/medios pertenecen a la infraestructura de su módulo consumidor.

El incremento actual diseña `identity`, `users`, `authorization`, `mail` y `audit`.
Su [modelo](../specs/001-identidad-acceso-roles/data-model.md) prevé User, Session,
ActionToken, MailDelivery, RateBucket/RateEvent, AuditEvent y SystemState; ninguna de
esas entidades está aún migrada en la aplicación. Sesiones opacas en cookie HttpOnly,
Argon2id y entregas persistidas son decisiones de diseño; solo las bibliotecas/ensayos
auxiliares tienen evidencia. Los módulos académicos del gráfico pertenecen al MVP
posterior y todavía no tienen especificaciones equivalentes.

## Decisiones y validaciones pendientes

Los [drivers DA01–DA10](../analisis-de-sistema/06-driver-arquitectonicos.md) y las
[decisiones arquitectónicas](../analisis-de-sistema/07-decisiones-arquitectonicas.md)
relacionan el diseño con seguridad, integridad, mantenibilidad y operación.
Se conservan HU01–HU17 y RF01–RF19 como síntesis del MVP, diferenciados de las siete
historias y los 33 FR del detalle de identidad.

D01–D06 mantienen reglas de pagos y matrículas pendientes; D07–D08, validación de
video y control de acceso; D09–D10, alojamiento y criterios de carga; D12–D13,
materiales, paneles y recuperación. D11 tiene comportamiento definido sin aceptación
funcional. Izipay, correo externo, YouTube Live y recuperación requieren implementación
y validación. Los **1000 usuarios concurrentes siguen siendo un objetivo no demostrado**.
