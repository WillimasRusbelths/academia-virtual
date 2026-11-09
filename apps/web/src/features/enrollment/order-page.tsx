import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { EnrollmentApi, Order, Page, ReservationResult } from './api';
import { orderView,paymentAttempt } from './api';
import { ApiFailure } from '../../shared/api-client';
import { EnrollmentLayout, Notice, Pagination, Schedule, failureStatus, pen, reasons } from './view';

export interface OrdersState {readonly status:string;readonly orders?:Page<Order>;readonly requests?:Page<ReservationResult>;readonly current?:Order|null;readonly order?:Order;readonly request?:ReservationResult;readonly busy?:boolean}
/** Las lecturas reemplazadas o posteriores al logout nunca repueblan la vista. */
export function createOrdersController(api:Pick<EnrollmentApi,'orders'|'requests'|'currentOrder'|'order'|'request'>){
  let state:OrdersState=Object.freeze({status:'LOADING'}),generation=0,controller:AbortController|undefined,target:{kind:'ORDER'|'REQUEST';id:string}|undefined;
  let pages={orders:1,requests:1};
  const listeners=new Set<()=>void>(),update=(value:OrdersState)=>{state=Object.freeze(value);for(const listener of listeners)listener();};
  async function run(work:(signal:AbortSignal)=>Promise<Partial<OrdersState>>){
    const epoch=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
    update({status:'LOADING',busy:true});
    try{const result=await work(signal);if(epoch===generation)update({status:'READY',...result,busy:false});}
    catch(error){if(epoch===generation){const status=error instanceof ApiFailure&&error.code==='NOT_FOUND'?'NOT_FOUND':failureStatus(error);if(['AUTH_REQUIRED','FORBIDDEN'].includes(status)){target=undefined;pages={orders:1,requests:1};}update({status,busy:false});}}
  }
  const list=(page=1,requestPage=1)=>{target=undefined;pages={orders:page,requests:requestPage};return run(async signal=>{
    const [orders,requests,current]=await Promise.all([api.orders({page,pageSize:20},signal),api.requests({page:requestPage,pageSize:20},signal),api.currentOrder(signal)]);
    return {status:orders.total||requests.total||current?'READY':'EMPTY',orders,requests,current};
  });};
  const open=(id:string)=>{target={kind:'ORDER',id};return run(async signal=>({order:await api.order(id,signal)}));};
  const inspect=(intentionId:string)=>{target={kind:'REQUEST',id:intentionId};return run(async signal=>{const request=await api.request(intentionId,signal);
    const order=request.state==='CONFIRMED'?await api.order(request.orderId,signal):undefined;return {status:request.state,request,order};
  });};
  return {
    snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},list,open,
    inspect,
    refresh:()=>target?target.kind==='ORDER'?open(target.id):inspect(target.id):list(pages.orders,pages.requests),
    logout(){generation++;controller?.abort();target=undefined;pages={orders:1,requests:1};update({status:'EMPTY'});},
  };
}
type DisplayOrder=Order&{readonly offeringUnavailable?:boolean;readonly incident?:unknown};
interface OrderViewState extends Omit<OrdersState,'order'> {readonly order?:DisplayOrder;readonly message?:string}
interface Actions {refresh:()=>void;list:(page?:number,requestPage?:number)=>void;open:(id:string)=>void;inspect:(intentionId:string)=>void}
export function OrderPage({state,actions,payment}:{state:OrderViewState;actions?:Actions;payment?:ReactNode}){
  const notice=useRef<HTMLDivElement>(null);useEffect(()=>notice.current?.querySelector<HTMLElement>('[role]')?.focus(),[state.status,state.order?.id]);
  const order=state.order,busy=Boolean(state.busy),ready=Boolean(order?.id)&&!['LOADING','ERROR','UNCERTAIN','AUTH_REQUIRED','FORBIDDEN'].includes(state.status);
  return <EnrollmentLayout title="Mis órdenes y solicitudes"><div ref={notice}><Notice status={state.status} message={state.message}/></div>
    <div className="enrollment-actions"><button type="button" disabled={busy||!actions} onClick={actions?.refresh}>Consultar estado actualizado</button><button type="button" disabled={busy||!actions} onClick={()=>actions?.list()}>Recuperar mis órdenes y solicitudes</button></div>
    {state.request&&<section aria-label="Solicitud de reserva"><h2>Solicitud de reserva</h2><p className="enrollment-reference">Intención: {state.request.intentionId}</p><p>Estado: {state.request.state}</p>
      {state.request.state==='REJECTED'&&<p role="alert">{reasons[state.request.decisionCode]??'No se reservó ninguna plaza para esta solicitud.'}</p>}</section>}
    {ready&&order&&<section aria-labelledby="order-detail-title"><h2 id="order-detail-title">Detalle original de la orden</h2><p className="enrollment-reference">Referencia: {order.id}</p>
      <p role="status">{order.state==='EXPIRED'?'Reserva vencida según el servidor. Puedes preparar una nueva selección.':order.state==='ENROLLED'?'Orden matriculada. Consulta las condiciones originales.':'Orden reservada según el servidor.'}</p>
      {order.state==='EXPIRED'&&<p><a href="/reservar">Preparar nueva selección</a>. La intención anterior conserva su resultado original.</p>}
      {(order.paymentMessage==='Oferta no disponible.'||order.offeringUnavailable)&&<p role="alert">Oferta no disponible para iniciar el pago. El detalle y el plazo originales se conservan.</p>}
      {!payment&&(order.paymentState==='INCIDENT'||Boolean(order.incidentSummary)||Boolean(order.incident))&&<p role="status">Pago en conciliación, sin matrícula.</p>}
      <dl><dt>Total original</dt><dd>{pen(order.totalMinor)}</dd><dt>Revisión</dt><dd>{order.revision}</dd><dt>Inicio confirmado (UTC)</dt><dd><time dateTime={order.confirmedAt}>{order.confirmedAt}</time></dd>
        <dt>Vencimiento confirmado (UTC)</dt><dd><time dateTime={order.expiresAt}>{order.expiresAt}</time></dd><dt>Consulta del servidor (UTC)</dt><dd>{order.serverNow}</dd></dl>
      <ul className="enrollment-cards">{order.items.map(item=><li key={item.groupId} className="enrollment-card"><h3>{item.courseName}</h3><p>{item.groupName} · {pen(item.priceMinor)}</p><p>Período original: {item.periodStart}–{item.periodEnd} · {item.timeZone}</p><Schedule slots={item.schedule}/>
        <p>Inicio del grupo (UTC): <time dateTime={item.groupStartAt}>{item.groupStartAt}</time></p><p>Límite original de matrícula (UTC): <time dateTime={item.enrollmentValidUntil}>{item.enrollmentValidUntil}</time></p></li>)}</ul>
      <p>El estado se consulta al servidor. Abrir esta vista o volver a iniciar sesión conserva el plazo original.</p>{payment}</section>}
    {state.current&&<section aria-label="Orden con reservas vigentes"><h2>Orden con reservas vigentes</h2><p>{state.current.id} · {pen(state.current.totalMinor)}</p><button type="button" disabled={busy||!actions} onClick={()=>actions?.open(state.current!.id)}>Consultar orden vigente</button></section>}
    {state.orders&&<section aria-label="Historial de órdenes"><h2>Historial de órdenes</h2>{!state.orders.items.length&&<p role="status">No hay órdenes en esta página.</p>}
      <ul className="enrollment-cards">{state.orders.items.map(item=><li key={item.id} className="enrollment-card"><p className="enrollment-reference">{item.id}</p><p>{item.state==='EXPIRED'?'Vencida':item.state==='ENROLLED'?'Matriculada':'Reservada'} · {pen(item.totalMinor)}</p>
        <button type="button" disabled={busy||!actions} onClick={()=>actions?.open(item.id)}>Consultar detalle original</button></li>)}</ul>
      <Pagination page={state.orders.page} total={state.orders.total} pageSize={state.orders.pageSize} busy={busy} onPage={actions?page=>actions.list(page,state.requests?.page):undefined}/></section>}
    {state.requests&&<section aria-label="Solicitudes propias"><h2>Solicitudes propias</h2>{!state.requests.items.length&&<p role="status">No hay solicitudes en esta página.</p>}
      <ul className="enrollment-cards">{state.requests.items.map(item=><li key={item.id} className="enrollment-card"><p className="enrollment-reference">Intención: {item.intentionId}</p><p>{item.state==='ADMITTED'?'Admitida, en espera':item.state==='CONFIRMED'?'Reserva confirmada':'Rechazada'}</p>
        <button type="button" disabled={busy||!actions} onClick={()=>actions?.inspect(item.intentionId)}>Consultar resultado de la solicitud</button></li>)}</ul>
      <Pagination page={state.requests.page} total={state.requests.total} pageSize={state.requests.pageSize} busy={busy} onPage={actions?page=>actions.list(state.orders?.page,page):undefined}/></section>}
  </EnrollmentLayout>;
}
export function OrdersScreen({api,orderId}:{api:EnrollmentApi;orderId?:string}){
  const controller=useMemo(()=>createOrdersController(api),[api]);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{if(orderId)void controller.open(orderId);else void controller.list();return()=>controller.logout();},[controller,orderId]);
  const actions={refresh:()=>{void controller.refresh();},list:(page?:number,requestPage?:number)=>{void controller.list(page,requestPage);},open:(id:string)=>{void controller.open(id);},inspect:(id:string)=>{void controller.inspect(id);}};
  return state.order?<PayableOrderScreen key={state.order.id} api={api} state={state} actions={actions}/>:<OrderPage state={state} actions={actions}/>;
}

interface PaymentApi {
  initiatePayment(orderId:string,initiationId:string,signal?:AbortSignal):Promise<unknown>;
  order(id:string,signal?:AbortSignal):Promise<unknown>;
}
export interface PaymentState extends Readonly<Record<string,unknown>> {
  readonly status:string;readonly order?:Order;readonly orderId?:string;readonly initiationId?:string;readonly busy?:boolean;
}
const terminalPayment=(status:string)=>['APPLIED','INCIDENT','EXPIRED'].includes(status);
const orderPaymentStatus=(order:Order)=>order.state==='ENROLLED'?'APPLIED':order.paymentState==='INCIDENT'?'INCIDENT':order.state==='EXPIRED'?'EXPIRED':order.paymentState==='PENDING'?'PENDING':'READY';
/** Identidad solo en memoria. Lecturas y escritura tienen vuelos separados para
 * que una consulta terminal pueda adelantarse a la respuesta de iniciación. */
export function createPaymentController(api:PaymentApi,options:{initiationId:()=>string;order?:Order}){
  let state:PaymentState=Object.freeze(options.order?{status:orderPaymentStatus(options.order),order:options.order,orderId:options.order.id}:{status:'READY'});
  let generation=0,readGeneration=0,write:Promise<void>|undefined,writeAbort:AbortController|undefined,readAbort:AbortController|undefined;
  const listeners=new Set<()=>void>();
  const update=(next:PaymentState)=>{state=Object.freeze(next);for(const listener of listeners)listener();};
  function failed(error:unknown){
    if(error instanceof ApiFailure&&['AUTH_REQUIRED','FORBIDDEN'].includes(error.code)){writeAbort?.abort();readAbort?.abort();generation++;update({status:error.code});return;}
    if(!terminalPayment(state.status))update({...state,status:'UNCERTAIN',busy:false});
  }
  function send(orderId:string,initiationId:string){
    if(write)return write;const epoch=generation;writeAbort=new AbortController();
    update({...state,orderId,initiationId,status:'SUBMITTING',busy:true});
    const operation=api.initiatePayment(orderId,initiationId,writeAbort.signal).then(value=>{
      if(epoch!==generation)return;const attempt=paymentAttempt(value);
      if(!terminalPayment(state.status))update({...state,status:attempt.state,busy:false});
    }).catch(error=>{if(epoch===generation)failed(error);}).finally(()=>{if(write===operation){write=undefined;if(epoch===generation)update({...state,busy:false});}});
    write=operation;return operation;
  }
  return {
    snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    start(orderId:string):Promise<void>{
      if(write)return write;
      if(state.initiationId&&state.status!=='FAILED_NO_CHARGE'||terminalPayment(state.status)||['AUTH_REQUIRED','FORBIDDEN'].includes(state.status))return Promise.resolve();
      if(state.order&&!state.order.paymentAllowed)return Promise.resolve();
      return send(orderId,options.initiationId());
    },
    replay(){return state.status==='UNCERTAIN'&&state.orderId&&state.initiationId?send(state.orderId,state.initiationId):Promise.resolve();},
    async refresh(){
      if(!state.orderId)return;const id=state.orderId,epoch=generation,read=++readGeneration;readAbort?.abort();readAbort=new AbortController();
      try{const value=orderView(await api.order(id,readAbort.signal));if(epoch!==generation||read!==readGeneration)return;
        if(value.id.toLowerCase()!==id.toLowerCase())throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Consulta el estado de nuevo.');
        let status=orderPaymentStatus(value);
        if(status==='READY'&&state.status==='FAILED_NO_CHARGE')status='FAILED_NO_CHARGE';
        if(status==='READY'&&state.status==='UNCERTAIN'&&state.initiationId)status='UNCERTAIN';
        if(terminalPayment(state.status)&&!terminalPayment(status))return;
        update({...state,order:value,status,busy:Boolean(write)});
      }catch(error){if(epoch===generation&&read===readGeneration)failed(error);}
    },
    logout(){generation++;readGeneration++;writeAbort?.abort();readAbort?.abort();write=undefined;update({status:'EMPTY'});},
  };
}
export function PaymentPanel({state,actions}:{state:Readonly<Record<string,unknown>>;actions?:{start:()=>void;refresh:()=>void;replay?:()=>void}}){
  const status=String(state.status),order=state.order as Order|undefined;
  const notice=useRef<HTMLParagraphElement>(null);useEffect(()=>{if(status!=='READY')notice.current?.focus();},[status]);
  const disabled=!actions||!order?.paymentAllowed||Boolean(state.busy)||!['READY','FAILED_NO_CHARGE'].includes(status);
  const labels:Record<string,string>={READY:'Inicia el pago solo cuando quieras continuar.',SUBMITTING:'Iniciación en curso. Consulta antes de repetir.',
    PENDING:'Pago pendiente; aún sin matrícula.',INITIATION_UNKNOWN:'Inicio de pago incierto. Consulta el estado antes de continuar.',
    UNCERTAIN:'Resultado incierto. Consulta el estado antes de repetir.',FAILED_NO_CHARGE:'Pago no iniciado: rechazo definitivo sin cobro. Puedes iniciar un nuevo intento explícito.',
    APPLIED:'Pago aplicado. Consulta tus matrículas.',INCIDENT:'Pago en conciliación, sin matrícula.',EXPIRED:'Plazo de pago vencido. Consulta la orden original.',
    AUTH_REQUIRED:'Debes volver a iniciar sesión.',FORBIDDEN:'Acceso no permitido.',EMPTY:'No hay información de pago.'};
  return <section aria-label="Pago de la orden"><h2>Pago de la orden</h2><p ref={notice} role={['UNCERTAIN','AUTH_REQUIRED','FORBIDDEN'].includes(status)?'alert':'status'} tabIndex={-1}>{labels[status]??'Consulta el estado del pago.'}</p>
    {order&&<><p>Vencimiento original: {order.expiresAt}</p>{order.paymentMessage&&<p>Oferta no disponible para pagar el conjunto.</p>}
      <div className="enrollment-actions"><button type="button" disabled={disabled} onClick={actions?.start}>Iniciar pago</button><button type="button" disabled={!actions} onClick={actions?.refresh}>Consultar estado del pago</button>
        {status==='UNCERTAIN'&&Boolean(state.initiationId)&&<button type="button" disabled={!actions?.replay||Boolean(state.busy)} onClick={actions?.replay}>Repetir iniciación original</button>}</div></>}
    {status==='APPLIED'&&<>{order?.incidentSummary&&<p role="status">Hay un pago adicional en conciliación. Las matrículas confirmadas se conservan.</p>}<a href="/mis-matriculas">Consultar mis matrículas</a></>}
  </section>;
}
function PayableOrderScreen({api,state,actions}:{api:EnrollmentApi;state:OrdersState;actions:Actions}){
  const flow=useMemo(()=>createPaymentController(api,{initiationId:()=>crypto.randomUUID(),order:state.order}),[api]);
  const payment=useSyncExternalStore(flow.subscribe,flow.snapshot,flow.snapshot);
  useEffect(()=>()=>flow.logout(),[flow]);
  const privateCleared=['AUTH_REQUIRED','FORBIDDEN','EMPTY'].includes(payment.status);
  return <OrderPage state={privateCleared?{status:payment.status}:{...state,order:payment.order??state.order}} actions={{...actions,refresh:()=>{void flow.refresh();}}}
    payment={<PaymentPanel state={payment} actions={{start:()=>{void flow.start(state.order!.id);},refresh:()=>{void flow.refresh();},replay:()=>{void flow.replay();}}}/>}/>;
}
