# T096: invalidación del estado restaurado

2026-10-16, base `d183f1e`; ejecución automatizada en Docker, PostgreSQL 16.
Depende de [T095](retention.md), completa. Árbol inicial limpio; instrucciones y
criterios de [T096–T098](../tasks.md), U1 y [V16](../verification.md) revisados.

La [CLI restringida](../../../apps/api/src/cli/invalidate-restored-state.ts) compone
un [caso de uso](../../../apps/api/src/modules/identity/application/invalidate-restored-state.ts)
y una [transacción de recuperación](../../../apps/api/src/infrastructure/database/restored-state.ts).
No cambia schema, contratos HTTP ni dependencias. No hay llamadas HTTP al comando.
Exige alias explícito válido, schema coincidente y `--maintenance-confirmed`;
rechaza desarrollo, ensayo manual y schemas de test fuera de `t_*`.

| Criterio | Resultado real |
| --- | --- |
| Sesiones y enlaces | Revoca sesiones no revocadas y tokens no consumidos/no revocados. No modifica marcas ya terminales ni añade revocación a tokens consumidos. |
| Correo restaurado | Cancela PENDING/SENDING; borra payload, nonce, tag, clave y claim/lease. Conserva metadata y estados SENT/FAILED/CANCELLED. |
| Integridad y repetición | Una transacción con locks de las tres tablas; dos invocaciones concurrentes sin doble conteo. Repetir produce cero cambios. Fallo SQL intermedio revierte todo; reintentar completa. |
| Datos permanentes | User/SystemState idénticos; no elimina ni fabrica AuditEvent, ni reinicia cuotas. |
| Registro global U1 | OPERATION/RESTORED_STATE_INVALIDATION, LOCAL_OPERATOR, Williams, IDENTITY_SCOPE, correlación común STARTED/SUCCEEDED y cantidades seguras. Sin actor/destino de cuenta ficticio. |
| Fallo de registro | Sin STARTED persistido no opera. Fallo de registro tras commit devuelve error; mantenimiento debe continuar y el reintento es seguro. |
| Secretos | JSONL real en directorio temporal privado sin correo, enlace, token, cookie, conexión ni clave de cifrado conocidos por la prueba. No se versionan registros crudos. |
| Reapertura | Tras invalidación, cookies de tres roles reciben 401 y ambos enlaces previos 400. Login nuevo, /me y acceso administrativo según rol funcionan. |

[Suite reproducible](../../../apps/api/tests/integration/restored-state.spec.ts): **17/17**.
En contenedor API efímero, con código/tests montados de solo lectura, ejecutar:

```sh
npm run lint --workspace apps/api
npm run build --workspace apps/api
npm run test:unit --workspace apps/api
cd apps/api
npx vitest run tests/integration/restored-state.spec.ts --maxWorkers=1
```

Se reutiliza el harness `us2Dataset`: crea/migra y retira únicamente su schema `t_*`;
no usa las cuentas manuales. Resultado adicional: **75/75 unitarias/arquitectura**,
lint y build API aprobados; regresiones de audit 58, mail-delivery 25, retention 29,
secret-redaction 5 y session-store 15: **132/132** (149 con T096), cero omitidas.
La regresión mail-delivery usa el readiness auxiliar en otro schema efímero,
como [T095](retention.md); no se cuenta una ejecución sin preparación como aprobada.

Límite operativo: los locks duran la transacción; es obligatorio detener API, worker
y demás escritores durante restauración/invalidación y comprobar SUCCEEDED antes
de abrir tráfico. No se puede retirar un correo ya enviado a SMTP por otro proceso.
El alias atribuye la acción; el acceso local y las credenciales BD la autorizan.
No se ha restaurado desarrollo ni el ensayo manual. La huella privada previa
confirma 12 cuentas originales y 15 totales; se contrastará al terminar el bloque.

T096 completa. T097/T098 requieren su propio ensayo; T104 sigue reservada para
participantes reales. El hallazgo intermitente de bootstrap permanece abierto en
T106; no se declara resuelto. T095 continúa sin programación de la purga.
