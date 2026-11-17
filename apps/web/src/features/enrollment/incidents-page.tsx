import { useEffect,useMemo,useSyncExternalStore } from 'react';
import type { EnrollmentAdminApi,FollowUp,FollowUpInput,Incident } from './api';
import { AdminLayout,AdminNotice,adminFailure,denied } from './admin-view';

export interface IncidentState extends Readonly<Record<string,unknown>> {readonly status:string;readonly incident?:Incident;readonly followUps?:readonly FollowUp[];readonly content?:string;readonly busy?:boolean;readonly incidentId?:string}
export function createIncidentsController(api:Pick<EnrollmentAdminApi,'incident'|'followUp'>,options:{commandId:()=>string}){
  let state:IncidentState=Object.freeze({status:'EMPTY'}),generation=0,readGeneration=0,readAbort:AbortController|undefined,writeAbort:AbortController|undefined,write:Promise<void>|undefined;
  let intent:{id:string;input:FollowUpInput}|undefined;
  const listeners=new Set<()=>void>(),update=(next:IncidentState)=>{state=Object.freeze(next);for(const listener of listeners)listener();};
  const clear=(status:string)=>{generation++;readGeneration++;readAbort?.abort();writeAbort?.abort();write=undefined;intent=undefined;update({status});};
  async function open(id:string){
    if(write)return write;const epoch=++generation;readGeneration++;readAbort?.abort();readAbort=new AbortController();intent=undefined;update({status:'LOADING',busy:true});
    try{const incident=await api.incident(id,readAbort.signal);if(epoch===generation)update({status:'READY',incident,incidentId:id,followUps:incident.followUps,content:''});}
    catch(error){if(epoch===generation){const status=adminFailure(error);if(denied(status))clear(status);else update({status,incidentId:id});}}
  }
  function send(target:{id:string;input:FollowUpInput}){
    if(write)return write;const epoch=generation;writeAbort=new AbortController();update({...state,status:'SUBMITTING',busy:true});
    const operation=api.followUp(target.id,target.input,writeAbort.signal).then(result=>{
      if(epoch!==generation)return;intent=undefined;const notes=state.followUps??state.incident?.followUps??[],followUps=notes.some(note=>note.id===result.resource.id)?notes:[...notes,result.resource];
      update({...state,status:'SAVED',content:'',followUps,incident:state.incident?{...state.incident,followUps}:undefined,busy:false});
    }).catch(error=>{if(epoch!==generation)return;const status=adminFailure(error,true);if(denied(status))clear(status);else update({...state,status,busy:false});})
      .finally(()=>{if(write===operation)write=undefined;});write=operation;return operation;
  }
  return {snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},open,
    edit(content:string){if(write||denied(state.status)||state.status==='UNCERTAIN'||!state.incident)return;intent=undefined;update({...state,content,status:['SAVED','VALIDATION_ERROR'].includes(state.status)?'READY':state.status});},
    submit(){if(write)return write;if(state.busy||!state.incidentId||!state.incident||['UNCERTAIN','CONFLICT','LOADING','AUTH_REQUIRED','FORBIDDEN'].includes(state.status))return Promise.resolve();
      if(!state.content?.trim()){update({...state,status:'VALIDATION_ERROR'});return Promise.resolve();}intent={id:state.incidentId,input:{commandId:options.commandId(),content:state.content}};return send(intent);
    },
    replay(){return state.status==='UNCERTAIN'&&!state.busy&&intent?send(intent):Promise.resolve();},
    async refresh(){if(!state.incidentId||write)return;const id=state.incidentId,epoch=generation,read=++readGeneration;readAbort?.abort();readAbort=new AbortController();update({...state,busy:true});
      try{const incident=await api.incident(id,readAbort.signal);if(epoch===generation&&read===readGeneration)update({...state,status:['UNCERTAIN','CONFLICT'].includes(state.status)?state.status:'READY',incident,followUps:incident.followUps,busy:false});}
      catch(error){if(epoch===generation&&read===readGeneration){const status=adminFailure(error);if(denied(status))clear(status);else update({...state,status:state.status==='UNCERTAIN'?'UNCERTAIN':status,busy:false});}}
    },renewAfterConflict(){if(!write&&!state.busy&&state.status==='CONFLICT'){intent=undefined;update({...state,status:'READY'});}},logout(){clear('EMPTY');},
  };
}
const reasonLabels:Record<string,string>={UNKNOWN_REFERENCE:'Referencia sin asociación confiable',ASSOCIATION_MISMATCH:'Asociación incompatible',AMOUNT_OR_CURRENCY_MISMATCH:'Importe o moneda incompatible',ORDER_TERMINAL:'Orden terminal',RESERVATION_EXPIRED:'Reserva vencida',LATE_PAYMENT:'Pago fuera del plazo',OFFERING_UNAVAILABLE:'Oferta no disponible',SEAT_TERMINAL:'Plaza no aplicable',COURSE_COMMITMENT_EXISTS:'Compromiso previo de curso',STUDENT_SCHEDULE_CONFLICT:'Incompatibilidad de horario'};
export function IncidentsPage({state,actions}:{state:IncidentState;actions?:{edit:(content:string)=>void;submit:()=>void;refresh:()=>void;replay:()=>void;renewAfterConflict?:()=>void}}){
  const item=state.incident,busy=Boolean(state.busy)||['LOADING','SUBMITTING'].includes(state.status),show=!denied(state.status)&&!['LOADING','NOT_FOUND'].includes(state.status)&&item,notes=state.followUps??item?.followUps??[];
  return <AdminLayout title="Incidencia de pago"><AdminNotice status={state.status}/>{!denied(state.status)&&state.incidentId&&<div className="enrollment-actions"><button type="button" disabled={busy||!actions} onClick={actions?.refresh}>Consultar incidencia y seguimiento</button>{state.status==='UNCERTAIN'&&<button type="button" disabled={busy||!actions} onClick={actions?.replay}>Repetir el mismo comando</button>}</div>}
    {show&&<><section aria-label="Hechos de la incidencia"><p className="enrollment-reference">Incidencia: {item.id}</p><p role="status">Pendiente de resolución económica. Anotar seguimiento no cambia el pago, la reserva, la matrícula, el plazo ni el bloqueo del grupo.</p>
      <p>Motivo: {reasonLabels[item.reason]??'Incidencia pendiente de investigación'}</p><p>{item.orderId?`Orden asociada: ${item.orderId}`:'Sin orden ni titular asociados de forma confiable.'}</p>
      <p>Apertura (UTC): <time dateTime={item.openedAt}>{item.openedAt}</time></p>{item.payment&&<dl><dt>Importe verificado en unidades</dt><dd>{item.payment.amountUnits}</dd><dt>Escala decimal</dt><dd>{item.payment.amountScale}</dd><dt>Moneda verificada</dt><dd>{item.payment.currency}</dd><dt>Verificación finalizada (UTC)</dt><dd><time dateTime={item.payment.verifiedAt}>{item.payment.verifiedAt}</time></dd></dl>}
      <p>Grupos vinculados de forma confiable: {item.affectedGroupIds.length?item.affectedGroupIds.join(', '):'Ninguno'}</p></section>
      <section aria-label="Historial de seguimiento"><h2>Seguimiento administrativo</h2>{!notes.length&&<p>No hay anotaciones de seguimiento.</p>}<ol className="enrollment-cards">{notes.map((note,index)=><li className="enrollment-card" key={note.id??index}><p className="enrollment-note">{note.content}</p><p>Autor (administrador): {note.adminUserId}</p><p>Registrado (UTC): <time dateTime={note.recordedAt}>{note.recordedAt}</time></p></li>)}</ol></section>
      <form onSubmit={event=>{event.preventDefault();actions?.submit();}}><label htmlFor="incident-content">Anotación de seguimiento</label><textarea id="incident-content" rows={5} value={state.content??''} onChange={event=>actions?.edit(event.target.value)} readOnly={!actions||busy||state.status==='UNCERTAIN'} aria-invalid={state.status==='VALIDATION_ERROR'} aria-describedby="incident-help"/>
        <p id="incident-help">Registra solo información necesaria. La anotación es permanente y conserva autor y hora del servidor.</p>{state.status==='VALIDATION_ERROR'&&<p role="alert">Escribe un contenido de seguimiento no vacío.</p>}
        <button type="submit" disabled={!actions||busy||['UNCERTAIN','CONFLICT'].includes(state.status)}>Registrar seguimiento</button>{state.status==='CONFLICT'&&<button type="button" disabled={busy||!actions?.renewAfterConflict} onClick={actions?.renewAfterConflict}>Preparar nueva anotación con este contenido</button>}</form></>}
  </AdminLayout>;
}
export function IncidentsScreen({api,id}:{api:EnrollmentAdminApi;id:string}){
  const controller=useMemo(()=>createIncidentsController(api,{commandId:()=>crypto.randomUUID()}),[api]),state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{void controller.open(id);return()=>controller.logout();},[controller,id]);
  return <IncidentsPage state={state} actions={{edit:controller.edit,submit:()=>{void controller.submit();},refresh:()=>{void controller.refresh();},replay:()=>{void controller.replay();},renewAfterConflict:controller.renewAfterConflict}}/>;
}
