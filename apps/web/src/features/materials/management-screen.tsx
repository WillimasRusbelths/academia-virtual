import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import { createMaterialsManagementController, hashMaterialFile, MaterialsManagementPage } from './management-page';
import type { MaterialGroup, MaterialsApi, Page, ManagedMaterial, MaterialState } from './api';
import { isManagedGroup, isManagedMaterial } from './api';
import { createMaterialActionsController, MaterialActions } from './material-actions';
import type { MaterialActionsController } from './material-actions';

const safe=(error:unknown)=>error instanceof ApiFailure?error:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo consultar. Reintenta manualmente.');
const noActions=Object.freeze({state:'IDLE',busy:false}),noSubscribe=()=>()=>{};
export function MaterialsScreen({api,groupId}:{readonly api:MaterialsApi;readonly groupId?:string}) {
  // Route/account keys supplied by app create a new scope on every change.
  const [scope]=useState(()=>new AbortController()),client=useMemo(()=>api.scope(scope.signal),[api,scope]);
  const [group,setGroup]=useState<MaterialGroup>(),[groups,setGroups]=useState<Page<MaterialGroup>>(),[items,setItems]=useState<Page<ManagedMaterial>>();
  const [page,setPage]=useState(1),[filter,setFilter]=useState<MaterialState|''>(''),[loading,setLoading]=useState(true),[error,setError]=useState<ApiFailure>();
  const [retry,setRetry]=useState(0),generation=useRef(0),notice=useRef<HTMLDivElement>(null);
  const [actions,setActions]=useState<MaterialActionsController>(),actionsRef=useRef<MaterialActionsController|undefined>(undefined);
  const [permissions,setPermissions]=useState<MaterialGroup['actions']>();
  const actionState=useSyncExternalStore<{readonly state:string;readonly busy:boolean}>(actions?.subscribe??noSubscribe,
    ()=>actions?.snapshot()??noActions,()=>actions?.snapshot()??noActions);
  const actionLocked=actionState.busy||['UNCERTAIN','RETRY_READY','CONFLICT'].includes(actionState.state);
  function deny() {
    generation.current++;setGroup(undefined);setItems(undefined);setGroups(undefined);scope.abort();
    actionsRef.current?.dispose();setActions(undefined);setError(new ApiFailure(403,'FORBIDDEN','El grupo ya no está disponible para esta sesión.'));
  }
  const [controller]=useState(()=>createMaterialsManagementController(client,{groupId:groupId??'',intentionId:()=>crypto.randomUUID(),commandId:()=>crypto.randomUUID(),hash:hashMaterialFile,
    onDenied:deny}));
  const flow=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{return ()=>{scope.abort();generation.current++;controller.dispose();actionsRef.current?.dispose();};},[scope,controller]);
  function inspect(material:ManagedMaterial) {
    if(!group||actionLocked)return;
    actionsRef.current?.dispose();const next=createMaterialActionsController(client,{material,commandId:()=>crypto.randomUUID(),
      onChanged:()=>setRetry(value=>value+1),onDenied:deny});
    actionsRef.current=next;setActions(next);setPermissions(group.actions);
  }
  useEffect(()=>{
    const epoch=++generation.current;setLoading(true);setError(undefined);setItems(undefined);setGroups(undefined);
    // Clear previously authorized context before every fresh decision.
    setGroup(undefined);
    void (async()=>{
      try {
        if(groupId) {
          const [context,result]=await Promise.all([client.group(groupId),client.items(groupId,{page,pageSize:20,...(filter?{state:filter}:{})})]);
          if(epoch!==generation.current||scope.signal.aborted)return;
          if(!isManagedGroup(context)||!result.items.every(isManagedMaterial))throw safe(undefined);
          setGroup(context);setItems({...result,items:result.items});
        } else {
          const result=await client.groups({page,pageSize:20});if(epoch!==generation.current||scope.signal.aborted)return;
          if(!result.items.every(isManagedGroup))throw safe(undefined);
          setGroups({...result,items:result.items});
        }
      } catch(failure) {if(epoch===generation.current&&!scope.signal.aborted&&!(failure instanceof RequestCancelled)){
        const error=safe(failure);if([401,403,404].includes(error.status)){actionsRef.current?.dispose();setActions(undefined);controller.dispose();}
        setError(error);
      }}
      finally {if(epoch===generation.current&&!scope.signal.aborted)setLoading(false);}
    })();
  },[client,groupId,page,filter,retry,scope]);
  // Successful durable writes refresh only reads; never replay a mutation.
  useEffect(()=>{if(flow.writeVersion>0)setRetry(value=>value+1);},[flow.writeVersion]);
  useEffect(()=>{if(error)notice.current?.focus();},[error]);
  const total=groupId?items?.total:groups?.total,denied=flow.state==='DENIED'||flow.state==='AUTH_REQUIRED';
  return <main><nav aria-label="Navegación de materiales"><a href="/inicio">Inicio</a>{' · '}<a href="/materiales">Materiales</a></nav>
    <h1>{groupId?'Materiales del grupo':'Materiales'}</h1>
    <div ref={notice} tabIndex={-1}>{loading&&!denied&&<p role="status">Consultando materiales…</p>}
      {error&&<div role="alert"><p>{error.message}</p>{error.status===503&&<button type="button" onClick={()=>setRetry(value=>value+1)}>Reintentar consulta</button>}</div>}</div>
    {groups&&<section aria-label="Grupos accesibles"><h2>Grupos</h2>{!groups.items.length&&<p role="status">No hay grupos accesibles en esta consulta.</p>}
      <ul>{groups.items.map(item=><li key={item.id}><a href={`/materiales/grupos/${item.id}`}>{item.name}</a> · {item.courseName}{item.state==='CANCELLED'?' · Cancelado (histórico)':''}</li>)}</ul></section>}
    {group&&items&&<><h2>{group.name}</h2><p>{group.courseName}</p>
      {group.state==='CANCELLED'&&<p role="status">Grupo cancelado. Consulta histórica; no permite preparar ni publicar.</p>}
      <label htmlFor="material-state">Estado de materiales</label>{' '}<select id="material-state" value={filter} disabled={flow.busy||actionLocked} onChange={event=>{setPage(1);setFilter(event.target.value as MaterialState|'');}}>
        <option value="">Todos</option><option value="PREPARED">Preparados</option><option value="PUBLISHED">Publicados</option><option value="WITHDRAWN">Retirados</option></select>
    </>}
    {groupId&&(!loading&&!error||flow.busy||denied)&&<MaterialsManagementPage controller={controller} items={items?.items??[]}
      canPrepare={group?.actions.prepare??false} canPublish={group?.actions.publish??false} onRefresh={()=>setRetry(value=>value+1)} onInspect={inspect} actionsBlocked={actionLocked}/>}
    {actions&&<MaterialActions controller={actions} canEdit={permissions?.edit??false} canPublish={permissions?.publish??false}
      canWithdraw={permissions?.withdraw??false} canPrepare={permissions?.prepare??false} onPrepareNew={()=>document.getElementById('material-title')?.focus()}/>}
    {total!==undefined&&<nav aria-label="Páginas de materiales"><button type="button" disabled={loading||flow.busy||actionLocked||page<=1} onClick={()=>setPage(value=>value-1)}>Anterior</button>
      <span> Página {page} · {total} resultados </span><button type="button" disabled={loading||flow.busy||actionLocked||page*20>=total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></nav>}
  </main>;
}
