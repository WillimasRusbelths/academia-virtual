# T108 · Revisión preliminar de aceptación

Fecha: 2026-10-18. Regresión de base `6408a1f`, consolidada en T106 `82bb85f`;
T107 actualiza la documentación. **Revisión preliminar realizada; T108 permanece pendiente:**
su dependencia T104 no está cumplida. T104 se aplaza hasta observar
diez personas reales en la versión integrada y estable. No hay aceptación integral.
Esta matriz distingue evidencia funcional, resultados técnicos y obligaciones pendientes;
los criterios completos permanecen en [spec](../spec.md) y [verificación](../verification.md).

## Matriz FR/V

El conjunto cubre FR-001–FR-033; los checkpoints previos se conservan y no sustituyen
la [regresión T106](regression.md): 120 unitarias, 744 integraciones, 203 E2E y V16 nuevo,
sin omisiones. El contraste técnico es local; no aprueba capacidades o personas no evaluadas.

| Verificación | FR cubiertos | Evidencia y límite |
| --- | --- | --- |
| V00 / VA | Compatibilidad y capas | [Docker](../../../ops/docker/verification.md), [capas](us5-integracion.md) y repetición T106 aprobadas; solo Dockerfile de pruebas/aislamiento cambian, sin modificar las capas funcionales. |
| V01 | 001–003 | [US2](us2.md): validación, registro solo Alumno y unicidad concurrente; SC-001 humano pendiente. |
| V02 | 004, 029–031 | [US2](us2.md): verificación obligatoria, propósito, consumo único y caducidad exacta. |
| V03 | 005–009 | [US1](us1.md), [comparación U2](enumeration.md): acceso por rol, rechazo uniforme, cookie, logout y reinicio; SC-008 en T105. |
| V04 A/B | 008–009 | [US1](us1.md), [US4](us4.md): fronteras 30 min/8 h y formulario abierto sin replay. |
| V05 | 010–012, 021 | [T094](us3.md): pruebas automatizadas, revisión visual del agente y reportes humanos de Williams en ambos tamaños/teclado. No son diez participantes. |
| V06 | 013–014, 025 | [US4](us4.md), [US6](us6.md): gestión, provisional de 24 h, sustitución y verificación. |
| V07 | 015–020 | [US4](us4.md): cambio de acceso, dos sesiones revocadas y no restauración al reactivar. |
| V08 | 017, 027–028 | [US6](us6.md), [US4](us4.md): bootstrap único y último ADMIN; hallazgo CLI intermitente abierto, investigación T106. |
| V09 | 018–020 | [US5](us5.md): matriz directa visitante/Alumno A/B/Docente/ADMIN sin datos ni efectos indebidos. |
| V10 | 022–023, 031 | [Límites](reglas-credenciales-limites.md), [U2](enumeration.md), [US2](us2.md), [US7](us7.md): cuotas persistidas, fronteras y respuestas públicas. |
| V11 | 024, 030, 032–033 | [US7](us7.md): recuperación, contraseña anterior y dos sesiones rechazadas; parte humana SC-010 pendiente. |
| V12 | 025–026, 033 | [US5](us5.md), [auditoría](auditoria-privacidad.md): atribución y ausencia de secretos en proyecciones/registros. |
| V13 | 023, 029–033 | [Entregas](entregas-persistidas.md), [US2](us2.md), [retención](retention.md): reintentos/reanudación, limpieza de payload, tokens 24 h y metadatos 7 días. Purga CLI sin programación. |
| V14 | 018 y CSRF | [US5](us5.md): controles de origen, CORS/CSRF, cabeceras y GET sin consumo. |
| V15 | 015–016, 032 | [US4](us4.md), [US7](us7.md): carreras de login/reset/cambio de acceso y consumo/desactivación. |
| V16 | Operación recuperable | [T096](restored-state.md), [T097–T098](recovery.md): restauración aislada e invalidación antes de reabrir; D13 sin SLA aprobado. |

## Criterios de éxito

| Criterio | Estado de aceptación preliminar |
| --- | --- |
| SC-001 | **Pendiente**: registro/verificación funcional comprobado; faltan diez participantes y ≥9/10 sin ayuda en <180 s activos. [Preparación](usability.md), sin resultados humanos. |
| SC-002 | Demostrado en los accesos/negativos del conjunto automatizado US1/US4 y T106. U2 previo reutilizado, sin nueva medición temporal. |
| SC-003 | Demostrado: registro sin elevación y denegaciones directas US2/US5; regresión T106 aprobada sin efectos indebidos. |
| SC-004 | Demostrado: dos sesiones revocadas tras commit y no restauradas al reactivar, US4 y T106. |
| SC-005 | **Cumplido en T094**, con evidencia automatizada, visual y humana identificada; no se inventa una revisión humana nueva. |
| SC-006 | Invariantes demostradas en carreras de registro/bootstrap/último ADMIN y T106; estabilidad CLI conserva el hallazgo abierto, no resuelto por 23/23. |
| SC-007 | Demostrado en auditoría y eventos revisados de US5/T106: atribución y ausencia de secretos. No es una garantía fuera del conjunto revisado. |
| SC-008 | **Cumplido localmente en T105**: [20/20 accesos](login-timing.md), 118,2–396,1 ms; no acredita concurrencia ni producción. |
| SC-009 | Demostrado en US2/US6/US7 y T106: correo obligatorio, propósito, caducidad y consumo único. |
| SC-010 | Parte técnica comprobada en US7; **aceptación pendiente** de diez personas y ≥9/10 recuperaciones sin ayuda en <180 s activos, espera de correo aparte. |

## Constitución y decisiones

- I / II: alcance SDD y autorización backend sustentados en tareas, matriz FR/V, contratos
  y pruebas; la aceptación integral no se deriva de contar tareas completadas.
- III–VII: precios, cupos, pagos e Izipay fuera de identidad; no se afirman probados ni se
  sustituyen por carga de identidad. Permanecen obligaciones de los siguientes dominios.
- VIII: video y protección siguen pendientes; D07–D09 conservan investigación independiente
  y temprana. El aplazamiento del VPS no valida video ni sus costos.
- IX: pruebas con datos ficticios y recursos separados, secretos privados; conservación
  de las 15 cuentas manuales, singleton y credenciales comprobada en T106. Sin contratación ni publicación.
- X: procedimientos y restauración local comprobados en T097–T098; custodia, ubicación,
  responsables y objetivos operativos **D13 pendientes**, sin SLA ni programación activada.
- XI: **capacidad sin aprobar**. [T103](load.md) está completa como ejecución/informe;
  [incumplimientos y límites](load-resources.md) se conservan. En ID-LOAD-01/02, /me p95
  <500 ms/p99 <1000 ms, login p95 <3 s y errores inesperados <1 % siguen como referencias
  provisionales hasta D10. La continuidad de 1000 sesiones durante diez minutos y las
  invariantes de seguridad conservan sus condiciones originales; no se sustituyen por VU.
  Alcanzar 1000 sesiones no acreditó la meseta íntegra. SC-008 mantiene su criterio aprobado
  e independiente; D10 no reclasifica ese umbral ni las reglas funcionales de seguridad.

[Acuerdo vigente D09/D10](../../../docs/decisiones-pendientes.md#seguimiento-d09d10--2026-10-18):
VPS y nuevas cargas completas aplazados hasta integrar matrícula, sin suprimir obligaciones,
reclasificar umbrales ni cerrar capacidad. T104 se retoma con la versión integrada estable.
Los pendientes impiden marcar T108 o presentar el spec integralmente terminado.

Validación documental T107/T108: 919 enlaces locales (55 anclas), receta PowerShell
parseada sin ejecutar sobre datos existentes y `git diff --check` aprobados. Seguimiento:
108 IDs únicos, **106 completas / 2 pendientes (T104 y T108)**.
