import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import { FILE_LIMIT } from './api';
import type { ManagementCommands, MaterialReference, ManagedMaterial, PublishInput, UploadInput } from './api';

export const materialLabels={PREPARED:'Preparado',PUBLISHED:'Publicado',WITHDRAWN:'Retirado'};
export interface ManagementSnapshot {
  readonly state:string;readonly busy:boolean;readonly title:string;readonly description:string;readonly file:File|null;
  readonly intentionId:string|null;readonly material:MaterialReference|null;readonly comparison:MaterialReference|null;readonly error?:ApiFailure;readonly writeVersion:number;
}
interface Options {
  readonly groupId:string;intentionId():string;commandId():string;hash(file:File):Promise<string>;
  readonly onDenied?:()=>void;
}
const initial=():ManagementSnapshot=>({state:'IDLE',busy:false,title:'',description:'',file:null,intentionId:null,material:null,comparison:null,writeVersion:0});
const busyStates=['HASHING','REGISTERING','SENDING','RECOVERING','PUBLISHING'];
const deniedStates=['DENIED','AUTH_REQUIRED','DISPOSED'];
function invalid(field:'title'|'description'|'downloadName'|'mediaType'|'byteSize'):never {
  throw new ApiFailure(400,'VALIDATION_ERROR','Revisa el título, la descripción y el archivo seleccionado.',undefined,[field]);
}
function metadata(file:File|null,title:string,description:string):Omit<UploadInput,'intentionId'|'sha256'> {
  title=title.trim();description=description.trim();
  if(!title||[...title].length>200||/[\p{Cc}\p{Surrogate}]/u.test(title))invalid('title');
  if([...description].length>2000||/\p{Surrogate}/u.test(description)||description.includes('\u0000'))invalid('description');
  if(!file||file.size<1||file.size>FILE_LIMIT)invalid('byteSize');
  if(!file.name||[...file.name].length>180||/[\p{Cc}\p{Surrogate}/\\<>:"|?*]/u.test(file.name)||file.name.trim()!==file.name)invalid('downloadName');
  const extension=file.name.toLowerCase().match(/\.(pdf|jpe?g|png)$/)?.[1];
  const mediaType=extension==='pdf'?'application/pdf':extension==='png'?'image/png':extension==='jpg'||extension==='jpeg'?'image/jpeg':null;
  if(!mediaType||file.type&&file.type!==mediaType)invalid('mediaType');
  return {title,description:description||null,downloadName:file.name,mediaType,byteSize:file.size};
}
export async function hashMaterialFile(file:File):Promise<string> {
  if(file.size<1||file.size>FILE_LIMIT)invalid('byteSize');
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
/** In-memory only. Every continuation checks its lifetime; there is no automatic replay. */
export function createMaterialsManagementController(api:ManagementCommands,options:Options) {
  let state=initial(),generation=0,disposed=false,payload:UploadInput|undefined,fingerprint:string|undefined,uploadId:string|undefined;
  let uncertain:'UPLOAD'|'PUBLISH'|undefined,publishCommand:{materialId:string;input:PublishInput}|undefined;
  const listeners=new Set<()=>void>();
  const update=(next:ManagementSnapshot)=>{state=Object.freeze(next);for(const listener of listeners)listener();};
  const patch=(next:Partial<ManagementSnapshot>)=>update({...state,...next});
  const alive=(epoch:number)=>!disposed&&epoch===generation;
  const canStart=()=>!disposed&&!state.busy&&!deniedStates.includes(state.state);
  const accept=(material:MaterialReference,written=false)=>patch({state:material.state,material,comparison:null,error:undefined,writeVersion:state.writeVersion+(written?1:0)});
  function failure(error:unknown,kind:'UPLOAD'|'PUBLISH') {
    if(error instanceof RequestCancelled)return;
    const safe=error instanceof ApiFailure?error:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar el resultado. Consulta el estado antes de reintentar.');
    if([401,403,404].includes(safe.status)) {
      payload=undefined;fingerprint=undefined;uploadId=undefined;publishCommand=undefined;
      update({...initial(),state:safe.status===401?'AUTH_REQUIRED':'DENIED',error:safe});options.onDenied?.();return;
    }
    uncertain=safe.status===503?'UPLOAD'===kind?'UPLOAD':'PUBLISH':undefined;
    patch({state:safe.status===503?'UNCERTAIN':safe.status===409?'CONFLICT':'REJECTED',error:safe});
  }
  function edit(next:Partial<ManagementSnapshot>) {
    if(!canStart()||['UNCERTAIN','CONFLICT','COMPARING'].includes(state.state))return;
    patch({...next,state:'IDLE',material:null,comparison:null,error:undefined});publishCommand=undefined;
  }
  return {
    snapshot:()=>state,
    subscribe(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener);};},
    setTitle:(title:string)=>edit({title}),setDescription:(description:string)=>edit({description}),setFile:(file:File)=>edit({file}),
    inspect(material:MaterialReference) {if(canStart()&&!['UNCERTAIN','CONFLICT','COMPARING'].includes(state.state)){publishCommand=undefined;accept(material);}},
    async prepare() {
      if(!canStart()||['UNCERTAIN','CONFLICT','COMPARING'].includes(state.state))return;
      const epoch=++generation,file=state.file;patch({state:'HASHING',busy:true,error:undefined});
      try {
        const expected=metadata(file,state.title,state.description),sha256=await options.hash(file!);
        if(!alive(epoch))return;
        if(!/^[0-9a-f]{64}$/.test(sha256))throw new ApiFailure(400,'VALIDATION_ERROR','No se pudo comprobar el archivo.');
        const next=JSON.stringify({...expected,sha256});
        if(next!==fingerprint) {fingerprint=next;payload=Object.freeze({...expected,sha256,intentionId:options.intentionId()});uploadId=undefined;}
        patch({intentionId:payload!.intentionId,state:'REGISTERING'});
        if(!uploadId) {
          const intent=await api.createUpload(options.groupId,payload!);if(!alive(epoch))return;uploadId=intent.uploadId;
          if(intent.state==='COMPLETED') {const material=await api.getMaterial(intent.materialId!);if(alive(epoch))accept(material,true);return;}
        }
        patch({state:'SENDING'});const material=await api.putContent(uploadId,file!);if(alive(epoch))accept(material,true);
      } catch(error) {if(alive(epoch))failure(error,'UPLOAD');}
      finally {if(alive(epoch))patch({busy:false});}
    },
    async recover() {
      if(!canStart())return;const comparing=state.state==='CONFLICT'||state.state==='COMPARING',kind=uncertain;
      if(!payload&&!state.material)return;
      const epoch=++generation;patch({state:'RECOVERING',busy:true,error:undefined});
      try {
        if((kind==='PUBLISH'||comparing)&&state.material) {
          const current=await api.getMaterial(state.material.id);if(!alive(epoch))return;
          if(comparing)patch({state:'COMPARING',comparison:current});else accept(current,true);
        } else {
          // A lost POST response has no uploadId to GET. Explicit recovery resolves
          // that same immutable intention, without sending bytes or publishing.
          const intent=uploadId?await api.uploadStatus(uploadId):await api.createUpload(options.groupId,payload!);
          if(!alive(epoch))return;uploadId=intent.uploadId;
          if(intent.state==='COMPLETED') {const material=await api.getMaterial(intent.materialId!);if(alive(epoch))accept(material,true);}
          else patch({state:'RETRY_READY'});
        }
        if(alive(epoch))uncertain=undefined;
      } catch(error) {if(alive(epoch))failure(error,kind??'UPLOAD');}
      finally {if(alive(epoch))patch({busy:false});}
    },
    acceptComparison() {
      if(canStart()&&state.state==='COMPARING'&&state.comparison){publishCommand=undefined;accept(state.comparison,true);}
    },
    async confirmPublish(materialId:string,confirmed:boolean) {
      if(!confirmed||!canStart()||['UNCERTAIN','CONFLICT','COMPARING'].includes(state.state)||state.material?.id!==materialId||state.material.state!=='PREPARED')return;
      const epoch=++generation;
      if(!publishCommand||publishCommand.materialId!==materialId)publishCommand={materialId,input:Object.freeze({commandId:options.commandId(),expectedRevision:state.material.revision})};
      patch({state:'PUBLISHING',busy:true,error:undefined});
      try {const result=await api.publish(materialId,publishCommand.input);if(alive(epoch)){accept(result.resource,true);publishCommand=undefined;}}
      catch(error){if(alive(epoch))failure(error,'PUBLISH');}
      finally{if(alive(epoch))patch({busy:false});}
    },
    dispose() {generation++;disposed=true;payload=undefined;fingerprint=undefined;uploadId=undefined;publishCommand=undefined;update({...initial(),state:'DISPOSED'});listeners.clear();},
  };
}
export type MaterialsManagementController=ReturnType<typeof createMaterialsManagementController>;
export function MaterialsManagementPage({controller,items=[],canPrepare=true,canPublish=true,onRefresh,onInspect,actionsBlocked=false}:{readonly controller:MaterialsManagementController;
  readonly items?:readonly ManagedMaterial[];readonly canPrepare?:boolean;readonly canPublish?:boolean;readonly onRefresh?:()=>void;
  readonly onInspect?:(item:ManagedMaterial)=>void;readonly actionsBlocked?:boolean}) {
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),[confirmation,setConfirmation]=useState<string|null>(null);
  const notice=useRef<HTMLDivElement>(null),confirmRef=useRef<HTMLFieldSetElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(!busyStates.includes(state.state)&&state.state!=='IDLE')notice.current?.focus();},[state.state]);
  useEffect(()=>{if(confirmation)confirmRef.current?.querySelector('button')?.focus();},[confirmation]);
  const blocked=state.busy||actionsBlocked||['UNCERTAIN','CONFLICT','COMPARING',...deniedStates].includes(state.state);
  const label=state.material?materialLabels[state.material.state]:null;
  return <section aria-label="Gestionar materiales">
    <div ref={notice} tabIndex={-1} role={state.error?'alert':'status'} aria-live="polite" aria-atomic="true">
      {state.error&&<p>{state.error.message}</p>}
      {state.error?.retryAfterSeconds!==undefined&&<p>Espera {state.error.retryAfterSeconds} segundos antes de reintentar.</p>}
      {state.state==='HASHING'&&<p>Comprobando archivo…</p>}{state.state==='REGISTERING'&&<p>Registrando intención…</p>}
      {state.state==='SENDING'&&<p>Enviando archivo…</p>}{state.state==='PUBLISHING'&&<p>Publicando material…</p>}
      {state.state==='RECOVERING'&&<p>Consultando estado…</p>}
      {label&&!['CONFLICT','COMPARING','UNCERTAIN'].includes(state.state)&&<p>{state.material!.title}: {label}. Revisión {state.material!.revision}.</p>}
      {state.state==='UNCERTAIN'&&<p>Resultado incierto. Consulta el estado antes de reintentar manualmente.</p>}
      {state.state==='RETRY_READY'&&<p>La intención sigue pendiente. Puedes reintentar manualmente el envío.</p>}
      {state.state==='COMPARING'&&<p>Revisión anterior: {state.material?.revision}. Consultada: {state.comparison?.revision}. Estado consultado: {state.comparison&&materialLabels[state.comparison.state]}.</p>}
    </div>
    {['UNCERTAIN','CONFLICT','COMPARING'].includes(state.state)&&<button type="button" disabled={state.busy} onClick={()=>void controller.recover()}>Consultar estado de la intención o material</button>}
    {state.state==='COMPARING'&&<button type="button" onClick={()=>controller.acceptComparison()}>Usar revisión consultada</button>}
    {!deniedStates.includes(state.state)&&<>
      <form aria-label="Preparar material" onSubmit={event=>{event.preventDefault();void controller.prepare();}}>
        <p>PDF, JPEG o PNG. Máximo 20 MB (20 000 000 bytes). Preparar conserva el archivo privado; publicar requiere otra confirmación.</p>
        <fieldset disabled={blocked||!canPrepare}><legend>Nuevo material</legend>
          <div className="form-field"><label htmlFor="material-title">Título</label><input id="material-title" required value={state.title}
            aria-invalid={state.error?.fields.includes('title')||undefined} aria-describedby={state.error?.fields.includes('title')?'material-error':undefined}
            onChange={event=>controller.setTitle(event.target.value)}/></div>
          <div className="form-field"><label htmlFor="material-description">Descripción (opcional)</label><textarea id="material-description" value={state.description}
            aria-invalid={state.error?.fields.includes('description')||undefined} aria-describedby={state.error?.fields.includes('description')?'material-error':undefined} onChange={event=>controller.setDescription(event.target.value)}/></div>
          <div className="form-field"><label htmlFor="material-file">Archivo</label><input id="material-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            aria-invalid={state.error?.fields.some(field=>['downloadName','mediaType','byteSize','sha256'].includes(field))||undefined}
            aria-describedby={state.error?.fields.some(field=>['downloadName','mediaType','byteSize','sha256'].includes(field))?'material-error':undefined}
            onChange={event=>{const file=event.target.files?.[0];if(file)controller.setFile(file);}}/>
            {state.file&&<p>Seleccionado: {state.file.name} ({state.file.size} bytes).</p>}</div>
          {state.error?.fields.length!==0&&state.error&&<p id="material-error">{state.error.message}</p>}
          <button type="submit" disabled={!state.file}>{state.state==='RETRY_READY'?'Reintentar envío manualmente':'Preparar material'}</button>
        </fieldset>
      </form>
      {state.material?.state==='PREPARED'&&canPublish&&<button type="button" disabled={blocked} onClick={event=>{returnFocus.current=event.currentTarget;setConfirmation(state.material!.id);}}>Publicar material preparado</button>}
      {confirmation&&state.material?.id===confirmation&&<fieldset ref={confirmRef} disabled={blocked}><legend>Confirmar publicación</legend>
        <p>¿Publicar «{state.material.title}» para los alumnos con matrícula vigente? Revisión {state.material.revision}.</p>
        <button type="button" onClick={()=>{setConfirmation(null);void controller.confirmPublish(confirmation,true);}}>Confirmar publicación</button>{' '}
        <button type="button" onClick={()=>{setConfirmation(null);queueMicrotask(()=>returnFocus.current?.focus());}}>Cancelar</button></fieldset>}
      <section aria-label="Listado de materiales"><h2>Materiales del grupo</h2>
        <button type="button" disabled={state.busy} onClick={onRefresh}>Actualizar listado</button>
        {!items.length&&<p>No hay materiales en esta consulta.</p>}
        <ul>{items.map(item=><li key={item.id} data-material-id={item.id}><h3>{item.title}</h3><p>{materialLabels[item.state]} · Revisión {item.revision}</p>
          {item.description&&<p>{item.description}</p>}<p>{item.downloadName} · {item.mediaType} · {item.byteSize} bytes</p>
          {item.state==='PREPARED'&&canPublish&&<button type="button" disabled={blocked} onClick={event=>{returnFocus.current=event.currentTarget;controller.inspect(item);setConfirmation(item.id);}}>Publicar «{item.title}»</button>}
          {onInspect&&<button type="button" disabled={blocked||actionsBlocked} onClick={()=>onInspect(item)}>Gestionar «{item.title}»</button>}
        </li>)}</ul>
      </section>
    </>}
  </section>;
}
