# Principios de diseño aplicados

SOLID orienta funciones, tipos y objetos; no exige herencia ni certifica el sistema por
tener interfaces. Los [detalles de módulos](diseno-interno-de-modulos.md) evitan repetir
flujos; [Clean Architecture](../../02-arquitectura-software/enfoque-arquitectonico.md)
define dependencias. Relación: AC06/DA07/RT03 → R01 → C03–C12.

| Principio | Ejemplo verificable | Alcance y límite |
| --- | --- | --- |
| Responsabilidad única | schedule.ts evalúa calendario civil sin IO; controlador adapta HTTP; createPreparationStore coordina SQL; formularios presentan errores | Separación revisada en 002 T023–T029; un adaptador aún reúne operaciones transaccionales relacionadas |
| Abierto/cerrado | Login y SessionLookup consumen contratos; composición suministra credenciales/sesiones. DeliverPending consume Mailer | Instrumentación Argon2 y SMTP local probados; cambiar reglas/permisos puede exigir modificar código. No demuestra extensiones arbitrarias |
| Sustitución de Liskov | verify admite hash null sin conceder acceso; SessionRepository.lookup no renueva, accept no revive, revoke idempotente | Pruebas reales de credenciales/sesiones; no suite común contra varios proveedores productivos. Compatibilidad TypeScript no garantiza semántica |
| Segregación de interfaces | TeachingDirectory mínimo; PreparationCommands recibe PreparationStore; consultas usan Pick de lecturas y accept | No obliga a oferta a conocer UserView/secretos/pg en núcleo. SessionLookup recibe revoke aunque no lo usa: segregación mínima universal no demostrada |
| Inversión de dependencias | Aplicación depende de contratos; adaptadores implementan; AppModule conecta | Lint y suites de capas/imports comprobados. PostgresDeliveryStore recibe un adaptador concreto de cuotas dentro de infraestructura; no afirmar desacoplamiento absoluto |

La cohesión agrupa identidad, usuarios, autorización, correo y oferta por responsabilidad.
El acoplamiento entre oferta e identidad se limita mediante superficies públicas,
directorio SQL y capacidades de infraestructura inyectadas. No hay HTTP entre módulos
ni callbacks desde identidad a oferta. El núcleo no depende de NestJS/Prisma/pg/SMTP.

Evidencia: [001 aceptación](../../../specs/001-identidad-acceso-roles/evidence/acceptance.md),
[002 T017](../../../specs/002-oferta-academica/evidence/t015-t017.md) y
[002 T028/T029](../../../specs/002-oferta-academica/evidence/t028-t029.md).
Los controles de imports no detectan todo ciclo semántico ni prueban todo motivo de
cambio. Mantienen abiertos bootstrap, aceptación integral y 1000 concurrentes según el
[inventario](../../estado-documental.md); no se refactoriza producto en esta etapa.
