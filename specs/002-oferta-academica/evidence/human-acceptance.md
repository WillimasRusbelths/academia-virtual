# Protocolo de observación humana — T072/T073

Preparado el 2026-10-29 (America/Lima), T072. **No ejecutado**.
No hay participante, sesión ni resultado humano registrados. T073 y SC-002 permanecen
pendientes; este documento no acredita aceptación integral ni capacidad concurrente.

El 2026-10-29 el responsable indicó que la observación se realizará después.
No se fija una fecha ni se registran participantes o resultados por anticipado.

## Objetivo y fuente de aceptación

[SC-002](../spec.md), FR-006/009/014 y V-A13 del [plan](../plan.md): un alumno llega
desde Inicio a oferta publicada e identifica sin ayuda curso, grupo, días/horas,
fechas, zona y capacidad en dos grupos; las vistas indican ocupación/disponibilidad
no calculadas. Trazabilidad HU08/RF10. No se añaden porcentajes, cuotas de personas,
límite temporal ni exigencia de acertar al primer intento. Las autocorrecciones se
registran; las ayudas del observador también, sin ocultarlas en el resultado.

Los E2E [T068](automated.md) y el [restore T069](recovery.md) son evidencia automática
separada. Ni el agente, Playwright, una revisión estática o quien prepara los datos
sustituyen la observación del alumno real. T104 de identidad conserva su protocolo
de diez personas y sus criterios propios; este recorrido no lo cierra.

## Brecha de interfaz identificada antes de la sesión

**H-CAP-01 — corregida y verificada automáticamente; severidad original media, SC-002/FR-006.** Hallazgo histórico por revisión estática de la base
49fcf16: [CatalogPage](../../../apps/web/src/features/academic-offering/catalog-page.tsx)
no contiene el aviso de ocupación/disponibilidad no calculadas, y
[OfferingLayout](../../../apps/web/src/features/academic-offering/offering-state.tsx)
tampoco lo añade. Las vistas de curso/grupo sí usan el aviso desde
[GroupSummary](../../../apps/web/src/features/academic-offering/course-page.tsx).

SC-002 exige el aviso en las vistas del recorrido. T072 lo dejó pendiente y no
modificó código ni registró resultados humanos. La [corrección posterior](h-cap-01.md)
añade el aviso a CatalogPage y verifica el catálogo con PostgreSQL/API reales. Se
conserva el descubrimiento original: los pases no sustituyen la observación humana.
Registrar en T073 la revisión efectivamente observada; todavía no hay sesión ni
aprobación de SC-002. No se altera PA-01–PA-05/E1.

## Preparación a cargo del responsable, todavía pendiente

1. Acordar disponibilidad del alumno y responsable. Usar alias de participante,
   sin nombre real, correo, contraseña, cookie o token en el informe versionado.
2. Registrar revisión exacta, lockfile, navegador, tamaño de ventana, fecha/hora
   America/Lima y fuente de fixtures antes de observar. Verificar H-CAP-01 con la
   revisión elegida; no sustituir una omisión por una explicación verbal al alumno.
3. Preparar una **copia/proyecto exclusivos para observación**, con APP_ENV=test y
   configuración privada nueva, siguiendo el [quickstart](../quickstart.md). No usar
   academia-local ni sus quince cuentas, puertos, claves o volúmenes; no reconfigurar
   el proyecto E2E existente ni compartir sus credenciales con el participante.
4. Antes de cualquier arranque, comprobar el destino efectivo con Compose sin volcar
   variables privadas: volumen propio, sin mounts manuales, DB/Mailpit/API sin puertos
   publicados y **solo web en loopback**. El overlay de ejemplo de abajo se aplica
   después de regression e identity-tests. Es una receta, no un entorno ya arrancado.
5. Revisar/aplicar las cinco migraciones únicamente a esa BD de prueba nueva. Usar
   el mecanismo existente `npm run fixtures:identity --workspace apps/api -- create` en el
   contenedor API de ese proyecto: genera cuentas ficticias y manifiesto privado,
   sin credenciales predeterminadas ni bootstrap sobre una BD inicializada. Conservar
   el manifiesto en carpeta privada del ensayo; no imprimirlo ni versionarlo. Si
   aparece el hallazgo de bootstrap al preparar un entorno, registrarlo sin declararlo
   resuelto ni eludirlo con cuentas manuales. Las fixtures de test no validan bootstrap.
6. Con ADMIN ficticio, preparar el curso y dos grupos previstos por los recorridos
   existentes. Elegir docente activo/verificado de rol TEACHER; guardar y publicar
   curso y cada grupo explícitamente. No crear precios, reservas o matrículas.
7. Comprobar con STUDENT ficticio que ambos grupos son visibles, hay datos completos
   y no hay exposición administrativa. No provocar retiros/cancelaciones ni cambios
   de habilitación durante la observación. Registrar cambios de entorno como incidentes.
8. En un perfil de navegador separado del ADMIN, autenticar al STUDENT ficticio y
   dejarlo en Inicio. La preparación de acceso no forma parte de SC-002, que comienza
   en Inicio. El participante usa ese navegador en el mismo equipo: loopback no es
   una URL para otro dispositivo/LAN. No abrir 0.0.0.0 ni túneles para hacerlo accesible.

### Overlay previsto, no aplicado en esta etapa

Guardar en la carpeta privada del proyecto de observación. Base Compose, override de
CA pública si hace falta, regression, identity-tests y este overlay, en ese orden;
siempre `--project-name`, `--project-directory` y `--env-file` explícitos. No editar
Compose ni el `.env` de la instalación manual. El puerto 55173 es solo un candidato.

```yaml
services:
  api:
    environment:
      APP_ENV: test
      APP_ORIGIN: http://localhost:55173
      MAIL_MODE: capture
  web:
    ports:
      - "127.0.0.1:55173:5173"
```

regression elimina primero los puertos de DB/Mailpit/API/web; este último archivo
añade únicamente web loopback. Comprobar la configuración fusionada, sin arrancar,
y no asumir que la receta cambia cuentas, volumen o fuente de la API ya existente.
T072 comprobó solo la fusión con Compose y valores ficticios: único puerto web
en 127.0.0.1, APP_ENV=test y nombre de volumen propio, sin crear servicios/volúmenes.
Esto no comprueba disponibilidad de puerto ni preparación de cuentas. Antes del
arranque real, probar que el puerto esté libre, sin detener al ocupante:

```powershell
$candidatePort = 55173
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidatePort)
try { $probe.Start() } finally { $probe.Stop() }
```

Un fallo obliga a elegir otro puerto y actualizar **también APP_ORIGIN**. Repetir la
comprobación justo antes de arrancar; si Docker no puede enlazarlo, abortar sin matar
procesos ajenos. Validar readiness y acceso por localhost antes de entregar el equipo.
No se ha comprobado hoy disponibilidad de puerto, readiness ni login humano.

## Datos previstos, no sembrados por este documento

Curso ficticio: **Curso de comparación SC-002**, con descripción de ensayo. Docente
ficticio habilitado, misma zona para ambos grupos. La hoja de respuestas queda solo
para el observador, no en la pantalla ni como instrucciones al alumno.

| Dato esperado | Grupo A | Grupo B |
| --- | --- | --- |
| Curso | Curso de comparación SC-002 | Curso de comparación SC-002 |
| Nombre de grupo | Grupo A | Grupo B |
| Días | lunes y miércoles | martes y jueves |
| Horas locales | 18:00–19:00 | 19:00–20:30 |
| Periodo incluido | 2026-11-02 a 2026-11-29 | 2026-11-02 a 2026-11-29 |
| Zona | America/Lima | America/Lima |
| Capacidad máxima configurada | 1 alumno | 50 alumnos |
| Ocupación/disponibilidad | No calculadas | No calculadas |

Son ejemplos válidos, no nuevas fechas/reglas obligatorias del negocio. Si el
responsable cambia los datos, registrar antes del recorrido los valores realmente
guardados, manteniendo dos grupos completos y las reglas aprobadas. No inventar
cuántas plazas quedan ni presentar la capacidad como una reserva confirmada.

## Desarrollo de la observación

El responsable inicia el registro solo cuando el participante está en Inicio. Da una
instrucción neutral: «Busca el curso del ensayo y compara sus dos grupos. Muéstrame
qué curso y grupo estás consultando y qué días, horas, fechas, zona y capacidad puedes
leer». No señalar el enlace, proporcionar URL, mover el puntero, nombrar botones o
explicar dónde están los valores. El alumno decide navegación y puede volver atrás.

El observador registra ruta y expresión espontánea, autocorrecciones, dudas y ayudas.
No asignar tiempos o porcentajes de aprobación que SC-002 no exige; los tiempos
observados son descriptivos. Anotar si ve el aviso de ocupación/disponibilidad en
cada vista del recorrido, sin completarlo verbalmente. Un error de sesión/red o de
preparación se separa de una dificultad de uso; no atribuir un dato inexistente al alumno.

## Registro de T073 — sin completar

| Campo de sesión | Estado actual |
| --- | --- |
| Fecha/hora y alias de responsable/participante | Pendiente |
| Revisión exacta, navegador y ventana | Pendiente |
| Proyecto/puerto loopback y guardas comprobadas | Pendiente |
| H-CAP-01: revisión corregida y verificación | Corrección automática en [h-cap-01.md](h-cap-01.md); revisión de la sesión humana pendiente |
| Datos realmente publicados antes del recorrido | Pendiente |
| Inicio del recorrido desde Inicio | Sin observar |
| Incidentes operativos separados de usabilidad | Sin observar |

| Observación real | Grupo A | Grupo B |
| --- | --- | --- |
| Curso y grupo identificados sin ayuda | Sin observar | Sin observar |
| Días y horas | Sin observar | Sin observar |
| Fechas de inicio/fin | Sin observar | Sin observar |
| Zona horaria | Sin observar | Sin observar |
| Capacidad máxima | Sin observar | Sin observar |
| Aviso de ocupación/disponibilidad por vista | Sin observar | Sin observar |
| Dudas, autocorrecciones y ayudas | Sin observar | Sin observar |

Añadir en T073 un registro cronológico con alias, ruta, dato observado frente al
esperado y ayuda concreta (o ausencia de ayuda). Sin capturas de credenciales ni
datos personales; si hacen falta artefactos, usar solo fixtures y almacenamiento
privado ignorado por Git. No sustituir observación por una casilla completada.

## Resultado y cierre de la sesión

**Resultado humano actual: pendiente, no observado. SC-002 no demostrado.**

Solo después de la sesión real valorar el criterio completo: llegada desde Inicio,
datos de los dos grupos identificados sin ayuda y avisos exigidos en las vistas.
Si falta un dato, hubo ayuda necesaria, persiste H-CAP-01 o un fallo impide observar,
registrar qué no quedó demostrado; no reinterpretar SC-002 ni anticipar aprobación.
Toda repetición identifica revisión/datos y conserva el intento previo. T074 depende
de evidencia completa; este protocolo y los pases E2E no permiten marcarlo.

Al terminar, cerrar sesión y detener **solo** ese proyecto de observación; conservar
su volumen, manifiesto y configuración privados para trazabilidad. No usar down -v,
purga ni borrar las cuentas originales. No modificar el entorno manual al cerrar.
