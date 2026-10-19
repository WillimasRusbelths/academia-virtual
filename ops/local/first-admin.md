# Operación del primer administrador

La inicialización es una entrada CLI restringida para el responsable con acceso al equipo,
configuración y base de datos. No existe endpoint público, seed privilegiado ni credencial
predeterminada. Se implementa con el mismo código de identidad del backend.

## Prerrequisitos y ejecución

- Docker Compose Linux y servicios locales configurados según [entorno Docker](../docker/README.md).
- Imagen API construida con el código actual, configuración válida del destino y las cuatro
  migraciones de identidad aplicadas. Revisar el destino antes de migrar o inicializar;
  respaldar datos persistentes según su procedimiento. No ejecutar `db:migrate:dev` sin base sombra.
- Entorno que nunca haya tenido un ADMIN: ausencia de cualquier administrador y de marca
  de inicialización. Desactivar o cambiar el rol del primero no habilita otra inicialización.
- API y web disponibles para activar la cuenta; Mailpit en modo capture para el ensayo
  local, sin destinatarios reales. El correo de producción todavía no está validado.

Desde un terminal interactivo en la raíz:

```powershell
docker compose exec api npm run admin:bootstrap --workspace @academia/api
```

Mantener el TTY: no usar `-T`, tuberías ni argumentos adicionales. La CLI solicita alias
operativo, nombre, correo y credencial provisional. El alias debe tener 1–64 caracteres
ASCII `[A-Za-z0-9_-]`; es una referencia declarada, no una autenticación ni dato de cuenta.
No se deriva del correo, hostname o usuario del equipo. La provisional se escribe sin eco
ni asteriscos y no pasa por el historial. Admite 12–128 caracteres, conservando espacios.
No pegarla en comandos, logs, documentación o archivos versionados.

## Resultado y activación

El éxito termina con código 0 y devuelve únicamente ID/correo como resultado. Crea un
ADMIN ACTIVE pendiente, credencial provisional de 24 horas, auditoría SYSTEM_BOOTSTRAP
y marca irreversible en una transacción; token y entrega cifrada se incluyen si hay cuota.
El hash se prepara antes del bloqueo y SMTP se ejecuta después mediante el ejecutor interno.
La operación queda correlacionada con registros privados LOCAL_OPERATOR.

1. Entregar la provisional solo al destinatario autorizado por un canal privado; el proyecto
   no elige una herramienta específica. No puede recuperarse leyendo un perfil o listado.
2. Capturar el mensaje local en `http://localhost:18025`, abrir su enlace y confirmar el correo.
   Abrirlo solamente no lo consume. Si no llega por cuota/fallo temporal, solicitar reenvío
   desde `http://localhost:5173/verificar-correo`, respetando la espera indicada.
3. En `http://localhost:5173/establecer-contrasena`, introducir correo, provisional y contraseña
   propia. La sustitución consume la provisional; no verifica correo ni inicia sesión.
4. Ambas acciones pueden realizarse en cualquier orden. Cuando las dos estén completas,
   iniciar sesión normalmente en `http://localhost:5173/login` con la contraseña propia.

Una entrega encolada no prueba recepción SMTP ni entrega exactamente una vez. Mailpit es
captura local, no proveedor de producción. Si vence la provisional, se requiere verificar
correo y recuperar contraseña: ese recorrido continúa pendiente de US7/T081.

## Repetición, errores y continuidad

Repetir, incluso simultáneamente o tras desactivar el primero, falla sin crear cuentas ni
sobrescribir credenciales; no es una vía de recuperación. Devuelve código distinto de 0 y
«Entorno ya inicializado» cuando corresponde, o un error seguro sin detalles para argumentos,
terminal, configuración, validación o fallos temporales. No copiar salidas privadas al informe.
No borrar la marca ni tablas para reintentar en un entorno real.

Antes de retirar al primero debe existir un segundo ADMIN habilitado: activo, con correo
verificado y contraseña propia. Su gestión y la protección del último ADMIN corresponden
a US4, todavía pendiente; no se documentan comandos ficticios para reemplazarla.

Los ensayos automatizados usan exclusivamente esquemas `t_*` de la base de pruebas y
destinatarios sintéticos. **No ejecutar bootstrap sobre el esquema manual de US1**, que ya
tiene administradores. Esta entrega no reconstruye sus imágenes ni modifica sus cuentas;
para mantenerlo disponible usar su [configuración existente](../../specs/001-identidad-acceso-roles/evidence/us2.md#reproducción-y-ensayo-manual-conservado).
Resultados y límites: [checkpoint US6](../../specs/001-identidad-acceso-roles/evidence/us6.md).
