# Componentes C3 del backend

## Alcance

Esta vista delimita APP02, backend monolítico de Academia Virtual, y conserva los componentes del catálogo con responsabilidades diferenciadas. Las relaciones describen colaboración en ejecución o ensamblaje, no imports. «Implementado» acredita la responsabilidad indicada; «parcial» distingue fundamentos de flujos completos; «previsto» identifica diseño respaldado sin componente operativo.

## Componentes

| ID | Nombre | Responsabilidad | Estado |
| --- | --- | --- | --- |
| C01 | Entrada y transporte REST | Adaptar solicitudes y respuestas seguras | Parcial; negocio pendiente |
| C02 | Salud de la aplicación | Distinguir liveness y readiness | Implementado |
| C03 | Identidad y acceso | Credenciales, sesiones y elegibilidad | Parcial; historias pendientes |
| C04 | Usuarios | Validaciones, perfil y administración | Parcial; gestión pendiente |
| C05 | Autorización | Resolver sesión y permiso vigente | Parcial; alcance de identidad |
| C06 | Correo | Programar y procesar entregas | Parcial; ejecutor pendiente |
| C07 | Auditoría | Registrar cambios aceptados sin secretos | Previsto; modelo existente |
| C08 | Límites persistidos | Admitir intentos y cuotas persistentes | Implementado; integración funcional pendiente |
| C09 | Acceso compartido a datos | Proporcionar conexiones y persistencia compartidas | Implementado |
| C10 | Configuración y composición | Validar entorno y ensamblar recursos | Implementado en composición actual |
| C12 | Oferta académica | Cursos, grupos, horarios y cupos | Previsto |
| C13 | Órdenes | Selección y total confiable | Previsto |
| C14 | Pagos e integración Izipay | Verificar cobros e idempotencia | Previsto |
| C15 | Matrículas y asignación de cupos | Habilitar acceso tras pago verificado | Previsto |
| C16 | Materiales | Publicación y acceso autorizados | Previsto |
| C17 | Clases en vivo | Coordinar clase y permisos | Previsto |
| C18 | Chat de clase | Mensajes autorizados y aislamiento | Previsto |
| C19 | Paneles básicos | Ofrecer datos autorizados por rol | Previsto |

## Relaciones principales

APP01, AL01 y los proveedores quedan fuera de APP02, conforme a [C2](02-contenedores.md).

| Origen | Destino | Propósito |
| --- | --- | --- |
| APP01 | C01 / C18 | REST / chat previstos |
| C10 | C09/C01/C05/C02 | Ensamblaje actual al arrancar |
| C01 | C05 → C03 | Sesión y permiso; controles ensamblados |
| C02 | C09 → AL01 | Readiness actual mediante PostgreSQL |
| C03 | C04 | Validación pública de cuenta existente |
| C03/C08 | C09 → AL01 | Sesiones actuales y cuotas probadas |
| C01 | C03/C04/C12–C17/C19 | Casos de uso previstos |
| C03/C04 | C07 | Auditoría transaccional prevista |
| C03 | C06 → C08/C09 | Programación de correo prevista |
| C06 | E02 / E03 | SMTP previsto; Mailpit solo captura técnica |
| C13 | C12 | Oferta y precios; previsto |
| C14 | C13 / E01 | Orden y verificación de pago; previsto |
| E01 | C14 → C15 | Confirmación y matrícula; previsto |
| C15 | C12/C13/C09 | Cupos, orden y persistencia; previsto |
| C16/C17/C18 | C05/C15/C12 | Permiso, vigencia y contexto; previsto |
| C19 | C12–C18 | Capacidades públicas para paneles; previsto |

## Límites y pendientes

- C11, entrada CLI prevista, está fuera del proceso HTTP; no es componente servido ni contenedor adicional.
- Identidad completa, auditoría, correo y C12–C19 siguen pendientes; no hay worker separado. Las relaciones previstas requieren contratos.
- Izipay E01 y correo E02 no están integrados; E03 es apoyo local. AL02, materiales, queda por definir.
- YouTube se reproduce desde APP01; no hay conexión de control APP02–YouTube. Acceso al video, recuperación y 1000 concurrentes permanecen sin demostrar.

## Referencias esenciales

- [Catálogo](../02-arquitectura-software/componentes-arquitectonicos.md): trazabilidad y relaciones completas.
- [Diseño interno](../03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md): contratos y elementos concretos.
- [Plan de identidad](../../specs/001-identidad-acceso-roles/plan.md) y [decisiones pendientes](../decisiones-pendientes.md).
- [Composición actual](../../apps/api/src/app.module.ts) y [código del backend](../../apps/api/src/).
