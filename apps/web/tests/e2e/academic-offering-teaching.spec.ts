import { test, expect } from '../support/academic-offering-fixture';
import { activate, choose, controlsAccessible, pageFits, typeField } from '../support/accessibility';
import { enterOffering, teachingSeed, teachingPage, noPrivateTeaching, accessUi, reviewSeed } from '../support/academic-us4-browser';
import { academicFingerprint } from '../../../api/tests/support/academic-preparation.js';

test('D01 inicio enlaza Mis grupos; navegación solo por teclado sin enlaces de gestión',async({page,offering})=>{
  const seed=await teachingSeed(offering);await enterOffering(page,offering);
  const link=page.getByRole('link',{name:'Mis grupos',exact:true});
  expect(await link.count(),'T064 pendiente: enlace Mis grupos ausente en inicio docente').toBe(1);
  await activate(page,link);await expect(page).toHaveURL(/\/mis-grupos$/);
  await activate(page,page.getByRole('link',{name:'Turno A',exact:true}));await expect(page).toHaveURL(new RegExp(`/mis-grupos/${seed.groupId}$`));
  await noPrivateTeaching(page,offering);await controlsAccessible(page);
});
test('D02 lista todos los estados propios y ningún hermano ajeno, sin escrituras',async({page,offering})=>{
  const seed=await teachingSeed(offering);await enterOffering(page,offering);const before=await academicFingerprint(offering.observerPool);
  await teachingPage(page);for(const group of seed.ids)await expect(page.getByRole('link',{name:group.name,exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'US4 Sin configurar',exact:true})).toBeVisible();
  expect(await page.getByRole('link',{name:'Turno B',exact:true}).count()).toBe(0);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);await noPrivateTeaching(page,offering);await pageFits(page);
});
for(const state of ['DRAFT','PUBLISHED','WITHDRAWN','CANCELLED'] as const)test(`D03 ${state}: detalle propio, contexto de curso y datos sin gestión ni motivo`,async({page,offering})=>{
  const seed=await teachingSeed(offering),group=seed.ids.find(g=>g.state===state)!;await enterOffering(page,offering);
  const before=await academicFingerprint(offering.observerPool);await teachingPage(page,`/mis-grupos/${group.id}`);
  await expect(page.getByText(group.name,{exact:true})).toBeVisible();await expect(page.getByText(state==='DRAFT'?'Otro curso':'Curso preparado',{exact:true})).toBeVisible();
  const main=page.locator('main');await expect(main).toContainText('America/Lima');await expect(main).toContainText('18:00');await expect(main).toContainText('19:00');
  await expect(main).toContainText({DRAFT:'Borrador',PUBLISHED:'Publicado',WITHDRAWN:'Retirado',CANCELLED:'Cancelado'}[state]!);await expect(main).toContainText('Lunes');
  await expect(main).toContainText(/19.*10.*2026|2026-10-19/);await expect(main).toContainText(/25.*10.*2026|2026-10-25/);
  await expect(main).toContainText(new RegExp(`Capacidad máxima: ${state==='DRAFT'?45:1} alumnos`));await expect(main).toContainText(/Ocupación y disponibilidad no calculadas/i);
  expect(await page.getByRole('link',{name:'Turno B',exact:true}).count()).toBe(0);await noPrivateTeaching(page,offering);
  expect(await academicFingerprint(offering.observerPool)).toBe(before);await controlsAccessible(page);
});
test('D04 borrador incompleto dice Sin configurar sin inventar capacidad o disponibilidad',async({page,offering})=>{
  const seed=await teachingSeed(offering);await enterOffering(page,offering);await teachingPage(page,`/mis-grupos/${seed.incompleteId}`);
  await expect(page.locator('main')).toContainText('Sin configurar');await expect(page.locator('main')).toContainText('America/Lima');
  expect(await page.locator('main').innerText()).not.toMatch(/quedan \d|0 inscritos|agotado|cupos disponibles/i);await noPrivateTeaching(page,offering);await pageFits(page);
});
test('D05 sin asignaciones muestra vacío después de consultar, no grupos ajenos',async({page,offering})=>{
  await reviewSeed(offering);await offering.context.database.pool.query(`UPDATE "AcademicGroup" SET state='WITHDRAWN' WHERE state='PUBLISHED'`);
  await offering.context.database.pool.query('UPDATE "AcademicGroup" SET "teacherUserId"=$1',[offering.otherTeacher.userId]);
  await enterOffering(page,offering);await teachingPage(page);await expect(page.locator('main')).toContainText(/No (?:hay|tienes).*grupos/i);
  expect(await page.locator('a[href^="/mis-grupos/"]').count()).toBe(0);await noPrivateTeaching(page,offering);
});
test('D06 enlace ajeno exige control propio positivo y ofrece no disponible sin causa privada',async({page,offering})=>{
  const seed=await teachingSeed(offering);await enterOffering(page,offering);await teachingPage(page,`/mis-grupos/${seed.groupId}`);
  const before=await academicFingerprint(offering.observerPool);await page.goto(`/mis-grupos/${seed.otherGroupId}`);
  await expect(page.locator('main')).toContainText(/no disponible/i);expect(await page.getByText('Turno B',{exact:true}).count()).toBe(0);
  await noPrivateTeaching(page,offering);expect(await academicFingerprint(offering.observerPool)).toBe(before);await controlsAccessible(page);
});
for(const target of ['list','detail'])test(`D07 visitante ${target}: acceso exige login sin consulta docente`,async({page,offering})=>{
  const seed=await teachingSeed(offering),reads:string[]=[];page.on('request',r=>{if(r.url().includes('/api/v1/teaching/'))reads.push(r.url());});
  await page.goto(target==='list'?'/mis-grupos':`/mis-grupos/${seed.groupId}`);await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page,'La hidratación de sesión debe terminar en acceso, sin consultar grupos').toHaveURL('http://localhost:5173/login');expect(reads).toHaveLength(0);
  expect(await page.getByText('Turno A',{exact:true}).count()).toBe(0);
});
for(const role of ['ADMIN','STUDENT'] as const)test(`D08 ${role}: denegación segura de ruta docente y retorno a inicio`,async({page,offering})=>{
  await teachingSeed(offering);await enterOffering(page,offering,role);await page.goto('/mis-grupos');await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.getByRole('heading',{name:'Página no disponible',exact:true}).count(),'T064 pendiente: falta ruta docente para comprobar denegación por rol').toBe(0);
  await expect(page.locator('main')).toContainText(/No tienes permiso/i);await activate(page,page.getByRole('link',{name:/inicio/i}));
  await expect(page).toHaveURL(/\/inicio$/);expect(await page.getByRole('link',{name:'Mis grupos',exact:true}).count()).toBe(0);
});
for(const loss of ['revoked','role'] as const)test(`D09 ${loss}: vista abierta limpia datos al rechazo y nuevo login no reenvía`,async({page,offering})=>{
  const seed=await teachingSeed(offering);await enterOffering(page,offering);await teachingPage(page,`/mis-grupos/${seed.groupId}`);
  const context=await page.context().browser()!.newContext({viewport:page.viewportSize()!});const admin=await context.newPage();
  try{
    if(loss==='revoked')await offering.context.database.pool.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[offering.account('TEACHER').sessions[0].id]);
    else{await enterOffering(admin,offering,'ADMIN');await accessUi(admin,offering,'role','STUDENT');}
    const before=await academicFingerprint(offering.observerPool);let writes=0;page.on('request',r=>{if(r.url().includes('/api/v1/teaching/')&&r.method()!=='GET')writes++;});
    await page.reload();await expect(page).toHaveURL(/\/login$/);expect(await page.getByText('Turno A',{exact:true}).count()).toBe(0);
    await typeField(page,page.getByLabel('Correo',{exact:true}),offering.account('TEACHER').email);await typeField(page,page.getByLabel('Contraseña',{exact:true}),offering.account('TEACHER').password);
    await activate(page,page.getByRole('button',{name:'Iniciar sesión',exact:true}));await expect(page).toHaveURL(/\/inicio$/);
    expect(writes).toBe(0);expect(await academicFingerprint(offering.observerPool)).toBe(before);
  }finally{await context.close();}
});
test('D10 respuesta real retrasada tras logout se descarta y no restaura datos privados',async({page,offering})=>{
  const seed=await teachingSeed(offering);await enterOffering(page,offering);await teachingPage(page,`/mis-grupos/${seed.groupId}`);
  let release!:()=>void,arrived!:()=>void;const barrier=new Promise<void>(r=>{release=r;}),received=new Promise<void>(r=>{arrived=r;});let handled:Promise<void>|undefined;
  await page.route(/\/api\/v1\/teaching\/groups(?:\?.*)?$/,route=>{handled=(async()=>{const response=await route.fetch();expect(response.status()).toBe(200);arrived();await barrier;
    try{await route.fulfill({response});}catch(error){expect(String(error),'Solo admitir cancelación del transporte al salir').toMatch(/closed|disposed|intercept|cancel/i);}})();return handled;});
  try{
    await activate(page,page.getByRole('link',{name:/inicio/i}));await activate(page,page.getByRole('link',{name:'Mis grupos',exact:true}));await received;
    await activate(page,page.getByRole('link',{name:/inicio/i}));await activate(page,page.getByRole('button',{name:'Cerrar sesión',exact:true}));await expect(page).toHaveURL(/\/login$/);
    release();await handled;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(page).toHaveURL(/\/login$/);expect(await page.getByText('Turno A',{exact:true}).count()).toBe(0);
    expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  }finally{release();await handled;await page.unrouteAll({behavior:'ignoreErrors'});}
});
test('D11 quitar asignación en otra sesión retira acceso en la siguiente consulta',async({page,offering})=>{
  const seed=await teachingSeed(offering),group=seed.ids.find(g=>g.state==='WITHDRAWN')!;await enterOffering(page,offering);await teachingPage(page,`/mis-grupos/${group.id}`);
  const context=await page.context().browser()!.newContext({viewport:page.viewportSize()!});const admin=await context.newPage();
  try{
    await enterOffering(admin,offering,'ADMIN');await admin.goto(`/admin/oferta/grupos/${group.id}`);
    const selector=admin.getByLabel('Docente asignado',{exact:true});await expect(selector).toBeEnabled();await choose(admin,selector,0);
    const result=admin.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith(`/groups/${group.id}`));
    await activate(admin,admin.getByRole('button',{name:'Guardar grupo',exact:true}));expect((await result).status()).toBe(200);
    await page.reload();await expect(page.locator('main')).toContainText(/no disponible/i);expect(await page.getByText(group.name,{exact:true}).count()).toBe(0);
    await teachingPage(page);expect(await page.getByRole('link',{name:group.name,exact:true}).count()).toBe(0);await noPrivateTeaching(page,offering);
  }finally{await context.close();}
});

test('D12 diagnóstico de revisión solo admin; docente propio conserva consulta sin incidentes privados',async({page,offering})=>{
  const seed=await reviewSeed(offering);await enterOffering(page,offering,'ADMIN');await accessUi(page,offering,'status','DISABLED');await accessUi(page,offering,'status','ACTIVE');
  await page.goto(`/admin/oferta/grupos/${seed.groupId}`);await expect(page.getByText(/Revisión docente requerida/)).toBeVisible();
  // La sesión anterior fue revocada: el docente inicia otra por el flujo existente.
  await activate(page,page.getByRole('link',{name:'Inicio',exact:true}));await activate(page,page.getByRole('button',{name:'Cerrar sesión',exact:true}));
  await typeField(page,page.getByLabel('Correo',{exact:true}),offering.account('TEACHER').email);await typeField(page,page.getByLabel('Contraseña',{exact:true}),offering.account('TEACHER').password);
  await activate(page,page.getByRole('button',{name:'Iniciar sesión',exact:true}));await expect(page).toHaveURL(/\/inicio$/);
  await teachingPage(page,`/mis-grupos/${seed.groupId}`);await expect(page.getByText('Turno A',{exact:true})).toBeVisible();await noPrivateTeaching(page,offering);await controlsAccessible(page);
});
