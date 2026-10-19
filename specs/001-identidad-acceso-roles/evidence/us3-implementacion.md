# US3: perfil, inicio y presentación accesible

## Alcance

Bloque T091–T093, sobre `5e20aa1`, en `feat/001-identidad-acceso-roles`.
Estado inicial limpio, sin operación Git pendiente ni AGENTS.md aplicable; checklist
16/16 y sin hooks registrados. Fuentes: [US3 y FR-010–FR-012/021](../spec.md),
[contrato UI](../contracts/ui.md), [UserView y /me](../contracts/api.md),
[plan](../plan.md) y [V05 / SC-005](../verification.md).
La [escritura T089–T090](us3-pruebas.md) conserva sus resultados históricos 42/14.
Este bloque implementa sus conductas pendientes, sin aceptar T094.

| Tarea | Implementación y comprobación |
| --- | --- |
| T091 | [ProfilePage](../../../apps/web/src/features/profile/profile-page.tsx), [composición](../../../apps/web/src/app/App.tsx) y [ruta protegida](../../../apps/web/src/app/router.tsx): perfil propio mediante la sesión y `/me` existentes. Lista de definiciones con nombre, correo, rol único y estado; sin campos editables ni secretos. Hidratación al entrar directamente y recargar; visitante redirigido a login. |
| T092 | [HomePage](../../../apps/web/src/features/profile/home-page.tsx): identidad y rol único, navegación a perfil y cierre para los tres roles; gestión de cuentas solo ADMIN. Sin métricas, selector de contexto ni funciones académicas. |
| T093 | [Estilos comunes](../../../apps/web/src/shared/ui/layout.css) cargados desde [main](../../../apps/web/src/main.tsx): foco visible, tamaños y ajuste de texto; perfil adaptable. [FormField](../../../apps/web/src/shared/ui/form-field.tsx) conserva etiqueta, `aria-invalid` y descripción textual; [Feedback](../../../apps/web/src/shared/ui/feedback.tsx) conserva alert/status y añade anuncio atómico. La [lista administrativa](../../../apps/web/src/features/admin-users/accounts-page.tsx) conserva tarjetas adaptables y recibe nombre accesible. No se convierte en tabla ni se oculta el desbordamiento para aprobar. |

## Verificación en Docker

Contenedores efímeros con fuentes/configuraciones actuales montadas y API/web compiladas;
imágenes y runtime Prisma existentes. PostgreSQL real con esquemas nuevos `t_*` en la
base de pruebas; sin migraciones nuevas. Fixtures existentes, Mailpit local y Chromium.
No se alteran las aserciones originales T089–T090 ni contratos.

| Comprobación | Resultado |
| --- | --- |
| Lint y build API/web | Aprobados |
| Unitarias y arquitectura | 120/120: API 75 y web 45; barreras y grafo de dependencias incluidos |
| T089 y regresiones HTTP | 105/105: perfil 18, login 19, consulta/cierre 20, matriz 33, privacidad 5, CLI 6 y controles bootstrap 4 |
| T090 original, móvil y escritorio | 56/56: los 14 fallos previos pasan a verde; cero fallos esperados, inesperados u omitidos |
| Pruebas complementarias de perfil | 8/8: cuatro escenarios en ambos tamaños, con HTTP y PostgreSQL reales |
| Regresiones originales de navegador | 133/133: US1 21, US2 14, US6 14, US4 20, US7 36 y seguridad 28; sin fallos ni omisiones |
| Conservación del [ensayo manual](../../../ops/local/manual-us1.md) | Las 12 cuentas y archivo privado de credenciales mantienen la misma huella antes/después. Cuatro servicios healthy; API live/ready, web y Mailpit con HTTP 200. No se reconstruyen las imágenes manuales en este bloque. |

Las [pruebas originales](../../../apps/web/tests/e2e/accessibility.spec.ts) recorren
los tres roles, perfil/recarga/visitante, acceso/cierre, registro/verificación/reenvío,
sustitución inicial, recuperación y administración. Usan Tab, Enter y teclas de selección:
nombre accesible, foco visible dentro de pantalla, errores con texto y descripción accesible,
sin acciones solo hover ni desplazamiento horizontal de página, a **360×800 y 1366×768**.

La [suite complementaria](../../../apps/web/tests/e2e/profile.spec.ts), con
[configuración](../../../apps/web/playwright.profile.config.ts), verifica en ambos tamaños
sesión vencida/revocada al recargar, fallo SQL real de `/me` sin perfil ni reintento
automático y recuperación explícita. Comprueba también nombre válido de 100 caracteres,
lectura semántica y logout por teclado con rechazo posterior al volver atrás.

Reproducción: [Compose de pruebas](../../../ops/docker/compose.identity-tests.yml),
fuentes y configuraciones actuales montadas, runtime Prisma preparado y API compilada.
En la imagen API: `npm run lint`, `npm run build`, `npm run test:unit`; desde `apps/api`:

```sh
npx vitest run tests/integration/profile.contract.spec.ts tests/integration/login.contract.spec.ts tests/integration/us1-read-logout.contract.spec.ts tests/integration/permission-matrix.spec.ts tests/integration/secret-redaction.spec.ts tests/integration/bootstrap-cli.spec.ts tests/integration/us6-bootstrap-guards.spec.ts --maxWorkers=1
```

En la imagen de navegador, desde `apps/web`:

```sh
npx playwright test --config playwright.accessibility.config.ts
npx playwright test --config playwright.profile.config.ts
```

Regresiones con las configuraciones originales `identity`, `registration`, `first-admin`,
`admin-users`, `password-reset` y `security`. Sin retries, skip, fixme ni `test.fail()`.
Traces, capturas y vídeos desactivados; resúmenes saneados separados de los anteriores
en `.cache/us3-implementacion/`, fuera de Git. No se imprimen valores privados.
El lint final se repitió con la nueva configuración montada: el primer comando no la
encontraba en la imagen anterior. El montaje corregido pasó, sin cambiar pruebas.

## Arquitectura, límites y siguiente bloque

La composición conecta las vistas con SessionProvider; las features usan contratos públicos
del frontend sin importar backend ni otras features. Se reutilizan cliente HTTP, hidratación,
cookie HttpOnly y guardas existentes. La API conserva autoridad sobre sesión/permisos;
no se modifican dominio, aplicación, persistencia, endpoints ni dependencias del monolito.

El [hallazgo intermitente CLI](us5.md#hallazgo-intermitente-de-bootstrap-cli) permanece
abierto para T106, con causa no confirmada. Una regresión aprobada no lo resuelve.
No reapareció en privacidad, CLI, controles bootstrap ni los 14 recorridos originales US6.
No se repite el protocolo temporal U2 ni se afirma capacidad de 1000 usuarios o producción.

T091–T093 completas con estos resultados; [tasks.md](../tasks.md) queda en
**93 completas / 15 pendientes**, conservando los 108 IDs. No hay fallos funcionales
esperados, inesperados ni omitidos en las suites ejecutadas.

**Preparación para T094:** revisar conjuntamente estos resultados y los recorridos completos,
registrar la aceptación de V05/SC-005 en `evidence/us3.md` y distinguir controles técnicos
de cualquier observación humana. T094 y el checkpoint de US3 permanecen pendientes.
La comprobación automatizada de etiquetas, foco y descripciones no sustituye un lector
de pantalla real ni la usabilidad con participantes de T104. Las verificaciones finales
conservan sus dependencias; este bloque no las adelanta.
