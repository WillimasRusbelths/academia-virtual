# US6 · Checkpoint del primer administrador

Fecha: 2026-10-14. Rama `feat/001-identidad-acceso-roles`; base `0c214ff`.
**Checkpoint funcional US6 cumplido**, con el alcance FR-004/014/027/028 definido en
[spec](../spec.md). No equivale a completar identidad ni V06/V08/V12/V13/V16 íntegros.
Dependencias T053–T055 comprobadas en [implementación previa](us6-implementacion.md).
Checklist documental 16/16, sin AGENTS.md aplicable ni hooks de implementación.

| Tarea | Implementación o comprobación | Resultado |
| --- | --- | --- |
| T056 | [Pantalla inicial](../../../apps/web/src/features/auth/initial-password-page.tsx) con correo/provisional/nueva contraseña, validación orientativa, espera de 429, errores seguros y limpieza de secretos. [Verificación](../../../apps/web/src/features/auth/verify-email-page.tsx) ofrece establecimiento inicial sin asumir habilitación. La ruta se registra en [App.tsx](../../../apps/web/src/app/App.tsx), donde están las rutas reales; se reutiliza AppRouter sin cambiar su mecanismo. | Ocho fallos anteriores de T052 pasan a verde; no almacenamiento, auto-login ni autoridad de permisos en el frontend. |
| T057 | [Operación restringida](../../../ops/local/first-admin.md) y [quickstart](../quickstart.md): destino/migraciones/TTY, alias, entrada oculta, salida mínima, entrega privada, repetición, errores, segundo ADMIN habilitado antes de retirar al primero. | Documentación de la CLI existente; gestión US4 y recuperación vencida US7 siguen pendientes. |
| T058 | Suites originales y [recorrido adicional CLI/navegador](../../../apps/web/tests/e2e/first-admin-bootstrap.spec.ts), con [fixture vacía aislada](../../../apps/web/tests/support/us6-fixture.ts). | Creación única, correo real en Mailpit, activación en ambos órdenes y acceso normal comprobados. |

## Resultados en Docker

Fuentes actuales montadas en contenedores Linux transitorios; PostgreSQL/Mailpit existentes,
esquemas `t_*` nuevos y migraciones versionadas desplegadas. Sin dependencias ni migraciones nuevas.
Las suites originales no se modificaron ni omitieron casos.

| Pruebas o comprobación | Resultado |
| --- | --- |
| T050: CLI original | 6/6: entrada oculta sin argv secreto, concurrencia, repetición tras desactivación y ausencia de bootstrap HTTP. |
| T051: API inicial original | 21/21: 24 h exactas, cuotas compartidas, consumo único, revalidación bajo lock y rollback real. |
| T052: navegador original | 9/9: ambos órdenes en 360×800/1366×768, contraseña inválida, recarga, provisional incorrecta/vencida y limpieza de URL/storage. |
| Recorrido CLI real → Mailpit → activación → login | 2/2, ambos órdenes. Base inicialmente sin cuentas, mensaje capturado y estado SENT comprobados por separado, un ADMIN/auditoría y repetición rechazada. |
| [Controles adicionales de UI](../../../apps/web/tests/e2e/initial-password-ui.spec.ts) | 3/3: 429 con espera del servidor, 503 SQL con rollback/reintento manual y URL sin mutación ni autofill. |
| Controles privados de CLI | 4/4: alias, terminal, argumentos, correlación y exclusión de secretos. |
| Regresiones API US1/US2 | 92/92: login 19, sesiones 15, registro 45 y concurrencia 13. Con CLI/API US6 y controles: 123/123. |
| Regresiones Chromium US1/US2 | 21/21 y 14/14. |
| Unitarias y arquitectura | 85/85: API 50 y web 35. |
| Lint y compilación | API/web aprobados; configuración Playwright comprobada con ESLint. |
| Enlaces y formato | 143 enlaces locales sin rutas rotas; referencias con fragmento revisadas y `git diff --check` aprobado. |

La configuración US6 conjunta ejecutó 14/14 casos de los tres archivos, sin fallos
funcionales esperados restantes ni errores de entorno. No se modificaron las aserciones originales.
Las comprobaciones nuevas de campos privados comparan longitudes, evitando imprimir el
contenido de una credencial incluso si falla una aserción.

En el recorrido completo la cuenta se crea mediante `admin:bootstrap` y PTY real, sin seed
privilegiado. Se captura su mensaje específico en Mailpit; la confirmación retira el fragmento
y solo se envía al pulsar el botón. Un único requisito satisfecho sigue rechazando login.
Tras ambos, el login obtiene sesión normal, `/inicio` muestra Administrador y la recarga
mantiene la identidad. La provisional deja de servir; no se crea sesión durante activación.
Mailpit acredita recepción local, no producción ni entrega exactamente una vez.

## Reproducción y límites

API: compilar con `npm run build --workspace @academia/api` y ejecutar en Docker
`bootstrap-cli.spec.ts`, `initial-password.spec.ts` y `us6-bootstrap-guards.spec.ts` según
[reproducción del bloque previo](us6-implementacion.md#reproducción-y-aislamiento).
Navegador: composición [identity-tests](../../../ops/docker/compose.identity-tests.yml),
volumen `academia_us1_test_runtime:/us1runtime:ro`, variable
`PRISMA_SCHEMA_ENGINE_BINARY=/us1runtime/schema-engine` y fuentes actuales montadas.
Copiar `/us1runtime/generated` a `apps/api/generated`, compilar API y, en `apps/web`, ejecutar:

```sh
npx playwright test --config playwright.first-admin.config.ts
npx playwright test --config playwright.identity.config.ts
npx playwright test --config playwright.registration.config.ts
```

La imagen de navegador debe tener el `package.json` API actual y `script`, ya disponible;
mantener montados los tests API/web y las tres configuraciones. No exportar trazas/capturas
ni salidas crudas de formularios. Procedimiento: [pruebas Docker](../../../ops/docker/README.md).

No se ejecutó bootstrap sobre desarrollo ni sobre el esquema manual de US1. No se
reconstruyeron sus imágenes ni se cambiaron cuentas, configuración o volúmenes.
La comparación privada antes/después confirmó sus 12 cuentas, esquema y archivo de
credenciales sin cambios; los cuatro servicios manuales continúan saludables.

Clean Architecture conservada: UI/cliente HTTP adaptan entradas; reglas, cuotas,
autorización y transacciones permanecen en el backend existente. Sin imports de
persistencia en UI ni cambios de dominio/aplicación para hacer pasar las pruebas.
Los estados del catálogo/diseño y sus diagramas anteriores requieren una actualización
documental independiente; no se redibujaron en este bloque.

La provisional vencida ofrece verificar/recuperar, pero ese recorrido aún espera US7/T081.
Retirar administradores y proteger al último espera US4/T071; V08 solo tiene comprobado
su ámbito de bootstrap. Retención/purga T095 y restauración T096–T098, carga T099–T103,
observación humana T104 y cierre T105–T108 conservan sus dependencias, sin aceptación
anticipada ni capacidad demostrada de 1000 concurrentes. Siguiente bloque: T059–T061,
escritura de pruebas de administración US4.
