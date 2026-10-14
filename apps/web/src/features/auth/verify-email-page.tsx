import { useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure,RequestCancelled } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { takeActionLink } from './action-link';
import { mailInstructions,publicFailure,useMailWait } from './use-mail-wait';

export function VerifyEmailPage({api}:{readonly api:ApiClient}) {
  const [token,setToken]=useState(()=>takeActionLink(window.location,window.history));
  const [verified,setVerified]=useState(false);const [email,setEmail]=useState('');
  const [sending,setSending]=useState(false);const busy=useRef(false);const wait=useMailWait();
  const [error,setError]=useState<ApiFailure>();const [message,setMessage]=useState<string>();
  async function confirm() {
    if(!token||busy.current)return;busy.current=true;setSending(true);setError(undefined);
    try{await api.request('/auth/verification/confirm',{method:'POST',body:{token}});setToken(null);setVerified(true);}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=publicFailure(failure);setError(safe);if(safe.status===400)setToken(null);
    }}finally{busy.current=false;setSending(false);}
  }
  async function resend(event:FormEvent) {
    event.preventDefault();if(busy.current||wait.seconds>0)return;
    setError(undefined);setMessage(undefined);
    if(Array.from(email.trim()).length>254||!/^\S+@\S+\.\S+$/.test(email.trim())){
      setError(new ApiFailure(400,'VALIDATION_ERROR','Introduce un correo válido de hasta 254 caracteres.',undefined,['email']));return;
    }
    busy.current=true;setSending(true);
    try{await api.request('/auth/verification/request',{method:'POST',body:{email}});setMessage(mailInstructions);wait.start(60);}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=publicFailure(failure);setError(safe);
      if(safe.status===429){setMessage(mailInstructions);wait.start(safe.retryAfterSeconds??60);}
    }}finally{busy.current=false;setSending(false);}
  }
  return <main style={{maxWidth:'32rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Verificar correo</h1>
    {verified?<><Feedback message="Correo verificado. Si recibiste una credencial provisional, establece tu contraseña propia antes de iniciar sesión."/>
      <p><a href="/login">Iniciar sesión</a> · <a href="/establecer-contrasena">Establecer contraseña propia</a></p></>
      :token?<><p>Confirma para verificar tu correo. Abrir esta página no completa la acción.</p>
        <button type="button" disabled={sending} onClick={()=>void confirm()}>{sending?'Confirmando…':'Confirmar correo'}</button></>
      :<><p>Vuelve a abrir el enlace de tu correo o solicita un nuevo envío.</p>
        <form onSubmit={resend} noValidate aria-busy={sending}>
          <FormField id="verify-email" label="Correo" type="email" autoComplete="email" value={email} disabled={sending}
            error={error?.fields.includes('email')?'Revisa este campo.':undefined} onChange={event=>setEmail(event.target.value)}/>
          <button type="submit" disabled={sending||wait.seconds>0}>{sending?'Solicitando…':'Solicitar nuevo envío'}</button>
        </form>{wait.seconds>0&&<p role="status">Espera {wait.seconds} segundos antes de solicitar otro envío.</p>}</>}
    <Feedback error={error}/><Feedback message={message}/>
  </main>;
}
