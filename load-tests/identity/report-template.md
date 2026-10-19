# Informe ID-LOAD-01 / ID-LOAD-02 — pendiente de ejecutar T103

No rellenar con valores propuestos. Resultados crudos privados; adjuntar únicamente
cantidades/estadísticos, sin cuentas, cookies, enlaces o credenciales.

| Procedencia | Valor medido |
| --- | --- |
| Fecha UTC, responsable, revisión y diferencias/hash de scripts | Pendiente |
| Hash lockfile, imágenes/digests y k6/Node/PostgreSQL | Pendiente |
| SO, CPU/núcleos, RAM total/libre, disco libre/tipo, Docker/WSL | Pendiente |
| API/BD/generador: CPU, RAM, IO, red, límites y ubicación | Pendiente |
| Pool, Argon2 (m/t/p), concurrencia/cola/espera máxima | Pendiente |
| Generador separado o contención en misma laptop y costo del monitor | Pendiente |

| Escenario | Programa obligatorio | Duración real / interrupciones |
| --- | --- | --- |
| Calentamiento | 20 cuentas propias, 20 VU, 1 min, ejecución independiente | Pendiente |
| ID-LOAD-01 | 0→100/1 min→500/2 min→1000/2 min, 1000/10 min, descenso/2 min | Pendiente |
| ID-LOAD-02 | 100 cuentas aparte; 10/25/50/100 VU, cada escalón constante 2 min | Pendiente |

| Medición por escenario/fase | Valor real |
| --- | --- |
| VU configurados / activos máximos / solicitudes API simultáneas | Pendiente; son magnitudes distintas |
| Sesiones válidas / usuarios distintos / hashes distintos / actividad reciente | Pendiente; no deducir de VU |
| Meseta: 1000 slots distintos, todas las muestras BD con 1000; inicio/fin y huecos | Pendiente |
| Solicitudes, RPS total y de tráfico válido; latencias p50/p95/p99 por ruta | Pendiente |
| Errores inesperados por clase/estado, 503 y abortos | Pendiente |
| Argon2: trabajo/espera máximos, operaciones; cola máxima y rechazos | Pendiente |
| API/BD/generador: picos CPU/RAM, IO/red; conexiones, locks, espera pool | Pendiente |
| Cuentas/singleton antes/después y sesiones sobrantes revocadas por limpieza | Pendiente |
| Logout confirmado / comprobación funcional separada de revocación | Pendiente; limpieza final no acredita revocación en meseta |

Umbrales provisionales, sin cambiarlos para aprobar: /me p95<500 ms y p99<1000 ms;
login p95<3000 ms; errores inesperados<1%; cero cruces, duplicados y aceptación de
sesiones revocadas en su escenario separado. Alcanzar 1000 sesiones válidas distintas
durante toda la meseta es condición independiente. Declarar omisiones/huecos de
observación; una muestra aislada de 1000 no acredita diez minutos.

Detener si espera de hash>5000 ms, falta RAM o falla el monitor. Registrar motivo,
tiempo de detección, carga alcanzada y resultados parciales como desfavorables/incompletos.
Los márgenes de seguridad de RAM del runner son 128 MiB libres en cgroup API y
256 MiB disponibles en Windows; no son umbrales de aceptación de capacidad.

Conclusión limitada a identidad, revisión, infraestructura y duración medidas. No
extrapolar a producción, matrícula, video, chat o clases. D10/rúbrica pendientes;
T104 necesita participantes, bootstrap sigue abierto para T106, T095 no tiene purga
programada y D13 no tiene SLA aprobado. No confundir smoke técnico con T103.
