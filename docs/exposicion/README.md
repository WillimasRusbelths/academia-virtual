# Exposición de Academia Virtual

[Abrir PowerPoint](academia-virtual-arquitectura.pptx) ·
[Vista general](render/vista-general.png) · [Guion y fuentes](notas-presentador.md)

**16 diapositivas principales, 16:9, aproximadamente 15 minutos**, sin contar preguntas.
Las notas contienen explicación, transición, preguntas posibles y referencias por
diapositiva. Los 900 segundos son una pauta de ensayo, no una duración humana medida.

Referencia documental: commit `542c341`, código de referencia `ecb1efe`, rama
`feat/002-oferta-academica`. El estado local al iniciar coincidía con `542c341` y estaba
limpio. Se conservaron reglas, tareas, evidencia y fuentes originales. No se ejecutaron
regresiones funcionales ni cargas para preparar la presentación.

Textos, diagramas, líneas y cuadros/tablas de la exposición son **formas editables de
PowerPoint**. No hay diapositivas rasterizadas. Las selecciones de arquitectura y C1–C4
usan los editables sincronizados de `docs/diagramas/`: conservan IDs, fronteras, estados
y aristas seleccionadas; redistribuyen y abrevian etiquetas para lectura. Las omisiones
se identifican en cada vista o sus notas. `presentacion.json` conserva las etiquetas
originales, página fuente, selección de nodos y relaciones. El nivel C3 amplía solo la
preparación ADMIN; C4 selecciona el código real de sesiones.

La oferta implementada tiene cinco mutaciones de preparación y cinco consultas ADMIN,
contrastadas con el controlador real y los contratos. No se presenta publicación,
retiro/cancelación, catálogo alumno ni «Mis grupos» como disponibles. Bootstrap,
aceptación humana, 1000 concurrentes, D13 e integraciones reales permanecen abiertos.

## Regenerar y comprobar

Requisitos: Windows, Microsoft PowerPoint de escritorio registrado para automatización
COM, Arial y Python 3. No se añaden paquetes ni dependencias a las aplicaciones del
producto. PowerPoint debe poder iniciar en la sesión de escritorio; un sandbox puede
bloquear su servidor COM. No se modifica configuración de Office o del sistema.

Desde la raíz del repositorio:

```powershell
python docs/exposicion/preparar.py
powershell -NoProfile -ExecutionPolicy Bypass -File docs/exposicion/generar.ps1
python docs/exposicion/verificar.py
```

- `preparar.py`: contenido, guion, tiempos y diseño; valida fuentes y relaciones frente
  a Draw.io y produce `presentacion.json` y `notas-presentador.md`.
- `generar.ps1`: crea el PPTX sin ventana, lo guarda y **lo reabre en PowerPoint**,
  comprueba notas y dimensiones de texto, y exporta las diapositivas reales. No abre ni
  modifica presentaciones del usuario. Exporta BMP de 24 bits a `.cache/exposicion-render/`
  y convierte sin pérdida a PNG para evitar tramado de la exportación PNG indexada.
- `verificar.py`: valida ZIP/XML y relaciones del PPTX, 16 notas vinculadas, texto
  esperado, editabilidad, huellas de fuentes y PNG 1920 × 1080. Pillow, ya disponible
  en el entorno de entrega, solo se usa para reconstruir `render/vista-general.png`.

Para reabrir y renderizar el PPTX existente sin reconstruirlo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/exposicion/generar.ps1 -SoloVerificar
python docs/exposicion/verificar.py
```

Los comandos sobrescriben los artefactos de esta carpeta. Para cambios de contenido,
editar `preparar.py`; cambios manuales en el PPTX no se trasladan a la fuente. El diseño
y contenido son reproducibles; Office puede cambiar metadatos/timestamps del ZIP, por
lo que no se promete identidad binaria entre regeneraciones. Tras regenerar se debe
repetir la inspección visual, además de las comprobaciones automáticas.

## Verificación de la entrega

Microsoft PowerPoint 16.0 abrió el archivo guardado y renderizó las **16/16** diapositivas.
Se comprobaron notas completas, texto esperado y cero desbordamientos medidos.
Se revisaron visualmente todas las páginas a partir de esos renders, incluidas las
selecciones C1–C4: texto, recortes, superposiciones, conectores, fronteras y estados.
Se corrigieron cajas de texto, etiquetas largas, la frontera del correo interno y el
tramado de color. No quedan diapositivas sin renderizar o inspeccionar.

Resultados: [apertura y render](verificacion.json),
[comprobación estructural y huellas](verificacion-estructural.json),
PNG individuales en `render/diapositiva-01.png` a `render/diapositiva-16.png`.
La inspección visual del agente no sustituye aceptación humana del producto ni un
ensayo presencial del expositor. La evidencia de pruebas citada sigue siendo histórica
y acotada a su fuente; no acredita capacidad integral.
