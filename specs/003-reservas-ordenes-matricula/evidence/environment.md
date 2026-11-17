# Entorno aislado — T002

Fecha: 2026-10-31, America/Lima. Base Git `533b4b618b7d1ad972741e855d67d3fbb14e5a0f`,
con T001 local ya completada. Continuación T002–T004 autorizada por el responsable;
checklist 12/16 conservado y sin cambios de sus marcas.

## Destino comprobado

- Copia existente: `.cache/academic-offering-validation/source`.
- Proyecto: `academic-offering-fa3d46bddbb8`.
- Volumen existente: `academic-offering-fa3d46bddbb8_postgres_data`, creado
  `2026-10-19T10:45:57Z`; etiqueta de proyecto correcta, no externo.
- Compose: base, override existente de la copia, regression e identity-tests,
  con `--project-name`, `--project-directory` y `--env-file` explícitos.
- Servicios configurados: db, mailpit, api, web y browser-tests. Se reanudaron
  únicamente db y mailpit con `up -d --no-build --wait`; ambos saludables.
- Cero puertos publicados en los cinco servicios. APP_ENV=test en API/runner.
  URLs runtime/migración/probe apuntan a db:5432/academia_v00_test; runtime y
  migración usan roles separados y coinciden con los destinos probe respectivos.
- Cuenta/base manual no utilizadas: se conserva `academia-local` y su configuración.
  Los ensayos crearán cuentas @example.test en schemas t_ de la base exclusiva de test.

Mounts vivos verificados: DB usa exclusivamente el volumen anterior en
`/var/lib/postgresql/data` y el SQL de inicialización de la copia aislada como
bind de solo lectura en `/docker-entrypoint-initdb.d/01-academia.sql`.
Mailpit no tiene mounts. No hay binds fuera de esa copia ni volúmenes ajenos.

PostgreSQL comprobado mediante consulta real: 16.14 Debian bookworm, base
`academia_v00_test`, x86_64. Imagen DB:
`sha256:64154d0babcb1741988719e703419af0382b19953706149f9872fbd0f438efa8`.
Imagen Mailpit:
`sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d`.

## Comandos y preservación

Auxiliar privado `.cache/reservas-t002-t004/run.ps1`, ejecutado con
`powershell -NoProfile -ExecutionPolicy Bypass -File <ruta> -Action config|up|inspect`.
Cada acción valida la configuración sin imprimir secretos antes de operar.
config/up/inspect terminaron con salida 0; detalles sanitizados privados en
config-summary.json y containers-summary.json. La captura inicial tiene 705
archivos locales y 74 archivos protegidos; se conserva la evidencia T001 previa.

Docker Desktop estaba detenido; se inició en segundo plano y luego se accedió
al motor con escalación permitida. Compose recreó el contenedor DB conservando
el volumen existente; no se recrearon datos ni se ejecutó configure.mjs/bootstrap.
La representación NativeCommandError del progreso stderr de Docker en PowerShell
no cambió su resultado real 0. No se genera ni aplica una migración nueva.

La sincronización, imágenes de código y controles T003/T004 se registran en
[preparation.md](preparation.md); esta comprobación no acredita comportamiento financiero.
