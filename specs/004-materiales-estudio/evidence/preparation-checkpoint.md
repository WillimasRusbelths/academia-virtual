# Checkpoint T001–T004

Fecha del cliente: 2026-11-16, America/Lima. Completadas 4/68 tareas de preparación.

- T001: [baseline](t001-baseline.json), HEAD/rama/puntero 004, estado Git previo,
  982 archivos con SHA-256, evidencia y configuración privada solo por hash.
  Comparación final: 981/982 sin cambios; solo `004/tasks.md` cambia para marcar
  T001–T004 y describir su resultado. Los archivos nuevos de este bloque no
  pertenecen al baseline; se enumeran en el resultado enlazado abajo.
- T002: [entorno y comandos](implementation-environment.md), proyecto de ensayo
  nuevo sin puertos, base/roles exclusivos y esquemas aleatorios del harness existente.
  No se creó configuración privada nueva ni se inició un servicio.
- T003: [matriz](../verification.md), 13 familias MV, 20 FR, 7 SC y 19 escenarios.
  Pruebas futuras, observación humana y puertas D10/D13 separadas.
- T004: corpus determinista generado en memoria, 18 entradas;
  [inventario de tamaños y hashes](t004-corpus.json). PDF tiene xref y longitudes
  calculados; PNG tiene CRC/chunks y datos zlib decodificables; JPEG baseline
  tiene tablas/marcadores/scan de un píxel. Tamaño exacto/exceso usa contenido
  dentro del stream PDF, tEXt PNG y COM JPEG; no bytes después del terminador.

## Resultados observados

Comandos ejecutados desde `apps/api`:

| Comando | Resultado |
| --- | --- |
| `node ../../node_modules/vitest/vitest.mjs run tests/integration/materials-files.spec.ts` | 1 archivo, 6 tests aprobados; 7.95 s, Vitest 5.0.2 |
| `node ../../node_modules/eslint/bin/eslint.js tests/support/materials-files.ts tests/integration/materials-files.spec.ts` | Sin diagnósticos |
| `node ../../node_modules/typescript/bin/tsc --ignoreConfig --noEmit --module NodeNext --target ES2023 --types node --strict --skipLibCheck tests/support/materials-files.ts tests/integration/materials-files.spec.ts` | Salida 0, sin diagnósticos |

Vitest valida PDF/xref/longitud de stream, CRC y descompresión PNG, segmentos y
códigos entropy JPEG en tamaños pequeño/exacto/exceso. Verifica SHA-256 reproducible,
identidades únicas, límites de reserva de memoria de fixtures y aislamiento ante
mutaciones del llamador. System.Drawing decodificó las muestras PNG/JPEG pequeñas
como imágenes de 1×1 con un decoder independiente del generador.

La primera invocación de Vitest falló al iniciar por `spawn EPERM` del sandbox;
se repitió con ejecución autorizada fuera de él y pasó. `npm.ps1` está bloqueado
por política PowerShell; `npm.cmd --version` devolvió 10.9.8. Node v22.23.1.
`git diff --check` salió 0, con avisos CRLF de cambios preexistentes.
No existe `.specify/extensions.yml`: sin hooks antes/después que ejecutar.
Ignore files de Git/Docker/ESLint cubren dependencias, builds, resultados y secretos;
no se añadieron paquetes ni se modificó lockfile.

## Preservación y límites

001 mantiene 106 completas/2 pendientes; 002, 72/2; 003, 84/10.
La rama sigue `feat/003-reservas-ordenes-matricula`. No se tocaron datos,
cuentas, puertos, configuración manual, evidencia previa o reglas financieras.
Resultados y comprobación final en [preparation-results.json](preparation-results.json).

Docker Linux no estaba disponible. No se ejecutaron PostgreSQL, migraciones,
integración HTTP, UI, E2E, build general o CI remota; no eran comprobaciones
funcionales de este bloque. Los seis tests prueban el corpus, no autorización,
formatos aceptados por la aplicación ni un flujo de carga implementado.
El siguiente incremento empieza en T005 (DTO/puertos) y T006 (pruebas SQL),
antes de T007. Recuperación, participantes reales, D10 y D13 siguen pendientes.
