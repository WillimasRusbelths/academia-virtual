import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';

export function LoginPage({onLogin,notice}:{readonly onLogin:(email:string,password:string)=>Promise<void>;readonly notice?:string}) {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [sending,setSending]=useState(false);
  const [error,setError]=useState<ApiFailure>();const [fields,setFields]=useState<{email?:string;password?:string}>({});
  const credential=useRef<HTMLInputElement>(null);
  async function submit(event:FormEvent) {
    event.preventDefault();if(sending)return;
    const invalid={email:!/^\S+@\S+\.\S+$/.test(email.trim())?'Introduce un correo válido.':undefined,
      password:Array.from(password).length<12||Array.from(password).length>128?'Usa entre 12 y 128 caracteres.':undefined};
    setFields(invalid);setError(undefined);if(invalid.email||invalid.password)return;
    setSending(true);
    const request=onLogin(email,password);setPassword('');
    try {await request;}catch(failure){if(!(failure instanceof RequestCancelled)){
      const publicError=failure instanceof ApiFailure?failure:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo completar el acceso. Puedes reintentar manualmente.');
      setError(publicError);setFields(Object.fromEntries(publicError.fields.filter(field=>field==='email'||field==='password').map(field=>[field,'Revisa este campo.'])));
    }}finally{setSending(false);}
  }
  return <main style={{maxWidth:'32rem',margin:'2rem auto',padding:'0 1rem',overflowWrap:'anywhere'}}>
    <h1>Iniciar sesión</h1><Feedback message={notice}/>
    <form onSubmit={submit} noValidate aria-busy={sending}>
      <FormField id="login-email" label="Correo" type="email" autoComplete="username" value={email} error={fields.email}
        onChange={event=>setEmail(event.target.value)} disabled={sending}/>
      <FormField id="login-password" label="Contraseña" type="password" autoComplete="off" value={password} error={fields.password}
        ref={credential} onChange={event=>setPassword(event.target.value)} disabled={sending}/>
      <p>La contraseña admite espacios y debe tener entre 12 y 128 caracteres.</p>
      <button type="submit" disabled={sending}>{sending?'Accediendo…':'Iniciar sesión'}</button>
    </form>
    <Feedback error={error} onRetry={()=>credential.current?.focus()}/>
    <p><a href="/recuperar">Recuperar contraseña</a> · <a href="/verificar-correo">Verificar correo</a></p>
  </main>;
}
