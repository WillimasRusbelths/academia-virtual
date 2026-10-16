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

T097 completa; el detalle funcional/mediciones V16 se registra al cerrar T098.
D13, T104 y el hallazgo intermitente de bootstrap para T106 permanecen abiertos.
