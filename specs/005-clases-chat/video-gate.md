# G-V005 — aceptación del ensayo YouTube del MVP

2026-11-17, America/Lima. **ALCANCE APROBADO / PRUEBA REAL PENDIENTE.**
V05 y constitución 2.0.0 resuelven la discrepancia de alcance C1. No hay evidencia
de reproducción, capacidad o validación del profesor por adoptar la enmienda.
Cloudflare y video protegido completo quedan fuera del MVP.

[Adopción aprobada](evidence/video-scope-adoption.md),
[contrato del ensayo](contracts/video.md), [revisión inicial histórica](video-feasibility.md).

## Puerta del ensayo MVP

1. Implementación y pruebas locales del contrato propio: referencia versionada
   por docente actual/admin, ID validado sin URL/HTML/secretos, clase LIVE y
   matrícula/sesión vigentes al entregar referencia. Revisión/replay atómicos.
2. Configuración/cuenta emisora y contenido de prueba autorizados. Secretos de
   OBS/YouTube fuera de aplicación, logs y Git. Sin contratación o emisión personal
   por iniciativa del agente. Iniciar/detener señal en el proveedor es manual.
3. Emisión real y reproducción observada en navegador desde aula autorizada;
   diferenciar estado de clase, referencia configurada, player listo y PLAYING.
4. Negativas propias: visitante/ajeno/sin matrícula, fin−1 μs/fin/fin+1 μs,
   revocación/cuenta deshabilitada, grupo cancelado y clase finalizada. API no
   entrega nuevas referencias indebidas; UI destruye player al detectar pérdida.
5. Referencia compartida o conocida antes de perder permiso: registrar el
   comportamiento externo y su limitación. No exigir una denegación YouTube por
   matrícula ni computar reproducción externa como control propio aprobado.
6. Cambio de docente: gestión propia denegada al anterior; el responsable actual
   puede revisar/cambiar referencia sin heredar secretos. Registrar operación
   manual del titular para detener/revocar señal externa cuando corresponda.
7. Registrar duración, dispositivos/modalidades, calidad/bitrate observables,
   fallos, tráfico, emisiones/consumidores reales y costo. Métrica no observable
   se declara así; iframe abierto, doble de player o prueba pequeña no acreditan
   reproducción fluida, 2.500 activos o escenario combinado.

G-V005 se completa solo con evidencia real del ensayo y controles propios.
No se marca pasada por aprobación/documentación o tests que usan player simulado.
SC-003/007 esperan esa evidencia; D10/D13 conservan condiciones independientes.
La aceptación académica del criterio modificado requiere validar con el profesor
si afecta la evaluación; aprobación responsable no equivale a esa validación.

## Protección futura — fuera del MVP

Antes de presentar una integración como video protegido, validar manifiestos/
segmentos directos, permisos vencidos/revocados, origen/caché y emisor actual con
revocación efectiva. Cloudflare es una evolución posterior, sin contratación,
precio, contrato o capacidad aprobados por esta pasada. Su falta no bloquea el
ensayo del MVP ni se oculta como protección ya conseguida.
