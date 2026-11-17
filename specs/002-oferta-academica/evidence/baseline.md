# Inventario inicial — T001

Fecha: 2026-10-19 (America/Lima). Rama: `feat/002-oferta-academica`.
Commit documental previo a implementación: `e0dafe868f5a0e4442963ae3a893048cacbfc516`.
Incluye diez documentos de 002, sin configuración, secretos ni evidencia manual.

## Revisión previa y alcance

Se leyeron habilidad implement, constitución 1.1.0, especificación, plan, investigación,
modelo, tres contratos, guía local y tareas. Checklist requirements: 16/16, cero pendientes;
no se alteró. No hay AGENTS.md ni hooks before/after_implement en este repositorio.

`git diff --cached --check` detectó un salto vacío final en tasks.md: corregido antes
del commit y repetido con código 0. Se revisaron diez archivos pertinentes y se comprobó
que no hubiera claves privadas, URL de BD con contraseña literal ni secretos asignados.
E1 sigue corregido: T012 exige probar ledger/auditoría antes de T014, cuyo cierre exige
T012 verde. No se ejecutan esas tareas en este bloque.

Estado inicial: solo `?? specs/002-oferta-academica/`. Tras commit documental: limpio.
Las frases históricas «no implementar ahora» de los artefactos corresponden a su etapa;
la instrucción actual autoriza exclusivamente T001–T004. No se modifican PA-01–PA-05.

## Fuente y conservación

Se registraron 72 archivos protegidos en un manifiesto privado ignorado:
`.cache/academic-offering-validation/protected-before.json`. Incluye los 58 archivos
versionados del primer spec, nueve documentos previos de 002, `.env`, `.env.test`,
`compose.override.yml`, lockfile y el archivo privado de cuentas manuales.
El informe público omite contenido, credenciales y huellas de secretos.

Las quince cuentas corresponden al inventario histórico del ensayo manual. No se abrió
su base para volver a contarlas: su contenedor permanecía detenido. La conservación se
comprueba mediante ausencia de operaciones sobre ese proyecto/volumen y huellas de sus
archivos, sin presentar una nueva auditoría de las filas manuales.

Árbol Git del primer spec en el commit documental:
`1c752e03339e6cbda04c50e571a7c7f8dafe6d75`. Comparación ejecutada tras preparar/build/PG:
72/72 archivos protegidos idénticos; cero diferencias. El inventario de la copia registra
490/490 fuentes sin desviaciones respecto a su snapshot revisado; no contiene secretos.

Contenedores manuales iniciales: web `e39d1e39b4ef`, API `15fc5207c89a`,
DB `e804ca17a1d5`, correo `2aecaa5142a2`, todos detenidos.
DB: StartedAt `2026-10-18T19:19:45.837265111Z`, FinishedAt
`2026-10-18T21:58:41.760194769Z`; volumen `academia-local_postgres_data`.
También se conserva `academia-local_manual_us1_secrets`. No se arranca academia-local.

## Versiones y puntos de integración existentes

- Host: Node 22.23.1, npm 10.9.8; `npm.cmd` evita cambiar la política PowerShell.
- Docker Engine 29.8.1 y Compose 5.5.1. Inicialmente motor ausente; se inició Docker
  Desktop oculto y se usó acceso al motor fuera del sandbox, sin reinicialización.
- Stack fijado por lockfile: TypeScript 6.0.3, Nest 12.1.0, Prisma 7.10.0, PostgreSQL
  16.14, Vitest 5.0.2 y Playwright 1.63.0. Sin actualización de dependencias.
- `identityDatabase` aplica únicamente migraciones existentes en un esquema `t_*`
  creado por test-environment; roles propietario/runtime de academia_v00_test.
- `createIdentityFixtures` y `sessionFixture` generan datos sintéticos con hashes y
  sesiones reales de identidad; no usan bootstrap ni credenciales del ensayo manual.
- `locks.ts` observa esperas desde un pool independiente; se importa solo en Vitest,
  para no cargar su runtime en Playwright.
- `us1Http` ensambla AppModule y transporte reales con pool propio y origen loopback;
  no añade endpoints privilegiados o mocks de autorización.
- Fixtures Playwright previas muestran arranque Vite con proxy a la API del esquema;
  nueva configuración fija localhost y no acepta PLAYWRIGHT_BASE_URL manual.
- `.gitignore`, `.dockerignore` y ignores ESLint cubren secretos, cachés, clientes
  generados, build y resultados. Workspaces privados; no se requiere npmignore de publicación.

## Límites heredados

D04 y D06/matrícula, T104/T108, bootstrap intermitente, SMTP real, D10/D13, video y
alojamiento mantienen sus estados. Este inventario no valida funcionalidad académica,
aceptación humana, recuperación operativa ni capacidad para 1000 concurrentes.

## Huellas de los nueve documentos previos

SHA-256 de bytes de trabajo antes del bloque; Git puede normalizar CRLF en sus blobs.

| Archivo | SHA-256 |
| --- | --- |
| checklists/requirements.md | 57130545640FA955077275BBA08793DD9D0A4416907985332C880CC635874511 |
| contracts/api.md | 3396290A32E310167A9345333E1C3B4CEE3CD01D3DD1375456401C1E59F935B2 |
| contracts/integration.md | AA029B7F51566EF15F9B2E7953D56D9D8DBA66AC812AC2E915A56D0BB7C06E20 |
| contracts/ui.md | CF65B321722ABCC17480A6346D727E85BF6203B16446FFABC9EA807020A98839 |
| data-model.md | A65C3C39F6DAFB3B2A434464FCCC6C842F72BBDADB5B8829D76B6EE8889B7A92 |
| plan.md | 2FFC85635B3A5DBEFAE6EE97B508700E65D2F2958ED65BB930AF481652773855 |
| quickstart.md | 7AEC1B8398B7503480A250C8F11973C4ED60DFAFB9CE2EAB32D66B244A0618E6 |
| research.md | 8C04B8D90C4E59A63102F5D19479685740ABE12FBA7913D572A942FC1A7CAF00 |
| spec.md | 38AC3E76389E4701D7216E611C8E3BD09780FD99EA719546B02C74342F985742 |
