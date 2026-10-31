# Guía de verificación local futura — reservas, órdenes y matrícula

**RP004–RP006, 2026-10-30. No ejecutada.** Aún no existen las rutas, fixtures, migración
o suites 003. Reutilizar los comandos existentes solo tras implementar el bloque
correspondiente y completar RV001/tareas/análisis. El diseño RP005/RP006 está
preparado; su revisión no acredita recorridos ni estado vivo de la instalación aislada.

Fuentes: [plan](plan.md), [datos](data-model.md), [HTTP](contracts/api.md),
[integración](contracts/integration.md), [UI](contracts/ui.md) y
[destino aislado](../002-oferta-academica/evidence/environment.md).

## Prerrequisitos y separación

- Reutilizar copia `.cache/academic-offering-validation/source`, proyecto
  `academic-offering-fa3d46bddbb8` y su volumen `_postgres_data`, conservando `.env`,
  claves y datos de test existentes. Comprobar inventario privado, mounts, APP_ENV=test,
  URLs exclusivas de test y ausencia de puertos públicos antes de iniciar nada.
- No usar `academia-local`, ejecutar configure.mjs sobre la copia configurada,
  prepare.ps1 de creación nueva, bootstrap, reset, db push, purgas o eliminar volúmenes.
  No copiar credenciales/configuración/cuentas manuales. Detenerse ante discrepancias.
- Sincronizar solo fuente revisada en la copia; registrar manifiesto/commit e imágenes
  y reconstruir después de cambios. Una imagen anterior no verifica el código nuevo.
- Migración aditiva escrita/revisada y suites implementadas antes del tramo respectivo.
  Docker Desktop Linux/Compose y versiones actuales; no relajar TLS/hash/CSRF/cuotas.

## Preparación futura con comandos existentes

PowerShell, solo después de las guardas anteriores. No se ejecutaron estos comandos
en RP004. Cada salida debe ser 0; detenerse ante fallo y clasificar su causa.

```powershell
$trialRoot = 'D:\Proyectos\academia-virtual\.cache\academic-offering-validation\source'
$trialProject = 'academic-offering-fa3d46bddbb8'
if (-not (Test-Path -LiteralPath (Join-Path $trialRoot '.env'))) {
  throw 'Falta configuración aislada; no sustituirla automáticamente.'
}
$trial = @('compose','--project-name',$trialProject,
  '--project-directory',$trialRoot,'--env-file',(Join-Path $trialRoot '.env'),
  '-f',(Join-Path $trialRoot 'compose.yml'))
if (Test-Path -LiteralPath (Join-Path $trialRoot 'compose.override.yml')) {
  $trial += @('-f',(Join-Path $trialRoot 'compose.override.yml'))
}
$trial += @('-f',(Join-Path $trialRoot 'ops/docker/compose.regression.yml'),
  '-f',(Join-Path $trialRoot 'ops/docker/compose.identity-tests.yml'))
docker @trial config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Configuración inválida.' }
docker @trial --profile tests build api web browser-tests
if ($LASTEXITCODE -ne 0) { throw 'Construcción fallida.' }
docker @trial up -d --no-build --wait db mailpit
if ($LASTEXITCODE -ne 0) { throw 'Dependencias no saludables.' }
```

Generación/aplicación **futuras**, solo tras revisar SQL y los destinos efectivos de
runtime/migración/test. La receta no autoriza aplicar cambios de esquema durante el plan.

```powershell
docker @trial run --rm --no-deps api npm run probe:generate
if ($LASTEXITCODE -ne 0) { throw 'Generación de compatibilidad fallida.' }
docker @trial run --rm --no-deps api npm run probe:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migración de compatibilidad fallida.' }
docker @trial run --rm --no-deps api npm run probe:check
if ($LASTEXITCODE -ne 0) { throw 'Comprobación de compatibilidad fallida.' }
docker @trial run --rm --no-deps api npm run db:generate
if ($LASTEXITCODE -ne 0) { throw 'Generación del cliente fallida.' }
docker @trial run --rm --no-deps api npm run db:migrate:deploy
if ($LASTEXITCODE -ne 0) { throw 'Aplicación aislada fallida.' }
docker @trial up -d --no-build --wait api web
if ($LASTEXITCODE -ne 0) { throw 'API/web no saludables.' }
```

Comprobaciones existentes que descubrirán futuras suites en sus rutas habituales:

```powershell
docker @trial exec -T api npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint fallido.' }
docker @trial exec -T api npm run build
if ($LASTEXITCODE -ne 0) { throw 'Compilación/tipos fallidos.' }
docker @trial exec -T api npm run test:unit --workspace apps/api -- --maxWorkers=1
if ($LASTEXITCODE -ne 0) { throw 'Reglas/arquitectura fallidas.' }
docker @trial exec -T api npm run test:unit --workspace apps/web -- --maxWorkers=1
if ($LASTEXITCODE -ne 0) { throw 'Unitarias web fallidas.' }
docker @trial exec -T api npm run test:integration --workspace apps/api -- --maxWorkers=1
if ($LASTEXITCODE -ne 0) { throw 'PG/HTTP fallidas.' }
docker @trial exec -T api npm run test:crypto-mail
if ($LASTEXITCODE -ne 0) { throw 'Regresión crypto/mail fallida.' }
```

La configuración `apps/web/playwright.enrollment.config.ts` todavía no existe. Una
vez preparada y añadida explícitamente al lint, usar el runner E2E existente:

```powershell
docker @trial --profile tests run --rm --no-deps browser-tests npm run test:e2e --workspace @academia/web -- --config playwright.enrollment.config.ts
if ($LASTEXITCODE -ne 0) { throw 'E2E de matrícula no aprobadas.' }
```

Repetir identidad/oferta afectadas según el cambio. Reutilizar Actions con un ajuste
de config/step para la nueva suite; no aumentar su límite de 20 min para ocultar fallos.
No copiar conteos históricos como resultados nuevos ni ejecutar cargas/perfil 10/25.
Build comprueba tipos de aplicación, no todos los soportes/tests/config Playwright.
Al crear esos archivos, añadir comprobación explícita de tipos según el patrón
selectivo de T001–T004 o una configuración de test mínima; registrar los archivos
realmente incluidos. Vitest ejecutado no sustituye esa comprobación de tipos.

## Matriz base de comprobaciones pendientes

RV001 debe completar detalle y trazabilidad integrada con RP006 ya diseñado. Esta matriz
es guía de preparación, no tarea de pruebas implementada o aprobada.
RP005 añade [contrato temporal](contracts/time.md) y [25 casos de diseño](temporal-verification.md):
microsegundos antes/igual/después, mismo token tras locks, epoch negativo/año ampliado,
worker detenido/concurrente, barrido acotado y recuperación de COMMIT incierto.
[RP006](contracts/payments.md) añade [PV01–PV30](payment-verification.md):
recibo técnico, verificación/efectos atómicos, dinero/IDs incompatibles, respuestas
tardías, inciertos y lectores frente a conversión. Son 30 familias de diseño, no
pruebas preparadas o ejecutadas. Integrar con TV03/TV25 sin duplicar conteos.
No ejecutar esos casos en esta etapa ni confundir los IDs con tests preparados.
Para evidencia futura registrar versión de PostgreSQL/tzdata y salud de reloj;
un retroceso arbitrario no queda resuelto por un estado terminal o contador local.

| Nivel | Casos exigidos | Trazabilidad |
| --- | --- | --- |
| UNIT dominio | 86 400 s, límite estricto, corte Lima, vigencia original; dinero exacto; coincidencias efectivas/contiguos/exclusión propia y transiciones | FR-001–011/020/021; SC-001–004; RE-01/02/05/09/10 |
| UNIT web | DTO/errores cerrados, espera distinta de reserva, reloj orientativo; intención estable/consulta y descarte tras logout | FR-016–018; SC-006/007; RE-03 |
| PG real | Admisiones y commits intentados fuera de orden, cabeza bloqueada/reinicio, último cupo/multigrupo, una orden/curso, precio concurrente, rollback escritura/resultado/auditoría y COMMIT incierto | FR-005/006/010–013/019/020; SC-002/004–006; RE-01–08 |
| PG real | Reserva/pago frente a retiro/habilitación/revisión/edición/cancelación; worker retrasado, nueva intención tras vencer, snapshots e incompatibilidad propia oculta | FR-001/008/014/020/021; SC-001/003–006; RE-02/05/06/08–10 |
| HTTP real | Matriz/propiedad/reautorización/replay, CSRF/origen, dinero/titular/reloj manipulados; allowlists por ruta y privacidad | FR-005/011/015/016; SC-002/006; RE-01/10 |
| PG/HTTP pago | Verificación/límite/vencimiento/reasignación, duplicados y datos alterados; efectos totales; seguimiento no resuelve | FR-007–014/019/024; SC-003–006; RE-05–09; P01–P07/PV01–PV30 |
| E2E real | Cuatro recorridos, vacíos/error/incierto, teclado y móvil/escritorio, ocultamiento, plazo, consulta e historial | FR-017/018/021/022; SC-001–007 |
| Sandbox separado | Autenticidad/orden/importe/moneda, válidos/inválidos/no confirmados/duplicados con proveedor; sin carga | FR-007/024, D02, principios V–VII |
| Humana | Comprensión/uso de cuatro recorridos, participantes y observación reales, separada de automatización | SC-007; no sustituye T073/T074/T104/T108 |
| VPS posterior | Población, activos, RPS/en vuelo, reservas y recursos separados, costo/rúbrica, k6 otro equipo | FR-023/024; SC-008; D10/VP001–008 |

PG usa dos conexiones, barreras observadas y filas finales; no sleeps como única
prueba ni mocks de atomicidad. Un helper aprobado es control auxiliar, no protocolo.
Fixtures ficticias y schemas t_ propios, sin bootstrap ni limpieza de otros datasets.
Registrar descubrimiento/casos/aserciones alcanzadas y separar casos únicos de
repeticiones UTC/Lima o móvil/escritorio. Reloj controlado prueba límites, no un ensayo
operacional real de 24 h ni capacidad sostenida.

## Recorridos y evolución

1. Alumno reserva conjunto elegible antes de inicio: espera y después orden/24 h;
   rechazo completo por cupo, curso duplicado o conflicto efectivo, contiguos permitidos.
2. Pago aplicable convierte todos los detalles; duplicado sin efecto extra. Oculto,
   tardío/al límite/incompatible: incidencia sin matrícula; no liberar antes por
   anotarla ni prometer devolución. Simulación identificada solo en test.
3. Desconectar/reiniciar y recuperar mismo resultado/plazo. Vencimiento efectivo e
   idempotente; nueva intención sin sanción/espera extra por abandono; misma no renueva.
4. Administrador fija precio/consulta/anota seguimiento sin efectos económicos;
   guard de mantenimiento, sustitución docente con retiro/revisión/republicación y
   conservación del historial finalizado sin reactivación.

Ensayar upgrade desde snapshot 0005 con datos ficticios previos y restore en otro
destino aislado según [antecedente](../002-oferta-academica/evidence/recovery.md) y
[operación](../../ops/recovery/README.md), sin atribuirle validación de la migración nueva.
Verificar filas/cuentas/configuración y runtime sin DDL; no asumir reversión automática.
Registrar comandos, versión/manifiestos, tiempos/fallos/recursos y limitaciones sin secretos.
Al terminar conservar volumen y datos; detener solo el proyecto aislado si corresponde.

Fallos de conexión/import/configuración no son pruebas rojas de negocio. Marcar tareas
solo con sus criterios completos. D02/sandbox y política económica siguen bloqueando
cobros reales; D13/custodia/retención/RPO/RTO antes de demo persistente/publicación.
Bootstrap, T104/T108, T073/T074 siguen abiertos. T103 conserva informe sin capacidad
aprobada. No se acredita capacidad para 1000/2500 concurrentes ni aceptación integral.
