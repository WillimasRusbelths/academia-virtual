# US2 — Emisión, registro y confirmación de correo

Fecha: 2026-10-14. Rama: `feat/001-identidad-acceso-roles`.
Bloque T043–T045; depende de la [escritura T040–T042](us2-pruebas.md).
**US2 no está completa**: faltan reenvío T046, UI T047–T048 y aceptación T049.

| Tarea | Estado y comportamiento comprobado | Pendiente fuera del bloque |
| --- | --- | --- |
| T043 | Completa. Cuota ADMISSION antes de locks de User; origen configurado, secreto aleatorio y payload cifrado; token/entrega en un commit. Reemplaza solo el mismo propósito no consumido, incluidos vencidos; conserva revocaciones previas y cancela entregas activas. Sin cuota no escribe ni revoca. El ejecutor existente reutiliza la entrega y el token. | Exponer el reenvío mediante T046; flujos de recuperación posteriores. |
| T044 | Completa. POST /api/v1/auth/register montado, DTO estricto y solo STUDENT. Normalización/Unicode/hash existentes, unicidad y ausencia de overwrite. Alta admitida: cuenta/token/entrega juntos; sin cuota: cuenta pendiente sin token/entrega y 429. Duplicados con idéntica regla de cuota/respuesta y sin emisión adicional. | Formulario T047. |
| T045 | Completa. POST /api/v1/auth/verification/confirm montado. Locks User → token; relectura, propósito, estado, snapshot y caducidad; consumo/verificación juntos. Un solo éxito concurrente; 400 uniforme para enlaces inválidos. No modifica contraseña, rol, versión ni sesiones y no emite cookie. | Confirmación y fragmento en la UI T048. |

Fuentes: [emisión](../../../apps/api/src/modules/identity/application/issue-action-link.ts),
[registro](../../../apps/api/src/modules/identity/application/register-student.ts),
[confirmación](../../../apps/api/src/modules/identity/application/verify-email.ts),
[reglas](../../../apps/api/src/modules/identity/domain/action-link.ts),
[token/entrega](../../../apps/api/src/modules/identity/infrastructure/action-token-store.ts),
[alta persistida](../../../apps/api/src/modules/identity/infrastructure/registration-store.ts),
[consumo persistido](../../../apps/api/src/modules/identity/infrastructure/verification-store.ts).
Requisitos: FR-001–FR-004, FR-023, FR-026 y FR-029–FR-031;
[contrato HTTP](../contracts/api.md) y [modelo](../data-model.md).

## Pruebas en Docker

| Suite/comprobación | Resultado |
| --- | --- |
| T040 original, contratos | 39/45 aprobadas: 38 pasan de rojo a verde; 6 fallos esperados de reenvío ausente |
| T041 original, concurrencia/enlaces | 10/13 aprobadas: 8 pasan de rojo a verde; 3 fallos esperados de reenvío ausente |
| [Pruebas nuevas de atomicidad](../../../apps/api/tests/integration/us2-use-cases.spec.ts) | 16/16 aprobadas |
| Regresiones HTTP/US1, cuotas, correo y fixtures | 152/152 en ocho archivos; incluye T031 19/19 y T032 15/15 |
| T033 Chromium US1 original y adicionales | 21/21 aprobadas |
| T042 Chromium US2 | 1 control aprobado y 10 fallos esperados: formulario ausente o fragmento sin retirar; no se omiten casos |
| Unitarias API/web, incluidas arquitectura y protocolo de transacciones | 37/37 y 31/31 aprobadas |
| Lint API/web y compilación API/web | Aprobados |

Los nueve fallos HTTP restantes se clasificaron individualmente como 404 de
`/auth/verification/request`. Los diez fallos de navegador pertenecen a T047–T048,
sin errores de entorno. Los pasos posteriores al primer fallo todavía no se alcanzan.
La ejecución final conjunta de API contiene 226 casos: 217 aprobados y nueve fallos
esperados. Las suites con conducta pendiente conservan código de salida 1.

Se comprobó registro → pendiente rechaza login → confirmación explícita → login mediante
HTTP real y PostgreSQL, sin usar el flujo para declarar lista la UI. Las pruebas originales
cubren 20 registros canónicos simultáneos, doble consumo, 24 h menos 1 ms/exactas,
propósito/snapshot/estado, DTO y respuestas seguras.

Las pruebas nuevas comprueban payload cifrado y digest, conservación de cuenta sin cuota,
rollback de cuenta/token si falla MailDelivery, rollback de consumo si falla User,
reemisión vigente/vencida/revocada, conservación de tokens consumidos/otro propósito,
claims antiguos que no pueden confirmar tras cancelación y cuota sin esperar un User
bloqueado. Triggers reales inducen fallos al COMMIT: conflicto abortado permite dos
reintentos y deja una sola alta; fallo no recuperable deja cero efectos. Dobles del
[protocolo pg](../../../apps/api/src/modules/identity/infrastructure/action-transaction.test.ts)
verifican acuse incierto sin replay, límite de tres intentos y descarte si falla rollback;
no equivalen a cortar físicamente la red. Una aceptación SMTP ya ocurrida no puede
deshacerse: no se garantiza entrega exactamente una vez.

**Corrección de preparación T040:** el ensayo que compara 202 nuevo/duplicado ahora
avanza 60 s antes de la segunda admisión. El contrato exige 429 para cualquier correo
sin cuota; antes esperaba 202 dentro de esa ventana. Se conservan las aserciones de
respuesta equivalente, cuenta intacta y ausencia de token nuevo. Los escenarios 429
permanecen y pasan, incluido alta nueva pendiente sin envío.

## Arquitectura, reproducción y límites

Controladores adaptan DTO/IP/respuestas; aplicación coordina credenciales/admisión;
dominio decide elegibilidad/caducidad; infraestructura implementa locks y commits.
La factory de emisión permite compartir la escritura con el alta sin exponer pg al
núcleo. Interfaces pequeñas; dependencias externas solo en adaptadores/composición.
Se reutilizan pool, cuotas, Argon2id, cifrado y ejecutor internos. Lint y pruebas de
capas pasan; no hay nuevas infracciones ni cambios de estilo, Docker o esquema.

Se usan fixtures y schemas `t_*` nuevos con las cuatro migraciones existentes. No se
ejecutó migrate:dev, reset ni borrado de volúmenes. La configuración manual US1 se
conserva, con su imagen anterior y schema `manual_us1_05832d35725f`; este bloque se
compila y prueba en contenedores temporales. No se incluyen secretos ni reportes.
Se mantiene el formato `#` seguido del secreto base64url de 43 caracteres que validan
el cifrado y los fixtures vigentes; la notación `#token=...` de R06 requiere sincronización
documental posterior. No se cambia el contrato ni la decisión en este bloque.

Reproducción de las suites nuevas, desde la raíz con servicios saludables:

```powershell
docker compose run --rm --no-deps -e APP_ENV=test --volume "${PWD}/apps/api/src:/workspace/apps/api/src:ro" --volume "${PWD}/apps/api/tests:/workspace/apps/api/tests:ro" --entrypoint sh api -c "npm run build --workspace @academia/api && cd apps/api && npx vitest run tests/integration/registration.contract.spec.ts tests/integration/registration-concurrency.spec.ts tests/integration/us2-use-cases.spec.ts"
```

Para Chromium reutilizar [el comando T042](us2-pruebas.md), que monta el backend vigente.
Siguiente bloque: **T046**, reenvío HTTP; después T047–T048 y aceptación T049.
V01/V02/V10/V13 completos, mediciones temporales, carga de 1000 concurrentes y
publicación siguen pendientes.
