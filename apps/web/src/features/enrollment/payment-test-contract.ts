import { expect,vi } from 'vitest';
import type { ComponentType } from 'react';
import { ids,order } from './test-contract';

/** Puertos privados del ensayo T047. Sin componentes o decisiones sustitutos. */
export interface PaymentApi {
  initiatePayment(orderId:string,initiationId:string,signal?:AbortSignal):Promise<unknown>;
  order(id:string,signal?:AbortSignal):Promise<unknown>;
}
export interface PaymentController {
  start(orderId:string):Promise<void>;refresh():Promise<void>;logout():void;
  snapshot():Readonly<Record<string,unknown>>;
}
interface PaymentExports {
  createPaymentController?:(api:PaymentApi,options:{initiationId:()=>string})=>PaymentController;
  PaymentPanel?:ComponentType<{state:Readonly<Record<string,unknown>>}>;
}
interface EnrollmentExports {EnrollmentsPage?:ComponentType<{state:Readonly<Record<string,unknown>>}>}
const payments=import.meta.glob<PaymentExports>('./order-page.tsx',{eager:true});
const enrollments=import.meta.glob<EnrollmentExports>('./enrollments-page.tsx',{eager:true});
export function paymentController(api:PaymentApi,next:()=>string=()=>ids.intention){const factory=Object.values(payments)[0]?.createPaymentController;expect(factory,'T054 pendiente: controlador de pago ausente; no es fallo de import/configuración').toBeTypeOf('function');return factory!(api,{initiationId:next});}
export function paymentPanel(){const component=Object.values(payments)[0]?.PaymentPanel;expect(component,'T054 pendiente: panel de pago ausente; no es fallo de import/configuración').toBeTypeOf('function');return component!;}
export function enrollmentsPage(){const component=Object.values(enrollments)[0]?.EnrollmentsPage;expect(component,'T054 pendiente: página de matrículas ausente; no es fallo de import/configuración').toBeTypeOf('function');return component!;}
export const attempt={id:ids.group,state:'PENDING'};
export const enrollment={id:ids.intention,orderId:ids.order,courseId:ids.intention,groupId:ids.group,courseName:'Curso original ficticio',groupName:'Grupo original ficticio',state:'ENROLLED',periodStart:'2090-01-02',periodEnd:'2090-03-31',timeZone:'America/Lima',confirmedAt:order.serverNow,validUntil:order.items[0].enrollmentValidUntil,schedule:order.items[0].schedule};
export function apiFixture(){return {initiatePayment:vi.fn<PaymentApi['initiatePayment']>().mockResolvedValue(attempt),order:vi.fn<PaymentApi['order']>().mockResolvedValue({...order,paymentState:'PENDING',paymentAllowed:false})};}
export function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
