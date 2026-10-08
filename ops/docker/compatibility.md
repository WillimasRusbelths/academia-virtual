# Compatibilidad del entorno

El entorno principal es Docker Compose con cuatro servicios Linux. Comandos,
puertos y migraciones: [README.md](README.md). Resultados de esta ejecución:
[verification.md](verification.md). Las historias de identidad siguen sin implementar.

## Versiones conservadas

Los manifests y el lockfile no cambian las versiones previamente elegidas.
Node 22.23.1/npm 10.9.8 y PostgreSQL 16.14 se comprueban dentro de los contenedores.

| Componente | Versión |
| --- | --- |
| Node / npm | 22.23.1 / 10.9.8 |
| TypeScript / Vitest | 6.0.3 / 5.0.2 |
| Nest common/core/platform-express/testing | 12.1.0 |
| React / react-dom | 19.3.0 |
| Vite / plugin-react | 8.3.1 / 6.1.1 |
| Prisma CLI/client/adapter-pg | 7.10.0, coherentes |
| pg | 8.23.0 |
| PostgreSQL | 16.14 |
| Argon2 / Nodemailer | 0.45.1 / 10.0.11 |
| reflect-metadata / rxjs | 0.2.2 / 7.8.2 |
| Mailpit Linux | 1.31.3; digest en verification.md |


## Guardas y alcance

Prisma usa el adaptador pg. La migración de ensayo crea únicamente CompatibilityProbe
y el historial Prisma en academia_v00_test. Las variables son inyectadas por Compose;
no se lee ni monta el .env.test del host. Las URL deben usar db:5432, la base de
ensayo y academia_v00_owner para migraciones o academia_v00_runtime para consultas.
Se rechazan parámetros y fragmentos. Los roles no tienen privilegios globales elevados;
runtime no puede crear esquemas ni conectarse a academia_dev. La transacción real
prueba escritura/lectura y rollback sin eliminar filas preexistentes.

Argon2id mantiene m=19456 KiB, t=2, p=1 y comprueba clave correcta e incorrecta.
SMTP usa mailpit:1025 y captura ficticia @example.test mediante http://mailpit:8025.
No se habilita relay ni se borran mensajes existentes. Estas comprobaciones no
acreditan identidad, SMTP de producción, pagos/video ni 1000 usuarios concurrentes.

## Auditoría npm — pendiente explícito

`npm audit --json` repetido el 2026-09-29, después del nuevo `npm ci`, informa cuatro paquetes altos:
prisma, @prisma/config, deepmerge-ts y mysql2. No son cuatro vulnerabilidades independientes.
`npm explain` muestra las cadenas:

- prisma 7.10.0 → @prisma/config 7.10.0 → deepmerge-ts **7.1.5**.
- prisma 7.10.0 → mysql2 **3.15.3**.

| Aviso | Evaluación y siguiente acción |
| --- | --- |
| [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | Recursión no acotada al fusionar objetos cíclicos; corregido en deepmerge-ts 8.0.0. La configuración actual es local y no recibe grafos del usuario, lo cual limita exposición pero no elimina el aviso. Una sustitución major necesita consulta y pruebas. |
| [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) | mysql2 puede degradar autenticación y revelar clave a servidor MySQL malicioso; afecta <3.22.0. El proyecto usa PostgreSQL/pg, sin conexiones MySQL. No se declara corregido. |
| [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) | Descompresión no acotada en protocolo MySQL comprimido, afecta <=3.23.0. No se usa ese protocolo en V00; permanece en el árbol de Prisma CLI. |

Prisma CLI está declarado como herramienta de desarrollo; la instalación incluye estos
paquetes transitivos. Las imágenes locales incluyen herramientas de desarrollo y esas dependencias; no son artefactos de producción.
El arreglo automático sugerido por audit cambia Prisma a 6.19.3 (major distinta): **no se
aplicó**. `mysql2@3.24.4` corrige ambos rangos publicados, pero Prisma 7.10.0 fija exactamente
3.15.3; no existe una actualización transitiva normal y no se añadió un override. Para
`deepmerge-ts`, la corrección publicada es 8.0.0 y `@prisma/config` fija 7.1.5. La opción
preferida es una versión oficial y coherente de Prisma que actualice esas dependencias; un
cambio major exige aprobación y repetir generate, migración, las pruebas Docker y auditoría.
Tampoco se usó `audit fix --force`. Reauditar y verificar el artefacto antes de producción. Estos avisos
no se ocultan con omisiones del informe ni se confunden con el bloqueo de autenticación.
