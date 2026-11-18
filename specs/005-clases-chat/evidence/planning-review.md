# Revisión del diseño parcial — 005

2026-11-17, America/Lima. [Plan](../plan.md) en `feat/005-clases-chat`, desde el
merge `c24dcdb` del PR #5. Documentación de alcance/hoja de ruta pendiente guardada
primero en `b674c7f`; sin mezclarla con las correcciones de CI ya fusionadas.

## Entrega y límite

Diseño de sesiones/chat: investigación, modelo, contratos HTTP/Socket.IO/
integración/UI y guía de validación. No hay tareas, implementación, dependencias
instaladas, servicios iniciados, migraciones aplicadas, carga o recuperación nuevas.
Las rutas/modelos/scripts de clases están marcados como futuros.

**Plan completo no aprobado: ERROR G-V005.** Reproducción protegida carece de
mecanismo compatible demostrado; no sustituir DEC01 o aceptar iframe oculto.
US2/FR-008–009/SC-003 y cierre integral siguen pendientes. SC-002 conserva casos
de video, SC-007 el recorrido de emisión real y SC-008 capacidad medida/combinada.
El diseño independiente no traslada esas obligaciones al 007 ni cierra D07/D08.

Se aplicó [speckit-plan](../../../.agents/skills/speckit-plan/SKILL.md), que indica
«ERROR on gate failures or unresolved clarifications». Por ese límite se registra
el error, se entregan los artefactos independientes y no se declara completado el
flujo integral. La elección del proveedor vigente no demuestra cumplimiento.
No se pide permiso para contratar/desplegar o cambiar una obligación en este bloque.

## Revisión efectuada

- Setup de plan resolvió `specs/005-clases-chat`; feature lógica 005 y rama Git
  real `feat/005-clases-chat`. No había extensiones before_plan/after_plan.
- Lectura de constitución 1.2.1, spec y decisiones V01–V03, DEC01 y D07–D10/D13,
  patrones públicos y transaccionales de identidad/oferta/matrícula/materiales.
- Investigación documental de fuentes oficiales de YouTube, Socket.IO, SRS y
  Nginx; dos agentes de investigación por indicación explícita de la skill.
  Fuentes en [research](../research.md), sin ensayo real o selección nueva.
- Segunda revisión: explicitar no renovación por tickets automáticos, cursor de
  historial que no avance sincronización y edición de textos en estados terminales.
  Evitar promoción SHARE→UPDATE; re-proyectar ocultaciones y no guardar DTO original.
- Validación estructural: enlaces locales, FR/SC y escenarios preservados, cambios
  limitados a documentos autorizados; source/dependencias/CI/constitución y specs
  001–004 sin cambios frente a la base. Resultados en [JSON](planning-review.json).

No se ejecutan suites funcionales por una entrega documental. La CI exitosa del
PR #5 acredita su commit anterior; no acredita código del 005 ni esta planificación.
Las evidencias previas no se reescriben para actualizar sus hashes o resultados.

## Próximo bloque

Generar tareas de sesiones/chat, incluir G-V005 como bloqueo explícito de video
y aceptación, y realizar análisis de consistencia antes de implementar. Si el
análisis exige completar primero el diseño de video, conservar ese bloqueo sin
ejecutar tareas dependientes. No marcar el spec terminado con evidencia parcial.
Comparar opciones protegidas en un bloque posterior concreto si se decide retomarlo;
no cambiar proveedor por inercia al desplegar. D10/D13 mantienen sus propias puertas.
006/007 continúan solo como hoja de ruta, sin ramas/directorios/implementación.
