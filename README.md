# academia-virtual

Proyecto de academia virtual para un trabajo final de curso, con cuatro meses de plazo
y desarrollo local mediante Spec-Driven Development con GitHub Spec Kit.

**Estado al 2026-10-14:** React/NestJS con Docker Compose como entorno local principal.
[US1: acceso y cierre de sesión](specs/001-identidad-acceso-roles/evidence/us1.md) está implementada
y verificada con cuentas de prueba de los tres roles: login, consulta propia, recarga y logout.
[US2: registro y verificación](specs/001-identidad-acceso-roles/evidence/us2.md) está implementada
y verificada mediante registro público, Mailpit, confirmación explícita, reenvío y login.
[US6: primer administrador](specs/001-identidad-acceso-roles/evidence/us6.md) cuenta con CLI
restringida y activación mediante contraseña propia y correo verificado, comprobadas en un entorno aislado.
Recuperación, administración y funciones académicas siguen pendientes;
no hay integración de pagos/video ni despliegue acreditado.
La configuración por entorno y el esquema de identidad con cuatro migraciones cuentan con
[pruebas de persistencia](specs/001-identidad-acceso-roles/evidence/fundamentos-datos.md).
Las [reglas, credenciales y cuotas persistidas](specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md)
se reutilizan en US1 y US2.
Las [sesiones, autorización y protecciones HTTP](specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md)
respaldan la integración de acceso; los demás flujos de identidad siguen pendientes.
El objetivo de 1000 usuarios concurrentes está pendiente de validación mediante pruebas
de carga reproducibles; no es una capacidad garantizada.

El presupuesto de infraestructura y servicios es **S/300 en total**, destinado a despliegue
y pruebas necesarias, no a financiar una operación permanente. Se prevén aproximadamente
1000 estudiantes, con grupos de 40 a 50 alumnos por curso.

## Ejecución local

Iniciar Docker Desktop con motor Linux. Crear `.env` a partir de `.env.example` con cinco
contraseñas locales y cuatro claves de identidad independientes, o generarlo sin sobrescribir archivos mediante el comando
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
  ejecución mediante Docker Compose. Los checkpoints funcionales US1 y US2 están verificados;
  las demás historias y la aceptación transversal siguen pendientes.

## Análisis del sistema

- [Actores](docs/01-analisis-de-sistema/01-actores.md) e [historias de usuario](docs/01-analisis-de-sistema/02-historias-del-usuario.md).
- [Requisitos funcionales y relación HU ↔ RF](docs/01-analisis-de-sistema/03-requisitos-funcionales.md).
- [Atributos de calidad](docs/01-analisis-de-sistema/04-atributos-de-calidad.md) y [restricciones](docs/01-analisis-de-sistema/05-restricciones.md).
- [Escenarios de atributos de calidad](docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md): medidas, trazabilidad y evidencia disponible.
- [Drivers arquitectónicos](docs/01-analisis-de-sistema/06-driver-arquitectonicos.md).
- [Arquitectura inicial de tres capas](docs/02-arquitectura-software/arquitectura-inicial.md): diagrama Mermaid,
  inventario, evidencia, discrepancias y pendientes. Esta síntesis enlaza el detalle existente
  en `docs/` y `specs/`, que conserva el alcance y sus criterios de aceptación.
- [Catálogo de componentes arquitectónicos](docs/02-arquitectura-software/componentes-arquitectonicos.md): responsabilidades, interfaces, estados y relaciones del backend.
- [Diseño interno de módulos](docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md): organización de identidad por capas, contratos, adaptadores y diseño académico previsto.
- [Patrones de diseño](docs/03-diseno-de-software/diseno-interno/patrones-de-diseno.md): adaptadores existentes y previstos, entrega diferida transaccional y límites de su implementación.
- [Principios de diseño](docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md): aplicaciones de SOLID, evidencia disponible y límites de los contratos y dependencias actuales.
- [Contexto del sistema C1](docs/04-modelo-c4/01-contexto-del-sistema.md): propósito, personas, sistemas externos, relaciones previstas e incertidumbres.
- [Contenedores C2](docs/04-modelo-c4/02-contenedores.md): aplicaciones, persistencia, comunicaciones y decisiones pendientes.
- [Componentes C3 del backend](docs/04-modelo-c4/03-componentes.md): responsabilidades, colaboraciones y estados dentro de APP02.
- [Código C4 de sesiones](docs/04-modelo-c4/04-codigo.md): contratos, reglas, adaptador persistido y relaciones estructurales reales.

El análisis reúne **17 historias HU y 19 requisitos RF generales del MVP**. Identidad desarrolla
una parte de ese alcance mediante **7 historias US y 33 requisitos FR detallados**; son
niveles distintos de descripción, no cifras alternativas del mismo catálogo. Véase la
[correspondencia de identidad](docs/01-analisis-de-sistema/03-requisitos-funcionales.md#correspondencia-con-el-detalle-de-identidad).

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
La API y la web incorporan los flujos de acceso/cierre y registro/verificación de identidad;
las funciones académicas permanecen previstas.

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
por roles**. T001–T061 están completadas, incluidos los checkpoints US1, US2 y
[US6](specs/001-identidad-acceso-roles/evidence/us6.md), con [operación del primer administrador](ops/local/first-admin.md);
T059–T061 corresponden solo a [escritura de pruebas US4](specs/001-identidad-acceso-roles/evidence/us4-pruebas.md), sin administración funcional.
El resto de las historias y las verificaciones finales siguen pendientes. Para ejecutar
el entorno actual, seguir la [guía Docker](ops/docker/README.md) y la evidencia de cada
incremento; el quickstart conserva procedimientos aún previstos. La viabilidad del
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
