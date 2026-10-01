# Revisión posterior a V00 — 2026-09-28

Rama comprobada: feat/001-identidad-acceso-roles. Se conservaron cambios previos;
no se ejecutaron commit, push, despliegue, historias funcionales ni Docker/WSL Windows.
No hay AGENTS.md aplicable encontrado; se mantienen constitución 1.1.0 y restricciones
de tareas/plan. Esta revisión no vuelve a ejecutar speckit-analyze general.

## Diff y evidencia

- Workspaces API/web, lockfile, esqueleto ESM/TypeScript y cinco pruebas de compatibilidad.
- Ensayo Prisma separado del modelo de identidad; roles migration/runtime y base aislada.
- Scripts nativos, Mailpit verificado, guía y decisión R12; .gitignore añade cliente generado.
- T003–T008: seis casillas completadas respaldadas por npm ci y verify:v00 exit 0 de la
  ejecución anterior, incluyendo transacción/rollback/permisos y SMTP. No se repitieron
  suites sin cambios de aplicación. La creación de academia_dev y sus roles/permisos fue
  informada por el responsable; el agente comprobó conexión y permisos en la base de ensayo.
- En este corte previo, T001/T002, T009 en adelante y V00-L estaban pendientes; el seguimiento
  posterior cerró T009/T010, mientras T001/T002 y V00-L continúan sin aprobar.
- Se corrigió una contradicción concreta: compatibility.md todavía abría con V00 bloqueado
  aunque su apartado final registraba el reintento aprobado. Se sincronizaron encabezado,
  tabla y estado actual del plan/verificación. No se reescribió el resultado histórico.
- Se comprobaron signos ASCII `?` reales en fragmentos del último cierre. Se repararon
  únicamente esas palabras; no se realizó recodificación masiva por apariencia de terminal.

La inspección de Git incluye archivos sin seguimiento (git diff --stat solo muestra los
ya seguidos). Se comprobaron exclusiones de .env.test, caché, Mailpit EXE, cliente generado
y dist. `review-files.mjs` inspecciona candidatos Git, patrones conocidos y coincidencias
con valores privados locales sin imprimirlos. Resultado: **sin hallazgos**, ningún .env
local seguido. Es una comprobación acotada, no garantía de detectar toda clase de secreto.
Los únicos ejemplos .env compartidos dejan credenciales vacías.

## Preparación Linux nueva

`compose.linux.yml`, `ops/linux/prepare-secret.mjs` y `ops/linux/README.md` preparan un
ensayo en host Linux autorizado existente. Script de secreto rechaza Windows, configuración
local preexistente y sobrescritura; no se ejecutó aquí. Solo se comprobó sintaxis JavaScript.
Se revisó Compose estáticamente; no se ejecutó docker compose config/pull/up ni un parser
YAML local (el módulo yaml no está instalado). Tags/digests y validez Compose quedan por
comprobar en Linux antes del ensayo; **no se declara V00-L aprobado**.

Alternativa GitHub Actions: runner estándar y disparo manual futuros, condicionados a cuota
gratuita comprobada o repositorio público; no se consulta/modifica facturación ni se contrata
servicio. Sin host remoto autorizado o cuota comprobada, el pendiente es infraestructura.
No se suben los archivos ahora. No copiar secretos Windows al host/runner.

## Auditoría: propuesta compatible, sin aplicar

Se repitió npm audit y se consultó npm view sin cambiar package.json/lockfile. Resultado:
cuatro paquetes altos (prisma/config/deepmerge-ts/mysql2), tres avisos subyacentes.
Prisma **7.10.0** sigue siendo el último 7 consultado y fija deepmerge-ts 7.1.5 y mysql2 3.15.3.

1. **mysql2:** existe el candidato de misma major **3.24.4**, fuera de los rangos afectados
   <3.22.0 y <=3.23.0 de los avisos actuales, pero Prisma 7.10.0 fija exactamente 3.15.3.
   La cadena no permite actualizarlo mediante resolución semver normal. Cambiarlo exige un
   override o parche del árbol de Prisma, opciones excluidas en esta revisión. **No aplicado**;
   V00 PostgreSQL tampoco demuestra compatibilidad del protocolo MySQL que usa el CLI.
2. **deepmerge-ts:** último 7 consultado **7.1.6**, pero el aviso audit actual afecta <8.0.0;
   subir a 7.1.6 no permite declararlo corregido. El arreglo publicado es 8.0.0, cambio major
   que requiere consulta al responsable y pruebas. Preferir una futura actualización oficial
   compatible de Prisma 7 que incorpore la corrección; no existe tal combinación verificada
   en esta revisión. No proponer downgrade Prisma 6 ni upgrade Prisma 8 sin aprobación.
3. **prisma/@prisma/config:** alertas agregadas por esas transitivas; no son dos fallos
   independientes adicionales. El cambio mysql2 por sí solo no dejaría audit limpio.

Por tanto, **no se ha encontrado una corrección completa soportada sin cambiar los pins de
Prisma**. La vía preferida es actualizar en conjunto CLI/client/adapter a una versión oficial
de Prisma que cambie ambas transitivas y después repetir instalación, generate, migración,
V00 nativo, V00-L y audit. Si se evaluara `deepmerge-ts@8`, su nueva major puede cambiar la
fusión de la configuración Prisma; requeriría aprobación, revisión de `prisma.config.ts` y el
mismo bloque de regresión. No se aplica force, legacy-peer-deps, overrides ni cambios mayores
en esta revisión. Fuentes/rangos y exposición
acotada del CLI están en [compatibility.md](compatibility.md).
No importar configuración Prisma/Studio en runtime; volver a auditar el artefacto Linux antes
de producción. No se considera una exención permanente de las alertas.

## Siguiente bloque propuesto

Este apartado describía el siguiente bloque al cerrar V00. T009 y T010 se implementaron y
verificaron después, con evidencia en `architecture.md` y `test-harness.md`; T011 sigue siendo
el próximo trabajo local. V00-L continúa sin ejecutar.

Bloque descrito originalmente:

- T009: composición Nest mínima, reglas de importación por capas y ESLint en API/web,
  con decisiones en ops/local/architecture.md; no crear módulos/clases sin consumidor.
- T010: harness de pruebas, carga aislada de entorno/BD, soporte Mailpit, Playwright y
  scripts obligatorios; verificar runners/navegador y no ocultar faltantes con if-present.
- Después T011 prepara configuración de producto; T012 y siguientes introducen modelo
  y fundamentos compartidos. No forman parte de este paso de revisión/preparación.
- V00-L puede realizarse temprano en paralelo al bloque local, tan pronto exista Linux
  gratuito autorizado. **No cerrar T030 ni iniciar US1/T031 hasta V00-L aprobado.**

Se conservan monolito modular por capas, Izipay fuera de identidad, S/300 total, 1000
concurrentes sin demostrar e investigación temprana de video independiente.
