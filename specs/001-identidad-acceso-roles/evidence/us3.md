# US3: revisión de aceptación T094

**Fecha:** 2026-10-15. **Código revisado:** `fcea452`, rama
`feat/001-identidad-acceso-roles`, árbol inicialmente limpio. Alcance exclusivo T094;
sin cambios de aplicación, dependencias, fixtures persistentes ni tareas T095–T108.
**Estado:** evidencia técnica satisfactoria; aceptación manual pendiente de resultados.
T094 permanece `[ ]` y el checkpoint US3 abierto: **93 completas / 15 pendientes**.

## Dependencias y evidencia reutilizada

Se revisaron la [constitución](../../../.specify/memory/constitution.md),
[spec](../spec.md), [plan](../plan.md), [modelo](../data-model.md),
[API](../contracts/api.md), [UI](../contracts/ui.md), [V05](../verification.md)
y [quickstart](../quickstart.md). Sin AGENTS.md aplicable ni hooks de implementación;
checklist documental 16/16, sin modificarlo. Prerrequisitos resueltos con el script
PowerShell del repositorio usando `-ExecutionPolicy Bypass` solo para ese proceso.

T093 depende de T092 → T091 → T089/T090 → T088. Todas están marcadas completas;
T088 reúne los checkpoints P1 anteriores. La [escritura T089–T090](us3-pruebas.md)
registró 42/56 en interfaz antes de implementar: esos 14 fallos históricos **no** se
utilizan como aceptación. [T091–T093](us3-implementacion.md), incorporadas en `fcea452`,
registran la ejecución posterior satisfactoria de las mismas aserciones y sus regresiones.
Se contrastaron código/configuraciones, commit y resúmenes locales de
`.cache/us3-implementacion/`; no cambió código ejecutable desde aquella entrega.
Los resúmenes indican `baseRevision: 5e20aa1` porque el trabajo se probó antes del commit;
la evidencia de implementación y el diff de `fcea452` identifican los cambios probados.
No se atribuye una nueva ejecución a esos resultados reutilizados.

| Comprobación automatizada reutilizada | Resultado / procedencia |
| --- | --- |
| T089: [contrato propio](../../../apps/api/tests/integration/profile.contract.spec.ts) | 18/18; dentro de 105/105 HTTP: perfil 18, login 19, consulta/cierre 20, permisos 33, privacidad 5, CLI 6 y controles bootstrap 4. |
| T090: [accesibilidad](../../../apps/web/tests/e2e/accessibility.spec.ts) | 56/56, 28 escenarios × dos resoluciones; cero fallos esperados, inesperados u omitidos. |
| [Perfil complementario](../../../apps/web/tests/e2e/profile.spec.ts) | 8/8: sesión vencida/revocada, fallo SQL y reintento explícito, nombre largo y cierre. |
| Regresiones de navegador | 133/133: acceso 21, registro 14, inicial 14, administración 20, recuperación 36, seguridad 28. |
| Lint, builds, unidad y arquitectura | Aprobados; 120/120 unitarias y arquitectura. No se repiten para cambios exclusivamente documentales. |

Comandos y topología reproducibles en [T091–T093](us3-implementacion.md#verificación-en-docker):
HTTP/Nest y PostgreSQL reales, Mailpit local, esquemas `t_*` aislados y Chromium.
No se repiten U2, carga ni las suites completas: no hay cambios que invaliden sus resultados.

## Matriz V05 / SC-005

| Criterio | Evidencia y conclusión técnica |
| --- | --- |
| HU3.1 / FR-010: perfil propio sin secretos | T089 comprueba ocho campos exactos de UserView, cookie como identidad, fechas UTC y rechazo de filtros/cabeceras ajenos; 401 sin perfil. T090 comprueba nombre/correo/rol/estado, solo lectura y recarga en los tres roles. Satisfecho técnicamente. |
| HU3.2 / FR-011–012: único rol e inicio, enlaces según permiso, sin selector multirol | T089 verifica rol escalar; T090 comprueba inicio/perfil/logout por rol y gestión solo ADMIN. La matriz HTTP de 33 casos comprueba autorización backend, sin inferir permisos de enlaces ocultos; [US5](us5.md) conserva las denegaciones sin datos ni efectos. Satisfecho técnicamente. |
| HU3.3 / FR-021 / SC-005: flujos completos a 360×800 y 1366×768 | T090: registro → Mailpit → confirmación → login → logout; reenvío; verificación → provisional → contraseña propia → login; recuperación → Mailpit → reset → login; administración (filtros/paginación/alta/nombre/confirmación/cancelación/rol/estado); inicio/perfil/recarga. Todos pasan en ambos tamaños, sin scroll horizontal de página en estados visitados. Satisfecho técnicamente. |
| HU3.4 / FR-021 / SC-005: teclado, etiquetas, foco y errores textuales; nada solo hover | T090 usa Tab, Enter y teclas de selección; [arnés](../../../apps/web/tests/support/accessibility.ts) verifica nombre accesible, foco pintado dentro de pantalla, texto asociado y descripción accesible de errores. Registro/acceso/perfil/cierre y los demás recorridos usan teclado, sin click/hover/focus programático. Satisfecho técnicamente. |
| Validación manual mínima del quickstart | Williams confirmó que todavía no ha realizado la revisión. Se preparó el primer recorrido guiado; no hay resultados humanos ni aprobación. Aceptación global V05/SC-005 y cierre T094/US3 pendientes de incorporar y contrastar esa evidencia. |

## Revisión visual adicional del agente

Se generaron e inspeccionaron diez capturas, cinco estados por resolución: registro vacío
con errores, inicio ADMIN, perfil ADMIN, lista de cuentas y confirmación administrativa.
Texto largo de fixtures ajustado, perfil apilado en móvil, tarjetas legibles, errores con
texto, contorno de foco visible y botones de confirmación/cancelación sin superposición.
El scroll vertical de listado/detalle es esperado; no se observó recorte horizontal.
Es una inspección visual del agente, **no aceptación de una persona ni lector de pantalla**.
La revisión no pretende cubrir visualmente todos los estados de las 56 pruebas.

Captura con Playwright y fixture `us1-fixture`, fuentes de `fcea452` montadas, API compilada,
datos sintéticos y esquemas nuevos: **2/2 recorridos**, 28,2 s, sin fallos ni omisiones.
`controlsAccessible` recorrió los controles antes de cada captura. No hubo cambios de
cuentas manuales ni bootstrap en este procedimiento. Capturas y arnés temporal en
`.cache/us3-aceptacion/`, ignorados; ningún formulario capturado contiene contraseñas.
El primer intento falló antes de arrancar por montar un archivo nuevo bajo un directorio
de pruebas de solo lectura; se corrigió copiando las pruebas al directorio temporal y
montándolo completo. No se cuenta ese error de infraestructura como prueba funcional.

## Validación humana pendiente: pasos y resultados esperados

Origen: [quickstart, datos y escenarios de prueba](../quickstart.md#datos-y-escenarios-de-prueba), «Validación manual mínima».
V05/SC-005 fijan resultados de interfaz; el quickstart añade el recorrido manual.
No se exige aquí el estudio de diez personas de T104/SC-001/SC-010, que sigue separado.
Tampoco se afirma una auditoría completa de accesibilidad ni uso de lector de pantalla.

Usar una instancia de pruebas con fuentes de `fcea452` o revisión posterior contrastada,
Mailpit y cuentas ficticias; dos navegadores/contextos. El [ensayo manual conservado](../../../ops/local/manual-us1.md)
reutiliza imágenes anteriores: para esta revisión se añade el override local ignorado
`.cache/docker/compose.manual-t094.yml`, que monta las fuentes actuales de API/web y
recompila la API al arrancar; no reconstruye imágenes ni sustituye sus datos.
Usar cuentas desechables separadas para altas, reset y cambios de acceso; conservar las
cuentas/credenciales manuales originales. Repetir los recorridos a **360×800 y 1366×768**.

| Recorrido de la persona | Resultado esperado |
| --- | --- |
| En registro, enviar vacío; recorrer con Tab/Shift+Tab y completar nombre/correo ficticio/clave válida. Abrir Mailpit y confirmar; entrar, abrir perfil y cerrar. | Etiquetas y errores con texto; foco visible y controles alcanzables, sin depender de hover ni scroll horizontal. Confirmación explícita; perfil propio; tras logout, acceso protegido denegado. Registrar/acceder/perfil/cerrar solo con teclado. |
| Entrar con alumno, docente y ADMIN; revisar inicio/perfil, recargar e intentar gestión directamente como alumno/docente. | Un rol y una identidad; perfil de solo lectura sin secretos ni selector multirol. Gestión solo ADMIN; acceso directo no autorizado denegado sin datos privados. |
| ADMIN crea docente desechable; confirmar correo; sustituir provisional por contraseña propia y entrar. | Provisional retirada del formulario; no permite login ordinario; establecer clave no inicia sesión ni verifica correo automáticamente. Tras ambos requisitos, acceso docente. |
| Mantener dos sesiones del docente; recuperar desde Mailpit y establecer nueva clave; probar ambos contextos y clave anterior. | Reset sin auto-login; ambas sesiones anteriores y clave anterior rechazadas; nueva clave permite entrar. |
| ADMIN busca/filtra/pagina, consulta detalle y corrige nombre; cancela y confirma cambios de rol/estado; desactiva al docente e intenta acceso directo desde su contexto. | Controles y mensajes accesibles; cancelar no modifica; cambios confirmados se reflejan; cuenta desactivada sin acceso. Reactivar no recupera sesiones anteriores. No modificar el ADMIN propio. |

El quickstart también incluye comprobar primer ADMIN único: corresponde a V08/US6,
con [evidencia previa](us6.md), no a un nuevo bootstrap dentro del recorrido de interfaz
T094. No se pide repetirlo en este ensayo. T094 sí incluye **sustitución inicial**.
Retención/restauración/invalidación global (T095–T098), carga (T099–T103), diez participantes
(T104), tiempos de veinte accesos (T105) y regresión/cierre finales (T106–T108) quedan fuera.

Registro mínimo a aportar: **responsable/alias, fecha, commit servido, navegador/versión,
resolución, recorrido, teclado sí/no, resultado observado, incidencia y referencia saneada**.
Responsable previsto: **Williams**. Fecha de preparación: **2026-10-15**; fecha de ejecución
y navegador/versión pendientes de la primera respuesta real (no se presuponen).
No guardar contraseñas, cookies, tokens ni enlaces utilizables. Una respuesta «aprobado»
sin alcance/revisión no basta. Si falta un recorrido o falla, mantenerlo pendiente;
corregir/repetir solo lo afectado antes de cambiar la casilla.

### Primer recorrido preparado, aún no ejecutado por Williams

Web: `http://localhost:5173/registro`; Mailpit: `http://localhost:18025`.
Preparación vigente (archivos locales existentes, sin secretos en argumentos):

```powershell
docker compose -f compose.yml -f compose.override.yml -f .cache/docker/compose.manual-us1.yml -f ops/docker/compose.manual-ports.yml -f .cache/docker/compose.manual-t094.yml up -d --no-build --wait api web
```

El override de T094 monta `apps/api/src`, `apps/web/src`, `apps/web/index.html` y
`apps/web/vite.config.ts` en sus rutas `/workspace/…`, de solo lectura; API arranca con
`npm run build --workspace @academia/api` seguido de `node apps/api/dist/src/main.js`.
Mantiene los demás ajustes del ensayo. No ejecutar fixtures ni bootstrap para este recorrido.

1. En Chrome/Edge abrir ventana privada, F12 y modo de dispositivo con Ctrl+Shift+M;
   seleccionar Responsive y escribir ancho 360, alto 800, zoom de página 100 %.
   Después repetir el mismo recorrido a 1366×768, con otra cuenta nueva. Si el modo
   de dispositivo captura teclas, seleccionar primero el contenido de la página;
   desde entonces usar solo Tab/Shift+Tab, Enter/Espacio y escritura para la aplicación.
2. No usar una cuenta existente: registrar `Williams prueba T094`, correo ficticio
   `williams.t094.r1.movil.20261015@example.test` (usar `escritorio` en la repetición),
   y una contraseña de prueba propia de 12–128 caracteres, conservada privadamente.
3. Enviar el formulario vacío: esperar errores con texto; completar por teclado y enviar.
   Esperar confirmación genérica. Abrir en Mailpit el mensaje de ese destinatario; seguir
   su enlace y pulsar «Confirmar correo». Abrir el enlace no debe consumirlo por sí solo.
4. Acceder con la cuenta nueva; esperar Inicio de Alumno sin gestión de cuentas.
   Abrir «Mi perfil»: nombre/correo/Alumno/Cuenta activa, sin edición ni secretos.
   Recargar y comprobar el mismo perfil; cerrar sesión y abrir `/perfil` de nuevo:
   debe volver a login sin datos privados.
5. En todas las pantallas comprobar foco visible, etiquetas, texto de error, controles
   alcanzables sin hover ni desplazamiento horizontal. Se permite scroll vertical.
   Informar navegador/versión, fecha real, resolución, pasos completados y fallos.

**Resultado humano:** pendiente en ambas resoluciones. No iniciar el segundo recorrido
hasta recibir y registrar los resultados reales de este primero.

## Conservación, seguimiento y cierre

Antes del ensayo se comprobó por lectura la huella conjunta de las 12 cuentas manuales
y su archivo privado, sin imprimir valores; cuatro servicios healthy. Se conservaron
volúmenes, configuración e imágenes manuales y no se ejecutaron mutaciones en su esquema.
La primera lectura posterior no se ejecutó por fallo de revisión automática de permisos
(límite de uso, no determinación de inseguridad). Al reanudarse la autorización se encontró
Docker detenido; se inició y reanudó el ensayo sin reconstruir ni reinicializar volúmenes.
La lectura posterior comprobó **12 cuentas y archivo privado con huella idéntica**.

El [hallazgo intermitente de bootstrap](us5.md#hallazgo-intermitente-de-bootstrap-cli)
permanece **abierto, causa no confirmada**, seguimiento T106. Las regresiones reutilizadas
aprobadas y este ensayo sin bootstrap no lo resuelven.

Siguiente bloque: realizar con Williams un recorrido a la vez, incorporar resultados humanos
y decidir el cierre T094/US3. Solo entonces corresponde proponer T095; no se ejecuta aquí.
T104 y las demás verificaciones finales conservan su alcance y dependencias.

Comprobados 364 enlaces locales (incluidas anclas), 108 IDs únicos y el estado de
93 tareas completas / 15 pendientes. `git diff --check` sin errores. El commit se limita
a esta evidencia y al seguimiento en tasks.md, verification.md y README.md.
