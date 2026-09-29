# Estrategia de verificación de identidad

Estado: V00 nativo aprobado; V00-L y escenarios funcionales V01–V16 pendientes.
Evidencia: [compatibility.md](../../ops/local/compatibility.md).
La revisión del checklist de especificación no equivale a estas pruebas. Referencias:
[spec](spec.md), [API](contracts/api.md), [datos](data-model.md), [guía](quickstart.md).

Revisión: 2026-09-24. Versiones y herramientas propuestas requieren la comprobación inicial
V00; no se la considera ejecutada por haber contrastado documentación oficial.

Precisión documental 2026-09-25: cierre de escritura de pruebas, desglose de V04, canales
de auditoría/operación y protocolo temporal. Ningún escenario se ejecutó con esta revisión.

**Actualización R12 — 2026-09-27:** desarrollo nativo Windows con Node, PostgreSQL 16.14 y Mailpit. Docker/WSL pendientes, fuera de la ruta crítica local; causa del incidente de arranque no determinada. Docker en Linux se conserva para despliegue futuro. V00-L se verifica temprano, tras V00 y antes de US1/T031 (checkpoint T030), sin contratar servicios. Procedimiento vigente: [native.md](../../ops/local/native.md); resultados: [compatibility.md](../../ops/local/compatibility.md). No se modifica el alcance funcional ni se afirma capacidad demostrada.

## Comprobaciones previas para la implementación futura

**V00 — Compatibilidad práctica:** ejecutar primero la tarea futura descrita en quickstart:
instalación sin conflictos, lockfile, compilación frontend/backend, prueba de metadatos de
Nest y componentes, cliente Prisma generado, migración de ensayo y lectura/escritura con
rollback en PostgreSQL real. Incluir Argon2 y captura SMTP local. Sin esos resultados, la
combinación de versiones permanece candidata. V00 usa PostgreSQL 16.14/Mailpit nativos. Docker/WSL Windows sigue pendiente y no
bloquea este ensayo. El resultado SQL aportado por el usuario no sustituye Prisma/rollback.

**V00-L — Linux temprano:** después de V00 y antes de US1/T031, checkpoint T030,
repetir instalación/build/smoke/Prisma/transacción/Argon2/SMTP en Linux con Docker, versiones
fijadas y bases nuevas. Registrar diferencias de rutas, binarios nativos y configuración.
Pendiente separado; no es capacidad ni despliegue. Procedimiento: ops/local/native.md.

**VA — Capas del monolito:** revisar dependencias según plan.md. Controladores/guards HTTP
no consultan Prisma ni implementan reglas de rol, último administrador, vigencia o consumo;
aplicación no recibe Request/Response ni importa SQL/SMTP; dominio no importa Nest/Prisma.
Las reglas deben poder probarse sin HTTP ni BD; infraestructura prueba transacciones con BD.
Revisar que alta/reset/cambio de acceso compartan un commit atómico, que HTTP y CLI invoquen
los mismos casos de uso y que no existan ciclos entre módulos o interfaces que solo reenvíen
llamadas. Son verificaciones futuras de código, no una afirmación sobre código inexistente.

## Capas de pruebas

- **Unidad — Vitest:** normalización de correo, límites Unicode sin truncar contraseñas,
  reglas de roles/estado, cálculo de expiración, ventanas móviles, clasificación SMTP.
  Reloj controlado solo en tests; no añadir un parámetro HTTP que permita adelantar el reloj.
- **Integración — Nest, Supertest y PostgreSQL real:** migraciones, constraints, consultas
  parametrizadas, carreras y transacciones. No sustituir la BD por SQLite ni mocks para
  demostrar unicidad, locks, consumo único o revocación.
- **Contratos:** DTOs estrictos, status/códigos, headers, cookies, origen/CSRF y ausencia de
  secretos. Afirmar respuesta y estado persistido, no solo el HTTP recibido.
- **Navegador — Playwright:** flujos con Mailpit local, cookies y las resoluciones exigidas;
  pruebas de navegación, teclado y limpieza de pantallas tras 401. Sin envíos reales.
- **Carga — k6:** HTTP de identidad y métricas del host; separado de aceptación funcional
  y de los futuros escenarios de matrícula, Socket.IO y consumo de segmentos HLS.

Las tareas que **escriben** pruebas pueden completarse cuando la suite es ejecutable y se
documenta la aserción que falla por la conducta aún ausente. Ese resultado habilita implementar
su dependencia, pero no aprueba la prueba ni la historia. Fallos de compilación, importación,
conexión, fixtures o configuración no cumplen ese criterio. Una prueba de regresión de conducta
ya implementada puede pasar desde el comienzo: no introducir un fallo artificial. Las tareas
de aceptación/checkpoints exigen resultados satisfactorios después de implementar.

## Matriz mínima de aceptación y trazabilidad

| ID | Requisitos / criterio | Escenario y resultado esperado |
| --- | --- | --- |
| V01 | FR-001–FR-003, SC-001/006 | Límites de datos, campos extra de rol y correos con case/espacios; 20 altas simultáneas del mismo correo dejan una cuenta y su contraseña original. Respuesta pública no distingue duplicado. |
| V02 | FR-004/029–031, SC-009 | Cuenta pendiente no puede entrar; token válido verifica solo su cuenta; 24 h exactas expira; GET de enlace no consume. Reenvío admitido invalida anterior; limitado no lo invalida. |
| V03 | FR-005–FR-009, SC-002/008 | Login por cada rol; cookie nueva; contraseña errónea/inexistente/desactivada/no verificada/provisional tienen igual 401; logout invalida solo una de dos sesiones. Reiniciar Nest conserva validez o revocación según BD. |
| V04 | FR-008/009, SC-002 | V04-A, US1/T032–T039: éxito a 29:59 renueva inactividad, rechazo no renueva, exactamente 30 min inactivo u 8 h absoluto deniega y limpia UI. V04-B, US4/T061/T071: expiración entre formulario protegido y envío no modifica datos ni reenvía la acción al volver a acceder. V04 completo requiere evidencia satisfactoria de A y B. |
| V05 | FR-010–FR-012/021, SC-005 | Perfil propio sin secretos; un rol y único inicio; sin selector multirol. Flujos a 360×800 y 1366×768 y por teclado; ninguna acción solo hover. |
| V06 | FR-013/014/025, SC-007 | ADMIN busca, crea y corrige nombre; provisional no se puede leer después, vence a 24 h y solo sirve para establecer clave. Verificación sigue obligatoria. Duplicado administrativo 409 y sin overwrite. |
| V07 | FR-015–FR-020, SC-003/004 | Desactivar/cambiar rol con dos sesiones: todas las solicitudes posteriores al commit denegadas. Reactivar no restaura cookies ni enlaces. Actor cuya sesión/rol cambió durante una escritura no puede confirmarla. |
| V08 | FR-017/027/028, SC-006 | Bootstrap simultáneo único, repetir tras desactivar no sirve; dos retiros de ADMIN simultáneos nunca dejan cero activos. Bloquear auto-desactivación y cambio propio de rol. |
| V09 | FR-018–FR-020, SC-003 | Alumno A contra B y docente contra administración por solicitudes directas, IDs conocidos/desconocidos: igual denegación sin datos ni cambios. Estado/rol del cliente no autoriza. |
| V10 | FR-022/023/031 | Cinco fallos en 15 min y bloqueo 15 min por pareja; reinicio no reinicia contadores. Correos conocidos/desconocidos consumen idéntica cuota. Probar fronteras 60 s/1 h y concurrencia, máximo cinco por destinatario y veinte por origen, sumando propósitos. |
| V11 | FR-024/030/032/033, SC-009/010 | Reset válido cambia contraseña y revoca sesiones/provisional; también limpia mustSetPassword y permite login de una cuenta verificada cuya provisional venció. Usado/alterado/expirado/propósito erróneo no cambia nada. Dos consumos simultáneos: un éxito máximo. Contraseña inválida no consume enlace; consumedAt y revokedAt nunca coexisten en un token. |
| V12 | FR-025/026/033, SC-007 | Inspeccionar AuditEvent de cambios aceptados y registros de seguridad/operación con secretos señuelo: listas permitidas del modelo, actor/destino válidos sin usuarios ficticios, ninguna contraseña/hash/cookie/token/enlace. Denegaciones a UUID existentes/inexistentes conservan respuesta y no consultan ni fallan por FK; fallo del logger no altera 401/403. Bootstrap LOCAL_OPERATOR se correlaciona con SYSTEM_BOOTSTRAP; invalidación global no crea AuditEvent de cuenta. Listados y perfil sin secretos. |
| V13 | FR-023/029–033 | Mailpit caído: registro pendiente, HTTP no espera SMTP; tres intentos máximos. Reinicio retoma trabajo; reenvío cancela entrega anterior; duplicado SMTP eventual conserva uso único. Se borra payload cifrado al terminar. Purga de tokens tras 24 h conserva metadatos de correo 7 días mediante FK nullable, sin dejar entregas activas sin token. |
| V14 | FR-018 + diseño CSRF | Desde otro origen: formularios simples, fetch con/sin cabecera y preflight; 403/415 sin efectos. Origen ausente/null, cabecera faltante o inválida rechazados. Un GET de correo nunca modifica cuenta. |
| V15 | FR-015/016/032 | Pausar login entre hash y commit y ejecutar reset/desactivación/cambio de rol: no crear sesión con versión antigua. Pausar confirmación de token frente a desactivación: no reactivar cuenta. |
| V16 | Principio X | Restaurar backup en BD separada, aplicar migraciones de prueba, verificar acceso/roles/constraints. Después de restaurar, revocar sesiones/enlaces previos y cancelar correos restaurados antes de abrir acceso. |

V04-B se prueba con formularios reales de administración (nombre y cambios de rol/estado),
después de cargar datos y antes de enviar: caducar la sesión mediante preparación de prueba,
comprobar 401, ausencia de cambios/auditoría de éxito, limpieza de UI y que un nuevo login
no reenvía lo pendiente. Repetir por inactividad y caducidad absoluta. No añadir una operación
de producto ficticia ni un endpoint para manipular el reloj. T039 solo puede informar V04-A
aprobado y V04-B pendiente; T071 reúne ambas evidencias para cerrar V04, sujeto a regresión.

### Protocolo temporal de enumeración — T087 (U2)

Es un criterio reproducible del proyecto, no una prueba de ausencia de todo canal lateral.
Se ejecuta tras implementar los flujos, con el control funcional de cuerpos/status/cabeceras
además del tiempo; no es el ensayo de carga ni sustituye sus percentiles.

1. **Cohortes de autenticación fallida, separadas por endpoint.** Para `/auth/login`, referencia:
   ACTIVE verificado con contraseña propia incorrecta. Comparar con correo inexistente;
   DISABLED con clave incorrecta y con clave coincidente; no verificado con clave incorrecta
   y coincidente; y cuenta con cambio inicial pendiente. Para esta última probar la credencial
   provisional coincidente y una incorrecta, ambas rechazadas por login. Para
   `/auth/password/initial`, referencia: ACTIVE con provisional vigente pero valor incorrecto;
   comparar inexistente, DISABLED con provisional coincidente/incorrecta, provisional vencida
   coincidente y provisional ya sustituida. Todas las muestras deben devolver el mismo 401
   genérico de su endpoint y no crear sesión ni cambiar cuenta. Un login o cambio inicial
   exitoso **no** pertenece a estos grupos, aunque sus tiempos se midan en otras pruebas.
2. **Condiciones fijas.** Registrar revisión/diff, lockfile, SO/hardware, configuración/pool,
   parámetros Argon2 y límites, topología, estado del worker/Mailpit y versión/semilla del
   runner. Sin otras cargas, debugger ni logs de cuerpos; mismo origen/topología y política
   de conexión para todas las clases, una solicitud en vuelo y pausa fija de 200 ms. Usar
   cuerpos válidos de igual tamaño, contraseñas de igual longitud/codificación y hashes con
   iguales parámetros (sales distintas normales), CSRF real y ninguna cookie de sesión.
   El reloj es real; no adelantarlo ni modificar parámetros de seguridad para esta medición.
3. **Muestras.** Tres rondas completas, cada una con 100 respuestas elegibles por clase,
   más 100 de un segundo grupo de referencia equivalente para controlar ruido. Antes de cada
   ronda, 10 solicitudes de calentamiento por clase con identidades separadas, no medidas.
   Crear los estados con fixtures restringidos; cada solicitud usa un correo distinto para
   no agotar su pareja correo/origen. Mantener la misma distribución de orígenes entre clases.
   Intercalar una muestra de cada clase en bloques con orden aleatorio de semilla registrada,
   no medir primero todas las inexistentes y después todas las existentes. No borrar
   contadores, reiniciar el proceso ni cambiar fixtures entre muestras para borrar cuotas.
4. **Límites y fallos.** Una respuesta 429 no se mezcla con 401/202: registrar cantidad/clase
   y Retry-After, esperar la ventana real y repetir la ronda completa, conservando evidencia
   de la ronda descartada. Un 5xx, timeout o ruido del grupo de control vuelve inconclusa
   la ronda. No descartar selectivamente muestras lentas. Un 200/204 inesperado o diferencias
   públicas de respuesta donde se exige equivalencia constituyen fallo funcional inmediato,
   no se arreglan filtrándolos del análisis. No deshabilitar límites, reducir Argon2,
   falsificar X-Forwarded-For ni añadir demoras distintas por estado de cuenta.
5. **Cálculo y decisión.** Medir con reloj monotónico desde envío hasta cuerpo completo.
   Por clase/ronda calcular mediana (media de los dos centrales) y p95 (ordenado, posición
   ceil(0.95*N)). Frente a la referencia, una diferencia absoluta de mediana superior a
   `max(20 ms, 10 % de la mediana de referencia)` o de p95 superior a
   `max(50 ms, 20 % del p95 de referencia)` cruza el umbral. Comparar también los dos grupos
   equivalentes de referencia con la misma regla para detectar ruido. Son umbrales de
   revisión fijados antes del ensayo; no una tolerancia universal de seguridad.
   Con tres rondas válidas: **fallo** si una clase cruza el mismo umbral, en la misma dirección,
   en al menos dos rondas; **sin señal detectada bajo este protocolo** si ninguna comparación
   cruza umbrales; los demás casos son **inconclusos**. Si hubo rondas inválidas o resultado
   inconcluso, diagnosticar condiciones y permitir una repetición completa de tres rondas;
   si persiste, queda pendiente con evidencia, sin seleccionar las mejores rondas ni relajar
   umbrales. Un fallo exige corregir trabajo asimétrico y repetir las tres rondas.
6. **Respuestas y evidencia.** Comparar status, código/mensaje/esquema de error y cabeceras de
   seguridad, ausencia de nueva sesión y estado BD. Normalizar solo Date y valores aleatorios
   de requestId/correlación, comprobando su formato; no normalizar diferencias de estado,
   contenido, cookies o Retry-After. Guardar muestras `{ronda, orden, clase, duración, status}`,
   semilla, cálculos, conteos de exclusión y motivos, sin cuerpos/credenciales/cookies/URLs
   secretas. Informe saneado en evidence/enumeration.md; datos temporales privados ignorados.

Registro, reenvío y forgot mantienen sus pruebas de equivalencia pública y cuotas y su
comparación temporal en T087: aplicar el mismo método **en cohortes 202 separadas por ruta**,
nunca mezcladas con autenticación 401. Referencia: solicitud elegible; comparar duplicado
para registro y estados inexistente/desactivado/ya verificado o no verificado según la ruta.
Usar identidades frescas para preservar la clase al registrar. Respetar 1/min y 5/h por
destinatario/propósito y 20/h por origen entre rutas: usar orígenes de red de prueba realmente
distintos y verificados por el backend o esperar ventanas reales, incluidos calentamientos;
nunca hacer pasar cabeceras por nuevas IP. Registrar ese calendario en el runner y equilibrar
las clases por origen. Si no puede completarse el muestreo, queda pendiente, no aprobado.
No se promete igualdad con respuestas 429 ni con solicitudes funcionalmente exitosas de login.
V03/V10 conservan sus resultados funcionales parciales, pero no se cierra la comprobación
temporal hasta cumplir el protocolo. Los valores y conclusiones se limitan al entorno medido.

SC-001 y SC-010 requieren además 10 participantes: 9 de 10 completan registro/recuperación
sin ayuda y en menos de 3 min de interacción activa; medir espera de correo separadamente.
SC-008 exige 19 de 20 accesos secuenciales dentro de 3 s desde envío hasta inicio visible.
Playwright no reemplaza estas observaciones de usabilidad con personas.

## Escenario de carga ID-LOAD-01: 1000 sesiones activas

**Objetivo propuesto:** investigar la capacidad de consultar identidad con 1000 cuentas
distintas concurrentes, incluyendo acceso gradual. No equivale a mil logins por segundo,
matrículas, espectadores de video ni conexiones de chat. Su aprobación final depende de D10.

1. Entorno aislado con 1000 cuentas STUDENT activas/verificadas, creadas por fixtures
   explícitos de prueba. Una cuenta distinta por VU usando `execution.vu.idInTest`; sin
   compartir un alumno ni una cookie. Contraseñas se generan fuera del repositorio.
2. Preparar calentamiento independiente de 20 cuentas, 1 min. Medición: incremento 0→100
   VU en 1 min; 100→500 en 2 min; 500→1000 en 2 min; meseta 1000 durante 10 min; descenso
   durante 2 min. Total medido 17 min. No sustituir VU alcanzados por VU configurados.
3. Cada VU inicia sesión una vez al activarse, verifica `GET /me` y después repite consulta
   cada 5–10 s con pausa aleatoria. Configurar `noCookiesReset: true` y mantener estado de
   login por VU para conservar su cookie entre iteraciones; el valor por defecto de k6 la
   vaciaría. No compartir cookies desde setup ni usar atajos de autenticación/hashes reducidos.
4. Comprobar que durante la meseta hay 1000 VU y 1000 sesiones distintas válidas realizando
   actividad, sin abandono silencioso por login fallido. RPS se mide por separado: no se
   deduce de “1000 VU”. k6 no se ejecuta dentro del mismo contenedor que la API.
5. Probar revocación en un escenario funcional separado; los 401 esperados de ese escenario
   no se mezclan con el error rate del tráfico válido de la meseta.
6. En cierre normal, enviar logout y comprobar rechazo cuando la iteración pueda completarlo.
   La interrupción o retirada de un VU no garantiza ejecutar limpieza; registrar los cierres
   efectivamente realizados y revocar al finalizar las sesiones restantes de esas cuentas
   mediante fixtures restringidos al entorno de prueba. V03 verifica logout independientemente
   del ramp-down. No usar esa limpieza posterior como evidencia de revocación durante la meseta.

Referencia del comportamiento del runner:
[k6 noCookiesReset](https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/#no-cookies-reset).

**Umbrales provisionales de diseño:** p95 de GET /me <500 ms, p99 <1000 ms; p95 de login
<3 s; <1 % errores inesperados en solicitudes válidas; 0 filtraciones/cruces de identidad,
0 sesiones aceptadas tras revocación, 0 duplicados. Alcanzar 1000 cuentas activas es condición
independiente, aunque los percentiles pasen. Requieren confirmación con la rúbrica, no son
una afirmación de capacidad ni sustituyen los criterios funcionales SC-001–SC-010.

## Escenario ID-LOAD-02: costo de autenticación

Ensayo separado con 100 cuentas distintas, cada una con login → /me → logout y pausa de 5 s;
escalones de 10, 25, 50 y 100 VU durante 2 min cada uno. Observar hashes concurrentes, cola
acotada, 503, CPU y memoria. Detener si no se mantiene la espera máxima de 5 s o si falta
memoria; registrar el límite encontrado. No elevar Argon2 ni bajar su seguridad sin medición.
Este escenario no exige alcanzar 1000 logins simultáneos; caracteriza un cuello de botella
distinto y ayudará a definir el escenario académico combinado.

## Evidencia y condiciones de ejecución

- Registrar commit, diferencias locales, lockfile/digests, SO, CPU, RAM, disco, límites de
  contenedores, versión de Node/BD/k6, pool de conexiones, Argon2, red y generador de carga.
- Registrar duración/rampas, VU y sesiones realmente alcanzadas, RPS, p50/p95/p99, errores
  por clase, CPU/RAM/IO de API/BD/generador, conexiones y bloqueos PostgreSQL, cola SMTP y
  número de cuentas/sesiones antes/después. Consistencia de matrículas: fuera de alcance,
  sin datos ni operaciones de matrícula en esta prueba.
- Si generador y sistema comparten laptop, declarar contención de recursos; no extrapolar
  al despliegue público. De preferencia separar generador disponible sin contratar servicios.
- Mantener límites reales; esta carga no envía correos masivos. Las pruebas de cuotas y
  reset usan pocas cuentas y Mailpit aparte. SMTP real e Izipay no participan.
- Guardar resultados crudos en ruta ignorada `load-test-results/`; informe resumido y
  anonimizado en documentación. No guardar credenciales ni cookies en resultados compartidos.
- Actualizar aceptación solo con evidencia reproducible. Si falla un umbral, registrar el
  resultado y el cuello de botella; no marcarlo como capacidad garantizada.

## Trabajo temprano de video que permanece independiente

D07–D09 debe investigarse en el primer incremento del proyecto, en paralelo al avance de
identidad y antes de comprometer alojamiento. Probar OBS→SRS→HLS, consumo real de segmentos,
acceso autorizado/denegado, bitrate, emisiones simultáneas y ancho de banda/costo. La prueba
requiere su propio alcance y evidencia; no se ejecuta ni se pospone hasta finalizar la app.
