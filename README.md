# academia-virtual

Proyecto de academia virtual para un trabajo final de curso, con cuatro meses de plazo
y desarrollo local mediante Spec-Driven Development con GitHub Spec Kit.

**Estado:** documentación inicial. La aplicación aún no está implementada, no hay servicios
contratados ni despliegue realizado como parte de esta etapa. El objetivo de 1000 usuarios
concurrentes está pendiente de validación reproducible; no es una capacidad garantizada.

El presupuesto de infraestructura y servicios es **S/300 en total**, destinado a despliegue
y pruebas necesarias, no a financiar una operación permanente. Se prevén aproximadamente
1000 estudiantes, con grupos de 40 a 50 alumnos por curso.

## Documentación

- [Constitución del proyecto](.specify/memory/constitution.md): principios y gobernanza.
- [Alcance del MVP](docs/alcance-mvp.md): funcionalidades previstas, exclusiones y propuesta técnica.
- [Decisiones pendientes](docs/decisiones-pendientes.md): reglas y riesgos por resolver.
- [Identidad, autenticación y acceso por roles](specs/001-identidad-acceso-roles/spec.md):
  primera especificación revisada, con correo verificado, recuperación por correo, un rol
  por cuenta y [checklist de calidad](specs/001-identidad-acceso-roles/checklists/requirements.md).
- [Plan técnico de identidad](specs/001-identidad-acceso-roles/plan.md): decisiones, datos,
  contratos y [guía local planificada](specs/001-identidad-acceso-roles/quickstart.md), con
  prerrequisitos comprobados y bloqueos de Docker/WSL. La aplicación sigue sin implementar.

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

## Base técnica propuesta

React, TypeScript y Vite para el frontend; NestJS como monolito modular con TypeScript;
PostgreSQL y Prisma; Socket.IO autorizado por clase; OBS → SRS → HLS con HLS.js o reproducción
nativa; Docker Compose local; Nginx y HTTPS para una futura publicación.

Estas opciones no están implementadas. El video, el ancho de banda y el costo requieren una
prueba temprana. No se añadirán microservicios, Kubernetes, Redis ni balanceadores sin una
necesidad comprobada.

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

La primera funcionalidad en especificación es **identidad, autenticación y acceso por roles**. La
viabilidad del video y la rúbrica de evaluación se investigarán al inicio del proyecto.
La guía local describe el arranque futuro; sus scripts de aplicación todavía no existen.
No se han ejecutado pruebas de capacidad.

## Archivos compartidos y configuración local

Versionar documentación, especificaciones, plantillas, scripts y habilidades compartibles.
El `.gitignore` excluye secretos, archivos `.env` reales, dependencias, compilaciones,
grabaciones, respaldos y datos locales. Los archivos `.env.example` y `.env.*.example`
pueden compartirse únicamente con valores ficticios, sin credenciales.

Desarrollo, demo y producción deben separar configuración, secretos y datos; no requieren
servidores permanentes por entorno. Las pruebas de carga usarán cuentas diferentes y pagos
simulados. La integración con la pasarela se comprobará aparte en su sandbox.
