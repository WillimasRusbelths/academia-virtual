import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import type { ClassesApi, ClassGroup, ManagedClass, Page, ClassState, CommandResult, CreateInput, CommandInput, EditInput } from './api';
import './management.css';

type Transition='start'|'finish'|'cancel';
type Intent={operation:'create';id:string;input:CreateInput}|{operation:'edit';id:string;input:EditInput}|{operation:Transition;id:string;input:CommandInput};
interface Snapshot {
  readonly phase:'IDLE'|'CONFIRMING'|'BUSY'|'UNCERTAIN'|'RETRY_READY'|'CONFLICT'|'DENIED'|'DISPOSED';
  readonly resource:ManagedClass|null;readonly title:string;readonly description:string;readonly commandId:string|null;
  readonly confirmation:Transition|null;readonly comparison:ManagedClass|null;readonly error:ApiFailure|undefined;
  readonly fields:Readonly<Record<string,string>>;readonly notice:string;
}
const safe=(e:unknown)=>e instanceof ApiFailure?e:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar el resultado. Consulta el comando antes de reintentar.');
const labels:Record<ClassState,string>={PREPARED:'Preparada',LIVE:'En curso',FINISHED:'Finalizada',CANCELLED:'Cancelada'};
export function createClassesManagementController(api:ClassesApi,options:{groupId:string;initial?:ManagedClass;canPrepare?:boolean;commandId():string;onDenied?():void;onChanged?():void}) {
  let state:Snapshot=Object.freeze({phase:'IDLE',resource:options.initial??null,title:options.initial?.title??'',description:options.initial?.description??'',commandId:null,
    confirmation:null,comparison:null,error:undefined,fields:{},notice:''});
  let intent:Intent|null=null,disposed=false; const listeners=new Set<()=>void>();
  const update=(change:Partial<Snapshot>)=>{state=Object.freeze({...state,...change});for(const listener of listeners)listener();};
  const editable=()=>!disposed&&state.phase==='IDLE';
  const clear=(phase:'DENIED'|'DISPOSED',error?:ApiFailure)=>{intent=null;update({phase,resource:null,title:'',description:'',commandId:null,confirmation:null,comparison:null,fields:{},notice:'',error});};
  function failure(e:unknown) {
    if(disposed)return;
    const error=safe(e);
    if([401,403,404].includes(error.status)){clear('DENIED',error);options.onDenied?.();return;}
    if(error.status===503){update({phase:'UNCERTAIN',error,confirmation:null});return;}
    if(error.status===409){update({phase:'CONFLICT',error,comparison:null,confirmation:null});return;}
    intent=null;update({phase:'IDLE',commandId:null,error,confirmation:null,fields:Object.fromEntries(error.fields.filter(f=>f==='title'||f==='description').map(f=>[f,'Revisa este campo.']))});
  }
  function accept(result:CommandResult) {
    if(disposed||!intent)return;
    if(result.command.id!==intent.input.commandId||result.resource.groupId!==options.groupId||intent.operation!=='create'&&result.resource.id!==intent.id)
      throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','La respuesta no permite confirmar este comando.');
    intent=null;update({phase:'IDLE',resource:result.resource,title:result.resource.title,description:result.resource.description??'',commandId:null,confirmation:null,
      comparison:null,error:undefined,fields:{},notice:result.command.result==='NO_CHANGE'?'Estado confirmado, sin cambios nuevos.':'Cambio confirmado.'});
    options.onChanged?.();
  }
  async function send() {
    if(!intent||disposed)return;
    const current=intent;update({phase:'BUSY',error:undefined,notice:''});
    try {const result=current.operation==='create'?await api.create(current.id,current.input):current.operation==='edit'?await api.edit(current.id,current.input):await api[current.operation](current.id,current.input);accept(result);}
    catch(e){failure(e);}
  }
  const controller={
    snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
    setTitle(value:string){if(editable())update({title:value,error:undefined,fields:{},notice:''});},
    setDescription(value:string){if(editable())update({description:value,error:undefined,fields:{},notice:''});},
    async save(){
      if(!editable()||state.resource&&!state.resource.actions.edit||!state.resource&&options.canPrepare===false)return;
      const title=state.title.trim(),description=state.description.trim()||null,fields:Record<string,string>={};
      if(!title||[...title].length>160||title.includes('\0')||/\p{Surrogate}/u.test(title))fields.title='Escribe un título de 1 a 160 caracteres válidos.';
      if(description&&([...description].length>2000||description.includes('\0')||/\p{Surrogate}/u.test(description)))fields.description='La descripción admite hasta 2000 caracteres válidos.';
      if(Object.keys(fields).length){update({fields,error:new ApiFailure(400,'VALIDATION_ERROR','Revisa los campos indicados.')});return;}
      const commandId=options.commandId();
      intent=state.resource?{operation:'edit',id:state.resource.id,input:Object.freeze({commandId,expectedRevision:state.resource.revision,title,description})}
        :{operation:'create',id:options.groupId,input:Object.freeze({commandId,title,description})};
      update({commandId});await send();
    },
    ask(operation:Transition){if(editable()&&state.resource?.actions[operation])update({phase:'CONFIRMING',confirmation:operation,error:undefined,notice:''});},
    decline(){if(!disposed&&state.phase==='CONFIRMING')update({phase:'IDLE',confirmation:null});},
    async confirm(){
      if(disposed||state.phase!=='CONFIRMING'||!state.resource||!state.confirmation)return;
      const operation=state.confirmation;if(!state.resource.actions[operation])return;
      const commandId=options.commandId();intent={operation,id:state.resource.id,input:Object.freeze({commandId,expectedRevision:state.resource.revision})};update({commandId});await send();
    },
    async recover(){
      if(disposed||state.phase!=='UNCERTAIN'||!intent)return;
      update({phase:'BUSY',error:undefined});
      try {const result=await api.command(intent.input.commandId);if(disposed)return;
        if(result.result==='APPLIED')accept(result.response);else update({phase:'RETRY_READY',notice:'El comando no está confirmado. Puedes reintentar manualmente la misma intención.'});}
      catch(e){failure(e);}
    },
    async retry(){if(!disposed&&state.phase==='RETRY_READY')await send();},
    async compare(){
      if(disposed||state.phase!=='CONFLICT'||!state.resource)return;
      update({phase:'BUSY'});
      try {const current=await api.session(state.resource.id);if(!disposed)update({phase:'CONFLICT',comparison:current});}
      catch(e){if(!disposed&&safe(e).status===503)update({phase:'CONFLICT',error:safe(e)});else failure(e);}
    },
    adopt(){if(disposed||state.phase!=='CONFLICT'||!state.comparison)return;intent=null;update({phase:'IDLE',resource:state.comparison,comparison:null,commandId:null,error:undefined,notice:'Revisión actual adoptada. Revisa tu borrador y confirma de nuevo.'});},
    discardRejected(){if(disposed||state.phase!=='CONFLICT')return;intent=null;update({phase:'IDLE',commandId:null,error:undefined,comparison:null,notice:'Intento rechazado descartado. Revisa el estado antes de otra acción.'});},
    newDraft(){if(editable()&&options.canPrepare!==false){intent=null;update({resource:null,title:'',description:'',notice:'',error:undefined,fields:{}});}},
    discardDraft(){if(editable())update({title:state.resource?.title??'',description:state.resource?.description??'',error:undefined,fields:{},notice:'Borrador local descartado.'});},
    dispose(){if(disposed)return;disposed=true;clear('DISPOSED');listeners.clear();},
  };
  return controller;
}
export type ClassesManagementController=ReturnType<typeof createClassesManagementController>;

export function ClassEditor({controller,canPrepare=false}:{readonly controller:ClassesManagementController;readonly canPrepare?:boolean}) {
  const s=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),focus=useRef<HTMLDivElement>(null),title=useRef<HTMLInputElement>(null);
  const previous=useRef(s.phase),blocked=s.phase!=='IDLE';
  useEffect(()=>{
    if(s.phase==='CONFIRMING'||s.error||s.notice)focus.current?.focus();
    else if(previous.current==='CONFIRMING')title.current?.focus();
    previous.current=s.phase;
  },[s.phase,s.error,s.notice]);
  if(s.phase==='DISPOSED')return null;
  return <section aria-label="Gestión de la clase">
    <div ref={focus} tabIndex={-1}>
      {s.error&&<div role="alert"><p>{s.error.message}</p>{s.error.retryAfterSeconds!==undefined&&<p>Espera {s.error.retryAfterSeconds} segundos antes de reintentar.</p>}</div>}
      {s.notice&&<p role="status">{s.notice}</p>}
      {s.phase==='BUSY'&&<p role="status">Consultando resultado…</p>}
      {s.phase==='CONFIRMING'&&<section aria-label="Confirmación de estado"><h3>{s.confirmation==='start'?'Confirmar inicio':s.confirmation==='finish'?'Confirmar finalización':'Confirmar cancelación'}</h3>
        <p>{s.confirmation==='start'?'Iniciar habilita el estado de la clase; no confirma una señal de video.':'Esta transición es terminal y no permite reabrir la clase.'}</p>
        <p>Clase: {s.resource?.title}. Revisión {s.resource?.revision}.</p><div className="class-actions"><button type="button" onClick={()=>controller.decline()}>Volver sin cambios</button><button type="button" onClick={()=>void controller.confirm()}>Confirmar cambio de estado</button></div></section>}
    </div>
    {s.phase==='DENIED'?<p>El recurso ya no está disponible para esta sesión.</p>:<>
      {s.resource&&<><h2>{s.resource.title}</h2><p>Estado: {labels[s.resource.state]}. Revisión {s.resource.revision}.</p><p>Creada: <time dateTime={s.resource.createdAt}>{s.resource.createdAt}</time></p>
        <p>El estado de la clase no confirma una señal de video. El video no está disponible en esta pantalla.</p></>}
      <form onSubmit={event=>{event.preventDefault();void controller.save();}} noValidate>
        <fieldset disabled={blocked||!!s.resource&&!s.resource.actions.edit}><legend>{s.resource?'Corregir textos':'Preparar clase'}</legend>
          <div className="form-field"><label htmlFor="class-title">Título</label><input ref={title} id="class-title" required value={s.title} aria-invalid={!!s.fields.title} aria-describedby={s.fields.title?'class-title-error':'class-title-help'} onChange={event=>controller.setTitle(event.target.value)}/>
            <small id="class-title-help">De 1 a 160 caracteres. Guardar no inicia la clase.</small>{s.fields.title&&<p className="field-error" id="class-title-error">{s.fields.title}</p>}</div>
          <div className="form-field"><label htmlFor="class-description">Descripción opcional</label><textarea id="class-description" rows={4} value={s.description} aria-invalid={!!s.fields.description} aria-describedby={s.fields.description?'class-description-error':'class-description-help'} onChange={event=>controller.setDescription(event.target.value)}/>
            <small id="class-description-help">Hasta 2000 caracteres.</small>{s.fields.description&&<p className="field-error" id="class-description-error">{s.fields.description}</p>}</div>
          <button type="submit">{s.resource?'Guardar corrección':'Preparar clase'}</button>
          {' '}<button type="button" onClick={()=>controller.discardDraft()}>Descartar borrador local</button>
        </fieldset>
      </form>
      {s.resource&&<div className="class-actions">{(['start','finish','cancel'] as const).map(action=>s.resource!.actions[action]&&<button type="button" key={action} disabled={blocked} onClick={()=>controller.ask(action)}>{action==='start'?'Iniciar clase':action==='finish'?'Finalizar clase':'Cancelar clase'}</button>)}
        {canPrepare&&<button type="button" disabled={blocked} onClick={()=>controller.newDraft()}>Preparar otra clase</button>}</div>}
      {s.phase==='UNCERTAIN'&&<button type="button" onClick={()=>void controller.recover()}>Consultar comando pendiente</button>}
      {s.phase==='RETRY_READY'&&<button type="button" onClick={()=>void controller.retry()}>Reintentar la misma intención</button>}
      {s.phase==='CONFLICT'&&<section aria-label="Comparación de cambios"><h3>Revisar conflicto</h3><p>Tu borrador se conserva. No se ha reenviado.</p>
        {s.resource&&<button type="button" onClick={()=>void controller.compare()}>Consultar versión actual</button>}
        {s.comparison&&<><p>Servidor: {s.comparison.title}; {s.comparison.description??'Sin descripción'}. {labels[s.comparison.state]}, revisión {s.comparison.revision}.</p>
          <p>Tu borrador: {s.title}; {s.description||'Sin descripción'}.</p><button type="button" onClick={()=>controller.adopt()}>Adoptar revisión actual y conservar mi borrador</button></>}
        <button type="button" onClick={()=>controller.discardRejected()}>Descartar intento rechazado</button>
      </section>}
      {s.resource&&<p><a href={'/clases/sesiones/'+s.resource.id}>Consultar esta clase</a></p>}
    </>}
  </section>;
}

export function ClassesManagementPage({api,groupId,classId}:{readonly api:ClassesApi;readonly groupId?:string;readonly classId?:string}) {
  const [scope]=useState(()=>new AbortController()),client=useMemo(()=>api.scope(scope.signal),[api,scope]);
  const [data,setData]=useState<{groups?:Page<ClassGroup>;group?:ClassGroup;sessions?:Page<ManagedClass>;resource?:ManagedClass}>();
  const [page,setPage]=useState(1),[filter,setFilter]=useState<ClassState|''>(''),[loading,setLoading]=useState(true),[error,setError]=useState<ApiFailure>();
  const [refresh,setRefresh]=useState(0),[controller,setController]=useState<ClassesManagementController>(),active=useRef<ClassesManagementController|undefined>(undefined),epoch=useRef(0),listEpoch=useRef(0),notice=useRef<HTMLDivElement>(null);
  const flow=useSyncExternalStore(controller?.subscribe??emptySubscribe,controller?.snapshot??emptySnapshot,controller?.snapshot??emptySnapshot);
  const locked=!!flow&&(flow.phase!=='IDLE'||flow.title!==(flow.resource?.title??'')||flow.description!==(flow.resource?.description??''));
  const deny=()=>{epoch.current++;setData(undefined);setController(undefined);active.current?.dispose();scope.abort();setLoading(false);setError(new ApiFailure(404,'NOT_FOUND','El recurso ya no está disponible para esta sesión.'));};
  useEffect(()=>()=>{epoch.current++;scope.abort();active.current?.dispose();},[scope]);
  useEffect(()=>{
    const current=++epoch.current;setLoading(true);setError(undefined);setData(undefined);active.current?.dispose();setController(undefined);
    void (async()=>{
      try {
        const loaded=classId?{resource:await client.session(classId)}:groupId
          ?{group:await client.group(groupId),sessions:await client.sessions(groupId,{page,pageSize:20,...(filter?{state:filter}:{})})}
          :{groups:await client.groups({page,pageSize:20})};
        if(current!==epoch.current||scope.signal.aborted)return;setData(loaded);
        if(loaded.resource||loaded.group?.canPrepare){const next=createClassesManagementController(client,{groupId:loaded.resource?.groupId??loaded.group!.id,initial:loaded.resource,canPrepare:loaded.group?.canPrepare??false,commandId:()=>crypto.randomUUID(),onDenied:deny,
          onChanged(){
            if(!groupId)return;
            const listRequest=++listEpoch.current;
            // A confirmed write refreshes only the list, preserving its receipt
            // and editor. This never repeats a mutation or resets an intention.
            void client.sessions(groupId,{page,pageSize:20,...(filter?{state:filter}:{})}).then(sessions=>{
              if(current===epoch.current&&listRequest===listEpoch.current&&!scope.signal.aborted)setData(prior=>prior?{...prior,sessions}:prior);
            }).catch(e=>{
              if(current!==epoch.current||listRequest!==listEpoch.current||scope.signal.aborted||e instanceof RequestCancelled)return;
              const error=safe(e);if([401,403,404].includes(error.status))deny();else setError(error);
            });
          },
        });active.current=next;setController(next);}
      }catch(e){if(current===epoch.current&&!scope.signal.aborted&&!(e instanceof RequestCancelled))setError(safe(e));}
      finally{if(current===epoch.current&&!scope.signal.aborted)setLoading(false);}
    })();
    // The keyed route owns api/ids/scope; a refresh reauthorizes reads only.
  },[client,groupId,classId,page,filter,refresh,scope]);
  useEffect(()=>{if(error)notice.current?.focus();},[error]);
  const total=data?.groups?.total??data?.sessions?.total;
  return <main className="classes-page"><nav aria-label="Navegación de clases"><a href="/inicio">Inicio</a>{' · '}<a href="/clases">Clases</a>{data?.resource&&<> · <a href={'/clases/grupos/'+data.resource.groupId}>Clases del grupo</a></>}</nav>
    <h1>{classId?'Gestionar clase':groupId?'Clases del grupo':'Clases'}</h1>
    <div ref={notice} tabIndex={-1}>{loading&&<p role="status">Consultando clases…</p>}{error&&<div role="alert"><p>{error.message}</p>{error.status===503&&<button type="button" onClick={()=>setRefresh(n=>n+1)}>Reintentar consulta</button>}</div>}</div>
    {data?.groups&&<section aria-label="Grupos accesibles"><h2>Grupos</h2>{!data.groups.items.length&&<p role="status">No hay grupos accesibles.</p>}<ul>{data.groups.items.map(g=><li key={g.id}><a href={'/clases/grupos/'+g.id}>{g.name}</a> · {g.courseName}{g.state==='CANCELLED'?' · Cancelado (histórico)':''}</li>)}</ul></section>}
    {data?.group&&<><h2>{data.group.name}</h2><p>{data.group.courseName}</p>{data.group.state==='CANCELLED'&&<p role="status">Grupo cancelado: solo gestión histórica. No permite preparar ni iniciar clases.</p>}
      <label htmlFor="classes-filter">Estado de clases</label>{' '}<select id="classes-filter" value={filter} disabled={locked} onChange={e=>{setPage(1);setFilter(e.target.value as ClassState|'');}}><option value="">Todos</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      {data.sessions&&!data.sessions.items.length&&<p role="status">No hay clases en esta consulta.</p>}
      <ul>{data.sessions?.items.map(s=><li key={s.id}><a href={'/clases/sesiones/'+s.id}>{s.title}</a> · {labels[s.state]}</li>)}</ul>
    </>}
    {controller&&<ClassEditor controller={controller} canPrepare={data?.group?.canPrepare}/>}
    {locked&&<p>Resuelve la acción pendiente o guarda/descarta el borrador antes de cambiar la consulta.</p>}
    {total!==undefined&&<nav aria-label="Páginas de clases"><p>{total} {total===1?'resultado':'resultados'}. Página {page}.</p><button type="button" disabled={loading||locked||page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button>{' '}<button type="button" disabled={loading||locked||page*20>=total} onClick={()=>setPage(n=>n+1)}>Siguiente</button></nav>}
    {data&&<p><a href={groupId?'/clases/grupos/'+groupId:classId?'/clases/sesiones/'+classId:'/clases'}>Volver a consultar (descarta el borrador local)</a></p>}
  </main>;
}
const emptySubscribe=()=>()=>{},emptySnapshot=():Snapshot|null=>null;
