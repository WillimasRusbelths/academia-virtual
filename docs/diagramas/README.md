# Diagramas de la arquitectura vigente

Corte de código: `ecb1efe`, rama `feat/002-oferta-academica`, 2026-10-22.
La [referencia documental](../estado-documental.md) define estado y evidencia; las
reglas se mantienen en ambos specs. El [informe](../informe-sincronizacion-2026-10-22.md)
registra esta revisión. La arquitectura inicial de 2026-10-06 permanece histórica.

**I · azul**: implementado dentro del alcance rotulado. **P · ámbar**: parcial, con
funciones pendientes explícitas. **F · gris**: futuro, sin función de producto disponible.
Estos estados no equivalen a aceptación integral ni capacidad aprobada. Las relaciones
continuas son colaboraciones actuales; discontinuas, previstas. Las flechas C4 de código
expresan uso y realización de interfaz (discontinua con triángulo hueco), según su leyenda.
En composición, «ensambla» indica conexión al iniciar, no tráfico de una petición.

Se mantienen A01–A05, APP01/APP02, AL01/AL02, E01–E04 y C01–C19 entre niveles.
Mailpit E03 es apoyo local; E02 es correo real pendiente. Las fronteras son del sistema
en C2 y del backend APP02 en C3; CLI C11 queda fuera del proceso HTTP. No se identifica
cada capa/módulo con un servicio Docker. El catálogo de componentes no dibuja todas
las relaciones; sus detalles amplían la misma frontera en C3.

| Editable | Páginas / alcance | Exportaciones |
| --- | --- | --- |
| [Arquitectura general](arquitectura-general.drawio) | 1 · colaboración por capas y módulos | [PNG](imagenes/arquitectura-general.png), [SVG](imagenes/arquitectura-general.svg) |
| [Componentes arquitectónicos](componentes-arquitectonicos.drawio) | 1 · mapa de responsabilidades; detalle en C3 | [PNG](imagenes/componentes-arquitectonicos.png), [SVG](imagenes/componentes-arquitectonicos.svg) |
| [C1](c4-contexto-del-sistema.drawio) | 2 · funcional y apoyo operativo/local | [Funcional](imagenes/c4-contexto-del-sistema.png), [apoyo](imagenes/c4-contexto-apoyo.png) |
| [C2](c4-contenedores.drawio) | 2 · aplicaciones/almacenes y apoyo local | [Aplicaciones](imagenes/c4-contenedores.png), [apoyo](imagenes/c4-contenedores-apoyo.png) |
| [C3](c4-componentes.drawio) | 8 · mapa, identidad, composición, correo, preparación de oferta, adquisición, acceso/chat, paneles | [Índice de vistas](../04-modelo-c4/03-componentes.md) |
| [C4](c4-codigo-sesiones.drawio) | 2 · contratos/consumidor y adaptador/reglas de sesiones existentes | [Contratos](imagenes/c4-codigo-sesiones.png), [adaptador](imagenes/c4-codigo-adaptador.png) |

Las **16 páginas** tienen PNG y SVG: correspondencia exhaustiva por nombre de página
en [manifest.json](imagenes/manifest.json). Formato 1600 × 900 (16:9), sin fondos
externos, texto de nodos de 21 px y leyendas de 18–21 px. Para PPT se recomienda una
vista por diapositiva, preferentemente SVG; detalles C3 y C4 evitan reducir un diagrama
denso para intentar mostrar todo a la vez. La revisión incluye páginas complementarias.

Para regenerar desde los editables:

```powershell
python docs/diagramas/exportar.py
node docs/diagramas/renderizar.mjs
```

El exportador lee XML Draw.io sin comprimir y genera SVG estándar con el subconjunto
usado aquí: texto plano, cajas y conectores ortogonales con puertos/waypoints. Comprueba
ajuste vertical de texto y cruces de conectores con nodos ajenos. Requiere Python/Pillow
y Arial en Windows; el render usa Playwright/Chromium ya instalado en el proyecto.
No requiere Draw.io Desktop ni red. SVG/PNG son derivados del XML, no capturas de una
versión diferente; los PNG se revisaron también reducidos a tamaño de diapositiva.

[generar.py](generar.py) conserva la construcción inicial de estos editables. Ejecutarlo
sobrescribe sus páginas; después de editar manualmente en Draw.io, usar solo exportar
y renderizar para conservar el trabajo. Si se incorporan formas/estilos nuevos, ampliar
el exportador o exportar directamente desde Draw.io y volver a revisar visualmente.
No se ha probado la interfaz de Draw.io Desktop; sí se validaron XML, elementos,
puertos, texto y todas las exportaciones locales. No quedan imágenes sin inspección.
