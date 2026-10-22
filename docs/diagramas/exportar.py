"""Exporta el subconjunto Draw.io de estas vistas a SVG estándar sin red.

Lee todas las páginas: texto plano, rectángulos, conectores ortogonales y puertos.
Usa Arial de Windows para medir ajuste. PNG: renderizar.mjs con Chromium/Playwright.
"""
from pathlib import Path
import xml.etree.ElementTree as E
import json
from PIL import ImageFont

HERE=Path(__file__).resolve().parent
OUT=HERE/'imagenes'
OUT.mkdir(exist_ok=True)
FONT=Path('C:/Windows/Fonts/arial.ttf')
NS='http://www.w3.org/2000/svg'
def el(tag,**kw):return E.Element('{'+NS+'}'+tag,{k.replace('_','-'):str(v) for k,v in kw.items()})
def style(c):return dict(x.split('=',1) for x in c.get('style','').split(';') if '=' in x)
def geom(c):
 g=c.find('mxGeometry');return tuple(float(g.get(k,'0')) for k in ('x','y','width','height'))
def wrap(text,width,size):
 font=ImageFont.truetype(str(FONT),size)
 lines=[]
 for para in text.split('\n'):
  line=''
  for word in para.split(' '):
   candidate=(line+' '+word).strip()
   if font.getlength(candidate)>width and line:lines.append(line);line=word
   else:line=candidate
  lines.append(line)
 return lines
def addtext(svg,lines,x,y,size,center=False):
 for i,line in enumerate(lines):
  t=el('text',x=x,y=y+i*size*1.22,font_family='Arial',font_size=size,fill='#18344b',text_anchor='middle' if center else 'start')
  t.text=line;svg.append(t)

def pathfor(c,cells):
 s=style(c);a=geom(cells[c.get('source')]);b=geom(cells[c.get('target')])
 start=(a[0]+a[2]*float(s['exitX']),a[1]+a[3]*float(s['exitY']))
 end=(b[0]+b[2]*float(s['entryX']),b[1]+b[3]*float(s['entryY']))
 points=[(float(p.get('x')),float(p.get('y'))) for p in c.findall('mxGeometry/Array/mxPoint')]
 if not points and start[0]!=end[0] and start[1]!=end[1]:
  mid=(start[0]+end[0])/2;points=[(mid,start[1]),(mid,end[1])]
 return [start]+points+[end]

manifest=[];checks=[]
for file in sorted(HERE.glob('*.drawio')):
 for d in E.parse(file).getroot().findall('diagram'):
  cells={c.get('id'):c for c in d.findall('.//mxCell')}
  svg=el('svg',width=1600,height=900,viewBox='0 0 1600 900',role='img')
  title=el('title');title.text=cells['title'].get('value');svg.append(title)
  defs=el('defs')
  for id,fill in [('arrow','#45647c'),('realize','#ffffff')]:
   m=el('marker',id=id,viewBox='0 0 12 12',refX=11,refY=6,markerWidth=9,markerHeight=9,orient='auto')
   m.append(el('path',d='M 1 1 L 11 6 L 1 11 Z',fill=fill,stroke='#45647c'));defs.append(m)
  svg.append(defs);svg.append(el('rect',x=0,y=0,width=1600,height=900,fill='white'))
  # Boundaries before all connections/nodes.
  vertices=[c for c in cells.values() if c.get('vertex')=='1']
  for c in vertices:
   st=style(c)
   if st.get('dashed')!='1':continue
   x,y,w,h=geom(c);svg.append(el('rect',x=x,y=y,width=w,height=h,fill='white',stroke='#7891a5',stroke_width=2,stroke_dasharray='8 6'))
   addtext(svg,[c.get('value')],x+14,y+31,22)
  labels=[]
  for c in cells.values():
   if c.get('edge')!='1':continue
   pts=pathfor(c,cells);st=style(c)
   attrib={'points':' '.join(f'{x},{y}' for x,y in pts),'fill':'none','stroke':'#45647c','stroke_width':2,'marker_end':'url(#realize)' if st.get('endFill')=='0' else 'url(#arrow)'}
   if st.get('dashed')=='1':attrib['stroke_dasharray']='8 6'
   svg.append(el('polyline',**attrib))
   # Use longest horizontal segment, otherwise longest vertical.
   segs=list(zip(pts,pts[1:]));horizontal=[(a,b) for a,b in segs if a[1]==b[1]]
   a,b=max(horizontal or segs,key=lambda ab:abs(ab[0][0]-ab[1][0])+abs(ab[0][1]-ab[1][1]))
   x=(a[0]+b[0])/2;y=(a[1]+b[1])/2-9
   labels.append((c.get('value',''),x,y))
   # Every segment must avoid the interior of unrelated nodes.
   for a,b in segs:
    assert a[0]==b[0] or a[1]==b[1],(file.name,d.get('name'),'diagonal',a,b)
    for n in vertices:
     if n.get('id') in [c.get('source'),c.get('target')] or style(n).get('rounded')!='1':continue
     nx,ny,nw,nh=geom(n)
     hit=(a[0]==b[0] and nx+2<a[0]<nx+nw-2 and max(min(a[1],b[1]),ny+2)<min(max(a[1],b[1]),ny+nh-2)) or (a[1]==b[1] and ny+2<a[1]<ny+nh-2 and max(min(a[0],b[0]),nx+2)<min(max(a[0],b[0]),nx+nw-2))
     if hit:checks.append(f'{d.get("id")}: {c.get("source")} → {c.get("target")} cruza {n.get("id")}')
  for c in vertices:
   st=style(c)
   if st.get('dashed')=='1':continue
   x,y,w,h=geom(c);size=int(st.get('fontSize','22'));center=st.get('rounded')=='1'
   lines=wrap(c.get('value',''),w-20,size)
   assert len(lines)*size*1.22<=h+1,(file.name,d.get('name'),c.get('id'),'text overflow',lines,h)
   if center:svg.append(el('rect',x=x,y=y,width=w,height=h,rx=8,fill=st.get('fillColor'),stroke='#45647c',stroke_width=2))
   yy=y+(h-len(lines)*size*1.22)/2+size
   addtext(svg,lines,x+w/2 if center else x,yy,size,center)
  for value,x,y in labels:
   if not value:continue
   lines=wrap(value,230,20);font=ImageFont.truetype(str(FONT),20);w=max(font.getlength(l) for l in lines)+12
   svg.append(el('rect',x=x-w/2,y=y-21,width=w,height=len(lines)*24.4+5,fill='white',rx=3))
   addtext(svg,lines,x,y,20,True)
  slug=d.get('id');E.register_namespace('',NS)
  E.ElementTree(svg).write(OUT/(slug+'.svg'),encoding='utf-8',xml_declaration=True)
  manifest.append({'editable':file.name,'page':d.get('name'),'svg':slug+'.svg','png':slug+'.png'})
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(manifest)} páginas SVG exportadas; {len(checks)} cruces con nodos ajenos')
for check in checks:print(check)
if checks:raise SystemExit(1)
