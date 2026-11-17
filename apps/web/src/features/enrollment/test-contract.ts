import { expect } from 'vitest';
import type { ComponentType } from 'react';
import type { ApiClient } from '../../shared/api-client';

/** Contratos del ensayo T027; no se importan desde código del producto.
 * Los adaptadores se conectarán a T036–T038. Un módulo ausente falla
 * expresamente; no se simulan páginas o decisiones satisfactorias. */
export const ids={intention:'00000000-0000-4000-8000-000000000001',group:'00000000-0000-4000-8000-000000000002',order:'00000000-0000-4000-8000-000000000003'};
export const admitted={id:ids.intention,intentionId:ids.intention,state:'ADMITTED',admittedAt:'2026-11-04T00:00:00.000001Z'};
export const order={id:ids.order,state:'RESERVED',revision:'1',currency:'PEN',totalMinor:'12500',confirmedAt:'2026-11-04T00:00:00.123456Z',expiresAt:'2026-11-05T00:00:00.123456Z',serverNow:'2026-11-04T00:00:00.123457Z',paymentAllowed:true,
  paymentMessage:null,paymentState:'NOT_PAID',incidentSummary:null,
  items:[{courseId:ids.intention,groupId:ids.group,courseName:'Curso original ficticio',groupName:'Grupo original ficticio',priceMinor:'12500',currency:'PEN',periodStart:'2090-01-02',periodEnd:'2090-03-31',timeZone:'America/Lima',groupStartAt:'2090-01-02T05:00:00.000000Z',enrollmentValidUntil:'2090-04-01T05:00:00.000000Z',schedule:[{dayOfWeek:1,startTime:'18:00',endTime:'19:00'}]}]};
export interface EnrollmentApi {
  offerings(input:{page:number;pageSize:number}):Promise<unknown>;
  preview(groupIds:readonly string[]):Promise<unknown>;
  reserve(input:{intentionId:string;groupIds:readonly string[]}):Promise<unknown>;
  request(intentionId:string):Promise<unknown>;
  requests():Promise<unknown>;
  order(id:string):Promise<unknown>;
}
export interface ReservationFlow {
  submit(groupIds:readonly string[]):Promise<void>;
  refresh():Promise<void>;
  recover():Promise<void>;
  logout():void;
  snapshot():{state:string;intentionId?:string;orderId?:string};
}
interface ApiExports {createEnrollmentApi?:(client:ApiClient)=>EnrollmentApi}
interface ReservationExports {
  ReservationPage?:ComponentType<{state:Readonly<Record<string,unknown>>}>;
  createReservationFlow?:(api:EnrollmentApi,options:{intentionId:()=>string})=>ReservationFlow;
}
interface OrderExports {OrderPage?:ComponentType<{state:Readonly<Record<string,unknown>>}>}
const apis=import.meta.glob<ApiExports>('./api.ts',{eager:true});
const reservations=import.meta.glob<ReservationExports>('./reservation-page.tsx',{eager:true});
const orders=import.meta.glob<OrderExports>('./order-page.tsx',{eager:true});
export function apiTarget(client:ApiClient){const factory=Object.values(apis)[0]?.createEnrollmentApi;expect(factory,'T036 pendiente: API de feature ausente').toBeTypeOf('function');return factory!(client);}
export function flowTarget(api:EnrollmentApi,intentionId:()=>string=()=>ids.intention){const factory=Object.values(reservations)[0]?.createReservationFlow;expect(factory,'T037 pendiente: flujo de reserva ausente').toBeTypeOf('function');return factory!(api,{intentionId});}
export function reservationPage(){const component=Object.values(reservations)[0]?.ReservationPage;expect(component,'T037 pendiente: página de reserva ausente').toBeTypeOf('function');return component!;}
export function orderPage(){const component=Object.values(orders)[0]?.OrderPage;expect(component,'T038 pendiente: página de orden ausente').toBeTypeOf('function');return component!;}
