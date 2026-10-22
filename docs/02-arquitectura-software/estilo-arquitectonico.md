# Estilo arquitectónico vigente

Academia Virtual es un **monolito modular organizado por capas**. Una aplicación web
React/TypeScript/Vite consume una única aplicación backend Node.js/NestJS/TypeScript;
PostgreSQL 16.14 es su almacén. El backend se despliega como unidad y los módulos
colaboran dentro del mismo proceso. Su estado verificable está en la
[referencia documental](../estado-documental.md).

| Concepto | Aplicación concreta | Qué delimita |
| --- | --- | --- |
| Capas lógicas | Presentación, negocio (aplicación + dominio), datos (persistencia) | Responsabilidades; no tres servidores |
| Responsabilidades internas | Presentación, aplicación, dominio, infraestructura | [Dirección de dependencias](enfoque-arquitectonico.md); infraestructura también incluye SMTP y criptografía |
| Aplicaciones | APP01 web y APP02 API | Unidades ejecutables C2; React corre en el navegador, Vite sirve desarrollo |
| Módulos | identity, users, authorization, mail, audit y academic-offering | Cohesión de negocio dentro de APP02; mail/audit no necesitan un módulo Nest por cada carpeta |
| Servicios Docker | web, api, db, mailpit | Unidades del Compose local; no equivalen a capas o microservicios |
| Almacén | AL01 PostgreSQL | Una BD por entorno, con roles/migraciones; AL02 materiales todavía previsto |

R01 responde a DA04/DA07, AC06 y RT01–RT05: una persona, cuatro meses y **S/300 totales**.
La modularidad reduce coordinación operativa y mantiene reglas comprobables sin HTTP/BD.
El proceso y pool compartidos también comparten fallos y saturación; separar carpetas
no garantiza límites, y el estilo no acredita 1000 concurrentes (DA05/RT11).

La [vista general](diagrama-arquitectura.md) presenta ejecución; el
[catálogo](componentes-arquitectonicos.md) mantiene C01–C19 y trazabilidad.
Identidad está implementada con checkpoints US1–US7; oferta solo incorpora preparación
administrativa y fundamentos. Órdenes/pagos/matrícula/materiales/clases/chat/paneles
completos siguen previstos. No existe un módulo «administración» adicional: es una
audiencia de los módulos de cuentas y oferta.

Persistencia usa Prisma para esquema/generación y `pg` para consultas/transacciones
explícitas, un pool compartido y cinco migraciones versionadas. No se afirma que toda
consulta se ejecute mediante Prisma. SMTP sale desde el ejecutor interno de correo
hacia Mailpit en local; no hay worker desplegado aparte. CLI de bootstrap, retención e
invalidación reutilizan código fuera del proceso HTTP. La operación pública/HTTPS,
SMTP real, Izipay y video no están acreditados.

Fuentes: [decisiones R01–R12](../01-analisis-de-sistema/07-decisiones-arquitectonicas.md),
[AppModule](../../apps/api/src/app.module.ts), [Compose](../../compose.yml),
[plan 001](../../specs/001-identidad-acceso-roles/plan.md) y
[plan 002](../../specs/002-oferta-academica/plan.md).
