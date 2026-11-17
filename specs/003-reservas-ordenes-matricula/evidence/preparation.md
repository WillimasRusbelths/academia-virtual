# Preparación — T001: inventario y puntos de integración

El registro T001 siguiente es histórico. La continuación T002–T004 y sus resultados
se documentan al final de este archivo.

Fecha: 2026-10-31, America/Lima. T001 completada documentalmente; T002–T004 pendientes.
Traza: FR-022. El responsable autorizó continuar exclusivamente T001 después de
informarle que el checklist mantiene cuatro casillas pendientes (12/16).
Se conserva ese checklist; esta excepción no aprueba la funcionalidad completa.

## Base reproducible y preservación

- Rama: `feat/003-reservas-ordenes-matricula`.
- Commit de partida: `533b4b618b7d1ad972741e855d67d3fbb14e5a0f`.
- Estado inicial: Git limpio; 702 archivos versionados registrados por ruta y SHA-256
  en [inventory.json](inventory.json). Las huellas corresponden a los bytes locales,
  incluidos sus finales de línea; no asumir identidad con un checkout que los convierta.
- Rama de oferta preservada: `adca8e6d6d3bafe66906a513dd4923de37df8c84`.
- Manifiesto privado: `.cache/reservas-t001/protected-before.json`, ignorado por Git.
  Conserva 72 archivos del manifiesto histórico de RV001/RP007 y añade la configuración
  existente `.env`/override de la copia aislada: 74 archivos en total. La comparación
  previa confirmó que los 72 seguían idénticos a ese checkpoint histórico.
- El manifiesto público contiene solo archivos versionados, scripts públicos y
  conteos privados. Contenido, rutas de claves y hashes de secretos quedan privados.
- La captura usa creación exclusiva (`wx`): una repetición no sobrescribe el inventario
  ni el manifiesto. Las comprobaciones posteriores son de solo lectura.

El cambio permitido se limita a este informe, inventario, verificador y el estado de
T001 en [tasks.md](../tasks.md). Se conservan spec/quince respuestas, plan, contratos,
constitución 1.2.1, código, configuración, evidencia 001/002 y migraciones históricas.

## Contratos e integración del código existente

Las rutas siguientes se inventarían tal como existen, sin ampliar sus capacidades.
Las superficies `public` tienen hashes individuales en inventory.json.

| Superficie actual | Uso previsto en 003 / límite |
| --- | --- |
| `authorization/public/session.ts` | SessionActor, Permission, SessionRepository y fallos de autorización. Revalidar dentro de la misma transacción por composición; no añadir PoolClient a la interfaz pública. |
| `users/public/account.ts`, `user-view.ts`, `teaching-directory.ts` | Roles/estado, proyección de cuenta y elegibilidad docente. Sin exponer credenciales ni importar infraestructura entre módulos. |
| `identity/public/access.ts` | Acceso de identidad existente; conservar sesiones, revocación y sus contratos. |
| `academic-offering/public/offer.ts` | DTO de catálogo/administración/docencia, revisiones y errores. Ocupación/disponibilidad permanecen null y NOT_CALCULATED en 002. |
| `mail/public/delivery.ts`, `retention.ts` | Entrega y retención existentes; no constituyen integración de pagos. |
| `apps/api/src/app.module.ts` | Composición del pool, sesiones y escritores/lectores de oferta. Ensamblar aquí los futuros participantes; no importar adaptadores desde el núcleo de enrollment. |
| `infrastructure/database/account-transaction.ts`, `academic-transaction.ts` | Unidad de trabajo existente, locks/recheck y presupuesto de reintentos. accountTransaction limita a tres intentos, lock_timeout 3 s y abortos conocidos; no reintentar COMMIT ambiguo a ciegas. |
| `academic-offering/infrastructure/offering-store.ts` | Escritores de preparación/publicación/ciclo de vida; futuro guard de compromisos bajo los mismos locks y cliente antes de reservas. |
| `academic-offering/domain/schedule.ts` | Predicado existente schedulesOverlap; futura exposición pública propia, evitando importar el dominio de oferta desde enrollment. |
| `http/error.filter.ts`, `infrastructure/logging/security-events.ts` | Proyecciones seguras de errores y logs; futuras allowlists específicas sin payload financiero. |
| Web: `shared/api-client.ts`, `app/http.ts`, `app/router.tsx` | Transporte, errores y navegación existentes; futura feature separada con DTO cerrados y autorización backend. |

Las rutas abreviadas del backend pertenecen a `apps/api/src/modules/` salvo
`infrastructure/`, `http/` y AppModule, bajo `apps/api/src/`.

Contratos de diseño inventariados: [API](../contracts/api.md),
[integración](../contracts/integration.md), [tiempo](../contracts/time.md),
[pagos](../contracts/payments.md) y [UI](../contracts/ui.md).
Todavía faltan `enrollment/public/{enrollment,commitments,payments}.ts`,
`academic-offering/public/{reservation-boundary,schedule}.ts` y la integración de
enrollment en AppModule. Su enumeración no acredita implementación.

## Migraciones y scripts

Se verifican exactamente cinco migraciones de producto, con SHA-256 en inventory.json:

1. `0001_identity_users`.
2. `0002_identity_access`.
3. `0003_identity_mail_limits`.
4. `0004_identity_argon2_format`.
5. `0005_academic_offering`.

Su raíz es `apps/api/prisma/migrations/`; `migration_lock.toml` y schema.prisma
también quedan en la base completa. La migración de compatibilidad
`ops/local/compatibility/prisma/migrations/0001_probe` se registra aparte por ruta:
no es una sexta migración de producto. No se genera ni aplica SQL en T001.

inventory.json conserva el mapa exacto de scripts de los tres package.json:
lint/build, UNIT/arquitectura, integración, crypto-mail, E2E, probe y generación/
migraciones. Su existencia no implica que se ejecutaran. `admin:bootstrap` está
inventariado, pero no se utiliza para preparar fixtures.

Soportes reutilizables: `apps/api/tests/support/identity-database.ts`,
`locks.ts`, `academic-offering.ts`, `test-environment.ts` y
`apps/web/tests/support/academic-offering-fixture.ts`. identityDatabase usa entorno
test y schema propio; sus migraciones/limpieza se ejecutarán solo en tareas posteriores.
Los futuros soportes enrollment y playwright.enrollment.config.ts todavía no existen.
El tsconfig API excluye tests de dominio; el web incluye src/vite.config.ts,
sin cubrir todos los soportes/configs. T004 deberá comprobar esos tipos expresamente.

## CI y archivos ignorados

`.github/workflows/v00-linux.yml` se dispara manualmente o por PR a main, en
ubuntu-24.04, con timeout de 20 minutos y proyecto Compose efímero por ejecución.
Incluye lint/build, UNIT/arquitectura, migraciones/permisos, PG/HTTP, crypto-mail y
E2E de identidad/oferta. No existe paso enrollment. No se ejecuta CI local ni remoto aquí.
Su creación de entorno efímero no autoriza reconfigurar la copia aislada existente.

Se revisaron `.gitignore`, `.dockerignore` y los flat configs ESLint de ambos workspaces:
cubren los artefactos actuales y no requieren cambios para T001. Los tres paquetes
son privados; no procede añadir npmignore. No hay cambios de dependencias o lockfile.

## Entorno y pendientes heredados

La [guía](../quickstart.md) identifica `.cache/academic-offering-validation/source`,
proyecto `academic-offering-fa3d46bddbb8` y volumen propio `_postgres_data`.
T001 preserva los archivos locales de configuración de esa copia. **No comprueba
estado vivo, salud PostgreSQL, mounts, puertos, cuentas ni configuración efectiva**;
son criterios de T002. No se opera `academia-local` ni Docker en este bloque.

Se conservan pendientes T104/T108 de identidad, T073/T074 de oferta y bootstrap.
T103 sigue completa por ejecución/informe, con capacidad sin aprobar.
INV-DOC-01, timeouts históricos de arquitectura/B02/D10 E2E, CI remoto y SMTP externo
mantienen su estado documentado; no se reevalúan ni cierran con este inventario.
D02/sandbox, política económica antes de cobros reales, D10/capacidad, D13/operación
y aceptación humana siguen pendientes en sus etapas.

## Verificación ejecutada y reproducción

Desde la raíz del repositorio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks
node specs/003-reservas-ordenes-matricula/evidence/inventory-check.mjs --require-private
git diff --check
```

El verificador [inventory-check.mjs](inventory-check.mjs) exige el checkpoint Git
original y lee el manifiesto privado con `--require-private`. Sin ese flag, un equipo
sin manifiesto podrá verificar solo la base pública y lo indicará explícitamente.
Después de un commit posterior, consultar este checkpoint en una copia de revisión;
no regenerar ni rebautizar esta evidencia como inventario de una versión nueva.

Resultados: prerrequisitos correctos para spec003; 701/702 archivos iniciales
idénticos y el único restante (tasks.md) con cambios exactos de cabecera/T001;
74/74 archivos protegidos idénticos, cinco migraciones conservadas, quince respuestas
y checklist 12/16 intactos. Una tarea completada y 93 pendientes. `git diff --check`
sin errores. No existen hooks before/after_implement en esta base.

Control auxiliar privado: `node .cache/reservas-t001/review-public.mjs`, salida 0;
nueve enlaces locales comprobados sin roturas y 54 comparaciones de valores sensibles
locales contra los tres artefactos públicos sin coincidencias. Ese control limitado
no publica valores ni huellas privadas. `node --check` del verificador también sale 0.

Incidencias de herramientas: el primer lanzamiento directo del script PowerShell
fue bloqueado por ExecutionPolicy; se ejecutó con Bypass limitado al proceso.
La captura Node no pudo lanzar Git dentro del sandbox (EPERM); la repetición con
escalación autorizada terminó correctamente. Ninguno fue un fallo de producto.
Una invocación inline del control auxiliar tuvo un error de sintaxis; se corrigió
en review-public.mjs y se ejecutó el archivo correctamente, sin cambios de producto.

No se ejecutan suites de producto, tipos/build ni cargas por este cambio documental.
El control es de inventario/preservación, sin afirmar reservas, pagos o matrícula operativos.

## Siguiente bloque propuesto

T002–T004, en orden: acreditar y reanudar exclusivamente el entorno aislado existente;
preparar fixtures ficticias propias con limpieza solo de su schema; preparar runner
Playwright, tipado selectivo y lint con un control de infraestructura ejecutado.
Si el destino/configuración discrepan o falta PostgreSQL, mantener T002 pendiente.
Ese bloque no se ha ejecutado ni se adelantan fundamentos T005–T022.

## Continuación ejecutada — T002–T004

Fecha: 2026-10-31, America/Lima. El responsable autorizó el siguiente bloque tras
recibir el cierre T001. Base Git conservada `533b4b618b7d1ad972741e855d67d3fbb14e5a0f`,
con los cambios locales T001 preservados. Checklist 12/16 sin modificaciones.
T002 acredita el [destino real](environment.md); T003/T004 preparan y verifican
infraestructura, sin implementar reglas, rutas ni tablas financieras nuevas.

### Fixtures y límites

`apps/api/tests/support/enrollment.ts` reutiliza academicOfferingDataset, que usa
identityDatabase y su observador independiente. Cada dataset contiene 15 cuentas
ficticias y cuatro actores distintos: titular, otro alumno, administrador y docente.
Se preparan dos cursos/grupos con franjas: uno visible y otro oculto por su padre
retirado. Se comprueba la visibilidad con HTTP real de oferta 002; el catálogo mantiene
null/null/NOT_CALCULATED. No hay bootstrap, cuentas manuales, reset o limpieza global.

UNPRICED/AWAITING_PAYMENT/EXPIRED/APPLIED/INCIDENT son **etiquetas de escenarios de
preparación** por dataset, con intención/commandId propios. `financial.persisted=false`
explicita que no hay estado financiero sembrado, respuesta simulada ni pago exitoso.
Las tablas y sus filas reales requieren T007/T008 y los soportes posteriores.
Dos datasets con etiquetas diferentes se ejecutaron en schemas t_ distintos;
eso prueba aislamiento del soporte, no reglas de estados, reserva o conciliación.

`apps/web/tests/support/enrollment-fixture.ts` extiende el harness académico existente:
API/AppModule real, Vite loopback exclusivo y cleanup del schema propio. locks.ts
se usa solo en Vitest para detectar bloqueo real desde el observador; Playwright
no importa Vitest. Se probó que limpiar un dataset conserva el segundo y que bootstrap
no se consumió. Estado de schemas t_: cero antes y cero al terminar.

### Runner y tipos

`playwright.enrollment.config.ts` selecciona enrollment-*.spec.ts, hereda un worker,
cero retries y sin reutilización de servidor manual; ejecuta escritorio y Pixel 7.
Trace, screenshot y video permanecen desactivados. No hay mocks HTTP ni endpoints
financieros añadidos. Es un caso E2E de infraestructura repetido en dos dispositivos.

Se añadieron scripts `test:e2e:enrollment` y `typecheck:enrollment` en el package.json
web. Lint incluye explícitamente la nueva configuración; el flat config ESLint
existente ya cubre los soportes/tests y no requiere edición.
`apps/web/tsconfig.enrollment.json` incluye la configuración, fixture/caso web y
fixture/caso API, con sus imports transitivos. Se confirmó por `--listFilesOnly`
que también incluye identity-database.ts, academic-offering.ts y locks.ts.

### Comandos y resultados reales

Auxiliar privado ignorado: `.cache/reservas-t002-t004/run.ps1`. Todas las acciones
usan los argumentos Compose explícitos documentados en environment.md y validan
el destino antes de operar. Invocación:
`powershell -NoProfile -ExecutionPolicy Bypass -File .cache/reservas-t002-t004/run.ps1 -Action <acción>`.

| Acción / comando | Resultado |
| --- | --- |
| config, up, inspect | 0; volumen existente y mounts propios, cero puertos y DB/Mailpit saludables |
| sync | 0; 708 archivos de fuente con hashes en source-manifest.json privado; no copia env/secretos/manual |
| build | 0; API, web y browser-tests reconstruidos desde la fuente sincronizada |
| checks: `npm run lint && npm run build && npm run typecheck:enrollment --workspace @academia/web` | 0; ambos workspaces y tipos selectivos correctos |
| api: Vitest enrollment-harness.spec.ts, maxWorkers=1 | 0; 4/4 casos, 43.41 s de runner |
| discovery: Playwright enrollment config con --list | 0; un caso encontrado en dos proyectos |
| browser: `npm run test:e2e:enrollment --workspace @academia/web` | 0; 2/2 ejecuciones, 16.5 s, sin retries |
| Consulta PostgreSQL de schemas t_ antes/después | 0; conjuntos idénticos y vacíos, limpieza completada |
| stop | 0; solo DB/Mailpit aislados detenidos, volumen con fecha de creación original conservado |

Adicionalmente, tipos selectivos y lint de los cinco archivos TS nuevos pasaron
en el host. Un primer intento de lint API apuntó al node_modules del workspace;
se corrigió la ruta al node_modules raíz y pasó. No fue un fallo de producto.

Casos únicos: cuatro de infraestructura API (guarda de entorno, datasets/limpieza,
identidad/oferta HTTP y bloqueo PostgreSQL) y uno E2E (readiness, sesión propia,
oferta visible/oculta, perfil y teclado). Total: cinco casos únicos, seis ejecuciones;
móvil/escritorio no cuentan como casos únicos adicionales. No se ejecutaron TV/PV
de negocio, UTC/Lima, sandbox, carga ni aceptación humana.

Imágenes verificadas, hashes de fuente, comandos y límites en
[t002-t004-results.json](t002-t004-results.json). La reconstrucción generó clientes
y compilaciones dentro de imágenes; solo se aplicaron las cinco migraciones existentes
en schemas de cada fixture, sin una migración nueva ni aplicación al entorno manual.

Muestras auxiliares DB/Mailpit antes: 46.98/21.54 MiB y CPU 0/0 %;
después: 62.68/23.82 MiB y CPU 8.87/0 %. Límite visible del motor 6.74 GiB.
Son dos muestras puntuales; reconstrucción/checks coexistieron con parte del ensayo API.
No acreditan picos, capacidad, latencia comercial ni aislamiento físico del generador.

Verificación final privada: `node .cache/reservas-t002-t004/review.mjs` compara
la base, 74 archivos protegidos, manifiesto de fuente, enlaces y valores sensibles
sin publicarlos. Conserva todos los archivos iniciales salvo los tres cambios previstos
(package.json web, tasks.md y este informe), más los nuevos artefactos del bloque.
El verificador T001 conserva su alcance histórico y no se rebautiza para este checkpoint.
Sin hooks before/after_implement registrados.

Resultado final del control: PASS; 702 archivos iniciales fuera del cambio idénticos,
74/74 protegidos conservados, 708 archivos en el manifiesto de fuente y 24 enlaces
locales sin roturas. Se realizaron 198 comparaciones de valores sensibles sin
coincidencias; `git diff --check` sin errores.

T001–T004 completadas; 90 tareas pendientes. D02/economía/D10/D13, bootstrap,
INV-DOC-01, humanos001/002, SMTP y CI remoto mantienen su estado anterior.
Siguiente bloque propuesto: T005/T006, pruebas de tiempo/dinero y evolución aditiva;
T007/T008 posteriores para modelo/migración aislada. No se avanzó a fundamentos.
