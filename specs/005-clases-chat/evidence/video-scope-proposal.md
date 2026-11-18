# Propuesta revisable: YouTube en el ensayo del MVP

**Fecha**: 2026-11-17, America/Lima. **Estado: PROPUESTA PREPARADA, NO ADOPTADA.**
**Responsable del proyecto**: aprobación del texto pendiente.
**Profesor**: validación pendiente si modifica criterios de evaluación; no hay
evidencia de aprobación ni de que el requisito quede exento en la evaluación.
**Constitución vigente**: 1.2.1, sin modificar.
**Versión propuesta si se adopta**: 2.0.0, porque redefine una obligación del MVP.
No es PATCH: aceptar una prueba con menor control cambia el criterio anterior.

El responsable autorizó corregir los hallazgos y preparar esta propuesta. Eso no
se registra como aprobación de una enmienda cuyo texto aún no había revisado.
Este documento adelanta la parte documental de T034; no la completa ni ejecuta
T035/T039. No cambia los requisitos vigentes o evidencia de specs anteriores.

## Decisión concreta que se propone

> El MVP usará YouTube Live con OBS para demostrar emisión y reproducción con
> contenido de prueba autorizado. Academia Virtual controlará el acceso al aula,
> a la referencia de reproducción entregada por su API y al chat según sesión,
> rol y matrícula vigente. El enlace de YouTube puede compartirse y reproducirse
> fuera de la plataforma; esta prueba no acredita protección de las entregas
> multimedia ni su revocación por matrícula. Cloudflare queda fuera del MVP.

Esta excepción se limita al **ensayo audiovisual del MVP de 005/006/007**. No
afecta permisos de cuentas, grupos, matrículas, materiales privados o chat;
no reduce sus comprobaciones directas/vencidas. Tampoco autoriza contratación,
producción, cobros o recepción de contenido privado por redactar/aprobar el alcance.
Se mantienen D10/D13, presupuesto S/300 y validación real de lo que se afirme.

Las limitaciones de YouTube constan en [viabilidad inicial](../video-feasibility.md)
y [research](../research.md). La propuesta no incorpora integración técnica,
tokens de proveedor, gestor alternativo o una reproducción simulada como evidencia.

## Enmienda exacta propuesta al principio VIII

Texto vigente en [constitución](../../../.specify/memory/constitution.md):

> El acceso a manifiestos y segmentos HLS DEBE exigir autorización acorde con la clase y
> la matrícula aplicable, también al solicitar directamente sus URL. Ocultar enlaces NO es
> control de acceso. Se DEBEN probar solicitudes autorizadas, no autorizadas y con autorización
> vencida, según el mecanismo elegido. NO se DEBE prometer impedir grabaciones de pantalla.

Reemplazo propuesto, todavía sin aplicar:

> ### VIII. Ensayo audiovisual del MVP y protección del video
>
> Para el ensayo del MVP de clases y chat se permite YouTube Live con OBS y contenido
> de prueba autorizado. Academia Virtual DEBE comprobar sesión, cuenta, rol, clase y
> matrícula o responsabilidad vigente en cada acceso a sus recursos de aula, referencia
> de reproducción y chat. Al perder permiso o finalizar la clase DEBE denegar nuevas
> entregas propias y retirar el reproductor de su interfaz cuando detecte ese cambio.
>
> La prueba de YouTube NO DEBE presentarse como protección del contenido por matrícula:
> una referencia compartida puede permitir reproducción externa, y cerrar el aula o
> revocar una sesión de Academia Virtual no acredita revocar el acceso en YouTube.
> Se DEBEN comprobar y documentar los controles propios y las limitaciones externas
> mediante una emisión y reproducción reales. Ocultar enlaces NO es control de acceso.
>
> Antes de ofrecer una integración como video protegido, el acceso a sus manifiestos
> y segmentos DEBE exigir autorización vigente acorde con la clase y matrícula, también
> por URL directa y con autorización vencida. Se DEBE comprobar asimismo el control del
> emisor actual y la revocación de credenciales y emisiones anteriores. Ese incremento
> se define y valida por separado; Cloudflare se contempla después del MVP y su elección
> futura no acredita esos controles ni autoriza su contratación. NO se DEBE prometer
> impedir grabaciones de pantalla.

Si se aprueba y corresponde la validación académica, mantener ratificación
2026-09-22 y actualizar versión/última modificación a la fecha real de adopción,
con registro de motivo e impacto. No marcar D07/D08 resueltas solo por adoptar
este texto: las pruebas reales del nuevo alcance seguirán pendientes.

## Reemplazos propuestos en requisitos de 005

Mantener IDs, cuatro historias y 24 escenarios. El texto siguiente sustituiría
solo los requisitos indicados; FR-001–004, FR-007, FR-010–020 y FR-022 conservan
sus obligaciones. No se rebajan permisos de materiales, chat o finanzas.

**FR-005 propuesto**: El alumno DEBE consultar exclusivamente sesiones no canceladas
de sus grupos con matrícula propia vigente. Reserva, pago pendiente, autoría, curso
igual u oferta visible no sustituyen la matrícula. Entregar desde Academia Virtual
la referencia de reproducción del ensayo exige clase en curso; la referencia
externa compartida no demuestra autorización por matrícula en YouTube.

**FR-006 propuesto**: El permiso DEBE revalidarse en cada operación y entrega nueva
de recursos gestionados por Academia Virtual y durante sus conexiones persistentes:
sesión/cuenta activas, rol actual, grupo, estado de clase y matrícula o asignación/
habilitación docente aplicables. Revocación/vencimiento impiden nuevas entregas
propias. La interfaz descarta respuestas anteriores y retira el reproductor al
detectar pérdida de permiso; esto no acredita cortar reproducción externa de YouTube.

**FR-008 propuesto**: El ensayo del MVP DEBE usar YouTube Live con OBS, comprobar el
acceso autorizado a la referencia que entrega la aplicación y realizar reproducción
real. DEBE advertir y registrar que el enlace puede compartirse y que no se acredita
autorizar manifiestos/segmentos del proveedor por matrícula o impedir reproducción
directa tras vencimiento. La integración NO DEBE anunciarse como video protegido.

**FR-009 propuesto**: Solo el responsable actual autorizado DEBE poder asociar o
cambiar la referencia de emisión de una clase dentro de Academia Virtual. Secretos
de OBS/YouTube no se entregan al alumno ni se registran en la aplicación. La pérdida
de permiso bloquea nuevas acciones propias. Iniciar/detener o revocar una emisión
en YouTube requiere la operación del responsable de la cuenta emisora, registrada
en el ensayo; no se presume control automático de esa cuenta o de un emisor anterior.

**FR-021 propuesto**: La interfaz DEBE distinguir vacío, cargando, emisión no
configurada, espera/señal observada, enviado, incierto, desconectado, acceso perdido
y fallo recuperable, con teclado, computador/móvil, foco y estados accesibles. DEBE
informar que la reproducción YouTube corresponde al ensayo y su enlace puede
compartirse. Logout/cambio de cuenta descarta mensajes, borradores, conexiones,
reproductor y respuestas tardías de la sesión previa.

**FR-023 propuesto**: La aceptación DEBE separar gestión/chat, controles propios de
Academia Virtual, reproducción YouTube real, limitaciones de acceso externo,
observación humana y capacidad medida. NO DEBE presentar el ensayo como protección
multimedia por matrícula ni 2.500 activos como logrados. D10/D13 conservan sus
puertas; no habilitar persistencia/publicación sin D13. Cloudflare queda fuera del MVP.

## Criterios y escenarios propuestos

**SC-002 propuesto**: En el 100% de la matriz de visitante/alumno/docente/admin,
grupo propio/ajeno, sesión activa/revocada y matrícula antes/en/después del fin,
el acceso a recursos propios coincide con FR-005–009/010/015, incluidas conexiones
ya establecidas. Las referencias externas YouTube se observan y reportan como
limitación separada; no se cuentan como control propio aprobado.

**SC-003 propuesto**: Una emisión de prueba autorizada YouTube se reproduce realmente
en navegador desde una clase en curso. La API deniega obtener referencias nuevas
sin permiso, vencido o después de finalizar; la UI retira el reproductor al detectar
pérdida de acceso. Registrar duración, calidad, fallos y pruebas con referencia
externa compartida, sin presentar estas últimas como acceso protegido o revocado.
Una simulación no acredita reproducción real ni control de YouTube.

**SC-007 propuesto**: Con consentimiento, un docente y un alumno reales realizan
entrar a clase, seguir emisión YouTube de prueba y participar/consultar chat; un
responsable realiza moderación, finalización y detención manual de emisión en el
proveedor. Registrar resultado/dificultad/ayuda por dispositivo/modalidad y
limitaciones externas; modalidades no observadas permanecen identificadas.

SC-001/004/005/006/008 se mantienen. La población ≥15.000 y meta 2.500 activos no
se reducen; el video del proveedor y el tráfico propio siguen midiéndose aparte.

Reemplazo propuesto de los siete escenarios de US2, sin aumentar su número:

| Escenario | Resultado propuesto |
| --- | --- |
| US2.1 | Con matrícula vigente, consulta sesiones preparadas/en curso/finalizadas autorizadas; preparadas no reproducen y finalizadas no ofrecen grabación. |
| US2.2 | En LIVE y con permiso, obtiene referencia y reproduce YouTube realmente; distingue configuración/espera/error y conoce el límite del enlace compartible. |
| US2.3 | Visitante/sin matrícula/otro grupo no obtiene datos ni referencia desde Academia; una referencia YouTube previamente compartida se ensaya aparte, sin prometer denegación externa. |
| US2.4 | En fin original o después, API/chat/reconexión/referencia nueva denegados; UI retira reproductor al detectar pérdida. No se acredita revocación del enlace YouTube conocido. |
| US2.5 | Oferta retirada o cambio docente no revoca matrícula; gestión de referencia exige responsable actual. Continuación/revocación en cuenta YouTube se opera y registra manualmente. |
| US2.6 | Cierre/revocación/deshabilitación deniega entregas propias nuevas y descarta respuestas/UI de sesión anterior; reproducción externa no se presenta como controlada. |
| US2.7 | Finalizar bloquea nuevas referencias/reproducción desde la aplicación; responsable detiene emisión en YouTube y registra resultado. No se promete revocar por sí sola la referencia externa. |

Actualizar el Independent Test de US2 y casos límite de emisor/finalización para
usar esas fronteras; conservar autorización exacta del aula/chat. Una advertencia
en UI no sustituye pruebas, ni una captura de player acredita reproducción fluida.

## Impacto y secuencia de adopción propuesta

| Artefacto | Cambio necesario después de aprobación; no aplicado aquí |
| --- | --- |
| Constitución VIII / versión | Reemplazo exacto anterior y enmienda MAJOR 2.0.0 con fecha real; demás principios intactos. |
| RF16 general | Proponer: «Habilitar el ensayo de emisión del docente y reproducción YouTube con OBS, comprobando permisos propios de aula/referencia y documentando límites de acceso externo; la autorización directa/vencida de manifiestos y segmentos se exige antes de presentar una integración como video protegido». Actualizar estado sin reescribir evidencia de specs 001–004. |
| DEC01/DA03, alcance MVP, D07/D08 | Mantener YouTube elegido para ensayo; separar viabilidad/reproducción de protección posterior. D07/D08 requieren evidencia con el alcance adoptado, no cierre por edición. |
| Spec 005 | Aplicar FR/SC y escenarios anteriores, trazabilidad y límites; historial previo se conserva. |
| Plan/research/modelo y contratos 005 | Repetir plan del video del ensayo: referencia no secreta accesible solo mediante API autorizada, gestión manual por responsable y player con aviso. Definir validación de referencia, CSP y resultados del proveedor antes de implementar. No aprobar adaptador por este documento. |
| G-V005 | Tras adopción, dividir ensayo YouTube del MVP y protección futura: no llamarla cumplida; sin bloqueo por exigir Cloudflare o un gestor externo ahora. |
| T035/T039/T040/T081/T086 | Reescribir dependencias/criterios después de aprobar el alcance y completar contrato de ensayo; ahora conservan bloqueos vigentes. T034 continúa pendiente de decisión/prerrequisitos. |
| Quickstart/verificación/hoja de ruta 006/007 | Ensayar reproducción real y negativas de recursos propios; reportar acceso externo como limitación, no resultado ficticio de protección. Mantener carga, presupuesto y puertas operativas. |

Los documentos actuales siguen gobernados por constitución 1.2.1 y G-V005 no
pasado. Aprobar la propuesta no instala/emite/despliega nada: después debe
completarse diseño y análisis antes de implementar el ensayo en la aplicación.

## Registro de decisión pendiente

| Decisión | Estado / evidencia |
| --- | --- |
| Preparar propuesta y corregir índices/dependencias | Autorizado por «entonces has eso corrige»; realizada la preparación documental, sin adopción. |
| Aprobar texto de alcance y enmienda 2.0.0 | Pendiente del responsable, con este documento concreto disponible para revisión. |
| Cambia criterios de evaluación / validación del profesor | No determinado ni acreditado. Si aplica, obtener esa validación antes de adoptar o declarar aceptación académica. |
| Adopción efectiva / versión / reanálisis | No realizada. No cerrar C1/G-V005 por preparar esta propuesta. |
