import { useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure,RequestCancelled } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { takeActionLink } from './action-link';
import { publicFailure,useMailWait } from './use-mail-wait';

export function ResetPasswordPage({api}:{readonly api:ApiClient}) {
  const [token,setToken]=useState(()=>takeActionLink(window.location,window.history));
  const [password,setPassword]=useState('');const [confirmation,setConfirmation]=useState('');
  const [sending,setSending]=useState(false);const [changed,setChanged]=useState(false);const busy=useRef(false);
  const [error,setError]=useState<ApiFailure>();const [fields,setFields]=useState<Record<string,string|undefined>>({});
  const wait=useMailWait();
  async function submit(event:FormEvent) {
    event.preventDefault();if(!token||busy.current||wait.seconds>0)return;
    const invalid={newPassword:Array.from(password).length<12||Array.from(password).length>128?'Usa entre 12 y 128 caracteres.':undefined,
      confirmation:password!==confirmation?'Las contraseñas deben coincidir.':undefined};
    setFields(invalid);setError(undefined);
    if(Object.values(invalid).some(Boolean)){setError(new ApiFailure(400,'VALIDATION_ERROR','Revisa los campos indicados.'));return;}
    busy.current=true;setSending(true);
    const request=api.request('/auth/password/reset',{method:'POST',body:{token,newPassword:password}});
    setPassword('');setConfirmation('');
    try{await request;setToken(null);setChanged(true);}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=publicFailure(failure);setError(safe);
      if(safe.code==='INVALID_ACTION_LINK')setToken(null);
      if(safe.status===429)wait.start(safe.retryAfterSeconds??60);
      setFields(Object.fromEntries(safe.fields.filter(field=>field==='newPassword').map(field=>[field,'Revisa este campo.'])));
    }}finally{busy.current=false;setSending(false);}
  }
  return <main style={{maxWidth:'32rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Restablecer contraseña</h1>
    {changed?<Feedback message="Contraseña restablecida. Las sesiones anteriores se han cerrado. Inicia sesión con tu nueva contraseña."/>
      :token?<form onSubmit={submit} noValidate aria-busy={sending}>
        <FormField id="reset-password" label="Nueva contraseña" type="password" autoComplete="off" value={password}
          error={fields.newPassword} disabled={sending} onChange={event=>setPassword(event.target.value)}/>
        <FormField id="reset-confirmation" label="Confirmar nueva contraseña" type="password" autoComplete="off" value={confirmation}
          error={fields.confirmation} disabled={sending} onChange={event=>setConfirmation(event.target.value)}/>
        <p>Usa entre 12 y 128 caracteres; los espacios se conservan. Confirma para cambiar la contraseña.</p>
        <button type="submit" disabled={sending||wait.seconds>0}>{sending?'Restableciendo…':'Restablecer contraseña'}</button>
      </form>:<p>Vuelve a abrir el enlace del correo o solicita instrucciones nuevas.</p>}
    <Feedback error={error}/>
    {wait.seconds>0&&<p role="status">Espera {wait.seconds} segundos antes de reintentar.</p>}
    <p>{!changed&&<><a href="/recuperar">Solicitar nuevo enlace de recuperación</a> · </>}<a href="/login">Iniciar sesión</a></p>
  </main>;
}
