import { useEffect,useMemo,useState,useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { CoursePrice,EnrollmentAdminApi,Page,SetPrice } from './api';
import { AdminLayout,AdminNotice,adminFailure,denied } from './admin-view';
import { Pagination,pen } from './view';

export interface PriceState extends Readonly<Record<string,unknown>> {
  readonly status:string;readonly courseId?:string;readonly price?:CoursePrice;readonly comparison?:CoursePrice;
  readonly expectedRevision?:string|null;readonly amountMinor?:string;readonly amountText?:string;readonly busy?:boolean;
}
const decimal=(minor:string)=>/^(0|[1-9]\d*)$/.test(minor)?`${BigInt(minor)/100n}.${(BigInt(minor)%100n).toString().padStart(2,'0')}`:'';
function minor(text:string){const match=/^(\d+)(?:\.(\d{0,2}))?$/.exec(text);return match?(BigInt(match[1])*100n+BigInt((match[2]??'').padEnd(2,'0'))).toString():'';}
const valid=(value:string|undefined)=>typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)&&BigInt(value)<=9223372036854775807n;
export function createPricesController(api:Pick<EnrollmentAdminApi,'price'|'setPrice'>,options:{commandId:()=>string}){
  let state:PriceState=Object.freeze({status:'EMPTY'}),generation=0,readGeneration=0,readAbort:AbortController|undefined,writeAbort:AbortController|undefined,write:Promise<void>|undefined;
  let intent:{courseId:string;input:SetPrice}|undefined;
  const listeners=new Set<()=>void>(),update=(next:PriceState)=>{state=Object.freeze(next);for(const listener of listeners)listener();};
  const clear=(status:string)=>{generation++;readGeneration++;readAbort?.abort();writeAbort?.abort();intent=undefined;write=undefined;update({status});};
  async function load(id:string){
    if(write)return write;const epoch=++generation;readGeneration++;readAbort?.abort();readAbort=new AbortController();intent=undefined;update({status:'LOADING',busy:true});
    try{const price=await api.price(id,readAbort.signal);if(epoch===generation)update({status:'READY',courseId:id,price,expectedRevision:price.revision,amountMinor:price.amountMinor??'',amountText:price.defined?decimal(price.amountMinor):''});}
    catch(error){if(epoch===generation){const status=adminFailure(error);if(denied(status))clear(status);else update({status,courseId:id});}}
  }
  function send(target:{courseId:string;input:SetPrice}){
    if(write)return write;const epoch=generation;writeAbort=new AbortController();update({...state,status:'SUBMITTING',busy:true});
    const operation=api.setPrice(target.courseId,target.input,writeAbort.signal).then(result=>{
      if(epoch!==generation)return;intent=undefined;const price=result.resource;
      update({status:'SAVED',courseId:target.courseId,price,expectedRevision:price.revision,amountMinor:price.amountMinor??'',amountText:price.defined?decimal(price.amountMinor):''});
    }).catch(error=>{if(epoch!==generation)return;const status=adminFailure(error,true);if(denied(status))clear(status);else update({...state,status,busy:false});})
      .finally(()=>{if(write===operation)write=undefined;});write=operation;return operation;
  }
  const editable=()=>!write&&!denied(state.status)&&state.status!=='UNCERTAIN'&&Boolean(state.price);
  return {snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},load,
    edit(value:string){if(!editable())return;intent=undefined;update({...state,amountMinor:value,amountText:decimal(value),status:['SAVED','VALIDATION_ERROR'].includes(state.status)?'READY':state.status});},
    editText(value:string){if(!editable())return;intent=undefined;update({...state,amountText:value,amountMinor:minor(value),status:['SAVED','VALIDATION_ERROR'].includes(state.status)?'READY':state.status});},
    submit(){if(write)return write;if(state.busy||!state.courseId||!state.price||['UNCERTAIN','CONFLICT','AUTH_REQUIRED','FORBIDDEN','LOADING'].includes(state.status))return Promise.resolve();
      if(!valid(state.amountMinor)){update({...state,status:'VALIDATION_ERROR'});return Promise.resolve();}
      intent={courseId:state.courseId,input:{commandId:options.commandId(),expectedRevision:state.expectedRevision??null,amountMinor:state.amountMinor!,currency:'PEN'}};return send(intent);
    },
    replay(){return state.status==='UNCERTAIN'&&!state.busy&&intent?send(intent):Promise.resolve();},
    async refresh(){if(!state.courseId||write)return;const id=state.courseId,epoch=generation,read=++readGeneration;readAbort?.abort();readAbort=new AbortController();update({...state,busy:true});
      try{const price=await api.price(id,readAbort.signal);if(epoch===generation&&read===readGeneration){if(!state.price)update({status:'READY',courseId:id,price,expectedRevision:price.revision,amountMinor:price.amountMinor??'',amountText:price.defined?decimal(price.amountMinor):''});
        else update({...state,comparison:price,status:['UNCERTAIN','CONFLICT'].includes(state.status)?state.status:'READY',busy:false});}}
      catch(error){if(epoch===generation&&read===readGeneration){const status=adminFailure(error);if(denied(status))clear(status);else update({...state,status:state.status==='UNCERTAIN'?'UNCERTAIN':'ERROR',busy:false});}}
    },
    acceptComparison(){if(write||state.busy||state.status==='UNCERTAIN'||!state.comparison)return;intent=undefined;update({...state,status:'READY',price:state.comparison,expectedRevision:state.comparison.revision,comparison:undefined});},
    logout(){clear('EMPTY');},
  };
}
type PriceActions={editText:(value:string)=>void;submit:()=>void;refresh:()=>void;replay:()=>void;acceptComparison:()=>void};
export function PricesPage({state,actions,children}:{state:PriceState;actions?:PriceActions;children?:ReactNode}){
  const disabled=Boolean(state.busy)||['LOADING','SUBMITTING'].includes(state.status)||!actions,privateView=!denied(state.status),price=state.price;
  return <AdminLayout title="Precios por curso"><AdminNotice status={state.status} saved="Precio guardado. Consulta el valor actual y su revisión."/>{privateView&&<>{children}
    {price&&<section aria-label="Precio del curso"><p>{price.defined?`Precio actual: ${pen(price.amountMinor)}`:'Precio sin definir. Introduce un importe explícito para registrarlo.'}</p><p>Revisión consultada: {price.revision??'Sin precio previo'}</p>
      <form onSubmit={event=>{event.preventDefault();actions?.submit();}}><label htmlFor="course-price-amount">Precio en PEN</label><input id="course-price-amount" inputMode="decimal" autoComplete="off" value={state.amountText??''} onChange={event=>actions?.editText(event.target.value)}
        readOnly={disabled||state.status==='UNCERTAIN'} aria-invalid={state.status==='VALIDATION_ERROR'} aria-describedby="course-price-help"/>
        <p id="course-price-help">Usa punto decimal y hasta dos decimales. El cambio no modifica el desglose ni el vencimiento de órdenes anteriores.</p>{state.status==='VALIDATION_ERROR'&&<p role="alert">Introduce un importe PEN válido y exacto.</p>}
        <button type="submit" disabled={disabled||['UNCERTAIN','CONFLICT'].includes(state.status)}>Guardar precio</button></form>
      <p>Revisión que se enviará: {state.expectedRevision??'Alta de precio'}</p></section>}
    {state.courseId&&<div className="enrollment-actions"><button type="button" disabled={disabled} onClick={actions?.refresh}>Consultar precio guardado para comparar</button>{state.status==='UNCERTAIN'&&<button type="button" disabled={disabled} onClick={actions?.replay}>Repetir el mismo comando</button>}</div>}
    {state.comparison&&<section aria-label="Comparación de precio"><h2>Datos guardados consultados</h2><p>{state.comparison.defined?pen(state.comparison.amountMinor):'Precio sin definir'}</p><p>Revisión guardada: {state.comparison.revision??'Sin precio previo'}</p><p>Tu entrada se conserva. La consulta no confirma el resultado de un comando incierto.</p>
      <button type="button" disabled={disabled||state.status==='UNCERTAIN'} onClick={actions?.acceptComparison}>Usar revisión consultada y conservar importe</button></section>}
    </>}</AdminLayout>;
}
export interface CourseCatalog {courses(input:{page:number;pageSize:number},signal?:AbortSignal):Promise<Page<{readonly id:string;readonly name:string}>>}
export function PricesScreen({api,catalog}:{api:EnrollmentAdminApi;catalog:CourseCatalog}){
  const controller=useMemo(()=>createPricesController(api,{commandId:()=>crypto.randomUUID()}),[api]),state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  const [page,setPage]=useState(1),[courses,setCourses]=useState<Page<{id:string;name:string}>>(),[catalogStatus,setCatalogStatus]=useState('LOADING'),[revision,reload]=useState(0);
  useEffect(()=>()=>controller.logout(),[controller]);
  useEffect(()=>{const abort=new AbortController();setCourses(undefined);setCatalogStatus('LOADING');void catalog.courses({page,pageSize:20},abort.signal).then(value=>{if(!abort.signal.aborted){setCourses(value);setCatalogStatus('READY');}}).catch(error=>{if(!abort.signal.aborted){const status=adminFailure(error);if(denied(status))controller.logout();setCatalogStatus(status);}});return()=>abort.abort();},[catalog,page,revision,controller]);
  const actions={editText:controller.editText,submit:()=>{void controller.submit();},refresh:()=>{void controller.refresh();},replay:()=>{void controller.replay();},acceptComparison:controller.acceptComparison};
  if(denied(catalogStatus))return <PricesPage state={{status:catalogStatus}}/>;
  return <PricesPage state={state} actions={actions}>{catalogStatus!=='READY'&&<><AdminNotice status={catalogStatus}/><button type="button" disabled={catalogStatus==='LOADING'} onClick={()=>reload(value=>value+1)}>Volver a consultar cursos</button></>}<label htmlFor="price-course">Curso</label><select id="price-course" value={state.courseId??''} disabled={state.busy||state.status==='UNCERTAIN'||!courses} onChange={event=>{if(event.target.value)void controller.load(event.target.value);}}>
    <option value="">Selecciona un curso</option>{state.courseId&&!courses?.items.some(course=>course.id===state.courseId)&&<option value={state.courseId}>Curso consultado: {state.courseId}</option>}{courses?.items.map(course=><option key={course.id} value={course.id}>{course.name}</option>)}</select>
    {courses&&<><Pagination page={courses.page} total={courses.total} pageSize={courses.pageSize} busy={Boolean(state.busy)} onPage={setPage}/>{!courses.total&&<p role="status">No hay cursos para fijar precios.</p>}</>}
  </PricesPage>;
}
