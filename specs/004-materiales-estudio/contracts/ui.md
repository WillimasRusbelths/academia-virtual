# Contrato de interfaz — materiales

Fecha: 2026-11-16; propuesta, sin pantallas implementadas.

## Navegación y audiencias

Rutas `/materiales` para grupos accesibles y `/materiales/grupos/:groupId` para
listado. App conecta enlaces desde grupo docente/administración y matrícula de
alumno sin imports entre features. No panel general nuevo. URL directa usa sesión
y backend; ocultar acción no autoriza. Oferta fuera del catálogo no invalida acceso.

Gestor consulta preparado/publicado/retirado; alumno solo publicado con matrícula
vigente. Admin en grupo cancelado consulta/descarga/retira; docente no accede.
Cambio de permiso descarta vista anterior como vigente y muestra error seguro.

## Carga, gestión y recuperación

Formulario con título, descripción opcional y PDF/JPEG/PNG, límite visible 20 MB
decimal. Cliente comprueba preliminarmente tamaño/formato y calcula SHA-256;
servidor decide. File/textos se mantienen en memoria de esa sesión.

«Preparar material» registra intención y envía archivo; muestra envío sin porcentaje
inventado. Solo resultado durable acredita preparado. Cargar o editar textos no
publica. «Publicar» y «Retirar» requieren confirmación explícita. Archivo/grupo
inmutables; reemplazo usa material nuevo y retiro del anterior.

Error conserva textos y File si sigue disponible. Conflicto muestra diferencia y
ofrece recargar/comparar; no sustituye revisión silenciosamente. Incertidumbre ofrece
consultar intención y reintentar manualmente la misma. Cambio de archivo/textos de
intento requiere intención nueva. Reload no promete conservar File; reselección
puede contrastarse por hash. Sin replay automático al recargar o iniciar sesión.

## Cliente binario y sesión

Cliente dedicado inyectado desde app, same-origin/no-store/redirect error y aborto;
no File en JSON. Descarga valida status/cabeceras/errores y generación de sesión
antes de crear enlace Blob transitorio. Revocar URL tras uso, logout o desmontaje;
sesión vieja no puede presentar respuesta tardía. Logout borra estado local y
cancela requests. No bytes/tokens en localStorage/sessionStorage o cache persistente.

No anunciar descarga completa si longitud/transferencia no coincide. Reintento
manual hace nueva autorización. Un archivo legítimamente descargado al dispositivo
no puede recuperarse ni borrarse desde la plataforma.

## Estados y accesibilidad

Distinguir carga inicial, vacío, envío, preparado, publicado, retirado, rechazado,
conflicto, permiso perdido, sesión vencida y fallo recuperable. Etiquetas y errores
asociados, región de resultado perceptible, foco coherente tras error/diálogo y
acciones completas con teclado. En móvil conservar estado y descarga sin desborde.
Observación humana registra teclado, computador y móvil por separado; E2E no la sustituye.
