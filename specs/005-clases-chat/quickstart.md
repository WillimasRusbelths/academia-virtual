# Preparación y validación prevista — 005

2026-11-17. **Guía de pruebas futuras, no evidencia de ejecución.** Alcance V05 y diseño
del ensayo sincronizados; [G-V005](video-gate.md) exige evidencia real, no protección
multimedia externa. [Adopción](evidence/video-scope-adoption.md).
T008–T009 añaden fixtures y pruebas de autoridad previas al coordinador;
[checkpoint](evidence/t008-t009.md). Su matriz se verifica después en T014–T017.

T010–T013 implementan permisos y participantes de oferta, matrícula y autores:
[evidencia](evidence/t010-t013.md). T014–T017 ya verifica el coordinador y T009:
[fundamentos](evidence/t014-t017.md). T020–T023 verifica la gestión manual en API:
[último bloque](evidence/t020-t023.md). Faltan cliente/UI, consultas de aula y chat.

T018–T019 escribe las suites de dominio y HTTP: [informe](evidence/t018-t019.md).
El checkpoint previo conserva su rojo; ahora pasan con T020–T023 mediante los
comandos normales de unitarias/integración. La suite HTTP exige primero una ruta real positiva;
ningún 404 por falta de handler cuenta como denegación de permisos probada.

T001–T004 prepararon entorno/dependencias y [matriz](verification.md).
T005–T007 implementan contratos/puertos, pruebas SQL y migración 0010:
[evidencia](evidence/t005-t007.md). Las fixtures compartidas y la gestión de API
están verificadas; chat, consultas de aula y transporte de esos recursos aún pendientes. La persistencia no acredita reproducción real.

## Preparación segura

Usar Node/npm y lockfile existentes, PostgreSQL 16 y el
[harness aislado](../../ops/docker/test-harness.md). Crear proyecto/volumen privado
de ensayo con APP_ENV=test y credenciales efímeras, sin publicar puertos por defecto;
no reutilizar `.env`, BD/cuentas manuales o bootstrap real. Owner migra; runtime
solo permisos mínimos. No reset, borrado de volúmenes o cambios en migraciones previas.

Fixtures futuras: admin, dos docentes (habilitado/asignado y ajeno), alumnos de
grupos propios/ajenos, sin matrícula, vencida y de límite exacto. Dos grupos con
sesiones preparadas, clases LIVE separadas y mensajes ficticios. Matrícula activa
desde fixtures autorizadas de 003 con pagos **simulados**; no confirma Izipay.

Con configuración privada solo del harness y la migración 0010 versionada, aplicar
primero compatibilidad, comprobar permisos y migraciones antes de iniciar API:

```powershell
npm.cmd run probe:migrate
npm.cmd run probe:check
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
npm.cmd run build --workspace @academia/api
```

Estos comandos ya existen, pero **no ejecutarlos sobre el entorno manual** ni
suponer que validan clases antes de que se implemente. Mantener el orden de inicio
corregido del CI: db/mailpit→compatibilidad→migraciones→api/web. No desactivar
guardas de arranque para compensar una BD sin migrar.

## Comprobaciones automatizadas

Gestión de backend ya ejecutada en el harness aislado:

```sh
npm run test:unit --workspace @academia/api -- --maxWorkers=2
npm exec --workspace @academia/api -- vitest run tests/integration/classes-management-http.spec.ts tests/integration/classes-management-store.spec.ts --maxWorkers=2
```

### Comprobaciones futuras de aula/chat/UI

Los nombres siguientes son una propuesta de archivos; no existen aún. Desde raíz,
en el runner aislado y después de compilar/generar clientes:

```powershell
npm.cmd run lint --workspace @academia/api
npm.cmd run lint --workspace @academia/web
npm.cmd run build --workspace @academia/web
npm.cmd exec --workspace @academia/api -- vitest run tests/architecture src/modules/classes tests/integration/classes-management.spec.ts tests/integration/classes-chat.spec.ts tests/integration/classes-races.spec.ts tests/integration/classes-socket.spec.ts --maxWorkers=2
npm.cmd exec --workspace @academia/web -- playwright test --config playwright.classes.config.ts --workers=1 --retries=0
```

Antes de usar el bloque, la implementación deberá crear todos los archivos y
añadir su configuración de lint/tipos/CI. La selección exacta y resultado se
registrarán en evidencia nueva, con commit, configuración saneada y salida real.
No contar archivos encontrados, comandos lanzados o esta guía como pruebas aprobadas.

## Matriz de aceptación técnica

| Caso | Preparación y acción | Resultado exigido / trazabilidad |
| --- | --- | --- |
| Q01 | Preparar/editar e iniciar dos sesiones del mismo grupo a la vez, con barrera | Una LIVE, otra conflicto; grupo/creador inmutables. US1.1–3/6, FR-001–004/013/018, SC-001 |
| Q02 | Finalizar/cancelar, repetir tras timeout y reiniciar API | Terminales no reabren ni inician señal; mismo comando único. US1.4/6, FR-003/004/013, SC-001 |
| Q03 | Visitante, admin, docente propio/ajeno/anterior/deshabilitado y alumno propio/ajeno | Matriz permitida/denegada en listas, referencia directa, commands/tickets/sockets/moderación. US1.5, US2.1/3/5/6, US3.2, US4.5; FR-002/005–007/019, SC-002 |
| Q04 | Derecho original a fin−1 μs, fin y fin+1 μs; sesión revocada con aula abierta | Nuevas decisiones exactas permitidas/denegadas; sin cache que extienda acceso. US2.4/6, US3.2/5, FR-006/007/015, SC-002 |
| Q05 | Enviar texto válido/XSS inerte/Unicode/solo espacios/exceso; 10+1 y límite t−10s | Confirmar válido solo tras commit; rechazar inválido/undécimo; ventana móvil, conexiones/reinicio compartidos. US3.1/6, FR-010–012, SC-004 |
| Q06 | Perder respuesta/repetir mismo ID y cambiar contenido; COMMIT ambiguo con barrera | Un mensaje/evento/receipt; conflicto distinto digest; no nueva intención automática. US3.3, US1.6, FR-012/013, SC-001/004 |
| Q07 | Desconectar entre mensajes/moderaciones, perder aviso y paginar delta/historial | Orden, deduplicación y cambios completos, incluido HIDE sin SEND posterior; no saltar cursor. US3.4, FR-014, SC-004/005 |
| Q08 | Finalizar contra envío nuevo y replay confirmado anterior | Orden autoritativo; nuevos rechazados, anterior consultable vigente sin reemisión; solo lectura. US3.5, FR-013/015/018, SC-005 |
| Q09 | Ocultar mientras hay lectura/replay en vuelo; consultar SEND viejo y como moderador | Tombstone sin text; respuesta anterior no restaura ocultado ya observado; nuevas consultas sin original. US4.1, FR-016/019, SC-005 |
| Q10 | Silenciar con dos conexiones; competir con envío; rehabilitar/otra clase | Rechazo solo de envíos nuevos de esa clase; lectura intacta, no silencio global. US4.2–5, FR-017/018, SC-005 |
| Q11 | Ticket usado dos veces/cuenta distinta/expirado/origen ajeno; replay de sala | Denegar, sin datos/renovación por heartbeat o polling; liberar plazas en cierres/errores. FR-006/019/021, SC-002/004 |
| Q12 | Caer BD, lector lento, límite sockets/tickets y reinicio del proceso | Fail closed, cola/memoria acotadas, sin ack falso; confirmado recuperable desde BD. FR-012/014/020–022, SC-004/006 |
| Q13 | Logout/cambio cuenta con fetch/socket/borrador pendiente; error logout | Nada de sesión anterior reaparece o se reenvía; estado explícito recuperable. US2.6, FR-021, SC-002/007 |
| Q14 | Inspeccionar DTOs, logs/errores y auditoría de acciones/rechazos | Sin correos/secretos/texto oculto; actor/fecha/resultado atribuibles. FR-019/020, SC-002/005 |
| Q15 | Upgrade desde 0009, reinicio y restore en BD nueva con decisiones post-backup | Estados/mensajes/moderación/cursor coherentes; accesos restaurados denegados y pérdidas revisadas. FR-022, SC-006 |
| Q16 | Asociar/retirar referencia por gestor, revisión/replay, ID/URL/HTML inválidos, player simulado y permiso perdido | ID solo en LIVE vigente; CSP/referer/origin, aviso, teardown y generaciones. Doble no acredita emisión YouTube real o protección externa. FR-005/006/008/009/021/023 |

Carreras Q03/Q04/Q08–Q10 incluyen cambios de asignación/eligibilidad, retirada de
oferta, cancelación y revocación, con ambos órdenes y estado persistido final.
Probar dos alumnos con User locks distintos para detectar promoción SHARE→UPDATE.
Tiempo controlado solo en fixture exacta; no acortar las reglas reales del producto.

Regresión: lint/tipos/build de API/web, unitarias, arquitectura, PG/HTTP y E2E
existentes 001–004. Añadir clases al workflow sin omitir suites anteriores. La CI
aprobada del PR #5 es evidencia histórica de esa base, no de esta funcionalidad.
No repetir suites por cambios solo documentales en este bloque.

## Video real — pendiente

Ejecutar [contrato del ensayo](contracts/video.md) y matriz [G-V005](video-gate.md)
con cuenta/contenido autorizados después de implementar el contrato propio. Pruebas
con dobles verifican interfaz pero no completan reproducción US2/SC-003. Registrar
referencia compartida y límites externos; no exigir denegación multimedia YouTube
por matrícula. No contratar/publicar o emitir en cuentas personales por iniciativa
del agente. Validación del profesor pendiente si afecta evaluación.

## Ensayo humano — pendiente

Solicitar consentimiento específico para 005 a docente/alumno y responsable
moderador; no inferirlo del ensayo previo de materiales. Usar cuentas de prueba.
Recorrer entrar a clase, seguir emisión real si está habilitada, escribir y
recuperar chat, leer al finalizar, ocultar/silenciar/rehabilitar. Registrar éxito,
dificultades, ayuda, dispositivo/navegador y modalidad teclado/puntero/móvil sin
nombres/correos. Si falta emisión, separar ensayo de gestión/chat y conservar
SC-007 completo pendiente. Modalidades no observadas se declaran así.

## Recuperación, recursos y cierre — pendientes

Ampliar procedimiento existente con inventario/ensayo de clases; comparar hashes,
estados, orden/restricciones/receipts y decisiones posteriores perdidas. Restore
nunca apunta a BD existente. D13 necesita destino externo/custodia de copia y
clave/retención/RPO/RTO acordados; el ensayo local no cierra esa decisión.

Medir memoria, sockets reales, pool, consultas, fanout, mensajes nuevos/s, retraso
de confirmación/sincronización, reconexiones, BD/WAL/índices/backups. Registrar
carga y duración reales. 15.000 cuentas y 2.500 activos/escenario combinado siguen
como metas de [007](../../docs/planificacion/hoja-ruta-005-007.md), sujetas a D10.
Chat autorizado y video externo se miden por separado; si el video se sirve desde
VPS propio deberá contarse en su tráfico/recursos, sin llamarlo externo.

Cerrar solo con FR/SC trazados a evidencia real; no cerrar US2 ni el spec con
G-V005 pendiente, no aprobar recuperación/capacidad por documentación o mocks.
