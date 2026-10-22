"""Construye la fuente de 16 diapositivas y valida selecciones contra Draw.io.

Solo biblioteca estándar. No modifica fuentes del producto ni diagramas originales.
Coordenadas en puntos PowerPoint: 960 x 540 (16:9).
"""
from pathlib import Path
import json, hashlib, subprocess, xml.etree.ElementTree as ET

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
NAVY='152D42'; TEAL='007F83'; INK='203A4D'; MUTED='536D7D'
BLUE='E5F2FF'; AMBER='FFF1D6'; GREY='F1F3F5'; WHITE='FFFFFF'; PALE='F5F8FA'
SLIDES=[]

def slide(title,section,seconds,explain,transition,question,sources):
    s={'title':title,'section':section,'seconds':seconds,'items':[],
       'explanation':explain,'transition':transition,'question':question,'sources':sources}
    SLIDES.append(s)
    n=len(SLIDES)
    text(s,32,20,880,18,section.upper(),12,TEAL,True)
    text(s,32,48,900,52,title,30,NAVY,True)
    rect(s,32,107,896,2,TEAL)
    text(s,32,515,830,14,'ACADEMIA VIRTUAL   |   Documentación 542c341 · fuente ecb1efe   |   22 OCT 2026',10,MUTED)
    text(s,882,512,46,20,f'{n:02d} / 16',11,MUTED,align='right')
    return s

def text(s,x,y,w,h,value,size=21,color=INK,bold=False,align='left'):
    s['items'].append(dict(kind='text',x=x,y=y,w=w,h=h,text=value,size=size,color=color,bold=bold,align=align))
def rect(s,x,y,w,h,fill=PALE,stroke=None,dash=False):
    s['items'].append(dict(kind='rect',x=x,y=y,w=w,h=h,fill=fill,stroke=stroke,dash=dash))
def line(s,points,dash=False,arrow=True,hollow=False):
    s['items'].append(dict(kind='line',points=points,dash=dash,arrow=arrow,hollow=hollow))
def card(s,x,y,w,h,kicker,heading,body,fill=PALE):
    rect(s,x,y,w,h,fill)
    text(s,x+18,y+15,w-36,22,kicker,13,TEAL,True)
    text(s,x+18,y+47,w-36,53,heading,23,NAVY,True)
    text(s,x+18,y+111,w-36,h-122,body,20)
def band(s,value,y=470,color=TEAL):
    rect(s,32,y,896,33,color)
    text(s,44,y+5,872,25,value,17,WHITE,True)
def legend(s,kind='runtime'):
    label='I: implementado en alcance rotulado  ·  P: parcial  ·  F: futuro'
    text(s,32,477,896,22,label,14,MUTED)
    if kind=='code':
        text(s,32,455,896,20,'Flechas de código: uso; línea discontinua + triángulo hueco: realización de interfaz.',13,MUTED)
    else:
        text(s,32,498,896,15,'Flechas de ejecución: continua = colaboración actual; discontinua = prevista.',12,MUTED)
def node(s,id,x,y,w,h,label,state='I'):
    rect(s,x,y,w,h,{'I':BLUE,'P':AMBER,'F':GREY}[state],'45647C')
    text(s,x+6,y+8,w-12,h-16,label,18,INK,align='center')
def boundary(s,x,y,w,h,label):
    rect(s,x,y,w,h,WHITE,'7891A5',True)
    text(s,x+12,y+7,w-24,21,label,15,MUTED,True)

def diagram_source(s,file,page_id,node_ids,edges):
    path=ROOT/'docs/diagramas'/file
    page=next(d for d in ET.parse(path).getroot().findall('diagram') if d.get('id')==page_id)
    cells={c.get('id'):c for c in page.findall('.//mxCell')}
    actual={(c.get('source'),c.get('target')) for c in cells.values() if c.get('edge')=='1'}
    assert set(node_ids)<=set(cells),node_ids
    assert set(map(tuple,edges))<=actual,(file,set(map(tuple,edges))-actual)
    s['diagram']={'file':'docs/diagramas/'+file,'page':page.get('name'),
                  'pageId':page_id,'nodes':list(node_ids),'edges':edges,
                  'originalLabels':{id:cells[id].get('value') for id in node_ids}}
    if s['diagram']['file'] not in s['sources']:s['sources'].append(s['diagram']['file'])

def build():
    s=slide('Academia Virtual','Análisis · arquitectura · diseño',40,
      'Presentar el sistema como un trabajo universitario en evolución. La exposición sigue una cadena: necesidades, requisitos, drivers, decisiones, estructura y evidencia. La fuente documental es 542c341 y el código de referencia ecb1efe; el árbol local estaba limpio en 542c341 al preparar la presentación.',
      'Partimos del problema que el software debe resolver, antes de hablar de tecnologías.',
      '¿La academia ya está terminada? No. Identidad tiene checkpoints funcionales y oferta dispone de preparación ADMIN; quedan criterios humanos e incrementos futuros.',
      ['docs/informe-sincronizacion-2026-10-22.md','docs/estado-documental.md'])
    rect(s,32,139,896,273,NAVY)
    text(s,58,168,825,98,'De los requisitos\na las decisiones de software',38,WHITE,True)
    text(s,60,300,800,67,'Un monolito modular con alcance y evidencia explícitos.',25,'C9E8E8')
    text(s,34,439,890,44,'16 diapositivas · 15 minutos · implementación local y diseño previsto diferenciados',18,MUTED)

    s=slide('Un acceso coherente a la actividad académica','01 · Problema, objetivo y alcance',55,
      'El problema se formula a partir del alcance del proyecto: coordinar acceso por rol, oferta y una futura compra y experiencia de aprendizaje. No se dispone de una investigación que cuantifique fallos de una academia real: no inventar entrevistas, porcentajes ni un sistema previo. El objetivo es centralizar esas operaciones con autorización y consistencia. El MVP completo incluye órdenes, pago verificado, matrícula, materiales y clases con chat, todavía futuros. El corte actual cubre identidad y preparación administrativa.',
      'Ese objetivo solo se concreta si sabemos quién puede hacer qué.',
      '¿Qué queda fuera? Exámenes, certificados, apps nativas, grabación automática y participación audiovisual del alumno.',
      ['docs/alcance-mvp.md','docs/estado-documental.md','.specify/memory/constitution.md'])
    card(s,32,138,284,302,'NECESIDAD','Coordinar accesos','Roles, oferta y aprendizaje con permisos y datos coherentes.')
    card(s,338,138,284,302,'CORTE IMPLEMENTADO','Identidad + ADMIN','Cuentas, sesiones y preparación de cursos y grupos.',BLUE)
    card(s,644,138,284,302,'MVP PREVISTO','Compra y aprendizaje','Órdenes, pago, matrícula, materiales, clases y chat.',GREY)
    band(s,'Alcance acotado: sin exámenes, certificados ni audio/cámara del alumno.')

    s=slide('Tres roles; dos participantes adicionales','02 · Actores y responsabilidades',45,
      'Los únicos roles de cuenta son Alumno, Docente y Administrador. Visitante es quien no tiene sesión; responsable del entorno es un operador, no un cuarto rol. Todos los roles comparten identidad y perfil. Alumno todavía no dispone del catálogo y docente no dispone de Mis grupos. ADMIN sí gestiona cuentas y prepara oferta. El operador usa CLI restringidas y procedimientos. Los sistemas externos se muestran después en C1.',
      'Con estos límites podemos convertir necesidades en historias y requisitos verificables.',
      '¿Un docente puede editar la oferta? No. PA-01 reserva gestión al administrador; la lectura docente prevista se limita a asignados.',
      ['docs/01-analisis-de-sistema/01-actores.md','specs/002-oferta-academica/spec.md'])
    rows=[('A01','Visitante','Registro Alumno y acceso'),('A02','Alumno','Identidad actual; catálogo previsto'),('A03','Docente','Identidad actual; asignados previstos'),('A04','Administrador','Cuentas y preparación de oferta'),('A05','Responsable del entorno','Bootstrap y operación restringida')]
    for i,(id,name,body) in enumerate(rows):
        y=134+i*63;rect(s,32,y,896,55,BLUE if id=='A04' else PALE)
        text(s,45,y+13,58,30,id,19,TEAL,True);text(s,113,y+12,290,34,name,20,NAVY,True)
        text(s,412,y+12,501,34,body,20)
    text(s,34,467,890,26,'A01 y A05 describen participación; no agregan roles al modelo de cuentas.',18,MUTED)

    s=slide('Historias que se convierten en controles concretos','03 · Trazabilidad de requisitos',60,
      'HU y RF pertenecen al análisis general. US, FR y T se interpretan siempre dentro de 001 o 002: las numeraciones no se mezclan. HU02 lleva a acceso controlado RF03/RF08 y a sesiones revocables de identidad. HU09 refina RF10 en la preparación US1 de 002; solo ese alcance ADMIN está implementado. HU11 describe un destino: pago y matrícula todavía no existen. La trazabilidad vincula historia, regla verificable, decisión y evidencia, en lugar de contar documentos como funciones.',
      'Además de lo que hace el sistema, necesitamos condiciones de calidad y límites de trabajo.',
      '¿RF10 está completo? No. Preparación ADMIN es parcial; consulta, publicación y ciclo siguen pendientes.',
      ['docs/01-analisis-de-sistema/02-historias-del-usuario.md','docs/01-analisis-de-sistema/03-requisitos-funcionales.md','specs/002-oferta-academica/tasks.md'])
    headers=['Historia','Requisito representativo','Resultado o alcance']
    for x,w,h in [(32,220,headers[0]),(262,310,headers[1]),(582,346,headers[2])]:text(s,x+10,140,w-20,28,h,18,TEAL,True)
    rows=[('HU02 · Acceder','RF03 / RF08\nSesión y permiso vigentes','001 US1\nAcceso y cierre comprobados'),('HU09 · Gestionar oferta','RF10 → 002 US1\nFR-001–005 / 015','Preparación ADMIN\nCheckpoint T030 pendiente'),('HU11 · Comprar','RF12 / RF13\nPago auténtico e idempotente','Diseño previsto\nSin pagos ni matrículas')]
    for i,row in enumerate(rows):
        y=183+i*88;rect(s,32,y,896,79,PALE)
        for x,w,value in zip([42,272,592],[202,292,326],row):text(s,x,y+12,w,61,value,19)
    band(s,'Historia → requisito → decisión → componente → evidencia; siempre con el spec identificado.')

    s=slide('Calidad medible dentro de recursos limitados','04 · Calidad y restricciones',60,
      'AC04 exige denegar accesos indebidos en backend, no solo ocultar botones. AC06 exige mantener el núcleo independiente de HTTP y proveedores. AC02 requiere recuperación segura: V16 de identidad está demostrado localmente, pero D13 operativo no está cerrado. AC01 y AC03 conservan el objetivo de 1000 concurrentes sin aprobación; hubo cargas con incumplimientos de /me y continuidad. No confundir 1000 estudiantes previstos con sesiones o espectadores. Recursos: una persona, cuatro meses y S/300 en total.',
      'Las condiciones que más afectan la estructura se convierten en drivers arquitectónicos.',
      '¿Los números de carga son garantías? No. Se limitan a versión, infraestructura y escenario; D10/rúbrica sigue pendiente.',
      ['docs/01-analisis-de-sistema/04-atributos-de-calidad.md','docs/01-analisis-de-sistema/05-restricciones.md','docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md'])
    entries=[('AC04 · Seguridad','Denegación en API y reautorización de escrituras'),('AC06 · Mantenibilidad','Núcleo sin HTTP, SQL ni proveedores'),('AC02 · Recuperación','V16 local de identidad; D13 operativo pendiente'),('AC01 / AC03 · Capacidad','1000 concurrentes: objetivo sin aprobar')]
    for i,(a,b) in enumerate(entries):
        y=138+i*68;rect(s,32,y,896,60,PALE);text(s,47,y+12,279,36,a,20,NAVY,True);text(s,340,y+12,570,36,b,19)
    band(s,'RT01 / RT02 / RT05 · 1 persona · 4 meses · S/300 totales · complejidad justificada')

    s=slide('Los drivers priorizan riesgos de estructura','05 · Drivers arquitectónicos',50,
      'Un driver es un requisito o restricción que condiciona la estructura o viabilidad. DA01 y DA07 ya se reflejan en autorización, contratos y pruebas de límites. DA04 hace razonable un solo backend. DA05 exige medir antes de escalar; no autoriza introducir Redis o balanceadores. DA02 condiciona la integridad futura de pagos y matrículas: el ledger académico actual no acredita idempotencia de pagos. DA03 y DA06 siguen presentes en las integraciones futuras, con correo local ya funcional.',
      'Ahora podemos justificar decisiones concretas, en vez de enumerar tecnologías.',
      '¿Por qué no microservicios? DA04/DA07 favorecen simplicidad y cohesión; no hay necesidad distribuida demostrada.',
      ['docs/01-analisis-de-sistema/06-driver-arquitectonicos.md'])
    items=[('DA01','Acceso vigente','Permisos en servidor; aislamiento por recurso'),('DA07','Evolución modular','Contratos públicos; reglas separadas de IO'),('DA04','Viabilidad','Una unidad backend con operación sencilla'),('DA05','Capacidad demostrable','Medir latencias, errores y recursos'),('DA02','Integridad futura','Pago, cupos y matrícula sin duplicados')]
    for i,(id,title,body) in enumerate(items):
        y=135+i*67;rect(s,32,y,896,59,PALE);text(s,44,y+14,70,30,id,19,TEAL,True);text(s,126,y+13,265,32,title,20,NAVY,True);text(s,405,y+13,505,32,body,19)

    s=slide('Cada decisión resuelve un riesgo y acepta un costo','06 · Decisiones justificadas',60,
      'R01 responde a DA04/DA07 con monolito modular y Clean Architecture: simplifica operación, pero comparte proceso y recursos. R02/R05 responden a DA01 con sesiones persistidas y revalidación transaccional: habilitan revocación y dependen de disponibilidad de BD. R07/R08 responden a DA06 con adaptadores y entrega durable de correo: desacoplan HTTP de SMTP, pero agregan leases/reintentos y no garantizan recepción. R10 evita afirmar capacidad sin evidencia. D02/DEC01 son elecciones futuras de Izipay y YouTube Live con OBS, sin integración acreditada.',
      'La primera decisión define el estilo del sistema que veremos a continuación.',
      '¿Qué desventaja tiene un monolito modular? Despliegue y recursos compartidos; requiere disciplina para que módulos no dependan de internos ajenos.',
      ['docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md','docs/02-arquitectura-software/estilo-arquitectonico.md'])
    rows=[('DA04 / DA07 → R01','Monolito modular','Menor coordinación; proceso compartido'),('DA01 → R02 / R05','Sesiones + transacciones','Revocación efectiva; dependencia de BD'),('DA06 → R07 / R08','Adaptadores + correo','HTTP independiente; reintentos y leases'),('DA05 → R10','Medir antes de dimensionar','Resultados acotados; sin capacidad aprobada')]
    for i,(a,b,c) in enumerate(rows):
        y=138+i*79;rect(s,32,y,896,70,PALE);text(s,46,y+10,250,26,a,16,TEAL,True);text(s,46,y+36,250,27,b,18,NAVY,True);text(s,327,y+22,581,40,c,20)

    s=slide('Un backend; módulos y capas con responsabilidades','07 · Estilo arquitectónico',60,
      'El estilo es monolito modular por capas. Presentación incluye web y entradas REST; negocio incluye aplicación y dominio; persistencia implementa el acceso a datos. Infraestructura también incluye correo y criptografía. APP02 es un proceso NestJS con identity/users/authorization/mail/audit/academic-offering. No hay un microservicio por módulo. Compose tiene web/api/db/mailpit; esas unidades operativas no coinciden uno a uno con capas o módulos. El scheduler está dentro de API y Mailpit es apoyo local. Las flechas de esta selección representan ejecución.',
      'El recorrido de una llamada no explica todavía qué código puede importar a qué código.',
      '¿Prisma ejecuta todo? No. Modela/genera y pg ejecuta SQL/transacciones explícitas con un pool compartido.',
      ['docs/02-arquitectura-software/estilo-arquitectonico.md','docs/02-arquitectura-software/diagrama-arquitectura.md','compose.yml'])
    boundary(s,246,127,442,332,'APP02 · NestJS · un proceso')
    node(s,'APP01',32,233,180,93,'APP01 · Web\nReact / Vite\nP','P')
    node(s,'REST',280,168,243,72,'Presentación · REST\nI')
    node(s,'BUSINESS',280,272,243,80,'Negocio · núcleo\nIdentidad + oferta · P','P')
    node(s,'DATA',280,385,243,63,'Persistencia · pg / pool\nI')
    node(s,'MAIL',545,168,125,82,'C06 · Correo\nEjecutor · I')
    node(s,'E03',718,165,210,85,'E03 · Mailpit\nCaptura SMTP local · I')
    node(s,'AL01',718,377,210,72,'AL01 · PostgreSQL\nI')
    line(s,[(212,279),(246,279),(246,204),(280,204)])
    line(s,[(401,240),(401,272)]);line(s,[(401,352),(401,385)])
    line(s,[(523,310),(538,310),(538,209),(545,209)]);line(s,[(670,209),(718,209)])
    line(s,[(523,416),(718,416)])
    text(s,718,279,210,82,'Módulos cohesionados;\nsin HTTP entre ellos.',20,MUTED)
    legend(s)
    diagram_source(s,'arquitectura-general.drawio','arquitectura-general',['APP01','REST','BUSINESS','DATA','MAIL','AL01','E03'],[['APP01','REST'],['REST','BUSINESS'],['BUSINESS','DATA'],['BUSINESS','MAIL'],['MAIL','E03'],['DATA','AL01']])

    s=slide('Clean Architecture dirige los imports al núcleo','08 · Enfoque y dependencias',60,
      'Presentación depende de aplicación; aplicación depende de dominio. Infraestructura implementa contratos del núcleo. En ejecución un caso de uso puede invocar el adaptador inyectado sin importar su clase concreta. La raíz AppModule sí conoce implementaciones y las conecta. Dominio y aplicación no importan Nest, pg, Prisma o SMTP. Las responsabilidades son internas a cada módulo según necesidad; no se obliga a crear cuatro módulos globales ni una clase por regla. La evidencia de arquitectura revisa imports y políticas, no certifica universalmente todo ciclo semántico.',
      'Con la regla de dependencias clara, podemos ampliar el sistema desde el contexto hasta el código.',
      '¿Inyección e inversión son lo mismo? No. Inversión trata de dependencias del código; inyección entrega instancias en composición.',
      ['docs/02-arquitectura-software/enfoque-arquitectonico.md','docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md','apps/api/src/app.module.ts'])
    boundary(s,325,161,300,270,'NÚCLEO · tipos y contratos')
    node(s,'presentation',32,209,240,85,'Presentación\nHTTP / CLI · I')
    node(s,'application',353,209,244,85,'Aplicación\nCasos de uso y puertos · I')
    node(s,'domain',353,337,244,75,'Dominio\nReglas puras · I')
    node(s,'infrastructure',686,209,242,110,'Infraestructura\npg / SMTP / Argon2\nI')
    line(s,[(272,251),(353,251)]);line(s,[(475,294),(475,337)]);line(s,[(686,251),(597,251)])
    text(s,641,339,281,76,'Implementa contratos;\nAppModule conecta\nlas instancias.',20,MUTED)
    band(s,'Flechas = imports. En ejecución, el caso de uso llama al adaptador mediante su contrato.')

    s=slide('C1 · Personas, sistema y entorno externo','09 · Contexto del sistema',45,
      'Esta es una selección editable de la página funcional C1 sincronizada. Conserva el sistema único y relaciones de origen. A02 usa identidad actual y tendrá oferta/aprendizaje; A04 ya gestiona cuentas y prepara oferta. A03 emite con OBS hacia YouTube como diseño futuro. E01 Izipay y E02 correo externo también son futuros. Se omiten Visitante A01 y operador A05, explicados en actores; Mailpit E03 aparece en la página de apoyo local del editable. No hay control backend–YouTube ni una garantía de protección del video.',
      'Ampliamos ahora el único sistema para mostrar sus aplicaciones y almacén.',
      '¿El chat es de YouTube? No. Socket.IO autorizado por clase está previsto dentro de Academia Virtual y no está implementado.',
      ['docs/04-modelo-c4/01-contexto-del-sistema.md','docs/diagramas/c4-contexto-del-sistema.drawio'])
    text(s,32,117,896,24,'Selección editable del C1 sincronizado · A01/A05 y apoyo local se explican en notas.',14,MUTED)
    node(s,'A02',32,167,223,78,'A02 · Alumno\nIdentidad actual · P','P')
    node(s,'A04',32,293,223,78,'A04 · Administrador\nGestión ADMIN · P','P')
    node(s,'A03',32,402,223,62,'A03 · Docente\nIdentidad actual · P','P')
    node(s,'AV',358,211,253,157,'Academia Virtual\nIdentidad + preparación ADMIN\nCompra / aprendizaje futuros\nP','P')
    node(s,'E01',740,155,188,75,'E01 · Izipay\nPago futuro · F','F')
    node(s,'E02',740,277,188,75,'E02 · Correo externo\nSMTP real futuro · F','F')
    node(s,'E04-YT',740,398,188,66,'E04-YT · YouTube\nEmisión futura · F','F')
    line(s,[(255,206),(304,206),(304,250),(358,250)])
    line(s,[(255,332),(308,332),(308,329),(358,329)])
    line(s,[(611,251),(673,251),(673,192),(740,192)],True)
    line(s,[(611,329),(681,329),(681,315),(740,315)],True)
    line(s,[(255,433),(640,433),(640,431),(740,431)],True)
    text(s,396,405,226,26,'OBS → YouTube · previsto',15,MUTED)
    legend(s)
    diagram_source(s,'c4-contexto-del-sistema.drawio','c4-contexto-del-sistema',['A02','A03','A04','AV','E01','E02','E04-YT'],[['A02','AV'],['A04','AV'],['AV','E01'],['AV','E02'],['A03','E04-YT']])

    s=slide('C2 · Dos aplicaciones y un almacén principal','10 · Contenedores C4',60,
      'APP01 es React/TypeScript/Vite; la interfaz corre en navegador. APP02 es el backend Node/Nest/TypeScript; Prisma y pg pertenecen a su infraestructura. AL01 es PostgreSQL 16.14 con cinco migraciones de identidad/oferta. REST/JSON lleva cookie y usa proxy local; publicación HTTPS todavía no se acredita. Backend usa un pool para SQL; PostgreSQL no llama proveedores. Las conexiones a Izipay/SMTP real y reproducción de YouTube son futuras. Se omite AL02 de materiales, sin tecnología definida, y el apoyo local E03 Mailpit que sí captura SMTP funcional. Un contenedor C4 no equivale a un contenedor Docker.',
      'Entramos en APP02 para observar cómo colaboran sus componentes de preparación.',
      '¿Hay un worker de correo separado? No. DeliverPending y su scheduler están dentro del proceso API.',
      ['docs/04-modelo-c4/02-contenedores.md','docs/diagramas/c4-contenedores.drawio','apps/api/src/app.module.ts'])
    text(s,32,117,896,24,'Selección del C2 sincronizado · apoyo Mailpit y AL02 previsto: notas y editable original.',14,MUTED)
    boundary(s,32,147,643,313,'ACADEMIA VIRTUAL')
    node(s,'APP01',57,215,225,100,'APP01 · Web\nReact / TS / Vite\nP','P')
    node(s,'APP02',393,215,250,100,'APP02 · Backend\nNestJS / TS · Prisma / pg\nP','P')
    node(s,'AL01',393,371,250,75,'AL01 · PostgreSQL 16.14\nIdentidad + oferta · I')
    node(s,'E01',747,151,181,76,'E01 · Izipay\nF','F')
    node(s,'E02',747,272,181,76,'E02 · SMTP real\nF','F')
    node(s,'E04-YT',747,393,181,72,'E04-YT · YouTube\nF','F')
    line(s,[(282,265),(393,265)]);text(s,286,233,107,22,'REST / JSON',13,MUTED)
    line(s,[(518,315),(518,371)]);text(s,528,337,104,20,'SQL / pool',13,MUTED)
    line(s,[(643,240),(695,240),(695,189),(747,189)],True)
    line(s,[(643,288),(703,288),(703,310),(747,310)],True)
    line(s,[(170,315),(170,475),(703,475),(703,429),(747,429)],True)
    legend(s)
    diagram_source(s,'c4-contenedores.drawio','c4-contenedores',['APP01','APP02','AL01','E01','E02','E04-YT'],[['APP01','APP02'],['APP02','AL01'],['APP02','E01'],['APP02','E02'],['APP01','E04-YT']])

    s=slide('C3 · Preparación de oferta dentro de APP02','11 · Componentes y colaboraciones',60,
      'La selección reutiliza todos los nodos y relaciones de la página de preparación de oferta. C01 adapta HTTP y C05 resuelve sesión/academic:manage. C12 contiene comandos/consultas de preparación. C04 ofrece el directorio mínimo: tipos públicos y vista SQL para lecturas bajo una instantánea. C09 proporciona locks, pool y revalidación inyectada desde composición; AL01 conserva agregado, ledger y auditoría. Identidad no recibe callbacks hacia oferta. No hay HTTP entre módulos. Otras capacidades del backend se conservan en las páginas de identidad, composición y correo. AL01 y APP01 están fuera de la frontera APP02.',
      'Estas colaboraciones sostienen reglas concretas de curso, grupo y preparación.',
      '¿Oferta accede a User directamente? Usa AcademicTeacherDirectory pública y capacidades de infraestructura compartida; no correo, hashes ni internos de identidad.',
      ['docs/04-modelo-c4/03-componentes.md','docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md','specs/002-oferta-academica/contracts/integration.md'])
    text(s,32,117,896,24,'Ampliación editable de «5a · Preparación de oferta» · flechas de ejecución.',14,MUTED)
    boundary(s,236,146,532,319,'APP02 · BACKEND MONOLÍTICO')
    node(s,'APP01',32,194,178,80,'APP01 · Web\nOferta ADMIN · P','P')
    node(s,'C01',262,194,223,80,'C01 · REST\nControlador ADMIN · I')
    node(s,'C05',552,194,190,80,'C05 · Autorización\nSesión + permiso · I')
    node(s,'C12',262,302,223,80,'C12 · Oferta\nPreparación ADMIN · P','P')
    node(s,'C04',552,302,190,80,'C04 · Usuarios\nDirectorio mínimo · I')
    node(s,'C09',262,402,223,60,'C09 · Datos\nLocks / pool · I')
    node(s,'AL01',791,402,137,60,'AL01 · Datos\nPostgreSQL · I')
    line(s,[(210,234),(262,234)]);line(s,[(485,234),(552,234)])
    line(s,[(373,274),(373,302)]);line(s,[(485,342),(552,342)])
    line(s,[(373,382),(373,402)]);line(s,[(485,432),(791,432)])
    legend(s)
    diagram_source(s,'c4-componentes.drawio','c4-componentes-oferta',['APP01','C01','C05','C12','C04','C09','AL01'],[['APP01','C01'],['C01','C05'],['C01','C12'],['C12','C04'],['C12','C09'],['C09','AL01']])

    s=slide('Curso y grupo separan contenido de programación','12 · Diseño de la preparación ADMIN',60,
      'Curso conserva referencia, nombre, descripción y estado editorial. Grupo pertenece a un curso inmutable y define periodo, franjas semanales, America/Lima, capacidad y cero o un docente en preparación. Capacidad configurada es entero de 1 a 50 inclusive; 40–50 es población prevista, no mínimo. Ocupación y disponibilidad son null/NOT_CALCULATED. El contrato permite borradores incompletos; dato omitido no es dato inválido. Actualmente hay cinco mutaciones: POST courses, PATCH courses/:id, POST courses/:courseId/groups, PATCH groups/:id, PUT groups/:id/schedule, bajo /api/v1/admin/academic. Cinco GET: courses, courses/:id, courses/:courseId/groups, groups/:id, teachers. La edición admite preparación DRAFT/WITHDRAWN, pero WITHDRAWN se prepara en fixtures: no hay ruta de retiro. Publicados/cancelados son solo lectura. Guardar no publica ni reserva.',
      'Para ver la inversión de dependencias sobre código existente, seleccionamos las sesiones.',
      '¿Se puede publicar un grupo? Todavía no. PA-02/PA-03/PA-05 lo regulan, pero los comandos publish/withdraw/cancel y consulta alumno/docente siguen pendientes. Exactamente un docente habilitado será obligatorio al publicar; hoy preparación permite cero o uno.',
      ['docs/estado-documental.md','specs/002-oferta-academica/contracts/api.md','specs/002-oferta-academica/evidence/t028-t029.md','apps/api/src/modules/academic-offering/entrypoints/http/admin.controller.ts'])
    card(s,32,138,282,265,'CURSO','Identidad del curso','Nombre, descripción y estado editorial.',BLUE)
    card(s,336,138,282,265,'GRUPO','Programación','Periodo, franjas, America/Lima y docente.',AMBER)
    card(s,640,138,288,265,'CAPACIDAD','Entero de 1 a 50','Ocupación y disponibilidad no calculadas.',AMBER)
    text(s,34,420,892,42,'5 mutaciones: crear/editar curso · crear/editar grupo · reemplazar franjas.',20,NAVY,True)
    band(s,'ADMIN: listar y consultar; selector docente. Guardar no publica ni reserva plazas.')

    s=slide('C4 · Sesiones: un contrato, consumidor y adaptador','13 · Selección concreta del código',60,
      'La selección es estructural y deriva de la primera página C4 de sesiones. SessionLookup conserva referencia SessionRepository y usa permits. El contrato ofrece lookup, accept y revoke; PostgresSessionStore lo implementa. El adaptador no es una subclase de SessionLookup: la línea discontinua con triángulo hueco es realización de interfaz. SessionActor son datos internos, no una credencial enviada al navegador. El adaptador usa pg, huella y reglas puras; la segunda página del editable detalla canUseSession/canAccessApplication. lookup no renueva; accept revalida sin revivir ni ampliar expiración absoluta; revoke es idempotente. revalidateInTransaction usa PoolClient solo en infraestructura, fuera del contrato público.',
      'La estructura del código permite identificar patrones y principios sin inventar jerarquías.',
      '¿Es composición UML por usar un pool compartido? No. Una referencia compartida no demuestra propiedad exclusiva. ¿Realización es herencia? No, aquí implementa una interfaz.',
      ['docs/04-modelo-c4/04-codigo.md','apps/api/src/modules/authorization/public/session.ts','apps/api/src/modules/authorization/application/session-lookup.ts','apps/api/src/modules/identity/infrastructure/session-store.ts'])
    text(s,32,117,896,24,'Selección editable C4: APP02 → C03 sesiones; colaboradores C05 y C09.',14,MUTED)
    node(s,'SessionLookup',32,192,255,109,'C05 · SessionLookup\nClase · authorize / accepted\nI')
    node(s,'SessionRepository',352,192,256,109,'C05 · SessionRepository\nInterfaz · lookup / accept / revoke\nI')
    node(s,'PostgresSessionStore',675,192,253,109,'C03 · PostgresSessionStore\nClase adaptadora\nI')
    node(s,'permits',32,355,255,78,'C05 · permits\nFunción pura · I')
    node(s,'SessionActor',352,355,256,78,'C05 · SessionActor\nInterfaz de datos · I')
    line(s,[(287,246),(352,246)])
    line(s,[(675,246),(608,246)],True,True,True)
    line(s,[(159,301),(159,355)]);line(s,[(480,301),(480,355)])
    legend(s,'code')
    diagram_source(s,'c4-codigo-sesiones.drawio','c4-codigo-sesiones',['SessionLookup','SessionRepository','PostgresSessionStore','permits','SessionActor'],[['SessionLookup','SessionRepository'],['PostgresSessionStore','SessionRepository'],['SessionLookup','permits'],['SessionRepository','SessionActor']])

    s=slide('Patrones y principios observados en código real','14 · Decisiones de diseño interno',60,
      'Puertos/adaptadores se ve en SessionRepository y PostgresSessionStore, y respalda inversión de dependencias. El patrón de entrega diferida transaccional persiste token y MailDelivery; DeliverPending reclama leases y envía fuera de HTTP. SMTP puede duplicar mensajes aunque consumo del enlace sea único. Idempotencia académica usa actor/commandId y digest, con reautorización antes de replay; no demuestra idempotencia de pagos. Responsabilidad única se observa en schedule.ts sin IO frente a controlador/adaptador. Segregación se ilustra con TeachingDirectory mínimo. No afirmar SOLID completo: SessionLookup recibe revoke sin usarlo; un adaptador productivo no prueba sustitución arbitraria de proveedores. Pool compartido no implica Singleton y BEGIN/COMMIT no prueba Unit of Work.',
      'Cerramos con lo que la evidencia permite afirmar y los pendientes que siguen abiertos.',
      '¿Inyección prueba Strategy? No. Es un mecanismo de composición. Los patrones se identifican por estructura y comportamiento, no por nombres de framework.',
      ['docs/03-diseno-de-software/diseno-interno/patrones-de-diseno.md','docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md','specs/002-oferta-academica/evidence/t014.md'])
    rows=[('Puertos y adaptadores','SessionRepository ↔ PostgresSessionStore','Inversión de dependencias'),('Entrega diferida transaccional','MailDelivery + DeliverPending','SMTP fuera de HTTP; puede duplicar'),('Idempotencia académica','actor + commandId + digest','Reautorizar antes de replay'),('Responsabilidad / segregación','schedule.ts y TeachingDirectory mínimo','Reglas sin IO; contrato acotado')]
    for i,(a,b,c) in enumerate(rows):
        y=138+i*78;rect(s,32,y,896,69,PALE)
        text(s,46,y+8,343,27,a,19,NAVY,True);text(s,46,y+38,430,27,b,16,MUTED)
        text(s,493,y+19,417,41,c,19)
    band(s,'Ejemplos comprobados; sin certificar SOLID completo ni sustituibilidad universal.')

    s=slide('El avance se sostiene con evidencia y límites explícitos','15 · Estado, evidencia y pendientes',65,
      'Identidad 001 tiene 106/108 tareas y siete checkpoints; T106 histórico acredita 120 unitarias, 744 integraciones y 203 E2E en su versión. Oferta 002 tiene T001–T029 completas y T030–T074 pendientes. T028/T029 acredita 74 HTTP/PG, 30 casos E2E funcionales por dos perfiles: 60 ejecuciones más dos controles; API 266/web 141 y regresión E2E identidad seleccionada 49 no se suman como casos independientes. No se ejecutó otra regresión para esta presentación. T030 sigue pendiente y SC-001 no se completa hasta ciclo. Bootstrap intermitente conserva causa no confirmada. Aceptación humana: 001 T104 diez personas y T108, además de SC-002 humano de oferta. Capacidad 1000 concurrentes sin aprobar; hubo cargas con incumplimientos y nuevos ensayos/VPS aplazados hasta matrícula y D10. D13 custodia, responsables y objetivos operativos siguen pendientes; V16 solo acredita identidad local. SMTP real, Izipay, video/protección y Socket.IO no están verificados; materiales y paneles completos son futuros. D04 y matrícula de D06 abiertas, purga CLI sin programación.',
      'Abrir preguntas y volver a la trazabilidad: qué requisito motiva una decisión y qué evidencia respalda su estado.',
      '¿Qué se puede demostrar hoy? Identidad y preparación ADMIN en el entorno local, sin atribuir publicación, matrícula o capacidad global. ¿Siguiente checkpoint? 002 T030, respetando el flujo ya definido.',
      ['docs/estado-documental.md','specs/001-identidad-acceso-roles/evidence/acceptance.md','specs/001-identidad-acceso-roles/evidence/regression.md','specs/001-identidad-acceso-roles/evidence/load-resources.md','specs/002-oferta-academica/evidence/t028-t029.md','specs/002-oferta-academica/tasks.md','docs/decisiones-pendientes.md'])
    rect(s,32,138,432,189,BLUE);rect(s,486,138,442,189,AMBER)
    text(s,48,153,402,27,'001 · IDENTIDAD',15,TEAL,True)
    text(s,48,192,402,70,'7 checkpoints\n106 / 108 tareas',26,NAVY,True)
    text(s,48,271,402,46,'T106: 120 unidad · 744 integración\n203 E2E; evidencia histórica',17)
    text(s,502,153,409,27,'002 · OFERTA ADMIN',15,TEAL,True)
    text(s,502,192,409,70,'Preparación comprobada\nT001–T029; T030 pendiente',24,NAVY,True)
    text(s,502,271,409,46,'74 HTTP/PG · 60 ejecuciones E2E\n+ 2 controles (T028/T029)',17)
    text(s,34,347,894,60,'Abiertos: bootstrap · aceptación humana · 1000 concurrentes\nD13 · integraciones externas',21,NAVY,True)
    text(s,34,413,894,25,'SMTP real, Izipay y video/chat: sin integración verificada.',17,MUTED)
    band(s,'Pendientes: publicación, ciclo y consulta alumno/docente; compra y aprendizaje futuros.',y=448)

    assert len(SLIDES)==16 and sum(s['seconds'] for s in SLIDES)==900
    for s in SLIDES:
        for p in s['sources']:assert (ROOT/p).exists(),p
        for item in s['items']:
            if item['kind']!='line':
                assert item['x']>=0 and item['y']>=0 and item['x']+item['w']<=960 and item['y']+item['h']<=540,(s['title'],item)
    return SLIDES

if __name__=='__main__':
    slides=build()
    sources=sorted({p for s in slides for p in s['sources']})
    data={'width':960,'height':540,'referenceCommit':'542c341','implementationCommit':'ecb1efe','durationSeconds':900,'slides':slides,
          'sourceHashes':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sources}}
    (HERE/'presentacion.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    notes=['# Guion del presentador · Academia Virtual','16 diapositivas · 900 segundos (15 minutos). El tiempo es una pauta de ensayo, no una medición humana.']
    for i,s in enumerate(slides,1):
        notes += [f'\n## {i:02d}. {s["title"]} · {s["seconds"]} s',s['explanation'],
                  '\nTransición: '+s['transition'],'\nPregunta posible y respuesta: '+s['question'],
                  '\nFuentes: '+', '.join('`'+p+'`' for p in s['sources'])]
        if s.get('diagram'):notes.append('\nSelección del editable: '+s['diagram']['file']+' / '+s['diagram']['page']+'. Se conservan nodos/estados y relaciones seleccionadas; cambia distribución y se abrevia texto para exposición.')
    (HERE/'notas-presentador.md').write_text('\n\n'.join(notes)+'\n',encoding='utf-8')
    print('16 diapositivas / 900 segundos; fuentes y aristas Draw.io validadas.')
