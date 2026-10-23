# 02. Historias de usuario

> Actualizado 2026-10-23: [requisitos RC, decisiones RA y escenarios RE](../planificacion/reservas-capacidad.md).

Estas HU organizan el
[alcance vigente](../alcance-mvp.md); no sustituyen los criterios de aceptación de
[identidad](../../specs/001-identidad-acceso-roles/spec.md). Los IDs HU01–HU17 pertenecen
a esta síntesis de todo el MVP; US1–US7 (nombres usados por plan/tareas para las historias
1–7 de spec.md) y FR-001–FR-033 identifican el detalle del incremento de identidad.
No son cantidades contradictorias ni se suman para calcular un total de funcionalidades.
Identidad conserva checkpoints funcionales; aceptación integral T104/T108 pendiente.
Oferta 002 está en desarrollo hasta T038; las funciones siguientes siguen previstas.

| ID | Historia | Origen y madurez |
| --- | --- | --- |
| HU01 | Como visitante, quiero registrarme como alumno y verificar mi correo, para disponer de una cuenta habilitada. | Identidad US2; especificada. |
| HU02 | Como alumno, docente o administrador, quiero iniciar y cerrar mi sesión, para acceder de forma controlada a mis operaciones. | Identidad US1; especificada. |
| HU03 | Como titular de una cuenta activa y verificada, quiero recuperar mi contraseña por correo, para volver a acceder sin conservar accesos anteriores. | Identidad US7; especificada. |
| HU04 | Como alumno, docente o administrador, quiero consultar mi perfil y mi inicio según mi rol, para reconocer mi cuenta y sus acciones disponibles. | Identidad US3; especificada; inicio mínimo, sin indicadores académicos/financieros. |
| HU05 | Como administrador, quiero gestionar cuentas y su único rol, para habilitar o retirar accesos conservando evidencia de mis acciones. | Identidad US4; especificada. |
| HU06 | Como responsable del entorno, quiero inicializar una sola vez al primer administrador, para habilitar la gestión sin un registro público privilegiado. | Identidad US6; especificada. |
| HU07 | Como alumno, docente o administrador, quiero que mis operaciones y datos privados estén protegidos, para evitar accesos fuera de los permisos vigentes. | Identidad US5; especificada para cuentas. Extensión académica pendiente. |
| HU08 | Como alumno, quiero consultar cursos, grupos, horarios y capacidad máxima, para comparar oferta publicada. | Spec 002 en desarrollo; capacidad configurada distinta de disponibilidad real, sin reserva implícita. |
| HU09 | Como administrador, quiero gestionar cursos, grupos, horarios y capacidad, para organizar y publicar la oferta académica. | Spec 002, PA-01–PA-05; T038 verificada, UI/cierre pendientes, cancelación no define efectos de matrícula. |
| HU10 | Como alumno, quiero reservar un cupo antes de pagar y tramitar una orden con precios/conceptos fiables, para conservar esa reserva durante 24 h exactas desde confirmación del servidor. | Confirmado RC-03/04; selección/reserva conjunta de varios cursos y pago total siguen pendientes D01/D04. No implementada. |
| HU11 | Como alumno, quiero que el pago verificado confirme mi matrícula y que el vencimiento sin pago libere el cupo mediante conciliación consistente. | Confirmado RC-05/06; pagos al límite/tardíos, cancelación y reembolsos requieren RA-03–RA-05; integración Izipay pendiente. |
| HU12 | Como alumno matriculado, quiero acceder a los materiales autorizados de mis cursos, para estudiar los contenidos que me corresponden. | Alcance: materiales; prevista, D03/D12. |
| HU13 | Como docente, quiero disponer de una operación autorizada para publicar materiales de mis cursos, para entregar recursos de estudio a mis alumnos. | Descomposición propuesta del área materiales; permisos, formatos, almacenamiento y publicación pendientes D12. |
| HU14 | Como docente, quiero emitir una clase para mis grupos autorizados, para impartir enseñanza en vivo. | Alcance: clases; prevista, viabilidad D07 y permisos D08. |
| HU15 | Como alumno matriculado, quiero reproducir una clase autorizada, para seguir la explicación del docente en vivo. | Alcance: video; prevista, D03/D07/D08. |
| HU16 | Como alumno matriculado, quiero participar por chat en mi clase, para comunicar mis preguntas durante la emisión. | Alcance: chat; prevista. Sin audio, cámara ni pantalla del alumno. |
| HU17 | Como alumno, docente o administrador, quiero consultar un panel básico con mis operaciones autorizadas, para encontrar las acciones de mi actividad académica. | Alcance: paneles; prevista, datos/acciones pendientes D12. Se distingue del inicio mínimo HU04. |

Las HU09 y HU13 explicitan actores de trabajo para necesidades del MVP sin cerrar su
matriz de permisos. Deben validarse en la especificación de esos dominios antes de
implementarse. No se añaden exámenes, certificados, grabaciones ni aplicaciones nativas.
La relación con los requisitos se mantiene en la [matriz HU ↔ RF](03-requisitos-funcionales.md#relación-hu-y-rf).
