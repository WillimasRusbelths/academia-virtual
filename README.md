# academia-virtual

Proyecto de academia virtual para un trabajo final de curso, con desarrollo local
mediante Spec-Driven Development con GitHub Spec Kit.

**Estado al 2026-10-30:** React/NestJS y PostgreSQL, monolito modular y Docker Compose local.
Requisitos confirmados: **al menos 15 000 cuentas registradas**, objetivo de **2500
usuarios concurrentes activos todavía sin demostrar**, y reserva de cupo previa al pago
por **24 horas exactas desde confirmación del servidor**. Pago verificado confirma
matrícula; vencimiento sin pago libera cupo según conciliación consistente aún por diseñar.
Presupuesto **S/300 total**. [Planificación y decisiones abiertas](docs/planificacion/reservas-capacidad.md),
[backlog futuro](docs/planificacion/tasks.md) y [smokes recientes](docs/planificacion/evidence/2026-10-23-smokes.md).
Se propone preparar VPS y acceso controlado en apertura; AWS se evaluará después de
mediciones y presupuesto, sin adoptarlo, contratar ni desplegar en este bloque.

Las siete historias de identidad tienen sus checkpoints funcionales comprobados. La
[regresión T106](specs/001-identidad-acceso-roles/evidence/regression.md) reproduce configuración
y bases nuevas: 120 unitarias, 744 integraciones y 203 E2E aprobadas. La
[medición T105](specs/001-identidad-acceso-roles/evidence/login-timing.md) acredita SC-008 local.
T104 sigue aplazada hasta diez personas reales en la versión integrada y estable;
[T108 es preliminar](specs/001-identidad-acceso-roles/evidence/acceptance.md). Son **106/108 tareas**
completas, sin aceptación integral. El bootstrap intermitente sigue abierto, sin causa confirmada.
Capacidad sin aprobar: [T103 conserva ejecución/informe e incumplimientos](specs/001-identidad-acceso-roles/evidence/load-resources.md).
Las nuevas cargas completas esperan a matrícula; se prepara la evaluación VPS, sin
ejecutarla ni contratar. D10/D13 y SMTP real siguen pendientes.
La purga es CLI explícita, sin programación. Operación actual y SMTP futuro:
[quickstart](specs/001-identidad-acceso-roles/quickstart.md).

[US1: acceso y cierre de sesión](specs/001-identidad-acceso-roles/evidence/us1.md) está implementada
y verificada con cuentas de prueba de los tres roles: login, consulta propia, recarga y logout.
[US2: registro y verificación](specs/001-identidad-acceso-roles/evidence/us2.md) está implementada
y verificada mediante registro público, Mailpit, confirmación explícita, reenvío y login.
[US6: primer administrador](specs/001-identidad-acceso-roles/evidence/us6.md) cuenta con CLI
restringida y activación mediante contraseña propia y correo verificado, comprobadas en un entorno aislado.
[US4: gestión mínima de cuentas](specs/001-identidad-acceso-roles/evidence/us4.md) tiene su
checkpoint funcional comprobado, incluidas revocación, carreras administrativas y V04-B.
[US7: recuperación de contraseña](specs/001-identidad-acceso-roles/evidence/us7.md) tiene su checkpoint
funcional comprobado en API y navegador, con revocación de sesiones y recuperación tras provisional vencida.
Oferta académica [002](specs/002-oferta-academica/tasks.md) tiene sus cuatro historias
implementadas y verificadas automáticamente. [T068](specs/002-oferta-academica/evidence/automated.md)
registra UNIT API 335/335, web 188/188, PostgreSQL/HTTP 1972/1972, crypto/mail 2/2,
E2E identidad 203/203 y oferta 168/168 (84 casos en dos proyectos). Son resultados
de esa revisión, no pruebas nuevas ejecutadas al actualizar esta documentación.
[T069](specs/002-oferta-academica/evidence/recovery.md) verifica migración incremental
y restore aislado con invalidación de credenciales, ledger/auditoría y decisiones
posteriores al backup. [T067](specs/002-oferta-academica/evidence/t067.md) incorpora
E2E de oferta al workflow; CI remoto y suficiencia de su límite de tiempo pendientes.
Las cinco aclaraciones y E1 siguen vigentes. T070–T072 actualizan documentación y
preparan el [protocolo humano](specs/002-oferta-academica/evidence/human-acceptance.md);
T073 requiere participante y T074 permanece pendiente de evidencia integral.
El [cierre parcial T074](specs/002-oferta-academica/evidence/acceptance.md) reúne
la matriz FR/SC y las limitaciones; T073 sigue aplazada y ambas tareas sin marcar.
H-CAP-01 se [corrigió y verificó automáticamente](specs/002-oferta-academica/evidence/h-cap-01.md):
el catálogo inicial indica ocupación/disponibilidad no calculadas. Esto no sustituye T073/SC-002 humano.
Reservas, órdenes y matrícula requieren su propio spec y no amplían 002;
no hay integración de pagos/video ni despliegue acreditado.
RP001 conserva el [inventario](specs/003-reservas-ordenes-matricula/research.md) desde adca8e6;
RP002 prepara el [borrador 003](specs/003-reservas-ordenes-matricula/spec.md) y su
[checklist](specs/003-reservas-ordenes-matricula/checklists/requirements.md), 10/16 y sin aprobación para plan.
RP003 completa tres rondas de cinco respuestas en el [spec 003](specs/003-reservas-ordenes-matricula/spec.md),
con las quince respuestas conservadas. Se mantienen 24 horas exactas, precio por
curso/PEN conservado, reserva conjunta, orden desglosada/pago total, una orden con
reservas vigentes por alumno y un grupo por curso, sin duplicar compromisos vigentes.
La admisión autenticada/válida registrada por servidor define la prioridad.
Solo se confirman nuevas reservas antes de las 00:00 de la fecha inicial del grupo,
en America/Lima, con curso/grupo publicados y visibles, docente/revisión vigente,
precio definido y capacidad real. Se impiden solapamientos efectivos de la selección
y de compromisos vigentes propios, aunque estén ocultos; se permiten franjas contiguas.
Retirar oferta o perder habilitación conserva compromisos y plazo, pero bloquea
iniciar pago y confirmar matrículas de toda la orden si algún grupo está oculto;
pago verificado entonces queda en conciliación sin matrícula. Revisión/republicación
explícitas permiten pagar el plazo restante, sin renovar ni resolver incidencias.
Con reservas/matrículas vigentes o incidencias sin resolver solo se permiten textos
y sustitución docente siguiendo 002; se bloquean curso, período, horarios, capacidad
y cancelación. Historial finalizado no bloquea ni se reactiva por edición/republicación.
Sin cancelación/modificación voluntaria de compromisos; tras vencer sin pago se puede
intentar de nuevo, sin sanción ni espera adicional por abandono y sin renovar la misma intención.
Las reglas funcionales quedan resueltas o delimitadas; RP004 prepara el plan base
funcional con puertas explícitas de Izipay, resolución económica antes de cobros reales,
D10/capacidad y D13/operación. Checklist **11/16 → 12/16**, sin regresiones; sus notas
históricas se conservan. No es aprobación global ni implementación de reservas.
Constitución 1.2.1 intacta; la aceptación humana de 002 sigue aplazada.
[Revisión de tercera ronda](specs/003-reservas-ordenes-matricula/evidence/rp003-round3-results.json).
RP004 añade [plan](specs/003-reservas-ordenes-matricula/plan.md),
[investigación técnica](specs/003-reservas-ordenes-matricula/research-rp004.md),
[modelo](specs/003-reservas-ordenes-matricula/data-model.md),
[contratos](specs/003-reservas-ordenes-matricula/contracts/integration.md) y
[guía local futura](specs/003-reservas-ordenes-matricula/quickstart.md), sin código,
SQL ni ensayos nuevos. Integra oferta/identidad mediante participantes públicos,
admisión/despacho persistidos, inventario real y snapshots históricos.
RP005 concreta [reloj/límites/worker](specs/003-reservas-ordenes-matricula/contracts/time.md)
y [25 IDs de comprobación futura](specs/003-reservas-ordenes-matricula/temporal-verification.md):
precisión exacta, instante único posterior a locks y materialización idempotente,
sin cambiar el plazo ni ejecutar pruebas. Conserva salud horaria D13 y dependencia
de pagos verificados pendientes en aquel checkpoint; RP006 lo precisa a continuación.
[Revisión documental RP005](specs/003-reservas-ordenes-matricula/evidence/rp005-results.json).
RP006 diseña [conciliación/recuperación](specs/003-reservas-ordenes-matricula/contracts/payments.md)
y [30 IDs financieros futuros](specs/003-reservas-ordenes-matricula/payment-verification.md):
recibo técnico separado del pago final atómico, iniciación incierta recuperable y
lecturas coordinadas. No es implementación, sandbox ni aprobación de cobros.
[Revisión documental RP006](specs/003-reservas-ordenes-matricula/evidence/rp006-results.json).
RV001 prepara la [matriz integrada](specs/003-reservas-ordenes-matricula/verification.md)
y RP007 las [94 tareas pendientes](specs/003-reservas-ordenes-matricula/tasks.md),
con pruebas/checkpoints y puertas externas separadas. El análisis de consistencia
no detectó contradicciones nuevas críticas/altas/medias; no acredita comportamiento.
[Revisión RV001/RP007](specs/003-reservas-ordenes-matricula/evidence/rv001-rp007-results.json).
Primer bloque recomendado de implementación: **T001–T004**.
[Revisión documental RP004](specs/003-reservas-ordenes-matricula/evidence/rp004-results.json).
La configuración por entorno y el esquema de identidad con cuatro migraciones cuentan con
[pruebas de persistencia](specs/001-identidad-acceso-roles/evidence/fundamentos-datos.md).
Las [reglas, credenciales y cuotas persistidas](specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md)
se reutilizan en US1 y US2.
Las [sesiones, autorización y protecciones HTTP](specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md)
respaldan los flujos implementados; T104/T108 conservan pendientes la observación humana
y la aceptación integral de identidad. La regresión técnica posterior está en T068.
El objetivo vigente de 2500 usuarios concurrentes activos está pendiente de validación.
Las pruebas históricas de 1000 se conservan completas, con sus fallos y límites.

El presupuesto de infraestructura y servicios es **S/300 en total**, destinado a despliegue
y pruebas necesarias, no a financiar una operación permanente. Al menos 15 000 cuentas
no equivalen a usuarios activos, peticiones en vuelo ni reservas. La capacidad configurada
por grupo es de 1–50 según PA-04 de 002; ocupación/disponibilidad no se calculan todavía.

## Oferta académica implementada

Desde **Inicio**, el administrador abre **Gestionar oferta** (`/admin/oferta`):
prepara cursos y grupos, asigna docente habilitado, configura periodo/franjas y
capacidad 1–50; publica, retira, corrige y republica explícitamente, o cancela un
grupo de forma terminal. El alumno usa **Consultar oferta** (`/oferta`) para ver
solo oferta publicada visible. El administrador puede consultar esa misma proyección.
El docente usa **Mis grupos** (`/mis-grupos`), únicamente sus asignaciones en cualquier
estado y sin gestión; el visitante no accede. Perfil, cuentas y cierre se conservan.

Backend comprueba permisos/pertenencia; la navegación no sustituye autorización.
Horarios en America/Lima, sin cruce de medianoche, con franjas contiguas permitidas.
Perder habilitación docente oculta la oferta afectada; recuperarla exige revisión y
republicación. Capacidad máxima no equivale a plazas libres: ocupación/disponibilidad
no calculadas, sin acciones de reservar, pagar o matricularse.

[Guía local](specs/002-oferta-academica/quickstart.md),
[arquitectura vigente](ops/local/architecture.md) y
[alcance y límites](docs/alcance-mvp.md). La migración 0005 es aditiva; conservar las
cuatro migraciones de identidad y seguir recuperación antes de datos persistentes.

## Ejecución local

Para reanudar el ensayo manual existente, usar su [configuración y overlay T094](specs/001-identidad-acceso-roles/quickstart.md#operación-comprobada),
conservando sus cuentas/credenciales. El arranque general siguiente corresponde a una instalación
local nueva; la [reproducción aislada](specs/001-identidad-acceso-roles/quickstart.md#reproducir-con-configuración-y-bd-nuevas)
separa configuración y datos de prueba.

Iniciar Docker Desktop con motor Linux. Crear `.env` a partir de `.env.example` con cinco
contraseñas locales y cuatro claves de identidad independientes, o generarlo sin sobrescribir archivos mediante el comando
documentado en [ops/docker/README.md](ops/docker/README.md).

```sh
docker compose up -d --build
docker compose ps
```

En una BD de desarrollo nueva, generar y aplicar las migraciones revisadas antes de usar
identidad: `docker compose exec -T api npm run db:generate` y
`docker compose exec -T api npm run db:migrate:deploy`. Para datos persistentes, revisar
primero el [procedimiento de actualización/recuperación](ops/recovery/README.md).

Web: `http://localhost:5173`; API: `http://localhost:3000/health/live`;
Mailpit: `http://localhost:18025`. PostgreSQL se publica en `127.0.0.1:55432` y SMTP
en `127.0.0.1:11025`. Las conexiones entre servicios usan `db` y `mailpit`.
Consultar [la guía Docker](ops/docker/README.md) para migraciones, pruebas, logs,
persistencia y solución de problemas. Detener con `docker compose down`, sin `-v`.

## Documentación

- [Constitución del proyecto](.specify/memory/constitution.md): principios y gobernanza.
- [Alcance del MVP](docs/alcance-mvp.md): funcionalidades previstas, exclusiones y propuesta técnica.
- [Decisiones pendientes](docs/decisiones-pendientes.md): reglas y riesgos por resolver.
- [Planificación vigente de reservas/capacidad](docs/planificacion/reservas-capacidad.md):
  24 horas confirmadas, escenarios, pendientes, VPS propuesto y continuidad de los specs.
- [Oferta académica](specs/002-oferta-academica/tasks.md): cuatro historias con evidencia automática; aceptación humana/integral pendiente.
- [Identidad, autenticación y acceso por roles](specs/001-identidad-acceso-roles/spec.md):
  primera especificación revisada, con correo verificado, recuperación por correo, un rol
  por cuenta y [checklist de calidad](specs/001-identidad-acceso-roles/checklists/requirements.md).
- [Plan técnico de identidad](specs/001-identidad-acceso-roles/plan.md): decisiones, datos,
  contratos y [guía local planificada](specs/001-identidad-acceso-roles/quickstart.md), con
  ejecución mediante Docker Compose. Los checkpoints de las siete historias están verificados;
  la aceptación transversal final sigue pendiente.

## Análisis del sistema

- [Actores](docs/01-analisis-de-sistema/01-actores.md) e [historias de usuario](docs/01-analisis-de-sistema/02-historias-del-usuario.md).
- [Requisitos funcionales y relación HU ↔ RF](docs/01-analisis-de-sistema/03-requisitos-funcionales.md).
- [Atributos de calidad](docs/01-analisis-de-sistema/04-atributos-de-calidad.md) y [restricciones](docs/01-analisis-de-sistema/05-restricciones.md).
- [Escenarios de atributos de calidad](docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md): medidas, trazabilidad y evidencia disponible.
- [Drivers arquitectónicos](docs/01-analisis-de-sistema/06-driver-arquitectonicos.md).
- [Arquitectura inicial de tres capas](docs/02-arquitectura-software/arquitectura-inicial.md): diagrama Mermaid,
  inventario, evidencia, discrepancias y pendientes. Esta síntesis enlaza el detalle existente
  en `docs/` y `specs/`, que conserva el alcance y sus criterios de aceptación.
- [Catálogo de componentes arquitectónicos](docs/02-arquitectura-software/componentes-arquitectonicos.md): responsabilidades, interfaces, estados y relaciones del backend.
- [Diseño interno de módulos](docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md): organización de identidad por capas, contratos, adaptadores y diseño académico previsto.
- [Patrones de diseño](docs/03-diseno-de-software/diseno-interno/patrones-de-diseno.md): adaptadores existentes y previstos, entrega diferida transaccional y límites de su implementación.
- [Principios de diseño](docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md): aplicaciones de SOLID, evidencia disponible y límites de los contratos y dependencias actuales.
- [Contexto del sistema C1](docs/04-modelo-c4/01-contexto-del-sistema.md): propósito, personas, sistemas externos, relaciones previstas e incertidumbres.
- [Contenedores C2](docs/04-modelo-c4/02-contenedores.md): aplicaciones, persistencia, comunicaciones y decisiones pendientes.
- [Componentes C3 del backend](docs/04-modelo-c4/03-componentes.md): responsabilidades, colaboraciones y estados dentro de APP02.
- [Código C4 de sesiones](docs/04-modelo-c4/04-codigo.md): contratos, reglas, adaptador persistido y relaciones estructurales reales.

El análisis reúne **17 historias HU y 19 requisitos RF generales del MVP**. Identidad desarrolla
una parte de ese alcance mediante **7 historias US y 33 requisitos FR detallados**; son
niveles distintos de descripción, no cifras alternativas del mismo catálogo. Véase la
[correspondencia de identidad](docs/01-analisis-de-sistema/03-requisitos-funcionales.md#correspondencia-con-el-detalle-de-identidad).

## MVP previsto

Autenticación para administrador, docente y alumno; cursos, grupos, horarios y cupos;
reserva previa de 24 h, órdenes con conceptos y total; matrículas y pagos verificados; materiales;
clases emitidas por el docente con chat para alumnos; y paneles básicos por rol.

RP003 confirma una orden desglosada, un pago total y una matrícula por curso/grupo
elegido; reserva de varios cursos toda junta o ninguna y 24 horas exactas.
La prioridad registrada por servidor, unicidad vigente por curso, matriz financiera
y vigencia de matrícula también están confirmadas. El alcance funcional está aclarado o delimitado; integración,
resolución económica antes de cobros reales, capacidad y operación siguen sus puertas.
No se atribuye implementación. **Izipay es la pasarela elegida para el MVP** desde el
2026-09-23 y sustituye a Culqi, que figuraba como candidata inicial. La integración no está
implementada; siguen pendientes tarifas finales, límites, acceso al entorno de pruebas y
habilitación de Yape para la modalidad contratada. No se asume capacidad ilimitada.
La integración del proveedor debe permanecer separada de las reglas de órdenes y matrículas
para permitir cambiar de pasarela posteriormente.

## Base técnica y componentes previstos

React, TypeScript y Vite para el frontend; NestJS como monolito modular con TypeScript;
PostgreSQL 16.14 y Prisma, con Mailpit 1.31.3 para correo local. Compose construye las
imágenes Linux de API/web con `npm ci` y conserva los datos de PostgreSQL en un volumen.
La API y la web incorporan los flujos de acceso/cierre y registro/verificación de identidad;
la oferta académica tiene sus cuatro historias verificadas automáticamente en 002, sin reservas/matrícula.

Socket.IO autorizado por clase sigue propuesto. YouTube Live con OBS es la elección
de video del MVP según DA03 y DEC01; integración y control de acceso pendientes.
Docker Desktop y WSL2 están operativos; la configuración de Compose incluye
PostgreSQL, Mailpit, API y web. Nginx y HTTPS corresponden a publicación futura.
El video, el ancho de banda y el costo requieren una prueba temprana. No se añadirán
microservicios, Kubernetes, Redis ni balanceadores sin una necesidad comprobada.

## Trabajo con Spec Kit

El repositorio contiene configuración, scripts PowerShell, plantillas y habilidades de
Spec Kit para Codex. La configuración local registra Spec Kit 1.0.9; esto no verifica la
disponibilidad de un ejecutable global. Los archivos compartibles de `.specify/` y
`.agents/skills/` ya forman parte del historial inicial.

Para cada funcionalidad pequeña:

1. Especificar con `$speckit-specify`.
2. Resolver ambigüedades con `$speckit-clarify` o documentar que no quedan aclaraciones.
3. Preparar diseño y plan con `$speckit-plan`.
4. Generar tareas con `$speckit-tasks` y revisar consistencia con `$speckit-analyze`.
5. Implementar con `$speckit-implement` y verificar los criterios de aceptación.

<details>
<summary>Registro histórico de incrementos hasta T095 (2026-10-16; no es el estado vigente)</summary>

La primera funcionalidad especificada y planificada es **identidad, autenticación y acceso
por roles**. T001–T095 están completadas, incluidos los checkpoints US1, US2, US3, US4, US5, US7 y
[US6](specs/001-identidad-acceso-roles/evidence/us6.md), con [operación del primer administrador](ops/local/first-admin.md);
T059–T061 corresponden a [escritura de pruebas US4](specs/001-identidad-acceso-roles/evidence/us4-pruebas.md);
T062–T064 incorporan [consultas, corrección de nombre y alta administrativa](specs/001-identidad-acceso-roles/evidence/us4-implementacion.md).
T065–T067 añaden [cambios de acceso y comandos HTTP](specs/001-identidad-acceso-roles/evidence/us4-cambios-acceso.md);
T068–T069 incorporan las [pantallas administrativas](specs/001-identidad-acceso-roles/evidence/us4-ui.md).
T070–T071 completan las [carreras y el checkpoint US4/V04-B](specs/001-identidad-acceso-roles/evidence/us4.md);
V04 reúne las evidencias A/B; el protocolo temporal se verifica por separado en T087.
T072–T074 añaden [pruebas de recuperación US7](specs/001-identidad-acceso-roles/evidence/us7-pruebas.md),
seguidas por [solicitud y restablecimiento en API](specs/001-identidad-acceso-roles/evidence/us7-implementacion.md)
en T075–T077. T078–T081 completan [pantallas, carreras y checkpoint US7](specs/001-identidad-acceso-roles/evidence/us7.md):
las suites originales pasan en API y navegador, con provisional vencida de docente y primer administrador.
La aceptación con participantes permanece pendiente en T104; el checkpoint técnico no la sustituye.
T082–T084 añaden [pruebas de protección y privacidad US5](specs/001-identidad-acceso-roles/evidence/us5-pruebas.md):
matriz y privacidad aprobadas. T085–T086 completan la [revisión de capas y protección web](specs/001-identidad-acceso-roles/evidence/us5-integracion.md):
guardas, limpieza tras 401 y CSP comprobadas, con los fallos previos de CORS corregidos.
T087–T088 completan la [verificación técnica US5](specs/001-identidad-acceso-roles/evidence/us5.md),
con [comparación temporal U2](specs/001-identidad-acceso-roles/evidence/enumeration.md) sin señal detectada
bajo ese protocolo. El hallazgo intermitente CLI conserva su causa no confirmada para T106.
T089–T090 añaden [pruebas de perfil, inicio y accesibilidad US3](specs/001-identidad-acceso-roles/evidence/us3-pruebas.md):
contrato `/me` aprobado y una ejecución inicial con 42 casos de interfaz aprobados y 14 fallos esperados.
T091–T093 implementan [perfil propio, inicio y presentación accesible](specs/001-identidad-acceso-roles/evidence/us3-implementacion.md):
los 56 casos originales pasan en móvil y escritorio. La [aceptación T094](specs/001-identidad-acceso-roles/evidence/us3.md)
reúne evidencia automatizada, revisión visual del agente y recorridos humanos confirmados
por Williams en ambas resoluciones. T094, V05/SC-005 y el checkpoint US3 quedan cerrados;
las cuentas y credenciales originales se conservan.
T095 incorpora [limpieza por lotes y rotación privada](specs/001-identidad-acceso-roles/evidence/retention.md),
con plazos por evento, reanudación/concurrencia verificadas y [operación documentada](ops/local/logging.md).
No se activa purga en desarrollo ni el ensayo manual. Son 95 tareas completas y 13 pendientes;
las verificaciones finales T096–T108 siguen pendientes. Para ejecutar
el entorno actual, seguir la [guía Docker](ops/docker/README.md) y la evidencia de cada
incremento; el quickstart conserva procedimientos aún previstos. La viabilidad del
video y la rúbrica de evaluación permanecen pendientes. No se han ejecutado pruebas de capacidad.

</details>

## Archivos compartidos y configuración local

Versionar documentación, especificaciones, plantillas, scripts y habilidades compartibles.
El `.gitignore` excluye secretos, archivos `.env` reales, dependencias, compilaciones,
grabaciones, respaldos y datos locales. Los archivos `.env.example` y `.env.*.example`
pueden compartirse únicamente con valores ficticios, sin credenciales.

Se conservan `.agents/skills/`, `.specify/` y el workflow manual de `.github/workflows/`,
que forman parte del proceso y las validaciones previstas. `.vscode/settings.json` solo
oculta dependencias, cachés npm/locales y reportes de pruebas en el explorador; no los
elimina ni oculta código, pruebas o documentación. Los ejemplos de entorno no contienen
credenciales y `.env`/`.env.test` permanecen fuera de Git y de las imágenes.

Desarrollo, demo y producción deben separar configuración, secretos y datos; no requieren
servidores permanentes por entorno. Las pruebas de carga usarán cuentas diferentes y pagos
simulados. La integración con la pasarela se comprobará aparte en su sandbox.
