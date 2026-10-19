import { useEffect,useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { RequestCancelled } from '../../shared/api-client';
import type { ApiClient,ApiFailure } from '../../shared/api-client';
import type { UserView } from '../../shared/user-view';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { administrativeApi } from './api';
import { AdminLayout,AccountFacts,adminFailure,nameError,roleLabels,statusLabels } from './admin-ui';

export function AccountDetailPage({api,id}:{api:ApiClient;id:string}) {
  const [user,setUser]=useState<UserView>();const [name,setName]=useState('');const [role,setRole]=useState('');const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);const [sending,setSending]=useState(false);const busy=useRef(false);
  const [error,setError]=useState<ApiFailure>();const [invalid,setInvalid]=useState<string>();const [message,setMessage]=useState<string>();
  const [confirmation,setConfirmation]=useState<{kind:'role'|'status';value:string}>();const [revision,setRevision]=useState(0);
  function accept(value:UserView){setUser(value);setName(value.name);setRole(value.role);setStatus(value.status);}
  useEffect(()=>{
    const controller=new AbortController();
    void administrativeApi(api).get(id,controller.signal).then(value=>{accept(value);setLoading(false);},failure=>{
      if(!(failure instanceof RequestCancelled)){setUser(undefined);setError(adminFailure(failure));setLoading(false);}
    });return ()=>controller.abort();
  },[api,id,revision]);
  async function save(kind:'name'|'role'|'status',value:string) {
    if(busy.current)return;busy.current=true;setSending(true);setError(undefined);setMessage(undefined);setConfirmation(undefined);
    try {const calls=administrativeApi(api);accept(await calls[kind](id,value));setMessage('Cambio confirmado.');}
    catch(failure){if(!(failure instanceof RequestCancelled)){
      const safe=adminFailure(failure);setError(safe);
      if(safe.fields.includes('name'))setInvalid('Revisa este campo.');
      if(safe.status===403){setUser(undefined);setName('');setRole('');setStatus('');}
      else if(user){setRole(user.role);setStatus(user.status);}
    }}finally{busy.current=false;setSending(false);}
  }
  function correctName(event:FormEvent){event.preventDefault();if(busy.current)return;const invalid=nameError(name);setInvalid(invalid);if(!invalid)void save('name',name);}
  return <AdminLayout title="Detalle de cuenta"><Feedback error={error} message={message} onRetry={()=>{setUser(undefined);setError(undefined);setLoading(true);setConfirmation(undefined);setRevision(value=>value+1);}}/>
    {loading&&<p role="status">Consultando cuenta…</p>}
    {user&&<><AccountFacts user={user}/><form onSubmit={correctName} noValidate aria-busy={sending}>
      <FormField id="account-name" label="Nombre" value={name} error={invalid} disabled={sending} onChange={event=>setName(event.target.value)}/><button type="submit" disabled={sending}>Guardar nombre</button></form>
      <section aria-label="Cambios de acceso"><p>Un cambio efectivo de rol o una desactivación cierra las sesiones anteriores.</p>
        <p><label htmlFor="account-role">Rol</label> <select id="account-role" value={role} disabled={sending||!!confirmation} onChange={event=>setRole(event.target.value)}>{Object.entries(roleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <button type="button" disabled={sending||!!confirmation} onClick={()=>{setError(undefined);setConfirmation({kind:'role',value:role});}}>Cambiar rol</button></p>
        <p><label htmlFor="account-status">Estado</label> <select id="account-status" value={status} disabled={sending||!!confirmation} onChange={event=>setStatus(event.target.value)}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <button type="button" disabled={sending||!!confirmation} onClick={()=>{setError(undefined);setConfirmation({kind:'status',value:status});}}>Cambiar estado</button></p>
        {confirmation&&<div className="admin-confirmation" role="group" aria-label="Confirmación de cambio de acceso"><h2>Confirmar cambio</h2>
          <p>{confirmation.kind==='role'?`Cambiar rol a ${roleLabels[confirmation.value as UserView['role']]}.`:`Cambiar estado a ${statusLabels[confirmation.value as UserView['status']]}.`}
            {confirmation.value==='ACTIVE'?' Reactivar no verifica el correo ni restaura accesos revocados.':' El cambio puede invalidar sesiones y, al desactivar, enlaces pendientes.'}</p>
          <button type="button" disabled={sending} onClick={()=>void save(confirmation.kind,confirmation.value)}>Confirmar cambio</button>
          <button type="button" disabled={sending} onClick={()=>setConfirmation(undefined)}>Cancelar</button></div>}
      </section></>}
  </AdminLayout>;
}
