# Harness de pruebas — T010

Fecha: 2026-09-29. Estado: comprobado en Windows nativo; V00-L no ejecutado.

El harness de API crea un esquema PostgreSQL único `t_<suite>_<aleatorio>` dentro de
`academia_v00_test`. Solo el rol owner crea y elimina ese esquema; el rol runtime recibe
USAGE y DML por privilegios predeterminados, usa `search_path` explícito por conexión y no
obtiene CREATE. La limpieza acepta únicamente el identificador generado y no toca otras
bases, esquemas o datos. El harness Mailpit consulta `127.0.0.1:8025`, exige prefijos de
asunto de prueba y no borra mensajes existentes.

Playwright sirve el build web en `127.0.0.1:4173`, usa un worker y Chromium Desktop. Sus
resultados, trazas, reportes y builds están ignorados por Git. Los scripts raíz son
obligatorios: `lint`, `build`, `test:unit`, `test:integration` y `test:e2e`; no usan
`--if-present`, de modo que un script ausente falla.

## Evidencia ejecutada

- `npm ci`: exit 0; 387 paquetes instalados desde el lockfile actualizado.
- `npm test`: exit 0 después de esa instalación limpia.
- Lint: API y web, exit 0.
- Build: Nest/TypeScript y React/Vite, exit 0.
- Unitarias: arquitectura 3/3 y web 1/1.
- Integración: 3 archivos y 4/4 pruebas; incluye Nest, transacción PostgreSQL previa,
  esquema aislado con escritura/lectura runtime y Mailpit disponible.
- E2E: Chromium 1.63.0, 1/1; abrió el build servido en loopback.

El primer intento de integración reveló que un parámetro de URL no aplicaba el
`search_path` del runtime. Se corrigió usando la opción de inicio explícita de `pg`; la suite
completa posterior pasó. No se expusieron URLs ni credenciales y `.env.test` no se modificó.

`npm audit --json` posterior conserva cuatro paquetes de severidad alta agregados alrededor
de Prisma, `deepmerge-ts` y `mysql2`. No bloquean la mecánica del harness, pero tampoco se
consideran resueltos; la evaluación está en `review-v00.md` y `compatibility.md`.
