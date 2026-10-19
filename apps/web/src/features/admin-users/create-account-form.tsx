import { useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { RequestCancelled } from '../../shared/api-client';
import type { ApiClient,ApiFailure } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { administrativeApi } from './api';
import { adminFailure,nameError } from './admin-ui';

export function CreateAccountForm({api,onCreated,onResolve,onDenied}:{api:ApiClient;onCreated:()=>void;onResolve:(email:string)=>void;onDenied:(error:ApiFailure)=>void}) {
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [role,setRole]=useState('STUDENT');const [password,setPassword]=useState('');
  const [sending,setSending]=useState(false);const busy=useRef(false);const [error,setError]=useState<ApiFailure>();
  const [fields,setFields]=useState<Record<string,string|undefined>>({});const [created,setCreated]=useState(false);const [resolveEmail,setResolveEmail]=useState('');
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy.current||resolveEmail)return;
    const invalid={name:nameError(name),email:Array.from(email.trim()).length>254||!/^\S+@\S+\.\S+$/.test(email.trim())?'Introduce un correo válido de hasta 254 caracteres.':undefined,
      provisionalPassword:Array.from(password).length<12||Array.from(password).length>128?'Usa entre 12 y 128 caracteres, sin retirar espacios.':undefined};
    setFields(invalid);setError(undefined);setCreated(false);if(Object.values(invalid).some(Boolean))return;
    busy.current=true;setSending(true);
    const request=administrativeApi(api).create({name,email,role,provisionalPassword:password});setPassword('');
    try{await request;setName('');setEmail('');setRole('STUDENT');setCreated(true);onCreated();}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=adminFailure(failure);setError(safe);
      if(safe.status===403){setName('');setEmail('');onDenied(safe);}
      else{setFields(Object.fromEntries(safe.fields.map(field=>[field,'Revisa este campo.'])));if(safe.status===503||safe.code==='ACCOUNT_CONFLICT')setResolveEmail(email.trim());}
    }}finally{busy.current=false;setSending(false);}
  }
  return <section aria-labelledby="create-account-heading"><h2 id="create-account-heading">Nueva cuenta</h2>
    <p>Introduce la credencial provisional y entrégala por un canal privado. No podrá recuperarse desde la aplicación. El destinatario deberá verificar su correo y establecer su contraseña.</p>
    <form onSubmit={submit} noValidate aria-busy={sending}>
      <FormField id="create-name" label="Nombre" value={name} error={fields.name} disabled={sending||!!resolveEmail} onChange={event=>setName(event.target.value)}/>
      <FormField id="create-email" label="Correo" type="email" value={email} error={fields.email} disabled={sending||!!resolveEmail} onChange={event=>setEmail(event.target.value)}/>
      <p><label htmlFor="create-role">Rol</label> <select id="create-role" value={role} disabled={sending||!!resolveEmail} onChange={event=>setRole(event.target.value)}>
        <option value="STUDENT">Alumno</option><option value="TEACHER">Docente</option><option value="ADMIN">Administrador</option></select></p>
      <FormField id="create-provisional" label="Credencial provisional" type="password" autoComplete="off" value={password} error={fields.provisionalPassword}
        disabled={sending||!!resolveEmail} onChange={event=>setPassword(event.target.value)}/>
      <button type="submit" disabled={sending||!!resolveEmail}>{sending?'Creando…':'Crear cuenta'}</button>
    </form>
    <Feedback message={created?'Cuenta creada. La verificación se enviará si hay cuota; este resultado no confirma la entrega del correo.':undefined} error={error}/>
    {resolveEmail&&<><p>Consulta el correo antes de intentar otra alta. No se repetirá ni sobrescribirá la cuenta automáticamente.</p>
      <button type="button" onClick={()=>onResolve(resolveEmail)}>Consultar cuenta por correo</button></>}
  </section>;
}
