# Ensamblaje y límites — T009

Fecha: 2026-09-29. Implementación mínima previa a módulos funcionales.

`AppModule` es la raíz de composición del único proceso Nest. Por ahora ensambla únicamente
el módulo Probe de compatibilidad; no se crearon módulos, controladores, repositorios ni
interfaces vacías de identidad. `main.ts` solo crea el proceso y escucha en loopback.

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
completada con esa evidencia. V00-L permanece pendiente y no se deriva del lint. Izipay y
dominios académicos no se ensamblan aquí.
