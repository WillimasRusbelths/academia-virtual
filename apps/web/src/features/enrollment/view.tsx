import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ApiFailure } from '../../shared/api-client';
import type { ApiCode } from '../../shared/api-client';
import type { Slot } from './api';
import './enrollment.css';

export const reasons:Partial<Record<ApiCode,string>>={ACTIVE_ORDER_EXISTS:'Ya tienes una orden con reservas vigentes.',COURSE_COMMITMENT_EXISTS:'Ya tienes un compromiso vigente de ese curso.',
  OFFERING_NOT_RESERVABLE:'La oferta no permite reservar el conjunto.',CAPACITY_UNAVAILABLE:'No hay disponibilidad para el conjunto solicitado.',
  STUDENT_SCHEDULE_CONFLICT:'Los horarios coinciden con otro compromiso.',VALIDATION_ERROR:'Revisa la selección.',
  IDEMPOTENCY_CONFLICT:'Consulta el resultado de la intención original antes de continuar.',AUTH_REQUIRED:'Debes volver a iniciar sesión.',FORBIDDEN:'Acceso no permitido.'};
export function failureStatus(error:unknown):'AUTH_REQUIRED'|'FORBIDDEN'|'VALIDATION_ERROR'|'UNCERTAIN'{
  return error instanceof ApiFailure&&['AUTH_REQUIRED','FORBIDDEN','VALIDATION_ERROR'].includes(error.code)?error.code as 'AUTH_REQUIRED'|'FORBIDDEN'|'VALIDATION_ERROR':'UNCERTAIN';
}
export function pen(value:string):string {if(!/^(0|[1-9]\d*)$/.test(value))return 'Importe no disponible';return `PEN ${BigInt(value)/100n}.${(BigInt(value)%100n).toString().padStart(2,'0')}`;}
export function EnrollmentLayout({title,children}:{title:string;children:ReactNode}){
  const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>heading.current?.focus(),[]);
  return <main className="enrollment-page"><h1 ref={heading} tabIndex={-1}>{title}</h1><nav aria-label="Reservas y órdenes"><a href="/inicio">Inicio</a> · <a href="/reservar">Reservar</a> · <a href="/mis-ordenes">Mis órdenes</a> · <a href="/mis-matriculas">Mis matrículas</a></nav>{children}</main>;
}
export function Notice({status,message}:{status:string;message?:string}){
  const alert=['ERROR','UNCERTAIN','VALIDATION_ERROR','AUTH_REQUIRED','FORBIDDEN','REJECTED','NOT_FOUND'].includes(status);
  const labels:Record<string,string>={LOADING:'Consultando información…',SUBMITTING:'Enviando solicitud. Espera el resultado.',PREVIEWING:'Consultando resumen orientativo…',
    EMPTY:'No hay resultados para esta consulta.',ERROR:'No se pudo consultar. Puedes reintentar manualmente.',UNCERTAIN:'Resultado incierto. Consulta antes de repetir. Salir no deshace una solicitud que pudo admitirse.',
    VALIDATION_ERROR:'Revisa la selección.',AUTH_REQUIRED:'Debes volver a iniciar sesión.',FORBIDDEN:'Acceso no permitido.',NOT_FOUND:'Orden o solicitud no encontrada.',
    ADMITTED:'Solicitud admitida; todavía no tienes reserva. En espera de decisión.',CONFIRMED:'Reserva confirmada por el servidor.',REJECTED:'Solicitud rechazada. No se reservó ninguna plaza.'};
  return <p className="enrollment-notice" role={alert?'alert':'status'} tabIndex={-1}>{message??labels[status]??'Información consultada.'}</p>;
}
const weekdays=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
export function Schedule({slots}:{slots:readonly Slot[]}){return <ul>{slots.map((slot,index)=><li key={index}>{weekdays[slot.dayOfWeek-1]} {slot.startTime}–{slot.endTime}</li>)}</ul>;}
export function Pagination({page,total,pageSize,busy,onPage}:{page:number;total:number;pageSize:number;busy:boolean;onPage?:(page:number)=>void}){
  return <nav aria-label="Paginación"><p>Página {page} · {total} resultados</p><button type="button" disabled={busy||page<=1||!onPage} onClick={()=>onPage?.(page-1)}>Página anterior</button>
    <button type="button" disabled={busy||page*pageSize>=total||!onPage} onClick={()=>onPage?.(page+1)}>Página siguiente</button></nav>;
}
