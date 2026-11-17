import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import type { EditInput, MaterialReference, MaterialsApi, PublishInput } from './api';

type Action='edit'|'withdraw'|'publish';
type Client=Pick<MaterialsApi,'edit'|'withdraw'|'publish'|'getMaterial'>;
interface Snapshot {
  readonly state:string;readonly busy:boolean;readonly title:string;readonly description:string;
  readonly material:MaterialReference|null;readonly comparison:MaterialReference|null;readonly commandId:string|null;readonly error?:ApiFailure;
}
interface Options {readonly material:MaterialReference;commandId():string;readonly onChanged?:()=>void;readonly onDenied?:()=>void}
const labels={PREPARED:'Preparado',PUBLISHED:'Publicado',WITHDRAWN:'Retirado'};
const safe=(error:unknown)=>error instanceof ApiFailure?error:new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar el resultado. Consulta el estado antes de reintentar.');
/** No persistence, automatic mutation retry or optimistic revision. Lifetime checks
 * also discard late results after account/route changes or permission loss.
 */
export function createMaterialActionsController(api:Client,options:Options) {
  let state:Snapshot=Object.freeze({state:options.material.state,busy:false,title:options.material.title,description:options.material.description??'',
    material:options.material,comparison:null,commandId:null}),disposed=false,generation=0;
  let intent:{action:Action;input:PublishInput|EditInput}|undefined;
  const listeners=new Set<()=>void>();
  const patch=(value:Partial<Snapshot>)=>{state=Object.freeze({...state,...value});listeners.forEach(listener=>listener());};
  const alive=(epoch:number)=>!disposed&&epoch===generation;
  const editable=()=>!disposed&&!state.busy&&!['UNCERTAIN','RETRY_READY','CONFLICT','UNAVAILABLE','DISPOSED'].includes(state.state);
  function clear(status:string,error?:ApiFailure) {
    intent=undefined;patch({state:status,busy:false,title:'',description:'',material:null,comparison:null,commandId:null,error});
  }
  async function compare(epoch:number) {
    const current=await api.getMaterial(state.material!.id);
    if(alive(epoch))patch({comparison:current});
  }
  async function fail(error:unknown,epoch:number) {
    if(error instanceof RequestCancelled){clear('UNAVAILABLE');return;}
    const failure=safe(error);
    if([401,403,404].includes(failure.status)){generation++;clear('UNAVAILABLE',failure);options.onDenied?.();return;}
    if(failure.status===409) {
      patch({state:'CONFLICT',error:failure});
      try{await compare(epoch);}catch(readError){if(alive(epoch)){
        const unavailable=safe(readError);
        if([401,403,404].includes(unavailable.status)){generation++;clear('UNAVAILABLE',unavailable);options.onDenied?.();}
        else patch({error:unavailable});
      }}
    } else if(failure.status===503||failure.status>=500)patch({state:'UNCERTAIN',error:failure});
    else {intent=undefined;patch({state:'REJECTED',commandId:null,error:failure});}
  }
  async function send() {
    if(!intent||!state.material||state.busy||disposed)return;
    const epoch=++generation,submitted=intent,id=state.material.id;patch({busy:true,state:'SENDING',error:undefined});
    try {
      const response=submitted.action==='edit'?await api.edit(id,submitted.input as EditInput):await api[submitted.action](id,submitted.input);
      if(!alive(epoch))return;
      intent=undefined;patch({state:response.resource.state,material:response.resource,title:response.resource.title,description:response.resource.description??'',
        commandId:null,comparison:null,error:undefined});options.onChanged?.();
    }catch(error){if(alive(epoch))await fail(error,epoch);}
    finally{if(alive(epoch))patch({busy:false});}
  }
  async function begin(action:Action) {
    if(!editable()||!state.material)return;
    let texts:Pick<EditInput,'title'|'description'>|undefined;
    if(action==='edit') {
      const title=state.title.trim(),description=state.description;
      const field=!title||[...title].length>200||/[\p{Cc}\p{Surrogate}]/u.test(title)?'title':
        [...description].length>2000||/\p{Surrogate}/u.test(description)||description.includes('\u0000')?'description':null;
      if(field){patch({state:'REJECTED',error:new ApiFailure(400,'VALIDATION_ERROR','Revisa el título (1–200 caracteres) y la descripción (hasta 2000).',undefined,[field])});return;}
      texts={title,description:description.trim()===''?null:description};
    }
    intent={action,input:Object.freeze({commandId:options.commandId(),expectedRevision:state.material.revision,...texts})};
    patch({commandId:intent.input.commandId});await send();
  }
  return {
    snapshot:()=>state,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    setTitle(title:string){if(editable())patch({title,error:undefined});},setDescription(description:string){if(editable())patch({description,error:undefined});},
    save:()=>begin('edit'),
    async confirmWithdraw(confirmed:boolean){if(confirmed)await begin('withdraw');},
    async confirmPublish(confirmed:boolean){if(confirmed)await begin('publish');},
    async recover() {
      if(disposed||state.busy||!state.material||!['UNCERTAIN','RETRY_READY','CONFLICT'].includes(state.state))return;
      const epoch=++generation,conflict=state.state==='CONFLICT';patch({busy:true,error:undefined});
      try{await compare(epoch);if(alive(epoch))patch({state:conflict?'CONFLICT':'RETRY_READY'});}
      catch(error){if(alive(epoch))await fail(error,epoch);}finally{if(alive(epoch))patch({busy:false});}
    },
    async retry(){if(state.state==='RETRY_READY')await send();},
    adoptCurrentRevision(){if(!disposed&&!state.busy&&state.state==='CONFLICT'&&state.comparison){
      intent=undefined;patch({state:state.comparison.state,material:state.comparison,comparison:null,commandId:null,error:undefined});
    }},
    dispose(){disposed=true;generation++;clear('DISPOSED');listeners.clear();},
  };
}
export type MaterialActionsController=ReturnType<typeof createMaterialActionsController>;
export function MaterialActions({controller,onPrepareNew,canEdit=true,canPublish=true,canWithdraw=true,canPrepare=true}:{readonly controller:MaterialActionsController;
  readonly onPrepareNew:()=>void;readonly canEdit?:boolean;readonly canPublish?:boolean;readonly canWithdraw?:boolean;readonly canPrepare?:boolean}) {
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),[confirmation,setConfirmation]=useState<'withdraw'|'publish'|null>(null);
  const notice=useRef<HTMLDivElement>(null),dialog=useRef<HTMLFieldSetElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(!state.busy)notice.current?.focus();},[state.state,state.busy]);
  useEffect(()=>{if(confirmation)dialog.current?.querySelector('button')?.focus();},[confirmation]);
  const blocked=state.busy||['UNCERTAIN','RETRY_READY','CONFLICT','UNAVAILABLE','DISPOSED'].includes(state.state);
  const id=state.material?.id??'unavailable';
  return <section aria-label="Corregir o retirar material">
    <div role={state.error?'alert':'status'} aria-live="polite" aria-atomic="true" tabIndex={-1} ref={notice}>
      {state.error&&<p>{state.error.message}</p>}{state.busy&&<p>Procesando material…</p>}
      {state.material&&<p>{state.material.title}: {labels[state.material.state]}. Revisión {state.material.revision}.</p>}
      {state.state==='UNCERTAIN'&&<p>Resultado incierto. Consulta el estado antes de reintentar manualmente.</p>}
      {state.state==='RETRY_READY'&&<p>Estado consultado. Puedes recuperar la misma intención con un reintento manual.</p>}
      {state.state==='UNAVAILABLE'&&<p>El material ya no está disponible para esta sesión.</p>}
    </div>
    {state.material&&<>
      {canEdit&&<form aria-label="Corregir material" onSubmit={event=>{event.preventDefault();void controller.save();}}>
        <fieldset disabled={blocked}><legend>Corregir textos</legend><p>Editar no publica ni cambia el archivo o el autor original.</p>
          <label htmlFor={'edit-title-'+id}>Título de corrección</label><input id={'edit-title-'+id} value={state.title}
            aria-invalid={state.error?.fields.includes('title')||undefined} aria-describedby={'edit-help-'+id} onChange={event=>controller.setTitle(event.target.value)}/>
          <label htmlFor={'edit-description-'+id}>Descripción de corrección (opcional)</label><textarea id={'edit-description-'+id} value={state.description}
            aria-invalid={state.error?.fields.includes('description')||undefined} aria-describedby={'edit-help-'+id} onChange={event=>controller.setDescription(event.target.value)}/>
          <p id={'edit-help-'+id}>Título: 1–200 caracteres; descripción: hasta 2000 caracteres.</p><button type="submit">Guardar corrección</button>
        </fieldset>
      </form>}
      {state.comparison&&<section aria-label="Comparar con la versión actual"><h3>Versión actual consultada</h3>
        <p>Revisión {state.comparison.revision}: {labels[state.comparison.state]}</p><p>{state.comparison.title}</p><p>{state.comparison.description}</p>
        {state.state==='CONFLICT'&&<button type="button" disabled={state.busy} onClick={()=>controller.adoptCurrentRevision()}>Usar revisión actual y conservar mi borrador</button>}
      </section>}
      {['UNCERTAIN','RETRY_READY','CONFLICT'].includes(state.state)&&<button type="button" disabled={state.busy} onClick={()=>void controller.recover()}>Consultar estado del material</button>}
      {state.state==='RETRY_READY'&&<button type="button" disabled={state.busy} onClick={()=>void controller.retry()}>Reintentar misma intención</button>}
      {canWithdraw&&state.material.state!=='WITHDRAWN'&&<button type="button" disabled={blocked} onClick={event=>{trigger.current=event.currentTarget;setConfirmation('withdraw');}}>Retirar material</button>}
      {canPublish&&state.material.state!=='PUBLISHED'&&<button type="button" disabled={blocked} onClick={event=>{trigger.current=event.currentTarget;setConfirmation('publish');}}>Republicar material</button>}
      {confirmation&&<fieldset ref={dialog} disabled={blocked}><legend>{confirmation==='withdraw'?'Confirmar retiro':'Confirmar republicación'}</legend>
        <p>{confirmation==='withdraw'?'El material dejará de estar disponible para nuevas consultas y descargas del alumno.':'El material volverá a estar disponible para alumnos con matrícula vigente.'}</p>
        <button type="button" onClick={()=>{const action=confirmation;setConfirmation(null);void (action==='withdraw'?controller.confirmWithdraw(true):controller.confirmPublish(true));}}>{confirmation==='withdraw'?'Confirmar retiro':'Confirmar republicación'}</button>{' '}
        <button type="button" onClick={()=>{setConfirmation(null);queueMicrotask(()=>trigger.current?.focus());}}>Cancelar</button>
      </fieldset>}
      <p>Para cambiar el archivo, prepara un nuevo material y retira el anterior por separado.</p>{canPrepare&&<button type="button" disabled={blocked} onClick={onPrepareNew}>Preparar nuevo material</button>}
    </>}
  </section>;
}
