import { useEffect,useState } from 'react';
import { ApiFailure } from '../../shared/api-client';

export const mailInstructions='Si la cuenta cumple las condiciones, recibirás instrucciones. Si no llegan, revisa tu correo o solicita un nuevo envío.';
export function publicFailure(error:unknown):ApiFailure {
  return error instanceof ApiFailure?error:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Servicio temporalmente no disponible. Puedes reintentar manualmente.');
}
/** Espera local orientativa; el servidor conserva la autoridad sobre las cuotas. */
export function useMailWait() {
  const [until,setUntil]=useState(0);const [seconds,setSeconds]=useState(0);
  useEffect(()=>{
    if(!until)return;
    const update=()=>setSeconds(Math.max(0,Math.ceil((until-Date.now())/1000)));
    const timer=window.setInterval(update,1000);
    return ()=>window.clearInterval(timer);
  },[until]);
  return {seconds,start(duration:number){setSeconds(duration);setUntil(Date.now()+duration*1000);}};
}
