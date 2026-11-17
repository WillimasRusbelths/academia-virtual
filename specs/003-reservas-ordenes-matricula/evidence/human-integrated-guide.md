# Preparación T089 — aceptación humana integrada

2026-11-15, America/Lima. **Guion preparado; ensayo integrado no realizado.**
Este guion no sustituye resultados humanos. T083 se cerró posteriormente con la
confirmación del responsable registrada en [human-acceptance.md](human-acceptance.md);
T089 y la aceptación integral T094 permanecen pendientes.

## Puertas antes de la sesión

| Dependencia | Estado comprobado |
| --- | --- |
| T042, observación US1 | Favorable comunicada por el responsable, solo computador; registro original en [human-acceptance.md](human-acceptance.md). No hay resultados individuales de móvil/teclado. |
| T069 y T084, checkpoints locales | Completos; automatización separada de la observación humana. |
| T083, recorrido administrativo | Completada según resultado comunicado por el responsable: pasos probados en computador y seguimiento conservado con incidencia pendiente, sin matrícula ni devolución. Sin observación directa del agente. |
| T059, proveedor/sandbox | Pendiente de T056–T058/D02; no hay integración externa acreditada. |

Se puede recoger observación parcial de US1/US3/US4 con datos ficticios, consignándola
como parcial. US2 integrada y el cierre T089 requieren la evidencia real de T059.
Una simulación local o una persona alternando cuentas ficticias no acreditan por sí
solas todas las personas, modalidades o resultados exigidos.

## Preparación de participantes y entorno

1. Coordinar alumno y responsable reales; registrar consentimiento, rol observado,
   seudónimo, fecha, dispositivo y modalidad de entrada. No publicar identidades,
   correos, contraseñas, cookies, enlaces de pago o datos del medio de pago.
2. Registrar revisión/manifiesto de fuentes y escenario ficticio. Entregar acceso
   privado a una sesión aislada nueva, con duración y destino identificados. Los
   enlaces históricos T042/T083 no son una sesión vigente ni se reactivan por esta guía.
3. Preparar oferta visible, conjunto elegible, rechazo, listado vacío, error temporal,
   resultado incierto y orden vencida/histórica. Distinguir datos preparados de
   hechos que el participante haya producido. Una orden vencida por reloj de prueba
   sirve para observar su interfaz, sin acreditar 24 horas físicas.
4. Para US2 usar exclusivamente el sandbox acreditado por T059 y sus instrumentos
   de prueba autorizados; seguir el contrato validado. No solicitar tarjetas reales
   ni activar cobros productivos. El responsable técnico acompaña fallos de entorno
   sin atribuirlos a comprensión del participante.
5. Observar computador, móvil y teclado por separado. Registrar lo no ensayado como
   no observado; los resultados de Playwright no completan una observación humana.

## Matriz de observación

| Caso / historia | Acción a observar | Comprensión o resultado esperado, aún no observado |
| --- | --- | --- |
| HI01 / US1 | Consultar `/reservar`, comparar precios, horarios y disponibilidad; previsualizar. | Distingue selección/preview de reserva confirmada y capacidad configurada de plazas disponibles. |
| HI02 / US1 | Confirmar un conjunto elegible y consultar orden; ensayar rechazo preparado. | Reconoce espera frente a confirmación, conjunto completo o rechazo, total PEN y plazo del servidor. No interpreta rechazo como cupo retenido. |
| HI03 / US2 | Iniciar pago sandbox de la propia orden; consultar estado pendiente y resultado. | Éxito o retorno del navegador no equivale a matrícula; solo el estado confirmado por servidor permite anunciarla. Impedido hasta T059. |
| HI04 / US2 | Consultar un estado incierto y una incidencia acreditados en sandbox. | Consulta antes de reintentar; distingue pendiente, fallo e incidencia sin matrícula. No entiende seguimiento como devolución o resolución económica. Escenarios externos solo según capacidades T059. |
| HI05 / US3 | Recargar, cerrar sesión y volver a consultar una orden con plazo conservado. | Identifica el mismo resultado y fecha; no atribuye renovación al login, recarga o reintento. |
| HI06 / US3 | Consultar una orden vencida preparada; iniciar una intención nueva autorizada. | Reconoce vencimiento y condiciones nuevas sin sanción/espera por abandono; la intención anterior no renueva. Registrar si el vencimiento fue preparado o transcurrió físicamente. |
| HI07 / US4 | ADMIN cambia precio y consulta orden anterior, incidencia y seguimiento; usar [guion T083](t083-guide.md). | Distingue precio actual de condiciones originales; anota seguimiento sin cambiar pago, matrícula, reserva o plazo. Explica qué queda pendiente. |
| HI08 / US4 | Alumno consulta lo propio después del seguimiento; cerrar sesión y comprobar separación de vistas. | No recibe texto interno ni formulario administrativo. El participante identifica sus acciones autorizadas. |
| HI09 / transversal | Observar vacío, validación/error, conservación de entradas y recuperación de una respuesta incierta. | Diferencia vacío de error; puede explicar cómo consultar y continuar sin inventar éxito o reenviar automáticamente. |

Para cada caso usar **observado favorable**, **observado con dificultad**,
**no observado** o **impedido por puerta**. Anotar acciones y palabras efectivamente
comunicadas, ayudas proporcionadas y dificultades. No inventar tasas, tiempos,
participantes ni umbrales de aceptación.

## Registro mínimo por sesión

```text
Fecha y entorno/revisión:
Seudónimo y rol del participante; consentimiento confirmado:
Dispositivo, navegador y entrada (teclado/táctil/ratón):
Caso HIxx / estado inicial preparado o producido:
Acciones efectivamente realizadas:
Qué entendió o explicó el participante:
Resultado observado / dificultad / ayuda:
Qué no se observó o qué puerta impidió el caso:
Incidencia o corrección necesaria y evidencia saneada:
```

Publicar solo el registro saneado en [human-acceptance.md](human-acceptance.md).
Mantener el resultado T042 original y la procedencia del responsable; no transformar
su confirmación global en resultados individuales de esta matriz. No presentar
disponibilidad o apertura técnica de una página como ensayo realizado.

## Cierre posterior

Revisar evidencias reales de las cuatro historias, T083 y T059, modalidades y estados
exigidos por T089. Documentar fallos/correcciones y repeticiones reales. Si falta un
recorrido o una puerta, conservar T089 pendiente y describir el avance parcial.
No cerrar T104/T108 de 001, T073/T074 de 002 ni T094 por esta sesión.
