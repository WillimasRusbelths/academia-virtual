"""Valida el PPTX y el informe de apertura/render real de PowerPoint.

No sustituye la revisión visual. Pillow, ya disponible en el entorno, solo se usa para
crear la vista general; la comprobación OOXML usa biblioteca estándar.
"""
from pathlib import Path
import hashlib, json, posixpath, re, struct, zipfile
import xml.etree.ElementTree as E

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
R='{http://schemas.openxmlformats.org/package/2006/relationships}'
def normalize(s):return re.sub(r'\s+','',s)

model=json.loads((HERE/'presentacion.json').read_text(encoding='utf-8'))
native=json.loads((HERE/'verificacion.json').read_text(encoding='utf-8-sig'))
assert len(model['slides'])==len(native['slides'])==16
assert native['textOverflows']==[]
assert (native['width'],native['height'])==(960,540)
assert sum(s['seconds'] for s in model['slides'])==900
for path,digest in model['sourceHashes'].items():
    assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==digest,('Fuente modificada',path)

deck=HERE/'academia-virtual-arquitectura.pptx'
report={'referenceCommit':model['referenceCommit'],'implementationCommit':model['implementationCommit'],
        'pptxSha256':hashlib.sha256(deck.read_bytes()).hexdigest(),'durationSeconds':900,
        'sourceFilesVerified':len(model['sourceHashes']),'slides':[]}
with zipfile.ZipFile(deck) as z:
    assert z.testzip() is None
    names=set(z.namelist())
    slides=sorted(n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml',n))
    notes=sorted(n for n in names if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml',n))
    assert len(slides)==len(notes)==16
    for name in names:
        if name.endswith('.xml') or name.endswith('.rels'):E.fromstring(z.read(name))
        if name.endswith('.rels'):
            parent=posixpath.dirname(posixpath.dirname(name)) if name!='_rels/.rels' else ''
            for rel in E.fromstring(z.read(name)):
                if rel.get('TargetMode')=='External':continue
                target=rel.get('Target')
                resolved=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(parent,target))
                assert resolved in names,(name,target,resolved)
    for i,s in enumerate(model['slides'],1):
        slide=E.fromstring(z.read(f'ppt/slides/slide{i}.xml'))
        texts=[''.join(x.itertext()) for x in slide.findall('.//a:t',NS)]
        full=normalize(''.join(texts))
        for item in s['items']:
            if item['kind']=='text':assert normalize(item['text']) in full,(i,item['text'])
        assert not slide.findall('.//p:pic',NS),('Una diapositiva quedó rasterizada',i)
        rels=E.fromstring(z.read(f'ppt/slides/_rels/slide{i}.xml.rels'))
        targets=[r.get('Target') for r in rels if r.get('Type','').endswith('/notesSlide')]
        assert len(targets)==1
        note=E.fromstring(z.read(posixpath.normpath(posixpath.join('ppt/slides',targets[0]))))
        nt=' '.join(x.text or '' for x in note.findall('.//a:t',NS))
        for key in ['EXPLICACION','TRANSICION','PREGUNTA POSIBLE Y RESPUESTA','FUENTES',*s['sources']]:assert key in nt,(i,key)
        png=HERE/'render'/f'diapositiva-{i:02d}.png'
        content=png.read_bytes();assert content[:8]==b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II',content[16:24])==(1920,1080)
        assert native['slides'][i-1]['nativeBitmapFormat']=='Format24bppRgb'
        report['slides'].append({'number':i,'title':s['title'],'seconds':s['seconds'],
            'notesPresent':True,'editableShapes':len(slide.findall('.//p:sp',NS)),
            'pngSha256':hashlib.sha256(content).hexdigest()})
(HERE/'verificacion-estructural.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

try:
    from PIL import Image, ImageDraw
    sheet=Image.new('RGB',(1920,1200),'white')
    for i in range(1,17):
        thumb=Image.open(HERE/'render'/f'diapositiva-{i:02d}.png').convert('RGB').resize((480,270))
        x=((i-1)%4)*480;y=((i-1)//4)*300
        sheet.paste(thumb,(x,y))
        ImageDraw.Draw(sheet).text((x+8,y+275),f'{i:02d}',fill='#152d42')
    sheet.save(HERE/'render/vista-general.png')
except ImportError:
    print('Pillow no disponible: no se regenera la vista general. Verificación OOXML y PNG completada.')
print(f'OK: 16 diapositivas, 16 notas, fuentes ({len(model["sourceHashes"])}), relaciones OOXML y renders 1920×1080.')
