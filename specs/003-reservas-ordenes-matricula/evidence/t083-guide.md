# Guía del ensayo humano administrativo T083

Preparación: 2026-11-13, America/Lima. **Ensayo pendiente de resultados humanos.**
El responsable confirmó en la conversación que puede probarlo en computador;
esa disponibilidad no acredita que haya realizado los pasos.

La sesión temporal está en http://localhost:5175/login, publicada exclusivamente
en `127.0.0.1:5175`. Las cuentas ficticias ADMIN y STUDENT se entregan en el archivo
privado ignorado `.cache/reservas-t083-t084/acceso-t083.txt`. No copiar credenciales
en esta evidencia ni utilizar cuentas reales. Duración máxima de ocho horas desde
la preparación; el enlace requiere Docker y las dependencias locales en ejecución.

## Recorrido a observar

1. Iniciar sesión como ADMIN. Abrir Precios, seleccionar el curso, cambiar el
   importe PEN y guardar. Revisar el mensaje de resultado.
2. Abrir Compromisos y consultar la incidencia. Comparar la orden original con
   el precio actual: el importe y el plazo originales deben conservarse.
3. Registrar una anotación ficticia en el seguimiento. Revisar autor, fecha y
   contenido, y recargar para comprobar que se conserva.
4. Explicar con sus propias palabras qué queda pendiente después de registrar la
   nota. Observar si distingue seguimiento de resolución económica. La incidencia
   sigue pendiente, sin matrícula, devolución ni confirmación manual.
5. Cerrar sesión e iniciar como STUDENT. Consultar Mis órdenes: pago en
   conciliación, sin matrícula y sin texto de la anotación interna. El alumno no
   debe acceder a formularios administrativos.
6. Informar pasos realmente realizados, resultado y dificultades. Registrar si
   hubo alumno real y su consentimiento; no atribuir participación humana al
   cambio entre cuentas ficticias hecho por el responsable.

Si se prueban teclado, móvil, desconexión u otros estados, registrar lo observado
por separado. No inferirlos de la automatización ni imponer umbrales inventados.

## Preparación técnica separada

Se reutiliza la composición real API/Vite/PostgreSQL de las fixtures locales con
un esquema nuevo propio, sin modificar el de T042. Se crea una orden por el
protocolo real y un hecho económico **simulado explícitamente**, procesado por el
receptor y el finalizador reales fuera del plazo de reserva. Estado preparado:
un intento, un pago registrado, una incidencia y cero matrículas. El reloj es el
control de pruebas de la fixture; no acredita transcurso físico de 24 horas.

La web respondió HTTP 200 desde el equipo anfitrión. Esto acredita disponibilidad
técnica, no comprensión ni aceptación humana. La preparación usa una red local de
acceso existente para publicar solo loopback; no cambia el Compose versionado ni
abre PostgreSQL al anfitrión. El contenedor temporal se conserva durante el ensayo.

T083 permanece abierta hasta recibir observaciones reales. T042 conserva íntegro
su resultado anterior. Esta sesión no cierra T089, tareas humanas de 001/002, D02,
D10, D13 ni la aceptación integral T094.


## Estado al retomar el 2026-11-15

La sesión temporal del13 terminó durante la interrupción del entorno. El enlace
anterior no está activo y sus credenciales no acreditan una sesión disponible.
El guion se conserva para retomar el ensayo; no hay resultados humanos de T083
comunicados y su tarea permanece pendiente.
