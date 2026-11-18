// Smoke de interfaz con API simulada. No acredita E2E real de T027 ni permisos
// de servidor. Requiere Vite local en 127.0.0.1:5186 y Chromium ya instalado.
import { chromium,expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const groupId='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333',at='2026-11-18T12:00:00.123456Z';
const browser=await chromium.launch({headless:true}),results=[];
try {
  for(const [role,width] of [['TEACHER',1280],['ADMIN',360]]) {
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
    let resource,loseEdit=false;const ledger=new Map(),writes=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const group={id:groupId,name:'Grupo de prueba',courseName:'Curso de prueba',state:'DRAFT',canPrepare:true};
    await page.route('**/api/v1/**',async route=>{
      const request=route.request(),url=new URL(request.url()),path=url.pathname.replace('/api/v1',''),method=request.method();
      const send=(data,status=200)=>route.fulfill({status,json:{data},headers:{'Cache-Control':'no-store'}});
      if(path==='/me')return send({id:actor,name:'Cuenta de ensayo',email:'synthetic@example.invalid',role,status:'ACTIVE',emailVerified:true,mustSetPassword:false,createdAt:'2026-11-18T12:00:00.000Z'});
      if(method==='GET') {
        if(path==='/classes/groups')return send({items:[group],page:1,pageSize:20,total:1});
        if(path==='/classes/groups/'+groupId)return send(group);
        if(path==='/classes/groups/'+groupId+'/sessions')return send({items:resource?[resource]:[],page:1,pageSize:20,total:resource?1:0});
        if(path==='/classes/sessions/'+id)return send(resource);
        if(path.startsWith('/classes/commands/'))return send(ledger.get(path.split('/').at(-1))??{result:'NOT_CONFIRMED'});
      }
      const input=request.postDataJSON();writes.push({path,method,input});
      if(path==='/classes/groups/'+groupId+'/sessions') {
        resource={id,groupId,title:input.title,description:input.description,state:'PREPARED',revision:'1',viewVersion:'1',createdBy:actor,updatedBy:actor,createdAt:at,updatedAt:at,startedAt:null,finishedAt:null,cancelledAt:null,actions:{edit:true,start:true,finish:false,cancel:true}};
      } else if(path==='/classes/sessions/'+id&&method==='PATCH') {
        resource={...resource,title:input.title,description:input.description,revision:String(Number(resource.revision)+1),viewVersion:String(Number(resource.viewVersion)+1)};
      } else if(path.endsWith('/start'))resource={...resource,state:'LIVE',revision:'2',viewVersion:'2',startedAt:at,actions:{edit:true,start:false,finish:true,cancel:false}};
      else if(path.endsWith('/finish'))resource={...resource,state:'FINISHED',revision:'3',viewVersion:'3',finishedAt:at,actions:{edit:true,start:false,finish:false,cancel:false}};
      else throw new Error('Unexpected simulated route '+path);
      const result={resource,command:{id:input.commandId,replayed:false,result:'APPLIED',appliedRevision:resource.revision,appliedEventSeq:resource.viewVersion}};
      ledger.set(input.commandId,{result:'APPLIED',response:result});
      if(loseEdit&&method==='PATCH'){loseEdit=false;return route.fulfill({status:503,json:{error:{code:'TEMPORARILY_UNAVAILABLE'}}});}
      return send(result,path.endsWith('/sessions')?201:200);
    });
    await page.goto('http://127.0.0.1:5186/clases/grupos/'+groupId);
    await expect(page.getByRole('heading',{name:'Clases del grupo',exact:true})).toBeVisible();
    await page.getByLabel('Título',{exact:true}).fill('Clase de prueba');
    await page.getByRole('button',{name:'Preparar clase',exact:true}).click();
    await expect(page.getByText('Cambio confirmado.',{exact:true})).toBeVisible();expect(writes.length).toBe(1);
    await expect(page.getByText('1 resultado. Página 1.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Iniciar clase',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Confirmar inicio',exact:true})).toBeVisible();
    await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Volver sin cambios'})).toBeFocused();
    await page.keyboard.press('Enter');await expect(page.getByLabel('Título',{exact:true})).toBeFocused();expect(writes.length).toBe(1);
    await page.getByRole('button',{name:'Iniciar clase',exact:true}).click();await page.getByRole('button',{name:'Confirmar cambio de estado'}).click();
    await expect(page.getByText('Estado: En curso. Revisión 2.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Finalizar clase',exact:true}).click();await page.getByRole('button',{name:'Confirmar cambio de estado'}).click();
    await expect(page.getByText('Estado: Finalizada. Revisión 3.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Iniciar clase',exact:true})).toHaveCount(0);
    loseEdit=true;await page.getByLabel('Título',{exact:true}).fill('C'.repeat(160));await page.getByRole('button',{name:'Guardar corrección'}).click();
    await expect(page.getByRole('button',{name:'Consultar comando pendiente'})).toBeVisible();expect(writes.length).toBe(4);
    await page.getByRole('button',{name:'Consultar comando pendiente'}).click();await expect(page.getByText('Cambio confirmado.',{exact:true})).toBeVisible();expect(writes.length).toBe(4);
    await expect(page.getByLabel('Estado de clases',{exact:true})).toBeEnabled();
    const reflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);expect(reflow).toBe(true);expect(errors).toEqual([]);
    await page.screenshot({path:`.cache/classes/t024-t026-${width}.png`,fullPage:true});
    results.push({role,width,passed:true,simulatedApi:true,keyboardConfirmation:true,reflow:true,writes:4,uncertainLookupWithoutReplay:true});await context.close();
  }
  const context=await browser.newContext(),page=await context.newPage();
  await page.route('**/api/v1/me',route=>route.fulfill({json:{data:{id:actor,name:'Alumno de prueba',email:'synthetic@example.invalid',role:'STUDENT',status:'ACTIVE',emailVerified:true,mustSetPassword:false,createdAt:'2026-11-18T12:00:00.000Z'}}}));
  await page.goto('http://127.0.0.1:5186/clases');await expect(page.getByRole('heading',{name:'Acceso no permitido'})).toBeVisible();
  results.push({role:'STUDENT',passed:true,simulatedApi:true,managementDenied:true});await context.close();
  writeFileSync('.cache/classes/t024-t026-browser.json',JSON.stringify({success:true,results,limits:'Simulated API only; real API E2E T027 remains pending.'},null,2)+'\n');
  console.log(JSON.stringify({success:true,scenarios:results.length}));
}finally{await browser.close();}
