import type { ComponentType } from 'react';
import { vi } from 'vitest';
import { ids } from './test-contract';
export interface AdminApi {
  price(id:string,signal?:AbortSignal):Promise<unknown>;
  setPrice(id:string,input:{commandId:string;expectedRevision:string|null;amountMinor:string;currency:'PEN'},signal?:AbortSignal):Promise<unknown>;
  incident(id:string,signal?:AbortSignal):Promise<unknown>;
  incidents(input:{page:number;pageSize:number},signal?:AbortSignal):Promise<unknown>;
  followUp(id:string,input:{commandId:string;content:string},signal?:AbortSignal):Promise<unknown>;
}
export interface PricesController {load(id:string):Promise<void>;edit(amountMinor:string):void;submit():Promise<void>;refresh():Promise<void>;logout():void;snapshot():Readonly<Record<string,unknown>>}
export interface IncidentsController {open(id:string):Promise<void>;edit(content:string):void;submit():Promise<void>;refresh():Promise<void>;logout():void;snapshot():Readonly<Record<string,unknown>>}
interface PricesExports {PricesPage?:ComponentType<{state:Readonly<Record<string,unknown>>}>;createPricesController?:(api:AdminApi,options:{commandId:()=>string})=>PricesController}
interface IncidentsExports {IncidentsPage?:ComponentType<{state:Readonly<Record<string,unknown>>}>;createIncidentsController?:(api:AdminApi,options:{commandId:()=>string})=>IncidentsController}
const prices=import.meta.glob<PricesExports>('./prices-page.tsx',{eager:true}),incidents=import.meta.glob<IncidentsExports>('./incidents-page.tsx',{eager:true});
// No dibuja páginas ni ejecuta una operación sustituta: cada caso falla dentro
// de su capacidad pendiente, sin fallo de carga del archivo o del runner.
export function pricesPage(){const target=Object.values(prices)[0]?.PricesPage;if(!target)throw new Error('T077 pendiente: página de precios no implementada.');return target;}
export function pricesController(api:AdminApi,next:()=>string=()=>ids.intention){const target=Object.values(prices)[0]?.createPricesController;if(!target)throw new Error('T077 pendiente: controlador de precios no implementado.');return target(api,{commandId:next});}
export function incidentsPage(){const target=Object.values(incidents)[0]?.IncidentsPage;if(!target)throw new Error('T078 pendiente: página de incidencias no implementada.');return target;}
export function incidentsController(api:AdminApi,next:()=>string=()=>ids.intention){const target=Object.values(incidents)[0]?.createIncidentsController;if(!target)throw new Error('T078 pendiente: controlador de incidencias no implementado.');return target(api,{commandId:next});}
export const price={courseId:ids.group,defined:true,amountMinor:'12500',currency:'PEN',revision:'2'};
export const incident={id:ids.order,orderId:ids.intention,reason:'LATE_PAYMENT',affectedGroupIds:[ids.group],followUps:[]};
export function adminApi(){return {price:vi.fn<AdminApi['price']>().mockResolvedValue(price),setPrice:vi.fn<AdminApi['setPrice']>().mockResolvedValue({resource:{...price,amountMinor:'14000',revision:'3'},command:{id:ids.intention,replayed:false}}),incident:vi.fn<AdminApi['incident']>().mockResolvedValue(incident),incidents:vi.fn<AdminApi['incidents']>().mockResolvedValue({items:[incident],page:1,pageSize:20,total:1}),followUp:vi.fn<AdminApi['followUp']>().mockResolvedValue({resource:{id:ids.group,incidentId:ids.order,content:'Nota ficticia',recordedAt:'2026-11-12T00:00:00.123456Z'},command:{id:ids.intention,replayed:false}})};}
export function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
