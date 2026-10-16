# T099–T102: preparación verificable de carga de identidad

2026-10-16, base `951dd93`, árbol inicial limpio. Sin AGENTS.md aplicable ni hooks;
skill speckit-implement limitada al bloque, checklist 16/16 sin modificar.
[Tareas](../tasks.md), [escenarios/umbrales](../verification.md), [plan](../plan.md),
[modelo](../data-model.md), [quickstart](../quickstart.md), contratos y constitución
revisados. T098 completa habilita T099→T100→T101→T102; no hay bloqueo de dependencia.
La ejecución completa de capacidad pertenece a **T103**, que permanece pendiente.

## T099 — k6 y cohortes privadas

[Herramientas y procedimiento](../../../load-tests/identity/README.md),
[prepare](../../../load-tests/identity/prepare.ts), [cleanup](../../../load-tests/identity/cleanup.ts).
Proyecto nuevo `identity-load-80c2b6fa22ce`, red interna sin puertos publicados,
BD/schema `academia_v00_test/t_load_identity` y volúmenes propios; no monta secretos
ni datos manuales. PostgreSQL 16.14, Node 22.23.1. k6 real:
**v1.6.0+dirty**, commit `d97957fc61-dirty`, Go 1.25.6; imagen fijada 1.6.0,
digest `sha256:be2a9ceb1b6ffc573277af4157135882a6d6433968b41e858ab02c5fd5847532`.
No se presenta el binario como una compilación limpia.

| Criterio | Resultado |
| --- | --- |
| Muestras completas | CLI real creó 1120 cuentas: sesiones 1000, warmup 20, autenticación 100. IDs/correos/contraseñas disjuntos; todas STUDENT/ACTIVE/verificadas y sin contraseña inicial pendiente. |
| Criptografía | 1120 hashes distintos, Argon2id v19 con m=19456/t=2/p=1 y verificación nativa de representantes de las tres cohortes. No hashes compartidos/reducidos. |
| Guardas T029 | Reutiliza assertFixtureEnvironment, configuración y criptografía existentes; añade schema t_load_*, marcador de BD aislada y comparación de BD/schema efectivos. Rechaza desarrollo, manual, schema ajeno, BD/origen/SMTP no permitidos antes de crear archivos/cuentas. |
| Secretos | Directorio/manifiesto 0700/0600 en volumen privado; no sobrescribe y conserva manifiesto ante interrupción. No emails reales ni envíos de correo. IDs/correo/índice únicos se validan antes de limpiar. |
| Limpieza | 1000 sesiones sintéticas solo para probar contador/limpiador: revocación dirigida 1000, repetición 0; eliminación explícita de 1120 fixtures y repetición 0. Preserva cuenta/sesión ajenas y singleton inicializado. No demuestra 1000 logins ni carga. |
| Pruebas reales | [fixtures.spec.ts](../../../load-tests/identity/fixtures.spec.ts): 9/9, más 26 regresiones de credentials/login: 35/35, cero omitidas. Los archivos temporales y schemas de esa suite son distintos del cohort de k6. |

Una ejecución inicial tuvo 8/9: la comprobación asumía orden textual m/t/p; el
proveedor serializa m/p/t. Se comparan los mismos valores ordenados, como el adaptador
vigente; no se cambió el algoritmo/costo ni se contó el fallo como aprobado.
La primera invocación del reportero carecía de su montaje; se leyó el resultado real
y se repitieron las pruebas necesarias con el archivo correcto.

T099 completa. Los detalles y resultados de T100–T102 se registran al verificar
sus perfiles, guardas y captura. Se conservan T104, bootstrap/T106 y D13 pendientes;
no se activa programación de purga de T095 ni se aprueba un SLA.
