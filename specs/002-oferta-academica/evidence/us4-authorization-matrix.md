# Matriz SC-003 — checkpoint US4

Base ejecutada: f6aa09f. Resultado: **350/350 combinaciones + 84/84 pérdidas de acceso**.
Los 434 casos se identifican individualmente en [us4-results.json](us4-results.json),
con contraste automático del producto cartesiano previsto por T055: ninguna combinación omitida.

Actores en cada estado: ADMIN, STUDENT, OWN (docente asignado), OTHER (docente ajeno),
VISITOR. Para cada ruta se ejecutan además sesión revocada, expirada, cambio de rol
y desactivación, las cuatro con 401 y huella académica sin cambios.

| ID | Operación, prefijo /api/v1 | Estados del recurso | Casos actor × estado | Pérdidas de acceso |
| --- | --- | --- | ---: | ---: |
| A01 | GET `/admin/academic/courses` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A02 | POST `/admin/academic/courses` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A03 | GET `/admin/academic/courses/:course` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A04 | PATCH `/admin/academic/courses/:course` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A05 | POST `/admin/academic/courses/:course/publish` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A06 | POST `/admin/academic/courses/:course/withdraw` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A07 | GET `/admin/academic/courses/:course/groups` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A08 | POST `/admin/academic/courses/:course/groups` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| A09 | GET `/admin/academic/groups/:group` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| A10 | PATCH `/admin/academic/groups/:group` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| A11 | PUT `/admin/academic/groups/:group/schedule` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| A12 | POST `/admin/academic/groups/:group/publish` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| A13 | POST `/admin/academic/groups/:group/withdraw` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| A14 | POST `/admin/academic/groups/:group/cancel` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| A15 | GET `/admin/academic/teachers` | NA | 5 | 4/4 |
| C01 | GET `/academic/courses` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| C02 | GET `/academic/courses/:course` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| C03 | GET `/academic/courses/:course/groups` | DRAFT, PUBLISHED, WITHDRAWN | 15 | 4/4 |
| C04 | GET `/academic/courses/:course/groups/:group` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| T01 | GET `/teaching/groups` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |
| T02 | GET `/teaching/groups/:group` | DRAFT, PUBLISHED, WITHDRAWN, CANCELLED | 20 | 4/4 |

El estado aplicable es el del recurso que identifica la ruta. Las rutas de curso
usan DRAFT/PUBLISHED/WITHDRAWN; CANCELLED no existe para cursos. Las de grupo añaden
CANCELLED. El directorio no tiene estado editorial (NA). Alta/listados conservan
el estado de la fixture para comprobar autorización sin confundirlo con el de una
entidad aún inexistente. El contexto del padre se verifica además con las 71 pruebas
de privacidad: tres estados de curso × cuatro de grupo, otro curso publicado ajeno,
filtros antes de conteos/páginas, diagnóstico exclusivo del administrador y GET sin
escrituras de las cinco tablas académicas ni de la generación docente.

ADMIN obtiene lectura administrativa; escritura permitida o 409 según transición
aprobada, con 201 para altas. STUDENT y ADMIN obtienen solo catálogo visible;
los detalles invisibles responden 404. TEACHER tiene 403 en gestión/catálogo;
OWN consulta sus grupos en cualquier estado, OTHER recibe 404 en detalle ajeno y
su propia lista filtrada. ADMIN/STUDENT no acceden a teaching (403). VISITOR recibe
401. Todo rechazo comprueba código seguro, ausencia de datos y cero efectos; cada
éxito de comando verifica un ledger, sin aceptar rutas ausentes como privacidad.

Esta tabla cubre la matriz aprobada, no representa autorización para reservas,
matrícula, pagos o operaciones inexistentes. Véase [checkpoint](us4.md).
