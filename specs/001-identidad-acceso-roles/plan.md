# Plan de implementación: Identidad, autenticación y acceso por roles

**Rama Git**: `feat/001-identidad-acceso-roles` | **Fecha**: 2026-09-23 | **Especificación**: [spec.md](spec.md)

**Revisión final**: 2026-09-24, sobre los documentos existentes; no se regeneró el plan.

**Entrada**: `specs/001-identidad-acceso-roles/spec.md`, 33 requisitos, 7 historias y
checklist de especificación con 16/16 criterios documentales satisfechos.

**Estado**: fases 0 y 1 completadas documentalmente. Listo para descomposición en tareas;
la ejecución local está bloqueada por Docker no disponible y WSL2 no operativo. No hay
código, migraciones, Compose ni pruebas de producto implementadas o ejecutadas.

El script instalado `setup-plan.ps1 -Json` resolvió FEATURE_SPEC, IMPL_PLAN y FEATURE_DIR en
esta carpeta. Su campo BRANCH fue `001-identidad-acceso-roles`, derivado del directorio por
`common.ps1`; `git branch --show-current` confirmó la rama real indicada arriba. No se cambió
la rama ni el estado previo limpio. `main` en la especificación/checklist refleja la etapa
anterior; se preservan sus decisiones y ese registro histórico. No se encontró AGENTS.md
aplicable ni `.specify/extensions.yml` con hooks previos/posteriores. Al retomar la revisión
se conservaron el README modificado y los siete artefactos de planificación aún sin seguimiento.

## Resumen

Construir identidad como un monolito modular NestJS y una SPA React, con PostgreSQL/Prisma
para cuentas, sesiones, enlaces, límites y entregas de correo. Un único rol por cuenta,
correo verificado antes de acceso y recuperación con enlace de un solo uso ya están aprobados.
Se eligen sesiones opacas en cookie HttpOnly, autorización comprobada en BD y revocación
transaccional. Una tabla de entregas con ejecutor interno desacopla SMTP; Mailpit captura
correos localmente. No hay Redis, broker, microservicios ni proveedor contratado.

La solución incluye registro, login/logout, perfil propio, inicio básico, administración
mínima, primer administrador restringido y seguridad de errores/sesiones. No incluye pagos,
órdenes, matrículas, streaming, chat ni paneles completos. Izipay sigue elegido para el MVP
futuro, aislado de reglas de órdenes/matrículas; no es dependencia de identidad.

## Contexto técnico

**Lenguaje/versión propuestos**: TypeScript 6 estricto y ESM. Node 22.23.1 y npm 10.9.8
fueron observados el 2026-09-23; la combinación completa aún requiere validación práctica.

**Dependencias principales propuestas**: React 19, Vite 8, NestJS 12/Express, Prisma 7 y adapter-pg/pg,
Argon2id, Nodemailer. Fijar parches y lockfile al implementar; no asumir compatibilidad
verificada mediante instalación. Investigación y fuentes: [research.md](research.md).

**Persistencia**: PostgreSQL 17-bookworm, única BD por entorno con separación explícita.
Sesiones y límites persistidos; sin estado de autorización exclusivo de la memoria del proceso.

**Pruebas**: Vitest para dominio/componentes, Supertest+PostgreSQL para integración/contratos,
Playwright para navegador y k6 para carga de identidad. Configuración de test del backend
preserva decoradores/metadatos de Nest; el primer build y smoke comprobarán compatibilidad.

**Plataforma objetivo**: desarrollo Windows 11 con API/SPA en Node local y Docker Compose
para PostgreSQL/Mailpit. Navegadores de celular/computadora. Publicación futura bajo un único
HTTPS con Nginx, sin preparar despliegue en esta etapa.

**Tipo de proyecto**: aplicación web con dos workspaces y un backend desplegable como monolito.

**Objetivos de rendimiento**: SC-008 (19/20 accesos dentro de 3 s) y ensayo propuesto de
1000 sesiones con usuarios distintos; p95 de /me <500 ms y login <3 s como criterios de
diseño pendientes de medición/rúbrica. No se ha demostrado capacidad. Detalle en
[verification.md](verification.md).

**Restricciones**: una persona, cuatro meses, S/300 totales para servicios y pruebas del
proyecto; desarrollo local y correo sin envíos reales. No introducir infraestructura para
10 000 usuarios. No desactivar controles de seguridad para alcanzar cifras de carga.

**Escala/alcance**: aproximadamente 1000 alumnos previstos en el proyecto; esta función
modela identidad, un rol y operaciones básicas. No modela grupos, cursos ni matrículas.

## Comprobación de la constitución

Puerta previa a investigación: **aprobada para diseño**. Se leyó constitución 1.1.0,
especificación y checklist; Q1–Q3 resueltas. No se detectaron contradicciones de comportamiento
que requieran nuevas preguntas. Los detalles de tiempos/longitudes ya fijados se conservan.

Revisión posterior al diseño: **aprobada para generar tareas**, sin excepciones. Esto expresa
cumplimiento documental, no verificación de implementación ni autorización para desplegar.

| Principio / restricción | Evaluación posterior y evidencia |
| --- | --- |
| I. Funcionalidades pequeñas y SDD | Solo plan, investigación, datos, contratos y guías; tareas/implementación quedan para comandos posteriores. Cada bloque se corresponde con HU/FR en verification.md. |
| II. Autorización backend | Denegación por defecto, rol actual/propiedad/estado en BD; API no expone perfil ajeno a alumnos/docentes; pruebas V07/V09. Pertenencia académica fuera de alcance. |
| III. Precios/totales servidor | No aplicable a identidad: no existe endpoint, entidad ni cálculo de órdenes/pagos. Sigue obligatorio al especificarlos. |
| IV. Cupos/matrículas | No aplicable a identidad. Aquí se usan constraints/transacciones para correos y tokens; no se afirma haber probado matrícula. |
| V–VII. Confirmación/idempotencia/pruebas de pago | Fuera de alcance; no se invoca Izipay. Su elección y pendientes comerciales se conservan; carga solo de identidad. |
| VIII. Video autorizado | Fuera de alcance de código; investigación temprana independiente D07–D09 permanece visible y no espera al final de la aplicación. |
| IX. Entornos/secretos | Ejemplos vacíos, datos ficticios, Mailpit sin relay, distintas BD/claves, cookies seguras por entorno y logs redactados; quickstart. |
| X. Recuperación operativa | Migraciones versionadas, backup restaurado en otra BD, procedimiento de recuperación y revocación de secretos restaurados; V16. Aún por ejecutar. |
| XI. Capacidad demostrable | ID-LOAD-01/02 describen carga y evidencia; no hay resultados. No se extrapola a chat/HLS/matrícula. |
| Presupuesto/simplicidad | PostgreSQL y Mailpit locales; ejecutor interno de correo, sin servicios nuevos pagados. SMTP de producción pendiente de presupuesto total. |
| Separación del proveedor | Izipay no interviene en identidad y no modifica reglas de órdenes/matrículas; no se crean integraciones de pago. |

## Estructura del proyecto

### Documentación de esta funcionalidad

```text
specs/001-identidad-acceso-roles/
  spec.md                         # Existente; comportamiento aprobado
  checklists/requirements.md       # Existente; calidad de especificación
  plan.md                         # Este plan
  research.md                     # Fase 0: decisiones y fuentes
  data-model.md                   # Fase 1: entidades, restricciones y transiciones
  contracts/api.md                # Contrato HTTP, validaciones, errores y permisos
  contracts/ui.md                 # Pantallas y navegación
  quickstart.md                   # Entorno comprobado y ejecución/recuperación futura
  verification.md                 # Trazabilidad, seguridad y escenarios de carga
```

`tasks.md` no se crea aquí; corresponderá a `$speckit-tasks` cuando se solicite.

### Código fuente y configuración previstos en la raíz

El árbol siguiente es un destino de implementación; no son directorios ya creados:

```text
apps/
  web/
    src/
      app/                        # Rutas, cliente HTTP y manejo de sesión visible
      features/auth/              # Registro, correo, login, reset e inicio de contraseña
      features/profile/           # Perfil propio e inicio básico
      features/admin-users/       # Gestión de cuentas
      shared/ui/                  # Campos, errores y layout accesible
    tests/e2e/                    # Playwright contra servicios locales
  api/
    src/
      modules/identity/           # Altas, credenciales, sesiones y cambios de acceso
        entrypoints/http/        # Controladores y adaptación HTTP
        application/             # Casos de uso y contratos necesarios
        domain/                  # Reglas independientes de HTTP/Prisma
        infrastructure/          # Persistencia, transacciones y adaptadores
      modules/users/              # Mismas capas: perfiles, consultas y corrección de nombre
      modules/authorization/      # Mismas capas: políticas puras y adaptación en guards
      modules/mail/               # Mismas capas: entregas, transporte y ejecutor interno
      modules/audit/              # Capas solo cuando proceda; sin endpoint en esta entrega
      infrastructure/database/    # Cliente/pool compartido, sin reglas de negocio
      infrastructure/config/      # Carga/validación de entorno
      infrastructure/limits/      # Adaptación de ventanas/reservas, no reglas HTTP
      cli/                        # Bootstrap y recuperación restringidos
    prisma/
      schema.prisma
      migrations/
    tests/integration/
    prisma.config.ts             # Prisma 7: configuración/carga explícita de entorno
  # No paquetes adicionales hasta que exista reutilización real.
ops/
  local/                          # Instrucciones/configuración auxiliar sin secretos
  recovery/                       # Procedimientos y comandos operativos futuros
load-tests/identity/               # k6; fixtures privados fuera de Git
compose.local.yml                 # Solo PostgreSQL y Mailpit locales
.env.example                      # Campos secretos vacíos
.env.test.example
package.json                      # Workspaces npm, scripts coordinados
package-lock.json
docs/                             # Alcance y decisiones generales existentes
.specify/                         # Constitución y flujo existentes
```

**Decisión de estructura:** npm workspaces evita múltiples gestores y orquestación adicional.
No compartir entidades Prisma con el frontend; el contrato expone solo UserView. Identidad
coordina alta y seguridad usando servicios internos; users gestiona datos, authorization
centraliza decisiones y mail solo recibe entregas. El ensamblaje del monolito inyecta las
interfaces necesarias sin dependencias cíclicas ni un módulo `shared` con toda la lógica.
El cliente/pool y la configuración son comunes; las consultas y transacciones de negocio
pertenecen a la infraestructura del módulo responsable. No introducir repositorios genéricos.

### Capas internas y dependencias permitidas

La arquitectura acordada es **monolito modular con separación por capas dentro de cada
módulo**, no cuatro grandes carpetas globales para todo el backend. Todas las capas se
ejecutan en el mismo proceso. Los módulos pequeños solo crean archivos/capas que necesiten;
no se añaden controladores a mail/audit ni clases vacías para completar el árbol.

| Capa | Responsabilidad | Dependencias permitidas y límites |
| --- | --- | --- |
| Entrada HTTP | Rutas, DTO de transporte, forma/longitud del JSON, cookies, Origin/CSRF, traducción de resultados a status y errores públicos | Invoca aplicación; puede usar Nest/Express. No decide altas privilegiadas, último administrador, revocación o consumo de enlaces y no consulta Prisma directamente. |
| Aplicación | Coordina casos de uso, políticas, persistencia atómica, hashing y programación de correo; recibe comandos y actor, no Request/Response | Usa dominio y contratos de dependencias imprescindibles. No conoce cookies, códigos HTTP, SQL, Prisma, SMTP ni variables de entorno. Devuelve resultados/errores tipados que HTTP o CLI adaptan. |
| Dominio | Rol único, permisos, elegibilidad, vencimientos, transiciones y reglas de último administrador/uso único | TypeScript puro, funciones y tipos pequeños; no importa Nest, Prisma, Nodemailer, DTO HTTP ni configuración. Recibe estado y tiempo necesarios, sin efectuar IO. |
| Infraestructura | Implementa persistencia, locks, constraints, hashing, transporte y ejecución programada | Implementa contratos de aplicación y usa librerías externas. Puede depender de aplicación/dominio; estos no la importan. Aplica atómicamente la decisión de negocio y garantiza unicidad/concurrencia. |

Dirección de dependencias: entrada → aplicación → dominio; infraestructura → contratos
de aplicación/dominio. La raíz de composición de Nest conecta implementaciones y configura
providers. La CLI de bootstrap es otra entrada que reutiliza el caso de uso de inicialización.
Los guards HTTP adaptan identidad y hacen rechazo temprano, pero una mutación revalida
actor/invariantes en el caso de uso y en su persistencia atómica; no depende solo del guard.

Entre módulos se consumen capacidades públicas pequeñas, nunca controladores, modelos
Prisma ni archivos internos. Responsabilidades concretas para evitar ciclos:

- `identity` coordina alta pública/administrativa, bootstrap, sesiones, credenciales,
  recuperación y cambios de rol/estado con revocación. Sus entradas pueden servir comandos
  bajo `/admin/users`; la ruta HTTP no obliga a ubicar toda operación en `users`.
- `users` resuelve perfil, listado, detalle y corrección de nombre; no llama a `identity`
  para efectuar cambios de acceso. `identity` puede consumir tipos/reglas públicos de
  cuenta de `users`, sin una llamada inversa entre sus aplicaciones.
- `authorization` define políticas independientes y un contrato de consulta de identidad
  para sus guards; la composición conecta el adaptador de `identity`. No importa ni
  instancia IdentityModule para crear una dependencia circular.
- `mail` no importa `identity`: su ejecutor usa un contrato de elegibilidad de entrega
  que la composición conecta al adaptador de identidad. El almacenamiento atómico de
  cuenta/token/entrega se coordina desde la infraestructura de identidad en la BD compartida;
  no se reparte entre commits independientes ni se expone Prisma al caso de uso.
- `audit` recibe eventos permitidos; sus escrituras de éxito participan en el mismo commit
  de la mutación. No invoca de vuelta al módulo que produjo el evento. Precisión U1
  (2026-09-25): AuditEvent corresponde a operaciones aceptadas sobre cuentas existentes;
  denegaciones y comandos operativos usan registros estructurados privados sin FK. Los
  operadores locales se identifican con un alias operativo, nunca con usuarios ficticios.
  Campos, actores y destinos permitidos: [data-model.md](data-model.md#auditevent).
  El registro de una denegación no consulta existencia ni altera su respuesta pública.

Crear interfaces solo para separaciones útiles: persistencia atómica de identidad,
comprobación de contraseña, consulta de sesión desde guards y transporte/elegibilidad de
correo. Una función pura puede representar una regla; no se exige clase por entidad,
interfaz por servicio, repositorio CRUD genérico, bus CQRS ni capa que solo reenvíe llamadas.
La aceptación arquitectónica se añade a [verification.md](verification.md): las reglas
deben poder probarse sin servidor HTTP ni acceso a BD.

## Seguimiento de complejidad

No hay infracciones constitucionales que justificar. La tabla MailDelivery y su ejecutor
se necesitan para no bloquear HTTP ni perder envíos al reiniciar; usan la BD existente y
no equivalen a un servicio externo de colas. Bloqueos y versión de autorización responden
al requisito explícito de revocar sesiones aun ante concurrencia.

## Fase 0 — Investigación resuelta

[research.md](research.md) registra decisión, fundamento y alternativas de R01–R11:
runtime, sesiones, CSRF/cookies, contraseñas, concurrencia, enlaces, SMTP, reintentos,
límites, pruebas y entorno real. Las fuentes son documentación oficial/OWASP; se realizó
investigación independiente de seguridad y runtime/correo según la habilidad instalada.

Las decisiones de diseño están expresadas; las versiones son candidatas y solo se aceptarán
como combinación reproducible después de la comprobación práctica inicial. Dependencias externas:
Docker/WSL para ejecutar, proveedor SMTP para publicar, rúbrica para aceptar la carga y
viabilidad del video para el proyecto. No se convierten en hechos comprobados.

## Fase 1 — Diseño y contratos

### Datos y seguridad

[data-model.md](data-model.md) define User con correo canónico único y rol enum; Session
persistida; ActionToken de propósito único; MailDelivery cifrada; RateBucket/RateEvent;
AuditEvent y SystemState para bootstrap. Restricciones en BD, migraciones incrementales,
locks ordenados y revocaciones atómicas evitan carreras de alta, reset y último administrador.

La sesión expira a 30 min sin actividad aceptada u 8 h absolutas. Acceso protegido consulta
sesión y usuario en BD; logout revoca una, recuperación/desactivación/cambio de rol revocan
todas. Argon2id para contraseñas; SHA-256 solo para secretos aleatorios. Login revalida
credencial y authVersion después del hash antes de crear sesión. No usar memoria como store.

### Cookies y solicitudes

Un único origen con API relativa y CORS cerrado. Cookie HttpOnly, Secure y prefijo __Host-
en HTTPS; variante local explícita solo loopback. Mutaciones JSON con cabecera personalizada
y Origin exacto protegen también login/registro/logout; sin token CSRF adicional. Ni cookies
ni enlaces viajan por logs/localStorage. Los enlaces se confirman por POST, nunca por GET.

### Correos y errores

Mailer desacopla transporte. Mailpit captura localmente; adaptador SMTP con TLS para un
proveedor futuro. Entregas persistidas con tres intentos, timeout/lease, borrado de payload
cifrado y comprobación de vigencia. SMTP fuera de transacción; respuesta HTTP no espera
entrega ni revela existencia. Cuotas públicas y de transporte tienen buckets separados.
Saturación, error SMTP, enlace vencido y solicitud repetida tienen resultados contractuales.

### Interfaces y operación

[contracts/api.md](contracts/api.md) define todos los endpoints y DTOs, errores, cookies y
matriz; [contracts/ui.md](contracts/ui.md) concreta diez pantallas mínimas. No se incluye
edición libre de usuario ni funciones académicas. Bootstrap es CLI local con entrada oculta,
marca persistente única, verificación del correo y sustitución obligatoria de credencial.

[quickstart.md](quickstart.md) distingue comandos comprobados de scripts que deben crearse,
configuración local con ejemplos sin secretos, fixtures, preparación de BD, migración y
recuperación. Restaurar una copia revoca sesiones y tokens antes de reabrir servicio.

### Verificación y capacidad

[verification.md](verification.md) asigna V01–V16 a los 33 requisitos, los diez criterios
de éxito y la constitución. Incluye errores/abuso, cookies/CSRF, consumo único, permisos,
reinicio del backend, carrera login/reset y último administrador, correo fallido y recuperación.

ID-LOAD-01 usa 1000 cuentas/sesiones distintas con login gradual y consultas de perfil,
meseta de 10 min; ID-LOAD-02 mide por separado costo de autenticar. Umbrales provisionales,
medición del generador y condiciones de aceptación explícitas. No equivale a 1000 logins/s,
ni evalúa matrícula/chat/video. SC-001/010 requieren observación con personas además de E2E.

## Dependencias, riesgos y secuencia para futuras tareas

**Primera tarea futura: validación práctica de compatibilidad (V00), aún no ejecutada.**
Instalar y fijar paquetes candidatos sin forzar dependencias, compilar ambos workspaces,
comprobar metadatos de Nest/runner y componentes, generar cliente Prisma, aplicar migración
de ensayo y probar lectura/escritura con rollback en PostgreSQL. Añadir hash Argon2 y captura
SMTP local. Conservar evidencia y ajustar versiones si falla, antes de implementar identidad.
El procedimiento y criterio de cierre están en [quickstart.md](quickstart.md); este bloque
documenta la futura tarea y no crea `tasks.md`. Docker/WSL es dependencia de ejecución de
la parte Compose, no condición para completar el plan o descomponerlo en tareas.

| Elemento | Estado y condición de salida |
| --- | --- |
| Docker/WSL2 | Bloqueo real para ejecutar Compose: Docker no localizado e hipervisor no activo. Resolver según quickstart y comprobar Client/Server, Compose y servicios sanos. |
| Instalación/build | No ejecutada; fijar lockfile/digests y verificar Node/TypeScript/Nest/Prisma/Argon2 en Windows antes de avanzar sobre un entorno reproducible. |
| SMTP de producción | Pendiente elección, acceso, límites, TLS/remitente y precio; Mailpit permite desarrollar. Bloquea publicación con usuarios reales, no tareas. |
| Presupuesto | No se ha gastado ni cotizado servicio. S/300 cubren el proyecto completo; confirmar costos antes de contratar. |
| Carga | Sin resultados ni rúbrica final; medir pool/Argon2/escrituras de sesión, no introducir Redis por anticipación. |
| Recuperación | Procedimiento definido, restauración aún no ejecutada. No afirmar backups verificados hasta completar V16. |
| Video | D07–D09: investigación independiente en el primer incremento, antes de cerrar alojamiento; no esperar a terminar identidad ni toda la aplicación. |

Orden de dependencias para descomposición: V00 (entorno, compatibilidad y conexión a BD) → invariantes/bootstrap →
registro/correo/sesión → perfil/permisos/administración/recuperación con pruebas concurrentes →
validación E2E, operación y carga. La investigación de video es trabajo independiente temprano.
No se generan tareas ejecutables ni se invocan etapas posteriores en este comando.
