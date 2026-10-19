# T029 — Fixtures seguros de identidad

**Fecha:** 2026-10-14. **Dependencia:** [T028](bootstrap-atomico.md) completada.

| Criterio | Evidencia comprobada |
| --- | --- |
| Entorno restringido | Exige APP_ENV=test, BD *_test en db:5432, origen localhost y Mailpit en modo capture sin autenticación/relay. Comprueba también base/schema efectivos antes de generar datos. Rechaza desarrollo, demo, producción y destinos remotos. |
| Cuentas y sesiones | Lote explícito de 12 cuentas sintéticas: tres roles y variantes habilitada, desactivada, no verificada y provisional. Argon2id existente, provisional de 24 h y dos sesiones opacas por cuenta habilitada; hashes SHA-256 en BD. No hay cuenta/contraseña predeterminada ni creación al arrancar HTTP. |
| Secretos privados | Valores aleatorios en manifiesto del contenedor, directorio 0700 y archivo 0600. Rechaza symlinks/permisos públicos. Ruta apps/api/.secrets/identity-fixtures/ ignorada por Git y excluida del contexto Docker; stdout solo contiene UUID/ruta/conteo. |
| Limpieza dirigida | Solo UUID del manifiesto ligados a su correo sintético y schema/BD. Preserva otros lotes, cuentas, sesiones y marca SystemState. Alterar IDs para apuntar a una cuenta ajena falla cerrado; una FK externa revierte toda la limpieza. |
| Fallos y reutilización | Fallo de inserción revierte el lote y conserva el manifiesto privado para limpieza. Reutiliza configuración, pool, credenciales, secretos y caducidad; no importa tests en producción ni añade rutas/flags para saltar autorización. |

Código: [adaptador](../../../apps/api/src/infrastructure/testing/identity-fixtures.ts),
[CLI](../../../apps/api/src/cli/fixtures-identity.ts),
[superficie del harness](../../../apps/api/tests/support/identity-fixtures.ts) y
[20 pruebas](../../../apps/api/tests/integration/fixture-safety.spec.ts).

## Uso en Docker

Revisar/aplicar las migraciones versionadas en la **BD de prueba** antes de usar el
comando en su schema configurado; no usar reset ni db:migrate:dev. Ejemplos operativos:

```sh
docker compose exec -T -e APP_ENV=test api npm run db:migrate:deploy
docker compose exec -T -e APP_ENV=test api npm run fixtures:identity -- create
docker compose exec -T -e APP_ENV=test api npm run fixtures:identity -- cleanup UUID_DEL_LOTE
```

Sustituir UUID_DEL_LOTE por el identificador mostrado, nunca por credenciales. El manifiesto
se lee explícitamente desde el harness dentro del contenedor; no imprimirlo ni versionarlo.
La CLI se comprobó contra un schema aislado migrado, no sembrando la base de desarrollo.

## Resultados y límites

- `docker compose up -d --build --wait api web`: compilación de API/web y cuatro servicios saludables.
- `docker compose exec -T api npm run lint`: aprobado, incluidas reglas de arquitectura.
- `docker compose exec -T api npm run test:unit`: 22 regresiones backend y 23 pruebas web aprobadas.
- `docker compose exec -T -e APP_ENV=test api npm run test:integration`: **240/240 en 15 archivos**, incluidos **20/20 de T029** y 220 regresiones.
- Enlaces locales, ignorado del manifiesto y `git diff --check`: aprobados.

La ejecución dirigida inicial tuvo 19/20 aprobadas: timeout del hook de limpieza mientras
se construía Chromium. La ejecución completa final, sin esa construcción simultánea,
aprobó todos los casos sin cambiar límites ni omitir pruebas.

Son datos de ensayo preparados directamente, no altas administrativas ni bootstrap de
negocio: no modifican su marca ni completan US6. No purga cuotas/globales o logs ajenos;
una dependencia externa impide borrar cuentas y conserva el manifiesto. Archivo y BD no
forman una transacción distribuida: el manifiesto previo permite recuperar una limpieza
ante resultado SQL ambiguo. No se garantiza conservación del archivo tras recrear el
contenedor. Sin nuevas migraciones, secretos expuestos, módulos académicos o diagramas.
T029 [x]; siguiente fundamento: T030. Las reglas permanecen en el núcleo; esta composición
de datos sintéticos y detalles pg/filesystem/CLI están restringidos a infraestructura/entrada.
