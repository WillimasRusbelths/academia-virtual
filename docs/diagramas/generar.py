"""Genera vistas editables Draw.io. Exportar lee esos XML, no un modelo paralelo.

Python 3, biblioteca estándar; no requiere red ni modificar producto.
"""
from pathlib import Path
import xml.etree.ElementTree as E

HERE = Path(__file__).resolve().parent
COLORS = {'I': '#e5f2ff', 'P': '#fff1d6', 'F': '#f1f3f5'}

class Page:
    def __init__(self, name, slug, title, scope, kind='ejecución'):
        self.name, self.slug, self.kind = name, slug, kind
        self.model = E.Element('mxGraphModel', dx='1600', dy='900', grid='1', gridSize='10', page='1', pageScale='1', pageWidth='1600', pageHeight='900')
        self.root = E.SubElement(self.model, 'root')
        E.SubElement(self.root, 'mxCell', id='0')
        E.SubElement(self.root, 'mxCell', id='1', parent='0')
        self.geoms = {}
        self.text('title',title,30,18,1540,50,32)
        self.text('scope',scope,30,73,1540,58,22)
        self.text('legend','I = implementado en alcance rotulado · P = parcial · F = futuro | Azul / ámbar / gris',30,795,1540,32,21)
        line = 'Continua: colaboración actual · Discontinua: prevista · Flechas de ejecución, sin imports'
        if kind == 'código': line = 'Flechas de código: uso (continua) · realización de interfaz (discontinua, triángulo hueco)'
        self.text('legend2',line,30,830,1540,29,20)
        self.text('source','Fuente: ecb1efe · 2026-10-22 | docs/estado-documental.md · Sin aceptación integral ni capacidad aprobada',30,866,1540,25,18)

    def text(self, id, text, x,y,w,h,size=22):
        c=E.SubElement(self.root,'mxCell',id=id,value=text,style=f'text;html=0;whiteSpace=wrap;align=left;verticalAlign=middle;fontSize={size};fontColor=#18344b;',vertex='1',parent='1')
        E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})

    def boundary(self,id,title,x=325,y=145,w=940,h=615):
        c=E.SubElement(self.root,'mxCell',id=id,value=title,style='rounded=0;html=0;whiteSpace=wrap;align=left;verticalAlign=top;spacing=14;fontSize=22;fillColor=#ffffff;strokeColor=#7891a5;dashed=1;',vertex='1',parent='1')
        E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})

    def box(self,id,title,body,x,y,w=280,h=125,state='I'):
        text = title+'\n'+body+'\n['+state+']'
        c=E.SubElement(self.root,'mxCell',id=id,value=text,style=f'rounded=1;arcSize=8;html=0;whiteSpace=wrap;align=center;verticalAlign=middle;fontSize=21;spacing=10;fillColor={COLORS[state]};strokeColor=#45647c;strokeWidth=2;',vertex='1',parent='1')
        E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
        self.geoms[id]=(x,y,w,h)

    def edge(self,source,target,label='',side='h',future=False,points=(),ports=None,realize=False):
        a,b=self.geoms[source],self.geoms[target]
        if ports is None:
            if side=='h': ports=(1,.5,0,.5) if a[0]<b[0] else (0,.5,1,.5)
            else: ports=(.5,1,.5,0) if a[1]<b[1] else (.5,0,.5,1)
        ex,ey,ix,iy=ports
        start=(a[0]+a[2]*ex,a[1]+a[3]*ey)
        end=(b[0]+b[2]*ix,b[1]+b[3]*iy)
        if not points and start[0]!=end[0] and start[1]!=end[1]:
            mid=(start[0]+end[0])/2
            points=[(mid,start[1]),(mid,end[1])]
        style=f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;fontSize=20;fontColor=#18344b;strokeColor=#45647c;strokeWidth=2;endArrow={"block" if realize else "classic"};endFill={0 if realize else 1};exitX={ex};exitY={ey};entryX={ix};entryY={iy};'
        if future or realize:style+='dashed=1;'
        id='edge-'+str(len(self.root))
        c=E.SubElement(self.root,'mxCell',id=id,value=label,style=style,edge='1',parent='1',source=source,target=target)
        g=E.SubElement(c,'mxGeometry',relative='1',**{'as':'geometry'})
        if points:
            arr=E.SubElement(g,'Array',**{'as':'points'})
            for x,y in points:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))

def save(name,pages):
    root=E.Element('mxfile',host='app.diagrams.net',version='24.7.17',type='device')
    for p in pages:
        d=E.SubElement(root,'diagram',id=p.slug,name=p.name)
        d.append(p.model)
    E.indent(root,space='  ')
    E.ElementTree(root).write(HERE/(name+'.drawio'),encoding='utf-8',xml_declaration=True)

def context():
    p=Page('C1 - Contexto funcional del MVP','c4-contexto-del-sistema','C1 · Academia Virtual y su entorno','Sistema único · Identidad actual; preparación ADMIN parcial; compra y aprendizaje futuros')
    p.box('A01','A01 · Visitante','Registro, verificación\ny acceso',35,155,280,125)
    p.box('A02','A02 · Alumno','Identidad actual\nOferta y aprendizaje futuros',35,320,280,145,state='P')
    p.box('A03','A03 · Docente','Identidad actual\nGrupos/emisión futuros',35,510,280,125,state='P')
    p.box('A04','A04 · Administrador','Cuentas y preparación\nPublicación pendiente',500,600,430,135,state='P')
    p.box('AV','Academia Virtual','Acceso y perfiles\nPreparación de oferta ADMIN\nCompra y aprendizaje previstos',505,260,430,210,state='P')
    p.box('E01','E01 · Izipay','Pago verificado\nIntegración pendiente',1230,155,325,125,state='F')
    p.box('E02','E02 · Correo externo','Entrega real\nProveedor pendiente',1230,355,325,125,state='F')
    p.box('E04-YT','E04-YT · YouTube Live','Video mediante OBS\nProtección por validar',1230,555,325,125,state='F')
    p.edge('A01','AV','acceso',points=[(405,217.5),(405,312.5)],ports=(1,.5,0,.25))
    p.edge('A02','AV','uso parcial',ports=(1,.5,0,.6))
    p.edge('A03','AV','uso parcial',points=[(440,572.5),(440,417.5)],ports=(1,.5,0,.75))
    p.edge('A04','AV','gestiona',side='v')
    p.edge('AV','E01','pago futuro',future=True,points=[(1065,312.5),(1065,217.5)],ports=(1,.25,0,.5))
    p.edge('AV','E02','SMTP futuro',future=True,ports=(1,.75,0,.5))
    # Emission is a person/provider action, no control API from AV to YouTube.
    p.edge('A03','E04-YT','emite con OBS · futuro',future=True,points=[(175,770),(1100,770),(1100,617.5)],ports=(.5,1,0,.5))
    q=Page('C1 - Apoyo operativo y local','c4-contexto-apoyo','C1 · Apoyo operativo y captura local','Mismo sistema · No añade un cuarto rol ni un proveedor de correo de producción')
    q.box('A05','A05 · Responsable','Bootstrap y operación\nCLI restringida',60,290,340,170)
    q.box('AV','Academia Virtual','Identidad y oferta parcial\nOperación local de identidad',630,290,360,170,state='P')
    q.box('E03','E03 · Mailpit local','Captura SMTP funcional\nConsulta HTTP de mensajes',1230,290,330,170)
    q.edge('A05','AV','opera localmente');q.edge('AV','E03','correo de ensayo')
    q.text('note','Bootstrap intermitente abierto · V16 identidad local demostrado · D13 operativo pendiente',120,570,1380,80,24)
    save('c4-contexto-del-sistema',[p,q])

def containers():
    p=Page('C2 - Contenedores del MVP','c4-contenedores','C2 · Aplicaciones y almacenes','Frontera de Academia Virtual · Contenedores C4; no equivalen a capas ni a servicios Docker')
    p.boundary('AV','Academia Virtual',320,145,940,615)
    p.box('A01-A04','A01–A04 · Personas','Navegador\nIdentidad y uso ADMIN',25,300,265,155,state='P')
    p.box('APP01','APP01 · Web','React / TypeScript / Vite\nIdentidad + preparación ADMIN',355,275,335,165,state='P')
    p.box('APP02','APP02 · Backend','Node.js / NestJS / TypeScript\nMonolito modular · Prisma/pg',880,275,335,165,state='P')
    p.box('AL01','AL01 · Datos','PostgreSQL 16.14\nIdentidad + oferta · 5 migraciones',880,580,335,145)
    p.box('AL02','AL02 · Materiales','Tecnología/ubicación\npor definir',355,580,335,145,state='F')
    p.box('E01','E01 · Izipay','Integración pendiente',1300,175,275,125,state='F')
    p.box('E02','E02 · Correo externo','SMTP real pendiente',1300,380,275,125,state='F')
    p.box('E04-YT','E04-YT · YouTube','Video futuro / OBS\nAcceso por validar',1300,585,275,145,state='F')
    p.edge('A01-A04','APP01','usa');p.edge('APP01','APP02','REST / JSON')
    p.edge('APP02','AL01','PostgreSQL / pool',side='v')
    p.edge('APP02','E01','pago',future=True,ports=(1,.25,0,.5))
    p.edge('APP02','E02','SMTP',future=True,ports=(1,.8,0,.5))
    p.edge('APP01','E04-YT','reproducción futura',future=True,points=[(522.5,215),(1275,215),(1275,657.5)],ports=(.5,0,0,.5))
    q=Page('C2 - Apoyo local','c4-contenedores-apoyo','C2 · Entorno local y correo','web / api / db / mailpit son servicios Compose · Scheduler dentro de APP02')
    q.boundary('AV','Academia Virtual',40,155,950,580)
    q.box('APP01','APP01 · Web','Vite sirve desarrollo\nReact en navegador',80,290,330,155,state='P')
    q.box('APP02','APP02 · API','NestJS · servicio api\nDeliverPending + scheduler',610,290,330,155,state='P')
    q.box('AL01','AL01 · PostgreSQL','Servicio db\nVolumen local persistente',610,580,330,125)
    q.box('E03','E03 · Mailpit','Servicio mailpit\nSMTP 1025 / HTTP 8025',1210,290,340,155)
    q.edge('APP01','APP02','/api → REST');q.edge('APP02','AL01','SQL',side='v');q.edge('APP02','E03','SMTP local')
    q.text('note','CLI transitorias reutilizan APP02 · browser-tests es auxiliar · Sin despliegue público acreditado',60,205,900,65,23)
    save('c4-contenedores',[p,q])

CAT=[('C01','REST / transporte','DTO, cookies, errores','I'),('C02','Salud','live / ready de BD','I'),('C03','Identidad y acceso','US1–US7 comprobadas','I'),('C04','Usuarios','Perfil, cuentas, directorio','I'),('C05','Autorización','Sesión + permiso vigente','I'),('C06','Correo interno','Ejecutor / SMTP local','I'),('C07','Auditoría','Atribución sin secretos','I'),('C08','Límites persistidos','Login y cuotas de correo','I'),('C09','Acceso a datos','Pool / SQL / transacciones','I'),('C10','Composición','Entorno y ensamblaje','I'),('C12','Oferta académica','Preparación ADMIN','P'),('C13','Órdenes','Precios y total confiables','F'),('C14','Pagos Izipay','Confirmación auténtica','F'),('C15','Matrículas / cupos','Acceso y consistencia','F'),('C16','Materiales','Publicación y acceso','F'),('C17','Clases en vivo','Contexto y permisos','F'),('C18','Chat de clase','Socket.IO propuesto','F'),('C19','Paneles básicos','Consultas por rol','F')]
def catalog_page(slug,title):
    p=Page('Mapa general de componentes',slug,title,'APP02 · Catálogo de responsabilidades · Las colaboraciones se desglosan en páginas de detalle')
    p.boundary('APP02','APP02 · Backend monolítico',25,140,1550,625)
    for i,(id,name,body,state) in enumerate(CAT):
        col=i%5;row=i//5;p.box(id,id+' · '+name,body,45+col*306,190+row*138,286,120,state)
    p.text('cli','C11 · CLI fuera de HTTP: bootstrap / retención / invalidación [I local] · Bootstrap abierto',45,732,1500,32,21)
    return p

def components():
    pages=[catalog_page('c4-componentes-mapa-general','C3 · Mapa de APP02')]
    p=Page('C3 del backend · Identidad y acceso','c4-componentes-identidad-acceso','C3 · Identidad y acceso','APP02 ampliado · US1–US7 comprobadas; aceptación integral pendiente')
    p.boundary('APP02','APP02 · Backend monolítico',330,145,900,630)
    p.box('APP01','APP01 · Web','Identidad / cuentas',25,210,265,130,state='P')
    p.box('C01','C01 · REST','Entradas de identidad',365,210)
    p.box('C05','C05 · Autorización','SessionLookup / permisos',890,210)
    p.box('C03','C03 · Identidad','Acceso, reset, cuentas',365,420)
    p.box('C04','C04 · Usuarios','Reglas / perfil / consultas',890,420)
    p.box('C06','C06 · Correo','Entrega persistida / scheduler',365,620)
    p.box('C09','C09 · Datos','Pool y adaptadores',890,620)
    p.box('AL01','AL01 · PostgreSQL','Identidad / restricciones',1280,620,295,125)
    p.edge('APP01','C01','JSON');p.edge('C01','C05','sesión + permiso');p.edge('C01','C03','casos de uso',side='v')
    p.edge('C03','C04','contratos públicos');p.edge('C03','C06','programa entrega',side='v');p.edge('C03','C09','persistencia',points=[(589,590),(765,590),(765,682.5)],ports=(.8,1,0,.5))
    p.edge('C09','AL01','SQL');pages.append(p)
    p=Page('3 - Composicion y salud','c4-componentes-composicion','C3 · Composición y salud','APP02 · Flechas «ensambla» son composición al iniciar; no solicitudes de usuario')
    p.boundary('APP02','APP02 · Backend monolítico',35,145,1170,630)
    p.box('C10','C10 · Composición','AppModule / entorno',70,240,310,145)
    p.box('C01','C01 · REST','Controladores / filtros',630,200,310,125)
    p.box('C05','C05 · Autorización','Sesiones inyectadas',630,400,310,125)
    p.box('C02','C02 · Salud','live sin IO / ready BD',70,600,310,125)
    p.box('C09','C09 · Datos','Pool único compartido',630,600,310,125)
    p.box('AL01','AL01 · PostgreSQL','Almacén externo a APP02',1260,600,310,125)
    p.edge('C10','C01','ensambla',ports=(1,.2,0,.5));p.edge('C10','C05','ensambla',ports=(1,.8,0,.5));p.edge('C10','C02','ensambla',side='v')
    p.edge('C02','C09','ready: SELECT 1');p.edge('C09','AL01','PostgreSQL');pages.append(p)
    p=Page('4 - Correo y auditoria','c4-componentes-correo','C3 · Correo y auditoría','APP02 · SMTP fuera de HTTP y de locks prolongados · No garantiza recepción ni envío único')
    p.boundary('APP02','APP02 · Backend monolítico',35,145,1170,630)
    p.box('C03','C03 · Identidad','Token + entrega atómicos',70,220,310,130)
    p.box('C06','C06 · Correo','DeliverPending / scheduler',650,220,310,130)
    p.box('C07','C07 · Auditoría','Cambio aceptado sin secretos',70,590,310,130)
    p.box('C08','C08 · Límites','Admisión y cuota SMTP',650,420,310,125)
    p.box('C09','C09 · Datos','Entregas cifradas / leases',650,610,310,125)
    p.box('E03','E03 · Mailpit','Captura local comprobada',1260,220,310,130)
    p.box('E02','E02 · SMTP real','Proveedor/entrega pendientes',1260,420,310,125,state='F')
    p.edge('C03','C06','programa / procesa');p.edge('C03','C07','audita',side='v');p.edge('C06','C08','admite intento',side='v')
    p.edge('C08','C09','cuotas persistidas',side='v');p.edge('C06','E03','SMTP local');p.edge('C06','E02','SMTP futuro',future=True,ports=(1,.8,0,.5));pages.append(p)
    p=Page('5a - Preparacion de oferta','c4-componentes-oferta','C3 · Preparación de oferta académica','APP02 · Diez rutas ADMIN; T001–T029 · Sin publicación, catálogo alumno ni «Mis grupos»')
    p.boundary('APP02','APP02 · Backend monolítico',330,145,900,630)
    p.box('APP01','APP01 · Web','Formularios / selector ADMIN',25,220,265,145,state='P')
    p.box('C01','C01 · REST','AcademicAdminController',365,220)
    p.box('C05','C05 · Autorización','academic:manage / sesión',900,220)
    p.box('C12','C12 · Oferta','PreparationCommands\nAdministrativeQueries',365,435,280,145,state='P')
    p.box('C04','C04 · Usuarios','TeachingDirectory público\nVista SQL mínima',900,435,280,145)
    p.box('C09','C09 · Datos','Locks / revalidación inyectada',365,640)
    p.box('AL01','AL01 · PostgreSQL','Agregado + ledger + auditoría',1280,640,295,125)
    p.edge('APP01','C01','JSON');p.edge('C01','C05','sesión + permiso');p.edge('C01','C12','preparación',side='v')
    p.edge('C12','C04','contrato / directorio');p.edge('C12','C09','capacidad atómica',side='v');p.edge('C09','AL01','SQL · un pool')
    pages.append(p)
    p=Page('5b - Adquisicion prevista','c4-componentes-adquisicion','C3 · Órdenes, pagos y matrículas previstos','Diseño futuro de APP02 · D01–D06 abiertas; no hay compra, reservas ni disponibilidad real')
    p.boundary('APP02','APP02 · Backend monolítico',35,145,1190,630)
    p.box('C12','C12 · Oferta','Preparación ADMIN actual',70,210,310,130,state='P')
    p.box('C13','C13 · Órdenes','Total calculado en servidor',650,210,310,130,state='F')
    p.box('C15','C15 · Matrículas','Sin duplicados / sobreventa',70,580,310,140,state='F')
    p.box('C14','C14 · Pagos','Confirmación auténtica',650,580,310,140,state='F')
    p.box('E01','E01 · Izipay','Sandbox pendiente',1260,580,310,140,state='F')
    p.edge('C13','C12','oferta futura',future=True);p.edge('C13','C14','orden / cobro',side='v',future=True)
    p.edge('C14','C15','solo pago verificado',future=True);p.edge('C14','E01','inicia / verifica',future=True);pages.append(p)
    p=Page('6 - Acceso academico y chat','c4-componentes-acceso','C3 · Acceso académico y chat previstos','Diseño futuro de APP02 · Matrícula y clase autorizadas; sin control backend–YouTube acreditado')
    p.boundary('APP02','APP02 · Backend monolítico',330,145,1220,630)
    p.box('APP01','APP01 · Web','UI académica pendiente',25,230,265,130,state='P')
    p.box('C16','C16 · Materiales','Publicación / lectura',365,230,300,130,state='F')
    p.box('C17','C17 · Clases','Contexto y permiso',785,230,300,130,state='F')
    p.box('C18','C18 · Chat','Socket.IO propuesto',1205,230,300,130,state='F')
    p.box('C15','C15 · Matrículas','Vigencia por definir',365,590,300,130,state='F')
    p.box('C05','C05 · Autorización','Identidad actual\nAcceso de clase pendiente',785,590,300,145,state='P')
    p.box('C12','C12 · Oferta','Preparación actual\nContexto académico futuro',1205,590,300,145,state='P')
    p.edge('APP01','C16','JSON',future=True);p.edge('C16','C15','vigencia',side='v',future=True);p.edge('C17','C05','permiso',side='v',future=True);p.edge('C18','C12','grupo',side='v',future=True)
    p.edge('C18','C17','clase autorizada',future=True);pages.append(p)
    p=Page('7 - Paneles','c4-componentes-paneles','C3 · Paneles básicos previstos','Diseño futuro de APP02 · Inicio mínimo de identidad ya existe; no equivale a estos paneles')
    p.boundary('APP02','APP02 · Backend monolítico',35,145,1525,630)
    p.box('C19','C19 · Paneles','Consulta datos autorizados',80,350,340,155,state='F')
    p.box('C12','C12 · Oferta','Preparación ADMIN actual',840,210,350,140,state='P')
    p.box('C13-C15','C13 / C14 / C15','Órdenes, pagos, matrículas',840,410,350,140,state='F')
    p.box('C16-C18','C16 / C17 / C18','Materiales, clases, chat',840,610,350,125,state='F')
    p.edge('C19','C12','capacidad pública',future=True,points=[(630,388.75),(630,280)],ports=(1,.25,0,.5))
    p.edge('C19','C13-C15','capacidad pública',future=True,ports=(1,.65,0,.5))
    p.edge('C19','C16-C18','capacidad pública',future=True,points=[(250,560),(560,560),(560,672.5)],ports=(.5,1,0,.5));pages.append(p)
    save('c4-componentes',pages)
    save('componentes-arquitectonicos',[catalog_page('componentes-arquitectonicos','Componentes arquitectónicos · APP02')])

def code():
    p=Page('C4 de sesiones - Contratos','c4-codigo-sesiones','C4 · Sesiones: consumidor y contrato','Código existente · APP02 → C03 sesiones + C05 autorización · Selección, sin clases inventadas',kind='código')
    p.box('SessionLookup','C05 · SessionLookup','class\nauthorize / accepted',70,270,350,170)
    p.box('SessionRepository','C05 · SessionRepository','interface\nlookup / accept / revoke',650,270,350,170)
    p.box('SessionActor','C05 · SessionActor','interface de datos\nsessionId / userId / role\nauthVersion',650,590,350,165)
    p.box('permits','C05 · permits','función pura\nRole + Permission → boolean',70,590,350,165)
    p.box('PostgresSessionStore','C03 · PostgresSessionStore','class implements\nSessionRepository',1220,270,350,170)
    p.edge('SessionLookup','SessionRepository','referencia sessions');p.edge('SessionLookup','permits','usa',side='v');p.edge('SessionRepository','SessionActor','tipos de entrada/salida',side='v')
    p.edge('PostgresSessionStore','SessionRepository','realiza',realize=True)
    q=Page('C4 de sesiones - Adaptador','c4-codigo-adaptador','C4 · Sesiones: adaptador y reglas','Código existente · Infraestructura depende de contratos/reglas; PoolClient no entra en aplicación',kind='código')
    q.box('PostgresSessionStore','C03 · PostgresSessionStore','lookup / accept / revoke\nrevalidateInTransaction',60,250,360,180)
    q.box('Pool','C09 · pg Pool','Tipo de biblioteca\nReferencia compartida',650,180,350,140)
    q.box('canUseSession','C03 · canUseSession','Función de dominio\nCuenta + sesión + now',650,430,350,150)
    q.box('accessSecrets','C03 · accessSecrets.digest','Función de objeto\nHuella del secreto',60,610,360,140)
    q.box('canAccessApplication','C03 · canAccessApplication','Función de dominio\nHabilitación de cuenta',1210,430,350,150)
    q.box('AccessData','C03 · Datos de dominio','AccountAccess / SessionAccess\nInterfaces, no tablas Prisma',650,650,350,120)
    q.edge('PostgresSessionStore','Pool','referencia pool',ports=(1,.2,0,.5));q.edge('PostgresSessionStore','canUseSession','evalúa',ports=(1,.8,0,.5));q.edge('PostgresSessionStore','accessSecrets','usa',side='v')
    q.edge('canUseSession','canAccessApplication','invoca');q.edge('canUseSession','AccessData','recibe',side='v')
    save('c4-codigo-sesiones',[p,q])

def architecture():
    p=Page('Arquitectura vigente','arquitectura-general','Academia Virtual · Arquitectura vigente','Colaboración en ejecución · Tres capas generales; negocio = aplicación + dominio')
    p.boundary('APP02','APP02 · Backend monolítico NestJS',335,145,900,630)
    p.box('APP01','APP01 · Presentación web','React / Vite\nIdentidad + preparación ADMIN',25,220,270,155,state='P')
    p.box('REST','Presentación backend','C01 · REST / DTO / cookies\nC05 · Sesión y permiso',380,220,345,150)
    p.box('BUSINESS','Negocio','C03 / C04 · Identidad / usuarios\nC12 · Preparación de oferta',380,435,345,150,state='P')
    p.box('DATA','Datos / infraestructura','Adaptadores / C09 pool\nSQL, locks, ledger y auditoría',380,640,345,125)
    p.box('FUTURE','Negocio futuro','C13–C19 · Compra, matrícula\nMateriales, clases, chat, paneles',850,435,345,150,state='F')
    p.box('MAIL','C06 · Correo interno','Entregas cifradas\nScheduler fuera de HTTP',850,220,345,150)
    p.box('AL01','AL01 · PostgreSQL','Identidad + oferta',1290,640,280,125)
    p.box('E03','E03 · Mailpit','Captura SMTP local',1290,220,280,150)
    p.edge('APP01','REST','JSON');p.edge('REST','BUSINESS','casos de uso',side='v');p.edge('BUSINESS','DATA','puertos atómicos',side='v')
    p.edge('BUSINESS','MAIL','programa entrega',points=[(785,510),(785,295)],ports=(1,.5,0,.5))
    p.edge('MAIL','E03','SMTP');p.edge('DATA','AL01','PostgreSQL')
    p.text('outside','Integraciones futuras externas:\nver C1–C2',850,615,360,60,22)
    save('arquitectura-general',[p])

if __name__=='__main__':
    context();containers();components();code();architecture()
    print('6 editables / 16 páginas generadas')
