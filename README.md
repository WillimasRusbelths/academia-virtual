# academia-virtual

Proyecto de academia virtual para un trabajo final de curso, con cuatro meses de plazo
y desarrollo local mediante Spec-Driven Development con GitHub Spec Kit.

**Estado al 2026-10-06:** base técnica React/NestJS con Docker Compose como entorno local
principal. Las historias de identidad y las funciones académicas
aún no están implementadas; no hay integración de pagos/video ni despliegue acreditado.
El objetivo de 1000 usuarios concurrentes está pendiente de validación mediante pruebas
de carga reproducibles; no es una capacidad garantizada.

El presupuesto de infraestructura y servicios es **S/300 en total**, destinado a despliegue
y pruebas necesarias, no a financiar una operación permanente. Se prevén aproximadamente
1000 estudiantes, con grupos de 40 a 50 alumnos por curso.

## Ejecución local

Iniciar Docker Desktop con motor Linux. Crear `.env` a partir de `.env.example` con cinco
claves locales independientes, o generarlo sin sobrescribir archivos mediante el comando
documentado en [ops/docker/README.md](ops/docker/README.md).

```sh
docker compose up -d --build
docker compose ps
```

Web: `http://localhost:5173`; API: `http://localhost:3000/health/live`;
Mailpit: `http://localhost:18025`. PostgreSQL se publica en `127.0.0.1:55432` y SMTP
en `127.0.0.1:11025`. Las conexiones entre servicios usan `db` y `mailpit`.
Consultar [la guía Docker](ops/docker/README.md) para migraciones, pruebas, logs,
persistencia y solución de problemas. Detener con `docker compose down`, sin `-v`.

## Documentación

- [Constitución del proyecto](.specify/memory/constitution.md): principios y gobernanza.
- [Alcance del MVP](docs/alcance-mvp.md): funcionalidades previstas, exclusiones y propuesta técnica.
- [Decisiones pendientes](docs/decisiones-pendientes.md): reglas y riesgos por resolver.
- [Identidad, autenticación y acceso por roles](specs/001-identidad-acceso-roles/spec.md):
  primera especificación revisada, con correo verificado, recuperación por correo, un rol
  por cuenta y [checklist de calidad](specs/001-identidad-acceso-roles/checklists/requirements.md).
- [Plan técnico de identidad](specs/001-identidad-acceso-roles/plan.md): decisiones, datos,
  contratos y [guía local planificada](specs/001-identidad-acceso-roles/quickstart.md), con
  ejecución mediante Docker Compose. Las historias siguen sin implementar.

## Análisis del sistema

- [Actores](analisis-de-sistema/01-actores.md) e [historias de usuario](analisis-de-sistema/02-historias-del-usuario.md).
- [Requisitos funcionales y relación HU ↔ RF](analisis-de-sistema/03-requisitos-funcionales.md).
- [Atributos de calidad](analisis-de-sistema/04-atributos-de-calidad.md) y [restricciones](analisis-de-sistema/05-restricciones.md).
- [Drivers arquitectónicos](analisis-de-sistema/06-driver-arquitectonicos.md).
- [Arquitectura inicial de tres capas](arquitectura/arquitectura-inicial.md): diagrama Mermaid,
  inventario, evidencia, discrepancias y pendientes. Esta síntesis enlaza el detalle existente
  en `docs/` y `specs/`, que conserva el alcance y sus criterios de aceptación.

El análisis reúne **17 historias HU y 19 requisitos RF generales del MVP**. Identidad desarrolla
una parte de ese alcance mediante **7 historias US y 33 requisitos FR detallados**; son
niveles distintos de descripción, no cifras alternativas del mismo catálogo. Véase la
[correspondencia de identidad](analisis-de-sistema/03-requisitos-funcionales.md#correspondencia-con-el-detalle-de-identidad).

## MVP previsto

Autenticación para administrador, docente y alumno; cursos, grupos, horarios y cupos;
órdenes con varios cursos, conceptos y total; matrículas y pagos verificados; materiales;
clases emitidas por el docente con chat para alumnos; y paneles básicos por rol.

Se propone un pago por el total de cada orden y una matrícula por cada curso adquirido.
Esta regla requiere validación. **Izipay es la pasarela elegida para el MVP** desde el
2026-09-23 y sustituye a Culqi, que figuraba como candidata inicial. La integración no está
implementada; siguen pendientes tarifas finales, límites, acceso al entorno de pruebas y
habilitación de Yape para la modalidad contratada. No se asume capacidad ilimitada.
La integración del proveedor debe permanecer separada de las reglas de órdenes y matrículas
para permitir cambiar de pasarela posteriormente.

## Base técnica y componentes previstos

React, TypeScript y Vite para el frontend; NestJS como monolito modular con TypeScript;
PostgreSQL 16.14 y Prisma, con Mailpit 1.31.3 para correo local. Compose construye las
imágenes Linux de API/web con `npm ci` y conserva los datos de PostgreSQL en un volumen.
La API solo ensambla Probe y la web
muestra «En preparación»; no hay flujos de negocio completos.

Socket.IO autorizado por clase sigue propuesto. YouTube Live con OBS es la elección
de video del MVP según DA03 y DEC01; integración y control de acceso pendientes.
Docker Desktop y WSL2 están operativos; la configuración de Compose incluye
PostgreSQL, Mailpit, API y web. Nginx y HTTPS corresponden a publicación futura.
El video, el ancho de banda y el costo requieren una prueba temprana. No se añadirán
microservicios, Kubernetes, Redis ni balanceadores sin una necesidad comprobada.

## Trabajo con Spec Kit

El repositorio contiene configuración, scripts PowerShell, plantillas y habilidades de
Spec Kit para Codex. La configuración local registra Spec Kit 1.0.9; esto no verifica la
disponibilidad de un ejecutable global. Los archivos compartibles de `.specify/` y
`.agents/skills/` ya forman parte del historial inicial.

Para cada funcionalidad pequeña:

1. Especificar con `$speckit-specify`.
2. Resolver ambigüedades con `$speckit-clarify` o documentar que no quedan aclaraciones.
3. Preparar diseño y plan con `$speckit-plan`.
4. Generar tareas con `$speckit-tasks` y revisar consistencia con `$speckit-analyze`.
5. Implementar con `$speckit-implement` y verificar los criterios de aceptación.

La primera funcionalidad especificada y planificada es **identidad, autenticación y acceso
por roles**. Las tareas T001–T010 preparan y validan el entorno y la base técnica; sus historias aún no están
implementadas. Para ejecutar el entorno actual, seguir la [guía Docker](ops/docker/README.md);
los procedimientos de producto del quickstart siguen siendo futuros. La viabilidad del
video y la rúbrica de evaluación permanecen pendientes. No se han ejecutado pruebas de capacidad.

## Archivos compartidos y configuración local

Versionar documentación, especificaciones, plantillas, scripts y habilidades compartibles.
El `.gitignore` excluye secretos, archivos `.env` reales, dependencias, compilaciones,
grabaciones, respaldos y datos locales. Los archivos `.env.example` y `.env.*.example`
pueden compartirse únicamente con valores ficticios, sin credenciales.

Se conservan `.agents/skills/`, `.specify/` y el workflow manual de `.github/workflows/`,
que forman parte del proceso y las validaciones previstas. `.vscode/settings.json` solo
oculta dependencias, cachés npm/locales y reportes de pruebas en el explorador; no los
elimina ni oculta código, pruebas o documentación. Los ejemplos de entorno no contienen
credenciales y `.env`/`.env.test` permanecen fuera de Git y de las imágenes.

Desarrollo, demo y producción deben separar configuración, secretos y datos; no requieren
servidores permanentes por entorno. Las pruebas de carga usarán cuentas diferentes y pagos
simulados. La integración con la pasarela se comprobará aparte en su sandbox.
