# Informe de sincronización documental

Revisión: **2026-10-22, America/Lima**. Fuente `feat/002-oferta-academica`,
`ecb1efe2b2d7fa63b1a73bcd35539e82ecfb4345`. Árbol inicial limpio; sin checkout de main,
reset, modificaciones de producto, migraciones ejecutadas o acceso a datos manuales.
El commit de entrega solo incorpora documentación, diagramas y sus utilidades de exportación.

La [referencia de estado](estado-documental.md) contiene inventario previsto/implementado/
verificado/pendiente y fuentes exactas. Se contrastaron constitución, README, ambos specs,
planes/modelos/contratos/tareas, evidencia de cierre y fundamentos, composición, entradas
HTTP/CLI, rutas web, reglas/adaptadores, esquema/migración y Compose. Los enunciados de
fase inicial conservados en specs/planes son históricos; no sustituyen código ni resultados.
No se modificaron reglas aprobadas, tareas o evidencias originales.

## Discrepancias corregidas y archivos

- Los ocho documentos de [análisis](01-analisis-de-sistema/01-actores.md) ya distinguen
  identidad con checkpoints de aceptación integral, oferta ADMIN parcial y dominios futuros.
  HU/RF/AC/RT/DA/R/EQ mantienen IDs, relaciones y condiciones de aceptación.
- Los cinco documentos de [arquitectura](02-arquitectura-software/estilo-arquitectonico.md)
  y tres de [diseño](03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md)
  describen monolito modular, capas/dependencias, interfaces públicas y SQL mínimo entre
  usuarios/oferta; correo ya funcional local con scheduler interno. Arquitectura inicial
  queda identificada como histórica de 2026-10-06.
- Los cuatro documentos [C4](04-modelo-c4/01-contexto-del-sistema.md), README, alcance y
  registro de decisiones enlazan el mismo corte. Se retiraron estados antiguos de pantalla
  «En preparación», Probe compuesto, identidad sin implementar, correo/worker pendientes,
  ausencia de cargas y recuperación nunca ensayada en las vistas vigentes.
- Oferta se limita a **002 T001–T029**: preparación administrativa real, diez rutas,
  cinco mutaciones y UI. Se explican curso/grupo, capacidad 1–50 frente a ocupación no
  calculada, horarios America/Lima y habilitación docente conforme PA-01–PA-05.
  Tipos/fixtures/estados/pruebas auxiliares no acreditan publicación ni consulta del alumno.
- Se actualizan los cinco editables originales y se añade arquitectura general:
  **6 Draw.io, 16 páginas, 16 PNG y 16 SVG**. C3 oferta/adquisición y C4 sesiones se
  dividen para lectura en diapositiva. [Índice y manifiesto](diagramas/README.md) enumeran
  cada página/exportación, leyendas, fronteras y reproducción sin red.

## Verificaciones de esta entrega

Se reutilizó evidencia válida de [001 T106](../specs/001-identidad-acceso-roles/evidence/regression.md)
y [002 T028/T029](../specs/002-oferta-academica/evidence/t028-t029.md), con sus fuentes
y alcances separados. No se ejecutó una nueva regresión funcional ni pruebas de carga:
no hubo cambios de implementación que las justificaran.

Se comprobaron **363 enlaces locales y 10 anclas**, sin errores, en README y todos los Markdown de docs; imágenes,
XML de todas las páginas, IDs/extremos de conectores, títulos XML/SVG y PNG 1600 × 900.
Exportación mediante `python docs/diagramas/exportar.py`: ajuste de texto aprobado y
cero cruces de conectores con nodos ajenos. Render final con
`node docs/diagramas/renderizar.mjs` y Chromium headless: **16/16 imágenes**.
Revisión visual de cada página y conjunto final: texto/leyenda, recortes, solapamientos,
fronteras, asociación de flechas y consistencia de nombres/estados. Se corrigieron
etiquetas invasivas, el cruce de reproducción con SQL y fronteras demasiado cortas.
No quedan exportaciones ni imágenes pendientes de inspección; no se ensayó la UI de
Draw.io Desktop. Revisión de diff y `git diff --check` sin errores.

## Pendientes y preparación de la exposición

**Documentación lista para construir el PPT; todavía no se creó.** Explicar durante la
exposición que implementación local, verificación automatizada y aceptación son estados
distintos: 001 conserva **T104/T108**; 002 conserva **T030–T074**, publicación/ciclo,
catálogo alumno y lectura docente. La preparación actual no completa SC-001 de oferta.

Bootstrap histórico sigue abierto; aceptación con diez personas y SC-002 humano de oferta
pendientes. Capacidad de **1000 concurrentes sin aprobar**, con cargas de identidad
ejecutadas e incumplimientos conservados; VPS/nuevas cargas completas aplazados hasta
matrícula y rúbrica D10 pendiente. SMTP real, Izipay, video/protección, Socket.IO,
materiales y paneles completos sin integración verificada. D04 y matrícula de D06
siguen abiertas. V16 demuestra recuperación local de identidad, no de oferta integrada;
D13 custodia/responsables/objetivos operativos pendientes, purga CLI sin programación.
