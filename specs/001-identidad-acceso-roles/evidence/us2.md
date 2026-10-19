# Checkpoint funcional US2 · Registro y verificación de correo

Fecha: 2026-10-14. Bloque T046–T049 sobre `981fa08` (T043–T045).
Entorno: Docker Compose, PostgreSQL 16.14, Mailpit 1.31.3, NestJS y React/Vite;
Chromium con Playwright. **Checkpoint US2 cumplido en el alcance de estas tareas.**
No completa la aceptación transversal de identidad ni acredita correo de producción.

## Implementación y trazabilidad

| Tarea | Estado | Comportamiento comprobado |
| --- | --- | --- |
| T046 | Completa | [RequestVerification](../../../apps/api/src/modules/identity/application/request-verification.ts) reutiliza emisión atómica y cuotas. [Controlador](../../../apps/api/src/modules/identity/entrypoints/http/request-verification.controller.ts) público: 202 genérico para todos los estados; solo ACTIVE pendiente emite. 429 no revoca; cuota SMTP no determina admisión HTTP. |
| T047 | Completa | [Registro](../../../apps/web/src/features/auth/register-page.tsx): nombre/correo/contraseña, límites Unicode, sin selector de rol, bloqueo local de doble envío. Contraseña retirada tras enviar; 202/429 ofrecen instrucciones genéricas y reenvío tras espera, sin repetir registro automáticamente. |
| T048 | Completa | [Confirmación y reenvío](../../../apps/web/src/features/auth/verify-email-page.tsx), [captura](../../../apps/web/src/features/auth/action-link.ts) y [router](../../../apps/web/src/app/router.tsx): secreto únicamente en memoria; se retiran fragmento/query y estado del historial. POST solo al confirmar; destinos fijos, sin analítica. Éxito ofrece login, sin sesión implícita ni flujo inicial aún pendiente. |
| T049 | Completa | Suites originales, recorrido público real, fallos SMTP y cuotas aprobados; estado cuenta/token/entrega comprobado en PostgreSQL. V01/V02 funcionales, partes de V10/V13 según límites siguientes. |

Contratos: [API](../contracts/api.md), [UI](../contracts/ui.md), FR-001–004/022/023/029–031
de [spec](../spec.md). Atomicidad y regresiones de casos de uso: [T043–T045](us2-implementacion.md).
R06 de [research](../research.md#r06--enlaces-y-credencial-inicial) corrige exclusivamente la notación
obsoleta `#token=...`: el formato vigente del adaptador y las pruebas es `#` seguido
del secreto base64url de 43 caracteres. No se modificaron reglas ni endpoints.

## Resultados reproducidos en Docker

| Suite / comprobación | Resultado |
| --- | --- |
| T040 `registration.contract.spec.ts` | 45/45; los seis 404 de reenvío del bloque anterior pasan a verde |
| T041 `registration-concurrency.spec.ts` | 13/13; los tres 404 restantes pasan a verde |
| `us2-use-cases.spec.ts` | 16/16, incluida atomicidad y rollback |
| T042 `registration.spec.ts` original | 11/11; los diez fallos por UI ausente quedan resueltos |
| Casos adicionales de navegador, misma suite | 3/3: sustitución/segundo uso, vencimiento y reenvío genérico entre estados |
| T033 `login.spec.ts` | 21/21, con el router final |
| Regresiones API US1, sesiones, cuotas, SMTP, fixtures y HTTP | 152/152, ocho archivos |
| `mail-delivery.spec.ts`, condiciones normales de Mailpit | 25/25; leases, reinicio, máximo tres intentos y cuotas SMTP por destinatario/origen |
| `registration-delivery.spec.ts`, SMTP disponible | 2/2 |
| Misma suite, indisponibilidad SMTP real aislada | 2/2; conexión rechazada, sin detener Mailpit compartido |
| Unitarias y arquitectura | API 37/37; web 35/35, incluidas cuatro de captura del fragmento |
| Lint y compilación API/web | Aprobados; lint final sobre la imagen actualizada |
| Enlaces y formato | 118 enlaces locales sin rutas rotas; `git diff --check` aprobado |

No se omitieron casos ni quedaron fallos esperados en este bloque. El ensayo adicional inicial
omitió el montaje de `playwright.identity.config.ts`; se corrigió el comando. Un caso nuevo
detectó falta de respuesta del router a cambios de fragmento en la misma pantalla: se corrigió
el código. También se ajustó el harness para reactivar el scheduler entre casos y seleccionar
en Mailpit el mensaje cuyo digest corresponde al token vigente, conservando los mensajes
anteriores. Las aserciones originales permanecen intactas.

### Recorrido y estado final

En 360×800 y 1366×768: registro público de correo nuevo → captura SMTP en Mailpit → abrir
enlace sin consumir → confirmación explícita 204 → login 200 → `/me` autorizado. Antes de
confirmar, login 401; registro/confirmación no crean sesión. Se comprobaron campos inválidos,
recarga sin contraseña/secreto, ausencia de almacenamiento privado e historial con datos,
429 con espera y reenvío sin segunda alta, 503 real sin replay, enlace revocado/vencido/usado
y reenvío desde navegador que sustituye el anterior. No se generan entregas para correo
desconocido, cuenta inactiva o ya verificada. Las suites HTTP comprueban 20 altas simultáneas,
unicidad canónica sin overwrite, doble consumo y frontera exacta de 24 horas.

La prueba de red usa un override **local e ignorado** que resuelve `mailpit` a
`127.0.0.1` exclusivamente en el contenedor efímero de API. El adaptador SMTP real falla,
pero el registro responde 202 y deja cuenta, token y entrega PENDING con cero intentos antes
del ejecutor. Después: intentos 1/2 pendientes con esperas de 60/300 segundos; tercero FAILED
y payload limpio; ningún cuarto contacto. Cuenta pendiente y mismo token/caducidad.
El reloj SQL acelerado pertenece únicamente al esquema de pruebas.
Con SMTP disponible se verifica SENT y limpieza; T041 comprueba recuperación de un fallo
controlado mediante envío real del **mismo enlace**. Cuota SMTP agotada pospone sin gastar
intento y no bloquea admisión pública. Aceptación SMTP y commit de SENT son efectos separados:
una interrupción entre ambos puede duplicar el correo; no se garantiza entrega exactamente una vez.

## Reproducción y ensayo manual conservado

El bloque se verificó en contenedores con fuentes montadas; tras reconstruir las imágenes
también se ejecutaron lint y la suite del ejecutor. Para reproducir con las imágenes actualizadas:

```powershell
docker compose exec -T api npm run lint
docker compose exec -T api npm run build
docker compose exec -T api npm run test:unit
docker compose exec -T -e APP_ENV=test api sh -c 'cd apps/api && npx vitest run tests/integration/registration.contract.spec.ts tests/integration/registration-concurrency.spec.ts tests/integration/us2-use-cases.spec.ts tests/integration/registration-delivery.spec.ts tests/integration/mail-delivery.spec.ts'
```

Las suites API se ejecutaron también desde contenedores efímeros con fuentes montadas.
Las 152 regresiones corresponden a `login.contract`, `session-lifecycle`, `us1-use-cases`,
`us1-read-logout.contract`, `rate-limits`, `mail-adapters`, `fixture-safety` y `http-security`.
Todas usan esquemas nuevos `t_*` en la base de pruebas y limpieza dirigida.
Para repetir el fallo SMTP crear `.cache/docker/compose.us2-smtp-outage.yml` con:

```yaml
services:
  api:
    extra_hosts:
      - "mailpit=127.0.0.1"
```

```powershell
docker compose -f compose.yml -f .cache/docker/compose.us2-smtp-outage.yml run --rm --no-deps -e APP_ENV=test -e TEST_SMTP_OUTAGE=true --entrypoint sh api -c 'cd apps/api && npx vitest run tests/integration/registration-delivery.spec.ts'
```

Navegador: composición de [T042](us2-pruebas.md), montando **API src/tests, web src/tests y
ambas configuraciones Playwright**; compilar API antes de ejecutar
`playwright test --config playwright.registration.config.ts` y
`playwright test --config playwright.identity.config.ts`. El volumen de artefactos Prisma
existente evita nuevas instalaciones. T042 utiliza cuentas nuevas del registro real para
el recorrido positivo, no fixtures habilitados que sustituyan ese flujo.

El ensayo manual de US1 sigue en `academia_v00_test`, esquema `manual_us1_05832d35725f`.
Comparación privada antes/después: las 12 cuentas y el archivo de credenciales se conservaron
sin cambios. Ninguna prueba sembró datos en ese esquema ni en desarrollo; no se borraron volúmenes.
API/web se reconstruyeron con el overlay existente. Para volver a levantarlas:

```powershell
docker compose -f compose.yml -f compose.override.yml -f .cache/docker/compose.manual-us1.yml up -d --wait api web
```

Web: `http://localhost:5173/login` y `/registro`; API: `http://localhost:3000/health/ready`;
Mailpit: `http://localhost:18025`. Las cuentas habilitadas se conservan en el archivo privado
local `.secrets/manual-us1/cuentas.json`; no se incluyen credenciales, digests privados
ni enlaces utilizables en esta evidencia.

## Límites y revisión arquitectónica

Controlador HTTP → caso de uso → emisión existente y contratos de persistencia; reglas de
elegibilidad en dominio y SQL/SMTP/cifrado en adaptadores. Pool, modelos y migraciones
reutilizados; sin proceso separado. Las features reciben el cliente desde app y no importan
backend ni composición. Lint de capas y sus pruebas pasan; no se detectaron nuevas infracciones.
Los catálogos y diagramas históricos no se redibujaron; su estado previo de UI/rutas de
registro y verificación debe contrastarse con este incremento, sin alterar C4 de sesiones.

Pendientes externos al checkpoint: purga/retención T095–T098 y cierre completo de V13;
protocolo temporal T087 para V10; V04-B/T061/T071; observación humana SC-001/T104,
aceptación ampliada y carga T105. Correo de producción, recuperación de contraseña,
administración y activación inicial no se declaran implementados. Los 1000 concurrentes
siguen pendientes. Siguiente bloque: **T050–T052**, escritura de pruebas US6.
