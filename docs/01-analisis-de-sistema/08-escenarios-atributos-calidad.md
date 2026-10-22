# Escenarios de atributos de calidad

Los escenarios EQ-01–EQ-11 desarrollan los atributos [AC01–AC07](04-atributos-de-calidad.md), sin sustituir sus identificadores ni modificar los requisitos. Cada escenario delimita el estímulo, la respuesta y la evidencia necesaria para evaluar el diseño de Academia Virtual.

Se mantienen el [monolito por capas organizado en módulos](../02-arquitectura-software/estilo-arquitectonico.md), [Clean Architecture](../02-arquitectura-software/enfoque-arquitectonico.md), PostgreSQL y Docker Compose como entorno local. Las integraciones externas corresponden a los módulos consumidores; PostgreSQL no invoca Izipay, correo ni video.

Una **medida definida** procede de requisitos o contratos existentes. Una **meta provisional** requiere validación antes de emplearse como aceptación definitiva. **Evidencia parcial** acredita únicamente el comportamiento y entorno ensayados; **pendiente** indica que el escenario completo no tiene resultados. La aprobación se limita al alcance de cada evidencia; EQ-01 está demostrado localmente, no capacidad integral.

El requisito de **1000 usuarios concurrentes** permanece sin aprobar tras cargas ejecutadas con incumplimientos. Las sesiones de identidad, las operaciones de matrícula y los espectadores con chat son cargas diferentes. Un ensayo local o una población prevista de 1000 alumnos no demuestra disponibilidad de producción ni capacidad del MVP completo.

## Resumen y trazabilidad

Los RF, DA y decisiones se conservan del [catálogo funcional](03-requisitos-funcionales.md), los [drivers](06-driver-arquitectonicos.md) y el [registro arquitectónico](07-decisiones-arquitectonicas.md). Los pendientes D01–D13 se consultan en [decisiones pendientes](../decisiones-pendientes.md). Los FR, SC, V e ID-LOAD pertenecen al detalle de identidad.

| Escenario | Atributo original | Situación evaluada | Requisitos y restricciones | Drivers | Decisiones | Verificación y estado |
| --- | --- | --- | --- | --- | --- | --- |
| EQ-01 | AC01 · Rendimiento | Acceso secuencial e inicio visible | RF03, RF05; SC-008 | DA05, DA09 | R03, R10 | V03/001 T105; comprobado localmente |
| EQ-02 | AC01 · Rendimiento | 1000 sesiones activas de identidad | RF03, RF05, RF08; RT11 | DA01, DA05 | R02, R04, R10 | ID-LOAD-01 ejecutado; incumple |
| EQ-03 | AC01 · Rendimiento | Saturación del cómputo de autenticación | RF03; FR-006, FR-022; RT11 | DA01, DA05 | R04, R09, R10 | ID-LOAD-02 ejecutado; incumple, límites comprobados |
| EQ-04 | AC02 · Disponibilidad y recuperación | Restauración y reapertura segura | RF19; RT09 | DA08, DA10 | D13, R02, R08, R11, R12 | V16 identidad local comprobado; D13 pendiente |
| EQ-05 | AC03 · Escalabilidad | Carga de matrícula y competencia por cupos | RF10–RF13; RT02, RT10, RT11 | DA02, DA04, DA05 | D02, R10 | Ensayo académico por definir; pendiente |
| EQ-06 | AC03 · Escalabilidad | Clases con video y chat concurrentes | RF16, RF17; RT02, RT08, RT11 | DA03, DA04, DA05 | DEC01, R10 | Ensayos de medios/chat por definir; pendiente |
| EQ-07 | AC04 · Seguridad de acceso | Sesión, permisos y transporte de identidad | RF03, RF06, RF08, RF09; FR-018–FR-020; RT09 | DA01, DA08, DA09 | R02, R03, R05, R09 | V04, V07, V09, V12, V14; evidencia parcial |
| EQ-08 | AC04 · Seguridad de acceso | Acceso directo a clase y recursos académicos | RF08, RF14, RF16, RF17; RT08 | DA01, DA03 | R02, DEC01 | Pruebas académicas por definir; pendiente |
| EQ-09 | AC05 · Seguridad e integridad de pagos | Confirmaciones alteradas, repetidas y concurrentes | RF11–RF13; RT06 | DA02, DA06 | D02, R07 | Simulación e Izipay sandbox; pendiente |
| EQ-10 | AC06 · Mantenibilidad | Cambio funcional y sustitución de adaptador | RF02, RF04, RF12; RT01, RT03, RT04 | DA04, DA06, DA07, DA09, DA10 | R01, R03, R07, R11, R12 | VA, lint y regresiones; evidencia parcial |
| EQ-11 | AC07 · Disponibilidad ante fallo de correo | Caída SMTP y reinicio con entregas vigentes | RF02, RF04; FR-023, FR-029–FR-033; RT07 | DA06, DA08 | R06, R07, R08, R09 | V02, V10, V11, V13, V15; evidencia parcial |

## EQ-01 — Acceso secuencial e inicio visible

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC01 · Rendimiento. |
| Fuente del estímulo | Titular de una cuenta habilitada con credenciales correctas. |
| Estímulo | Envía el formulario de acceso y espera su inicio autorizado; se realizan 20 accesos válidos secuenciales. |
| Artefacto afectado | Web React/Vite, API de identidad y persistencia de sesiones. |
| Entorno | Entorno de evaluación documentado, con el flujo de acceso completo; sin mezclar esta medición con la carga concurrente. |
| Respuesta esperada | Autenticar, establecer la sesión y mostrar el inicio correspondiente al único rol de la cuenta. |
| Medida de la respuesta | SC-008: al menos 19 de 20 accesos muestran el inicio autorizado dentro de 3 segundos desde el envío. Es una medida definida de experiencia de acceso, no un percentil de API ni una prueba de 1000 concurrentes. |
| Requisitos, drivers o decisiones relacionados | RF03, RF05; SC-008; DA05, DA09; R03, R10. |
| Método de verificación | Medir de envío a inicio visible, registrar cada duración y resultado según [spec.md](../../specs/001-identidad-acceso-roles/spec.md) y V03 de [verification.md](../../specs/001-identidad-acceso-roles/verification.md). La automatización de navegador puede apoyar el registro; no reemplaza las pruebas con participantes de otros SC. |
| Estado y evidencia disponible | Comprobado localmente: [001 T105](../../specs/001-identidad-acceso-roles/evidence/login-timing.md), 20/20 accesos secuenciales dentro del umbral; repetido en T106. No es carga ni aceptación humana de registro/reset. |

## EQ-02 — Rendimiento con 1000 sesiones de identidad

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC01 · Rendimiento. |
| Fuente del estímulo | 1000 cuentas de alumno distintas, activas y verificadas, mediante un generador de carga. |
| Estímulo | Acceso gradual y consultas de perfil cada 5–10 segundos, manteniendo una sesión independiente por usuario. |
| Artefacto afectado | API de identidad, consultas de sesión/perfil, pool y PostgreSQL. |
| Entorno | Ensayo aislado ID-LOAD-01: calentamiento de 20 cuentas durante 1 minuto; rampas 0→100 en 1 minuto, 100→500 en 2 y 500→1000 en 2; meseta de 10 minutos y descenso de 2. Total medido: 17 minutos. |
| Respuesta esperada | Sostener actividad con sesiones válidas, preservar aislamiento y controles de seguridad, sin ocultar accesos fallidos ni compartir cookies. |
| Medida de la respuesta | Alcanzar realmente 1000 usuarios virtuales y 1000 sesiones distintas válidas durante la meseta. Metas provisionales: p95 de `GET /me` <500 ms, p99 <1000 ms, p95 de login <3 s y errores inesperados <1 % en tráfico válido. Cero cruces de identidad o duplicados; la revocación se ensaya aparte y no se mezcla con la tasa de error de tráfico válido. Umbrales sujetos a D10. |
| Requisitos, drivers o decisiones relacionados | RF03, RF05, RF08; AC01, RT11; DA01, DA05; R02, R04, R10. |
| Método de verificación | Ejecutar k6 según ID-LOAD-01 en [verification.md](../../specs/001-identidad-acceso-roles/verification.md), conservar cookies por usuario y medir VU, sesiones, RPS, percentiles, errores y recursos. El generador no se ejecuta en el contenedor de la API; si comparte equipo, declarar la contención. |
| Estado y evidencia disponible | Ejecutado, capacidad sin aprobar: [001 T103](../../specs/001-identidad-acceso-roles/evidence/load-resources.md), incumple latencias /me y continuidad íntegra de meseta. D10 y futuras cargas conservan sus condiciones. |

## EQ-03 — Cómputo acotado de autenticación

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC01 · Rendimiento. |
| Fuente del estímulo | Cuentas distintas que intentan autenticarse concurrentemente. |
| Estímulo | Aumenta el trabajo de verificación de contraseñas hasta ocupar los ejecutores y la cola. |
| Artefacto afectado | Adaptador Argon2id, cola de trabajo, API y recursos del proceso monolítico. |
| Entorno | ID-LOAD-02 separado: 100 cuentas disponibles, escalones de 10, 25, 50 y 100 VU durante 2 minutos cada uno; ciclo login → perfil → logout y pausa de 5 segundos. |
| Respuesta esperada | Acotar el trabajo criptográfico, conservar trabajo equivalente para cuentas no elegibles y rechazar saturación mediante error genérico 503 sin reducir la seguridad. |
| Medida de la respuesta | Límites iniciales definidos en R04: dos hashes/verificaciones simultáneos por proceso, hasta 50 solicitudes en espera y espera máxima de 5 segundos. Observar CPU, memoria, cola y 503; detener el ensayo si no se conserva la espera máxima o falta memoria. No se fija una nueva tasa aceptable de 503 ni se exige 1000 logins simultáneos. |
| Requisitos, drivers o decisiones relacionados | RF03; FR-006, FR-022; RT11; DA01, DA05; R04, R09, R10 del [plan e investigación](../../specs/001-identidad-acceso-roles/research.md). |
| Método de verificación | Combinar pruebas del adaptador con ID-LOAD-02 de [verification.md](../../specs/001-identidad-acceso-roles/verification.md). Registrar parámetros criptográficos y límites efectivos sin contraseñas, hashes ni cookies. |
| Estado y evidencia disponible | Límites Argon2 y cuotas comprobados; ID-LOAD-02 ejecutado con incumplimientos según [carga](../../specs/001-identidad-acceso-roles/evidence/load-environment.md). [T087](../../specs/001-identidad-acceso-roles/evidence/enumeration.md) compara tiempos bajo protocolo local sin señal detectada; no garantiza ausencia universal de canales temporales. |

## EQ-04 — Recuperación de datos y reapertura segura

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC02 · Disponibilidad y recuperación. |
| Fuente del estímulo | Operador ante una actualización fallida o pérdida del servicio. |
| Estímulo | Solicita restaurar un respaldo con datos persistentes y reabrir el acceso. |
| Artefacto afectado | PostgreSQL, migraciones, sesiones, tokens, entregas de correo y API. |
| Entorno | Ensayo aislado con respaldo y base de destino separada; sin alterar datos o volúmenes del entorno de trabajo. |
| Respuesta esperada | Restaurar, verificar integridad y migraciones, invalidar sesiones y enlaces restaurados y cancelar correos restaurados antes de habilitar el acceso. |
| Medida de la respuesta | V16: restauración e integridad satisfactorias y ningún secreto de acceso restaurado aceptado tras la reapertura. Medir pérdida potencial de datos y tiempo de recuperación. Las metas numéricas de RPO/RTO, retención, ubicación y responsables requieren validación en D13; no existe SLA porcentual aprobado. |
| Requisitos, drivers o decisiones relacionados | RF19; RT09; DA08, DA10; D13, R02, R08, R11, R12. |
| Método de verificación | Ejecutar V16 de [verification.md](../../specs/001-identidad-acceso-roles/verification.md) con el procedimiento de recuperación previsto en [quickstart.md](../../specs/001-identidad-acceso-roles/quickstart.md); registrar respaldo, integridad, invalidación y tiempos. |
| Estado y evidencia disponible | [V16 de identidad](../../specs/001-identidad-acceso-roles/evidence/recovery.md) ensayado y repetido en T106; invalidación/restauración comprobadas en recursos aislados. D13 custodia, retención y RPO/RTO operativos pendientes; sin ensayo integrado de oferta ni SLA. |

## EQ-05 — Escalabilidad de matrícula

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC03 · Escalabilidad. |
| Fuente del estímulo | Alumnos distintos que consultan oferta, seleccionan cursos y tramitan órdenes. |
| Estímulo | La carga crece hacia el objetivo de 1000 usuarios concurrentes e incluye competencia por cupos limitados y pagos simulados. |
| Artefacto afectado | Módulos previstos de oferta, órdenes, pagos y matrículas; transacciones, índices, pool y PostgreSQL. |
| Entorno | Ensayo académico aislado con datos ficticios. Distribución de operaciones, rampas, duración y condiciones finales pendientes de D01–D06 y D10. Izipay no interviene en la carga simulada. |
| Respuesta esperada | Preservar totales y consistencia de cupos/matrículas, observar el recurso limitante y ajustar consultas, configuración o recursos según mediciones. |
| Medida de la respuesta | Objetivo de 1000 concurrentes no demostrado; medir concurrencia alcanzada, RPS, latencias, errores, CPU, memoria, conexiones y bloqueos. Cero sobreventa y matrículas duplicadas. Los límites aceptables de latencia/error y la distribución de carga son metas por acordar en D10, no los percentiles de identidad. |
| Requisitos, drivers o decisiones relacionados | RF10–RF13; RT02, RT10, RT11; DA02, DA04, DA05; D02, R10; políticas pendientes D01–D06. |
| Método de verificación | Ensayo k6 de matrícula según el [alcance y evidencia de capacidad](../alcance-mvp.md#evidencia-requerida-para-la-capacidad), con cuentas distintas y comprobación de cupos, órdenes, importes y matrículas antes/después. |
| Estado y evidencia disponible | Pendiente: preparación administrativa de oferta implementada, sin órdenes/matrícula/cupos ocupados ni resultados de esta carga. D04 y parte de D06 abiertas. No extrapolar transacciones de preparación a último cupo. |

## EQ-06 — Escalabilidad de clases con video y chat

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC03 · Escalabilidad. |
| Fuente del estímulo | Docentes que emiten y alumnos autorizados distribuidos entre clases y grupos. |
| Estímulo | Crece la reproducción real de video y la participación por chat hacia el objetivo académico de 1000 usuarios concurrentes. |
| Artefacto afectado | Web/reproductor, autorización de clases, gateway de chat previsto y servicio externo YouTube Live con OBS. |
| Entorno | Ensayo de medios y chat independiente de matrícula; emisiones, grupos, calidad y protocolo de reproducción por acordar en D07/D10. El chat usa clientes compatibles con Socket.IO, todavía propuesto. |
| Respuesta esperada | Permitir reproducción y chat autorizados, aislar clases y observar límites de conexiones, recursos, transferencia y dependencia del proveedor. |
| Medida de la respuesta | Registrar espectadores reales, emisiones simultáneas, conexiones de chat, mensajes, reconexiones, latencia, errores, recursos y transferencia observada. Cero accesos indebidos o cruces de mensajes entre clases. Objetivo 1000 concurrentes pendiente; metas de calidad/latencia del video y chat, duración y reparto por clase requieren validación D07/D10. Abrir 1000 páginas no demuestra 1000 reproducciones. |
| Requisitos, drivers o decisiones relacionados | RF16, RF17; RT02, RT08, RT11; DA03, DA04, DA05; DEC01, R10; D07–D10. |
| Método de verificación | Emisión OBS → YouTube Live y reproducción real, más ensayo específico de chat, conforme al [alcance](../alcance-mvp.md#evidencia-requerida-para-la-capacidad). Validar cómo comprobar los controles de manifiestos/segmentos exigidos por RF16 con este proveedor. Medir un escenario combinado si se pretende afirmar capacidad conjunta. |
| Estado y evidencia disponible | Pendiente: no hay integración ni ensayos reproducibles de video/chat. DEC01 acredita selección, no capacidad ni protección. ID-LOAD-01 no acredita espectadores. |

## EQ-07 — Seguridad de identidad y transporte

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC04 · Seguridad de acceso. |
| Fuente del estímulo | Visitante, alumno/docente o cliente que conserva una sesión vencida/revocada o envía una solicitud desde otro origen. |
| Estímulo | Intenta consultar datos ajenos o gestionar usuarios directamente; concurrentemente cambia el estado/rol del actor, o se omiten los controles de transporte. |
| Artefacto afectado | Sesiones persistidas, autorización, entradas REST, casos de uso protegidos y registros. |
| Entorno | Pruebas de aceptación de identidad con PostgreSQL real y fixtures restringidos; entorno local HTTP y configuración HTTPS de ensayo separados. |
| Respuesta esperada | Denegar por defecto, verificar cuenta/sesión/permisos actuales, revalidar antes de confirmar escrituras y responder conforme al contrato sin datos privados ni secretos en logs. |
| Medida de la respuesta | AC04: 100 % de los casos no autorizados del conjunto de aceptación denegados, sin efectos; cero nuevas operaciones aceptadas tras revocación confirmada. Caducidad a 30 minutos exactos de inactividad u 8 horas absolutas. SC-003/004/007, V04/V07/V09/V12/V14 fijan criterios específicos, incluidas las dos sesiones tras cambios de acceso. No se generaliza el 100 % a ataques fuera del conjunto probado. |
| Requisitos, drivers o decisiones relacionados | RF03, RF06, RF08, RF09; FR-018–FR-020; RT09; DA01, DA08, DA09; R02, R03, R05, R09. |
| Método de verificación | Solicitudes directas, límites temporales y carreras con estado persistido; casos de origen/CSRF/cookies del [contrato API](../../specs/001-identidad-acceso-roles/contracts/api.md). Ejecutar los V relacionados y el protocolo T087 de [verification.md](../../specs/001-identidad-acceso-roles/verification.md) cuando existan los flujos; la comprobación temporal no sustituye la funcional. |
| Estado y evidencia disponible | Comprobado en el conjunto local: [001 aceptación preliminar](../../specs/001-identidad-acceso-roles/evidence/acceptance.md), US1–US7 y T106, incluidos V04/V07/V09/V12/V14 y T087. 002 T021/T028/T029 añade las diez rutas ADMIN y UI. Sin aceptación integral ni autorización de recursos aún inexistentes. |

## EQ-08 — Seguridad del acceso académico directo

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC04 · Seguridad de acceso. |
| Fuente del estímulo | Persona sin permiso, alumno de otra clase o alumno cuya autorización académica venció. |
| Estímulo | Usa una URL conocida de material/video o conecta directamente al chat, eludiendo la navegación de la web. |
| Artefacto afectado | Autorización académica prevista, materiales, clase, chat y reproducción externa. |
| Entorno | Ensayo académico aislado con permisos vigentes y vencidos; reglas de matrícula por especificar y video YouTube Live con OBS. |
| Respuesta esperada | Comprobar autorización vigente en cada recurso protegido y denegar acceso directo o cruce de clase; ocultar controles o enlaces no constituye protección. |
| Medida de la respuesta | AC04: 100 % de los casos no autorizados del conjunto de aceptación denegados, sin datos ni efectos; cero accesos nuevos tras revocación confirmada. RF16 exige comprobar manifiestos/segmentos y permisos vencidos. Matriz concreta de permisos, vigencia y método compatible con YouTube Live pendientes D03/D08/D12; no se promete impedir grabaciones. |
| Requisitos, drivers o decisiones relacionados | RF08, RF14, RF16, RF17; RT08; DA01, DA03; R02, DEC01. |
| Método de verificación | Probar solicitudes directas de materiales y medios, conexiones/mensajes de chat de otra clase y permisos vencidos, conservando respuestas y ausencia de datos/efectos. Documentar compatibilidad con RF16; una incompatibilidad requiere revisar DEC01 antes de declarar cumplimiento. |
| Estado y evidencia disponible | Pendiente para materiales/clases/chat: identidad y oferta ADMIN no implementan matrícula ni permiso de clase. Publicación/lectura propia/catalogo de 002 también pendientes; no atribuirlas a permisos/modelos. |

## EQ-09 — Integridad ante notificaciones de pago

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC05 · Seguridad e integridad de pagos. |
| Fuente del estímulo | Izipay, cliente que altera la confirmación o solicitudes competidoras por el último cupo. |
| Estímulo | Llega una notificación repetida/simultánea, con importe o moneda alterados, o una pantalla cliente afirma éxito sin verificación del proveedor. |
| Artefacto afectado | Adaptador Izipay, órdenes, pagos, matrículas y restricciones/transacciones PostgreSQL. |
| Entorno | Pruebas aisladas: pagos simulados para concurrencia/carga y sandbox separado de Izipay para autenticidad e integración; sin cobros reales. |
| Respuesta esperada | Validar autenticidad, orden, importe y moneda; confirmar efectos de forma idempotente y transaccional, rechazando confirmaciones inválidas y evitando sobreventa. |
| Medida de la respuesta | Cero matrículas duplicadas, cero cupos sobrevendidos y cero activaciones por confirmación inválida. Repetir notificaciones no duplica efectos. No hay meta aprobada de tiempo de confirmación. Atomicidad de órdenes, pago tardío y reservas deben resolverse en D01–D06 antes de precisar los casos. |
| Requisitos, drivers o decisiones relacionados | RF11–RF13; RT06; DA02, DA06; D02, R07. |
| Método de verificación | Afirmar respuestas y estado persistido ante notificaciones falsas, repetidas y concurrentes; verificar totales calculados en servidor. Comprobar el protocolo real con sandbox Izipay, cuando se habilite; los simuladores no acreditan esa integración. |
| Estado y evidencia disponible | Pendiente: Izipay elegida sin integración ni órdenes/pagos/matrículas. D01–D06 y sandbox conservan obligaciones; escritor académico no prueba idempotencia de pagos. |

## EQ-10 — Cambio modular y sustitución de adaptadores

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC06 · Mantenibilidad. |
| Fuente del estímulo | Desarrollador que debe modificar una funcionalidad o sustituir el proveedor de correo/pagos. |
| Estímulo | Cambia un caso de uso o una implementación de infraestructura manteniendo los contratos públicos y reglas vigentes. |
| Artefacto afectado | Módulo consumidor, contratos de aplicación, adaptador y raíz de composición del monolito. |
| Entorno | Desarrollo local reproducible con Docker Compose, lint y suites pertinentes; dependencias según Clean Architecture y separación de tres capas. |
| Respuesta esperada | Localizar el cambio en las responsabilidades necesarias sin afectar innecesariamente otros módulos. Mantener dominio/aplicación independientes de HTTP, Prisma y proveedores; conectar la implementación mediante inyección. |
| Medida de la respuesta | Cero importaciones prohibidas aceptadas por lint; pruebas de dependencias permitidas/denegadas, compilación y regresiones afectadas satisfactorias. No existe objetivo aprobado de horas de cambio, número de archivos o porcentaje de cobertura; cualquier meta adicional es propuesta por validar. |
| Requisitos, drivers o decisiones relacionados | RF02, RF04, RF12; RT01, RT03, RT04; DA04, DA06, DA07, DA09, DA10; R01, R03, R07, R11, R12. |
| Método de verificación | Revisión VA de [verification.md](../../specs/001-identidad-acceso-roles/verification.md), lint, pruebas de límites y regresión del módulo; demostrar sustitución conservando su contrato cuando exista la integración. Revisar cambios en reglas y módulos ajenos, sin fijar un máximo de archivos. |
| Estado y evidencia disponible | Ejemplos comprobados en identidad y preparación: [002 T017](../../specs/002-oferta-academica/evidence/t015-t017.md) y [T028/T029](../../specs/002-oferta-academica/evidence/t028-t029.md), lint/capas/regresiones. No demuestra sustitución de proveedor SMTP real/Izipay ni mantenibilidad integral del MVP. |

## EQ-11 — Continuidad ante caída SMTP

| Campo | Descripción |
| --- | --- |
| Atributo de calidad | AC07 · Disponibilidad ante fallo de correo. |
| Fuente del estímulo | Servicio SMTP que deja de responder o proceso del backend que reinicia. |
| Estímulo | Falla el envío después de admitir verificación/recuperación y existen entregas vigentes persistidas. |
| Artefacto afectado | Entregas y tokens PostgreSQL, ejecutor interno previsto, adaptador SMTP y cuenta. |
| Entorno | Fallo inducido con Mailpit local y datos ficticios; reinicio controlado, sin correo real ni pérdida de datos. |
| Respuesta esperada | HTTP no espera SMTP ni promete entrega; conservar trabajo vigente, recuperar leases y reintentar de forma acotada. No habilitar cuenta por fallo de correo ni aceptar enlaces obsoletos; borrar payload al terminar. |
| Medida de la respuesta | R08: consulta cada 5 s, hasta dos entregas reclamadas, lease de 60 s y timeout SMTP total de 20 s; tres intentos totales, con reintentos a +60 s y +300 s tras fallo transitorio. FR-029/030: verificación 24 h y reset 30 min, consumo único. FR-031: 1/min y 5/h por destinatario/propósito, 20/h por origen entre propósitos. Cero pérdida de entregas vigentes tras reinicio y cero acceso indebido; un duplicado SMTP puede ocurrir, pero no un segundo consumo. No existe garantía aprobada de plazo de entrega real. |
| Requisitos, drivers o decisiones relacionados | RF02, RF04; FR-023, FR-029–FR-033; RT07; DA06, DA08; R06, R07, R08, R09. |
| Método de verificación | V02/V10/V11/V13/V15 de [verification.md](../../specs/001-identidad-acceso-roles/verification.md): fallo y reinicio, leases, intentos, cancelación, vencimiento, consumo concurrente y cuotas; afirmar estado persistido y contenido capturado sin publicar secretos. |
| Estado y evidencia disponible | Ejecutor/cifrado/reintentos/leases y flujos comprobados localmente: [entregas](../../specs/001-identidad-acceso-roles/evidence/entregas-persistidas.md), [T106](../../specs/001-identidad-acceso-roles/evidence/regression.md) incluye caída SMTP real con Mailpit pausado. SMTP real pendiente; consumo único no implica envío exactamente una vez. |

## Condiciones de aceptación y evidencia

Los parámetros temporales y límites de identidad proceden del [contrato API](../../specs/001-identidad-acceso-roles/contracts/api.md), el [plan](../../specs/001-identidad-acceso-roles/plan.md) y las decisiones R04/R08/R09 de [research.md](../../specs/001-identidad-acceso-roles/research.md). Son condiciones de diseño existentes; únicamente las pruebas enlazadas permiten afirmar su implementación parcial.

Antes de ejecutar un escenario se deben registrar commit y diferencias locales, versiones/configuración, hardware, límites de contenedores, pool, red, generador, datos ficticios y protocolo. La evidencia debe identificar duración, carga real, resultados y limitaciones. Los resultados de carga incluyen percentiles, errores por clase y consumo de recursos; los de seguridad e integridad incluyen ausencia de efectos indebidos y estado persistido. No se publican credenciales, sesiones, tokens ni enlaces secretos.

Los umbrales de ID-LOAD-01 requieren confirmación D10. Matrícula y clases necesitan sus propias distribuciones, duraciones y umbrales; la carga conjunta requiere un ensayo conjunto. D07–D09 mantienen pendientes viabilidad, protección, transferencia y costo del video. D13 requiere fijar y comprobar políticas de respaldo y recuperación. Caché o escalamiento horizontal solo pueden evaluarse si las mediciones los justifican, sin considerarlos implementados.

La [referencia vigente](../estado-documental.md) integra evidencia posterior a los fundamentos.
Los históricos se conservan con su fecha; no se presentan como resultados nuevos del HEAD.
002 PA-01–PA-05 y FR-015 refinan EQ-07/EQ-10 para preparación, sin cerrar EQ-05/08/09.
