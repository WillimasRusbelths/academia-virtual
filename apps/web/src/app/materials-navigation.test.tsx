import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { materialsRoutes, materialsGroupHref } from './materials-routes';
import { enrollmentRoutes } from './enrollment-routes';
import { createMaterialsApi } from '../features/materials/api';
import { createEnrollmentApi } from '../features/enrollment/api';
import { EnrollmentsPage } from '../features/enrollment/enrollments-page';
const id='11111111-1111-4111-8111-111111111111';
test('MN01 student material routes require enrollment audience and bind account/group identity',()=>{
  const api=createMaterialsApi({request:vi.fn()});
  const first=Reflect.apply(materialsRoutes,undefined,[api,'account-one','STUDENT']);
  const second=Reflect.apply(materialsRoutes,undefined,[api,'account-two','STUDENT']);
  expect(first.map(route=>[route.path,route.access])).toEqual([['/materiales','enrollment'],['/materiales/grupos/:groupId','enrollment']]);
  const one=first[1].render!({groupId:id}),two=second[1].render!({groupId:id});
  expect(isValidElement(one)&&isValidElement(two)&&one.key!==two.key).toBe(true);
  const html=renderToStaticMarkup(one);expect(html).toContain('Materiales del grupo');expect(html).not.toContain('Preparar material');
});
test('MN02 only current enrollments receive the injected materials link in list and detail',()=>{
  const enrollment={id,orderId:id,groupId:id,courseId:id,courseName:'Curso original',groupName:'Grupo original',state:'ENROLLED',periodStart:'2090-01-02',periodEnd:'2090-03-31',timeZone:'America/Lima',schedule:[],confirmedAt:'2026-11-16T10:00:00.000001Z',validUntil:'2090-04-01T05:00:00.000000Z'};
  for(const detail of [false,true])for(const state of ['ENROLLED','HISTORICAL']) {
    const item={...enrollment,state},props={state:{status:'READY',...(detail?{enrollment:item}:{enrollments:{items:[item],page:1,pageSize:20,total:1}})},materialsHref:materialsGroupHref};
    const html=renderToStaticMarkup(createElement(EnrollmentsPage,props));
    expect(html.includes(materialsGroupHref(id))).toBe(state==='ENROLLED');
  }
});
test('MN03 enrollment routes remount when account changes',()=>{
  const api=createEnrollmentApi({request:vi.fn()});
  const first=Reflect.apply(enrollmentRoutes,undefined,[api,materialsGroupHref,'account-one']);
  const second=Reflect.apply(enrollmentRoutes,undefined,[api,materialsGroupHref,'account-two']);
  const a=first.find(route=>route.path==='/mis-matriculas')!.element,b=second.find(route=>route.path==='/mis-matriculas')!.element;
  expect(isValidElement(a)&&isValidElement(b)&&a.key!==b.key).toBe(true);
});
