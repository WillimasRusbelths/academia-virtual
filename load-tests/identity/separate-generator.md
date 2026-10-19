# Alternativa preparada: generador en otro equipo

Procedimiento pendiente de ejecución y de disponer de un segundo equipo. No requiere
contratar servicios. No acredita separación causal ni capacidad hasta medirlo.
Conservar el [protocolo ID-LOAD-01/02](../../specs/001-identidad-acceso-roles/verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas)
y los resultados anteriores. [Estado de la investigación](../../specs/001-identidad-acceso-roles/evidence/load-environment.md).

## Recursos y aislamiento necesarios

- Servidor: el proyecto de carga aislado, nunca `academia-local`; API 2 CPU/1 GiB,
  PostgreSQL 1 CPU/512 MiB, pool 10 y seguridad originales. Registrar host/VM reales,
  alimentación y recursos de los procesos competidores. No copiar volúmenes manuales.
- Segundo equipo **Linux** disponible con Docker y cliente SSH, espacio para crudos,
  alimentación estable y sin otras cargas. Generador k6 con el mismo digest/versión,
  **1 CPU/512 MiB**. No sustituirlo por una VM en el primer equipo: seguiría compartiendo CPU.
- Acceso SSH ya autorizado y disponible hacia el servidor. No se instala ni habilita
  OpenSSH, firewall o servicios de Windows automáticamente. Si falta, registrar esa
  dependencia antes de ejecutar. No publicar API/BD/Mailpit en Internet ni en la LAN.
- Transferir por SSH/SCP únicamente los scripts de la revisión registrada y el
  manifiesto **ficticio** de 1120 cuentas de ese ensayo a un directorio 0700, archivo
  0600, del segundo equipo. No pasar contraseñas por argumentos, consola o Git; no
  transferir `private.env`, claves de BD ni cuentas/credenciales manuales.

## Conexión conservando el cliente original

En el servidor, añadir un override local exclusivamente al Compose de carga:

```yaml
services:
  api:
    ports:
      - '127.0.0.1:13000:3000'
```

Verificar con `docker inspect` que solo la API del proyecto aislado publica ese
puerto y que la escucha es 127.0.0.1. Comprobar alcance desde el host; la red interna
de Docker y la implementación de Desktop pueden impedirlo. Si no es accesible,
parar y resolver esa conectividad de prueba explícitamente, sin abrir interfaces
globales ni modificar el entorno manual. Este override **no fue aplicado ni validado**.

En el segundo equipo, mantener abierta una terminal con el túnel:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:3000:127.0.0.1:13000 usuario@servidor
```

Sustituir el destino por la cuenta SSH autorizada. La resolución `api` se conserva
solo dentro del contenedor k6 mediante `--add-host api:127.0.0.1`; con red host de
Docker Linux alcanza el túnel. Se conservan `http://api:3000/api/v1`, cookies por VU,
Origin `http://localhost:5173`, CSRF y timeouts originales. No cambiar `client.js`.
El túnel añade costo de CPU/red: medirlo en ambos equipos, declararlo y no atribuir
toda diferencia a k6. No es un ensayo de TLS público.

Ejemplo de invocación, con `PRIVATE_DIR` apuntando al directorio privado que contiene
`fixtures/fixtures.json`, y `RUN_NAME` nuevo, nunca reutilizado:

```sh
docker run --name "$RUN_NAME" --network host --add-host api:127.0.0.1 \
  --cpus 1 --memory 512m --user "$(id -u):$(id -g)" \
  -e K6_NO_USAGE_REPORT=true -e RESULT_NAME="$RUN_NAME" -e LOAD_PHASE=warmup \
  -v "$PWD/load-tests/identity:/scripts:ro" -v "$PRIVATE_DIR:/load-private" \
  grafana/k6:1.6.0 run --out "json=/load-private/$RUN_NAME-raw.jsonl" /scripts/sessions.js
```

Validar el digest antes: un tag coincidente no prueba un binario idéntico. Ejecutar
primero smoke y calentamiento 20 VU/1 min, sin otras pruebas; si incumple, investigar.
Después, ID-LOAD-01 usa `LOAD_PHASE=measured` y `sessions.js`; ID-LOAD-02 usa
`authentication.js`. Los scripts mantienen rampas, muestras, pausas y duración.
No modificar los perfiles para superar una limitación del generador.

## Captura y parada coordinadas pendientes

`measure.ps1` actual orquesta un generador Docker **local**. No ejecutarlo a la vez
que este comando ni presentar sus metadatos como una captura remota. Antes de un
perfil completo falta preparar y verificar una coordinación equivalente:

1. Preparar/snapshot de cohortes en servidor; verificar cero sesiones válidas,
   manifiesto coincidente y reloj civil frente a monotónico en **cada** equipo.
   Calibrar offset/RTT entre k6 y SQL; no reinterpretar retrospectivamente commits.
2. API con `serve.ts` y observación base por segundo; sin V8, SQL tracing ni motor
   opcionales en la corrida de capacidad. Capturar pool, sesiones/actividad, hash,
   recursos API/BD y muestreo ligero del observador. Medir también k6, SSH y host remoto.
3. Conservar watchdog original: espera hash >5 s, margen API <128 MiB, memoria host
   <256 MiB, OOM o monitor no disponible. Propagar parada al k6 remoto y comprobar
   que se detiene. Probar esa propagación en smoke antes de un perfil completo.
4. Guardar ambos intervalos y metadatos (revisión/diff, lock/digests, cuotas, recursos,
   exit codes y relojes) y los crudos nativos, sin sobrescribir. No ejecutar reporteros,
   builds o regresiones durante la ventana medida. Registrar duración/costo de muestreo.
5. Auditar frontera [300,900), creación/visibilidad/respuesta, 1000 sesiones y actividad
   durante **toda** la meseta, percentiles por operación, errores y solicitudes en vuelo.
   Ninguna gracia o desplazamiento de meseta nuevo está aprobado.
6. Revocar únicamente sobrantes del manifiesto ficticio con `cleanup.ts sessions`;
   repetir hasta comprobar cero efectos y snapshot intacto. Conservar cuentas,
   volúmenes y paquetes. Verificar recuperación con smoke separado y huellas manuales.

Para aislar causas, comparar una corrida local y otra remota con código/recursos
del servidor y observación iguales; registrar la diferencia de red/túnel. Medir el
costo del observador en un control dirigido aparte, conservando guardas de seguridad.
Una mejora en otro equipo no prueba por sí sola que k6 causó el incumplimiento local.

Hasta disponer de estos recursos y validar la coordinación, la alternativa queda
**preparada como protocolo, no implementada ni ejecutada**. D10 debe acordar rúbrica,
distribución/actividad/duración, umbrales y tratamiento de la frontera de meseta;
no se cambia nada para aprobar una ejecución previa.
