# Plan técnico: clases en vivo y chat por grupo — 005

**Rama Git**: `feat/005-clases-chat`. **Fecha**: 2026-11-17, America/Lima.
**Entrada**: [spec.md](spec.md), V01–V03; constitución 1.2.1.
**Base**: `c24dcdbe0cac72d85fc17585615240188c8dee96`, merge del PR #5.

**Estado: diseño parcial, sin implementación.** Gestión de sesiones y chat tienen
diseño delimitado para generar sus tareas y someterlas a análisis. La puerta
**G-V005 está NO PASADA**: no existe integración de reproducción protegida
seleccionada y verificada. El flujo `plan` completo no se declara aprobado;
US2/FR-008–009/SC-003 y aceptación integral permanecen bloqueados. No hay una
excepción constitucional ni autorización para publicar, contratar o cambiar DEC01.
SC-002 conserva pendientes sus casos de video; SC-007, seguir una emisión real;
SC-008, capacidad observada y combinada. Evidencia local de chat no los cierra.

**Aclaración posterior V04**: el responsable confirma YouTube como integración de
prueba del MVP y Cloudflare para una etapa posterior, fuera de este MVP. No incluir
Cloudflare en tareas o dependencias de 005/006/007, ni exigir seleccionar un gestor
alternativo para el ensayo. El puerto permite sustituir proveedor en el futuro;
esta previsión no implementa Cloudflare ni acredita que satisfaga los controles.
Prueba de reproducción YouTube y aceptación de video protegido se registran por
separado; V04 no es una enmienda implícita de FR-008/009 o principio VIII.

## Summary

Añadir `classes` al monolito: sesiones manuales por grupo, una sola en curso;
chat de texto persistido y autorizado; historial de solo lectura al finalizar
mientras el derecho original siga vigente; ocultación y silencio por clase.
Se conservan las cuatro historias y todos los criterios del spec.

HTTP transporta comandos, consultas y texto autorizado. Socket.IO avisa que se
necesita sincronizar, sin difundir cuerpos de mensajes. PostgreSQL conserva
mensajes y una secuencia de cambios por clase; recuperar no depende de que una
conexión sobreviva. Reautorizar operaciones y avisos; una sala no acredita permiso.

Video queda detrás de un puerto sin adaptador habilitado: no devuelve URL ni
credenciales, ni presenta una maqueta como reproducción. La
[investigación](research.md) registra opciones y la [puerta de video](video-gate.md)
define lo que falta. El resto puede avanzar sin trasladar la protección al spec 007.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node 22.23.1, npm 10.9.8 existentes.
**Primary Dependencies**: NestJS/platform-express 12.1.0, Prisma 7.10.0, pg,
React 19 y Vite 8. Proponer Socket.IO 4.x y socket.io-client compatibles,
con versión exacta y lockfile revisados al implementar; no instalados aquí.
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

Revisión previa y posterior al diseño, sin enmendar la constitución:

| Principio | Diseño y evidencia requerida | Resultado |
| --- | --- | --- |
| I. Incrementos | V01–V03; tareas/análisis antes del código | Parcial: sesiones/chat; video sin resolver |
| II. Backend | Cuenta/sesión/rol y grupo/matrícula actuales en cada operación | Diseñado; matriz/carreras por probar |
| III–VII. Finanzas | Solo leer derecho original de 003 por contrato público | Sin cambios financieros ni aceptación de Izipay |
| VIII. Video | Proteger entrega directa y vencida, no solo página | **ERROR G-V005; no habilitar reproducción** |
| IX. Entornos | Harness aislado y datos ficticios, sin tocar `.env`/BD manual | Diseñado; sin servicios iniciados |
| X. Recuperación | Dump conjunto, restore aislado, accesos invalidados | Ensayo futuro; D13 operativo pendiente |
| XI. Capacidad | Separar cuentas/activos/conexiones/mensajes/video | No medida ni aprobada; D10 pendiente |
| Arquitectura/costo | Un proceso/pool, fronteras públicas | Compatible para el alcance independiente |

El error de VIII se delimita a reproducción; no se presenta como aprobación
global del plan. [G-V005](video-gate.md) bloquea adopción del adaptador real y
cierre de US2/005. Se redactan artefactos independientes de sesiones/chat.
Antes de implementar: tareas explícitas, análisis consistente y ningún camino
que entregue video bajo autorización simulada.

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
  contracts/{api,realtime,integration,ui}.md
  quickstart.md
  evidence/planning-review.{md,json}
```

`tasks.md` corresponde al siguiente bloque; este plan no lo genera.

### Source Code (repository root)

Rutas propuestas, todavía sin crear:

```text
apps/api/src/modules/classes/
  domain/{class-session,message,moderation}.ts
  application/{ports,commands,queries}.ts
  public/{classes,errors}.ts
  infrastructure/{class-store,chat-store,change-store,tickets,video-disabled}.ts
  entrypoints/http/classes.controller.ts
  entrypoints/realtime/class-socket.ts
apps/api/src/infrastructure/database/classes-transaction.ts
apps/api/src/modules/academic-offering/public/classes-access.ts
apps/api/src/modules/enrollment/public/classes-access.ts
apps/api/prisma/migrations/0010_classes_chat/migration.sql
apps/api/tests/integration/classes-*.spec.ts
apps/web/src/features/classes/{api.ts,management-page.tsx,classroom.tsx,chat.tsx}
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
7. Resolver G-V005 con decisión y prueba temprana antes de implementación concreta
   de video. Completar sus contratos/tareas y repetir análisis. US2 y cierre
   integral no se aceptan antes de esa evidencia.

| Historia / requisitos | Diseño principal | Verificación prevista |
| --- | --- | --- |
| US1 / FR-001–004,013,018 | Estados/revisión, índice único parcial, ledger | Dos inicios, docente cambiado, replay/COMMIT incierto |
| US2 / FR-005–009 | Consulta vigente; puerto video deshabilitado | Matriz/instante exacto; video real **bloqueado** |
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
G-V005 conserva D07/D08. No se cierran pendientes de 001–004. 006/007 conservan
su [hoja de ruta](../../docs/planificacion/hoja-ruta-005-007.md), sin implementación.

## Complexity Tracking

No se solicita excepción. Cambios durables en PostgreSQL y sockets sin texto
evitan depender de broker/replay de paquetes privados. Video permanece bloqueado
por una brecha real, sin convertirla en una desviación aceptada.
