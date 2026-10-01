# Diagrama de arquitectura de Academia Virtual

## Descripción general

Academia Virtual emplea una arquitectura de tres capas: presentación, lógica de negocio y datos. Esta separación permite distribuir las responsabilidades del sistema, facilitar su mantenimiento y evitar que las interfaces de usuario accedan directamente a la base de datos.

La solución se plantea como un monolito modular. El frontend utiliza React, TypeScript y Vite, mientras que el backend emplea NestJS y expone una API REST. La información se almacena en PostgreSQL mediante adaptadores de persistencia.

## Diagrama de arquitectura

```mermaid
flowchart TB
    subgraph actores["Actores"]
        direction LR
        alumno["Alumno"]
        docente["Docente"]
        administrador["Administrador"]
    end

    subgraph presentacion["Capa de presentación"]
        direction LR
        web["Aplicación web<br/>React, TypeScript y Vite"]
        api["API REST<br/>NestJS"]
        gateway["Gateway de chat<br/>Socket.IO"]
    end

    subgraph negocio["Capa de lógica de negocio"]
        direction TB
        identidad["Identidad y usuarios"]
        academico["Cursos y materiales"]
        matriculas["Matrículas y pagos"]
        aula["Clases en vivo y chat"]
        administracion["Administración y paneles"]
    end

    subgraph datos["Capa de datos"]
        direction LR
        persistencia["Persistencia<br/>Prisma"]
        postgres[("PostgreSQL")]
        archivos["Almacenamiento de materiales"]
    end

    subgraph externos["Servicios externos"]
        direction LR
        izipay["Izipay"]
        correo["Servicio de correo<br/>SMTP / Mailpit"]
        youtube["YouTube Live"]
        obs["OBS Studio"]
    end

    alumno --> web
    docente --> web
    administrador --> web

    web -->|"HTTPS / JSON"| api
    web -->|"conexión en tiempo real"| gateway

    api --> identidad
    api --> academico
    api --> matriculas
    api --> aula
    api --> administracion
    gateway --> aula

    identidad --> persistencia
    academico --> persistencia
    matriculas --> persistencia
    aula --> persistencia
    administracion --> persistencia

    persistencia --> postgres
    academico --> archivos

    identidad -.->|"verificación y recuperación"| correo
    matriculas -.->|"procesamiento de pagos"| izipay
    aula -.->|"acceso a la transmisión"| youtube
    docente -.->|"emisión de video"| obs
    obs -.->|"transmisión"| youtube
    youtube -.->|"reproducción de video"| web
```

## Responsabilidades de las capas

| Capa | Responsabilidades | Restricciones |
|---|---|---|
| Presentación | Proporcionar las interfaces utilizadas por alumnos, docentes y administradores. Recibir solicitudes HTTP, validar datos de entrada y adaptar las respuestas del sistema. | No accede directamente a PostgreSQL ni implementa reglas de matrícula, pagos o autorización. |
| Lógica de negocio | Ejecutar los casos de uso relacionados con identidad, usuarios, cursos, materiales, matrículas, pagos, clases, chat y administración. | Las reglas del negocio permanecen separadas de HTTP, SQL y los detalles de los servicios externos. |
| Datos | Implementar la persistencia, las consultas, las migraciones y las transacciones requeridas por los módulos del sistema. | No decide permisos, estados de matrícula ni resultados de pagos. Implementa los contratos definidos por la lógica de negocio. |

## Módulos de negocio

| Módulo | Responsabilidad principal |
|---|---|
| Identidad y usuarios | Registro, verificación de correo, inicio y cierre de sesión, recuperación de contraseña, perfiles y administración de cuentas. |
| Cursos y materiales | Gestión de cursos, grupos, horarios, cupos y recursos académicos. |
| Matrículas y pagos | Creación de matrículas, cálculo de importes, confirmación de pagos y habilitación del acceso a los cursos. |
| Clases en vivo y chat | Control de acceso a las clases, publicación de enlaces y comunicación en tiempo real entre los participantes. |
| Administración y paneles | Gestión de usuarios, roles, cursos, matrículas y consultas correspondientes a cada tipo de usuario. |

## Servicios externos

| Servicio | Función dentro del sistema | Situación |
|---|---|---|
| Izipay | Procesar los pagos de las matrículas y comunicar el resultado de cada operación. | Servicio seleccionado; integración pendiente de implementación y validación. |
| Mailpit | Capturar los correos enviados durante el desarrollo y las pruebas locales. | Disponible para el entorno de desarrollo. |
| Servicio SMTP | Enviar correos de verificación y recuperación de contraseña en producción. | Proveedor pendiente de selección y configuración. |
| YouTube Live | Transmitir las clases en vivo y proporcionar el reproductor de video. | Servicio seleccionado para el MVP; reglas de acceso pendientes de validación. |
| OBS Studio | Permitir que el docente emita audio y video desde su computadora. | Herramienta prevista para la transmisión de las clases. |
| Almacenamiento de materiales | Conservar los archivos académicos publicados por los docentes. | Alternativa tecnológica pendiente de selección. |

## Dependencias

La aplicación web se comunica con la API REST mediante HTTPS y utiliza una conexión en tiempo real para el chat. La API dirige cada solicitud al módulo de negocio correspondiente.

Los módulos utilizan contratos de persistencia para almacenar y consultar información. Los adaptadores implementan estos contratos mediante Prisma y PostgreSQL. De esta manera, las reglas del negocio no dependen directamente de una tecnología de base de datos.

Las integraciones externas se realizan desde el módulo que las necesita:

- Identidad y usuarios utiliza el servicio de correo.
- Matrículas y pagos utiliza Izipay.
- Clases en vivo utiliza YouTube Live.
- El docente utiliza OBS Studio para emitir la transmisión.
- Cursos y materiales utiliza el almacenamiento de archivos.

PostgreSQL conserva los datos del sistema, pero no se comunica directamente con Izipay, el servicio de correo o YouTube.

## Estado de la arquitectura

El proyecto cuenta con la estructura inicial del frontend, la API, PostgreSQL y Mailpit para desarrollo. Los módulos funcionales se implementarán progresivamente de acuerdo con las historias de usuario y los requisitos establecidos.

La capacidad para soportar 1000 usuarios concurrentes deberá comprobarse mediante pruebas de carga. Las integraciones con Izipay, correo de producción, YouTube Live y almacenamiento de materiales también requieren implementación y validación.

## Documentos relacionados

- [Actores del sistema](../analisis-de-sistema/01-actores.md)
- [Historias de usuario](../analisis-de-sistema/02-historias-del-usuario.md)
- [Requisitos funcionales](../analisis-de-sistema/03-requisitos-funcionales.md)
- [Atributos de calidad](../analisis-de-sistema/04-atributos-de-calidad.md)
- [Restricciones](../analisis-de-sistema/05-restricciones.md)
- [Drivers arquitectónicos](../analisis-de-sistema/06-driver-arquitectonicos.md)
