# Ensamblaje y límites del monolito modular

Estado 2026-10-29; T070. El registro inicial T009/T021–T023 se conserva al final
como historia. Estado vigente respaldado por [T068](../../specs/002-oferta-academica/evidence/automated.md)
y [T069](../../specs/002-oferta-academica/evidence/recovery.md); aceptación humana e
integral pendientes. Constitución vigente 1.2.0, PA-01–PA-05/E1 conservadas.

## Composición actual

Un proceso Nest y un pool PostgreSQL compartido. AppModule compone autorización,
identidad, usuarios, oferta, salud y los adaptadores de correo/auditoría. El scheduler
de correo usa el mismo proceso; no es un servicio distribuido nuevo. React/Vite
compone las features desde app, con ApiClient y elementos shared; mantiene identidad,
perfil, administración de cuentas y cierre al navegar hacia oferta.

| Componente | Responsabilidad y frontera |
| --- | --- |
| academic-offering/domain | Curso, grupo, ciclo, fechas y franjas como reglas puras; sin Nest/pg/IO. |
| academic-offering/application | Comandos y consultas mediante puertos; sin SQL ni transacciones manuales en casos de uso. |
| academic-offering/infrastructure | Stores/queries PostgreSQL, escritura atómica de negocio/ledger/auditoría; proyección mínima por audiencia. |
| academic-offering/entrypoints | HTTP y validación estricta, guardas backend y errores seguros; no credenciales ni datos internos de identidad. |
| users/public y AcademicTeacherDirectory | Contrato mínimo del docente: referencia/nombre/elegibilidad/generación. Oferta no consulta columnas privadas de User. |
| identity/public y authorization | Actor/sesión/capacidades existentes; permiso desconocido denegado. Revalidación transaccional inyectada desde la raíz. |
| infrastructure/database | AccountLocks/accountTransaction y protocolo académico; solo adaptadores/raíz conocen PoolClient y locks físicos. |
| web/features/academic-offering | Gestión, catálogo y grupos propios; app inyecta sesión, ApiClient y navegación, sin imports laterales de auth/profile/admin-users. |

Rutas web: ADMIN /admin/oferta y detalles; STUDENT/ADMIN /oferta y detalles;
TEACHER /mis-grupos y detalle. Inicio conserva perfil/logout; ADMIN conserva cuentas.
El visitante no recibe oferta. AccessGuard y filtros/revalidaciones del backend
son obligatorios aunque exista guarda visual.

## Consistencia, privacidad y estados

La propiedad de generación docente sigue en usuarios/identidad; la migración 0005
añade User.teacherEligibilityVersion, cinco tablas académicas, restricciones,
trigger y vista mínima. Identidad cambia acceso/generación en su misma transacción;
recuperar habilitación no modifica snapshots académicos ni republica. Las lecturas
filtran publicación/elegibilidad/snapshot en una sentencia, antes de conteos y
paginación. Docente solo lee grupos propios, sin causa privada de cancelación.

El protocolo de oferta usa READ COMMITTED y una conexión: descubre participantes,
bloquea cuentas por UUID, sesión, curso y grupos en orden consistente y consulta
conflictos después de adquirir los locks. Comparte el presupuesto de reintentos
de accountTransaction; no añade mutex global ni otro bucle de reintentos. Identidad
puede adquirir SystemState antes de cuentas; oferta no lo adquiere después de ellas.
Revisiones impiden sobrescritura; commandId/digest gobiernan repetición de intención.
Negocio, resultado persistido y auditoría se confirman/revierten atómicamente.

Retirar precede a editar Publicado; retirar padre oculta sin editar hijos.
Republicación explícita revalida lo requerido; cancelación de grupo terminal.
Horarios America/Lima, ocurrencias efectivas, adyacencia permitida y sin medianoche.
Capacidad 1–50, sin inventario de reservas/ocupación/disponibilidad. Detalle normativo
en [integración](../../specs/002-oferta-academica/contracts/integration.md),
[modelo](../../specs/002-oferta-academica/data-model.md) y
[HTTP](../../specs/002-oferta-academica/contracts/api.md).

## Verificación y límites

T068 reúne reglas/arquitectura, PostgreSQL real, autorización/privacidad/carreras y
E2E de las cuatro historias e identidad. T069 prueba migración incremental, restore
a BD nueva, invalidación y revisión de decisiones posteriores al backup. Son
resultados de esas revisiones, no ejecuciones nuevas por documentar.
T067 añade E2E al job existente; CI remoto y su duración no están acreditados.
La revisión estática T072 identifica H-CAP-01, aviso no calculado ausente en el
catálogo inicial; [protocolo](../../specs/002-oferta-academica/evidence/human-acceptance.md).
No se considera SC-002 demostrado por esos pases automáticos.

Sin nuevos servicios, Redis, pools, infraestructura AWS, reservas/matrícula/pagos,
materiales, video o chat. Compose manual y datos/configuración existentes se
conservan. D04, parte de matrícula D06, D10/D13, SMTP externo, T104/T108, bootstrap
y timeout E2E D10 siguen abiertos. Este último es distinto de la decisión D10.
No hay evidencia aprobatoria para 1000/2500 concurrentes ni aceptación integral.

<details>
<summary>Registro histórico T009/T021–T023; no es el estado vigente</summary>

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

</details>
