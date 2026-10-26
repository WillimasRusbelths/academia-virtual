# Regresión de identidad — T065

2026-10-26, America/Lima. Rama `feat/002-oferta-academica`. Base de producto
**f6aa09f**; único cambio ejecutable: limpieza de fixture E2E US6, identificada por
SHA-256 en [resultados](identity-regression-results.json). **T065 completa**.
No se modifica código de identidad ni oferta, esquema, contratos o reglas aprobadas.

## Resultados nuevos

PostgreSQL/HTTP real: **672/672** en **35 archivos**;
E2E: **203/203 ejecuciones**, diez configuraciones originales,
sin omisiones, reintentos automáticos ni fallos finales. Las cantidades incluyen
controles del harness; no son todas pruebas de comportamiento académico.

| Suite E2E | Configuración original | Ejecuciones finales |
| --- | --- | ---: |
| Infraestructura | `playwright.config.ts` | 5/5 |
| Acceso | `playwright.identity.config.ts` | 21/21 |
| Registro | `playwright.registration.config.ts` | 14/14 |
| Primer ADMIN | `playwright.first-admin.config.ts` | 14/14 |
| Administración | `playwright.admin-users.config.ts` | 20/20 |
| Recuperación | `playwright.password-reset.config.ts` | 36/36 |
| Seguridad | `playwright.security.config.ts` | 28/28 |
| Perfil | `playwright.profile.config.ts` | 8/8 |
| Accesibilidad | `playwright.accessibility.config.ts` | 56/56 |
| Tiempos de acceso | `playwright.login-timing.config.ts` | 1/1 |

Se conservan los tamaños y proyectos originales. El JSON identifica proyecto/caso y
contrasta por hash las configuraciones; no infiere el viewport de un nombre. En acceso,
los 21 registros incluyen tamaños en los títulos y un control permisivo de
infraestructura; ese control no demuestra una respuesta de producto específica.
Base contiene cinco controles de navegador/componentes/transporte, no cinco casos
de integración académica. El caso temporal realiza veinte accesos secuenciales
con el umbral original SC-008; no demuestra concurrencia ni sustituye T105.

PostgreSQL cubre acceso, registro, recuperación/uso único y carreras, cambio de
credencial inicial, revocación/expiración/aceptación de sesión, cambio de rol/estado,
último ADMIN, bootstrap real/PTY, directorio docente, auditoría, retención, estado
restaurado, privacidad y CSRF/CORS. Los 35 archivos y cada caso ejecutado se
identifican en resultados; no se atribuye una integración completa
no ejecutada: la puerta completa, compatibilidad y correo corresponde a T068.
La configuración seguridad verifica además CSP real en Chromium, bloqueo de scripts
y destinos externos, rutas denegadas y no almacenamiento de secretos.

## Incidencias y correcciones verificadas

1. El selector no anclado `harness.spec.ts` de la receta también coincidió con
   `academic-offering-harness.spec.ts`: cinco originales aprobadas y un caso académico
   con 502 al usar el origen/proxy base. Se conserva el informe inicial. Se corrigió
   únicamente la invocación usando selectores exactos: 5/5; el harness académico
   se ejecutó aparte con su configuración real: 2/2 controles.
   T071 deberá actualizar esa receta ambigua; no se modifica quickstart en este bloque.
2. Primer ADMIN inicial: 12/14 aprobadas, dos errores de fixture por FK en TRUNCATE
   User. `apps/web/tests/support/us6-fixture.ts` ahora incluye explícitamente las
   cinco tablas académicas dentro del esquema ficticio t_ ya protegido. Conserva
   parada del scheduler, singleton, limpieza y sin CASCADE. Repetición completa:
   14/14, incluidas todas las aserciones posteriores de activación y acceso ADMIN.
   Sin debilitar pruebas, aumentar límites ni modificar migraciones históricas.
3. Tras esa ejecución, el motor Docker no estaba disponible. Se reanudó Docker
   Desktop en segundo plano y se verificaron de nuevo destino, volumen y metadatos
   manuales antes de arrancar solo DB/Mailpit aislados. No se atribuye una causa
   al cierre del motor. Se preservan inspecciones anterior/reanudada/final.

Los dos fallos de fixture no son evidencia de comportamiento en rojo ni diagnóstico
del hallazgo intermitente histórico del bootstrap. **Ese hallazgo sigue abierto**.
Las pruebas bootstrap actuales aprobadas no confirman su causa ni una solución.
Los avisos NativeCommandError de PowerShell por stderr de Docker se distinguen de
los códigos reales guardados: cada comando final termina con código 0.

## Ejecución reproducible y conservación

Se reutilizó el proyecto `academic-offering-fa3d46bddbb8`, volumen original retenido,
APP_ENV=test, sin puertos publicados ni mounts manuales. Antes: 348 archivos de
código/pruebas/Prisma/configuración idénticos a la copia; después solo se sincronizó
la fixture corregida. Las once configuraciones Playwright dentro de la imagen
coinciden por hash con el repositorio. Node 22.23.1; Compose y lockfile conservados.

Lanzador privado: `.cache/academic-offering-validation/t065-t066/run.ps1 -Action <acción>`;
reportes originales y SHA-256 en resultados. Se ejecutan secuencialmente las acciones
identity-api, browser-base, browser-identity, browser-registration, browser-first-admin,
browser-admin-users, browser-password-reset, browser-security, browser-profile,
browser-accessibility y browser-login-timing. Cada runner genera Prisma y compila API;
el script E2E existente ejecuta tipos y build web antes de Playwright.

Comandos originales en el servicio aislado browser-tests (override de identidad,
fixtures originales y origen loopback; base usa Vite aislado en 127.0.0.1:4173):

```sh
npm run test:e2e --workspace apps/web -- --config playwright.config.ts '(^|/)harness\.spec\.ts$' '(^|/)foundations\.spec\.ts$' --reporter=list,json
for suite in identity registration first-admin admin-users password-reset security profile accessibility login-timing; do
  npm run test:e2e --workspace apps/web -- --config playwright.$suite.config.ts --reporter=list,json || exit 1
done
```

PG se ejecuta con `npm exec --workspace apps/api -- vitest run tests/integration/<archivo> --maxWorkers=1`,
selección explícita íntegra en JSON. No se ejecuta mail-delivery contra una API ausente;
su ensayo operativo y la suite global quedan en T068, no se cuentan como aprobados aquí.
Las suites crean/limpian solo sus propios esquemas. Cierre: cero esquemas t_ restantes,
DB/Mailpit aislados detenidos y tres volúmenes con metadatos idénticos. No hubo SQL
ni arranque de la base manual; su estado/fechas/ID permanecen iguales.

72 archivos protegidos conservados: constitución, PA-01–PA-05, modelo/plan/contratos,
configuración local, migraciones y evidencia/spec 001. No se mezcla este resultado
con [regresión histórica 001](../../001-identidad-acceso-roles/evidence/regression.md).
No se ejecutaron smokes, cargas completas, AWS, SMTP externo ni aceptación humana.
T103 conserva ejecución/informe con capacidad sin aprobar; T104/T108, bootstrap,
D04/D06 matrícula, D10/D13, SMTP y SC-002/T073 siguen pendientes. La reserva de 24 h
permanece en su spec futuro; no se acredita capacidad para 1000 ni 2500 concurrentes.
