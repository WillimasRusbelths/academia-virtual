# Acceso temporal T064 — preparado, observación pendiente

2026-11-17, America/Lima. El responsable confirmó disponibilidad de gestor y alumno,
consentimiento voluntario y uso de laptop. No hay resultados humanos registrados;
T064 sigue pendiente, estado 63/68. Navegador/SO, teclado y dificultades aún no
informados; móvil físico no observado. El [protocolo](human-acceptance.md) permanece
como guía del recorrido. Esta actualización sucede a la indisponibilidad registrada
en los informes históricos, sin atribuirles resultados nuevos.

Se preparó el proyecto ficticio materials-human-60e9aab3c9b5, separado del entorno
manual, con DB/volumen/roles y credenciales propios. PostgreSQL y Mailpit están
en una red interna sin puertos publicados. El runner también tiene una interfaz
frontend para publicar únicamente 127.0.0.1:5173; no expone DB/SMTP a la laptop.
No se modificó el entorno manual ni se contrataron servicios.

URL local: http://localhost:5173. Ventana web máxima de dos horas desde ready.json;
no se habilita una demo persistente ni se aceptan D13/D10. El archivo privado
.cache/materials-human-60e9aab3c9b5/acceso-privado.txt contiene cuentas G01/A01,
grupo y ruta directa. En ese mismo directorio hay PDF/JPEG/PNG ficticios y un TXT
rechazable. Usar perfiles de navegador separados y títulos nuevos T064 para
distinguir los archivos del participante de materiales ficticios precargados.
No compartir el archivo de acceso, entorno, cookies, logs o contraseñas.

Validación técnica: tipos del nuevo harness y lint API aprobados; API generada/
compilada antes de iniciar el runner. Desde la laptop: web, módulo Vite, login,
contexto de grupo y listado de ambos roles respondieron 200 (ocho comprobaciones).
Las dos sesiones técnicas se cerraron. No se cuenta el test interactivo en curso
como prueba de aceptación aprobada; espera observaciones de personas reales.
[Resultado saneado y hashes](t064-session-ready-results.json).

Primer intento materials-human-90cbbfae8452: los logins internos funcionaron,
pero falló el acceso desde host. Se detuvo conservando su volumen y archivos.
Se añadió frontend al runner y se comprobó IPv4 en un proyecto nuevo; no se
reutilizaron credenciales o datos manuales para resolverlo.

Al terminar, ejecutar en la laptop, desde la raíz del repositorio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .cache/materials-human-60e9aab3c9b5/detener.ps1
```

El comando detiene solo ese proyecto y conserva volumen/evidencia. El vencimiento
de dos horas cierra web/API, pero la DB/Mailpit del laboratorio requieren el comando
de detención. Registrar resultados por rol y modalidad, ayuda requerida, incidencias
y aceptación del responsable; no marcar T064 antes de esa revisión.
