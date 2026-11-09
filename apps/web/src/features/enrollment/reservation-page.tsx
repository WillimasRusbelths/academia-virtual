import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ApiFailure } from '../../shared/api-client';
import type { EnrollmentApi, InventoryItem, Preview, ReservationResult } from './api';
import { EnrollmentLayout, Notice, Pagination, Schedule, failureStatus, pen, reasons } from './view';

type FlowApi=Pick<EnrollmentApi,'reserve'|'request'|'requests'|'order'>;
export interface ReservationState {readonly state:string;readonly intentionId?:string;readonly orderId?:string;readonly request?:ReservationResult;readonly requests?:readonly ReservationResult[];readonly canReplay?:boolean;readonly busy?:boolean;readonly message?:string}
/** Una intención vive en memoria. Consultar, recuperar y repetir son acciones distintas. */
export function createReservationFlow(api:FlowApi,options:{intentionId:()=>string}){
  let generation=0,flight:Promise<void>|undefined,payload:{intentionId:string;groupIds:readonly string[]}|undefined;
  let state:ReservationState=Object.freeze({state:'READY'});const listeners=new Set<()=>void>();
  const update=(value:ReservationState)=>{state=Object.freeze(value);for(const listener of listeners)listener();};
  const accept=(request:ReservationResult)=>update({state:request.state,intentionId:request.intentionId,request,orderId:request.state==='CONFIRMED'?request.orderId:undefined,requests:state.requests,busy:true});
  function run(work:(epoch:number)=>Promise<void>):Promise<void>{
    if(flight)return flight;const epoch=generation;
    update({...state,busy:true});
    const operation=work(epoch).catch(error=>{
      if(epoch!==generation)return;const status=failureStatus(error);
      if(status==='AUTH_REQUIRED'||status==='FORBIDDEN'){payload=undefined;update({state:status});}
      else if(status==='VALIDATION_ERROR'){payload=undefined;update({state:status,message:reasons.VALIDATION_ERROR});}
      else update({...state,state:status,message:error instanceof ApiFailure&&error.code==='IDEMPOTENCY_CONFLICT'?reasons.IDEMPOTENCY_CONFLICT:undefined,canReplay:Boolean(payload)});
    }).finally(()=>{if(epoch===generation){flight=undefined;update({...state,busy:false});}});
    flight=operation;return operation;
  }
  function send(){return run(async epoch=>{if(!payload)return;const input=payload;update({...state,state:'SUBMITTING',message:undefined});const result=await api.reserve(input);if(epoch===generation)accept(result);});}
  return {
    snapshot:()=>state,
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    submit(groupIds:readonly string[]):Promise<void>{
      if(flight)return flight;
      if(state.state==='ADMITTED'||state.state==='CONFIRMED')return Promise.resolve();
      const ids=[...groupIds].map(id=>id.toLowerCase()).sort();
      if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))){update({...state,state:'VALIDATION_ERROR',message:reasons.VALIDATION_ERROR});return Promise.resolve();}
      if(payload&&JSON.stringify(payload.groupIds)!==JSON.stringify(ids))return Promise.resolve();
      payload??=Object.freeze({intentionId:options.intentionId(),groupIds:Object.freeze(ids)});update({...state,intentionId:payload.intentionId});return send();
    },
    replay:()=>payload&&state.state==='UNCERTAIN'?send():Promise.resolve(),
    refresh(){return run(async epoch=>{if(!state.intentionId)return;const result=await api.request(state.intentionId);if(epoch===generation)accept(result);});},
    recover(){return run(async epoch=>{const result=await api.requests();if(epoch!==generation)return;
      const prior=payload&&result.items.find(r=>r.intentionId===payload!.intentionId);
      if(payload&&!prior){update({...state,state:'UNCERTAIN',requests:result.items,canReplay:true,busy:true});return;}
      update({...state,state:result.items.length?'READY':'EMPTY',requests:result.items,busy:true});if(prior||result.items[0])accept((prior??result.items[0])!);
    });},
    inspect(intentionId:string){if(payload&&state.state==='UNCERTAIN'&&payload.intentionId!==intentionId)return Promise.resolve();return run(async epoch=>{const result=await api.request(intentionId);if(epoch===generation){payload=undefined;accept(result);}});},
    prepareNew(){return run(async epoch=>{
      if(state.state==='ADMITTED'||state.state==='UNCERTAIN'||state.state==='SUBMITTING')return;
      if(state.state==='CONFIRMED'){
        const order=await api.order(state.orderId!);if(epoch!==generation)return;
        if(order.state==='RESERVED'){update({...state,message:reasons.ACTIVE_ORDER_EXISTS});return;}
      }
      if(epoch===generation){payload=undefined;update({state:'READY',busy:true});}
    });},
    logout(){generation++;flight=undefined;payload=undefined;update({state:'READY'});},
  };
}
export type ReservationFlow=ReturnType<typeof createReservationFlow>;
export interface ReservationViewState {
  readonly status:string;readonly items?:readonly InventoryItem[];readonly evaluatedAt?:string;readonly message?:string;
  readonly selected?:readonly string[];readonly selectedCourseIds?:readonly string[];readonly preview?:Preview;readonly request?:ReservationResult;readonly intentionId?:string;readonly orderId?:string;
  readonly busy?:boolean;readonly canReplay?:boolean;readonly confirmed?:boolean;readonly page?:number;readonly total?:number;readonly q?:string;
}
interface Actions {select:(groupId:string)=>void;preview:()=>void;confirm:()=>void;consent:(value:boolean)=>void;refresh:()=>void;recover:()=>void;replay:()=>void;prepareNew:()=>void;load:(page:number,q:string)=>void}
export function ReservationPage({state,actions}:{state:ReservationViewState;actions?:Actions}){
  const [search,setSearch]=useState(state.q??'');const message=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(['ADMITTED','CONFIRMED','REJECTED','UNCERTAIN','VALIDATION_ERROR','AUTH_REQUIRED','FORBIDDEN'].includes(state.status))message.current?.querySelector<HTMLElement>('[role]')?.focus();},[state.status]);
  const busy=Boolean(state.busy),locked=Boolean(state.intentionId||state.request)||busy,selected=state.selected??[],items=state.items??[];
  const selectedCourses=new Set(state.selectedCourseIds??items.filter(i=>selected.includes(i.groupId)).map(i=>i.courseId));
  return <EnrollmentLayout title="Reservar cursos"><p>Elige un grupo por curso. El resumen es orientativo y la confirmación vuelve a comprobar precio y disponibilidad.</p>
    <div ref={message}><Notice status={state.status} message={state.message}/></div>
    {state.request?.state==='REJECTED'&&<p role="alert">{reasons[state.request.decisionCode]??'La solicitud no permite reservar el conjunto.'}</p>}
    {state.intentionId&&<p className="enrollment-reference">Intención: {state.intentionId}</p>}
    {state.orderId&&<p><a href={`/mis-ordenes/${state.orderId}`}>Consultar orden confirmada</a></p>}
    <div className="enrollment-actions"><button type="button" disabled={busy||!actions} onClick={actions?.recover}>Recuperar solicitudes propias</button>
      <button type="button" disabled={busy||!state.intentionId||!actions} onClick={actions?.refresh}>Consultar estado de la solicitud</button>
      {state.canReplay&&state.status==='UNCERTAIN'&&<button type="button" disabled={busy||!actions} onClick={actions?.replay}>Repetir manualmente la misma intención</button>}
      {(state.status==='REJECTED'||state.status==='CONFIRMED')&&<button type="button" disabled={busy||!actions} onClick={actions?.prepareNew}>Preparar nueva selección</button>}</div>
    <form aria-label="Buscar grupos para reservar" onSubmit={event=>{event.preventDefault();actions?.load(1,search);}}><label htmlFor="reservation-search">Buscar curso o grupo</label>{' '}
      <input id="reservation-search" value={search} disabled={busy} onChange={event=>setSearch(event.target.value)}/><button type="submit" disabled={busy||!actions}>Buscar</button></form>
    {state.evaluatedAt&&<p>Inventario evaluado en <time dateTime={state.evaluatedAt}>{state.evaluatedAt}</time> (UTC).</p>}
    {!items.length&&state.status!=='LOADING'&&<p role="status">No hay grupos disponibles para esta consulta.</p>}
    <fieldset disabled={locked||!actions} aria-describedby="reservation-selection-help reservation-validation" aria-invalid={state.status==='VALIDATION_ERROR'}><legend>Selección de grupos</legend><p id="reservation-selection-help">Selecciona como máximo un grupo por curso. Un precio sin definir no permite reservar.</p>
      <ul className="enrollment-cards">{items.map(item=><li className="enrollment-card" key={item.groupId}><h2>{item.courseName}</h2><h3>{item.groupName}</h3>
        <p>{item.periodStart}–{item.periodEnd} · {item.timeZone}</p><p>Docente: {item.teacherName??'No disponible'}</p><Schedule slots={item.schedule??[]}/>
        <p>Precio: {item.priceMinor===null?'Sin definir':pen(item.priceMinor)}</p><dl><dt>Capacidad máxima</dt><dd>{item.capacity}</dd><dt>Retenciones reservadas</dt><dd>{item.reserved}</dd><dt>Ocupación por matrículas</dt><dd>{item.occupied}</dd><dt>Disponibilidad</dt><dd>{item.available}</dd></dl>
        <label><input type="checkbox" checked={selected.includes(item.groupId)} disabled={item.priceMinor===null||item.available<1||selectedCourses.has(item.courseId)&&!selected.includes(item.groupId)} onChange={()=>actions?.select(item.groupId)}/> Seleccionar {item.groupName}</label>
      </li>)}</ul></fieldset>
    <Pagination page={state.page??1} total={state.total??items.length} pageSize={20} busy={busy} onPage={actions?page=>actions.load(page,state.q??''):undefined}/>
    <p id="reservation-validation" role="status">{state.status==='VALIDATION_ERROR'?'Revisa los grupos seleccionados antes de confirmar.':`${selected.length} grupos seleccionados.`}</p>
    <button type="button" disabled={locked||!selected.length||!actions} onClick={actions?.preview}>Previsualizar selección</button>
    {state.preview&&<section className="enrollment-preview" aria-labelledby="reservation-preview-title"><h2 id="reservation-preview-title">Resumen orientativo</h2>
      <p>Este resumen no reserva plaza, no da prioridad ni congela el precio.</p><ul>{state.preview.items.map(i=><li key={i.groupId}>{i.courseName} · {i.groupName} · {i.priceMinor===null?'Sin definir':pen(i.priceMinor)}</li>)}</ul>
      <p>Total orientativo: {pen(state.preview.totalMinor)}</p><p>Evaluado en <time dateTime={state.preview.evaluatedAt}>{state.preview.evaluatedAt}</time> (UTC).</p>
      <label className="enrollment-confirm"><input type="checkbox" checked={Boolean(state.confirmed)} disabled={locked} onChange={event=>actions?.consent(event.target.checked)}/> Confirmo el conjunto y entiendo que la solicitud esperará una decisión del servidor.</label>
      <button type="button" disabled={locked||!state.confirmed||!actions} onClick={actions?.confirm}>Confirmar solicitud de reserva</button></section>}
  </EnrollmentLayout>;
}

/** Estado controlable sin DOM: selección, preview y consentimiento son una unidad. */
export function createReservationController(api:EnrollmentApi,options:{intentionId:()=>string}){
  const flow=createReservationFlow(api,options),listeners=new Set<()=>void>(),pending=new Set<AbortController>();
  let generation=0,loadVersion=0,previewVersion=0,status='LOADING',loading=false,previewing=false,confirmed=false;
  let selected:readonly InventoryItem[]=[],preview:Preview|undefined;
  const empty=()=>({items:[] as readonly InventoryItem[],total:0,page:1,q:'',evaluatedAt:undefined as string|undefined});
  let catalog=empty(),view:ReservationViewState=Object.freeze({status:'LOADING'});
  const emit=()=>{const decision=flow.snapshot(),active=!['READY','EMPTY'].includes(decision.state);
    view=Object.freeze({...catalog,status:active?decision.state:status,selected:Object.freeze(selected.map(i=>i.groupId)),selectedCourseIds:Object.freeze(selected.map(i=>i.courseId)),preview,confirmed,
      request:decision.request,intentionId:decision.intentionId,orderId:decision.orderId,canReplay:decision.canReplay,busy:Boolean(decision.busy||loading||previewing),message:decision.message});
    for(const listener of listeners)listener();
  };
  const clearDraft=()=>{previewVersion++;preview=undefined;confirmed=false;};
  const clearPrivate=()=>{generation++;loadVersion++;previewVersion++;for(const operation of pending)operation.abort();pending.clear();selected=[];preview=undefined;confirmed=false;catalog=empty();loading=false;previewing=false;};
  flow.subscribe(()=>{if(['AUTH_REQUIRED','FORBIDDEN'].includes(flow.snapshot().state))clearPrivate();emit();});
  const fail=(error:unknown)=>{status=failureStatus(error);if(['AUTH_REQUIRED','FORBIDDEN'].includes(status)){clearPrivate();flow.logout();}emit();};
  async function load(page=1,q=''){
    const epoch=generation,version=++loadVersion,operation=new AbortController();pending.add(operation);loading=true;status='LOADING';emit();
    try{const result=await api.offerings({page,pageSize:20,q},operation.signal);if(epoch===generation&&version===loadVersion){catalog={...result,q};status=result.items.length?'READY':'EMPTY';}}
    catch(error){if(epoch===generation&&version===loadVersion){catalog=empty();fail(error);}}
    finally{pending.delete(operation);if(epoch===generation&&version===loadVersion){loading=false;emit();}}
  }
  return {
    snapshot:()=>view,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},load,
    select(groupId:string){if(flow.snapshot().intentionId||flow.snapshot().busy||previewing||loading)return;
      const item=catalog.items.find(i=>i.groupId===groupId);if(!item)return;
      if(selected.some(i=>i.groupId===groupId))selected=selected.filter(i=>i.groupId!==groupId);
      else if(selected.some(i=>i.courseId===item.courseId)||item.priceMinor===null||item.available<1){status='VALIDATION_ERROR';emit();return;}
      else selected=Object.freeze([...selected,item]);clearDraft();status='READY';emit();
    },
    async preview(){if(previewing||loading||flow.snapshot().intentionId||flow.snapshot().busy||!selected.length)return;
      const epoch=generation,version=++previewVersion;previewing=true;confirmed=false;status='PREVIEWING';emit();
      try{const result=await api.preview(selected.map(i=>i.groupId));if(epoch===generation&&version===previewVersion){preview=result;status='READY';}}
      catch(error){if(epoch===generation&&version===previewVersion){preview=undefined;fail(error);}}
      finally{if(epoch===generation){previewing=false;emit();}}
    },
    consent(value:boolean){confirmed=Boolean(value&&preview&&!previewing&&!flow.snapshot().intentionId);emit();},
    confirm(){if(!confirmed||!preview||previewing||loading||flow.snapshot().busy)return Promise.resolve();clearDraft();emit();return flow.submit(selected.map(i=>i.groupId));},
    refresh:()=>flow.refresh(),recover:()=>{if(!flow.snapshot().intentionId){selected=[];clearDraft();emit();}return flow.recover();},replay:()=>flow.replay(),
    async prepareNew(){const epoch=generation;await flow.prepareNew();if(epoch===generation&&flow.snapshot().state==='READY'){selected=[];clearDraft();status='READY';emit();await load(catalog.page,catalog.q);}},
    logout(){clearPrivate();status='EMPTY';flow.logout();emit();},
  };
}
/** Contenedor listo para composición T039; la pantalla recibe únicamente su API. */
export function ReservationScreen({api}:{api:EnrollmentApi}){
  const controller=useMemo(()=>createReservationController(api,{intentionId:()=>crypto.randomUUID()}),[api]);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{void controller.load();void controller.recover();return()=>controller.logout();},[controller]);
  return <ReservationPage state={state} actions={{select:controller.select,consent:controller.consent,preview:()=>{void controller.preview();},confirm:()=>{void controller.confirm();},
    refresh:()=>{void controller.refresh();},recover:()=>{void controller.recover();},replay:()=>{void controller.replay();},prepareNew:()=>{void controller.prepareNew();},load:(page,q)=>{void controller.load(page,q);}}}/>;
}
