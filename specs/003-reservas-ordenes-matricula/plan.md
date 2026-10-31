# Plan técnico: reservas, órdenes y matrícula

**Branch**: `feat/003-reservas-ordenes-matricula` | **Date**: 2026-10-30, America/Lima |
**Spec**: [spec.md](spec.md), quince aclaraciones conservadas.

**Input**: RC-01–RC-07, HU10/HU11, RF11–RF13 y RA-01–RA-06/PD-01–PD-03.
**Estado**: RP004, plan base y artefactos de fases 0/1 preparados; RP005 concreta
reloj/límites y normalización diferida. Diseño técnico sin código, migraciones,
servicios ni pruebas de producto ejecutados. RP006 continúa pendiente de diseño
especializado antes de tareas de implementación.

## Summary

Incorporar enrollment al monolito modular NestJS/PostgreSQL con identidad existente,
reserva conjunta, orden desglosada y precio PEN conservado; confirmar matrícula solo
por pago auténtico aplicable. Admisión persistida y despacho ordenado hacen explícita
la prioridad aprobada. Participantes públicos dentro de una misma transacción coordinan
oferta, habilitación, cupos, revisión, resultados y auditoría.

Las 24 horas son exactamente 86 400 segundos desde confirmación del servidor. El
inventario se calcula desde reservas/matrículas vigentes, sin contador duplicado.
Visibilidad puede bloquear pago/confirmación sin liberar reservas o revocar matrículas.
Snapshots originales evitan que editar/republicar reactive historial finalizado.

Se conserva el [inventario RP001](research.md) íntegro y se anexa investigación nueva;
las decisiones actuales están en [R01–R08](research-rp004.md). Los documentos 001/002
y sus resultados históricos no se reescriben para atribuirles comportamiento financiero.
El checklist global conserva 12/16 y puertas explícitas: este plan no aprueba capacidad,
pasarela, economía ni operación. Se planifica únicamente la parte funcional aclarada.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node 22.23.1 y npm 10.9.8 según base existente.

**Primary Dependencies**: NestJS 12.1.0, Prisma 7.10.0, pg, React 19 y Vite 8. Reutilizar
package-lock sin actualizaciones ni nuevos servicios. Ningún SDK Izipay elegido aún.

**Storage**: PostgreSQL 16.14 registrado en entorno aislado; mismo pool. Prisma para
modelos/migraciones futuras y pg para coordinación transaccional existente. Nuevas
tablas aditivas después de 0005, sin modificar migraciones aplicadas ni datos actuales.
RP005: timestamptz(6), bigint de microsegundos y cadenas UTC de seis fracciones;
sin Date intermedio ni parser global. Duración fija de 86_400_000_000 microsegundos.

**Testing**: Vitest 5.0.2 (dominio, arquitectura, PG/HTTP), Playwright 1.63.0. Harness
real con schemas t_ de test, fixtures ficticios y permisos de migración separados.
UTC y America/Lima, y móvil/escritorio, son ejecuciones de casos, no casos únicos nuevos.

**Target Platform**: Docker Compose Linux existente. Dirección VPS posterior con HTTPS
y acceso controlado; no contratación, despliegue, AWS, Redis o microservicios aquí.

**Project Type**: web con dos workspaces, monolito modular y una base PostgreSQL.

**Performance Goals**: al menos 15 000 cuentas registradas; objetivo de 2500 activos
pendiente de demostrar y de D10. No hay latencia, RPS o capacidad aceptados que inventar.
La serialización del despacho puede limitar rendimiento; medir después con k6 desde
otro equipo hacia VPS autorizado, pagos simulados y criterios acordados.

**Constraints**: presupuesto S/300 total; cuerpo 16 KiB, JSON estricto, CSRF/mismo
origen y cuotas actuales; núcleo puro y superficies públicas entre módulos; una
orden con reservas vigentes por alumno, un grupo por curso, ausencia de duplicados
vigentes y conflictos efectivos D06. Sin cancelación/modificación voluntaria,
resolución económica, traslados, materiales, clases, video o chat.

**Scale/Scope**: cuatro historias, 24 FR, ocho SC, diez RE, quince aclaraciones.
Capacidad configurada 1–50 por grupo no es concurrencia ni disponibilidad. Ventana
de actividad, mezcla de operaciones, solicitudes en vuelo y tasa de reservas se
definirán/medirán por separado. No ejecutar el perfil 10/25 ni cargas completas ahora.

## Constitution Check

Constitución vigente 1.2.1, sin enmienda. Se revisó antes de investigar y después
del diseño, incluida la revisión temporal RP005. Conforme por diseño no significa
probado en código o aprobado globalmente.

| Principio / puerta | Antes de fase 0 | Después de fase 1 y precisión RP005 |
| --- | --- | --- |
| I. Incrementos Spec Kit | Spec y quince respuestas; núcleo aclarado/delimitado | Plan/modelo/contratos/guía y diseño temporal RP005. RP006 y después tareas/análisis antes de implementar; sin salto de etapa. |
| II. Autorización backend | Roles y sesiones actuales reutilizables | Matriz propia, pertenencia, reautorización y errores seguros; docente/visitante sin acceso financiero. Pruebas permitidas/denegadas previstas. |
| III. Precios confiables | PD-01 y pago total aprobados | Precio explícito PEN, cálculo servidor y snapshots; importe cliente no es autoridad. Sin gratuidad, descuento o mínimos comerciales inferidos. |
| IV. Cupos/matrículas | 24 h, unicidad, prioridad, cancelación/abuso delimitados | RP005 fija reloj preciso, token único y worker idempotente; RP006 debe completar conciliación. Locks/inventario/atomicidad son diseño, no último cupo demostrado. |
| V. Confirmación de pagos | Izipay elegido, integración ausente | Puerto separado, sin confianza en navegador. Adaptador auténtico y sandbox siguen D02/RP006; no cobros reales. |
| VI. Idempotencia | Repetición y pago duplicado obligatorios | Identidades persistidas sin ledgers duplicados; resultado/auditoría atómicos. Matriz de notificaciones y verificación diferida pendiente RP006. |
| VII. Pruebas separadas | Carga simulada, proveedor fuera de carga | Simulador solo fixtures; sandbox real separado y obligatorio para integración. No SDK/firma/endpoints inventados. |
| VIII. Video protegido | Fuera del incremento | Sin cambios de permisos o infraestructura de video; D07/D08 pendientes. |
| IX. Entornos separados | 72 archivos protegidos y entorno aislado documentados | Preservación verificada documentalmente; guía conserva configuración/volumen y evita cuentas manuales. Sin secretos versionados. |
| X. Recuperación/migraciones | 0001–0005 y evidencia existentes | Evolución aditiva prevista y ensayo aislado de upgrade/restore futuro. D13 antes de demo persistente/publicación; no aprobación por esta guía. |
| XI. Capacidad demostrable | T103 informe completo, capacidad no aprobada | D10/2500/escenario pendiente; sin nuevos ensayos ni rebautizar evidencia de 1000. S/300 total conservado. |
| Arquitectura y costo | Monolito/pool/Compose existentes | Sin infraestructura nueva; coordinadoras en PostgreSQL con cuello de botella explícito, pendiente de medición. |

**Resultado**: no excepciones constitucionales nuevas necesarias para RP004/RP005. La
delimitación explícita permite diseñar el núcleo funcional. No habilita producir
implementación de pagos con protocolo inconcluso, cobros reales, demo persistente,
publicación o aceptación de capacidad. No se elude una puerta pendiente con un mock.

## Project Structure

### Documentation (this feature)

```text
specs/003-reservas-ordenes-matricula/
├── spec.md                       # conservado, 15 respuestas
├── checklists/requirements.md     # conservado, 12/16
├── research.md                   # RP001 íntegro + anexo de fase 0
├── research-rp004.md              # decisiones actuales R01–R08 y fuentes
├── plan.md
├── data-model.md
├── contracts/{api,integration,ui,time}.md
├── temporal-verification.md       # 25 casos de diseño, no pruebas ejecutadas
├── quickstart.md
└── evidence/{rp004,rp005}-results.json # revisiones documentales
```

No se crea tasks.md del spec, SQL ni código. Este árbol es la salida documental.

### Source Code (repository root)

Rutas siguientes previstas para fases posteriores, todavía no creadas/modificadas:

```text
apps/api/src/modules/enrollment/
  public/{enrollment,commitments,payments}.ts
  domain/{money,reservation,order,enrollment,compatibility,enrollment-error}.ts
  application/{reserve,prices,payments,queries,follow-up,ports}.ts
  entrypoints/http/{reservations,orders,enrollments,admin}.controller.ts
  infrastructure/{admission,dispatch,enrollment-store,queries,audit}.ts
apps/api/src/modules/academic-offering/
  public/{reservation-boundary,schedule}.ts
  infrastructure/{reservation-participant,offering-store,offering-queries}.ts
apps/api/src/infrastructure/database/enrollment-transaction.ts
apps/api/tests/integration/enrollment-*.spec.ts
apps/api/tests/support/enrollment.ts
apps/web/src/features/enrollment/api.ts
apps/web/src/features/enrollment/{reservation,order,enrollments,prices,incidents}-page.tsx
apps/web/tests/e2e/enrollment-*.spec.ts
apps/web/tests/support/enrollment-fixture.ts
apps/web/playwright.enrollment.config.ts
```

**Structure Decision**: añadir una feature/módulo a las capas existentes. Modificar
composición AppModule, matriz de permisos, guard de escritores de oferta, lector
público de calendario, allowlists/errores y navegación. No publicar detalles internos
ni relajar reglas de importación.

También se prevén cambios concretos en `academic-offering/domain/group.ts` y
`public/offer.ts` para la descripción opcional administrativa; en `http/error.filter.ts`
y `infrastructure/logging/security-events.ts` para errores/rutas seguros; y en web
`shared/api-client.ts`, `app/http.ts` y `app/router.tsx` para tipos, allowlists y
navegación. Probar lectores estrictos y regresión 002 al extender metadatos, conservando
sus valores NOT_CALCULATED; no convertir esa compatibilidad en disponibilidad ficticia.

Prisma/esquema/migración futuros expresan [datos](data-model.md), incluidas las dos
coordinadoras y descripción opcional de grupo aprobada pero ausente actualmente.
El grupo sigue unido a su curso original, incluso sin compromisos. Ningún trigger
histórico se modifica para habilitar traslado.

## Diseño por historia e interfaces

| Historia | Componente y comportamiento | Dependencias |
| --- | --- | --- |
| US1 P1 | Admisión ordenada, selección revalidada, reserva/orden/precio/snapshots atómicos; disponibilidad real | Identidad, participante de oferta, calendario público, modelo/migración; RP005 para reloj exacto. |
| US2 P1 | Iniciación idempotente, pago verificado total y conversión conjunta; incidencia sin matrícula si no aplica | US1, puerto proveedor, RP006/D02; simulación no aprueba proveedor real ni cobros. |
| US3 P1 | Vigencia exacta, liberación efectiva y materialización idempotente, recuperación tras reinicio | US1, RP005/RP006 y matriz de carreras. |
| US4 P2 | Consulta propia/administrativa mínima, precio y seguimiento append-only; guard de mantenimiento protegido | Identidad/propiedad, agregados previos, incidencias; no facultades económicas manuales. |

Mecanismos completos en [integración](contracts/integration.md). El orden durable
de admisiones usa contador transaccional protegido, no nextval/locks FIFO. Despacho
global no salta cabeza; no mantiene conexión por alumno. El precio y decisiones de
oferta se leen bajo los mismos locks y conexión que crean la orden. Topología cambiante
aborta y redescubre con el único presupuesto existente.

Disponibilidad real separada del catálogo 002; vigencia se calcula por instantes,
aunque el worker vaya retrasado. Incidencia no es ocupación ni libera reservas antes
de vencer. Compromisos ocultos cuentan para capacidad, unicidad y D06. Historial
finalizado conserva período/franjas/validUntil originales y no se reactiva al editar.

## Verificación y trazabilidad

La [guía local](quickstart.md) define prerrequisitos y recorridos futuros, y separa
UNIT/PG/HTTP/E2E de controles auxiliares, sandbox y observación humana. RV001 debe
completar la matriz especializada tras RP006 antes de generar tareas.

| Requisitos | Historias / casos | Artefactos y comprobación prevista |
| --- | --- | --- |
| FR-001–004 | US1/US3, RE-01–06 | Datos/HTTP/integración; UNIT calendario/plazo y PG reserva/corte/rollback. |
| FR-005–006 | US1/US2 | Precio exacto y detalle; UNIT monetario, PG precio concurrente, HTTP importe manipulado. |
| FR-007–009 | US2/US3, RE-05–08 | Puerto de pago/estados; RP005/006, PG límite/carreras y sandbox separado. |
| FR-010–013 | US1–US3, RE-01–08 | Atomicidad, prioridad, deduplicación e inventario; PG real con barreras y estado final. |
| FR-014 | US4, RE-09 | Guard bajo locks; PG/HTTP de edición/cancelación concurrentes e historial. |
| FR-015–016 | US1–US4, RE-10 | Matriz y DTO cerrados; HTTP permitido/denegado, propiedad, sesión revocada y privacidad. |
| FR-017–018 | US1–US4, RE-03/04 | Contrato UI, UNIT web y E2E error/vacío/incierto, teclado y móvil/escritorio. |
| FR-019 | US4, RE-07–09 | Auditoría/seguimiento append-only; PG rollback y cero efectos económicos. |
| FR-020–021 | US1/US2/US4, RE-09/10 | Una orden/curso, sin cancelación voluntaria, D06 y habilitación; UNIT/PG/HTTP y regresión 002. |
| FR-022 | Transversal | Inventario protegido, regresión identidad/oferta, ensayo futuro de upgrade/restore. |
| FR-023–024 | SC-008/RC-01/02/07 | D10/VP001–008 y proveedor separado; sin carga/infraestructura en RP004. |

SC-001/002: UNIT+PG de plazo/precios. SC-003/004/005: UNIT+PG+HTTP de matrícula,
compatibilidad, límite/conciliación, prioridad, mantenimiento y ausencia de parcialidad.
SC-006: matriz/propiedad/seguimiento y límites aprobados. SC-007: E2E y observación
humana separados. SC-008: diferido al escenario/rúbrica e infraestructura autorizados.

## Evolución, operación y secuencia posterior

Migración aditiva futura, upgrade desde 0005 y restore en destino aislado; no reset,
db push, bootstrap repetido, purga o eliminación de volúmenes. Conservar cuentas,
configuración y datos manuales. No ejecutar nuevas migraciones durante planificación.
Reutilizar scripts y Actions con ajuste mínimo para futura suite E2E; no ampliar el
timeout de 20 min sin investigar. Smoke de identidad solo cuando cambien sus flujos.

1. RP005: diseño de reloj, límites, normalización y worker/reinicio completado;
   T01–T07 y TV01–TV25 no acreditan implementación o ensayos.
2. RP006: cerrar conciliación, recibo durable, deduplicación y carreras pago/vencimiento/
   reasignación; D02/sandbox y política económica siguen puertas para cobros reales.
3. RV001 y RP007: matriz completa, `$speckit-tasks` y `$speckit-analyze`; después,
   implementación por bloques autorizados y pruebas antes de comportamiento.
4. VPS/2500 solo en VP001–008, con k6 desde otro equipo, presupuesto y D10 acordados.

No se cierran T073/T074 de oferta ni T104/T108 de identidad. T103 mantiene ejecución/
informe sin capacidad aprobada. Bootstrap, timeouts históricos de arquitectura/B02/D10
E2E, CI remoto, SMTP externo e INV-DOC-01 conservan sus pendientes reales.

### Actualización RP005 — reloj y ejecución diferida

[T01–T07](contracts/time.md) definen captura única después de todos los locks/recheck;
la normalización oportuna recibe el mismo token que confirma la selección nueva.
Un intento con rollback descarta su instante tentativo; replay/reinicio conserva
confirmedAt/expiresAt persistidos, sin extender plazo. Límites inicial/final se
convierten desde calendario civil America/Lima y se conservan en snapshots originales.

El worker comparte una única normalización de orden completa, con efecto/auditoría
únicos ORDER_EXPIRED/orderId y expirationProcessedAt separado del vencimiento efectivo.
Sondeo inicial cada 5 s, lote 20 y concurrencia local 1 son parámetros técnicos,
no gracia ni rendimiento aceptado. Barrido con horizonte finito y cursor orientativo,
single-flight, arranque/cierre en el proceso/pool existentes; sin otra cola o lease.
Se prevén application/expire-reservations.ts e infrastructure/expiration-{store,scheduler}.ts
en enrollment, y pruebas bajo las rutas ya previstas. No se crean esos archivos ahora.

[TV01–TV25](temporal-verification.md) registran límites, precisión, reinicio, worker
retrasado/concurrente y fallos, sin ejecución. accountTransaction mantiene un solo
presupuesto: 55P03 no añade reintento inmediato. Retroceso detectado del reloj implica
indisponibilidad segura sin mover plazos; sincronización/detección operativa D13
siguen siendo prerrequisitos, sin promesa de resistencia universal a saltos del host.
RP006 debe cerrar verificación pendiente y carrera financiera antes de escritores;
no se interpreta PENDING_RECONCILIATION como pago ausente o retención adicional.
Siguiente bloque vigente: RP006; después RV001 y RP007.

## Complexity Tracking

Sin violaciones constitucionales nuevas que justificar. Dos coordinadoras PostgreSQL
responden a dos tramos distintos de prioridad/recuperación, no duplican inventario.
Su costo de serialización se registra como riesgo medible; no se oculta mediante
infraestructura nueva ni se presenta el diseño como prueba de capacidad.
