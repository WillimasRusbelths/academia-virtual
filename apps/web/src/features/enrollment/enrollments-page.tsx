import { useEffect,useMemo,useRef,useSyncExternalStore } from 'react';
import type { Enrollment,EnrollmentApi,Page } from './api';
import { ApiFailure } from '../../shared/api-client';
import { EnrollmentLayout,Notice,Pagination,Schedule,failureStatus } from './view';

interface EnrollmentsState extends Readonly<Record<string,unknown>> {
  readonly status:string;readonly enrollments?:Page<Enrollment>;readonly enrollment?:Enrollment;
}
export function createEnrollmentsController(api:Pick<EnrollmentApi,'enrollments'|'enrollment'>){
  let state:EnrollmentsState=Object.freeze({status:'LOADING'}),generation=0,controller:AbortController|undefined;
  let target:{id:string}|{page:number}={page:1};
  const listeners=new Set<()=>void>(),update=(value:EnrollmentsState)=>{state=Object.freeze(value);for(const listener of listeners)listener();};
  async function load(next:typeof target){
    target=next;const epoch=++generation;controller?.abort();controller=new AbortController();update({status:'LOADING'});
    try{
      const value='id'in next?{enrollment:await api.enrollment(next.id,controller.signal)}:{enrollments:await api.enrollments({page:next.page,pageSize:20},controller.signal)};
      if(epoch===generation)update({status:'enrollments'in value&&!value.enrollments?.items.length?'EMPTY':'READY',...value});
    }catch(error){if(epoch===generation)update({status:error instanceof ApiFailure&&error.code==='NOT_FOUND'?'NOT_FOUND':failureStatus(error)});}
  }
  return {snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    list:(page=1)=>load({page}),open:(id:string)=>load({id}),refresh:()=>load(target),
    logout(){generation++;controller?.abort();target={page:1};update({status:'EMPTY'});},
  };
}
export function EnrollmentsPage({state,actions}:{state:Readonly<Record<string,unknown>>;actions?:{refresh:()=>void;list:(page:number)=>void;open:(id:string)=>void}}){
  const notice=useRef<HTMLDivElement>(null),status=String(state.status);
  useEffect(()=>notice.current?.querySelector<HTMLElement>('[role]')?.focus(),[status]);
  const page=state.enrollments as Page<Enrollment>|undefined,detail=state.enrollment as Enrollment|undefined;
  const items=status==='READY'?(detail?[detail]:page?.items??[]):[];
  return <EnrollmentLayout title="Mis matrículas"><div ref={notice}><Notice status={status}/></div>
    <button type="button" disabled={!actions||status==='LOADING'} onClick={actions?.refresh}>Consultar mis matrículas</button>
    {status==='INCIDENT'&&<p role="status">Pago en conciliación, sin matrícula.</p>}
    <ul className="enrollment-cards">{items.map(item=><li key={item.id} className="enrollment-card"><h2>{item.courseName}</h2><p>{item.groupName}</p>
      <p role="status">{item.state==='ENROLLED'?'Matrícula vigente.':'Matrícula histórica; su vigencia original ha terminado.'}</p>
      <p>Período original: {item.periodStart}–{item.periodEnd} · {item.timeZone}</p><Schedule slots={item.schedule}/>
      <p>Confirmada (UTC): <time dateTime={item.confirmedAt}>{item.confirmedAt}</time></p><p>Vigencia original hasta (UTC): <time dateTime={item.validUntil}>{item.validUntil}</time></p>
      <p className="enrollment-reference">Referencia: {item.id}</p><a href={'/mis-ordenes/'+item.orderId}>Consultar orden original</a>
      {!detail&&<p><a href={'/mis-matriculas/'+item.id}>Consultar detalle de la matrícula</a></p>}
    </li>)}</ul>
    {status==='READY'&&page&&!detail&&<Pagination page={page.page} pageSize={page.pageSize} total={page.total} busy={false} onPage={actions?.list}/>}
  </EnrollmentLayout>;
}
export function EnrollmentsScreen({api,enrollmentId}:{api:EnrollmentApi;enrollmentId?:string}){
  const controller=useMemo(()=>createEnrollmentsController(api),[api]);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{if(enrollmentId)void controller.open(enrollmentId);else void controller.list();return()=>controller.logout();},[controller,enrollmentId]);
  return <EnrollmentsPage state={state} actions={{refresh:()=>{void controller.refresh();},list:page=>{void controller.list(page);},open:id=>{void controller.open(id);}}}/>;
}
