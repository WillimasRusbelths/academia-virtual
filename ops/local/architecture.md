# Ensamblaje y límites — T009

Fecha: 2026-09-29. Implementación mínima previa a módulos funcionales.

`AppModule` es la raíz de composición del único proceso Nest. En T009 ensamblaba únicamente
el módulo Probe de compatibilidad, conservado para su smoke aislado. T021–T023 añaden
`AuthorizationModule`, `SessionLookup`, el adaptador de sesiones sobre el pool compartido y
los controladores de salud. La composición inyecta los contratos sin importar IdentityModule
desde autorización. El guard no accede a SQL y los permisos pertenecen al dominio.
`main.ts` crea el proceso y usa `API_HOST=0.0.0.0`
en Compose; su puerto se publica solo en loopback del host.

Los módulos futuros viven en `src/modules/<módulo>/`. La regla ESLint comprobada aplica:

- entrypoints HTTP → application/domain/public del mismo módulo; nunca Prisma/pg/hash/SMTP;
- application → domain/public y contratos pequeños; nunca Nest/HTTP/IO o infraestructura;
- domain → TypeScript relativo puro; nunca paquetes externos o infraestructura;
- infrastructure → application/domain/public y librerías de IO; nunca Nest/Express;
- entre módulos solo se importa la superficie `public`, no carpetas internas;
- la raíz Nest conecta adaptadores. No se introducen repositorios genéricos, CQRS ni clases
  que solo reenvíen llamadas.

En web, `shared` no depende de app/features; una feature solo depende de sí misma y shared;
app puede componer ambas. La prueba de reglas incluye casos permitidos y denegados para que
las rutas futuras no conviertan la configuración en una declaración sin efecto.

Comprobación real del 2026-09-29: `npm run lint` terminó con exit 0 y
`npm run test:unit` aprobó los tres casos de arquitectura más el smoke unitario web.
La suite prueba importaciones permitidas y rechaza dominio→Nest, dominio→infraestructura,
aplicación→internos de otro módulo y dependencias laterales entre features. T009 queda
completada con esa evidencia. La comprobación Linux está en
[verificación Docker](../docker/verification.md); no se deriva del lint. Izipay y
dominios académicos no se ensamblan aquí.

La revalidación del actor pertenece al adaptador de persistencia y debe ejecutarse dentro
de la transacción de cada mutación protegida, respetando gobierno → usuarios por UUID →
sesiones. El savepoint exige una transacción explícita; liberar el savepoint no libera los
bloqueos. El interceptor renueva actividad solo tras un resultado autorizado satisfactorio
y serializable, sin emitir cookie ni ampliar la expiración absoluta. Los controladores de
prueba permanecen en `tests/`; la composición de producción solo expone salud. Registro,
login y administración siguen pendientes. Evidencia en
[sesiones, autorización y transporte](../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md).
