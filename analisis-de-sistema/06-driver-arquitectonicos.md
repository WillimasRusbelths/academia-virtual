# 06. Drivers arquitectónicos

Revisión AS-002: 2026-10-01. Un driver se prioriza por cuánto condiciona la estructura,
las dependencias o la viabilidad del proyecto, no por ser una funcionalidad visible.
Los orígenes remiten a [RF](03-requisitos-funcionales.md),
[atributos AC](04-atributos-de-calidad.md) y [restricciones RT](05-restricciones.md).
P1 condiciona la base/viabilidad; P2 condiciona su evolución y operación antes de publicar.

| ID | Prioridad | Descripción | Origen | Por qué influye en el diseño |
| --- | --- | --- | --- | --- |
| DA01 | P1 | Autorización efectiva y aislamiento por usuario/rol y, posteriormente, matrícula/clase. | RF03, RF08, RF16–RF17; AC04; RT09 | Exige controles en API y casos de uso, sesiones revocables persistentes y protección HLS/chat. La SPA no puede ser el límite de seguridad. |
| DA02 | P1 | Integridad de órdenes, cobros, cupos y matrículas bajo concurrencia/reintentos. | RF11–RF13; AC05; RT06 | Obliga a calcular totales en servidor, verificar pagos, persistir idempotencia y coordinar transacciones/restricciones PostgreSQL. D01–D06 bloquean el diseño detallado de transiciones. |
| DA03 | P1 | Viabilidad de video dentro del presupuesto y con acceso autorizado. | RF16; AC03–AC04; RT02, RT08 | Separa distribución de medios en SRS/HLS del monolito; requiere mecanismo de permisos para cada recurso, medición temprana de transferencia/calidad y costo antes de contratar. |
| DA04 | P1 | Una persona, cuatro meses y S/300 totales. | RT01–RT05 | Favorece monolito modular, tres capas lógicas, una BD por entorno y ejecutor interno de correo; evita infraestructura distribuida sin evidencia. |
| DA05 | P1 | Objetivo de 1000 concurrentes con evidencia reproducible. | AC01, AC03; RT11 | Exige escenarios, medición de recursos y consultas/pools/límites ajustables; condiciona selección de alojamiento. No justifica afirmar escalado horizontal, añadir Redis ni prometer capacidad. |
| DA06 | P2 | Integraciones sustituibles sin cambiar reglas de negocio. | RF02, RF04, RF12; AC06–AC07; RT06–RT07 | Los casos de uso consumen contratos; adaptadores encapsulan Izipay/SMTP. Mailpit permite pruebas locales y la tabla de entregas desacopla SMTP de la solicitud. |
| DA07 | P2 | Mantenibilidad con límites de módulos y pruebas reproducibles. | AC06; RT01, RT03–RT04 | Mapea presentación a entradas HTTP, negocio a aplicación/dominio y datos a adaptadores Prisma; lint y pruebas vigilan dependencias, y V00-L comprueba portabilidad antes de historias. |
| DA08 | P2 | Recuperación segura y secretos separados por entorno. | RF09, RF19; AC02; RT09 | Requiere migraciones, respaldos/restauración, revocación del estado restaurado y registros sin secretos; D13 debe cerrar objetivos y responsables antes de operar con datos persistentes. |

La [arquitectura inicial](../arquitectura/arquitectura-inicial.md) responde a estos drivers.
DA01/DA04/DA06/DA07 se concretan primero en el diseño de identidad. DA02 y DA03 siguen
siendo obligaciones del MVP aunque pagos y clases no formen parte del incremento actual.
Ningún driver acredita por sí mismo la implementación o aceptación del requisito de origen.
