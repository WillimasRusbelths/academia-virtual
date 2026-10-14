import { useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure,RequestCancelled } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { mailInstructions,publicFailure,useMailWait } from './use-mail-wait';

export function RegisterPage({api}:{readonly api:ApiClient}) {
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [sending,setSending]=useState(false);const busy=useRef(false);
  const [accepted,setAccepted]=useState(false);const [error,setError]=useState<ApiFailure>();
  const [fields,setFields]=useState<{name?:string;email?:string;password?:string}>({});const wait=useMailWait();
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy.current)return;
    const invalid={name:Array.from(name.trim()).length<1||Array.from(name.trim()).length>100?'Usa entre 1 y 100 caracteres.':undefined,
      email:Array.from(email.trim()).length>254||!/^\S+@\S+\.\S+$/.test(email.trim())?'Introduce un correo válido de hasta 254 caracteres.':undefined,
      password:Array.from(password).length<12||Array.from(password).length>128?'Usa entre 12 y 128 caracteres.':undefined};
    setFields(invalid);setError(undefined);
    if(Object.values(invalid).some(Boolean)){setError(new ApiFailure(400,'VALIDATION_ERROR','Revisa los campos indicados.'));return;}
    busy.current=true;setSending(true);
    const request=api.request('/auth/register',{method:'POST',body:{name,email,password}});setPassword('');
    try{await request;setAccepted(true);wait.start(60);}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=publicFailure(failure);setError(safe);
      setFields(Object.fromEntries(safe.fields.filter(field=>['name','email','password'].includes(field)).map(field=>[field,'Revisa este campo.'])));
      if(safe.status===429){setAccepted(true);wait.start(safe.retryAfterSeconds??60);}
    }}finally{busy.current=false;setSending(false);}
  }
  return <main style={{maxWidth:'32rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Crear cuenta de alumno</h1>
    {!accepted&&<form onSubmit={submit} noValidate aria-busy={sending}>
      <FormField id="register-name" label="Nombre" autoComplete="name" value={name} error={fields.name} disabled={sending} onChange={event=>setName(event.target.value)}/>
      <FormField id="register-email" label="Correo" type="email" autoComplete="email" value={email} error={fields.email} disabled={sending} onChange={event=>setEmail(event.target.value)}/>
      <FormField id="register-password" label="Contraseña" type="password" autoComplete="off" value={password} error={fields.password} disabled={sending} onChange={event=>setPassword(event.target.value)}/>
      <p>Nombre de 1 a 100 caracteres, correo de hasta 254 y contraseña de 12 a 128. Los espacios de la contraseña se conservan.</p>
      <button disabled={sending} type="submit">{sending?'Registrando…':'Crear cuenta'}</button>
    </form>}
    <Feedback error={error}/>{accepted&&<Feedback message={mailInstructions}/>}
    {accepted&&<><p>{wait.seconds>0?`Podrás solicitar un nuevo envío en ${wait.seconds} segundos.`:'Puedes solicitar un nuevo envío.'}</p>
      <p><a href="/verificar-correo" aria-disabled={wait.seconds>0} onClick={event=>{if(wait.seconds>0)event.preventDefault();}}>Solicitar nuevo envío</a></p></>}
    <p><a href="/login">Iniciar sesión</a></p>
  </main>;
}
