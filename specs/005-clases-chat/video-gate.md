# G-V005 — decisión y prueba temprana de video protegido

2026-11-17, America/Lima. **NO PASADO / BLOQUEANTE para aceptar reproducción como
video protegido y para el cierre integral de 005.** Documento de planificación;
ningún ensayo ejecutado. No impide preparar el ensayo separado de YouTube.

DEC01/DA03 mantiene YouTube Live + OBS. El principio VIII y FR-008/009 exigen
autorización vigente en solicitudes directas, vencimiento y control del emisor
anterior. La [viabilidad inicial](video-feasibility.md) y la
[investigación](research.md) no acreditan una integración que lo cumpla.

La [propuesta de alcance del ensayo](evidence/video-scope-proposal.md) ya contiene
texto concreto para principio VIII, FR/SC y escenarios afectados, e impacto en
plan/contratos/tareas. Está **preparada, no adoptada**: la autorización para redactar
y corregir no se registra como aprobación de una enmienda aún no revisada.
Esta preparación no cambia el estado NO PASADO de G-V005 ni habilita el adaptador.

## Opciones revisables

**Aclaración V04 del responsable**: YouTube será la integración de prueba del MVP;
Cloudflare se contempla después, fuera del MVP. No añadir Cloudflare ni otro
gestor como requisito de 005/006/007. Las opciones de esta tabla se conservan como
investigación, no como selección necesaria antes de probar YouTube. Un ensayo
aislado/autorizado puede acreditar reproducción y recorrido observado, manteniendo
la limitación de protección identificada y sin cerrar SC-003 por esa sola prueba.

| Opción | Estado y decisión necesaria |
| --- | --- |
| Mecanismo permitido de YouTube que cumpla las condiciones | No identificado; demostrar antes de adoptar. Un iframe oculto no basta. |
| Distribuidor externo con autorización propia en cada entrega | Sin proveedor/cotización; probar origen, caché y revocación, no solo TTL firmado. Revisar DEC01. |
| OBS → SRS → HLS con origen privado y autorización propia | Alternativa condicional, no adoptada. Revisar DEC01 y medir recursos/tráfico/costo. El VPS atendería video. |
| Enlace oculto con protección menor | Cambia una obligación: requiere proceso de enmienda y aprobación del responsable/profesor cuando afecte evaluación. Fuera de esta decisión técnica. |

**Dirección actual tras V04**: preparar la prueba de YouTube y avanzar sesiones/chat,
separando evidencia de reproducción de protección pendiente. Evaluar Cloudflare
después del MVP; no contratarlo o implementarlo en esta secuencia. La propuesta
SRS de la constitución tampoco sustituye automáticamente DEC01.

## Evidencia que abre la puerta

1. Mecanismo compatible y decisión registrados; aprobación correspondiente si
   cambia DEC01. Ninguna rebaja implícita de RF16 o principio VIII.
2. Entorno/cuenta emisora autorizados, contenido ficticio y secretos fuera de Git;
   no compartir credenciales personales con el agente.
3. Emisión real del responsable actual y reproducción en navegador autorizado;
   distinguir clase en curso, señal disponible y reproducción observada.
4. Solicitudes directas de manifiesto maestro/variantes, segmentos, inicialización
   y claves si las hubiera: vigente permitido; visitante, ajeno y sin matrícula
   denegados. Cubrir origen alternativo, redirecciones y cachés.
5. Referencia obtenida antes del fin original: repetir inmediatamente antes,
   en el instante y después. Revocar sesión/cuenta con reproductor abierto.
   Un token de larga vida o autorización positiva cacheada no basta.
6. Finalizar clase o cancelar grupo impide nuevas entregas. Reasignar/deshabilitar
   docente inutiliza su credencial antigua y corta su emisión ya abierta; no basta
   validar al conectar. El responsable actual no hereda secretos anteriores.
7. Registrar versión/configuración saneada, duración, calidad/bitrate, emisiones y
   consumidores reales, reproducción fluida frente a descarga, latencia/fallos,
   tráfico/recursos y costo frente a S/300 total. No extrapolar a 2.500 activos.

El ensayo precede a comprometer la implementación concreta de video y puede
requerir un prototipo aislado autorizado. Esta pasada solo define el ensayo.
No contrata infraestructura ni publica contenido o aplicación.

## Mientras sigue bloqueado

- `VideoAccess` responde `NOT_CONFIGURED` después de autorizar la clase. No entrega
  URL, token o credencial de emisión. Recurso ajeno sigue en 404.
- UI: reproducción no habilitada, sin iframe/enlace anunciado como protegido.
- Dobles solo en pruebas marcadas como simulación. Gestión/chat tienen evidencia
  independiente; US2/SC-003/D07/D08 y cierre integral siguen pendientes.
- SC-002 no se cierra sin sus accesos de video; SC-007 conserva el recorrido de
  emisión real y SC-008 la capacidad medida/combinada, aunque el chat local pase.
- Contrato concreto de emisión/segmentos se completa y analiza después de resolver
  mecanismo; no publicar uno ficticio como contrato definitivo.
