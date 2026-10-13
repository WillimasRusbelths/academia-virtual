# T028 — Fundamento de bootstrap atómico

**Fecha:** 2026-10-13. **Rama:** `feat/001-identidad-acceso-roles`.
Dependencia T027 comprobada en [auditoría y privacidad](auditoria-privacidad.md).
Alcance: operación persistida del primer administrador; no completa US6 ni V08.

## Implementación y criterios

| Criterio de T028 | Implementación y comprobación |
| --- | --- |
| Inicialización única | `requireUninitialized` evalúa la marca y la presencia de cualquier ADMIN, incluido DISABLED. El adaptador bloquea SystemState antes de consultar administradores; singleton ausente falla cerrado. |
| Credencial inicial | Entrada preparada mediante las reglas de cuenta y `hashNewPassword`/Argon2id existentes. Crea ADMIN ACTIVE con correo pendiente, `passwordHash=null`, `mustSetPassword=true`, versión 0 y provisional válida por 24 h desde el reloj de BD. Las pruebas verifican la credencial real, rechazo de otra y caducidad exacta; no habilita acceso de aplicación. |
| Atomicidad | Cuenta, AuditEvent SYSTEM_BOOTSTRAP/APPLIED, marca irreversible y, con cuota, ActionToken VERIFY_EMAIL y MailDelivery PENDING comparten un commit. Lecturas desde otra conexión no ven ninguno antes de confirmarlo. |
| Cuotas | Reutiliza PostgresRateStore: admisión en transacción corta **antes** de SystemState; huellas SMTP en la entrega para la reserva posterior del ejecutor. Sin cuota de destinatario/origen conserva cuenta/auditoría/marca, sin token ni entrega. No mantiene locks de cuotas durante la operación de cuenta. |
| Repetición y concurrencia | Dos llamadas simultáneas, iguales o distintas, producen un éxito y una denegación, máximo un ADMIN y un conjunto token/entrega. Repetir tras desactivar o cambiar el rol del primer administrador tampoco permite reiniciar ni reemplaza su credencial. Un ADMIN previo, activo o desactivado, bloquea incluso sin marca. |
| Auditoría y rollback | Reutiliza PostgresAuditWriter inyectado con el mismo PoolClient. Fallos SQL inducidos en auditoría, token, entrega y marca, auditoría inválida y conexión terminada antes del commit dejan cero efectos de bootstrap; un intento posterior válido puede inicializar. |
| Privacidad y límites del lock | Solo hash de provisional, SHA-256 del token y sobre AES-GCM persistidos; ningún secreto en resultado ni error. Hash y cifrado se preparan antes de llamar al store; este no recibe capacidades de hash/SMTP. Tratamiento seguro del evento de error de clientes pg prestados y descarte de la conexión fallida. |

Los eventos de admisión se confirman aparte y no se devuelven al fallar o denegar una
operación posterior: comportamiento conservador del [modelo, invariantes 2](../data-model.md#invariantes-transaccionales)
y [R09](../research.md#r09--límites-persistentes-y-prevención-de-enumeración).
El rollback de bootstrap se refiere a cuenta, auditoría, marca, token y entrega.
Se reutilizan cuatro migraciones y el pool existente, sin modificar el esquema ni ejecutar
`db:migrate:dev`; se conservan los datos de desarrollo y los volúmenes existentes.

Código: [contrato y preparación de cuenta](../../../apps/api/src/modules/identity/application/identity-store.ts),
[regla pura](../../../apps/api/src/modules/identity/domain/bootstrap.ts),
[adaptador PostgreSQL](../../../apps/api/src/modules/identity/infrastructure/bootstrap-store.ts) y
[pruebas de comportamiento](../../../apps/api/tests/integration/bootstrap-store.spec.ts).
El tipo de sobre cifrado existente se expone en `mail/public/delivery.ts` y se reexporta
desde su ruta anterior; no cambia el cifrado ni se duplican sus definiciones.

## Verificación en Docker

| Comando | Resultado final |
| --- | --- |
| `docker compose up -d --build api` | API reconstruida y compilada; PostgreSQL/Mailpit existentes conservados |
| `docker compose exec -T api npm run lint` | Ambos workspaces y reglas de dependencias: exit 0 |
| `docker compose exec -T api npm run build` | API y web: exit 0 |
| `docker compose exec -T api npm run test:unit` | 23 aprobadas: 22 backend y 1 web, incluidas pruebas de arquitectura |
| `docker compose exec -T -e APP_ENV=test api npm run test:integration` | 220 aprobadas en 14 archivos: 24 nuevas y 196 regresiones; sin errores no capturados |

PostgreSQL real en esquema aleatorio de `*_test`; migraciones aplicadas por el harness,
triggers de fallo y limpieza limitados a ese esquema. Datos sintéticos y secretos aleatorios
en memoria; no se registran valores sensibles. La primera ejecución dirigida aprobó las
24 aserciones pero falló por un evento pg no capturado al terminar la conexión. Se añadió
el manejo del cliente prestado; la suite completa final verifica esa corrección y sale 0.
Comprobaciones documentales: enlaces locales y `git diff --check` sin errores.

## Revisión arquitectónica y documentación

El dominio evalúa condiciones y caducidad; aplicación define IdentityStore y datos
preparados sin NestJS, HTTP, pg o configuración. Infraestructura implementa el contrato
y concentra SQL, locks, reintentos y acceso al pool. Correo se consume por su superficie
pública; auditoría se inyecta como capacidad transaccional de infraestructura, sin importar
internos de otro módulo ni llevar PoolClient al núcleo. No se detectan nuevas infracciones
de las reglas de dependencias; lint y pruebas de arquitectura pasan.

Quedan desactualizados los estados de fundamentos en el
[catálogo](../../../docs/02-arquitectura-software/componentes-arquitectonicos.md),
[C3](../../../docs/04-modelo-c4/03-componentes.md) y
[diseño interno](../../../docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md):
C06 ya tiene adaptadores/ejecutor T024–T026; C07 tiene escritor y registros T027;
C03 incorpora ahora la base atómica T028. Sus vistas de componentes todavía reflejan
esos estados anteriores. C11 sigue previsto: no existe aún la CLI de bootstrap.
[C4](../../../docs/04-modelo-c4/04-codigo.md) selecciona sesiones y no pretende cubrir
bootstrap; sus elementos de sesiones no cambian. No se editan estos documentos ni diagramas.

## Límites y siguiente tarea

T028 [x] es el fundamento persistido de FR-027/FR-028, con auditoría y privacidad
FR-025/FR-026/FR-033, cuenta pendiente FR-004 y emisión inicial/cuotas FR-029/FR-031.
No implica cumplimiento completo de esos requisitos ni de HU6: US6 debe preparar entradas,
credencial/enlace coherentes, ensamblar adaptadores, registrar al operador y completar
la CLI y activación/verificación. No hay endpoint bootstrap, contraseña predeterminada
ni administrador de desarrollo creado por este bloque. No se prueba SMTP desde bootstrap,
entrega exactamente una vez, aceptación funcional por navegador ni 1000 concurrentes.
Una pérdida de respuesta durante COMMIT puede dar resultado ambiguo al llamador;
no se reintenta automáticamente ese caso y la marca persistida impide duplicar cuentas.
Siguiente tarea: **T029**, fixtures y CLI restringida a pruebas.
