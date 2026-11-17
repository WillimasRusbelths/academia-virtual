import { useEffect,useRef } from 'react';
import type { ReactNode } from 'react';
import { ApiFailure } from '../../shared/api-client';
import './enrollment.css';

export function adminFailure(error:unknown,write=false):string {
  if(error instanceof ApiFailure){
    if(['AUTH_REQUIRED','FORBIDDEN','VALIDATION_ERROR','NOT_FOUND'].includes(error.code))return error.code;
    if(['ENROLLMENT_VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(error.code))return 'CONFLICT';
  }
  return write?'UNCERTAIN':'ERROR';
}
export const denied=(status:string)=>['AUTH_REQUIRED','FORBIDDEN'].includes(status);
export function AdminLayout({title,children}:{title:string;children:ReactNode}){
  const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>heading.current?.focus(),[]);
  return <main className="enrollment-page enrollment-admin"><h1 ref={heading} tabIndex={-1}>{title}</h1><nav aria-label="Administración de compromisos"><a href="/inicio">Inicio</a><a href="/admin/precios">Precios</a><a href="/admin/compromisos">Compromisos e incidencias</a></nav>{children}</main>;
}
export function AdminNotice({status,saved}:{status:string;saved?:string}){
  const ref=useRef<HTMLParagraphElement>(null);useEffect(()=>{if(status!=='READY'&&status!=='EMPTY')ref.current?.focus();},[status]);
  const messages:Record<string,string>={LOADING:'Consultando información…',EMPTY:'Selecciona un curso o consulta los filtros disponibles.',READY:'Información consultada.',SUBMITTING:'Registrando el comando. Espera el resultado.',
    SAVED:saved??'Seguimiento registrado. La resolución económica sigue pendiente.',ERROR:'Error de consulta. Vuelve a consultar manualmente.',
    UNCERTAIN:'Resultado incierto. Consulta antes de repetir el mismo comando; salir no deshace una escritura que pudo confirmarse.',
    CONFLICT:'Conflicto de revisión o comando. Consulta y compara los datos guardados antes de decidir.',VALIDATION_ERROR:'Revisa el campo indicado antes de enviar.',
    AUTH_REQUIRED:'Debes iniciar sesión de nuevo.',FORBIDDEN:'Acceso no permitido.',NOT_FOUND:'Orden o incidencia no encontrada.'};
  return <p ref={ref} tabIndex={-1} className="enrollment-notice" role={['ERROR','UNCERTAIN','CONFLICT','VALIDATION_ERROR','AUTH_REQUIRED','FORBIDDEN','NOT_FOUND'].includes(status)?'alert':'status'}>{messages[status]??messages.ERROR}</p>;
}
