# Plan técnico: oferta académica

**Branch**: `feat/002-oferta-academica` | **Date**: 2026-10-18 |
**Spec**: [spec.md](spec.md)

**Input**: especificación 002 con cinco aclaraciones aprobadas.
**Estado**: diseño de fases 0/1 completado; propuesta técnica sin implementar ni verificar
en ejecución. Ninguna migración, servicio o prueba funcional se ejecutó en esta etapa.

## Summary

Añadir oferta académica al monolito modular existente con cursos y grupos separados,
horarios semanales America/Lima, capacidad 1–50, estados editoriales y vistas por actor.
Reutilizar identidad, autorización, transportes y PostgreSQL. Una generación específica
de habilitación docente evita republicación automática al reactivar la cuenta.
Los locks de cuentas/docentes, las revisiones de agregados y la identidad persistente
de comandos protegen concurrencia e idempotencia.

No se modifica [spec.md](spec.md), su checklist ni las cinco respuestas. Sus frases
«planificación fuera de esta etapa» describen la etapa anterior y quedan superadas solo
por la nueva instrucción de ejecutar este plan; no son una contradicción de negocio.
La especificación continúa siendo la fuente de PA-01–PA-05.

## Technical Context

**Language/Version**: TypeScript 6.0.3; Node 22.23.1/npm 10.9.8 en imágenes existentes.

**Primary Dependencies**: NestJS 12.1.0; Prisma 7.10.0 y pg; React 19 y Vite 8.
Versiones exactas ya registradas en package-lock.json; no actualizaciones previstas.

**Storage**: PostgreSQL 16.14. Mismo esquema/pool de la aplicación; tablas académicas
y proyección de usuarios. DATE y minutos locales para horarios; timestamptz UTC para
eventos. Prisma para modelos/generación/migración y pg para SQL transaccional.

**Testing**: Vitest 5.0.2 (reglas, arquitectura e integración), PostgreSQL real con
esquemas aislados y Playwright 1.63.0 (Chromium, móvil/escritorio, teclado).

**Target Platform**: Docker Compose Linux local, motor Linux de Docker Desktop/WSL2.
No contratación ni publicación; web y API conservan mismo origen y transporte seguro.

**Project Type**: aplicación web con dos workspaces y backend monolítico modular.

**Performance Goals**: sin umbral numérico aprobado para oferta. Medir tiempos de
lectura/publicación y esperas como diagnóstico, sin convertirlos en metas aceptadas.
Paginar listados; no N+1 ni expansión del calendario en clases. No acreditar 1000 concurrentes.

**Constraints**: PA-01–PA-05; cuerpo HTTP existente máximo 16 KiB; JSON estricto y
listas permitidas de errores; no SQL/Nest en núcleo; conservar cuentas, configuración y
evidencia. S/300 total y dependencias D04/D06/D10/D13, sin ampliación de dominio.

**Scale/Scope**: cuatro historias, 16 FR y seis SC; cursos/grupos, cero órdenes,
reservas, matrículas, pagos, materiales, clases, video o chat. Listados por páginas
(default 20, máximo técnico 50 registros por página, distinto de capacidad del grupo).

## Constitution Check

Puerta previa a investigación y repetida tras el diseño. «Conforme por diseño» no
significa principio demostrado por código. Constitución vigente 1.1.0 sin enmiendas.

| Principio/puerta | Antes de fase 0 | Después de fase 1 y evidencia de diseño |
| --- | --- | --- |
| I. Incrementos SDD | Spec/checklist y cinco respuestas disponibles | Conforme: investigación y diseño; no tasks ni implementación; FR/SC trazados abajo. |
| II. Autorización backend | Identidad reutilizable; pertenencia pendiente de diseñar | Conforme: permisos cerrados y filtros por recurso en contracts/api.md e integration.md; pruebas permitidas/denegadas V-A04/A05. |
| III. Precios confiables | Fuera del incremento | No aplica a esta implementación: no precios ni órdenes; sin valores cero ficticios. |
| IV. Cupos/matrículas | Solo capacidad configurada | Aplicación parcial conforme: CHECK 1–50; sin ocupación/reserva. Identidad de matrícula y último cupo siguen en D04/futuro. |
| V. Confirmación de pagos | Fuera de alcance | No aplica aquí; no simular pagos para dar acceso. |
| VI. Idempotencia de pagos | No hay pagos | No aplica a pagos; comandos académicos sí tienen idempotencia por FR-015. |
| VII. Pruebas de pagos separadas | Sin proveedor ni cobros | No aplica aquí; ninguna prueba o contrato integra Izipay. |
| VIII. Video protegido | Fuera de alcance; D07/D08 abiertos | No aplica aquí; no se resuelve la diferencia histórica YouTube/OBS→SRS de documentos de video. |
| IX. Entornos separados | Conservación de .env/cuentas requerida | Conforme por diseño: copia/proyecto nuevo, esquemas t_ y fixtures ficticios; quickstart sin operar datos actuales. |
| X. Recuperación/migraciones | Cuatro migraciones intactas; D13 abierto | Conforme para planificar: diseño aditivo y ensayo de actualización/restore futuros. Demo persistente/publicación sigue condicionada a D13/evidencia. |
| XI. Capacidad demostrable | T103 no aprueba capacidad; D10 abierto | Conforme: cero afirmaciones de 1000 concurrentes; diagnóstico futuro sin metas inventadas. |
| Arquitectura/costo | Monolito/Compose existentes | Conforme: sin dependencias operativas nuevas, otro pool, Redis, microservicios o infraestructura de clases. |

**Resultado de ambas puertas**: sin incumplimientos nuevos ni excepciones necesarias.
Los incumplimientos/pendientes heredados no se cierran. No bloquean generar tareas del
alcance local; sí impiden atribuir aceptación integral o habilitar producción.

## Project Structure

### Documentation (this feature)

```text
specs/002-oferta-academica/
├── spec.md                         # existente, preservado
├── checklists/requirements.md       # existente, preservado
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── api.md
│   ├── integration.md
│   └── ui.md
└── quickstart.md
```

No se genera tasks.md. Tampoco se generan SQL, modelos Prisma ni tests ahora.

### Source Code (repository root)

Rutas siguientes **previstas**, no archivos creados:

```text
apps/api/src/modules/academic-offering/
├── academic-offering.module.ts
├── public/offer.ts
├── domain/{course,group,schedule,visibility,offering-error}.ts
├── application/{commands,queries,offering-store}.ts
├── entrypoints/http/{admin,catalog,teaching}.controller.ts
└── infrastructure/{offering-store,offering-queries,offering-audit}.ts
apps/api/src/modules/users/
├── public/teaching-directory.ts
└── infrastructure/teaching-directory.ts
apps/api/src/infrastructure/database/
├── academic-transaction.ts
└── account-locks.ts
apps/web/src/features/academic-offering/
├── api.ts
├── admin-courses-page.tsx
├── admin-course-page.tsx
├── admin-group-page.tsx
├── catalog-page.tsx
├── course-page.tsx
├── group-page.tsx
├── teaching-groups-page.tsx
├── teaching-group-page.tsx
└── {course-form,group-form,schedule-editor,offering-state}.tsx
apps/web/playwright.academic-offering.config.ts
apps/web/tests/e2e/academic-offering-*.spec.ts
```

**Structure Decision**: una feature web comparte vistas y validadores propios sin
importar features de identidad; composición pasa ApiClient/navegación. Dominio puro y
aplicación dependen solo de contratos; pg y locks permanecen en infraestructura.

## Integración y componentes afectados

| Componente | Cambio previsto y motivo |
| --- | --- |
| Nuevo AcademicOfferingModule | Casos de uso y rutas de administración, catálogo y grupos propios. |
| `authorization/domain/permissions.ts` | Añadir academic:manage, academic:read-published y academic:read-own; negar todo lo desconocido. |
| `authorization/public/session.ts` | Reutilizar SessionActor, errores y ACCESS_POLICY; no exponer PoolClient en núcleo. |
| `users/public/teaching-directory.ts` | Nuevo contrato mínimo docente y proyección SQL pública; no UserView privado para catálogo. |
| `infrastructure/database/account-locks.ts` | Capacidad pg de bloqueo ordenado de cuentas, compartida por adaptador académico; sin nueva regla de identidad. |
| `account-transaction.ts` / `academic-transaction.ts` | Reutilizar rollback/reintentos; añadir orquestación académica y redescubrimiento acotado del conjunto de cuentas. |
| `identity/infrastructure/session-store.ts` | Conservar revalidateInTransaction/accepted y su semántica; inyectar capacidad existente desde composición, sin importar clase interna desde oferta. |
| `identity/infrastructure/access-change-store.ts` | No callback hacia oferta; conserva revocación/auditoría. Futura columna/trigger actúa atómicamente en su UPDATE existente. |
| `apps/api/prisma/schema.prisma` y nueva migración | Campo de generación, proyección de usuarios y tablas de oferta; solo diseño en esta etapa. |
| `http/error.filter.ts` y `infrastructure/logging/security-events.ts` | Ampliar allowlists de códigos/campos/targets académicos; no serializar mensajes o causas de adaptadores ni etiquetar un curso como USER_REFERENCE. |
| `app.module.ts` | Ensamblar nuevo módulo, directorio y capacidades de autorización/locks con el pool único. |
| `apps/web/src/app/{App,protected-route}.tsx`, `router.tsx` | Rutas protegidas por actor, cancelación de peticiones y limpieza de estado ante pérdida de sesión. |
| `features/profile/home-page.tsx` | Enlaces Oferta/Mis grupos/Gestionar oferta según rol, sin panel académico adicional. |
| `shared/api-client.ts` y `app/http.ts` web | Códigos/campos nuevos y queries por ruta; cuerpos commandId/expectedRevision sin headers arbitrarios ni replay automático. |
| Arquitectura/integración/E2E existentes | Ampliar cobertura de políticas e imports; conservar regresión de identidad y fixtures. |
| Compose y configuración | Reutilizar los archivos existentes; no cambiar puertos, secretos, volúmenes ni cuentas actuales. |

## Fase 0 — Investigación completada

[research.md](research.md) consolida R01–R08 con alternativas, evidencia local y fuentes
primarias. Se investigaron integración/identidad, calendarios/concurrencia y contratos/
verificación en paralelo mediante tres agentes de solo lectura.

No hay incógnitas de diseño sin resolver. No se inventan decisiones de matrícula,
precios, reembolsos, video o capacidad. Los límites de listas y formato de transporte
son decisiones técnicas, no cambios de PA-01–PA-05.

## Fase 1 — Diseño

### Datos, estados y habilitación

[data-model.md](data-model.md) define Course, Group, Slot, generación docente, ledger
de comandos y auditoría. Borrador/Retirado son editables; Publicado se retira antes de
editar; Cancelado es terminal. Retirar curso no cambia estados de grupos ni libera la
programación de los que sigan Publicados.

Solo republicar **el grupo** actualiza su captura de habilitación. Republicar curso
revalida todos sus grupos Publicados, sin limpiarla. Si alguno requiere revisión o
incumple reglas, se rechaza la republicación del curso de forma atómica con referencias
solo administrativas; retirar esos grupos permite recuperar primero el curso y después
revisar/republicar cada grupo. Esto concreta validación de PA-02, no publicación automática.

### Autorización, consultas y concurrencia

[contracts/integration.md](contracts/integration.md) fija el protocolo de locks y
límites de módulos. El guard hace control grueso; consultas filtran audiencia antes de
contar y mutaciones revalidan actor/sesión dentro de la transacción.

Orden académico, dentro de cada intento: descubrir IDs → User ordenados → sesión →
curso → grupos → comando/auditoría; redescubrir si aparecen cuentas no bloqueadas.
Máximo tres intentos totales mediante el único bucle de accountTransaction.
Consulta de conflictos en
sentencia posterior al lock. No se adquiere SystemState desde oferta ni se introducen
callbacks identidad→grupos. Reutilizar comportamiento actual de commit ambiguo:
indisponibilidad segura, resolución mediante el mismo commandId, nunca reintento ciego.

### Contratos y recorridos

[contracts/api.md](contracts/api.md) contiene operaciones, DTO, validaciones, revisiones,
replay y errores. [contracts/ui.md](contracts/ui.md) define recorridos por actor,
validación y estados. Nunca se representan plazas libres usando capacidad; las
proyecciones muestran ocupación/disponibilidad no calculadas.

### Verificación y trazabilidad

Pruebas futuras, no resultados aprobados. Nombres de archivo indicativos para tareas;
cada comprobación deberá conservar versión, comandos, resultados y limitaciones.

| ID | Comprobación | Nivel principal y ruta futura | Cobertura |
| --- | --- | --- | --- |
| V-A01 | Curso/grupo, identidad estable, campos independientes y estados | Unitarias domain/*.test.ts; integración academic-offering-state.spec.ts; E2E admin | FR-001/002/007/008; SC-001 |
| V-A02 | Horarios, fecha efectiva común, días ISO, extremos, adyacencia y medianoche | Unitarias schedule.test.ts; integración academic-offering-schedule.spec.ts | FR-003/004; SC-004 |
| V-A03 | Capacidad 1/50; omisión inicial de borrador versus valor inválido configurado | Unitarias group.test.ts, integración constraints.spec.ts y formulario E2E | FR-005/006; SC-002/004 |
| V-A04 | Matriz completa operación/actor/estado, docente propio/ajeno, visitante y cuenta no habilitada | Integración HTTP academic-offering-authorization.spec.ts, E2E por actor | FR-009/010; SC-003 |
| V-A05 | DTO cerrado, filtros antes de paginar, 404 equivalente, logs sin email/estado/secretos | Integración academic-offering-privacy.spec.ts; web api.test.ts | FR-011/013/015; SC-003/006 |
| V-A06 | Generación: pérdida→recuperación sin consultas; reset no la cambia; revisión no se limpia por publicar curso | Integración PostgreSQL academic-offering-teacher.spec.ts; E2E | FR-007/010/012/016; SC-003/004 |
| V-A07 | Dos conexiones/admins distintos, publicación docente común, publicaciones distintas, revalidar conjunto del curso | Integración PostgreSQL academic-offering-concurrency.spec.ts con barreras reales | FR-004/007/008/015; SC-004/006 |
| V-A08 | Publicar vs cambiar rol/desactivar; retirar/cancelar vs publicación; revisión obsoleta | Integración PostgreSQL combinada con identidad y asserts de estado final | FR-008/010/012/015; SC-003/004/006 |
| V-A09 | commandId: mismo payload, payload distinto, respuesta perdida, commit ambiguo y actor sin permisos | Integración academic-offering-commands.spec.ts, E2E conflicto | FR-013/015; SC-006 |
| V-A10 | Admin crea dos grupos, alumno compara, docente Mis grupos; vacío/fallo/foco/móvil/teclado | Playwright academic-offering config, pruebas UI unitarias | FR-001/009/013/014; SC-001/002/005 |
| V-A11 | Migración nueva/incremental, restricciones, trigger/view con runtime y cuentas previas intactas | Integración academic-offering-migration.spec.ts; ensayo restore controlado | FR-016; SC-003/004 |
| V-A12 | Capas/políticas, regresión completa afectada de identidad, guardas de entorno y recuperación | Suite de arquitectura y guía de regresión 001 | FR-010/014/016; SC-003/005 |
| V-A13 | Alumno real identifica datos sin ayuda; no atribuirlo al agente | Observación futura SC-002, un recorrido registrado sin nuevos porcentajes/muestra impuestos | FR-006/009; SC-002 |

Las barreras de concurrencia se observan desde una tercera conexión, siguiendo la
corrección ya integrada `apps/api/tests/support/locks.ts`: no consultar locks esperando
al mismo pool/conexión que está bloqueado. No sustituir carreras por Promise.all sin
confirmar el punto de espera ni ampliar timeouts para forzar éxito.

### Evolución y operación

Futura migración aditiva en `apps/api/prisma/migrations/0005_academic_offering/`
(nombre sujeto al historial real al implementar). No crear SQL ahora. Ensayar vacía
e incremental con copia ficticia, verificar permisos runtime, datos/sesiones/bootstrap
previos y ejecutar regresión de identidad.

Antes de cualquier actualización persistente: mantenimiento, copia cifrada,
restauración aislada comprobada, migración revisada y smoke; corrección hacia adelante
o restauración a destino nuevo, sin prometer downgrade. [quickstart.md](quickstart.md)
reutiliza Compose y guías existentes sin tocar entorno manual.

## Dependencias y bloqueos

- D04: reservas/consumo/liberación, último cupo y disponibilidad real quedan para matrícula.
- D06: programación docente resuelta; compatibilidad/cambios tras matrícula siguen abiertos.
- T104/T108, hallazgo bootstrap, SMTP real, capacidad sin aprobar, D10 y D13 permanecen.
- D07–D09 de video/protección/alojamiento siguen independientes; no contratar servicios.
- No hay bloqueo real de reglas o diseño para generar tareas. La futura BD sombra
  para migrate:dev aún no está validada; usar el procedimiento controlado al implementar,
  sin ejecutar ese comando aquí. Runtime/tests de oferta todavía no existen.
- Un fallo de puerta constitucional o contradicción futura deberá resolverse antes de
  implementar; no se encontró una contradicción que exija cambiar las cinco respuestas.

## Complexity Tracking

Sin excepciones constitucionales. La generación docente y el ledger de comandos
resuelven PA-03 y FR-015; la proyección SQL evita mezclar instantáneas sin acoplar
núcleos. No se añade infraestructura para clases o matrícula.

**Salida de esta etapa**: solo este plan, research, modelo, contratos y guía local.
Los hooks before_plan/after_plan no existen en el repositorio. No ejecutar
`$speckit-tasks` hasta una instrucción posterior.
