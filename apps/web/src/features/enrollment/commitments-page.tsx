import { useEffect,useMemo,useState,useSyncExternalStore } from 'react';
import type { AdministrativeOrder,EnrollmentAdminApi,Incident,Page } from './api';
import { AdminLayout,AdminNotice,adminFailure,denied } from './admin-view';
import { Pagination,Schedule,pen } from './view';

export interface CommitmentsState {readonly status:string;readonly orders?:Page<AdministrativeOrder>;readonly incidents?:Page<Incident>;readonly order?:AdministrativeOrder;readonly busy?:boolean;readonly studentId?:string}
export function createCommitmentsController(api:Pick<EnrollmentAdminApi,'orders'|'order'|'incidents'>){
  let state:CommitmentsState=Object.freeze({status:'LOADING'}),generation=0,abort:AbortController|undefined,selection:{page:number;incidentPage:number;studentId?:string}={page:1,incidentPage:1};
  const listeners=new Set<()=>void>(),update=(next:CommitmentsState)=>{state=Object.freeze(next);for(const listener of listeners)listener();};
  async function run(work:(signal:AbortSignal)=>Promise<Partial<CommitmentsState>>){
    const epoch=++generation;abort?.abort();abort=new AbortController();update({status:'LOADING',busy:true});
    try{const value=await work(abort.signal);if(epoch===generation)update({status:'READY',...value,busy:false});}
    catch(error){if(epoch===generation){const status=adminFailure(error);if(denied(status))selection={page:1,incidentPage:1};update({status});}}
  }
  function list(page=1,incidentPage=1,studentId=selection.studentId){
    if(studentId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)){generation++;abort?.abort();update({status:'VALIDATION_ERROR'});return Promise.resolve();}
    selection={page,incidentPage,...(studentId?{studentId}: {})};return run(async signal=>{
      const [orders,incidents]=await Promise.all([api.orders({page,pageSize:20,studentId:selection.studentId},signal),api.incidents({page:incidentPage,pageSize:20},signal)]);
      return {orders,incidents,studentId:selection.studentId,status:orders.total||incidents.total?'READY':'EMPTY'};
    });
  }
  return {snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},list,
    openOrder(id:string){return run(async signal=>({order:await api.order(id,signal)}));},
    refresh:()=>list(selection.page,selection.incidentPage,selection.studentId),
    logout(){generation++;abort?.abort();selection={page:1,incidentPage:1};update({status:'EMPTY'});},
  };
}
export function CommitmentsScreen({api}:{api:EnrollmentAdminApi}){
  const controller=useMemo(()=>createCommitmentsController(api),[api]),state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),[studentId,setStudentId]=useState('');
  useEffect(()=>{void controller.list();return()=>controller.logout();},[controller]);
  const busy=Boolean(state.busy),privateView=!denied(state.status);
  return <AdminLayout title="Compromisos e incidencias"><AdminNotice status={state.status}/>{privateView&&<>
    <form onSubmit={event=>{event.preventDefault();void controller.list(1,1,studentId.trim());}}><label htmlFor="commitments-student">Filtrar órdenes por ID de alumno</label><input id="commitments-student" value={studentId} onChange={event=>setStudentId(event.target.value)} disabled={busy} aria-invalid={state.status==='VALIDATION_ERROR'}/><button disabled={busy} type="submit">Consultar órdenes</button></form>
    {state.status==='VALIDATION_ERROR'&&<p role="alert">Escribe un ID de alumno válido o deja el filtro vacío.</p>}<button type="button" disabled={busy} onClick={()=>void controller.refresh()}>Consultar compromisos e incidencias</button>
    {state.orders&&<section aria-label="Órdenes administrativas"><h2>Órdenes {state.studentId?'del alumno indicado':'de todos los alumnos'}</h2>{!state.orders.items.length&&<p role="status">No hay órdenes en esta página.</p>}<ul className="enrollment-cards">{state.orders.items.map(order=><li key={order.id} className="enrollment-card"><p className="enrollment-reference">{order.id}</p><p>Alumno: {order.studentId}</p><p>{order.state==='EXPIRED'?'Vencida':order.state==='ENROLLED'?'Matriculada':'Reservada'} · {pen(order.totalMinor)}</p><button type="button" disabled={busy} onClick={()=>void controller.openOrder(order.id)}>Consultar detalle original de la orden</button></li>)}</ul>
      <Pagination page={state.orders.page} total={state.orders.total} pageSize={state.orders.pageSize} busy={busy} onPage={page=>void controller.list(page,state.incidents?.page,state.studentId)}/></section>}
    {state.incidents&&<section aria-label="Incidencias administrativas"><h2>Incidencias de todos los alumnos</h2><p>Este listado no se limita por el filtro de órdenes. Todas mantienen pendiente la resolución económica.</p>{!state.incidents.items.length&&<p role="status">No hay incidencias en esta página.</p>}
      <ul className="enrollment-cards">{state.incidents.items.map(incident=><li key={incident.id} className="enrollment-card"><p className="enrollment-reference">Incidencia: {incident.id}</p><p>{incident.orderId?`Orden asociada: ${incident.orderId}`:'Referencia sin orden asociada de forma confiable.'}</p><p>Pendiente de resolución económica.</p><a href={'/admin/incidencias/'+incident.id}>Consultar incidencia</a></li>)}</ul>
      <Pagination page={state.incidents.page} total={state.incidents.total} pageSize={state.incidents.pageSize} busy={busy} onPage={page=>void controller.list(state.orders?.page,page,state.studentId)}/></section>}
    {state.order&&<section aria-label="Detalle administrativo original"><h2>Detalle original de la orden</h2><p className="enrollment-reference">{state.order.id}</p><p>Alumno: {state.order.studentId}</p><p>Total original: {pen(state.order.totalMinor)} · Revisión: {state.order.revision}</p>
      <p>Estado de orden: {state.order.state}. Pago: {state.order.paymentState}.</p>{state.order.incidentSummary&&<p>{state.order.incidentSummary}</p>}<p>Confirmada (UTC): <time dateTime={state.order.confirmedAt}>{state.order.confirmedAt}</time></p><p>Vencimiento original (UTC): <time dateTime={state.order.expiresAt}>{state.order.expiresAt}</time></p><p>Consulta del servidor (UTC): {state.order.serverNow}</p>
      <ul className="enrollment-cards">{state.order.items.map(item=><li className="enrollment-card" key={item.groupId}><h3>{item.courseName}</h3><p>{item.groupName} · {pen(item.priceMinor)}</p><p>Período original: {item.periodStart}–{item.periodEnd} · {item.timeZone}</p><Schedule slots={item.schedule}/><p>Inicio del grupo (UTC): {item.groupStartAt}</p><p>Vigencia original de matrícula (UTC): {item.enrollmentValidUntil}</p></li>)}</ul></section>}
    </>}</AdminLayout>;
}
