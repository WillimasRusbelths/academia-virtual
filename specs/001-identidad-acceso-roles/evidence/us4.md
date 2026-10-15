# US4 · Gestión mínima de cuentas

Fecha: 2026-10-15. Rama `feat/001-identidad-acceso-roles`; base `f40ec90`.
**Checkpoint funcional T071 aprobado:** gestión mínima de cuentas protegida.
Alcance: FR-013–021/025, V04-B, V06–V08 y parte administrativa de V15.

## Seguimiento y comprobaciones

| Tarea | Evidencia y resultado |
| --- | --- |
| T068–T069 | [UI administrativa](us4-ui.md), conservada sin cambios; 20 recorridos Chromium repetidos satisfactoriamente para este checkpoint. |
| T070 | [Revocación](../../../apps/api/tests/integration/admin-revocation.spec.ts): 13 casos originales y siete carreras nuevas. [Auditoría](../../../apps/api/tests/integration/audit.spec.ts): 39 casos anteriores y 19 sobre rutas administrativas reales. |
| T071 | Suites originales, regresiones, inspección persistida y límites detallados abajo; aceptación limitada a gestión mínima, sin recuperación ni edición general de cuentas. |

Las carreras usan PostgreSQL real y barreras exclusivamente de test. Dos ADMIN activos
intentan retirarse mutuamente: rol/rol, estado/estado y rol/estado. Ambas solicitudes
alcanzan el lock de gobierno antes de liberarlo; solo una confirma, la otra recibe 401
tras perder su autorización. Permanece un ADMIN activo, una sola transición de versión
y un AuditEvent atribuible; ambas sesiones retiradas se rechazan después del commit.
El observador sigue la cola transitiva de bloqueos fuera de la transacción retenida.

Login queda detenido dentro de la verificación de credenciales, después de Argon2 y
antes de confirmar sesión. Un cambio de rol o desactivación concurrente impide crear
una sesión con la versión antigua. Confirmación de correo y desactivación se prueban
en ambos órdenes: antes del lock del usuario y con la confirmación reteniendo el lock
antes del commit. La cuenta termina desactivada; consumedAt/revokedAt siguen excluyentes,
no aparecen sesiones y el enlace no vuelve a servir.

Se inspeccionan sesiones, versión, ambos propósitos de ActionToken y entregas pendientes:
desactivar revoca acciones no consumidas y cancela correo borrando payload/claim; reactivar
no rescata sesiones ni enlaces. RESET_PASSWORD es un fixture de persistencia, no un flujo
de recuperación implementado. El fallo provocado al insertar AuditEvent revierte cuenta,
versión, sesiones, token y entrega; un evento confirmado no se pierde por otra denegación.

Las rutas reales de detalle/nombre/rol/estado rechazan por igual UUID conocidos y
desconocidos para alumno/docente, con logger operativo o fallido: 403 idéntico salvo
correlación aleatoria, mismas consultas de sesión, sin consulta del destino, mutación ni
AuditEvent/FK de denegación. Los registros privados tienen esquema/motivo equivalentes
y referencias UUID sin resolver. Los éxitos registran únicamente campos permitidos,
actor/destino, correlación y transición; NO_CHANGE no guarda valores personales.

**Corrección acotada:** el [filtro HTTP](../../../apps/api/src/http/error.filter.ts)
registra también los 409 administrativos como ADMIN_COMMAND_REJECTED; antes no emitía
ese hecho. Un logger fallido conserva el 409 y el estado. No se modifican reglas de
dominio, permisos, contratos, migraciones ni dependencias productivas. El harness admite
el logger por la composición existente, sin endpoints ni accesos especiales.

## Resultados en Docker

| Comprobación | Resultado final por suite |
| --- | --- |
| T059 original | admin-users.contract: 62/62. |
| T060 ampliada / T070 | admin-revocation: 20/20, incluida la revisión final del aislamiento de las barreras. |
| Auditoría / cambios de acceso | audit: 58/58; access-change: 12/12. |
| Regresiones API US1 | login.contract: 19/19; session-lifecycle: 15/15. |
| Regresiones API US2 | registration.contract: 45/45; registration-concurrency: 13/13. |
| Regresiones API US6 | bootstrap-cli: 6/6; initial-password: 21/21. |
| T061 original y UI adicional | 12/12 y 8/8 en Chromium. |
| Regresión Chromium US1 | 21/21; incluye V04-A. |
| Unitarias y arquitectura | 107/107: API 62, web 45. |
| Lint / compilación | Ambos workspaces aprobados; lint API repetido tras ajustar las barreras. |

Son 271 comprobaciones API distintas, 41 de navegador y 107 unitarias/arquitectura;
no una medición de carga. Las suites se ejecutan en contenedores transitorios con fuentes,
tests y package.json actuales montados, migraciones desplegadas en esquemas nuevos `t_*`
y Mailpit local. No se omiten casos ni se debilitan aserciones.

El ensayo inicial detectó un error del observador de bloqueos (snapshot retenido y cola
indirecta), corregido sin cambiar el resultado exigido. Una ejecución paralela también
dio dos 503 en el ensayo de 20 registros y dejó una suite sin casos ejecutados. Las suites
afectadas se repitieron sin cargas compartidas, con `--maxWorkers=1`: 45/45. Estos resultados
no acreditan capacidad bajo contención ni sustituyen las verificaciones de carga finales.

Para reproducir, usar el montaje de fuentes y entorno descrito en [UI](us4-ui.md#entorno-y-reproducción)
y [operación Docker](../../../ops/docker/README.md), compilar API y ejecutar desde apps/api:

```sh
npx vitest run tests/integration/admin-users.contract.spec.ts tests/integration/admin-revocation.spec.ts tests/integration/audit.spec.ts tests/integration/access-change.spec.ts --maxWorkers=1
```

Desde apps/web, las configuraciones playwright.admin-users.config.ts y
playwright.identity.config.ts ejecutan los recorridos indicados. No se guardan trazas,
vídeos ni capturas automáticas de secretos; los reportes crudos quedan en `/tmp` del
contenedor transitorio. No se instalan herramientas ni se reconstruye el ensayo manual.
Docker Desktop se inició con su instalación existente y los cuatro servicios quedaron
saludables, sin recrearlos. La comparación privada antes/después confirmó el mismo esquema,
sus 12 cuentas y su huella de datos/credenciales. No se ejecutó bootstrap ni limpieza sobre
el ensayo manual o desarrollo, ni se cambiaron sus imágenes/configuración.

## Alcance del checkpoint y pendientes

| Verificación | Alcance comprobado y límite |
| --- | --- |
| V04-B | Nombre/rol/estado: expiración por 30 minutos inactivos u ocho horas absolutas entre formulario y envío; 401, cero cambios/auditoría, limpieza de UI y ningún replay tras otro login. |
| V04 | Se reúnen V04-A de [T039](us1.md) y su regresión actual, y V04-B. No cierra por sí solo SC-002: protocolo temporal T087 y regresión final T106 siguen pendientes. |
| V06 | Buscar, alta con rol único, provisional privada/24 h y sustitución obligatoria, verificación, duplicado 409 sin overwrite y corrección de nombre; evidencia compartida con [US6](us6.md). Recuperar una provisional vencida espera T081. |
| V07 | Revocación de dos sesiones por cambio efectivo, reactivación sin rescate y revalidación del actor antes de confirmar. Todas las solicitudes ensayadas recibidas después del commit son denegadas. |
| V08 | Invariantes propias y retiros simultáneos comprobados aquí, junto con inicialización única/repetición/concurrencia de [US6](us6.md). |
| V15 parcial | Login frente a rol/desactivación y confirmación frente a desactivación. Login frente a reset y demás carreras de recuperación esperan US7/T080–T081. |

Los recorridos administrativos incluyen alta → Mailpit → verificación → sustitución
inicial → login, filtros/paginación/corrección a 360×800 y 1366×768, confirmación/cancelación,
409 propio, 403 directo y pérdida de permisos al enviar, 503 con reintento manual y respuesta
de alta perdida sin segunda creación. La revisión visual de T068–T069 sigue vigente:
no cambió la UI. Las pruebas automatizadas no son aceptación humana.

T070/T071 no requieren aprobación personal para su checkpoint técnico. La observación
humana T104 (diez participantes, registro/recuperación) conserva su dependencia T094 y
permanece pendiente, igual que accesibilidad transversal, retención/purga, restauración,
mediciones temporales y 1000 concurrentes. No se adelantan sus verificaciones.

Se conserva monolito por capas y Clean Architecture; los cambios productivos se limitan
al adaptador HTTP de errores. La coordinación y las transacciones existentes permanecen
en aplicación/infraestructura y las reglas puras en dominio. No se redibujan diagramas.
Siguiente bloque: T072–T074, escritura de pruebas US7; todavía no implementar recuperación.
