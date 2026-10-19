import { useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure,RequestCancelled } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { mailInstructions,publicFailure,useMailWait } from './use-mail-wait';

export function ForgotPasswordPage({api}:{readonly api:ApiClient}) {
  const [email,setEmail]=useState('');const [sending,setSending]=useState(false);const busy=useRef(false);
  const [error,setError]=useState<ApiFailure>();const [message,setMessage]=useState<string>();const wait=useMailWait();
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy.current||wait.seconds>0)return;
    setError(undefined);setMessage(undefined);
    if(Array.from(email.trim()).length>254||!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(new ApiFailure(400,'VALIDATION_ERROR','Introduce un correo válido de hasta 254 caracteres.',undefined,['email']));return;
    }
    busy.current=true;setSending(true);
    try{await api.request('/auth/password/forgot',{method:'POST',body:{email:email.trim()}});
      setMessage(mailInstructions);wait.start(60);
    }catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=publicFailure(failure);setError(safe);
      if(safe.status===429){setMessage(mailInstructions);wait.start(safe.retryAfterSeconds??60);}
    }}finally{busy.current=false;setSending(false);}
  }
  return <main style={{maxWidth:'32rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Recuperar contraseña</h1>
    <form onSubmit={submit} noValidate aria-busy={sending}>
      <FormField id="forgot-email" label="Correo" type="email" autoComplete="email" value={email}
        error={error?.fields.includes('email')?'Revisa este campo.':undefined}
        disabled={sending} onChange={event=>setEmail(event.target.value)}/>
      <button type="submit" disabled={sending||wait.seconds>0}>{sending?'Solicitando…':'Solicitar instrucciones'}</button>
    </form>
    <Feedback error={error}/><Feedback message={message}/>
    {wait.seconds>0&&<p role="status">Espera {wait.seconds} segundos antes de solicitar otro envío.</p>}
    <p>La recuperación requiere acceso al correo verificado. La solicitud no cierra tus sesiones.</p>
    <p><a href="/login">Iniciar sesión</a> · <a href="/verificar-correo">Verificar correo</a></p>
  </main>;
}
