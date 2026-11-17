import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import type { BinaryDownload } from '../../shared/api-client';
import type { MaterialGroupRead, MaterialRead, MaterialsApi, Page, StudentMaterial, StudentMaterialGroup } from './api';

export interface StudentMaterialsClient {
  group(id:string):Promise<MaterialGroupRead>;
  items(id:string,filters?:{page?:number;pageSize?:number}):Promise<Page<MaterialRead>>;
  download(id:string):Promise<BinaryDownload>;
  scope?(signal:AbortSignal):StudentMaterialsClient;
}
interface Options {
  readonly groupId:string;
  readonly urls?:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>;
}
export interface StudentMaterialsSnapshot {
  readonly state:'IDLE'|'LOADING'|'READY'|'EMPTY'|'ERROR'|'AUTH_REQUIRED'|'DENIED'|'DISPOSED';
  readonly busy:boolean;readonly group:StudentMaterialGroup|null;readonly items:readonly StudentMaterial[];
  readonly download:{readonly url:string;readonly name:string}|null;
  readonly downloading:string|null;readonly page:number;readonly total:number;readonly error?:ApiFailure;
}
const initial=():StudentMaterialsSnapshot=>({state:'IDLE',busy:false,group:null,items:[],download:null,downloading:null,page:1,total:0});
const unavailable=()=>new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo completar la consulta o descarga. Reintenta manualmente.');

/** One account/group lifetime. Bytes and URLs live only in memory; every async
 * continuation checks its generation even if the transport ignores abort.
 */
export function createMaterialsStudentController(api:StudentMaterialsClient,options:Options) {
  const urls=options.urls??URL,listeners=new Set<()=>void>();
  let state=initial(),generation=0,disposed=false,operation:AbortController|undefined;
  const update=(value:StudentMaterialsSnapshot)=>{state=Object.freeze(value);for(const listener of listeners)listener();};
  const patch=(value:Partial<StudentMaterialsSnapshot>)=>update({...state,...value});
  const alive=(epoch:number)=>!disposed&&epoch===generation;
  function releaseDownload(expectedUrl?:string) {
    if(!state.download||expectedUrl!==undefined&&state.download.url!==expectedUrl)return;
    urls.revokeObjectURL(state.download.url);patch({download:null});
  }
  function failure(error:unknown) {
    const safe=error instanceof ApiFailure?error:unavailable();
    releaseDownload();
    if([401,403,404].includes(safe.status)) {
      update({...initial(),state:safe.status===401?'AUTH_REQUIRED':'DENIED',error:safe});return;
    }
    patch({state:'ERROR',busy:false,downloading:null,error:safe});
  }
  async function load(page=state.page) {
    if(disposed||!Number.isSafeInteger(page)||page<1)return;
    const epoch=++generation;operation?.abort();operation=new AbortController();
    releaseDownload();update({...initial(),state:'LOADING',busy:true,page});
    const client=api.scope?.(operation.signal)??api;
    try {
      const [group,result]=await Promise.all([client.group(options.groupId),client.items(options.groupId,{page,pageSize:20})]);
      if(!alive(epoch))return;
      if(group.id!==options.groupId||'state' in group||result.items.some(item=>item.groupId!==options.groupId||'state' in item||item.publishedAt===null))throw unavailable();
      const items=result.items as readonly StudentMaterial[];
      update({...initial(),state:items.length?'READY':'EMPTY',group,items:Object.freeze([...items]),page:result.page,total:result.total});
    } catch(error) {if(alive(epoch))failure(error);}
  }
  return {
    snapshot:()=>state,
    subscribe(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener);};},
    load,releaseDownload,
    async download(id:string) {
      if(disposed||state.busy)return;
      const material=state.items.find(item=>item.id===id);if(!material)return;
      const epoch=++generation;operation?.abort();operation=new AbortController();releaseDownload();
      patch({busy:true,downloading:id,error:undefined,state:'READY'});
      try {
        const client=api.scope?.(operation.signal)??api,result=await client.download(id);
        if(!alive(epoch))return;
        if(result.blob.size!==material.byteSize||result.blob.type!==material.mediaType||result.downloadName!==material.downloadName)throw unavailable();
        const url=urls.createObjectURL(result.blob);
        patch({download:Object.freeze({url,name:result.downloadName}),busy:false,downloading:null});
      } catch(error) {
        if(alive(epoch)) {
          if(error instanceof RequestCancelled)patch({busy:false,downloading:null});else failure(error);
        }
      }
    },
    dispose() {
      if(disposed)return;disposed=true;generation++;operation?.abort();releaseDownload();
      update({...initial(),state:'DISPOSED'});listeners.clear();
    },
  };
}
export type MaterialsStudentController=ReturnType<typeof createMaterialsStudentController>;

export function MaterialsStudentPage({controller,navigation}:{readonly controller:MaterialsStudentController;readonly navigation?:ReactNode}) {
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  const notice=useRef<HTMLDivElement>(null),releaseTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>{if(['ERROR','AUTH_REQUIRED','DENIED'].includes(state.state)||state.download)notice.current?.focus();},[state.state,state.download]);
  useEffect(()=>()=>{clearTimeout(releaseTimer.current);controller.dispose();},[controller]);
  return <main>{navigation}<h1>Materiales del grupo</h1>
    {state.group&&<><h2>{state.group.name}</h2><p>{state.group.courseName}</p></>}
    <div ref={notice} tabIndex={-1} aria-live="polite">
      {state.state==='LOADING'&&<p role="status">Consultando materiales…</p>}
      {state.state==='EMPTY'&&<p role="status">No hay materiales publicados en esta página.</p>}
      {state.state==='AUTH_REQUIRED'&&<p role="alert">Debes volver a iniciar sesión para consultar materiales.</p>}
      {state.state==='DENIED'&&<p role="alert">No tienes acceso a estos materiales. Consulta tus matrículas vigentes.</p>}
      {state.state==='ERROR'&&<p role="alert">{state.error?.message??'No se pudo completar la solicitud.'}</p>}
      {state.downloading&&<p role="status">Recibiendo archivo…</p>}
      {state.download&&<p role="status">Archivo recibido. <a href={state.download.url} download={state.download.name}
        onClick={()=>{const url=state.download?.url;clearTimeout(releaseTimer.current);releaseTimer.current=setTimeout(()=>controller.releaseDownload(url),0);}}>Guardar archivo: {state.download.name}</a></p>}
    </div>
    {!['AUTH_REQUIRED','DENIED','DISPOSED'].includes(state.state)&&<button type="button" disabled={state.busy}
      onClick={()=>{void controller.load();}}>{state.state==='ERROR'?'Reintentar consulta':'Consultar materiales'}</button>}
    <ul>{state.items.map(item=><li key={item.id}><article><h3>{item.title}</h3>
      {item.description&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.description}</p>}
      <p>{({'application/pdf':'PDF','image/jpeg':'JPEG','image/png':'PNG'} as Record<string,string>)[item.mediaType]} · {item.byteSize.toLocaleString('es-PE')} bytes</p>
      <p>Publicado (UTC): <time dateTime={item.publishedAt}>{item.publishedAt}</time></p>
      <p style={{overflowWrap:'anywhere'}}>{item.downloadName}</p>
      <button type="button" disabled={state.busy} aria-label={`Descargar ${item.title}`} onClick={()=>{void controller.download(item.id);}}>Descargar</button>
    </article></li>)}</ul>
    {state.total>0&&<nav aria-label="Páginas de materiales"><button type="button" disabled={state.busy||state.page<=1} onClick={()=>{void controller.load(state.page-1);}}>Anterior</button>
      <span> Página {state.page} · {state.total} resultados </span><button type="button" disabled={state.busy||state.page*20>=state.total} onClick={()=>{void controller.load(state.page+1);}}>Siguiente</button></nav>}
  </main>;
}

/** The app supplies a fresh instance/key for each account or group (T045). */
export function MaterialsStudentScreen({api,groupId,navigation}:{readonly api:StudentMaterialsClient;readonly groupId:string;readonly navigation?:ReactNode}) {
  const [controller]=useState(()=>createMaterialsStudentController(api,{groupId}));
  useEffect(()=>{void controller.load();return ()=>controller.dispose();},[controller]);
  return <MaterialsStudentPage controller={controller} navigation={navigation}/>;
}

export function MaterialsStudentGroupsScreen({api,navigation}:{readonly api:MaterialsApi;readonly navigation?:ReactNode}) {
  const [result,setResult]=useState<Page<StudentMaterialGroup>>(),[error,setError]=useState<ApiFailure>(),[page,setPage]=useState(1),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
  const notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const scope=new AbortController();let active=true;setResult(undefined);setError(undefined);setLoading(true);
    void api.scope(scope.signal).groups({page,pageSize:20}).then(value=>{
      if(!active)return;if(value.items.some(item=>'state' in item))throw unavailable();
      setResult({...value,items:value.items});
    }).catch(failure=>{if(active&&!(failure instanceof RequestCancelled))setError(failure instanceof ApiFailure?failure:unavailable());})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;scope.abort();};
  },[api,page,retry]);
  useEffect(()=>{if(error)notice.current?.focus();},[error]);
  return <main>{navigation}<h1>Materiales</h1><div ref={notice} tabIndex={-1}>
    {loading&&<p role="status">Consultando grupos con matrícula vigente…</p>}
    {error&&<p role="alert">{error.message}</p>}
  </div>{error&&error.status!==401&&<button type="button" onClick={()=>setRetry(value=>value+1)}>Reintentar consulta</button>}
    {result&&<>{!result.items.length&&<p role="status">No hay grupos con matrícula vigente en esta página.</p>}
      <ul>{result.items.map(group=><li key={group.id}><a href={`/materiales/grupos/${group.id}`}>{group.name}</a> · {group.courseName}</li>)}</ul>
      <nav aria-label="Páginas de grupos"><button type="button" disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Anterior</button><span> Página {page} · {result.total} grupos </span>
        <button type="button" disabled={page*20>=result.total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></nav></>}
  </main>;
}
