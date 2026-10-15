import type { Locator,Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Todas las acciones de producto se realizan con Tab/teclado; sin focus(), click() ni hover(). */
export async function keyboardTo(page:Page,target:Locator){
  await expect(target).toBeVisible();await expect(target).toBeEnabled();
  for(let i=0;i<80;i++){
    if(await target.evaluate(element=>element===document.activeElement)){
      const focus=await target.evaluate(element=>{
        const style=getComputedStyle(element);const box=element.getBoundingClientRect();
        const outline=style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0&&style.outlineColor!=='transparent'&&style.outlineColor!=='rgba(0, 0, 0, 0)';
        return {focusVisible:element.matches(':focus-visible'),painted:outline||style.boxShadow!=='none',
          left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:innerWidth,height:innerHeight,tag:element.tagName};
      });
      // Chromium desplaza en píxeles enteros; DOMRect conserva fracciones subpíxel.
      // Comparar en esa misma unidad evita declarar inaccesible un foco visible por 0,34 px.
      const visible=focus.focusVisible&&focus.painted&&Math.ceil(focus.left)>=0&&Math.floor(focus.right)<=focus.width&&
        Math.ceil(focus.top)>=0&&Math.floor(focus.bottom)<=focus.height;
      expect(visible,'US3_PENDING_FOCUS: foco de teclado visible y dentro de la pantalla '+JSON.stringify(focus)).toBe(true);return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('US3_PENDING_KEYBOARD: control visible no alcanzable con Tab.');
}
export async function activate(page:Page,target:Locator){
  await keyboardTo(page,target);
  const href=await target.getAttribute('href');
  if(href){
    const destination=new URL(href,page.url());
    try{await Promise.all([page.waitForURL(url=>url.pathname===destination.pathname,{waitUntil:'load'}),page.keyboard.press('Enter')]);}
    catch{throw new Error('Navegación por teclado no completada. Valores omitidos.');}
  }else await page.keyboard.press('Enter');
}
export async function typeField(page:Page,target:Locator,value:string){
  await keyboardTo(page,target);
  try{await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(value);}
  catch{throw new Error('Entrada por teclado no completada. Valores omitidos.');}
}
export async function choose(page:Page,target:Locator,index:number){
  await keyboardTo(page,target);await page.keyboard.press('Home');
  for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
}
export async function pageFits(page:Page){
  expect(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth),
    'US3_PENDING_LAYOUT: la página no debe tener desplazamiento horizontal').toBe(true);
}
export async function controlsAccessible(page:Page){
  await pageFits(page);
  const controls=page.locator('input:not([type="hidden"]),select,textarea,button,a[href]');
  for(let i=0;i<await controls.count();i++){
    const control=controls.nth(i);if(!await control.isVisible()||!await control.isEnabled()||await control.getAttribute('aria-disabled')==='true')continue;
    await expect(control).toHaveAccessibleName(/\S/);await keyboardTo(page,control);
  }
}
export async function accessibleErrors(page:Page){
  const invalid=page.locator('[aria-invalid="true"]');expect(await invalid.count()>0,'Campos inválidos identificados').toBe(true);
  for(let i=0;i<await invalid.count();i++){
    const described=await invalid.nth(i).evaluate(element=>{
      const ids=(element.getAttribute('aria-describedby')??element.getAttribute('aria-errormessage')??'').split(/\s+/).filter(Boolean);
      return ids.length>0&&ids.every(id=>!!document.getElementById(id)?.textContent?.trim());
    });
    expect(described,'US3_PENDING_ERRORS: cada campo inválido necesita una descripción textual asociada').toBe(true);
    // El contrato pide mensajes anunciables, no una alerta inmediata concreta.
    // Comprobar la descripción accesible al recorrer el error admite aria-describedby.
    await keyboardTo(page,invalid.nth(i));
    await expect(invalid.nth(i)).toHaveAccessibleDescription(/\S/);
  }
  await pageFits(page);
}
