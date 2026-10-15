# Reanudar el ensayo manual de identidad

Ejecutar desde la raíz con Docker Desktop en Linux. Se reutilizan las imágenes, las
cuentas del esquema de pruebas manual y el volumen privado de credenciales existentes.
No ejecutar fixtures, bootstrap ni migraciones para resolver un conflicto de puerto.

```powershell
docker compose -f compose.yml -f compose.override.yml -f .cache/docker/compose.manual-us1.yml -f ops/docker/compose.manual-ports.yml up -d --no-build --wait db mailpit api web
```

El archivo `.cache/docker/compose.manual-us1.yml` pertenece al ensayo local y está
ignorado: selecciona el esquema manual de `academia_v00_test` y el volumen privado.
Debe existir; si falta, recuperar su configuración original antes de iniciar. No copiar
credenciales a este documento ni sustituir ese esquema por uno recién creado.
`compose.override.yml` es la configuración local existente de certificados de construcción;
este comando no reconstruye imágenes ni actualiza el código que contienen.

Web: `http://localhost:5173`; salud API: `http://localhost:3000/health/live` y
`http://localhost:3000/health/ready`; correo capturado: `http://localhost:18025`.
Las credenciales de prueba permanecen en el volumen privado existente; no se imprimen
en logs ni se incorporan a Git. Este ensayo utiliza datos de prueba aislados de desarrollo.

## Puerto y comprobación

El [override del ensayo](../docker/compose.manual-ports.yml) sustituye exclusivamente
el puerto PostgreSQL publicado por `127.0.0.1:55532`. Solo los clientes de base de datos
que corran en el host necesitan ese puerto. API, migraciones y pruebas dentro de Compose
conservan `db:5432`; no requieren cambios de URL ni credenciales.

El 2026-10-15 se comprobó por lectura que Windows reservaba 55411–55510 y ningún proceso
escuchaba en 55432. Se comprobó un bind temporal disponible en 55532 antes de usarlo.
El cambio recreó el contenedor de PostgreSQL con el mismo volumen, sin reinicializarlo;
los cuatro servicios quedaron saludables, ambos endpoints de salud y la web respondieron
200, y una consulta de la API accedió a las 12 cuentas del esquema manual y a su archivo
privado de credenciales. No se alteraron reservas de Windows, datos de cuentas ni .env.

```powershell
docker compose -f compose.yml -f compose.override.yml -f .cache/docker/compose.manual-us1.yml -f ops/docker/compose.manual-ports.yml ps
```

Si 55532 deja de estar disponible, revisar `Get-NetTCPConnection` y
`netsh interface ipv4 show excludedportrange protocol=tcp`. Elegir un puerto libre y
definir `MANUAL_POSTGRES_PORT` solo para este ensayo antes del mismo comando. No alterar
reservas del sistema ni el puerto interno; no eliminar volúmenes. Detener con los mismos
archivos Compose y `stop`, conservando contenedores y datos.

Los registros históricos conservan el comando utilizado en su momento. Este procedimiento
es la referencia actual para reanudar el ensayo. Véase [operación Docker](../docker/README.md)
para las configuraciones y pruebas generales.
