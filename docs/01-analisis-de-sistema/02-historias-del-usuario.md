# 02. Historias de usuario

Estas HU organizan el
[alcance vigente](../alcance-mvp.md); no sustituyen los criterios de aceptación de
[identidad](../../specs/001-identidad-acceso-roles/spec.md). Los IDs HU01–HU17 pertenecen
a esta síntesis de todo el MVP; US1–US7 (nombres usados por plan/tareas para las historias
1–7 de spec.md) y FR-001–FR-033 identifican el detalle del incremento de identidad.
No son cantidades contradictorias ni se suman para calcular un total de funcionalidades.
[Estado vigente y evidencia](../estado-documental.md): HU01–HU07 implementadas con checkpoints de identidad; HU09 parcial; HU08 y HU10–HU17 pendientes. Identidad no tiene aceptación integral. En 002, US1–US4 y FR-001–016 refinan oferta, con numeración propia.

| ID | Historia | Origen y madurez |
| --- | --- | --- |
| HU01 | Como visitante, quiero registrarme como alumno y verificar mi correo, para disponer de una cuenta habilitada. | Identidad US2; implementada y comprobada en su checkpoint 001. |
| HU02 | Como alumno, docente o administrador, quiero iniciar y cerrar mi sesión, para acceder de forma controlada a mis operaciones. | Identidad US1; implementada y comprobada en su checkpoint 001. |
| HU03 | Como titular de una cuenta activa y verificada, quiero recuperar mi contraseña por correo, para volver a acceder sin conservar accesos anteriores. | Identidad US7; implementada y comprobada en su checkpoint 001. |
| HU04 | Como alumno, docente o administrador, quiero consultar mi perfil y mi inicio según mi rol, para reconocer mi cuenta y sus acciones disponibles. | Identidad US3; implementada y comprobada en 001; inicio mínimo, sin indicadores académicos/financieros. |
| HU05 | Como administrador, quiero gestionar cuentas y su único rol, para habilitar o retirar accesos conservando evidencia de mis acciones. | Identidad US4; implementada y comprobada en su checkpoint 001. |
| HU06 | Como responsable del entorno, quiero inicializar una sola vez al primer administrador, para habilitar la gestión sin un registro público privilegiado. | Identidad US6; implementada y comprobada en su checkpoint 001. |
| HU07 | Como alumno, docente o administrador, quiero que mis operaciones y datos privados estén protegidos, para evitar accesos fuera de los permisos vigentes. | Identidad US5 implementada y comprobada para cuentas. Preparación ADMIN comprobada en 002; demás lecturas académicas pendientes. |
| HU08 | Como alumno, quiero consultar cursos, grupos, horarios y cupos, para elegir una oferta compatible con mis necesidades. | 002 US2/US4, PA-01–PA-05 aprobadas; consulta alumno/docente pendiente. D04 y matrícula de D06 abiertas. |
| HU09 | Como administrador, quiero gestionar cursos, grupos, horarios y cupos, para organizar la oferta académica. | 002 US1/US3/US4; preparación ADMIN implementada T019–T029, checkpoint T030 pendiente; ciclo editorial pendiente. |
| HU10 | Como alumno, quiero seleccionar varios cursos y revisar los conceptos y el total de mi orden, para conocer qué adquiriré y cuánto debo pagar. | Alcance: órdenes; prevista, D01/D04/D06. |
| HU11 | Como alumno, quiero pagar mi orden y conocer el resultado verificado, para obtener las matrículas correspondientes a mi compra. | Alcance: pago/matrícula; prevista. Un pago por orden es propuesta D01; Izipay elegida D02. |
| HU12 | Como alumno matriculado, quiero acceder a los materiales autorizados de mis cursos, para estudiar los contenidos que me corresponden. | Alcance: materiales; prevista, D03/D12. |
| HU13 | Como docente, quiero disponer de una operación autorizada para publicar materiales de mis cursos, para entregar recursos de estudio a mis alumnos. | Descomposición propuesta del área materiales; permisos, formatos, almacenamiento y publicación pendientes D12. |
| HU14 | Como docente, quiero emitir una clase para mis grupos autorizados, para impartir enseñanza en vivo. | Alcance: clases; prevista, viabilidad D07 y permisos D08. |
| HU15 | Como alumno matriculado, quiero reproducir una clase autorizada, para seguir la explicación del docente en vivo. | Alcance: video; prevista, D03/D07/D08. |
| HU16 | Como alumno matriculado, quiero participar por chat en mi clase, para comunicar mis preguntas durante la emisión. | Alcance: chat; prevista. Sin audio, cámara ni pantalla del alumno. |
| HU17 | Como alumno, docente o administrador, quiero consultar un panel básico con mis operaciones autorizadas, para encontrar las acciones de mi actividad académica. | Alcance: paneles; prevista, datos/acciones pendientes D12. Se distingue del inicio mínimo HU04. |

HU09 tiene matriz aprobada en 002 PA-01; HU13 conserva permisos de materiales pendientes de especificación. No se añaden exámenes, certificados, grabaciones ni aplicaciones nativas.
La relación con los requisitos se mantiene en la [matriz HU ↔ RF](03-requisitos-funcionales.md#relación-hu-y-rf).
