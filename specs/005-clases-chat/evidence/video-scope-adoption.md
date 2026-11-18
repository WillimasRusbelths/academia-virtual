# Adopción del alcance audiovisual V05 — 005

2026-11-17, America/Lima. **APROBADO POR EL RESPONSABLE / ADOPTADO EN DOCUMENTOS.**
Respuesta expresa: «entoces la apruebo», después de presentar la propuesta
concreta y recomendar su aprobación para el ensayo MVP.

La [propuesta revisada](video-scope-proposal.md) se conserva íntegra en su estado
de borrador previo; su versión aprobada está en el commit `2486034`. Este registro
posterior actualiza su estado sin reescribir qué se había presentado o aprobado.
No se registran nombres/correos ni aprobación del profesor no comunicada.

## Alcance adoptado

- Ensayo YouTube Live + OBS con contenido de prueba autorizado.
- Academia verifica sesión/cuenta/rol/clase/matrícula o responsabilidad vigente
  en aula, referencia y chat. Materiales/finanzas mantienen sus permisos.
- La referencia externa puede compartirse; perder acceso al aula no acredita
  revocar reproducción en YouTube. Aviso visible y evidencia real de ese límite.
- Responsable gestiona referencia en Academia y opera inicio/detención en YouTube
  manualmente. No hay OAuth, streamKeys en aplicación o control implícito de cuenta ajena.
- Cloudflare y protección multimedia completa quedan fuera del MVP/005/006/007;
  antes de ofrecer un incremento como protegido, conserva la obligación de acceso
  directo/vencido autorizado y control efectivo del emisor.

## Enmienda y estados separados

Constitución 1.2.1 → **2.0.0**, MAJOR por redefinir obligación del ensayo. Se adoptó
el texto exacto del principio VIII aprobado y se sincronizaron orientación de
tecnología y medición de video. I–VII, IX–XI y ratificación 2026-09-22 intactos.
La última modificación constitucional pasa a 2026-11-17. Informe temporal revisado
y retirado antes de commit, sin modificar plantillas de Spec Kit.

| Elemento | Estado real |
| --- | --- |
| Aprobación del responsable | Comunicada expresamente sobre el texto concreto |
| Adopción interna de alcance/constitución | Aplicada; no es aceptación de producto o evaluación |
| Profesor / impacto en evaluación | No comunicado. Si cambia criterios de evaluación, validar con el profesor antes de declarar aceptación académica del cambio |
| Implementación, emisión/reproducción, observación humana | No ejecutadas en esta pasada |
| D07/D08 del ensayo | Pendientes de evidencia real; no se cierran por la enmienda |
| Protección multimedia completa | Fuera del MVP, sin proveedor/contratación/capacidad aprobados |
| D02/D10/D13 y tareas heredadas | Conservan sus condiciones y pendientes |

La decisión del responsable permite sincronizar el alcance y preparar su
implementación; no inventa validación académica, evidencia de reproducción o
autorización para comprar, emitir, publicar o migrar una BD real.

## Sincronización realizada

Spec conserva 4 historias/24 escenarios/23 FR/8 SC. Se aplicaron los reemplazos
aprobados FR-005/006/008/009/021/023 y SC-002/003/007, los siete escenarios US2 y
fronteras de controles propios/externos. Otros FR/SC e historias no cambian.
RF16/RT08/DA03/DEC01/AC04 y escenarios generales se alinean al ensayo actual sin
alterar specs cerrados o sus resultados. La hoja de ruta conserva 15.000 cuentas,
2.500 activos y presupuesto S/300; no se crearon specs/ramas 006/007.

Se completó el diseño documental de [referencia/player](../contracts/video.md),
incluyendo permisos, revisión/ledger, no SSRF, CSP/origin/referer, player tardío y
operación manual. [Modelo](../data-model.md), plan/research, HTTP/UI/integración,
guía y tareas reflejan ese contrato. La documentación es revisable; no se cuenta
como código instalado, migración o reproducción real. T001–T086 siguen sin completar.

T034 verifica aprobación contra matriz antes de código. T035 verifica el contrato
ya redactado. T036 prepara pruebas/protocolo; T037 implementa API/referencia;
T038 player y CSP; T039 ejecuta controles y ensayo real; T040 acepta el alcance
probado. US3 puede avanzar tras T033 sin esperar cuenta/señal externas. T084 no
espera participantes, pero T086 sigue exigiendo humanos y las puertas aplicables.

## Comprobación y límites

[Resultados estructurales](video-scope-adoption-results.json) y
[índice actual de cobertura](tasks-coverage.json) se generan con:

```powershell
node ops/specs/validate-005-tasks.mjs --write
node ops/specs/validate-005-tasks.mjs
git diff --check
```

El validador conserva los diez casos de regresión del parser y comprueba
referencias, dependencias, alcance aprobado, principio exacto y preservación de
historia/código. Es comprobación documental; no suite de aplicación ni emisión.
Los informes de planificación/generación/corrección previos son checkpoints
inmutables y pueden describir la constitución 1.2.1 o el bloqueo que existía entonces.

Después de guardar esta sincronización se hará análisis `speckit-analyze` de solo
lectura sobre los documentos actuales. Este registro no anticipa su conclusión.
El próximo bloque técnico independiente es T001–T004.
