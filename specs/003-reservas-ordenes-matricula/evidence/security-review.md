# T088 — Revisión de datos, errores, logs y fronteras

2026-11-15, America/Lima. Revisión local acotada a FR-015, FR-016, FR-019,
FR-022 y FR-024. T088 completa; no constituye aceptación integral ni aprobación
del proveedor. Base `cfc001eac89292c1b135dbba79be9a9ca8cc0b8b` más fuentes
identificadas en [security-review-results.json](security-review-results.json).

Se revisaron controladores, proyecciones, filtro de errores, registro operativo,
auditoría transaccional, recepción normalizada de pagos y clientes financieros.
No se identificaron hallazgos que requieran modificar producto en este alcance.
Se reutilizaron pruebas negativas existentes; no se cambiaron código, tests,
configuración, dependencias, migraciones, cuotas ni timeouts.

## Controles y evidencia

| Frontera | Resultado revisado y pruebas ejecutadas |
| --- | --- |
| Cuenta, sesión y rol | Reautorización en primaria y tras locks/replay; revocación, expiración, cambio de rol o estado impiden acceso. `enrollment-authorization` (7), `reservation-authorization` (36), EH01, PH01/PH05, AH01/AH02. |
| Propiedad financiera | Alumno solo recibe lo propio; ajeno e inexistente son 404 indistinguibles. ADMIN consulta y anota; docente/visitante sin acceso financiero. EH02, PH02, AZ02. |
| Entradas HTTP | DTO cerrados, UUID/paginación validados; cliente no decide titular, dinero, moneda, reloj o autoridad SYSTEM. EH03, PH03/PH06, HX07 y AH03. |
| Transporte | JSON de 16 KiB, Origin/CSRF, rechazo cross-site, no CORS abierto y no-store conservados. EH04, PH00d, AH04–AH06 y EE09. |
| Salidas y errores | Proyecciones explícitas; códigos, campos y mensajes permitidos por método/ruta/audiencia. No se serializa el error del driver, SQL, cause, cookie, firma o callback bruto. EE01–EE07 y pruebas web de errores manipulados. |
| Registros operativos | Plantillas del servidor y referencias UUID, sin cuerpos/headers/URL arbitrarios. SecurityEvents rechaza campos ajenos; avisos de fallback y worker usan texto fijo. EE02/EE06/EE07 y `secret-redaction` (6). |
| Auditoría financiera | Actor/origen, referencias, instante, resultado y revisión dentro del COMMIT; digest en ledger, sin copiar payload como resultado. Fallo de auditoría/proyección revierte la operación; replay no duplica. EA01–EA15 y AH10. |
| Recibos técnicos | Adaptador confiable autentica antes de persistir referencias normalizadas; no se guarda el cuerpo con PAN/token ni se concede SYSTEM por headers/body. PH06, PH08–PH10. La autenticidad real del proveedor sigue pendiente de D02. |
| Capacidad económica | No hay rutas de aprobación manual, simulador productivo, devolución, traslado, matrícula manual o vencimiento forzado por usuario. PH00b/PH00c, AH09, AZ03, HX06 y WP13. Rutas de ataque ficticias no son un contrato del proveedor. |
| Cliente web | Respuestas y envoltorios cerrados, DTO ajenos o alterados rechazados, error privado sustituido por mensaje local; sin reenvío automático. Abort/generación descartan respuestas posteriores al logout. WA/WC/AC, controladores y cliente de errores. |
| Estado financiero visible | Éxito del navegador o intento pendiente no confirman matrícula. Incidencia no equivale a devolución ni resolución económica. WP08–WP13 y pruebas de pagos del alumno. |
| Cuotas | Las 12 pruebas del store persistente de límites de identidad pasan, incluidas concurrencia y fallo seguro. No se modifica su política ni se acredita un límite global nuevo de RPS financiero. |

Fuentes principales: [transporte](../../../apps/api/src/http/transport.ts),
[filtro seguro](../../../apps/api/src/http/error.filter.ts),
[contratos por ruta](../../../apps/api/src/infrastructure/http/enrollment-contract.ts),
[logs](../../../apps/api/src/infrastructure/logging/security-events.ts),
[consultas financieras](../../../apps/api/src/modules/enrollment/infrastructure/queries.ts),
[auditoría](../../../apps/api/src/modules/enrollment/infrastructure/audit.ts),
[recibos](../../../apps/api/src/modules/enrollment/infrastructure/payment-receipts.ts),
[composición de pagos](../../../apps/api/src/modules/enrollment/enrollment.module.ts),
[cliente HTTP](../../../apps/web/src/app/http.ts) y
[DTO financieros web](../../../apps/web/src/features/enrollment/api.ts).

## Ejecución y preservación

| Selección ejecutada en T088 | Archivos | Aprobadas | Fallidas/omitidas |
| --- | --- | --- | --- |
| API/PG/HTTP, filtros, auditoría, cuotas y redacción | 10 | 224 | 0/0 |
| Clientes, controladores y vistas financieras con Vitest | 8 | 185 | 0/0 |
| Total de ejecuciones seleccionadas | 18 | 409 | 0/0 |

No se suman resultados de T084 ni se acredita una ejecución E2E de navegador nueva.
Los filtros incluyen comprobaciones directas de componente además de HTTP/PG real;
las 224 pruebas no se presentan todas como recorridos HTTP. El JSON conserva
archivo, ordinal, estado y hash del nombre de cada prueba, evitando publicar payloads
de ataque o reportes brutos. Las selecciones y comandos privados están en
`.cache/reservas-t088/run.ps1`; usan Vitest con `--maxWorkers=1`, sin retries.

Entorno `academic-offering-fa3d46bddbb8`, APP_ENV=test, PostgreSQL 16.14, base y roles
exclusivos de test, cero puertos publicados. La imagen API coincide con 533 archivos
del manifiesto T084; los fuentes de producto actuales coinciden con esa revisión.
Tests API y fuentes web actuales se montaron en solo lectura, incluido el soporte
cuya firma de tipos se redujo en T086. No se atribuye el test nuevo de recuperación
a la imagen antigua ni se ejecuta dentro de esta selección.

Los cinco esquemas preexistentes permanecen antes y después; las fixtures operan
en esquemas nuevos propios y limpian solo sus datos. Compose recreó el contenedor
db al arrancar, conservando su volumen y los esquemas existentes. Los contenedores
humanos previos se conservaron; se ignoró el aviso de huérfanos sin eliminarlos.
Al finalizar se detuvieron solo db/mailpit. Sin bootstrap manual, reset, purgas,
eliminación de volúmenes, llamadas a proveedor, cargas ni despliegues.

El inventario previo registra 960 archivos. Los 74 archivos protegidos, las siete
migraciones y toda evidencia previa permanecen intactos, salvo el apéndice fechado
de este resultado en acceptance.md. El contraste literal de las evidencias públicas
con secretos y URLs privadas configuradas no encuentra coincidencias. Es una
comprobación complementaria, sin publicar los valores usados para contrastar.

## Límites y puertas

La composición productiva no conecta adaptador/configuración de pago: iniciar o
recuperar intento devuelve indisponibilidad segura. Las pruebas que simulan un
proveedor usan capacidades confiables inyectadas únicamente en test. D02/T056–T059
debe acreditar autenticidad, referencias y modalidad reales antes de conectar una
entrada externa; este bloque no elige SDK, firma, endpoint ni excepción CSRF.

Las notas administrativas son texto libre autorizado, conservado para seguimiento
y mostrado como texto por React. No se implementa un clasificador DLP de su contenido;
no se afirma que detecte secretos introducidos voluntariamente en una nota. Las
pruebas cubren la exclusión de datos privados internos y payloads externos en las
proyecciones/registros de aplicación; no certifican un proveedor o recolector externo.
Los diagnósticos privados del motor de BD no se publican como evidencia saneada.

SecurityEvents conserva técnicamente hoy y los 29 días UTC anteriores, con archivos
0600/directorio 0700. Describe el código preexistente: no aprueba retención o custodia
financiera, backups externos, responsables o RPO/RTO. D13 y el ensayo físico de 24 horas
siguen pendientes. La prueba de cuotas no acredita capacidad para 2500 activos.
T083, T089, D10 y T094 siguen abiertos; T042 humana favorable solo en computador.
Checklist 12/16 conservado; sin hooks de implementación registrados.

Siguiente pareja por orden: **T089–T090**, aceptación humana integrada y ensayo
operacional de 24 horas. T089 depende de T059 y resultados humanos T083; T090 de
T059, T086 y autorización/acuerdos D13. T086 está completa; las demás puertas
indicadas impiden cerrar esa pareja con simulación o documentación.
