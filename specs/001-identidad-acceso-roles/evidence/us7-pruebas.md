# US7 · Escritura de pruebas de recuperación

Fecha: 2026-10-15. Rama `feat/001-identidad-acceso-roles`; base `46a2ad3`.
T072–T074 completadas como **escritura y ejecución de pruebas**, no como aceptación
funcional. T075–T081 y el checkpoint US7 permanecen pendientes.

Este registro conserva el resultado del bloque de escritura. El avance posterior de
[T075–T077](us7-implementacion.md) deja T072/T073 aprobadas; UI y checkpoint siguen pendientes.

## Dependencias y alcance

[US4/T070–T071](us4.md) está aprobada en gestión mínima, incluido V04-B y la reunión de
V04-A/B. Se contrastaron casillas, commit y evidencia; no falta un criterio obligatorio
que bloquee T072–T074. La aceptación transversal conserva sus dependencias.
No se repitieron sus carreras: no cambió código productivo.

Fuente normativa: [US7 y FR-014/024/030–033](../spec.md), [API](../contracts/api.md),
[pantallas](../contracts/ui.md), [modelo](../data-model.md) y [verificación](../verification.md).
La estrategia permite cerrar escritura de pruebas con fallos por conducta aún ausente,
si la suite es ejecutable y la causa está comprobada; el checkpoint exige resultados verdes.
Sin AGENTS.md aplicable ni fusión/hooks pendientes; checklist documental 16/16.

| Tarea / suite | Cobertura definida | Resultado Docker |
| --- | --- | --- |
| T072 · [password-reset.contract](../../../apps/api/tests/integration/password-reset.contract.spec.ts) | 202 genérico y elegibilidad; solicitud sin cambio de credenciales/sesiones; correo canónico, enlace cifrado y caducidad; provisional vencida verificada; DTO/nueva contraseña inválidos sin consumo y posterior corrección; Unicode; éxito por tres roles con revocación, cookie eliminada y sin auto-login; cuota, fallo SQL y rollback/reintento. | 26 casos: 3 aprobados, 23 fallos esperados por rutas ausentes. |
| T073 · [password-reset-concurrency](../../../apps/api/tests/integration/password-reset-concurrency.spec.ts) | Frontera de 30 minutos ±1 ms; alterado/desconocido/malformado/UUID/usado/reemplazado; propósitos separados; consumo concurrente máximo uno; consumedAt/revokedAt excluyentes; desactivación/reactivación y vínculo al correo sin cambios de identidad. | 19 casos: 3 aprobados, 16 fallos esperados por ruta reset ausente. |
| T074 · [password-reset](../../../apps/web/tests/e2e/password-reset.spec.ts) | Recorrido con Mailpit a 360×800 y 1366×768; fragmento retirado sin consumo al abrir y recarga sin secreto; confirmación solo local; dos contextos revocados, contraseña anterior inválida y acceso con la nueva; provisional vencida tras verificar; 202 sin prometer entrega, 429 y 503 con intervención manual. | 14 casos: 2 aprobados, 12 fallos esperados por pantallas ausentes. |

## Causas comprobadas y límites

Los **39 fallos HTTP** alcanzan la composición real y obtienen 404 con código NOT_FOUND
y Cache-Control: no-store, antes de comparar con el status contractual esperado. El marcador
US7_PENDING_HTTP se asigna solo a ese caso; otro status, importación, timeout o error SQL
de preparación queda como fallo inesperado. La inspección del código confirma que faltan
controladores/providers forgot/reset; no se añadieron rutas simuladas.

Los **12 fallos de navegador** observan el encabezado real «Página no disponible» en
/recuperar o /restablecer. El marcador US7_PENDING_UI se asigna únicamente a esa pantalla;
una UI presente pero defectuosa no recibe ese marcador. No se usan skip, test.fails,
respuestas sustituidas ni accesos privilegiados de producto.

Los ocho casos aprobados acreditan fundamentos: readiness/fixtures y sesiones habilitadas,
protecciones HTTP, CHECK de exclusión, GET/HEAD sin consumo y separación de propósito en
verificación; en Chromium, dos contextos reales independientes y recepción SMTP local de
una entrega RESET_PASSWORD **sembrada por fixture**, con su estado SENT registrado y payload
eliminado. Eso no acredita solicitar ni consumir públicamente una recuperación.

Las aserciones posteriores al primer fallo esperado (hash, rollback, revocaciones y recorrido
completo) están escritas, pero **todavía no verificadas funcionalmente**. Deben pasar tras
T075–T080 antes del checkpoint T081/V11 y las partes de V15 que corresponden a recuperación.
La verificación previa de la provisional sí se ejecuta antes de encontrar /recuperar ausente.

Se corrigió un fallo propio del fixture: intentaba anticipar provisionalExpiresAt violando
el CHECK existente. Ahora avanza el reloj SQL aislado hasta la caducidad real, sin cambiar
restricciones ni plazos. La repetición dejó cero errores inesperados de pruebas/entorno.

## Regresiones y arquitectura

| Comprobación | Resultado |
| --- | --- |
| API US1/US2/US6/US4 | 147/147: login 19, registro 45, establecimiento inicial 21 y contratos administrativos 62. |
| Chromium US2 / US6 | 14/14 y 14/14 con las configuraciones originales; captura VERIFY_EMAIL conservada. |
| Unitarias y arquitectura | 107/107: API 62, web 45. |
| Lint y compilación | Ambos workspaces y configuración Playwright aprobados; lint final del test de navegador incluido en la regresión. |
| Enlaces, formato y preservación manual | 167 enlaces locales y git diff --check aprobados; misma huella privada, esquema y 12 cuentas manuales antes/después. Cuatro servicios saludables. |

Se reutilizan us2Dataset, seedAction, el snapshot privado, cuotas/cifrado, cookies y la
composición HTTP existentes. El [helper US7](../../../apps/api/tests/support/us7.ts)
contiene solo fixtures/aserciones. El [helper de Mailpit](../../../apps/web/tests/support/us2-fixture.ts)
admite RESET_PASSWORD conservando VERIFY_EMAIL por defecto; se filtra el enlace por el
digest del token vigente para evitar mensajes viejos del mismo destinatario. No se altera
dominio, aplicación, persistencia productiva, migraciones, Docker ni contratos.

## Reproducción

Contenedores transitorios de [identity-tests](../../../ops/docker/compose.identity-tests.yml)
con fuentes/tests y package.json API actuales montados, runtime Prisma existente y esquemas
nuevos t_* en la base de pruebas. Operación: [Docker](../../../ops/docker/README.md).
Tras compilar API, ejecutar desde apps/api:

```sh
npx vitest run tests/integration/password-reset.contract.spec.ts tests/integration/password-reset-concurrency.spec.ts --maxWorkers=1
```

Desde apps/web, con API real, Vite y Mailpit locales mediante la fixture:

```sh
npx playwright test --config playwright.password-reset.config.ts
```

Ambos runners terminan en rojo por las causas indicadas: no se convierten en pruebas verdes
por clasificarlas. Los resúmenes privados separan aprobadas, pendientes funcionales y errores
inesperados; no se incorporan al repositorio ni sustituyen las aserciones.
La [configuración US7](../../../apps/web/playwright.password-reset.config.ts) hereda privacidad
sin trazas, vídeos ni capturas automáticas; reportes crudos solo en /tmp del contenedor.
No se publican credenciales, tokens o enlaces utilizables. No se ejecutan bootstrap ni borrados
sobre desarrollo o el ensayo manual. Retención/purga, aceptación humana y carga permanecen
en su fase final. Siguiente bloque: T075–T077, emisión, consumo transaccional y transporte HTTP.
