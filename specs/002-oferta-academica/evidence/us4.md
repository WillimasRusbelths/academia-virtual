# Checkpoint US4 — T066

2026-10-26, America/Lima. Rama `feat/002-oferta-academica`. Producto **f6aa09f**,
con la corrección de fixture documentada en [regresión de identidad](identity-regression.md).
**T066 completa; checkpoint automatizado US4 aprobado**. T065 completa.
Resultados por caso, comandos, revisiones, hashes y entorno: [us4-results.json](us4-results.json).

## Ocho escenarios de aceptación

| US4 | Comprobaciones ejecutadas y resultado final |
| --- | --- |
| 1. Solo docente activo/verificado/TEACHER | Selector PG de privacidad y R01/R03 E2E: homónimos con UUID distintos; asignar no crea cuentas ni modifica roles. |
| 2. Pérdida de rol o habilitación | T056 carreras rol/estado × publicación/identidad primero; conexiones distintas y observador de espera real. Privacidad y R02/R03/D12 comprueban ocultamiento y diagnóstico exclusivo administrativo. |
| 3. Mis grupos propios | Matriz T055, 31 casos docentes de privacidad y T058 D01–D06/D08/D11: todos los estados, curso como contexto, sin hermanos ajenos ni gestión. |
| 4. Sesión/rol perdido con vista abierta | 84 pérdidas de acceso de T055, D09/D10 y M09 de retiro abierto E2E; rechazo sin efectos, datos limpiados y respuesta real retrasada descartada tras logout, sin replay al volver a entrar. |
| 5. Visitante | T055 401 por operación/estado y D07 de lista/detalle; exige login sin consulta docente ni entrega de oferta. |
| 6. Alumno y oferta privada | Matriz administrativa/catálogo: 403 o 404 seguro, filtros antes de contar/paginar y huellas sin cambios en rechazos. |
| 7. Cero/inhabilitado/múltiples docentes | Publicación P08/P09/P21 valida docente ausente, no habilitado o dos IDs inyectados; rechazo sin cambio parcial. Preparación admite cero/uno dentro de sus reglas. |
| 8. Recuperación no republica | T056 pérdida/recuperación sin lectura intermedia, R02/R04/R05 E2E y privacidad V: snapshot anterior continúa inválido. Retirar/revisar/publicar explícitamente; publicar padre no limpia revisión ni recupera cancelados. |

## Pruebas y matriz

PG/HTTP nuevo: **695/695** en 7 archivos. T055–T057:
434 autorización + 11 habilitación + 71 privacidad = **516/516**. Se reejecutan
31 contratos de consulta docente y las suites de preparación, publicación y carreras
para cubrir los escenarios y fundamentos afectados; el JSON separa cada archivo.
Los controles I01/I02 de fixtures/directorio/conexiones no se presentan como prueba
del protocolo académico: sus casos funcionales verifican locks, resultados y estado
persistido con PostgreSQL real, no sustitutos.

[Tabla SC-003 completa](us4-authorization-matrix.md): **21 rutas/métodos**, cinco actores,
350 combinaciones del estado aplicable y 84 pérdidas de acceso, todas aprobadas.
Cero combinaciones faltantes de T055, cero efectos/datos privados en rechazos.
Los 71 casos de privacidad añaden el contexto completo de estados curso/grupo,
conteos/páginas, reasignación vigente, DTO cerrado y GET sin escrituras ni habilitación.
Se distingue estado del curso del de grupo; CANCELLED solo corresponde al grupo.

T058/T059: **24 casos únicos, 48/48 ejecuciones**,
18/36 de consultas propias y 6/12 de revisión en escritorio y móvil. Sin skips,
fallos esperados, retries ni límites ampliados. Adicionalmente: un caso auxiliar
del harness académico en ambos proyectos, 2/2; se cuenta separado.
Regresión adicional dirigida M09: un caso de formulario de retiro abierto, 2/2
ejecuciones en escritorio/móvil, rechazo 401 y cero ledger/replay; separado de T058/T059.
Identidad T065: 672/672 PG/HTTP y 203/203 E2E
en diez configuraciones, con incidencias iniciales y correcciones preservadas.
Lint, tipos/build API y web y **14/14** pruebas de arquitectura aprobados.
No se atribuye una nueva ejecución de todas las unitarias o de la integración global:
la puerta íntegra corresponde a T068.

## Procedimiento y límites

Skill speckit-implement aplicada; prerrequisitos correctos, checklist 16/16 sin cambios,
sin AGENTS.md aplicable ni hooks antes/después. T055–T064 completas antes del bloque.
Se revisaron constitución 1.2.0, spec/PA-01–PA-05, tareas, plan, modelo, investigación,
contratos y quickstart; E1 y todas las descripciones originales de tareas se conservan.
Primer lote US4: 47/48, con timeout D10 escritorio a 15 s y error posterior de
limpieza del contexto. Se conservaron informe y snapshot de recursos (no prueba de
carga ni demostración causal). Se investigó mediante seis ejecuciones D10 (tres por
proyecto) con etiquetas estáticas de fase solo en la copia privada: 6/6, sin
reproducirlo. Se restauró la fuente original antes de repetir completos los 48
recorridos. Ninguna aserción o límite fue alterado. El timeout D10 sigue como
hallazgo intermitente abierto, sin causa identificada ni corrección atribuida;
la repetición verde acredita sus aserciones actuales y no demuestra estabilidad.

La corrección de fixture está justificada por la FK de la migración aditiva existente;
no modifica negocio, migración ni autorización. Incidencias completas en T065.
Se conservan el timeout B02 y su repetición histórica, así como bootstrap abierto;
ningún resultado actual borra ni diagnostica esos antecedentes.

Lanzador/reports privados en `.cache/academic-offering-validation/t065-t066/` y
`t065-t066-reports/`. Acciones integration (siete archivos enumerados en JSON),
browser-harness, browser (dos archivos originales US4) y checks (lint, build web,
arquitectura). Cada runner genera Prisma y compila API. Se usan comandos y herramientas
existentes, maxWorkers=1; E2E mantiene configuración original, workers/retries/timeouts.
Sin nuevas dependencias, migraciones o servicios.
Control documental: 818 enlaces locales en 34 documentos, cero enlaces rotos;
74 descripciones de tareas intactas, solo marcas T065/T066, diff sin errores y
escaneo de secretos aprobado. El primer intento del verificador de enlaces no pudo
lanzar Git por EPERM del sandbox; se repitió con permiso operativo y aprobó.
Ese error del verificador no se cuenta como prueba de producto.

Guardas iniciales/reanudadas/finales: mismo proyecto y volumen aislados, APP_ENV=test,
sin puertos ni mounts manuales; cero esquemas t_ residuales, servicios de prueba
detenidos y volúmenes conservados. Base manual sin SQL ni arranque, metadatos iguales.
72 archivos protegidos y todo código de producto permanecen intactos.

Constitución I/II/IX: incremento delimitado, permisos reales por backend y aislamiento
comprobados. X: no se cambia esquema/datos operativos ni se reemplaza el ensayo de
recuperación pendiente T069. IV/XI: capacidad configurada no es disponibilidad;
no hay reservas/matrículas ni nueva evidencia de concurrencia/capacidad.
SC-003 aprobado para su matriz, SC-004 en fronteras de habilitación y SC-005 en estos
recorridos automatizados; no reemplaza la puerta final ni la aceptación humana.

Pendientes: T067–T074; timeout D10 sin causa identificada, bootstrap histórico,
T104/T108, SMTP, D04/D06 matrícula, D10/D13, SC-002/T073 y aceptación integral/capacidad.
Reservas de 24 h y sus decisiones
abiertas conservadas en la planificación futura, sin implementarlas aquí.
**Siguiente bloque: T067 (CI existente) y después T068 (puerta automática final)**.
No se ejecutan cargas completas ni se acredita capacidad para 1000/2500 concurrentes.
