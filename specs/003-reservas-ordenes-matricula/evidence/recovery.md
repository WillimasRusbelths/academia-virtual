# T086 — Upgrade y restauración de matrícula

2026-11-15, America/Lima. T086 completa como ensayo automático local de FR-022.
No abre tráfico ni cierra la aceptación integral. Base
`cfc001eac89292c1b135dbba79be9a9ca8cc0b8b` más fuentes no versionadas identificadas
por hash en [recovery-results.json](recovery-results.json).

Comando ejecutado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse-enrollment.ps1 -ApiImage academic-offering-fa3d46bddbb8-api:latest
```

El [lanzador](../../../ops/recovery/rehearse-enrollment.ps1) y las
[pruebas por fases](../../../apps/api/tests/recovery/enrollment-rehearsal.spec.ts)
reutilizan el [procedimiento de recuperación](../../../ops/recovery/README.md),
la comparación de instantáneas académica y los scripts existentes de respaldo,
cifrado, restauración y guardas. El helper compartido de fixtures financieros
acepta ahora solo los campos que usa; no se modifica su comportamiento ni producto.

## Resultados ejecutados

Proyecto final `enrollment-recovery-52959423bd9d`, PostgreSQL 16.14 y Node 22.23.1.
Imagen API registrada por ID; fuentes actuales montadas y compiladas en cada fase.
Configuración privada y manifiesto de fuentes intactos durante la ejecución.
La ampliación documental de README se hizo después del ensayo.

| Comprobación | Resultado |
| --- | --- |
| Generación Prisma, lint API, build y tipos estrictos del ensayo | Aprobados |
| Tipos API de matrícula y sintaxis PowerShell | Aprobados |
| Fase legacy | 1/1: deploy real 0001–0005, doce cuentas y filas académicas ficticias |
| Fase upgrade | 1/1: deploy real 0006–0007, filas previas conservadas y orden consultable |
| Fase postbackup | 1/1: anotación ficticia posterior registrada por HTTP real |
| Fase restore | 1/1: comparación, permisos, invalidación, accesos y reinicio |
| Controles auxiliares de cifrado | 7/7 |
| Guardas de archivos y PostgreSQL | 5/5 |
| Cálculo temporal UTC/America/Lima | 2/2 |

Las cuatro fases son ejecuciones de una prueba parametrizada, no cuatro suites
independientes. Cero fallos o skips en el intento final; sin retries ni ampliaciones
de timeout. No se repitieron las suites funcionales integrales acreditadas en T084.

## Punto consistente y recuperación

El upgrade conserva la huella de las trece tablas previas de identidad/oferta,
excluyendo únicamente la nueva descripción de grupo, comprobada separadamente en
NULL. Se conservan usuarios, hashes, sesiones, enlaces, correo, singleton y filas
académicas. Las siete migraciones originales permanecen intactas.

El grafo financiero físico es explícitamente ficticio: una orden, un detalle,
una reserva convertida, un intento, dos pagos terminales —uno aplicado y otro con
incidencia—, un recibo, una matrícula, una incidencia y un seguimiento. También
se conservan precio, coordinadores, comandos y auditoría. No acredita autenticidad
del proveedor ni un cobro real.

Antes de cada backup terminaron los runners; no quedaron API ni workers de aplicación
escribiendo. Los dos correos sintéticos se retienen sin enviar. Se producen dos
copias cifradas: la de 0005 se conserva; **solo la copia posterior al upgrade fue
restaurada**. No se atribuye restore a la primera.

Una anotación real por HTTP se registra después del backup. A continuación una
migración deliberadamente inválida `0008_recovery_failed`, solo en una copia temporal
de Prisma, falla y no deja tabla parcial. Se comprueba su fila de migración fallida;
no se modifica SQL aplicado ni se invoca `migrate resolve`. La fuente fallida se conserva.

El restore usa otra base nueva `recovery_*_test`, sin sobrescribir ni limpiar la
anterior, con PUBLIC revocado y CONNECT explícito para owner/runtime. Las 29 tablas
—28 de aplicación y `_prisma_migrations`— coinciden con la instantánea completa:
filas, columnas, índices, restricciones, enums, funciones, triggers, vistas y grants.
Se reutiliza la normalización de CHECK mediante PostgreSQL del ensayo anterior,
sin quitar condiciones. Deploy compatible no cambia esa instantánea. El runtime
recibe 42501 al intentar DDL; modificar un pago terminal recibe 23514.

Antes del acceso funcional se ejecuta la invalidación restaurada existente:
**6 sesiones, 2 enlaces y 2 correos**. Todas las tablas ajenas a esos accesos
conservan sus huellas. Los accesos anteriores son rechazados; nuevos logins de
administrador, alumno y docente funcionan con sus denegaciones correspondientes.
El alumno recupera su orden y matrícula; el administrador consulta la incidencia.

La anotación posterior al backup se pierde, como corresponde al punto restaurado.
El operador ficticio revisa y reaplica esa única decisión conocida por HTTP con su
commandId original. Replay no duplica y un contenido distinto obtiene
IDEMPOTENCY_CONFLICT. Las demás filas financieras conservan sus huellas. Otro
proceso Node acepta la sesión nueva y rechaza la anterior. Cero correos enviados;
los eventos de invalidación STARTED/SUCCEEDED no contienen las credenciales del ensayo.

Tiempo observado de recuperación: **42,29 s**, desde detectar el fallo hasta concluir
las verificaciones. Ventana superior de cambios no protegidos: **43,28 s**, desde
iniciar el dump hasta detectar el fallo. Son mediciones locales, sin SLA ni RPO/RTO
aprobados. No se promete recuperar cambios posteriores desconocidos.

## Intentos conservados y límites

El primer proyecto `enrollment-recovery-fdd513a382c8` pasó legacy, upgrade y
postbackup; falló una comprobación posterior al restore por usar en la prueba
`/enrollment/my-enrollments` en lugar de la ruta existente `/enrollment/enrollments`.
Se corrigió solo el test y se repitió el ensayo completo en el proyecto final.
El primer intento no se cuenta como recuperación aprobada; conserva sus archivos,
bases y volumen detenidos para inspección.

Ambos proyectos tienen red interna y cero puertos publicados; quedaron detenidos
con volúmenes, claves y copias privadas conservadas. No se tocó el proyecto manual,
sus cuentas ni sus datos. El inventario previo contiene 955 archivos; los 74 archivos
protegidos y toda evidencia anterior permanecen intactos. No se publican env,
handoff, claves, dumps ni reportes brutos con datos privados.

Este resultado no acredita pérdida del equipo, custodia externa, retención operativa,
24 horas físicas, pagos del proveedor ni capacidad. D02, D13, D10, T083 y T094
mantienen sus puertas. Checklist 12/16 conservado; no hay hooks de implementación.
Siguiente bloque: T087, sincronización de documentación con el código verificado.
