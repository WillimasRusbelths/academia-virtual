# T104 · Preparación del estudio con diez participantes

Preparado el 2026-10-18; base funcional `7dbf3a6`. **Sin sesiones observadas: T104,
SC-001 y la parte humana de SC-010 pendientes.** Dependencia T094 cumplida.
Protocolo vinculante: [SC-001/010](../spec.md#resultados-medibles),
[verificación](../verification.md) y [T104](../tasks.md).

## Organización y preparación

1. Williams organiza diez personas distintas, P01–P10, y acuerda horarios individuales.
   No publicar nombres/contactos ni convertir la revisión de una persona en diez muestras.
   Antes del primer turno, anotar fecha, commit funcional, navegador/versión, equipo,
   resolución, zoom y URL efectivamente usados; registrar diferencias por participante.
2. **Pendiente habilitar y comprobar un entorno exclusivo del estudio**: configuración
   `APP_ENV=test`, BD/esquema nuevo, Mailpit propio en modo capture, origen web coherente
   con los enlaces y puertos libres. Reutilizar las guardas y migraciones del
   [harness](../../../ops/docker/test-harness.md); no restaurar desarrollo ni usar el
   [ensayo manual](../../../ops/local/manual-us1.md). Sus 15 cuentas, credenciales y
   volúmenes se conservan. Publicar aquí las URL comprobadas antes de convocar la ejecución;
   `localhost:5173` y `localhost:18025` actuales pertenecen al ensayo conservado.
3. Reservar correos ficticios únicos `t104-<lote>-p01@example.test` hasta `p10`, y nombres
   P01–P10. Cada persona elige su contraseña de 12–128 caracteres en privado. No sembrar
   las cuentas que deben crearse por registro. Sin grabación, capturas de formularios,
   contraseñas, tokens ni enlaces completos en la evidencia. Acceso al buzón filtrado por
   su destinatario; no enviar correo real.
4. Turnos secuenciales sin carga ni otros ensayos. Mantener seguridad/cuotas: registro y
   recuperación suman exactamente 20 solicitudes admitidas por origen/hora si cada uno
   usa una de cada tipo; reenvíos, pilotos y reintentos también consumen cuota. Inventariar
   el consumo y esperar ventanas reales si hace falta (destinatario/propósito 1/min y
   5/h; origen 20/h entre rutas). No limpiar cuotas, adelantar relojes ni simular IP.

## Guion del observador

Explicar solo el objetivo y el uso del buzón ficticio; no demostrar el recorrido ni indicar
controles durante la medición. Registrar cualquier orientación sobre cómo resolverlo como
**ayuda**, incluso si luego termina. La preparación entre flujos no cuenta como ayuda.

**R · Registro y verificación.** Pantalla `/registro` cargada y sin sesión. Consigna:
«Crea tu cuenta de alumno con los datos ficticios asignados y verifica tu correo».
Al dar «empieza», iniciar cronómetro. Observar que completa nombre/correo/contraseña,
envía, localiza su mensaje nuevo en Mailpit, abre el enlace y confirma explícitamente.
Final: confirmación visible de correo verificado. Abrir el enlace por sí solo no completa
el flujo. Login/perfil posterior sirve de control funcional fuera del tiempo R.

**C · Recuperación.** Entre flujos, preparar con la persona dos contextos independientes
autenticados de esa cuenta recién verificada; comprobar `/perfil` en ambos. Tercer contexto
sin sesión en `/login`. Consigna: «Recupera el acceso a tu cuenta mediante el correo
ficticio y establece una contraseña distinta de la anterior». Al dar «empieza», iniciar cronómetro: debe
encontrar recuperación, solicitar instrucciones, localizar su mensaje nuevo en Mailpit,
abrir el enlace, escribir/confirmar la contraseña nueva y confirmar el restablecimiento.
Final: confirmación visible de cambio, sin auto-login. Fuera del tiempo C, comprobar
recarga de los dos contextos previos rechazada, contraseña anterior rechazada y nueva
aceptada; registrar fallos sin pedir ni publicar las contraseñas.

**Tiempo:** usar cronómetro continuo y acumular aparte solo la espera pasiva de entrega,
desde confirmación genérica de solicitud hasta que el mensaje nuevo esté disponible en
Mailpit. Pausar el tiempo activo únicamente durante esa espera; buscar/leer el mensaje,
decidir, escribir, corregir errores y confirmar sí cuentan. Registrar espera 0 si el correo
ya llegó. Interrupciones o fallos del entorno se describen, conservan la muestra y dejan
la evaluación pendiente si impiden interpretarla; no sustituir participantes fallidos
para mejorar el porcentaje. Una respuesta genérica no acredita entrega.

## Registro real (vacío)

Metadatos de ejecución: **pendientes** (fecha, commit, navegador, equipo, resolución/zoom,
URL y observador). En cada celda doble usar **R / C**, tiempos en segundos. Ayuda:
«ninguna» o descripción; resultado: completado/fallo/interrumpido, sin inferir aceptación.

| Participante | Activo R / C (s) | Espera correo R / C (s) | Ayuda R / C | Resultado R / C | Observaciones y controles posteriores |
| --- | --- | --- | --- | --- | --- |
| P01 | — / — | — / — | — / — | pendiente / pendiente | — |
| P02 | — / — | — / — | — / — | pendiente / pendiente | — |
| P03 | — / — | — / — | — / — | pendiente / pendiente | — |
| P04 | — / — | — / — | — / — | pendiente / pendiente | — |
| P05 | — / — | — / — | — / — | pendiente / pendiente | — |
| P06 | — / — | — / — | — / — | pendiente / pendiente | — |
| P07 | — / — | — / — | — / — | pendiente / pendiente | — |
| P08 | — / — | — / — | — / — | pendiente / pendiente | — |
| P09 | — / — | — / — | — / — | pendiente / pendiente | — |
| P10 | — / — | — / — | — / — | pendiente / pendiente | — |

Por separado, R y C requieren **al menos 9/10 completados sin ayuda y <180 s activos**;
no promediar ambos flujos. Totales: R **sin datos/10**, C **sin datos/10**.
La invalidación técnica de SC-010 ya tiene [evidencia US7](us7.md); la
[revisión humana T094](us3.md) no midió este estudio. Reutilizarlas no crea resultados
de participantes. Conservar el lote aislado hasta revisar resultados; cualquier limpieza
posterior debe dirigirse solo a sus recursos identificados, nunca al entorno manual.
