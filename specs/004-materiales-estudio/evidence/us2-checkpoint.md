# Checkpoint US2 — consulta y descarga por matrícula vigente

Fecha: 2026-11-16, America/Lima. Bloque T045–T047 del spec 004. Este documento
registra navegación, E2E alumno con backend real y regresiones; conserva los
checkpoints anteriores como evidencia de sus etapas originales.

## T045: navegación y ámbito de cuenta

App selecciona las dos rutas existentes `/materiales` y
`/materiales/grupos/:groupId` según la audiencia de la sesión. ADMIN/TEACHER
conservan los componentes/política de gestión. STUDENT usa el permiso visual
cerrado enrollment, índice mínimo de grupos con matrícula vigente y pantalla
de publicaciones/descarga. El servidor sigue reautorizando cada petición.

La composición inyecta `materialsGroupHref` en las vistas de matrículas. Lista
y detalle muestran «Ver materiales del grupo» únicamente para ENROLLED; las
históricas no ofrecen ese enlace. No se calcula vigencia con el reloj del
navegador ni se sustituye por el catálogo. Un enlace ya visible puede perder
vigencia: su petición directa vuelve a comprobarla en el backend.

Las instancias de materiales y matrículas se identifican por cuenta/grupo o
cuenta/matrícula. Desmontar aborta solicitudes, descarta resultados tardíos y
revoca URLs de archivo. El índice usa su propio aborto/ámbito y elimina el
resultado anterior antes de consultar otra página. Los enlaces de navegación
proceden de app; no se añaden imports laterales entre features.

Tres pruebas nuevas se ejecutaron antes del cambio: 0/3, por rutas aún de gestor,
enlace no inyectado e instancias sin clave de cuenta. Después pasan con el mismo
contrato. Las expectativas anteriores de gestores se conservan intactas.

## T046: E2E real e independiente de US1

La configuración de materiales incluye suites de gestión y alumno, desktop y
mobile, un worker y cero reintentos. No se habilitan capturas, trace o video.
Cada caso crea un esquema aleatorio, aplica la cadena normal de migraciones,
compone AppModule/SessionStore reales y usa Vite con proxy al backend aislado.
La fixture ya contiene material PREPARED/PUBLISHED/WITHDRAWN y matrículas propias,
ajenas/históricas, reserva y otros actores. US2 no requiere ejecutar cargas US1.

La fixture de navegador añade una credencial ficticia confinada al esquema para
el cambio de cuenta con login real. No cambia cuentas del entorno manual. Se
compara el fingerprint de órdenes/pagos/reservas/matrículas antes y después de
cada caso, incluidos los de gestión: navegar o descargar no cambia finanzas.

Diez casos alumno por viewport cubren:

- Entrada desde matrícula vigente, lista/detalle, índice mínimo y URL directa;
  teclado y ausencia de desbordamiento móvil, sin formulario de gestor.
- PDF/JPEG/PNG guardados realmente al dispositivo de ensayo: bytes completos,
  tamaño y SHA-256 iguales al corpus; HEAD sin cuerpo y Range 200 completo.
- Referencia del grupo propio rechazada a otro alumno, histórico y reserva;
  preparado/retirado ocultos por API real y sin artículos/enlaces en pantalla.
- Curso/grupo retirados y docente inhabilitado no revocan la matrícula original.
- Sesión revocada después de listar y antes de descargar: 401/login, sin URL.
- Archivo ya preparado para guardar, segunda respuesta binaria retenida tras
  lectura real, navegación SPA/logout y login de otro alumno; respuesta vieja
  descartada, URL anterior revocada y acceso solo al grupo de la nueva cuenta.
- Fallo PostgreSQL 53100 inyectado exclusivamente en SELECT bytea real: 503 seguro,
  sin archivo parcial ni reintento automático; reintento manual correcto.
- Vacío publicado autorizado distinguible de error/denegación. El estado retirado
  se prepara como hecho sintético del fixture, sin atribuir un comando US3 aún
  inexistente a producción.

El caso de respuesta tardía retiene una respuesta obtenida mediante `route.fetch`
contra la API real; no reemplaza autorización, bytes o datos con un mock. El fallo
53100 se inyecta en el cliente PG adquirido por el pool HTTP y se restaura en
finally. Todas las demás consultas y respuestas siguen siendo reales.

El focal de navegación/cambio de cuenta aprobó 4/4 en ambos viewports. Un intento
previo del comando no produjo informe válido: PowerShell retiró las comillas del
filtro con `|` y sh lo interpretó como pipeline. Se usó `MS0[16]` para evitarlo;
ese error de invocación no se cuenta como rojo funcional o fallo del producto.

La primera suite completa aprobó 28/30 y detectó dos fallos de preparación MS04
(uno por viewport): DRAFT no puede pasar directamente a WITHDRAWN. Se corrigió
el fixture con la secuencia original ME05 de backend, incluyendo el snapshot
de docente/elegibilidad al publicar. Se conservan triggers, expectativas y el
informe anterior; no se cambia producto para aceptar una transición inválida.

## T047: regresión y trazabilidad

Regresión web: **590/590 en 36 archivos**, incluidos los tres casos nuevos de
navegación y todos los contratos T037 de cliente/pantalla. Backend ampliado:
**1813/1813 en 75 archivos**, cero fallos u omitidos. Comprende la selección
anterior completa de materiales, dominio/arquitectura, transporte/sesión y oferta,
además de autorización, consultas, persistencia/lecturas temporales, HTTP y
mantenimiento de matrículas. No se alteran las pruebas anteriores para aprobarlas.

| Familia | Evidencia automática |
| --- | --- |
| MV01 | Corpus/formatos y completado; descarga HTTP T036 y E2E de tres formatos con comparación completa de bytes/SHA-256. |
| MV02 | Autoridad/consulta mínima y matriz HTTP T036; E2E propio/ajeno/histórico/reserva, estados ocultos y contexto directo. |
| MV07 | T035 original 17/17, participante matrícula 10/10, consultas y GET/HEAD en límites exactos a µs; oferta retirada y docente inhabilitado en navegador. |
| MV10 | T036 original 34/34; binario interno 7/7 y recursos 7/7, JSON/CSRF/sesión/error seguro; HEAD y Range reales en E2E. |
| MV11 | Pruebas web de vacío/error/denegado, aborto/generación/URLs y reintento manual; navegador desktop/mobile, teclado, login/logout y respuesta tardía. |

Tipos focalizados API y de materiales web, lint API/web, generación Prisma y
builds API/web terminan con exit 0. La base y los servicios son exclusivamente
del proyecto de ensayo existente; no se imprime configuración privada.

## Comandos reproducibles

Usar el [entorno aislado](implementation-environment.md), proyecto
`materials-trial-92aba908-04a`, overlays runner/browser y dependencias/imágenes
existentes. Validar el nombre del proyecto antes de up/down. No hay puertos
publicados; Vite/API escuchan en loopback del runner. Generar Prisma y compilar
antes de las suites HTTP/E2E:

```sh
node apps/api/scripts/database.mjs generate && npm run build --workspace @academia/api
npm run build --workspace @academia/web
```

Desde `apps/web`, con variables de ensayo inyectadas y Chromium disponible:

```sh
PLAYWRIGHT_JSON_OUTPUT_NAME=/evidence/t045-t047-e2e-complete.json node ../../node_modules/@playwright/test/cli.js test --config playwright.materials.config.ts --reporter=json
node ../../node_modules/vitest/vitest.mjs run src --maxWorkers=2 --reporter=json --outputFile=../../.cache/materials/reports/t045-t047-web-final.json
```

El focal previo usa `materials-student.spec.ts --grep MS0[16]` y escribe
`t046-e2e-focused-final.json`; el primer E2E completo se conserva como
`t045-t047-e2e-final.json`. El rojo unitario de navegación anterior al código es
`t045-navigation-red.json`. Ninguno se sobrescribe con los resultados posteriores.

Desde `apps/api`, selección final con máximo dos workers:

```sh
node ../../node_modules/vitest/vitest.mjs run tests/architecture src/modules tests/integration/materials- tests/integration/http-security.spec.ts tests/integration/session-store.spec.ts tests/integration/session-lifecycle.spec.ts tests/integration/academic-offering-authorization.spec.ts tests/integration/academic-offering-http.spec.ts tests/integration/academic-offering-teaching-http.spec.ts tests/integration/academic-offering-maintenance-http.spec.ts tests/integration/academic-offering-publication-races.spec.ts tests/integration/academic-offering-eligibility.spec.ts tests/integration/academic-http-errors.spec.ts tests/integration/enrollment-authorization.spec.ts tests/integration/enrollment-queries.spec.ts tests/integration/enrollment-read-persistence.spec.ts tests/integration/enrollment-temporal-reads.spec.ts tests/integration/enrollment-http.spec.ts tests/integration/enrollment-maintenance.spec.ts --maxWorkers=2 --reporter=json --outputFile=/evidence/t045-t047-api-final.json
```

Desde la raíz del host:

```powershell
npm.cmd run lint --workspace @academia/api
npm.cmd run lint --workspace @academia/web
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.materials.json
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.materials.json
```

## Resultado final y preservación

E2E completo corregido: **30/30 aprobados, 20 alumno + 10 gestión**, 15 por
viewport, un worker, cero reintentos, omitidos o casos inestables. Los 30 casos se
ejecutaron nuevamente después de corregir MS04. Los fingerprints financieros se
mantienen en todos. La suite original de gestión permanece sin cambios.
En conjunto: **API 1813/1813, web 590/590 y E2E 30/30**. Casos, hashes de
informes/checkpoints y archivos en [resultado](t045-t047-results.json).

Auditoría acumulada de **1075 archivos**: solo cambios previstos de composición,
navegación de matrículas/materiales, pantalla/índice alumno, configuración y
soporte de pruebas, y documentación. T035/T036 y las expectativas anteriores
conservan sus hashes. Backend financiero y de materiales, migraciones, dependencias,
configuración/datos manuales y rama real permanecen iguales. El cambio de la
feature de matrículas solo añade el enlace inyectado y su ámbito por cuenta;
no modifica precios, cupos, órdenes, reservas o reglas de matrícula.

No hay migraciones desplegadas en entorno manual o servicios publicados. Al
terminar se ejecuta Compose down sin -v, conservando el volumen de ensayo y sin
tocar otros proyectos. No existe `.specify/extensions.yml`; no hay hooks pendientes.

Estado: **T001–T047 completadas, 47/68; quedan 21 y continúa T048 (US3)**.
Este checkpoint acredita US2 con pruebas automáticas, sin aceptación humana T064.
Edición/retiro/republicación de US3 y sus recorridos conservan sus tareas. No se
cierran capacidad D10, custodia/restore cifrado D13, CI remoto, Izipay real, prueba
de 24 h reales, VPS/despliegue o pendientes de 001–003. Los estados sintéticos
retirados del fixture no acreditan un handler de retiro aún no implementado.
