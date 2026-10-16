# US3: aceptación de perfil, permisos y accesibilidad — T094

**Estado:** T094 `[x]`, checkpoint US3 cerrado; V05 y SC-005 satisfechos en este alcance.
**Seguimiento:** 94 tareas completas / 14 pendientes; T095–T108 no ejecutadas.
**Fecha de revisión:** 2026-10-15. **Código funcional:** `fcea452`, rama
`feat/001-identidad-acceso-roles`. `f39b988` registró la preparación con aceptación humana
pendiente; este cierre incorpora los resultados que Williams comunicó después.
Solo cambian evidencia y seguimiento documental; no cambian aplicación ni dependencias.

## Fuentes, dependencias y resultados reutilizados

Se revisaron la [constitución](../../../.specify/memory/constitution.md), [spec](../spec.md),
[plan](../plan.md), [modelo](../data-model.md), [API](../contracts/api.md), [UI](../contracts/ui.md),
[V05](../verification.md) y [quickstart](../quickstart.md#datos-y-escenarios-de-prueba).
Sin AGENTS.md aplicable ni hooks registrados; checklist documental 16/16, sin modificarlo.
T093 → T092 → T091 → T089/T090 → T088 completas; T088 reúne los checkpoints P1 anteriores.

La [escritura T089–T090](us3-pruebas.md) registró 42/56 casos de interfaz antes de implementar;
esos 14 fallos históricos no son aceptación. [T091–T093](us3-implementacion.md) resolvió
las mismas aserciones. Se contrastaron fuentes, configuraciones, diff de `fcea452` y
resúmenes locales de `.cache/us3-implementacion/`. No cambió código ejecutable desde esa
entrega: se reutilizan sus resultados válidos, sin atribuirles una nueva ejecución.
Los resúmenes indican `baseRevision: 5e20aa1` porque se probaron antes del commit;
la evidencia de implementación identifica los cambios incorporados en `fcea452`.

| Comprobación automatizada reutilizada | Resultado |
| --- | --- |
| T089: [contrato propio](../../../apps/api/tests/integration/profile.contract.spec.ts) | 18/18: ocho campos exactos de UserView, rol escalar, fechas UTC, identidad por cookie, filtros ajenos rechazados, sin secretos; 401 sin perfil. |
| T089 y regresiones HTTP | 105/105: perfil 18, login 19, consulta/cierre 20, matriz de permisos 33, privacidad 5, CLI 6 y controles bootstrap 4. |
| T090: [accesibilidad](../../../apps/web/tests/e2e/accessibility.spec.ts) | 56/56: 28 escenarios × 360×800 y 1366×768; cero fallos esperados, inesperados u omitidos. |
| [Perfil complementario](../../../apps/web/tests/e2e/profile.spec.ts) | 8/8: sesión vencida/revocada, fallo SQL y reintento explícito, nombre largo y cierre. |
| Regresiones de navegador | 133/133: acceso 21, registro 14, inicial 14, administración 20, recuperación 36, seguridad 28. |
| Lint, builds, unidad y arquitectura | Aprobados; 120/120 unitarias y arquitectura. |

Comandos y topología reproducibles en [T091–T093](us3-implementacion.md#verificación-en-docker):
HTTP/Nest y PostgreSQL reales, Mailpit, esquemas `t_*` aislados y Chromium. Se conservan
las aserciones originales. No se repiten suites, U2 ni carga para cambios documentales.

## Matriz de cierre V05 / SC-005

| Criterio | Evidencia que permite cerrarlo |
| --- | --- |
| HU3.1 / FR-010: perfil propio sin secretos | T089, T090 y perfil complementario; Williams confirmó datos propios, lectura sin edición, recarga y limpieza tras logout para los tres roles. |
| HU3.2 / FR-011–012: un rol, único inicio, enlaces autorizados, sin selector multirol | T089/T090 y matriz HTTP de 33 casos; [US5](us5.md) conserva denegaciones sin datos ni efectos. Williams confirmó gestión solo ADMIN y acceso directo denegado al alumno/docente. |
| HU3.3 / FR-021 / SC-005: flujos a 360×800 y 1366×768 | T090 recorre registro/verificación/reenvío, acceso/cierre, inicio/perfil, provisional/contraseña propia, recuperación y administración. Williams confirmó los recorridos guiados detallados abajo en ambos tamaños. Sin scroll horizontal de página en los estados comprobados. |
| HU3.4 / FR-021 / SC-005: teclado, etiquetas, foco, errores con texto y ninguna acción solo hover | T090 usa Tab, Enter y teclas de selección; [arnés](../../../apps/web/tests/support/accessibility.ts) verifica nombre accesible, foco pintado dentro de pantalla y descripciones textuales. Confirmación humana de teclado, etiquetas, foco y ausencia de scroll horizontal en los recorridos indicados. |
| Validación manual mínima del quickstart aplicable a T094 | Reportes reales de Williams: registro/verificación/login/perfil/logout, recuperación con dos sesiones, alta/activación de docente y administración con desactivación/acceso denegado. No se atribuye esta aceptación a Playwright. |

## Revisión visual adicional del agente

Se inspeccionaron diez capturas: registro vacío con errores, inicio ADMIN, perfil ADMIN,
listado y confirmación administrativa, en ambos tamaños. Texto largo ajustado, perfil
apilado en móvil, tarjetas legibles, errores textuales y contorno de foco visible; sin
recortes horizontales ni superposición. El scroll vertical es esperado. Esta inspección
del agente no es una revisión humana ni un lector de pantalla, y no cubre visualmente
cada estado de las 56 pruebas.

Captura con Playwright y `us1-fixture`, fuentes de `fcea452`, API compilada y esquemas
nuevos: **2/2 recorridos**, 28,2 s, sin fallos ni omisiones; `controlsAccessible` antes
de cada captura. El primer arranque falló por un montaje de solo lectura; se corrigió
montando una copia temporal completa de las pruebas. No se cuenta ese error como prueba
funcional. Capturas y arnés en `.cache/us3-aceptacion/`, ignorados, sin contraseñas.

## Evidencia humana comunicada por Williams

**Responsable:** Williams. **Fecha declarada:** 15/10/2026. **Navegador declarado:** Chrome
156.0.8078.35/36. **Código confirmado:** `fcea452`. **Zoom:** 100 %.
**Resoluciones:** 360×800 y 1366×768. Estos datos fueron aportados al comienzo y el código
se reconfirmó en el recorrido docente; las confirmaciones posteriores continúan la misma
sesión guiada sin comunicar cambios de contexto. No se inventan horarios ni mediciones.

Se conservan como evidencia los reportes y aclaraciones expresos de esta conversación.
El primer reporte traía «[360×800 o 1366×768]»: Williams aclaró que hizo las pruebas en
cada una. El reporte docente omitía código y permisos: los confirmó expresamente después.
Las aceptaciones siguientes corresponden a los pasos propuestos para ambos tamaños;
no se deducen conductas ajenas a esos pasos. No hubo fallos finales comunicados, salvo
la incidencia de destinatario externo registrada abajo antes de continuar.

| Recorrido humano confirmado en ambas resoluciones | Resultado comunicado y alcance |
| --- | --- |
| 1. Registro → Mailpit → confirmación → login → perfil → recarga → logout → `/perfil` | Informe detallado sin fallos: error textual al enviar vacío, Tab/Shift+Tab/Enter, foco/etiquetas/controles accesibles, Alumno sin gestión, datos correctos tras recargar y redirección a login sin datos tras logout; sin scroll horizontal. |
| 2. Inicio/perfil docente y permisos | Perfil/recarga/logout y accesibilidad correctos. A la aclaración sobre `fcea452`, cuenta/rol Docente sin «Gestionar cuentas» y acceso directo a `/admin/cuentas` denegado sin datos ni acciones, respondió «Si» a los tres puntos. |
| 3. Inicio/perfil ADMIN y consulta | «todo estuvo correcto en el recorrido»: identidad/Administrador, enlaces de perfil/gestión/cierre y sin selector multirol; perfil propio de solo lectura sin secretos, recarga, listado permitido, logout y teclado/foco/layout correctos. Sin modificar cuentas en ese recorrido. |
| 4. Alumno contra administración directa | Informó «acceso denegado y vuelve a inicio»; confirmó después la comprobación en ambos tamaños sin mostrar cuentas ni acciones administrativas. |
| 5. Alta y activación docente, sustitución inicial | Tras crear la cuenta de prueba y recibir Mailpit, confirmó los cinco pasos: cerrar ADMIN y verificar correo; provisional rechazada por login ordinario; errores textuales al enviar establecimiento vacío; nueva contraseña distinta, confirmación sin auto-login; login Docente/perfil/cierre. Teclado/foco/layout correctos, con cuentas distintas para cada tamaño. |
| 6. Recuperación y dos sesiones | «si todo correcto hasta aca» sobre siete pasos: dos sesiones independientes; solicitud desde un tercer contexto con error al enviar vacío; Mailpit; errores en reset vacío/confirmación diferente; reset válido sin auto-login; ambas sesiones anteriores rechazadas al recargar; contraseña anterior rechazada y nueva aceptada, cierre. Teclado/etiquetas/foco/layout correctos. |
| 7. Gestión administrativa | «si todo correcto» sobre ocho puntos: paginación a 10 con Siguiente/Anterior; alta vacía con errores y cerrar alta; búsqueda por correo y filtros Docente/Activo; nombre vacío con error y nombre válido persistido tras recargar; cancelar cambio de rol conserva Docente, confirmar cambia a Alumno y restaurar a Docente; sesión docente nueva; desactivar impide recarga y login; reactivar no restaura sesión previa y permite login nuevo. Teclado/foco/mensajes/layout correctos. |

**Aceptación humana de T094 completa con esos reportes.** El reenvío y otros estados de
error adicionales conservan su evidencia automatizada; no se les atribuye observación
humana que no se comunicó. Esta revisión no es el estudio de diez participantes de T104,
ni una auditoría completa de accesibilidad o una prueba con lector de pantalla.

## Entorno manual e incidencia de correo

Web `http://localhost:5173`; Mailpit `http://localhost:18025`. El
[ensayo manual conservado](../../../ops/local/manual-us1.md) mantiene esquema y secretos.
Para servir `fcea452` se añadió `.cache/docker/compose.manual-t094.yml`, ignorado: monta
`apps/api/src`, `apps/web/src`, `apps/web/index.html` y `apps/web/vite.config.ts` en sus
rutas `/workspace/…`, de solo lectura; API compila antes de ejecutar su `dist/src/main.js`.
No reconstruye imágenes ni reinicializa datos. Reanudación:

```powershell
docker compose -f compose.yml -f compose.override.yml -f .cache/docker/compose.manual-us1.yml -f ops/docker/compose.manual-ports.yml -f .cache/docker/compose.manual-t094.yml up -d --no-build --wait api web
```

Durante el alta se usó un destinatario de dominio externo sin entrega. Diagnóstico de
solo lectura: cuenta TEACHER ACTIVE no verificada, cambio inicial pendiente, token vigente;
entrega PENDING con dos intentos, TEMPORARY y sin sentAt; API ready y Mailpit con 200.
El [transporte](../../../apps/api/src/modules/mail/infrastructure/smtp-transport.ts)
rechaza en modo capture destinatarios que no terminen en `@example.test` antes de conectar,
como documenta la [guía Docker](../../../ops/docker/README.md). El ejecutor clasifica ese
error como TEMPORARY; no se cambió el código ni esa clasificación. Se conservó la cuenta.
Williams confirmó la llegada al usar un destinatario ficticio `@example.test` y luego
la activación completa. No se cuenta el intento externo como una entrega aprobada.

## Conservación, límites y siguiente bloque

Se conservaron cuentas, credenciales y volúmenes. Tras los recorridos humanos se comparó
la huella de **las 12 filas User originales y su archivo privado** con la inicial:
**idéntica**. Se seleccionó únicamente el lote original; las cuentas nuevas usadas para
alta/reset/cambios de acceso no entran en esa comparación y se conservan también.
Cuatro servicios healthy; salud API, web y Mailpit habían respondido 200 con las fuentes
actuales. La inspección inicial de conservación asumió erróneamente 12 entradas en el
archivo privado (contiene tres credenciales habilitadas y el ID del lote de 12 cuentas);
se corrigió la selección por ese lote y la comparación final pasó, sin mutaciones.

El fallo previo de revisión automática de permisos fue por límite de uso; al funcionar
de nuevo se encontró Docker detenido, se reanudó y se completaron las lecturas. No queda
ninguna comprobación de conservación pendiente ni se imprimieron secretos.

El [hallazgo intermitente de bootstrap](us5.md#hallazgo-intermitente-de-bootstrap-cli)
permanece **abierto, causa no confirmada**, seguimiento **T106**. No se resuelve por estas
regresiones aprobadas ni por ausencia de nuevas reproducciones; no se ejecutó bootstrap
durante los recorridos humanos. Su unicidad corresponde a V08/US6 y conserva [evidencia](us6.md).

V05/SC-005 y US3 quedan cerrados en T094. No quedan intervenciones humanas pendientes
para T094. T104/SC-001/SC-010 requieren su estudio separado de diez participantes;
retención, restauración, invalidación global, carga y medición temporal conservan sus
propias tareas. El siguiente bloque recomendado es **T095**, sin ejecutarlo aquí.

Comprobados **367 enlaces locales**, incluidas anclas, **108 IDs únicos** y que la única
casilla cambiada es T094 (94 completas / 14 pendientes). `git diff --check` sin errores.
El commit se limita a esta evidencia y su seguimiento en tasks.md, verification.md y README.md.
