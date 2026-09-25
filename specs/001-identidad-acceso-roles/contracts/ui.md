# Contrato de pantallas y navegación

Diseño pendiente de implementar. Fuente de verdad de permisos: [API](api.md), nunca la ruta
del navegador. Una cuenta tiene un único rol y debe verificar correo antes de acceder.

Revisión: 2026-09-24. Los formularios pueden anticipar errores de entrada, pero reglas de
negocio y autorización se ejecutan en las capas de aplicación/dominio del backend descritas
en [plan.md](../plan.md), sin depender de que el usuario use esta interfaz.

| Ruta SPA | Pantalla mínima | Comportamiento |
| --- | --- | --- |
| `/registro` | Nombre, correo, contraseña y ayuda de límites | Registro público STUDENT; sin selector de rol. Validación local y servidor; tras 202 o límite, mensaje genérico con reenvío. |
| `/verificar-correo` | Confirmación explícita del enlace o formulario de reenvío | Leer secreto del fragmento y limpiar URL; POST solo al confirmar. No consumir al abrir la página. Éxito ofrece login o establecimiento inicial. |
| `/login` | Correo, contraseña, enlaces a recuperación/verificación | Error genérico sin identificar cuenta existente, desactivada o pendiente. Login válido consulta perfil y dirige al inicio del único rol. |
| `/recuperar` | Correo y solicitud de instrucciones | Misma confirmación genérica para todas las cuentas; respeta Retry-After. |
| `/restablecer` | Nueva contraseña y confirmación local | Secreto del fragmento solo en memoria; confirmación local no se manda. POST reset; éxito limpia datos y ofrece login, sin auto-login. |
| `/establecer-contrasena` | Correo, credencial provisional y nueva contraseña | Solo flujo inicial; no perfil. Éxito no verifica correo ni inicia sesión. Provisional vencida remite a verificar y recuperar. |
| `/inicio` | Nombre, rol, perfil y cerrar sesión | Mismo componente con contenido básico por rol; ADMIN añade gestión de cuentas. Sin paneles académicos/financieros. |
| `/perfil` | Nombre, correo, rol y estado | Solo lectura; no edición autónoma, cambio de correo o secretos. |
| `/admin/cuentas` | Búsqueda, filtros, paginación, alta | Solo ADMIN; datos mínimos, sin hashes, tokens ni sesiones. |
| `/admin/cuentas/:id` | Detalle, corregir nombre, cambiar rol/estado | Confirmación explícita de acciones sensibles; errores de último admin/cambio propio claros y sin efecto parcial. |

La credencial de alta administrativa se introduce o genera en el navegador con aleatoriedad
segura, se muestra únicamente al administrador que la entrega y se elimina de memoria tras
confirmar. No se guarda en localStorage, URL, logs o estado persistente. La UI nunca presenta
un correo como entregado por haber recibido 202; el transporte es asíncrono.

## Reglas transversales

- Frontend consume rutas relativas, JSON y `X-CSRF-Protection: 1`; las cookies las gestiona
  el navegador. Nunca intenta leer el identificador HttpOnly ni genera una cookie de sesión.
- 401 de sesión limpia perfil y datos sensibles y lleva a login con aviso; no conserva
  acciones pendientes para reenviarlas automáticamente. 403 explica acceso no permitido.
  503 ofrece reintentar manualmente, sin afirmar éxito. 429 muestra espera según Retry-After.
- Evitar dobles envíos con estado “enviando”; el servidor garantiza unicidad incluso si se
  elude ese control. No bloquear toda la aplicación mientras se envía un correo.
- No persistir contraseñas, provisional ni secretos de enlace. Si se recarga la pantalla
  después de retirar el fragmento se pide volver a abrir el correo o solicitar enlace nuevo.
- No ejecutar mutaciones automáticamente a partir de parámetros de URL. El destino de API
  es fijo por pantalla, no una URL controlada por parámetros externos.
- Registrar/verificar/recuperar no modifica el rol; no hay selector de contexto multirol.
- Validación a 360×800 y 1366×768, sin scroll horizontal de página, acciones solo hover o
  errores solo por color. Etiquetas asociadas, foco visible, orden de teclado, mensajes
  anunciables; tablas adaptadas a tarjetas o contenedor accesible en celular.
- No añadir scripts de terceros ni analítica en pantallas de credenciales/enlaces. Configurar
  protección de contenido y salida escapada; la defensa CSRF no protege frente a XSS.
- Textos en español y sin detalles de Nest, PostgreSQL, tokens o configuración para el alumno.

## Correspondencia con aceptación

HU1: login, expiración y cierre; HU2: registro/verificación; HU3: perfil/inicio/accesibilidad;
HU4: administración; HU5: denegación tanto por navegación como solicitudes directas; HU6:
inicialización operativa más establecimiento/verificación; HU7: recuperación/restablecimiento.
Las pantallas no añaden pagos, matrículas, chat, video ni un panel completo.
