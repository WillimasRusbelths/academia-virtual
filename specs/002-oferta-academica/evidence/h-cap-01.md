# Corrección del aviso del catálogo — H-CAP-01

2026-10-29, America/Lima. Base `48a8087`, rama `feat/002-oferta-academica`.
**Corrección verificada automáticamente; observación humana pendiente.**
[Resultados estructurados](h-cap-01-results.json), [hallazgo original T072](t070-t072.md)
y [protocolo humano](human-acceptance.md). Se conserva el informe original sin reescribirlo.

## Cambio y alcance

[CatalogPage](../../../apps/web/src/features/academic-offering/catalog-page.tsx)
muestra «Ocupación y disponibilidad no calculadas» antes del buscador, fuera del
bloque condicionado a los resultados. Sigue siendo texto informativo durante la
carga; no añade ocupación, disponibilidad, reservas ni operaciones de escritura.
No se modifica OfferingLayout ni las vistas de curso/grupo que ya muestran el aviso.
FR-006/009/014, recorrido D del [contrato UI](../contracts/ui.md) y SC-002 conservan
su significado y PA-01–PA-05/E1. No cambian API, autorización, dominio ni SQL.

Los [E2E existentes](../../../apps/web/tests/e2e/academic-offering-catalog.spec.ts)
exigen ahora el aviso exacto al entrar al catálogo y después del fallo SQL/reintento.
No se eliminan ni debilitan expectativas anteriores. Los estados con resultados,
vacío, error y recuperación se comprueban en navegador con API/Nest y PostgreSQL reales;
no se afirma haber detenido una respuesta para observar separadamente la carga.

## Ejecución reproducible y resultados

Se reanudó el proyecto aislado existente `academic-offering-fa3d46bddbb8` con su
volumen, APP_ENV=test, sin puertos publicados ni montajes manuales. Las fuentes y
pruebas revisadas se montaron sobre las imágenes existentes en su copia privada;
no se copiaron archivos de entorno ni credenciales. La fixture usa un esquema por
caso, API real y Vite loopback, con limpieza propia, sin reset de bases compartidas.

Comandos interiores, ejecutados secuencialmente en ese entorno:

```powershell
npm run db:generate
npm run build --workspace apps/api
# Antes de corregir CatalogPage:
npm run test:e2e --workspace apps/web -- --config playwright.academic-offering.config.ts academic-offering-catalog.spec.ts --grep B03 --project desktop --reporter=list,json
# Después de corregir CatalogPage:
npm run test:e2e --workspace apps/web -- --config playwright.academic-offering.config.ts academic-offering-catalog.spec.ts --reporter=list,json
npm run test:unit --workspace apps/web -- --maxWorkers=1 --reporter=verbose --reporter=json
npm run lint
npm run build
```

| Comprobación | Resultado real |
| --- | --- |
| Rojo B03 escritorio | 1 caso/1 ejecución fallida esperada: aviso ausente en /oferta; API, DB, sesión y navegación preparadas correctamente. |
| Catálogo tras corrección | 10 casos únicos × escritorio/móvil = 20/20 aprobadas; 0 omitidas, reintentos o flaky; timeout original 15 s. Duración de suite 162.83 s. |
| UNIT web | 188/188, 11 archivos; contratos/transporte, rutas, validación e identidad existentes. Son pruebas unitarias separadas de la evidencia real del navegador. |
| Lint/arquitectura | Ambos workspaces aprobados, incluidas reglas de importación/capas. |
| Tipos y compilación | API y web aprobados; tsc API, tsc --noEmit web y Vite. |
| Conservación/limpieza | Cero esquemas t_ al finalizar, servicios aislados detenidos, volumen retenido; metadatos manuales intactos y ninguna consulta SQL manual. |

B01 verifica rechazo sin cambios parciales; B02 publicación real de curso/dos grupos,
confirmación/cancelación y ausencia de publicación implícita. B03 alcanza ahora las
aserciones antes bloqueadas: comparación, horarios/fechas America/Lima, capacidad 45/50,
privacidad, recarga, teclado/móvil, cero escrituras y huella persistida sin cambios.
B04 comprueba vacío; B05 provoca 503 retirando SELECT solo al rol del esquema de prueba,
restaura el permiso y comprueba reintento 200. B06 conserva 404 seguro tras retiro de
curso/grupo; B07 visitante/docente denegados; B08 administrador ve proyección pública.
Los controles de health/readiness y los builds previos habilitan estas pruebas;
no se contabilizan como casos académicos adicionales.

No se ejecutaron suites PG/HTTP separadas, la puerta completa T068, smokes ni cargas:
el cambio se limita a presentación y aserciones E2E. Los 20 E2E sí usan persistencia
y autorización reales. Los pases T068/T069 permanecen atribuidos a sus revisiones.
No reapareció un timeout en esta ejecución; bootstrap y timeout E2E histórico siguen
abiertos, sin diagnóstico nuevo ni límites ampliados.

## Entorno, evidencia y conservación

Docker 29.8.1, Linux amd64, 8 CPU y
7236878336 bytes de memoria disponibles al motor; son recursos
asignados, no consumo medido ni una prueba de capacidad. Node 22.23.1/npm 10.9.8,
Playwright 1.63.0, TZ America/Lima. Imágenes y hashes de archivos/reportes en el JSON.
Logs originales, reportes íntegros, guardas y lanzadores privados:
`.cache/academic-offering-validation/h-cap-01/` y `h-cap-01-reports/` bajo ese mismo
directorio de validación, ignorados por Git. Se conservan rojo y verde por separado.
Los mensajes Creating/Stopping de Docker por stderr aparecen como NativeCommandError
en PowerShell 5.1: los códigos finales y JSON confirman el resultado, no se atribuyen
esos mensajes a fallos de pruebas.

Se verificaron 899 enlaces en 35 documentos sin roturas, diff, secretos y hashes
contra la base: 71 archivos protegidos intactos y las 74 tareas sin cambios de
criterios o marcas. Checklist 16/16; cero secretos detectados. Configuración privada,
lockfile, Compose, migraciones, constitución, spec/aclaraciones, checklist y toda la
evidencia anterior intactos. Solo quickstart cambia entre los 72 archivos protegidos
del inventario; los otros 71 se conservan. No se eliminan volúmenes ni se consulta,
arranca o reinicializa el entorno manual. Actualización documental de estado en
README, alcance, decisiones, arquitectura, planificación, quickstart, tasks y protocolo.

## Pendientes y siguiente bloque

No se modifica ninguna de las 74 descripciones ni marcas de tareas: T001–T072 completas,
T073/T074 pendientes. El responsable indicó que la observación se realizará después;
no hay fecha, participante, sesión ni resultado humano anticipados. Siguiente bloque:
T073 con alumno real y responsable usando el protocolo, luego T074 con evidencia completa.
H-CAP-01 queda corregido automáticamente; SC-002 humano no se considera aprobado.

Constitución 1.2.0: I (alcance/evidencia), II (regresión de autorización real), IV
(solo capacidad configurada), IX (aislamiento), X (sin cambio de esquema/configuración)
y XI (sin atribuir concurrencia). T103 mantiene ejecución/informe sin capacidad aprobada;
T104/T108, CI remoto, D04, parte de matrícula de D06, D10/D13 y SMTP externo siguen
pendientes. Reservas de 24 horas pertenecen al futuro spec; no se implementan matrícula,
pagos, AWS ni clases. Sin aceptación integral ni capacidad acreditada para 1000/2500.
