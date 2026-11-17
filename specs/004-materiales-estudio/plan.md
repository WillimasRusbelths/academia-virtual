# Plan técnico: materiales de estudio por grupo

**Cierre T064/T067 — 2026-11-17, America/Lima.** El responsable confirmó «ahora si funciona todos los recorridos», después de repetir el ensayo tras la corrección del PDF. T064 queda completada para el recorrido global de gestor y alumno en laptop, con consentimiento previamente comunicado. Es un resultado comunicado por el responsable, sin observación directa del agente ni desglose de cada paso, formato, ayuda o duración. Móvil no observado; SO, navegador y uso específico de puntero/teclado no informados. H-PDF-01 queda resuelta tras esta repetición humana. T067 completa la sincronización documental; D13/T065, D10/T066 y el cierre integral T068 permanecen pendientes. Avance **65/68**, tres pendientes. [Registro de cierre](evidence/t064-t067-report.md).

**Estado actual — 2026-11-17, America/Lima**: T001–T064 y T067 completadas,
65/68; US1/US2/US3 implementadas y verificadas localmente. El diseño que sigue
se conserva como registro original; sus referencias a código futuro o ausente
describen la planificación del 2026-11-16.

## Implementación y evidencia actuales

- AppModule compone materiales con autorización y participantes públicos de
  oferta/matrícula sobre un pool PostgreSQL; sin imports laterales de features.
- 0008_materials y 0009_material_upload_admission son migraciones aditivas;
  metadatos/bytea/intención/ledger/auditoría se confirman transaccionalmente.
  Archivo, grupo y autor originales permanecen inmutables.
- US1 prepara/publica; US2 lista y descarga con matrícula propia vigente al
  instante exacto; US3 edita textos/retira/republica con revisión e idempotencia.
  El alumno no depende de que la oferta siga visible o el docente habilitado.
- HTTP expone 12 combinaciones método/ruta, incluyendo HEAD sin lectura bytea;
  binarios privados con reautorización, same-origin/CSRF y JSON de 16 KiB intacto.
  Admisión de transferencia en memoria por proceso; cuota de nuevas intenciones
  durable en PostgreSQL. No constituyen capacidad probada del despliegue.
- [T060](evidence/automated.md): API 3961 casos aprobados en 171 archivos mediante
  cobertura compuesta y focal final; web 614/614, E2E real 42/42. Son resultados
  históricos de ese bloque, no nuevas ejecuciones de esta actualización documental.
- [T062](evidence/recovery.md) verifica upgrade 0007, reinicio y restore cifrado
  en otra BD del mismo laboratorio; [T063](evidence/local-resources.md) mide
  memoria/copias/BD/WAL/disco/backup y transferencias de 20 MB con corpus compresible.

T064 completada para el reporte global en laptop; [T065](operation.md) y [T066](capacity.md) preparadas, sin acuerdos D13/rúbrica/infraestructura D10. T067 completada con actualización tras la incidencia PDF; T068 conserva el cierre integral pendiente. No se aceptan Izipay,
24 h físicas, capacidad 2500, VPS, CI remoto o pendientes de 001–003.
Detalle: [revisión preliminar](evidence/final-acceptance.md).

## Registro original del plan (2026-11-16)


**Fecha**: 2026-11-16, America/Lima. **Spec**: [004](spec.md).
**Feature lógica**: `004-materiales-estudio`. **Rama Git real conservada**:
`feat/003-reservas-ordenes-matricula`.
**Estado**: diseño listo para tareas; sin implementación ni aceptación funcional.

## Summary

Añadir `materials` al monolito: preparar, publicar, listar, descargar y retirar
PDF/JPEG/PNG hasta 20 000 000 bytes por grupo. M01–M03 se conservan. Docente
habilitado y asignado actualmente y administrador gestionan; alumno requiere
material publicado y matrícula propia vigente según 003.

Contenido privado `bytea` en PostgreSQL, separado de metadatos pero confirmado en
la misma transacción. Permite respaldo conjunto sin coordinar volumen externo y
BD. La [investigación](research.md) explica alternativas y costo; no demuestra capacidad.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node 22.23.1 y npm 10.9.8 existentes.
**Primary Dependencies**: NestJS/platform-express 12.1.0, Prisma 7.10.0, pg, React 19,
Vite 8. Conservar lockfile; recepción binaria con primitivas Node existentes.
**Storage**: PostgreSQL 16 del entorno actual, mismo pool. Migración aditiva después
 de `0007_payment_reconciliation`; bytea privado, sin bucket o directorio público.
**Testing**: Vitest (dominio, arquitectura, PostgreSQL real, HTTP) y Playwright;
fixtures aislados y aceptación humana independiente.
**Target Platform**: Windows/Compose Linux existentes; VPS/HTTPS posteriores sujetos
a operación. No contratar ni desplegar en esta fase.
**Project Type**: web, dos workspaces, monolito modular.
**Performance Goals**: 20 MB decimal por archivo. 15 000 cuentas y 2500 activos son
magnitudes distintas; D10 pendiente. Sin SLA o tasa de transferencia inventados.
**Constraints**: S/300 total; JSON conserva 16 KiB. Excepción binaria exacta por
ruta/método con mismo origen/CSRF. Inicialmente 2 transferencias binarias por proceso
y 1 por actor, sin cola ilimitada; medir RAM real, driver, WAL, backup y disco.
**Scale/Scope**: 3 historias, 20 FR, 7 SC. Sin visor, reemplazo de archivo, purga,
chat/video, paneles generales o almacenamiento contratado.

## Constitution Check

Constitución 1.2.1 revisada antes de fase 0 y después de fase 1, sin enmienda.

| Principio | Revisión inicial | Resultado de diseño |
| --- | --- | --- |
| I. Incrementos | Spec y decisiones confirmadas | Plan/modelo/contratos/guía; tareas y análisis antes de código. |
| II. Backend | Autoridades 001–003 | Permisos cerrados, pertenencia y reautorización en cada solicitud directa. |
| III–VI. Finanzas e integridad | No cambiar reglas financieras | Consulta de matrícula, sin crear pagos/cupos; idempotencia propia transaccional. |
| VII. Pruebas separadas | Sandbox pendiente | Fixtures ficticios, sin cobros ni cierre de D02. |
| VIII. Video | Fuera de alcance | No se acredita ni modifica HLS. |
| IX. Entornos | Configuración/datos previos protegidos | Harness separado; sin reset, bootstrap repetido o cambios de entorno manual. |
| X. Recuperación | Archivo y registro juntos | bytea y metadatos en dump conjunto, ensayo y hashes futuros; D13 pendiente. |
| XI. Capacidad | 2500 sin demostrar | Medir RAM/BD/tráfico/backup antes de conclusiones; D10 pendiente. |
| Arquitectura/costo | Monolito y S/300 total | Un pool, sin Redis, microservicios ni infraestructura adicional. |

**Resultado**: compatible por diseño, sin excepciones constitucionales. No hacen
falta más preguntas funcionales: M01–M03 y delimitaciones del spec bastan. D10/D13
son puertas operativas conservadas, no resultados aprobados por este documento.

## Project Structure

### Documentation (this feature)

```text
specs/004-materiales-estudio/
  spec.md
  checklists/requirements.md
  plan.md
  research.md
  data-model.md
  contracts/{api,integration,ui}.md
  quickstart.md
  evidence/planning-review.json
```

`tasks.md` pertenece al siguiente bloque y no se crea aquí.

### Source Code (repository root)

Rutas propuestas, todavía sin crear:

```text
apps/api/src/modules/materials/
  domain/{material,material-error}.ts
  public/materials.ts
  application/{ports,uploads,commands,queries}.ts
  infrastructure/{material-store,content-store,commands,audit}.ts
  entrypoints/http/materials.controller.ts
apps/api/src/infrastructure/database/materials-transaction.ts
apps/api/src/modules/academic-offering/public/materials-access.ts
apps/api/src/modules/enrollment/public/materials-access.ts
apps/api/tests/integration/materials-*.spec.ts
apps/api/tests/support/materials.ts
apps/web/src/features/materials/api.ts
apps/web/src/features/materials/{management-page,student-page}.tsx
apps/web/tests/e2e/materials-*.spec.ts
apps/web/tests/support/materials-fixture.ts
apps/web/playwright.materials.config.ts
ops/recovery/rehearse-materials.ps1
```

**Structure Decision**: dominio puro; aplicación mediante puertos; infraestructura
conoce SQL/bytes. AppModule conecta participantes públicos de oferta/matrícula y
sesión. Extender permisos, transporte, filtro seguro, interceptor de sesión y
registro de rutas. Web compone navegación desde app, sin imports entre features;
cliente binario explícito, sin convertir File/Buffer a JSON.

## Diseño por historia y verificación

| Historia | Diseño | Comprobación prevista |
| --- | --- | --- |
| US1 | Intención JSON, contenido binario acotado, commit preparado y publicación explícita | Tipos/límites, interrupción/replay, pérdida de autoridad y cancelación. |
| US2 | Listado y descarga autorizados, vigencia original exacta | Matriz de actores, límite temporal, referencia directa y sesión revocada. |
| US3 | Textos/transiciones con revisión, ledger y auditoría | Conflictos, retiro/republicación, reasignación y archivo inmutable. |

Secuencia futura: contratos y migración aislada; coordinador/participantes y pruebas
de permisos; carga/gestión; consulta/descarga/UI; regresión, restore y observación
humana. Cobertura completa FR/SC en [quickstart](quickstart.md).

## Riesgos y puertas

bytea consume RAM, tráfico SQL, WAL y backup. No seleccionar bytes en listados ni
serializar Buffer. Admitir transferencia antes de leer blob; mantener plaza hasta
finish/close/error. No mantener locks durante transferencia por red. Las copias del
driver obligan a medir, no asumir memoria constante o 20 MB exactos por operación.

Sin cuota agregada o purga implícitas. Falta de espacio revierte solo el intento
nuevo. Antes de demo persistente/publicación acordar custodia, retención, capacidad
de entorno y restore con archivos bajo D13. D10 debe incorporar tráfico de materiales.

003 conserva 84/94: T056–T059 y T089–T094 pendientes. T104/T108 de 001 y T073/T074
de 002 tampoco se cierran. Tareas/análisis siguen antes de implementar. En esta
fase no hay servicios, migraciones aplicadas, pruebas funcionales o despliegues.

## Complexity Tracking

Sin violaciones nuevas. Dos solicitudes de carga conservan JSON estricto y permiten
recuperar resultado sin duplicar; persistencia conjunta evita coordinación BD+FS.
