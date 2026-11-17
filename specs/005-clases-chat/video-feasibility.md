# Viabilidad inicial de video — 005 / D07–D08

2026-11-17, America/Lima. **Revisión documental, sin emisión o prueba de red real.**
Este documento acompaña al [spec](spec.md); no sustituye el plan ni acredita RF16.

## Hechos revisados y conclusión limitada

YouTube permite compartir enlaces de videos ocultos con personas que no tienen
cuenta de Google, y quien recibe el enlace puede volver a compartirlo. La ayuda
incluye las emisiones en directo en la configuración de visibilidad. Por tanto,
un enlace oculto no limita por sí mismo la reproducción a alumnos matriculados
en la academia. [Fuente oficial: privacidad de videos](https://support.google.com/youtube/answer/157177?hl=es).

Los videos privados se comparten con personas elegidas mediante sus direcciones
de correo. Esa configuración no demuestra que la matrícula o revocación de sesión
de la academia controle el acceso a cada solicitud de contenido. No se ha probado
una integración de ese tipo. [Misma fuente oficial](https://support.google.com/youtube/answer/157177?hl=es).

La documentación oficial del reproductor describe la incrustación y sus eventos;
no constituye evidencia de autorización por matrícula en esta aplicación.
[Referencia oficial del reproductor](https://developers.google.com/youtube/iframe_api_reference).

**Inferencia de la revisión:** incrustar una emisión oculta detrás del login no
satisface por sí solo la obligación de impedir acceso directo sin permiso o vencido.
Esta conclusión se limita a ese mecanismo; no afirma haber ensayado todas las
opciones del proveedor, ni aprueba una alternativa concreta o costos.

## Discrepancia documental que el plan debe tratar

- [DEC01/DA03](../../docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md)
  seleccionan YouTube Live con OBS, manteniendo pendiente protección/viabilidad.
- La [constitución 1.2.1](../../.specify/memory/constitution.md), principio VIII,
  exige autorizar manifiestos/segmentos incluso por URL directa y con permiso
  vencido. Su lista de tecnologías propuestas conserva otra cadena de emisión;
  ninguna propuesta acredita implementación o deroga el principio obligatorio.
- El plan debe explicar la discrepancia, probar una solución que cumpla o presentar
  una decisión revisable. No se modifica la constitución, DEC01 o RF16 en este bloque.

## Prueba temprana requerida

| Caso | Verificación exigida | Estado |
| --- | --- | --- |
| Emisión permitida | Responsable actual inicia señal; navegador autorizado reproduce realmente | No ejecutado |
| Referencia compartida | Solicitud directa sin sesión, con cuenta ajena y con matrícula de otro grupo no recibe contenido nuevo | No ejecutado |
| Matrícula vencida | Referencia obtenida antes del fin no permite nuevas entregas al vencer | No ejecutado |
| Sesión revocada | Conexión o reproductor abierto no conserva acceso nuevo después de revocar | No ejecutado |
| Emisor anterior | Cambio/habilitación revocada impide continuación no autorizada y uso de sus credenciales anteriores | No ejecutado |
| Finalización | La clase finalizada deniega solicitudes nuevas de video | No ejecutado |
| Viabilidad | Medir duración, calidad, simultaneidad observada, tráfico/recursos y costo del alcance ensayado | No ejecutado |

Usar cuentas y contenidos ficticios/autorizados, sin publicar claves de emisión
o enlaces privados. La prueba necesita un entorno acordado y preparación de la
cuenta emisora; no se solicita acceso a cuentas personales por redactar el spec.
No se eluden protecciones del proveedor, extraen segmentos para redistribuir ni
se prometen capacidades sin evidencia. Las pruebas locales de gestión/chat son
independientes y no se contabilizan como reproducción protegida.
