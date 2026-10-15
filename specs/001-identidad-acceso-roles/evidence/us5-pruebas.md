# US5 · Escritura de pruebas de protección y privacidad

Fecha: 2026-10-15. Rama `feat/001-identidad-acceso-roles`; base funcional `067bd7a`.
T082–T084 corresponden a escritura y ejecución de pruebas, no al checkpoint US5.
Dependencia [T081](us7.md) comprobada; checklist documental 16/16, sin AGENTS.md aplicable,
operación Git ni hooks pendientes. Las tareas T085–T088 conservan su alcance y dependencias.

| Tarea | Pruebas escritas y ejecutadas | Resultado y pendiente |
| --- | --- | --- |
| T082 | [permission-matrix](../../../apps/api/tests/integration/permission-matrix.spec.ts): visitante, tres roles, sesiones revocadas, 30 minutos/8 horas exactos, versión anterior, estados no habilitados, credenciales de sesión inválidas y Bearer. Seis operaciones administrativas con destinos conocidos/desconocidos, consulta propia, campos inyectados y ausencia de perfiles ajenos/editables. | **33/33 aprobadas**. Las denegaciones tienen igual código/mensaje, sin datos ni cambios en snapshots privados; ADMIN cuenta con controles positivos y 404 después de autorizar. |
| T083 | [secret-redaction](../../../apps/api/tests/integration/secret-redaction.spec.ts): registro, verificación/reenvío, reset, inicial, login/logout, expiración, gestión, fallos de BD/SMTP y bootstrap CLI. | **5/5 aprobadas**, incluida ejecución final tras reforzar listas de campos. Auditoría y registros U1 comprobados; invalidación global se mantiene en T096/T098. |
| T084 | [csrf](../../../apps/web/tests/e2e/csrf.spec.ts), con [configuración propia](../../../apps/web/playwright.security.config.ts): formularios nativos desde otro origen, fetch simple/JSON, preflight, sandbox de Origin null y controles HTTP de cabeceras que el navegador no permite falsificar. | **16 ejecutadas: 6 aprobadas y 10 fallos funcionales esperados por CORS del proxy Vite**. Corregir en la integración US5; no se modifica código productivo en este bloque. |

Fuente normativa: [US5](../spec.md), contratos [HTTP](../contracts/api.md)/[pantallas](../contracts/ui.md),
[modelo U1](../data-model.md#registros-operativos-y-de-seguridad-sin-tabla-de-cuentas-ni-fk)
y [verificación V09/V12/V14](../verification.md). No se modifican esos requisitos ni se añaden permisos.

## Privacidad y estado persistido

Se reutilizan us2Dataset/us1Http, cookies, cifrado, CLI/PTY y adaptadores existentes en
esquemas nuevos t_*. Alumno B es un fixture adicional de la matriz, no una cuenta manual.
Las comparaciones de snapshots son booleanas; nunca se imprimen filas con hashes.

Las respuestas tienen envoltorios y proyecciones cerrados. UserView permite nombre/correo
en respuestas autorizadas; no se confunden esos datos contractuales con una fuga de secretos.
Los 202/errores no revelan los datos personales señuelo. Contraseñas, provisionales, hashes,
tokens/digests, enlaces, ciphertext y claves quedan fuera de cuerpos y registros. Set-Cookie
se comprueba por separado: secreto solo en login válido; eliminación solo en logout/reset.
Los valores de cookies no se incorporan a evidencia ni informes.

AuditEvent contiene únicamente los campos/acciones aprobados, actor/destino existentes,
correlación, resultado y transiciones de enums; no guarda valores de nombres/correos.
Los registros privados y console se inspeccionan con señuelos, incluidas cabeceras recibidas
y causas de fallos de BD/SMTP. UUID desconocidos son referencias sin FK; un identificador
mal formado se omite. La regresión audit prueba además la ausencia de lookup del destino,
igual esquema de denegación y rollback obligatorio si falla auditoría; un logger fallido
conserva la respuesta pública y los cambios previamente confirmados.

Bootstrap se ejecuta realmente mediante entrada oculta en un esquema vacío separado.
LOCAL_OPERATOR se correlaciona con SYSTEM_BOOTSTRAP, sin User ficticio; repetir no crea
otro usuario. Su salida operativa admite ID/correo según contrato, nunca credenciales.
No se anticipa el comando de invalidación de restauración ni su aceptación V16.

## Fallos funcionales de T084

La [fixture](../../../apps/web/tests/support/us2-fixture.ts) expone únicamente al runner la
URL de la API real para contrastar la ruta directa con el proxy; no añade endpoints ni
accesos de prueba a producción. Se comprueban estas observaciones:

- API directa: las doce mutaciones hostiles y sus preflight devuelven 403 sin concesiones
  CORS ni efectos. El control del mismo origen permite login, consulta y escritura administrativa.
- Proxy: para orígenes locales ajenos o el alias 127.0.0.1 aparecen cabeceras CORS que el
  contrato prohíbe. El preflight recibe 204 y permisos del proxy antes de llegar a la API.
- Los tres tipos de formulario nativo conservan 415, incluso enviando cookie real; los
  errores JSON conservan 403. El fallo de esos casos es la concesión CORS añadida.
- En esta ejecución fetch con credenciales no expone la respuesta al JavaScript hostil;
  no se demuestra una fuga de perfil. Ello no satisface la regla de no conceder origen.
- Origin ausente/null y sandbox opaco, GET/HEAD sin consumo y retirada del fragmento se
  ensayan sin mutaciones. Los casos que atraviesan el proxy fallan también por sus cabeceras.

Las aserciones CORS usan expect.soft para completar todas las combinaciones y los snapshots;
siguen fallando y no se omiten. El marcador US5_PENDING_PROXY_CORS solo identifica presencia
real de cabeceras prohibidas o un preflight 204 con permisos; cualquier otro error se trata
como inesperado. **Playwright termina en rojo (exit 1)**: el resumen separado clasifica
6 aprobadas/10 esperadas/0 inesperadas, sin convertir la suite en aprobada.

La configuración actual de [Vite](../../../apps/web/vite.config.ts) no cierra expresamente
CORS. Su corrección pertenece a la integración de seguridad posterior; no se modifica
para conseguir verde en una fase que exige escribir pruebas primero. V14 y US5 siguen
pendientes; VA/T085, navegación/protección de contenido T086, temporal T087 y checkpoint
T088 no se consideran completados por esta entrega.

## Verificación y reproducción

| Comprobación | Resultado |
| --- | --- |
| Matriz nueva / privacidad nueva | 33/33 y 5/5: 38 casos distintos. |
| Regresiones API | 248/248: administración 62, audit 58, transporte 17, inicial 21, login 19, reset 26 y registro 45. Con las nuevas: 286 comprobaciones distintas aprobadas. |
| Unitarias y arquitectura existentes | 114/114: API 69, web 45. No sustituyen VA integral. |
| Lint y compilación | API/web aprobados; config y pruebas Playwright comprobadas con ESLint. |
| Regresiones de navegador | 71/71: US1 21, US2 14 y US7 36, con runners separados y sin fallos esperados o inesperados. |
| Enlaces / formato / seguimiento | 234 enlaces locales, git diff --check aprobado y casillas contrastadas: 84 completas, 24 pendientes. |

El primer intento de privacidad corrigió su preparación: respetar el minuto entre
admisiones también para una cuenta ya verificada, adelantando solo el reloj del esquema
de prueba. No se cambió la cuota ni una aserción para acomodar una regla distinta.
Los errores de preparación/sintaxis encontrados fueron resueltos; no se clasifican como
funcionalidad pendiente. Sin instalaciones, migraciones nuevas ni reportes sensibles versionados.

Usar [Compose de pruebas](../../../ops/docker/compose.identity-tests.yml) y
[Docker](../../../ops/docker/README.md), con fuentes/tests actuales montados y el runtime
Prisma ya disponible. Compilar API antes de las integraciones:

```sh
npx vitest run tests/integration/permission-matrix.spec.ts tests/integration/secret-redaction.spec.ts --maxWorkers=1
```

En apps/web: `npx playwright test --config playwright.security.config.ts`.
Reportes crudos solo en /tmp del contenedor transitorio; sin trazas, vídeos ni capturas
automáticas. Las regresiones utilizan sus configuraciones propias, sin compartir runner
entre historias ni borrar mensajes de Mailpit ajenos al ensayo.

La recuperación operativa tiene un commit separado y se documenta en
[reanudar el ensayo manual](../../../ops/local/manual-us1.md). El volumen y credenciales
manuales no se montan en los contenedores de pruebas. La comparación privada antes/después
confirmó la misma huella y 12 cuentas. API/web y ambos servicios de apoyo permanecen
saludables; ready y web responden 200. No se publica esa huella ni el contenido del archivo
de credenciales. El puerto manual actualizado es 55532; el interno sigue siendo 5432.

Siguiente bloque: T085, revisión de dependencias VA; después integración de seguridad
T086 y corrección del CORS local detectado, conservando T087/T088 y el cierre final.
