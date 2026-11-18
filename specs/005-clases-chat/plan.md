# Plan técnico: clases en vivo y chat por grupo — 005

**Rama Git**: `feat/005-clases-chat`. **Fecha**: 2026-11-17, America/Lima.
**Entrada**: [spec.md](spec.md), V01–V05; constitución 2.0.0.
**Base**: `c24dcdbe0cac72d85fc17585615240188c8dee96`, merge del PR #5.

**Estado: T001–T007 completadas; contratos/persistencia implementados.**
Gestión/chat y transporte funcional pendientes. [Evidencia T005–T007](evidence/t005-t007.md).
La preparación conserva su [checkpoint](evidence/t001-t004-results.json). El responsable
aprobó V05 y la enmienda 2.0.0. YouTube Live + OBS se usa para probar emisión y
reproducción, con permisos propios de aula/referencia/chat y límite externo explícito.
Cloudflare queda fuera del MVP. [Adopción](evidence/video-scope-adoption.md).

[G-V005](video-gate.md) sigue pendiente de pruebas reales y no es un bloqueo por
exigir autorización multimedia del proveedor. [Contrato de video](contracts/video.md)
define referencia/versiones, controles propios, player, CSP y ensayo manual.
Ningún FR/SC se declara implementado por aprobar el alcance. Validación académica
pendiente si cambia criterios de evaluación; D10/D13 conservan sus puertas.

## Summary

Añadir `classes` al monolito: sesiones manuales por grupo, una sola en curso;
chat de texto persistido y autorizado; historial de solo lectura al finalizar
mientras el derecho original siga vigente; ocultación y silencio por clase.
Se conservan las cuatro historias y todos los criterios del spec.

HTTP transporta comandos, consultas y texto autorizado. Socket.IO avisa que se
necesita sincronizar, sin difundir cuerpos de mensajes. PostgreSQL conserva
mensajes y una secuencia de cambios por clase; recuperar no depende de que una
conexión sobreviva. Reautorizar operaciones y avisos; una sala no acredita permiso.

Video usa un puerto separado, inicializado como no configurado; el adaptador futuro
solo devuelve el ID de ensayo a participantes autorizados de clase LIVE. El
backend no sirve segmentos, integra cuenta YouTube o almacena streamKeys. Gestión
y player se construyen bajo el contrato aprobado, con pruebas reales separadas de
los dobles locales. [Investigación actualizada](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node 22.23.1, npm 10.9.8 existentes.
**Primary Dependencies**: NestJS/platform-express 12.1.0, Prisma 7.10.0, pg,
React 19 y Vite 8. Socket.IO y socket.io-client **4.8.4** fijados en T004,
instalación con npm ci, tipos y protocolo básico comprobados en Linux;
[dependencias](evidence/dependencies.md). Transporte funcional todavía pendiente.
Integración en servidor HTTP existente, sin requerir adaptador Nest adicional.
**Storage**: PostgreSQL 16, mismo pool; migración aditiva propuesta
`0010_classes_chat`, después de 0009, sin modificar migraciones aplicadas.
**Testing**: Vitest dominio/arquitectura/PG real/HTTP; cliente Socket.IO real para
su protocolo; Playwright escritorio/móvil. Observación humana y video real separados.
**Target Platform**: Windows y runner Linux/Compose; HTTPS/VPS en 007.
**Project Type**: web y API, dos workspaces, monolito modular.
**Performance Goals**: cuota funcional 10 mensajes nuevos/10 s por usuario/clase;
medir latencia, avisos, sincronización y reconexión. 15.000 cuentas y 2.500 activos
siguen sin demostrar; mezcla/umbrales prospectivos de 007 sujetos a D10.
**Constraints**: S/300 total; JSON 16 KiB; sin Redis o cola ilimitada. Límites
iniciales revisables: 4 sockets por actor, 3.000 por proceso, una clase por socket,
un aviso pendiente por socket, una sincronización concurrente por cliente.
Son protecciones propuestas, no capacidad o disponibilidad acreditadas.
**Scale/Scope**: 4 historias, 24 escenarios, 23 FR, 8 SC. Sin nuevas reglas de
matrícula, asistencia, calificaciones, grabaciones, chat externo o paneles generales.

## Constitution Check

Revisión del diseño frente a la constitución 2.0.0 adoptada en V05:

| Principio | Diseño y evidencia requerida | Resultado |
| --- | --- | --- |
| I. Incrementos | V01–V05; tareas/análisis antes del código | Contratos y persistencia implementados; gestión/chat pendientes |
| II. Backend | Cuenta/sesión/rol y grupo/matrícula actuales en cada operación | Diseñado; matriz/carreras por probar |
| III–VII. Finanzas | Solo leer derecho original de 003 por contrato público | Sin cambios financieros ni aceptación de Izipay |
| VIII. Video | Ensayo YouTube, permisos propios y límite externo explícito | Alcance aprobado; reproducción real y evidencia pendientes |
| IX. Entornos | Harness aislado y datos ficticios, sin tocar `.env`/BD manual | BD/Mailpit de ensayo comprobados; API/web no iniciados |
| X. Recuperación | Dump conjunto, restore aislado, accesos invalidados | Ensayo futuro; D13 operativo pendiente |
| XI. Capacidad | Separar cuentas/activos/conexiones/mensajes/video | No medida ni aprobada; D10 pendiente |
| Arquitectura/costo | Un proceso/pool, fronteras públicas | Compatible para el alcance independiente |

C1 se resuelve como discrepancia de alcance por V05/enmienda 2.0.0; no como
protección demostrada. No hay excepción tácita o video protegido aprobado.
Antes de código, revisar tareas/contratos y realizar análisis. La aprobación del
responsable no sustituye validación académica cuando afecte evaluación.

## Project Structure

### Documentation (this feature)

```text
specs/005-clases-chat/
  spec.md
  video-feasibility.md
  plan.md
  research.md
  data-model.md
  video-gate.md
  contracts/{api,realtime,integration,ui,video}.md
  quickstart.md
  evidence/planning-review.{md,json}
```

La lista [tasks.md](tasks.md) organiza T001–T086: siete tareas
completadas, 79 pendientes. [Matriz](verification.md) creada en T003; todavía no
acredita aceptación funcional. G-V005 exige ensayo real del alcance aprobado.

### Source Code (repository root)

Rutas de destino: contratos públicos/puertos y migración ya creados en T005–T007;
el resto sigue propuesto, sin entrypoints o stores funcionales:

```text
apps/api/src/modules/classes/
  domain/{class-session,message,moderation}.ts
  application/{ports,commands,queries}.ts
  public/{classes,errors}.ts
  infrastructure/{class-store,chat-store,change-store,tickets,video-disabled,video-access}.ts
  entrypoints/http/classes.controller.ts
  entrypoints/http/video.controller.ts
  entrypoints/realtime/class-socket.ts
apps/api/src/infrastructure/database/classes-transaction.ts
apps/api/src/modules/academic-offering/public/classes-access.ts
apps/api/src/modules/enrollment/public/classes-access.ts
apps/api/prisma/migrations/0010_classes_chat/migration.sql
apps/api/tests/integration/classes-*.spec.ts
apps/web/src/features/classes/{api.ts,management-page.tsx,classroom.tsx,chat.tsx,video-player.tsx}
apps/web/src/app/classes-routes.tsx
apps/web/tests/e2e/classes-*.spec.ts
apps/web/tests/support/classes-fixture.ts
apps/web/playwright.classes.config.ts
ops/recovery/rehearse-classes.ps1
```

**Structure Decision**: dominio puro, puertos públicos sin SQL/Nest/Socket;
infraestructura implementa persistencia/transporte. AppModule y arranque componen
participantes y ciclo de vida. Web recibe capacidades desde `app`, sin imports
laterales de features. Autorización, sesión, proxy, CSP, errores e inventarios
de rutas se amplían de forma explícita y con regresión.

## Diseño y secuencia prevista

1. Revisar versión exacta de Socket.IO/compatibilidad; pruebas de fronteras,
   esquema y participantes públicos, con harness separado.
2. Coordinador con orden de locks, vigencia original y replay; probar inicios
   concurrentes y matriz por rol. Entrega independiente de gestión US1.
3. Chat durable: intención, cuota móvil, orden y cambios; HTTP para enviar/leer,
   historial cerrado y tombstones. Carreras antes del transporte persistente.
4. Tickets y Socket.IO solo para avisos; recuperación HTTP y degradación visible.
   No reenviar comandos automáticamente tras iniciar sesión.
5. Moderación y UI por rol: generaciones de sesión, conflictos y accesibilidad.
6. Regresión 001–004, upgrade/reinicio/restore y ensayo humano de lo disponible.
7. Implementar referencia/gestión/player según contrato del ensayo. Los tests
   locales pueden usar doble; emisión/reproducción YouTube y permisos propios
   requieren prueba real autorizada separada. Registrar límites externos,
   calidad/fallos y operación manual al finalizar antes de aceptar US2.

| Historia / requisitos | Diseño principal | Verificación prevista |
| --- | --- | --- |
| US1 / FR-001–004,013,018 | Estados/revisión, índice único parcial, ledger | Dos inicios, docente cambiado, replay/COMMIT incierto |
| US2 / FR-005–009 | Consulta vigente, referencia YOUTUBE_DEMO y player | Matriz exacta, límites externos y ensayo real pendiente |
| US3 / FR-010–015 | HTTP + cambios durables + avisos Socket.IO | Cuota, múltiples conexiones, gaps, reconexión/finalización |
| US4 / FR-016–020 | Tombstones, silencio por clase, auditoría | Respuesta tardía, carreras y aislamiento |
| Transversal / FR-021–023 | Generación UI, restore y evidencia separada | Teclado/móvil, cuentas cambiadas, recuperación/capacidad |

[Quickstart](quickstart.md) define matriz y comprobaciones; los comandos futuros
se marcan como tales, sin inventar ejecución o aceptación.

## Riesgos y puertas

Locks por clase serializan envíos/moderación y pueden limitar throughput. El
fanout de lecturas autorizadas consume BD; no dedicar una conexión por socket.
Medir antes de optimizar o añadir infraestructura. Un contador transaccional por
clase ordena commits; una secuencia global de PostgreSQL no basta como cursor.

No hay política de purga aprobada: no programar borrados. Medir crecimiento e
índices/backups. No mantener locks durante espera de red. No se pueden retirar
bytes ya autorizados/en tránsito; las nuevas decisiones se ordenan bajo locks y
la UI descarta proyecciones anteriores al cambio que ya observó. Documentar esa
frontera y probar que nuevas consultas/replays no recuperan texto ocultado.

D13 antes de demo persistente/publicación; D10 antes de afirmar capacidad.
G-V005 conserva la necesidad de evidencia de D07/D08 del ensayo. No se cierran pendientes de 001–004. 006/007 conservan
su [hoja de ruta](../../docs/planificacion/hoja-ruta-005-007.md), sin implementación.

## Complexity Tracking

La enmienda 2.0.0 aprobada delimita el ensayo; no se solicita excepción adicional.
Cambios durables en PostgreSQL y sockets sin texto evitan broker/replay privado.
La referencia de video versionada usa el mismo coordinador/ledger y no convierte
el backend en distribuidor de video. Cloudflare requiere otro incremento.
