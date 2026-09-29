# Evidencia del entorno local — T001 y T002

Fecha: 2026-09-27. Rama: `feat/001-identidad-acceso-roles`.
Árbol de Git limpio al iniciar. Diagnóstico realizado con consultas de solo lectura;
no se modificó Windows ni se instalaron dependencias o servicios.

## Resultado actual

**Registro histórico previo a R12: T001/T002 pendientes; en esa ejecución T003–T008 no se iniciaron.**
Estado actual y decisión posterior al final de este archivo.
Este registro complementa el diagnóstico histórico de
[quickstart.md](../../specs/001-identidad-acceso-roles/quickstart.md).
No demuestra que WSL2 pueda arrancar ni que Compose esté operativo.

| Consulta | Evidencia observada |
| --- | --- |
| `wsl --version` | WSL 2.7.10.0; kernel 6.18.33.2-2; Windows 10.0.26200.9168 |
| `wsl --status` | Versión predeterminada 2; informa que WSL2 no puede iniciar por virtualización no habilitada y solicita revisar Plataforma de máquina virtual/firmware |
| `wsl --list --verbose` | No hay distribuciones instaladas; no se exige instalar una distribución de usuario adicional para Docker |
| CIM `Win32_ComputerSystem.HypervisorPresent` | `false` |
| CIM `Win32_Processor` | `VirtualizationFirmwareEnabled`, `SecondLevelAddressTranslationExtensions` y `VMMonitorModeExtensions`: `true` |
| CIM `Win32_OptionalFeature` | `VirtualMachinePlatform` y `Microsoft-Windows-Subsystem-Linux`: `InstallState = 2` (deshabilitadas) |
| `Get-Service` | `WslService` en ejecución; `com.docker.service` y `vmcompute` no encontrados, no servicios meramente detenidos |
| `Get-Command docker` | No encontrado en PATH |
| Docker Desktop | Ejecutable no encontrado en `C:\Program Files\Docker\Docker\Docker Desktop.exe` ni `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`; sin entradas Docker en los registros de desinstalación HKLM/HKCU consultados |
| Docker Client/Server, Compose, `docker info` | No comprobables sin Docker disponible; no se afirma que el daemon esté simplemente detenido |
| `node --version` / `npm.cmd --version` | v22.23.1 / 10.9.8; no demuestra compatibilidad de dependencias del proyecto |

Las consultas WSL/CIM inicialmente devolvieron acceso denegado dentro del entorno
restringido; se repitieron fuera de él con autorización de solo lectura. Los resultados
anteriores corresponden a esas repeticiones. `Get-WindowsOptionalFeature -Online`
siguió exigiendo elevación; la evidencia de características deshabilitadas procede de
CIM, que sí respondió. Microsoft define `InstallState = 2` como Disabled en
[Win32_OptionalFeature](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-optionalfeature).

`bcdedit.exe /enum` devolvió acceso denegado: **el valor de `hypervisorlaunchtype`
permanece desconocido**. Una primera consulta con selector de entrada devolvió parámetro
inválido y se descartó; no se usa como evidencia del arranque. Ejecutar fuera del sandbox
no otorga privilegios de administrador de Windows. No se atribuye el bloqueo a BIOS.

## Actualización R12 — entorno nativo autorizado

El usuario informa PostgreSQL cliente/servidor 16.14 Windows x64, SELECT version() exitoso
en localhost:5432/postgres con usuario postgres; Windows volvió a arrancar normalmente.
VirtualMachinePlatform Disabled e HypervisorPresent False. Causa del incidente no determinada;
no se concluye incompatibilidad de Docker/WSL. No se ejecutan más cambios de Windows.

El agente comprobó ahora cliente psql 16.14 en C:\Program Files\PostgreSQL\16\bin\psql.exe,
Node v22.23.1 y npm 10.9.8. Su conexión psql -w recibió solicitud de contraseña no suministrada:
no ejecutó SELECT version() ni aprovisionó bases/roles. El diagnóstico anterior se conserva
arriba como histórico; sus recomendaciones de habilitar Windows dejan de ser el siguiente paso.

Ruta vigente: [native.md](native.md), decisión R12 en research.md y resultados en
[compatibility.md](compatibility.md). T001/T002 siguen pendientes fuera de la ruta local;
V00 nativo puede progresar y V00-L Linux se verifica temprano antes de US1.

Mailpit oficial 1.31.3 descargado y SHA256 comprobado; proceso local iniciado y API responde.
Listeners comprobados: Mailpit 127.0.0.1:1025/8025; PostgreSQL existente 0.0.0.0:5432 y [::]:5432.
El agente conecta únicamente a loopback; no cambió configuración global del servidor.
Puertos 3000/5173 libres al comprobar. Get-PSDrive devolvió datos incompletos en el entorno
restringido: no se usa para afirmar espacio disponible.

## Comprobación posterior — 2026-09-28

El responsable informa bases/roles ya aprovisionados, claves corregidas y `.env.test`
configurado. No se repitió provision.sql. El agente verificó instalación reproducible,
builds, dos smoke, generación y migración Prisma con academia_v00_owner y Argon2/SMTP.
La conexión del propietario confirmó servidor 16.14 y permisos básicos restringidos.
La conexión con academia_v00_runtime fue rechazada con 28P01: no están verificados su
lectura/escritura, rollback ni permisos efectivos. V00 sigue bloqueado; T003/T005/T007
completadas, T004/T006 parciales y T008 pendiente. Informe completo y procedimiento
local sin publicar secretos: [compatibility.md](compatibility.md).

## Reintento final — V00 nativo aprobado (2026-09-28)

Tras la revisión local de la URI informada por el usuario, ambos roles de ensayo se
autenticaron. El agente ejecutó verify:v00 completo con exit 0: builds, cinco pruebas,
generación/migración Prisma, permisos y rollback real. El 28P01 anterior queda resuelto.
No se editó .env.test ni se restablecieron claves/recrearon objetos. T003–T008 completadas;
T001/T002 y V00-L pendientes. Alertas npm conservadas en compatibility.md.
