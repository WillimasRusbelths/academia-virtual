# Referencia documental para la exposición

Corte: **2026-10-22, America/Lima**. Rama `feat/002-oferta-academica`, commit fuente
`ecb1efe2b2d7fa63b1a73bcd35539e82ecfb4345`; árbol inicialmente limpio. No se cambió de
rama ni se restauró main. Este corte identifica el código revisado; el commit documental
posterior no representa otra implementación.

Esta es la referencia de **estado** para análisis, arquitectura, diseño y C4. Las reglas
proceden de la [constitución 1.1.0](../.specify/memory/constitution.md), los specs
[001 identidad](../specs/001-identidad-acceso-roles/spec.md) y
[002 oferta](../specs/002-oferta-academica/spec.md). Los planes/contratos describen destinos;
el código compuesto y la evidencia delimitan qué está disponible. US, FR, SC y T siempre
se interpretan dentro de su spec. HU01–HU17, RF01–RF19, AC, RT, DA y R son IDs generales.

| Área | Especificado o previsto | Implementado en la fuente | Verificado: alcance y evidencia | Pendiente o limitado |
| --- | --- | --- | --- | --- |
| 001 identidad | US1–US7, FR-001–033 | Registro Alumno, verificación/reenvío, login/logout, inicial, recuperación, perfil/inicio, gestión de cuentas, autorización, auditoría, bootstrap CLI | [T106](../specs/001-identidad-acceso-roles/evidence/regression.md): 120 unitarias, 744 integraciones, 203 E2E sobre su versión; [aceptación preliminar](../specs/001-identidad-acceso-roles/evidence/acceptance.md) relaciona FR/V/SC | [Tareas 001](../specs/001-identidad-acceso-roles/tasks.md): 106/108; T104 diez personas y T108 aceptación integral pendientes. Bootstrap intermitente abierto, aunque repeticiones pasen |
| 002 fundamentos | Modelo, interfaces, permisos y protocolo atómico | Migración 0005, cinco entidades académicas, generación docente, directorio mínimo, escritor/ledger/auditoría, pool compartido | [T018](../specs/002-oferta-academica/evidence/foundations.md): integración API 896/896 y unidad/arquitectura 106/106; pruebas de migración y regresión local | Un modelo o permiso no acredita publicación ni acceso del alumno |
| 002 preparación administrativa | US1, parte de FR-001–005/010–016 | Diez rutas `/api/v1/admin/academic`, cinco mutaciones de preparación; listados/detalles, formularios, horarios y selector docente desde inicio ADMIN | [T026/T027](../specs/002-oferta-academica/evidence/t026-t027.md): HTTP/PG 74/74; [T028/T029](../specs/002-oferta-academica/evidence/t028-t029.md): 30 casos funcionales × 2 perfiles = 60 ejecuciones, más 2 controles; web 141, API 266, regresión E2E identidad seleccionada 49 | [Tareas 002](../specs/002-oferta-academica/tasks.md): T001–T029 completas; T030 checkpoint US1 pendiente. No SC-001 completo ni aceptación humana |
| 002 resto | PA-01–PA-05 aprobadas; US2 publicación/catálogo, US3 ciclo, US4 asignación/lectura propia | Tipos, estados, permisos y algunos fundamentos anticipan esos recorridos | Las fixtures publicadas/retiradas/canceladas prueban bloqueo de edición; no son transiciones disponibles | T030–T074 pendientes. Sin publish/withdraw/cancel, catálogo alumno, «Mis grupos» ni republicación implementados |
| Correo y operación | R07/R08, RF19 | Ejecutor dentro de API, SMTP/cifrado/entregas persistidas; retención e invalidación mediante CLI; procedimientos de respaldo | [Entregas](../specs/001-identidad-acceso-roles/evidence/entregas-persistidas.md), [retención](../specs/001-identidad-acceso-roles/evidence/retention.md), [V16](../specs/001-identidad-acceso-roles/evidence/recovery.md), repetido en T106 | Mailpit captura local funcional; SMTP real sin verificar. Purga sin programación; D13 custodia/responsables/RPO/RTO operativos pendientes. V16 es de identidad, no recuperación integrada de oferta |
| Resto del MVP | Órdenes, pagos Izipay, matrícula, materiales, clases, YouTube Live/OBS, Socket.IO y paneles completos | Sin funciones de producto en este corte | Sin evidencia de integración real; selección de proveedor no es integración | D01–D10/D12/D13 según dominio; capacidad/ocupación disponible no derivada de modelos |
| Capacidad | Objetivo 1000 concurrentes, constitución XI | Harness de carga de identidad | [T103 y recursos](../specs/001-identidad-acceso-roles/evidence/load-resources.md): cargas ejecutadas con incumplimientos de latencia y meseta; [T105](../specs/001-identidad-acceso-roles/evidence/login-timing.md) solo accesos secuenciales locales | Capacidad sin aprobar. D10/rúbrica; VPS y nuevas cargas completas aplazados hasta matrícula. No extrapolar a oferta/chat/video |

Los resultados son ejecuciones históricas sobre las fuentes indicadas por cada informe,
reutilizadas tras contrastar los archivos actuales. No son una nueva regresión completa
del HEAD. No se suman suites solapadas ni repeticiones como funcionalidades nuevas.
Los comandos de prueba, rutas exclusivas del harness y datos ficticios no pertenecen a la UI.

## Reglas de oferta y alcance actual

Referencia normativa: [spec 002, PA-01–PA-05](../specs/002-oferta-academica/spec.md),
[modelo](../specs/002-oferta-academica/data-model.md), contratos
[API](../specs/002-oferta-academica/contracts/api.md),
[UI](../specs/002-oferta-academica/contracts/ui.md) e
[integración](../specs/002-oferta-academica/contracts/integration.md).

- **Curso**: identidad, nombre, descripción y estado editorial. **Grupo**: referencia
  estable, un curso inmutable, nombre, periodo, franjas, zona, capacidad y docente.
  Un grupo no es una clase, emisión ni matrícula. No se exige unicidad de nombres.
- La preparación administrativa actual crea/edita borradores y admite datos incompletos
  permitidos por el contrato. Puede editar estados retirados preparados como fixtures;
  la UI todavía no permite retirar. Datos publicados/cancelados son de solo lectura.
- Capacidad configurada: entero **1–50**, inclusive. 40–50 es población prevista, no
  mínimo. Sin configurar se distingue de un valor inválido. Ocupación/disponibilidad
  son `null`, estado `NOT_CALCULATED`; no cero ni plazas libres. No hay reservas.
- Horarios semanales en **America/Lima**, fechas civiles inclusivas; cada franja debe
  ocurrir en el periodo, sin medianoche, duplicados ni solapamientos internos; contiguas
  válidas. Estas validaciones de preparación están implementadas y probadas en T023.
- Publicación **prevista**: curso publicado y grupo completo con exactamente un docente
  activo, verificado y de rol Docente. Preparación admite cero o uno. PA-05 impide
  publicar conflictos del mismo docente con coincidencia efectiva de fecha/día/hora;
  un grupo publicado bloquea agenda aun bajo curso retirado. Sin matrícula/feriados.
- PA-02 **prevista**: curso Borrador → Publicado → Retirado → Publicado; grupo añade
  Cancelado terminal. Retirar antes de editar; publicar curso no publica grupos;
  retirarlo oculta hijos sin cambiar sus estados; republicarlo revalida los publicados.
- PA-03: perder habilitación incrementa generación docente (trigger ya comprobado),
  conserva referencia y exigirá revisión/republicación explícita. Recuperar cuenta no
  deberá restaurar visibilidad automáticamente. Las capturas y contratos existen;
  publicación/filtro de visibilidad y recorridos de revisión siguen pendientes.
- PA-01: ADMIN gestiona; Alumno consultará publicados visibles; Docente consultará
  solo asignados en cualquier estado sin privados; visitante sin oferta. Actualmente
  solo están expuestas las rutas administrativas. Permisos definidos no crean rutas.

## Navegación y lectura

La UI implementada incluye acceso, registro, verificación, inicial, recuperación,
perfil/inicio, cuentas ADMIN y preparación de oferta ADMIN. El inicio no equivale a
panel académico/financiero completo. Ver rutas reales en
[App.tsx](../apps/web/src/app/App.tsx) y [router](../apps/web/src/app/router.tsx).
La API se compone en [AppModule](../apps/api/src/app.module.ts); no importa ProbeModule.

La [arquitectura vigente](02-arquitectura-software/estilo-arquitectonico.md) define las
unidades; [Clean Architecture](02-arquitectura-software/enfoque-arquitectonico.md), sus
dependencias; [diseño interno](03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md),
las colaboraciones concretas; [C4](04-modelo-c4/01-contexto-del-sistema.md), las vistas.
La [arquitectura inicial](02-arquitectura-software/arquitectura-inicial.md) conserva el
corte histórico y no debe usarse como inventario vigente.
