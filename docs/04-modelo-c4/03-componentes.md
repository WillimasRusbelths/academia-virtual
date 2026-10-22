# Componentes C3 del backend

## Alcance

Estas vistas amplían APP02 del nivel C2. El texto y el catálogo se contrastan hasta T058: fundamentos implementados y checkpoints US1/US2/US6 comprobados, sin completar identidad. Se conservan los identificadores; las flechas describen colaboración o ensamblaje, no imports. Las imágenes mantienen estados anteriores, señalados a continuación.

## Mapa general

![Mapa general de componentes del backend](../diagramas/imagenes/c4-componentes-mapa-general.png)

**Alcance temporal de la imagen:** C06 “ejecutor pendiente”, C07 “previsto” y C08 “integración funcional pendiente” corresponden a un estado anterior a T024. Consultar el catálogo actualizado hasta T058; editable y PNG pendientes de actualización.

Es un catálogo visual de responsabilidades y estados de C01–C10 y C12–C19. Las relaciones se desarrollan en la vista de identidad y las páginas complementarias del editable.

## C3 de identidad y acceso

![C3 del backend: identidad y acceso](../diagramas/imagenes/c4-componentes-identidad-acceso.png)

**Alcance temporal de la imagen:** sus conexiones REST, programación/cuotas/entregas y SMTP de ensayo aún figuran como previstas; ya están comprobadas en el alcance de US1/US2/US6. Debe actualizarse y reexportarse, conservando SMTP de producción como pendiente.

C01 invoca casos de uso de C03; la consulta propia pasa por C05 y C04. Las rutas públicas no exigen una sesión previa. C03 utiliza cuotas/persistencia y programa entregas atómicas; C06 las procesa fuera de HTTP hacia Mailpit. C07 aporta auditoría de bootstrap y registros privados. La web, PostgreSQL y proveedores siguen fuera de APP02; esta vista es parcial, no un flujo completo de cada historia.

## Pendientes

- Administración, recuperación, US3/US5 completas y módulos académicos pendientes; C03/C04/C06/C07/C11 permanecen parciales. Retención/purga, restauración y aceptación transversal conservan sus tareas finales.
- C11 ejecuta bootstrap comprobado fuera de HTTP; invalidación tras restaurar pendiente. C06 tiene ejecutor interno, sin worker separado; Mailpit acredita captura funcional local, no correo de producción.
- Izipay, video/control de acceso y 1000 concurrentes sin validar; no hay conexión de control backend–YouTube.
- Actualizar las páginas “Mapa general de componentes”, “C3 del backend · Identidad y acceso”, “3 - Composicion y salud” y “4 - Correo y auditoria” del editable. Las páginas 5–7 conservan diseño académico previsto, pero deben corregir su pie común “sin historias completas”. Solo las dos primeras tienen PNG incrustados aquí.

## Referencias

- [Editar las vistas en Draw.io](../diagramas/c4-componentes.drawio): mapa general, identidad y detalles complementarios.
- [Catálogo de componentes](../02-arquitectura-software/componentes-arquitectonicos.md): responsabilidades, relaciones, trazabilidad y fuentes del estado.
- Checkpoints funcionales: [US1](../../specs/001-identidad-acceso-roles/evidence/us1.md), [US2](../../specs/001-identidad-acceso-roles/evidence/us2.md) y [US6](../../specs/001-identidad-acceso-roles/evidence/us6.md); límites finales en [verificación](../../specs/001-identidad-acceso-roles/verification.md).
