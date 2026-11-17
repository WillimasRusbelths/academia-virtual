# 02. Historias de usuario

> Actualizado 2026-11-15 (T087): [requisitos RC, decisiones RA y escenarios RE](../planificacion/reservas-capacidad.md).

Estas HU organizan el
[alcance vigente](../alcance-mvp.md); no sustituyen los criterios de aceptación de
[identidad](../../specs/001-identidad-acceso-roles/spec.md). Los IDs HU01–HU17 pertenecen
a esta síntesis de todo el MVP; US1–US7 (nombres usados por plan/tareas para las historias
1–7 de spec.md) y FR-001–FR-033 identifican el detalle del incremento de identidad.
No son cantidades contradictorias ni se suman para calcular un total de funcionalidades.
Identidad conserva checkpoints funcionales; aceptación integral T104/T108 pendiente.
Oferta 002 tiene cuatro historias implementadas con T068/T069 locales; T073/T074
siguen pendientes. El [núcleo 003/T084](../../specs/003-reservas-ordenes-matricula/evidence/acceptance.md)
está implementado y verificado localmente; proveedor, humanos integrados y operación
conservan sus puertas. Los US de cada spec son identificadores locales a ese incremento.

| ID | Historia | Origen y madurez |
| --- | --- | --- |
| HU01 | Como visitante, quiero registrarme como alumno y verificar mi correo, para disponer de una cuenta habilitada. | Identidad US2 implementada y verificada localmente con Mailpit; SMTP real y aceptación integral pendientes. |
| HU02 | Como alumno, docente o administrador, quiero iniciar y cerrar mi sesión, para acceder de forma controlada a mis operaciones. | Identidad US1 implementada y verificada localmente; sin acreditar capacidad concurrente global. |
| HU03 | Como titular de una cuenta activa y verificada, quiero recuperar mi contraseña por correo, para volver a acceder sin conservar accesos anteriores. | Identidad US7 implementada y verificada localmente; correo capturado en Mailpit. |
| HU04 | Como alumno, docente o administrador, quiero consultar mi perfil y mi inicio según mi rol, para reconocer mi cuenta y sus acciones disponibles. | Identidad US3 implementada y verificada localmente; inicio mínimo, sin panel académico completo. |
| HU05 | Como administrador, quiero gestionar cuentas y su único rol, para habilitar o retirar accesos conservando evidencia de mis acciones. | Identidad US4 implementada y verificada localmente, con revocación, auditoría y protección del último administrador. |
| HU06 | Como responsable del entorno, quiero inicializar una sola vez al primer administrador, para habilitar la gestión sin un registro público privilegiado. | Identidad US6 con CLI y checkpoint local; intermitencia histórica de bootstrap aún pendiente. |
| HU07 | Como alumno, docente o administrador, quiero que mis operaciones y datos privados estén protegidos, para evitar accesos fuera de los permisos vigentes. | Identidad US5 implementada; permisos de oferta y propiedad financiera 003 verificados localmente. Materiales/video/chat pendientes. |
| HU08 | Como alumno, quiero consultar cursos, grupos, horarios y capacidad máxima, para comparar oferta publicada. | Oferta 002 implementada y verificada localmente, con capacidad configurada 1–50. Catálogo /oferta sin disponibilidad calculada; inventario real en /reservar pertenece a 003. T073/T074 pendientes. |
| HU09 | Como administrador, quiero gestionar cursos, grupos, horarios y capacidad, para organizar y publicar la oferta académica. | Oferta 002, PA-01–PA-05/E1 implementadas y verificadas localmente. 003 añade guardas ante compromisos/incidencias; mantiene historial y coordinación sin redefinir el contrato de catálogo. |
| HU10 | Como alumno, quiero reservar un cupo antes de pagar y tramitar una orden con precios/conceptos fiables, para conservar esa reserva durante 24 h exactas desde confirmación del servidor. | 003 US1/US3 implementadas y verificadas localmente: selección conjunta, precio PEN conservado, orden/pago total, prioridad servidor, elegibilidad y conflictos efectivos propios; contiguos permitidos. Una orden con reservas vigentes y un grupo por curso. Sin modificación/cancelación voluntaria; nueva intención tras vencer sin sanción/espera por abandono. T042 humana favorable en computador; sin aceptación humana integrada. |
| HU11 | Como alumno, quiero que el pago verificado confirme mi matrícula y que el vencimiento sin pago libere el cupo mediante conciliación consistente. | 003 US2/US3/US4: conciliación, conversión atómica, vencimiento, historial original y seguimiento implementados/verificados localmente con pagos simulados en tests. Oferta oculta pausa pago/confirmación sin renovar plazo ni revocar matrículas previas. Izipay real T056–T059/D02, economía y T089/T094 pendientes; sin cobros reales ni resolución económica manual. |
| HU12 | Como alumno matriculado, quiero acceder a los materiales autorizados de mis cursos, para estudiar los contenidos que me corresponden. | Alcance: materiales; prevista, D03/D12. |
| HU13 | Como docente, quiero disponer de una operación autorizada para publicar materiales de mis cursos, para entregar recursos de estudio a mis alumnos. | Descomposición propuesta del área materiales; permisos, formatos, almacenamiento y publicación pendientes D12. |
| HU14 | Como docente, quiero emitir una clase para mis grupos autorizados, para impartir enseñanza en vivo. | Alcance: clases; prevista, viabilidad D07 y permisos D08. |
| HU15 | Como alumno matriculado, quiero reproducir una clase autorizada, para seguir la explicación del docente en vivo. | Alcance: video; prevista, D03/D07/D08. |
| HU16 | Como alumno matriculado, quiero participar por chat en mi clase, para comunicar mis preguntas durante la emisión. | Alcance: chat; prevista. Sin audio, cámara ni pantalla del alumno. |
| HU17 | Como alumno, docente o administrador, quiero consultar un panel básico con mis operaciones autorizadas, para encontrar las acciones de mi actividad académica. | Alcance: paneles; prevista, datos/acciones pendientes D12. Se distingue del inicio mínimo HU04. |

HU09 aplica los permisos aprobados de oferta 002; HU13 conserva pendiente la matriz
de publicación de materiales D12. Cada nuevo dominio debe definir sus permisos antes
de implementarse. No se añaden exámenes, certificados, grabaciones ni aplicaciones nativas.
La relación con los requisitos se mantiene en la [matriz HU ↔ RF](03-requisitos-funcionales.md#relación-hu-y-rf).

Fuentes de verificación: [identidad T106](../../specs/001-identidad-acceso-roles/evidence/regression.md),
[oferta T068](../../specs/002-oferta-academica/evidence/automated.md),
[matrícula T084](../../specs/003-reservas-ordenes-matricula/evidence/acceptance.md) y
[restore T086](../../specs/003-reservas-ordenes-matricula/evidence/recovery.md).
Los resultados humanos siguen separados: 001/T104/T108 y 002/T073–T074 pendientes;
003/T042 favorable en computador, T083/T089/T094 pendientes.
