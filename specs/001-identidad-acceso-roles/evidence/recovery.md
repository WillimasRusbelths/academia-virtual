# T097–T098: respaldo y recuperación aislados

2026-10-16. Base funcional `c9bf167`, sobre T095/T096 completas. Solo datos ficticios;
ninguna restauración ni borrado en desarrollo o ensayo manual. Fuentes:
[tareas](../tasks.md), [V16](../verification.md), [quickstart](../quickstart.md),
[modelo](../data-model.md), [plan](../plan.md) y [D13](../../../docs/decisiones-pendientes.md).

## T097 — procedimiento y scripts

[Procedimiento](../../../ops/recovery/README.md),
[backup.ps1](../../../ops/recovery/backup.ps1) y
[restore-check.ps1](../../../ops/recovery/restore-check.ps1), con
[cifrado autenticado](../../../ops/recovery/archive.mjs).
Probados realmente desde Windows PowerShell 5.1/Node 22.23.1 contra PostgreSQL
16.14 en proyecto nuevo `identity-recovery-3f7876b9ea64`, red interna y volumen propios,
sin puertos publicados ni volúmenes del entorno manual.

| Criterio | Evidencia real |
| --- | --- |
| Dump consistente / PS5.1 | pg_dump custom a archivo interno, docker cp a archivo privado; sin redirección binaria. API/worker detenidos durante respaldo y restauración. Códigos de salida y tamaño comprobados. |
| Cifrado y custodia | AES-256-GCM, nonce aleatorio por copia, cabecera autenticada, clave binaria de 32 bytes en directorio separado. Directorio de ensayo con ACL exclusiva del usuario; secretos/archivo/manifiesto ignorados, no versionados. |
| Integridad | SHA-256 de dump y cifrado; verificados antes/después de descifrar. Copia cifrada real: 45 886 bytes; SHA-256 `675ab9ed4a2eed57921aa29f1accc288fc47c3c6c320d90f6373b19bdbb5094d`. |
| Restauración positiva | Archivo autenticado y pg_restore --single-transaction --exit-on-error a `recovery_3f7876b9ea64_test`, nueva y separada. Owners/ACL de objetos conservados; PUBLIC sin acceso a BD nueva, CONNECT explícito a roles revisados en el ensayo. No --clean, --create, DROP DATABASE ni reuso de destino. |
| Guardas reales | [check-guards.ps1](../../../ops/recovery/check-guards.ps1): 5/5; no sobrescribe backup, exige mantenimiento, rechaza clave incorrecta y copia alterada antes de crear BD, rechaza BD existente conservando su OID. No quedaron dumps temporales tras esos fallos. |
| Cifrado bajo fallo | [archive.test.mjs](../../../ops/recovery/archive.test.mjs): 7/7 en Docker; ida/vuelta de bytes, nonce nuevo, clave incorrecta, alteración de contenido/cabecera/tag, truncado y destino existente. Salida parcial retirada. |
| Actualización y corrección | Runbook exige revisión compatible/configuración aparte, pausa de escritores/worker, corrección hacia adelante y migrate resolve únicamente después de revisión humana del SQL aplicado. No ejecuta resolve ni downgrade automáticamente. |
| Retención prevista | Siete copias cifradas más preactualización, documentadas; este ensayo conserva una copia preactualización verificada. No se afirma haber operado siete días ni existir programación/custodia definitiva. |

Restauración de archivo: 11:22:13.549–11:22:15.362 UTC (1.813 s). Su salida deja
`trafficReady=false`; abrir requiere todavía las verificaciones funcionales de T098
y el registro global satisfactorio de [T096](restored-state.md).
El manifiesto de creación conserva `restored=false`; la prueba de restauración se
registra aparte, sin convertir un hash previo en una validación funcional.

Los temporales se retiran en finally; un apagado forzado puede dejarlos en el
directorio privado o /tmp del contenedor. El runbook exige inspección dirigida.
Los roles globales y permisos de conexión de una BD nueva se revisan aparte; el
archivo no los provisiona. Los scripts requieren acceso local autorizado a Docker.
No hay automatización de mantenimiento ni cambio de la purga CLI de T095.

## T098 — V16 ejecutado y aprobado en aislamiento

Ensayo definitivo: `identity-recovery-20274d7bcfb6`, BD fuente `academia_v00_test`,
destino nuevo `recovery_20274d7bcfb6_test`, schema `t_recovery_v16_422fb22d4ed7`.
Misma laptop con Docker Desktop; PostgreSQL 16.14 y Node 22.23.1 Linux. No simula
pérdida de equipo/disco ni recuperación en otra máquina.

Revisión anterior: **1abc3c7** (código funcional T096 sin cambios posteriores).
Nueva candidata de ensayo: esa revisión más `0005_recovery_failed`, SQL sintético
SHA-256 `2a8d81ab2a22385583f91232df44f43a8819188ebf37560d381c74035aae57cf`.
No se inventa un commit de producto: el SQL vive solo en una copia temporal de Prisma.
La corrección `0005_recovery_checked`, SHA-256
`67ec9d4d411ac5d1746b4bfb158df87f7cd25817e608b7688d87243eb2862d7c`, se aplica
realmente al destino restaurado. Las cuatro migraciones originales quedan intactas.

| Comprobación | Resultado real |
| --- | --- |
| Actualización fallida | Prisma migrate deploy retorna error aplicando 0005_recovery_failed; registro específico iniciado/sin finished_at, sin rolled_back_at. Su CREATE TABLE queda revertido por la transacción. La fuente fallida se conserva para inspección; no migrate resolve. |
| Copia restaurada | 45 893 bytes cifrados; SHA-256 `aa32f2c826e41ca535b4ccbe82bcc53e9ac683400fc8a97c19421ec373fc3926`, autenticación y hash del dump coincidentes. |
| Cantidades antes de invalidar | User 12, Session 6, ActionToken 2, MailDelivery 2, AuditEvent 1, SystemState 1, RateBucket/RateEvent 0, migraciones 4; iguales al respaldo. Hashes de todas las cuentas, auditoría y singleton inicializado coinciden. |
| Schema antes de migrar | Coinciden 83 columnas, 44 constraints, 23 índices, cuatro funciones, tres triggers y 33 valores enum. CHECK se compara mediante su expresión procesada por PostgreSQL (EXPLAIN sin ANALYZE, solo lectura), porque restaurar aplana AND asociativos; no se eliminan constraints ni paréntesis indiscriminadamente. |
| Migración correctiva | Deploy compatible de las cuatro previas sin cambios, seguido de aplicación real de 0005_recovery_checked: cinco migraciones terminadas y tabla ficticia RecoverySchemaProbe con una fila. Los datos permanentes conservan sus hashes. |
| Permisos e integridad | Objetos propiedad de academia_v00_owner; runtime sin superuser/createdb/createrole/replication/bypassrls. Seis rechazos reales: DDL runtime, rol inválido, correo duplicado, FK Session inexistente, caducidad >8 h y borrado de singleton. |
| T096 antes de abrir | Revoca seis sesiones y dos tokens; cancela dos entregas PENDING/SENDING y borra payload/claim. OPERATION global STARTED/SUCCEEDED, alias de ensayo Williams, LOCAL_OPERATOR/IDENTITY_SCOPE, correlación `0f91b983-81f5-43ac-9192-18a52e765f7a`. Sin secretos ni AuditEvent ficticio; usuarios/singleton/auditoría permanecen iguales. |
| Acceso y reinicio | Solo entonces se inicia API/worker: cookies anteriores 401, ambos enlaces 400/INVALID_ACTION_LINK, login nuevo y /me correctos para los tres roles; administración 200 para Admin y 403 para Alumno/Docente. Inactivo/no verificado/provisional siguen sin login normal (401). Mailpit recibe cero correos obsoletos. Se cierra la aplicación y se inicia otro proceso Node real: cookie nueva 200 y antigua 401. |
| Pérdida conocida | Una modificación ficticia de nombre a las 11:32:13.417 UTC, posterior al backup, desaparece al restaurar; el hash completo vuelve al punto protegido. No se presenta pérdida cero. |

| Medición UTC, 2026-10-16 | Valor |
| --- | --- |
| Backup cifrado | 11:31:54.3047764–11:31:55.1447559 (0.840 s) |
| Fallo detectado | 11:32:18.1796128 |
| Restore del archivo | 11:32:19.1177520–11:32:20.7226269 (1.605 s) |
| Recuperación funcional y proceso nuevo comprobados | 11:32:45.3270075 |
| RPO conservador | **≤23.875 s**, desde inicio de backup hasta fallo; el snapshot se toma dentro del intervalo del dump. No se conoce su instante exacto: la ventana queda entre 23.035 y 23.875 s. |
| RTO observado | **27.147 s**, desde detección del fallo hasta finalizar restauración, comparación, migración correctiva, invalidación, permisos y reinicio. |

Se usa DateTimeOffset para descontar instantes, con dos comprobaciones UTC/UTC−5
y precisión subsegundo aprobadas. Estos tiempos son observaciones locales; **D13
no tiene RPO/RTO aceptables aprobados** y no se convierten en SLA.

## Reproducción, regresión y límites

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops/recovery/rehearse.ps1
```

[Orquestación](../../../ops/recovery/rehearse.ps1) y
[prueba por fases](../../../apps/api/tests/recovery/rehearsal.spec.ts): prepare,
postbackup y restore aprobadas, sin omisiones. Precondiciones y archivos privados
en el [runbook](../../../ops/recovery/README.md#reproducir-v16-sin-tocar-el-entorno-manual).
Los servicios de todos los ensayos se detuvieron; sus volúmenes nuevos y artefactos
privados se conservan. Ningún dump/clave/cookie/credencial ni log crudo se versiona.

Se conservan fallos previos como tales: manejo de stderr de Docker en PS5.1,
preparación de ambas URLs de Prisma y comparación textual demasiado estricta de
dos CHECK con AND. No se contaron como restauraciones aprobadas; se corrigió el
harness y se repitió el ensayo completo. También se conserva la ejecución previa
con migración correctiva/recreación de aplicación; el ensayo definitivo añade el
proceso Node separado. No cambian requisitos ni umbrales.

Lint API/web y recuperación aprobado; compilación API/web aprobada; **120/120
unitarias/arquitectura**. [T096](restored-state.md): 17/17, reforzada con token
vencido y cuerpo válido de reset; **132/132 regresiones** de sesiones, correo,
auditoría, privacidad y retención, 149 verificaciones de integración entre lotes.
Se reutilizan estos resultados; no se presenta este bloque como la regresión
integral/E2E de T106. Cifrado 7/7, guardas reales 5/5 y tiempo 2/2 aprobados.

Huellas privadas antes/después idénticas: **15 cuentas manuales, incluidas las 12
originales, credenciales y SystemState preservados**. Sin restauración/borrado de
desarrollo ni del ensayo manual. Todo el bloque es automatizado; no acredita
aceptación humana. T104 y SC-001/010 siguen pendientes de participantes reales.
El hallazgo intermitente de bootstrap permanece abierto para T106.

T097 y T098 completas en su alcance local. D13 sigue pendiente (custodia, ubicación,
responsable y objetivos operativos); siete copias más preactualización son la
retención prevista, sin programación activada. T095 sigue siendo una CLI de purga
explícita. Siguiente bloque recomendado: T099–T102, preparación de carga; no ejecutado.
