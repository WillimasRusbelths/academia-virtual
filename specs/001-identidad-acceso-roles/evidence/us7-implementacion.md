# US7 · Recuperación mediante API

Fecha: 2026-10-15. Rama `feat/001-identidad-acceso-roles`; base `6cae31f`.
**T075–T077 completadas y verificadas en API. US7 no está completa.**
Dependencias: [T072–T074](us7-pruebas.md) completadas como escritura de pruebas,
con causas de fallo comprobadas; [US4/T071](us4.md) conserva su checkpoint aprobado.
Checklist documental 16/16; sin AGENTS.md aplicable, fusión ni hooks pendientes.

| Tarea | Implementación | Criterios comprobados y límites |
| --- | --- | --- |
| T075 | [RequestPasswordReset](../../../apps/api/src/modules/identity/application/request-password-reset.ts) reutiliza IssueActionLink con RESET_PASSWORD. | Admisiones y 202 equivalentes; solo ACTIVE verificado emite, incluida provisional verificada. Encola sin esperar SMTP, conserva credenciales/sesiones/rol/estado y reemplaza solo el propósito reset. La cuota denegada conserva el enlace anterior y Retry-After. |
| T076 | [ResetPassword y su contrato](../../../apps/api/src/modules/identity/application/reset-password.ts), con [PostgresPasswordResetStore](../../../apps/api/src/modules/identity/infrastructure/password-reset-store.ts). | Valida antes de consumir, calcula Argon2 antes de invocar persistencia y revalida cuenta/token/tiempo dentro de la transacción. Un consumo actualiza hash/versión, elimina provisional y revoca sesiones/otros reset; no modifica correo, rol, estado o verificación. |
| T077 | [PasswordResetController](../../../apps/api/src/modules/identity/entrypoints/http/password-reset.controller.ts), [IdentityModule](../../../apps/api/src/modules/identity/identity.module.ts) y [AppModule](../../../apps/api/src/app.module.ts). | POST forgot/reset públicos con DTO estricto y protecciones comunes; 202/204/400/429/503 contractuales. El 204 elimina la cookie configurada después del commit, sin crear sesión ni devolver identidad o secretos. |

## Transacción y privacidad

La solicitud usa cuotas persistidas, emisión atómica, cifrado y ejecutor ya existentes;
no importa ni invoca SMTP. Los contratos API se ensayan con el scheduler pausado y entrega
encolada; los fallos repetidos de transporte y carreras específicas de T080 conservan su fase.

La persistencia usa el pool compartido y actionTransaction: lookup del digest, bloqueo del
usuario, sesiones ordenadas, tokens ordenados y entregas. El lookup inicial no autoriza;
el token se relee bajo locks y la regla pura canConsumeAction exige RESET_PASSWORD,
cuenta activa/verificada, destinatario coincidente y vigencia estricta de 30 minutos.
El reloj se consulta después de obtener los locks, sin prolongar caducidad por hash o espera.

Hash nuevo, mustSetPassword=false, provisional nula, authVersion++, consumo y revocaciones
comparten commit. consumedAt y revokedAt siguen excluyentes; se conservan las marcas
previas de otras acciones. Las entregas PENDING/SENDING del token finalizado se cancelan
y pierden payload/nonce/tag/key/claim/lease; los estados terminales no se reescriben.
Eso no retira un mensaje ya aceptado por SMTP ni garantiza entrega exactamente una vez.

Un fallo antes del commit deja el enlace utilizable: las pruebas provocan errores al
actualizar User y, adicionalmente, Session después de cambiar hash/consumir token. Se
compara el snapshot privado completo antes/después y luego se reutiliza el mismo enlace.
Se mantiene la política existente de máximo dos reintentos solo tras aborto conocido y
rollback confirmado; un commit incierto no se trata como un rollback demostrado.

El puerto de persistencia recibe digest/hash, no contraseñas claras. HTTP devuelve mensaje público
constante o error saneado; no serializa excepciones/filas ni registra secretos. No se
añaden eventos AuditEvent distintos de los aprobados en el modelo. La cookie se elimina
solo tras éxito, con nombre/path/atributos del entorno; el ensayo HTTPS comprueba cabeceras,
sin acreditar despliegue TLS público.

## Resultados Docker

| Suite/comprobación | Resultado |
| --- | --- |
| T072 original, sin modificar | 26/26: sus 23 fallos HTTP anteriores pasan a verde. |
| T073 original, sin modificar | 19/19: sus 16 fallos HTTP anteriores pasan a verde. |
| [Integración adicional](../../../apps/api/tests/integration/password-reset-store.spec.ts) | 4/4: provisional vencida verificada y otros usuarios sin cambios; rollback intermedio/reintento; hash sin lock con caducidad revalidada; cookie HTTPS. |
| [Aplicación](../../../apps/api/src/modules/identity/application/reset-password.test.ts) | 7/7; validación antes de efectos, fallo de hash, repositorio que rechaza, orden hash/consumo y regla de elegibilidad/caducidad; solicitud equivalente y cuota. |
| Regresiones API | 191/191: login 19, sesiones 15, registro 45, concurrencia de registro 13, inicial 21, revocación administrativa 20 y auditoría 58. |
| T074 original, sin modificar | 2 controles aprobados y 12 fallos esperados por Página no disponible en /recuperar o /restablecer. Ningún fallo inesperado. |
| Unitarias / arquitectura | 114/114: API 69, web 45. |
| Lint / compilación | Ambos workspaces aprobados, con reglas de dependencias. |
| Enlaces y formato | 186 enlaces locales comprobados y git diff --check aprobado. |
| Ensayo manual | Misma huella privada, esquema y 12 cuentas/credenciales; cuatro servicios saludables. |

Los tests de contratos usan HTTP real y PostgreSQL; los nuevos casos prueban una
provisional vencida que ya verificó su correo, invalidación de la contraseña anterior,
acceso con la nueva y rechazo de la provisional, sin alterar sesiones ajenas. Una barrera
solo de test pausa el hash, permite adquirir User con NOWAIT y adelanta el reloj aislado:
al continuar, el enlace vencido se rechaza sin consumo ni cambios.

No se omiten casos ni se cambian aserciones originales. Las pantallas y el recorrido
completo siguen pendientes; el paso a verde de la API no acepta US7, V11 completo ni
las carreras de recuperación de V15/T080. Tampoco anticipa T081 o el cierre transversal.

## Arquitectura y reproducción

Monolito por capas conservado: controladores adaptan HTTP; aplicación coordina contratos;
las reglas existentes de dominio no dependen de NestJS, PostgreSQL ni HTTP. El adaptador
implementa PasswordResetStore y consume la regla pura recibida; Nest ensambla adaptadores
y credenciales compartidas en la composición. No se detectan nuevas infracciones de
dependencias. No se modifican código web, requisitos, contratos, Docker, migraciones o
diagramas. El catálogo/C3 conserva su alcance parcial; no se presenta recuperación como
componente funcional completo por disponer de estas rutas.

Usar [Docker](../../../ops/docker/README.md) y la composición de pruebas existente,
montando fuentes/tests y package.json API actuales. Tras compilar API, desde apps/api:

```sh
npx vitest run tests/integration/password-reset.contract.spec.ts tests/integration/password-reset-concurrency.spec.ts tests/integration/password-reset-store.spec.ts --maxWorkers=1
```

Desde apps/web: `npx playwright test --config playwright.password-reset.config.ts`.
Se reutilizan runtime Prisma y migraciones existentes en esquemas nuevos t_*; sin instalaciones,
borrados de desarrollo o bootstrap manual. Reportes crudos en /tmp del contenedor transitorio;
sin trazas/capturas/vídeos automáticos ni secretos en evidencia. No se reconstruyen las
imágenes ni se cambia la configuración del ensayo manual.
Siguiente bloque: T078–T079; después T080–T081 para carreras y checkpoint de US7.
