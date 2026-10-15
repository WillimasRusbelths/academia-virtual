import { useEffect,useRef,useState } from 'react';
import type { FormEvent } from 'react';
import { RequestCancelled } from '../../shared/api-client';
import type { ApiClient,ApiFailure } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import { administrativeApi } from './api';
import type { AccountFilters,AccountList } from './api';
import { AdminLayout,adminFailure,roleLabels,statusLabels } from './admin-ui';
import { CreateAccountForm } from './create-account-form';

const initial:AccountFilters={q:'',role:'',status:'',page:1,pageSize:20};
export function AccountsPage({api}:{api:ApiClient}) {
  const [draft,setDraft]=useState(initial);const [filter,setFilter]=useState(initial);const [data,setData]=useState<AccountList>();
  const [loading,setLoading]=useState(true);const [error,setError]=useState<ApiFailure>();const [create,setCreate]=useState(false);const [revision,setRevision]=useState(0);
  const sequence=useRef(0);const [invalid,setInvalid]=useState<string>();
  useEffect(()=>{
    const controller=new AbortController();const version=++sequence.current;
    void administrativeApi(api).list(filter,controller.signal).then(value=>{if(version===sequence.current){setData(value);setLoading(false);}},failure=>{
      if(version===sequence.current&&!(failure instanceof RequestCancelled)){setError(adminFailure(failure));setData(undefined);setCreate(false);setLoading(false);}
    });
    return ()=>controller.abort();
  },[api,filter,revision]);
  function search(event:FormEvent) {
    event.preventDefault();if(loading)return;
    if(Array.from(draft.q).length>254){setInvalid('La búsqueda admite hasta 254 caracteres.');return;}
    setInvalid(undefined);setError(undefined);setData(undefined);setLoading(true);setFilter({...draft,page:1});
  }
  function page(value:number){setError(undefined);setData(undefined);setLoading(true);setFilter({...filter,page:value});}
  function reload(){setError(undefined);setLoading(true);setRevision(value=>value+1);}
  const denied=error?.status===403;
  return <AdminLayout title="Gestión de cuentas"><Feedback error={error} onRetry={reload}/>
    {!denied&&<>
      <form onSubmit={search} aria-busy={loading} noValidate><FormField id="accounts-search" label="Buscar por nombre o correo" value={draft.q} error={invalid} disabled={loading} onChange={event=>setDraft({...draft,q:event.target.value})}/>
        <div className="admin-grid"><label>Filtrar por rol<select value={draft.role} disabled={loading} onChange={event=>setDraft({...draft,role:event.target.value})}><option value="">Todos</option>{Object.entries(roleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Filtrar por estado<select value={draft.status} disabled={loading} onChange={event=>setDraft({...draft,status:event.target.value})}><option value="">Todos</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Resultados por página<select value={draft.pageSize} disabled={loading} onChange={event=>setDraft({...draft,pageSize:Number(event.target.value)})}>{[10,20,50].map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
        <button type="submit" disabled={loading}>Buscar</button></form>
      <button type="button" disabled={loading} onClick={()=>setCreate(value=>!value)}>{create?'Cerrar alta':'Nueva cuenta'}</button>
      {create&&<CreateAccountForm api={api} onCreated={reload} onDenied={failure=>{setError(failure);setData(undefined);setCreate(false);}}
        onResolve={email=>{setCreate(false);setError(undefined);setData(undefined);setLoading(true);const next={...initial,q:email};setDraft(next);setFilter(next);}}/>}
      {loading&&<p role="status">Consultando cuentas…</p>}
      {data&&<><p role="status">{data.total} cuentas · Página {data.page} de {Math.max(1,Math.ceil(data.total/data.pageSize))}</p>
        {data.items.length===0?<p>No hay cuentas que coincidan.</p>:<ul className="account-list">{data.items.map(user=><li key={user.id}><a href={`/admin/cuentas/${user.id}`}>{user.name}</a><p>{user.email}</p><p>{roleLabels[user.role]} · {statusLabels[user.status]}</p></li>)}</ul>}
        <nav aria-label="Paginación de cuentas"><button type="button" disabled={loading||data.page<=1} onClick={()=>page(data.page-1)}>Anterior</button>
          <button type="button" disabled={loading||data.page*data.pageSize>=data.total} onClick={()=>page(data.page+1)}>Siguiente</button></nav></>}
    </>}
  </AdminLayout>;
}
