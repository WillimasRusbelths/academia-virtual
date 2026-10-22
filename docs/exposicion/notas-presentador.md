# Guion del presentador · Academia Virtual

16 diapositivas · 900 segundos (15 minutos). El tiempo es una pauta de ensayo, no una medición humana.


## 01. Academia Virtual · 40 s

Presentar el sistema como un trabajo universitario en evolución. La exposición sigue una cadena: necesidades, requisitos, drivers, decisiones, estructura y evidencia. La fuente documental es 542c341 y el código de referencia ecb1efe; el árbol local estaba limpio en 542c341 al preparar la presentación.


Transición: Partimos del problema que el software debe resolver, antes de hablar de tecnologías.


Pregunta posible y respuesta: ¿La academia ya está terminada? No. Identidad tiene checkpoints funcionales y oferta dispone de preparación ADMIN; quedan criterios humanos e incrementos futuros.


Fuentes: `docs/informe-sincronizacion-2026-10-22.md`, `docs/estado-documental.md`


## 02. Un acceso coherente a la actividad académica · 55 s

El problema se formula a partir del alcance del proyecto: coordinar acceso por rol, oferta y una futura compra y experiencia de aprendizaje. No se dispone de una investigación que cuantifique fallos de una academia real: no inventar entrevistas, porcentajes ni un sistema previo. El objetivo es centralizar esas operaciones con autorización y consistencia. El MVP completo incluye órdenes, pago verificado, matrícula, materiales y clases con chat, todavía futuros. El corte actual cubre identidad y preparación administrativa.


Transición: Ese objetivo solo se concreta si sabemos quién puede hacer qué.


Pregunta posible y respuesta: ¿Qué queda fuera? Exámenes, certificados, apps nativas, grabación automática y participación audiovisual del alumno.


Fuentes: `docs/alcance-mvp.md`, `docs/estado-documental.md`, `.specify/memory/constitution.md`


## 03. Tres roles; dos participantes adicionales · 45 s

Los únicos roles de cuenta son Alumno, Docente y Administrador. Visitante es quien no tiene sesión; responsable del entorno es un operador, no un cuarto rol. Todos los roles comparten identidad y perfil. Alumno todavía no dispone del catálogo y docente no dispone de Mis grupos. ADMIN sí gestiona cuentas y prepara oferta. El operador usa CLI restringidas y procedimientos. Los sistemas externos se muestran después en C1.


Transición: Con estos límites podemos convertir necesidades en historias y requisitos verificables.


Pregunta posible y respuesta: ¿Un docente puede editar la oferta? No. PA-01 reserva gestión al administrador; la lectura docente prevista se limita a asignados.


Fuentes: `docs/01-analisis-de-sistema/01-actores.md`, `specs/002-oferta-academica/spec.md`


## 04. Historias que se convierten en controles concretos · 60 s

HU y RF pertenecen al análisis general. US, FR y T se interpretan siempre dentro de 001 o 002: las numeraciones no se mezclan. HU02 lleva a acceso controlado RF03/RF08 y a sesiones revocables de identidad. HU09 refina RF10 en la preparación US1 de 002; solo ese alcance ADMIN está implementado. HU11 describe un destino: pago y matrícula todavía no existen. La trazabilidad vincula historia, regla verificable, decisión y evidencia, en lugar de contar documentos como funciones.


Transición: Además de lo que hace el sistema, necesitamos condiciones de calidad y límites de trabajo.


Pregunta posible y respuesta: ¿RF10 está completo? No. Preparación ADMIN es parcial; consulta, publicación y ciclo siguen pendientes.


Fuentes: `docs/01-analisis-de-sistema/02-historias-del-usuario.md`, `docs/01-analisis-de-sistema/03-requisitos-funcionales.md`, `specs/002-oferta-academica/tasks.md`


## 05. Calidad medible dentro de recursos limitados · 60 s

AC04 exige denegar accesos indebidos en backend, no solo ocultar botones. AC06 exige mantener el núcleo independiente de HTTP y proveedores. AC02 requiere recuperación segura: V16 de identidad está demostrado localmente, pero D13 operativo no está cerrado. AC01 y AC03 conservan el objetivo de 1000 concurrentes sin aprobación; hubo cargas con incumplimientos de /me y continuidad. No confundir 1000 estudiantes previstos con sesiones o espectadores. Recursos: una persona, cuatro meses y S/300 en total.


Transición: Las condiciones que más afectan la estructura se convierten en drivers arquitectónicos.


Pregunta posible y respuesta: ¿Los números de carga son garantías? No. Se limitan a versión, infraestructura y escenario; D10/rúbrica sigue pendiente.


Fuentes: `docs/01-analisis-de-sistema/04-atributos-de-calidad.md`, `docs/01-analisis-de-sistema/05-restricciones.md`, `docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`


## 06. Los drivers priorizan riesgos de estructura · 50 s

Un driver es un requisito o restricción que condiciona la estructura o viabilidad. DA01 y DA07 ya se reflejan en autorización, contratos y pruebas de límites. DA04 hace razonable un solo backend. DA05 exige medir antes de escalar; no autoriza introducir Redis o balanceadores. DA02 condiciona la integridad futura de pagos y matrículas: el ledger académico actual no acredita idempotencia de pagos. DA03 y DA06 siguen presentes en las integraciones futuras, con correo local ya funcional.


Transición: Ahora podemos justificar decisiones concretas, en vez de enumerar tecnologías.


Pregunta posible y respuesta: ¿Por qué no microservicios? DA04/DA07 favorecen simplicidad y cohesión; no hay necesidad distribuida demostrada.


Fuentes: `docs/01-analisis-de-sistema/06-driver-arquitectonicos.md`


## 07. Cada decisión resuelve un riesgo y acepta un costo · 60 s

R01 responde a DA04/DA07 con monolito modular y Clean Architecture: simplifica operación, pero comparte proceso y recursos. R02/R05 responden a DA01 con sesiones persistidas y revalidación transaccional: habilitan revocación y dependen de disponibilidad de BD. R07/R08 responden a DA06 con adaptadores y entrega durable de correo: desacoplan HTTP de SMTP, pero agregan leases/reintentos y no garantizan recepción. R10 evita afirmar capacidad sin evidencia. D02/DEC01 son elecciones futuras de Izipay y YouTube Live con OBS, sin integración acreditada.


Transición: La primera decisión define el estilo del sistema que veremos a continuación.


Pregunta posible y respuesta: ¿Qué desventaja tiene un monolito modular? Despliegue y recursos compartidos; requiere disciplina para que módulos no dependan de internos ajenos.


Fuentes: `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`, `docs/02-arquitectura-software/estilo-arquitectonico.md`


## 08. Un backend; módulos y capas con responsabilidades · 60 s

El estilo es monolito modular por capas. Presentación incluye web y entradas REST; negocio incluye aplicación y dominio; persistencia implementa el acceso a datos. Infraestructura también incluye correo y criptografía. APP02 es un proceso NestJS con identity/users/authorization/mail/audit/academic-offering. No hay un microservicio por módulo. Compose tiene web/api/db/mailpit; esas unidades operativas no coinciden uno a uno con capas o módulos. El scheduler está dentro de API y Mailpit es apoyo local. Las flechas de esta selección representan ejecución.


Transición: El recorrido de una llamada no explica todavía qué código puede importar a qué código.


Pregunta posible y respuesta: ¿Prisma ejecuta todo? No. Modela/genera y pg ejecuta SQL/transacciones explícitas con un pool compartido.


Fuentes: `docs/02-arquitectura-software/estilo-arquitectonico.md`, `docs/02-arquitectura-software/diagrama-arquitectura.md`, `compose.yml`, `docs/diagramas/arquitectura-general.drawio`


Selección del editable: docs/diagramas/arquitectura-general.drawio / Arquitectura vigente. Se conservan nodos/estados y relaciones seleccionadas; cambia distribución y se abrevia texto para exposición.


## 09. Clean Architecture dirige los imports al núcleo · 60 s

Presentación depende de aplicación; aplicación depende de dominio. Infraestructura implementa contratos del núcleo. En ejecución un caso de uso puede invocar el adaptador inyectado sin importar su clase concreta. La raíz AppModule sí conoce implementaciones y las conecta. Dominio y aplicación no importan Nest, pg, Prisma o SMTP. Las responsabilidades son internas a cada módulo según necesidad; no se obliga a crear cuatro módulos globales ni una clase por regla. La evidencia de arquitectura revisa imports y políticas, no certifica universalmente todo ciclo semántico.


Transición: Con la regla de dependencias clara, podemos ampliar el sistema desde el contexto hasta el código.


Pregunta posible y respuesta: ¿Inyección e inversión son lo mismo? No. Inversión trata de dependencias del código; inyección entrega instancias en composición.


Fuentes: `docs/02-arquitectura-software/enfoque-arquitectonico.md`, `docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md`, `apps/api/src/app.module.ts`


## 10. C1 · Personas, sistema y entorno externo · 45 s

Esta es una selección editable de la página funcional C1 sincronizada. Conserva el sistema único y relaciones de origen. A02 usa identidad actual y tendrá oferta/aprendizaje; A04 ya gestiona cuentas y prepara oferta. A03 emite con OBS hacia YouTube como diseño futuro. E01 Izipay y E02 correo externo también son futuros. Se omiten Visitante A01 y operador A05, explicados en actores; Mailpit E03 aparece en la página de apoyo local del editable. No hay control backend–YouTube ni una garantía de protección del video.


Transición: Ampliamos ahora el único sistema para mostrar sus aplicaciones y almacén.


Pregunta posible y respuesta: ¿El chat es de YouTube? No. Socket.IO autorizado por clase está previsto dentro de Academia Virtual y no está implementado.


Fuentes: `docs/04-modelo-c4/01-contexto-del-sistema.md`, `docs/diagramas/c4-contexto-del-sistema.drawio`


Selección del editable: docs/diagramas/c4-contexto-del-sistema.drawio / C1 - Contexto funcional del MVP. Se conservan nodos/estados y relaciones seleccionadas; cambia distribución y se abrevia texto para exposición.


## 11. C2 · Dos aplicaciones y un almacén principal · 60 s

APP01 es React/TypeScript/Vite; la interfaz corre en navegador. APP02 es el backend Node/Nest/TypeScript; Prisma y pg pertenecen a su infraestructura. AL01 es PostgreSQL 16.14 con cinco migraciones de identidad/oferta. REST/JSON lleva cookie y usa proxy local; publicación HTTPS todavía no se acredita. Backend usa un pool para SQL; PostgreSQL no llama proveedores. Las conexiones a Izipay/SMTP real y reproducción de YouTube son futuras. Se omite AL02 de materiales, sin tecnología definida, y el apoyo local E03 Mailpit que sí captura SMTP funcional. Un contenedor C4 no equivale a un contenedor Docker.


Transición: Entramos en APP02 para observar cómo colaboran sus componentes de preparación.


Pregunta posible y respuesta: ¿Hay un worker de correo separado? No. DeliverPending y su scheduler están dentro del proceso API.


Fuentes: `docs/04-modelo-c4/02-contenedores.md`, `docs/diagramas/c4-contenedores.drawio`, `apps/api/src/app.module.ts`


Selección del editable: docs/diagramas/c4-contenedores.drawio / C2 - Contenedores del MVP. Se conservan nodos/estados y relaciones seleccionadas; cambia distribución y se abrevia texto para exposición.


## 12. C3 · Preparación de oferta dentro de APP02 · 60 s

La selección reutiliza todos los nodos y relaciones de la página de preparación de oferta. C01 adapta HTTP y C05 resuelve sesión/academic:manage. C12 contiene comandos/consultas de preparación. C04 ofrece el directorio mínimo: tipos públicos y vista SQL para lecturas bajo una instantánea. C09 proporciona locks, pool y revalidación inyectada desde composición; AL01 conserva agregado, ledger y auditoría. Identidad no recibe callbacks hacia oferta. No hay HTTP entre módulos. Otras capacidades del backend se conservan en las páginas de identidad, composición y correo. AL01 y APP01 están fuera de la frontera APP02.


Transición: Estas colaboraciones sostienen reglas concretas de curso, grupo y preparación.


Pregunta posible y respuesta: ¿Oferta accede a User directamente? Usa AcademicTeacherDirectory pública y capacidades de infraestructura compartida; no correo, hashes ni internos de identidad.


Fuentes: `docs/04-modelo-c4/03-componentes.md`, `docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md`, `specs/002-oferta-academica/contracts/integration.md`, `docs/diagramas/c4-componentes.drawio`


Selección del editable: docs/diagramas/c4-componentes.drawio / 5a - Preparacion de oferta. Se conservan nodos/estados y relaciones seleccionadas; cambia distribución y se abrevia texto para exposición.


## 13. Curso y grupo separan contenido de programación · 60 s

Curso conserva referencia, nombre, descripción y estado editorial. Grupo pertenece a un curso inmutable y define periodo, franjas semanales, America/Lima, capacidad y cero o un docente en preparación. Capacidad configurada es entero de 1 a 50 inclusive; 40–50 es población prevista, no mínimo. Ocupación y disponibilidad son null/NOT_CALCULATED. El contrato permite borradores incompletos; dato omitido no es dato inválido. Actualmente hay cinco mutaciones: POST courses, PATCH courses/:id, POST courses/:courseId/groups, PATCH groups/:id, PUT groups/:id/schedule, bajo /api/v1/admin/academic. Cinco GET: courses, courses/:id, courses/:courseId/groups, groups/:id, teachers. La edición admite preparación DRAFT/WITHDRAWN, pero WITHDRAWN se prepara en fixtures: no hay ruta de retiro. Publicados/cancelados son solo lectura. Guardar no publica ni reserva.


Transición: Para ver la inversión de dependencias sobre código existente, seleccionamos las sesiones.


Pregunta posible y respuesta: ¿Se puede publicar un grupo? Todavía no. PA-02/PA-03/PA-05 lo regulan, pero los comandos publish/withdraw/cancel y consulta alumno/docente siguen pendientes. Exactamente un docente habilitado será obligatorio al publicar; hoy preparación permite cero o uno.


Fuentes: `docs/estado-documental.md`, `specs/002-oferta-academica/contracts/api.md`, `specs/002-oferta-academica/evidence/t028-t029.md`, `apps/api/src/modules/academic-offering/entrypoints/http/admin.controller.ts`


## 14. C4 · Sesiones: un contrato, consumidor y adaptador · 60 s

La selección es estructural y deriva de la primera página C4 de sesiones. SessionLookup conserva referencia SessionRepository y usa permits. El contrato ofrece lookup, accept y revoke; PostgresSessionStore lo implementa. El adaptador no es una subclase de SessionLookup: la línea discontinua con triángulo hueco es realización de interfaz. SessionActor son datos internos, no una credencial enviada al navegador. El adaptador usa pg, huella y reglas puras; la segunda página del editable detalla canUseSession/canAccessApplication. lookup no renueva; accept revalida sin revivir ni ampliar expiración absoluta; revoke es idempotente. revalidateInTransaction usa PoolClient solo en infraestructura, fuera del contrato público.


Transición: La estructura del código permite identificar patrones y principios sin inventar jerarquías.


Pregunta posible y respuesta: ¿Es composición UML por usar un pool compartido? No. Una referencia compartida no demuestra propiedad exclusiva. ¿Realización es herencia? No, aquí implementa una interfaz.


Fuentes: `docs/04-modelo-c4/04-codigo.md`, `apps/api/src/modules/authorization/public/session.ts`, `apps/api/src/modules/authorization/application/session-lookup.ts`, `apps/api/src/modules/identity/infrastructure/session-store.ts`, `docs/diagramas/c4-codigo-sesiones.drawio`


Selección del editable: docs/diagramas/c4-codigo-sesiones.drawio / C4 de sesiones - Contratos. Se conservan nodos/estados y relaciones seleccionadas; cambia distribución y se abrevia texto para exposición.


## 15. Patrones y principios observados en código real · 60 s

Puertos/adaptadores se ve en SessionRepository y PostgresSessionStore, y respalda inversión de dependencias. El patrón de entrega diferida transaccional persiste token y MailDelivery; DeliverPending reclama leases y envía fuera de HTTP. SMTP puede duplicar mensajes aunque consumo del enlace sea único. Idempotencia académica usa actor/commandId y digest, con reautorización antes de replay; no demuestra idempotencia de pagos. Responsabilidad única se observa en schedule.ts sin IO frente a controlador/adaptador. Segregación se ilustra con TeachingDirectory mínimo. No afirmar SOLID completo: SessionLookup recibe revoke sin usarlo; un adaptador productivo no prueba sustitución arbitraria de proveedores. Pool compartido no implica Singleton y BEGIN/COMMIT no prueba Unit of Work.


Transición: Cerramos con lo que la evidencia permite afirmar y los pendientes que siguen abiertos.


Pregunta posible y respuesta: ¿Inyección prueba Strategy? No. Es un mecanismo de composición. Los patrones se identifican por estructura y comportamiento, no por nombres de framework.


Fuentes: `docs/03-diseno-de-software/diseno-interno/patrones-de-diseno.md`, `docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md`, `specs/002-oferta-academica/evidence/t014.md`


## 16. El avance se sostiene con evidencia y límites explícitos · 65 s

Identidad 001 tiene 106/108 tareas y siete checkpoints; T106 histórico acredita 120 unitarias, 744 integraciones y 203 E2E en su versión. Oferta 002 tiene T001–T029 completas y T030–T074 pendientes. T028/T029 acredita 74 HTTP/PG, 30 casos E2E funcionales por dos perfiles: 60 ejecuciones más dos controles; API 266/web 141 y regresión E2E identidad seleccionada 49 no se suman como casos independientes. No se ejecutó otra regresión para esta presentación. T030 sigue pendiente y SC-001 no se completa hasta ciclo. Bootstrap intermitente conserva causa no confirmada. Aceptación humana: 001 T104 diez personas y T108, además de SC-002 humano de oferta. Capacidad 1000 concurrentes sin aprobar; hubo cargas con incumplimientos y nuevos ensayos/VPS aplazados hasta matrícula y D10. D13 custodia, responsables y objetivos operativos siguen pendientes; V16 solo acredita identidad local. SMTP real, Izipay, video/protección y Socket.IO no están verificados; materiales y paneles completos son futuros. D04 y matrícula de D06 abiertas, purga CLI sin programación.


Transición: Abrir preguntas y volver a la trazabilidad: qué requisito motiva una decisión y qué evidencia respalda su estado.


Pregunta posible y respuesta: ¿Qué se puede demostrar hoy? Identidad y preparación ADMIN en el entorno local, sin atribuir publicación, matrícula o capacidad global. ¿Siguiente checkpoint? 002 T030, respetando el flujo ya definido.


Fuentes: `docs/estado-documental.md`, `specs/001-identidad-acceso-roles/evidence/acceptance.md`, `specs/001-identidad-acceso-roles/evidence/regression.md`, `specs/001-identidad-acceso-roles/evidence/load-resources.md`, `specs/002-oferta-academica/evidence/t028-t029.md`, `specs/002-oferta-academica/tasks.md`, `docs/decisiones-pendientes.md`
