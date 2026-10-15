# US7 · Checkpoint de recuperación de contraseña

Fecha: 2026-10-15. Rama `feat/001-identidad-acceso-roles`; base `46ed1d8`.
**T078–T081 completas; checkpoint funcional US7 comprobado en su alcance técnico.**
La aceptación con participantes T104 permanece pendiente. Dependencias T075–T077 comprobadas en
[implementación API](us7-implementacion.md); T072–T074 conservan sus aserciones originales.
Checklist documental 16/16; sin AGENTS.md aplicable, operación Git ni hooks pendientes.

| Tarea | Implementación o comprobación | Evidencia |
| --- | --- | --- |
| T078 | [ForgotPasswordPage](../../../apps/web/src/features/auth/forgot-password-page.tsx): validación orientativa, confirmación genérica, espera Retry-After y reintento manual. | T074 comprueba 202 equivalente para cuentas habilitadas, inexistentes, desactivadas y sin verificar; 429/503 reales, sin envío automático ni promesa de entrega. |
| T079 | [ResetPasswordPage](../../../apps/web/src/features/auth/reset-password-page.tsx) y montaje en [App.tsx](../../../apps/web/src/app/App.tsx). | Captura y retirada inmediata del fragmento mediante action-link; POST solo al confirmar, coincidencia local, limpieza de claves/secreto y enlace a login sin auto-login. Login y pantalla inicial ya ofrecían recuperación; AppRouter ya remonta al recibir otro fragmento. Se reutilizan sin cambios. |
| T080 | [credential-races](../../../apps/api/tests/integration/credential-races.spec.ts). | Siete casos con PostgreSQL real: login/reset; emisión y consumo frente a desactivación en ambos órdenes; solicitudes repetidas, cuotas compartidas y caducidad durante fallo SMTP. |
| T081 | Suites originales, recuperación en dos contextos y cierre de provisional vencida. | T072/T073/T074 verdes; comprobaciones adicionales y límites detallados abajo. |

## Resultados en Docker

| Comprobación | Resultado |
| --- | --- |
| T072 / T073 originales | 26/26 y 19/19. |
| Persistencia adicional de T076 | 4/4; rollback, provisional vencida, hash fuera de lock y cookie HTTPS. |
| T080 | 7/7 con fallo de transporte inyectado; 7/7 adicionales con adaptador SMTP real sin conexión desde el contenedor de ensayo. |
| Regresiones API | 191/191: login 19, sesiones 15, registro 45, concurrencia de registro 13, inicial 21, revocación administrativa 20 y auditoría 58. Con US7: 247/247. |
| T074 original | 14/14 inicialmente; 28/28 al ejecutar la suite completa en los proyectos móvil y escritorio. Los doce fallos por pantallas ausentes pasan a verde. |
| [UI adicional](../../../apps/web/tests/e2e/password-reset-ui.spec.ts) | 6/6: 503 con rollback y reintento manual; fragmento ausente/mal formado; longitudes inválidas sin POST, en ambos tamaños. |
| Navegador US1/US2/US6/US4 | 21/21, 14/14, 14/14 y 20/20: 69/69 finales. |
| [Provisional vencida del primer ADMIN](../../../apps/web/tests/e2e/password-reset-bootstrap.spec.ts) | 2/2: CLI real, rechazo de provisional vencida, Mailpit, verificación, recuperación y acceso normal, en ambos tamaños. |
| Unitarias / arquitectura | 114/114: API 69, web 45. |
| Lint / compilación | Ambos workspaces aprobados; lint final y configuración Playwright aprobados tras añadir las pruebas de cierre. |
| Enlaces / formato | 206 enlaces locales comprobados; git diff --check aprobado. Casillas contrastadas: 81 completas y 27 pendientes. |

La ejecución agrupada inicial dio 74/75: el control de correo US2 recibió un enlace de
un mensaje anterior del destinatario compartido. Un diagnóstico aislado reprodujo esa
selección y comprobó la captura del enlace nuevo con filtro explícito. Se corrigió la
invocación de regresiones: US2 pasó 14/14 con su configuración separada y destinatarios
propios, sin cambiar ninguna aserción original ni código productivo para acomodar el test.
Las demás 55 regresiones y seis casos adicionales ya habían pasado. No quedan fallos
funcionales esperados ni errores de entorno pendientes en las suites del bloque.
Son 36 ejecuciones de navegador US7 (28 originales, seis de UI y dos de bootstrap),
además de las 69 regresiones; no representan aceptación humana ni una prueba de carga.

## Comportamiento y concurrencia

El recorrido original captura el mensaje específico en Mailpit, retira el fragmento antes
de editar la contraseña y envía únicamente token/newPassword. Solicitar instrucciones
conserva las sesiones; confirmar elimina la cookie actual y revoca ambas sesiones previas.
La contraseña anterior falla, la nueva permite acceso; no se modifica correo, rol o estado.
Se comprueban recarga sin secreto, confirmación local distinta, enlace vencido, respuestas
genéricas, espera del servidor y fallo SQL sin reintento automático. Los casos negativos
se ejecutan a 360×800 y 1366×768, además de los recorridos positivos de ambos tamaños.
Se revisaron visualmente cuatro capturas locales de formularios vacíos: sin recortes ni
desplazamiento horizontal. Son revisión automatizada/asistida, no aceptación con participantes.

El recorrido de provisional vencida original usa una cuenta docente; el adicional parte
de un esquema vacío y crea el primer ADMIN mediante CLI/PTY real con entrada oculta.
Solo en sus datos de prueba se envejecen createdAt/provisionalExpiresAt por igual, conservando
el plazo de 24 horas; no se espera un día real ni se cambia el reloj del equipo.
La pantalla inicial rechaza la provisional vencida y remite a recuperación. Verificar,
recuperar y entrar con la nueva contraseña conserva rol, correo, estado y singleton de
bootstrap; la provisional no sirve para login ni establecimiento inicial. No se recrea
el administrador ni se añade un evento de auditoría no definido por el modelo.

T080 pausa un login después de verificar realmente Argon2 y antes de crear sesión. Reset
confirma authVersion nueva; el login antiguo falla y solo un acceso con la clave nueva crea
sesión de la versión actual. Las dos sesiones anteriores reciben 401. Las barreras de
emisión/consumo conservan las consultas y locks reales: si desactivación confirma primero,
no se emite/consume; si confirma después, revoca lo emitido o conserva el consumo confirmado.
Reactivar nunca rescata el enlace ni las sesiones. Las marcas consumedAt/revokedAt son excluyentes.

Con SMTP indisponible, cinco solicitudes admitidas reemplazan solo reset, conservan cuenta
y sesiones, y respetan uno/minuto y cinco/hora; las rechazadas no reemplazan enlaces.
Veinte admisiones por origen suman verificación/recuperación, incluidos destinatarios
inexistentes. Recrear adaptadores no libera cuota. La fase SMTP sigue separada: backoff de
60/300 segundos, sin ampliar los 30 minutos originales; al vencer se cancela y limpia
payload sin contactar el transporte. El ensayo real usa un override temporal extra_hosts
que resuelve mailpit a 127.0.0.1 únicamente en el contenedor transitorio; Mailpit compartido
permanece activo. SMTP aceptado y commit del envío siguen siendo hechos diferentes:
no se garantiza entrega exactamente una vez.

## Trazabilidad y límites

- **V11:** requisitos FR-024/030/032/033 comprobados por contratos, concurrencia y navegador;
  verificación obligatoria y uso limitado al propósito se reúnen con [US2](us2.md).
- **V15:** login frente a reset comprobado aquí; rol/desactivación y confirmación frente a
  desactivación conservan su evidencia de [US4](us4.md) y regresión actual.
- **V10/V13:** cuotas, correo y caducidad de este recorrido comprobados. Comparación temporal
  T087 y retención/purga T095 permanecen pendientes; no se cierran esos escenarios íntegros.
- **SC-010:** invalidación de contraseña anterior y dos sesiones, y acceso con la nueva
  comprobados automáticamente. La observación de diez participantes sigue en **T104**;
  no se declara realizada ni se miden aquí sus tres minutos de interacción.
- US5, US3, restauración, aceptación transversal y carga conservan sus tareas. No hay
  capacidad demostrada de 1000 usuarios concurrentes ni integración académica/pagos/video.

## Arquitectura, aislamiento y reproducción

La UI adapta formularios/respuestas mediante HTTP, Feedback y action-link existentes;
las decisiones de elegibilidad, consumo, cuotas y permisos continúan bajo autoridad del
backend. No se modifican dominio, aplicación ni adaptadores productivos en este bloque.
Lint y la prueba de límites de importación no detectan nuevas infracciones; la revisión
integral VA sigue en T085. Catálogo/diseño/C3 conservan el corte declarado hasta T058 y
descripciones de administración/recuperación pendientes; requieren sincronización posterior,
sin modificar diagramas aquí.

Ensayos en contenedores Linux transitorios de [identity-tests](../../../ops/docker/compose.identity-tests.yml),
fuentes/tests/package.json API actuales montados, runtime Prisma existente y migraciones
desplegadas en esquemas nuevos t_*. No se añaden dependencias ni migraciones. Las cuentas,
credenciales, volumen y configuración del ensayo manual se conservan; sus imágenes no se
reconstruyen para estas pruebas. Reportes crudos solo en /tmp del contenedor; capturas
vacías/herramientas temporales permanecen ignoradas en .cache, sin secretos en la evidencia.

Antes de la pausa se comprobaron 12 cuentas manuales y la disponibilidad del archivo
privado de credenciales. Al reanudar, Docker estaba detenido y Windows reservaba
55411–55510, incluido el puerto PostgreSQL 55432. No se cambió la configuración del equipo
ni se recreó el volumen manual. La comprobación pendiente de US2 se realiza en el proyecto
temporal academia-us7-closure, con PostgreSQL/Mailpit sin puertos publicados y volumen nuevo.
No se acredita una comparación de huellas antes/después entre sesiones ni disponibilidad
del ensayo manual tras la pausa: su arranque queda impedido por ese puerto.
Se comprobó que los volúmenes originales de PostgreSQL y credenciales siguen presentes;
el proyecto temporal usa otro volumen. No se modifica .env ni el puerto configurado.

Operación: [Docker](../../../ops/docker/README.md) y [reproducción previa](us7-implementacion.md#arquitectura-y-reproducción).
Después de compilar API, ejecutar en apps/api:

```sh
npx vitest run tests/integration/password-reset.contract.spec.ts tests/integration/password-reset-concurrency.spec.ts tests/integration/password-reset-store.spec.ts tests/integration/credential-races.spec.ts --maxWorkers=1
```

En apps/web: `npx playwright test --config playwright.password-reset.config.ts`;
la configuración versionada selecciona ambos tamaños y las comprobaciones adicionales.
Las regresiones originales se ejecutan con sus configuraciones propias de identidad,
registro, primer administrador y administración. Para reproducir SMTP sin conexión, usar
el mismo montaje API en un contenedor run --rm --no-deps, APP_ENV=test y
TEST_MAILPIT_DOWN=true con este override temporal; ejecutar credential-races.spec.ts:

```yaml
services:
  api:
    extra_hosts:
      - mailpit=127.0.0.1
```

Siguiente bloque: T082–T084, escritura de pruebas US5, sin adelantar el cierre transversal.
