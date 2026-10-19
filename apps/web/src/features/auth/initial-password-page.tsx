import { useEffect,useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure,RequestCancelled } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { publicFailure,useMailWait } from './use-mail-wait';

export function InitialPasswordPage({api}:{readonly api:ApiClient}) {
  const [email,setEmail]=useState('');const [provisionalPassword,setProvisional]=useState('');const [newPassword,setPassword]=useState('');
  const [sending,setSending]=useState(false);const [changed,setChanged]=useState(false);const busy=useRef(false);
  const [error,setError]=useState<ApiFailure>();const [fields,setFields]=useState<Record<string,string|undefined>>({});
  const wait=useMailWait();
  useEffect(()=>{window.history.replaceState(null,'',window.location.pathname);},[]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy.current||wait.seconds>0)return;
    const invalid={email:Array.from(email.trim()).length>254||!/^\S+@\S+\.\S+$/.test(email.trim())?'Introduce un correo válido de hasta 254 caracteres.':undefined,
      provisionalPassword:Array.from(provisionalPassword).length<12||Array.from(provisionalPassword).length>128?'Usa entre 12 y 128 caracteres.':undefined,
      newPassword:Array.from(newPassword).length<12||Array.from(newPassword).length>128?'Usa entre 12 y 128 caracteres.':undefined};
    setFields(invalid);setError(undefined);
    if(Object.values(invalid).some(Boolean)){setError(new ApiFailure(400,'VALIDATION_ERROR','Revisa los campos indicados.'));return;}
    busy.current=true;setSending(true);
    const request=api.request('/auth/password/initial',{method:'POST',body:{email,provisionalPassword,newPassword}});
    setProvisional('');setPassword('');
    try{await request;setEmail('');setChanged(true);}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=publicFailure(failure);
      setError(safe.code==='INVALID_CREDENTIALS'?new ApiFailure(401,safe.code,'No se pudo establecer la contraseña con esas credenciales.'):safe);
      setFields(Object.fromEntries(safe.fields.filter(field=>['email','provisionalPassword','newPassword'].includes(field)).map(field=>[field,'Revisa este campo.'])));
      if(safe.status===429&&safe.retryAfterSeconds!==undefined)wait.start(safe.retryAfterSeconds);
    }}finally{busy.current=false;setSending(false);}
  }
  return <main style={{maxWidth:'32rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Establecer contraseña propia</h1>
    {changed?<Feedback message="Contraseña establecida. Para iniciar sesión también debes haber verificado tu correo."/>
      :<form onSubmit={submit} noValidate aria-busy={sending}>
        <FormField id="initial-email" label="Correo" type="email" autoComplete="email" value={email} error={fields.email}
          disabled={sending} onChange={event=>setEmail(event.target.value)}/>
        <FormField id="initial-provisional" label="Credencial provisional" type="password" autoComplete="off" value={provisionalPassword} error={fields.provisionalPassword}
          disabled={sending} onChange={event=>setProvisional(event.target.value)}/>
        <FormField id="initial-password" label="Nueva contraseña" type="password" autoComplete="off" value={newPassword} error={fields.newPassword}
          disabled={sending} onChange={event=>setPassword(event.target.value)}/>
        <p>Contraseñas de 12 a 128 caracteres; los espacios se conservan. Esta acción no verifica tu correo ni inicia sesión.</p>
        <button type="submit" disabled={sending||wait.seconds>0}>{sending?'Estableciendo…':'Establecer contraseña'}</button>
      </form>}
    <Feedback error={error}/>
    {!changed&&<p>Si la credencial provisional ha vencido, verifica tu correo y solicita recuperar tu contraseña.</p>}
    <p><a href="/verificar-correo">Verificar correo</a> · <a href="/recuperar">Recuperar contraseña</a> · <a href="/login">Iniciar sesión</a></p>
  </main>;
}
