import { ApiFailure } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';

export type ClassState='PREPARED'|'LIVE'|'FINISHED'|'CANCELLED';
export interface Page<T> {readonly items:readonly T[];readonly page:number;readonly pageSize:number;readonly total:number}
export interface ClassGroup {readonly id:string;readonly name:string;readonly courseName:string;readonly state:'DRAFT'|'PUBLISHED'|'WITHDRAWN'|'CANCELLED';readonly canPrepare:boolean}
export interface ManagedClass {
  readonly id:string;readonly groupId:string;readonly title:string;readonly description:string|null;readonly state:ClassState;
  readonly revision:string;readonly viewVersion:string;readonly createdBy:string;readonly updatedBy:string;
  readonly createdAt:string;readonly updatedAt:string;readonly startedAt:string|null;readonly finishedAt:string|null;readonly cancelledAt:string|null;
  readonly actions:{readonly edit:boolean;readonly start:boolean;readonly finish:boolean;readonly cancel:boolean};
}
export interface CommandInput {readonly commandId:string;readonly expectedRevision:string}
export interface CreateInput {readonly commandId:string;readonly title:string;readonly description:string|null}
export interface EditInput extends CommandInput {readonly title:string;readonly description:string|null}
export interface CommandResult {readonly resource:ManagedClass;readonly command:{readonly id:string;readonly replayed:boolean;readonly result:'APPLIED'|'NO_CHANGE';readonly appliedRevision:string;readonly appliedEventSeq:string|null}}
export type CommandLookup={readonly result:'NOT_CONFIRMED'}|{readonly result:'APPLIED';readonly response:CommandResult};
export type Filters={readonly page?:number;readonly pageSize?:number;readonly state?:ClassState};
const unavailable=():never=>{throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar el resultado. Consulta el comando antes de reintentar.');};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const id=(v:string)=>uuid(v)?v:unavailable();
const decimal=(v:unknown,zero=false):v is string=>typeof v==='string'&&(zero?/^(0|[1-9]\d{0,18})$/:/^[1-9]\d{0,18}$/).test(v)&&BigInt(v)<=9223372036854775807n;
function record(v:unknown,keys:readonly string[]):Record<string,unknown> {
  if(!v||typeof v!=='object'||Array.isArray(v))return unavailable();
  const r=v as Record<string,unknown>;
  if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))return unavailable();return r;
}
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.trim()===v&&[...v].length<=max&&!v.includes('\0')&&!/\p{Surrogate}/u.test(v);
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,23)===v.slice(0,23);
function readSession(v:unknown):ManagedClass {
  const r=record(v,['id','groupId','title','description','state','revision','viewVersion','createdBy','updatedBy','createdAt','updatedAt','startedAt','finishedAt','cancelledAt','actions']);
  const a=record(r.actions,['edit','start','finish','cancel']);
  if(![r.id,r.groupId,r.createdBy,r.updatedBy].every(uuid)||!text(r.title,160)||!(r.description===null||text(r.description,2000))
    ||!decimal(r.revision)||!decimal(r.viewVersion,true)||!['PREPARED','LIVE','FINISHED','CANCELLED'].includes(String(r.state))
    ||Object.values(a).some(v=>typeof v!=='boolean')||!instant(r.createdAt)||!instant(r.updatedAt)
    ||![r.startedAt,r.finishedAt,r.cancelledAt].every(v=>v===null||instant(v))
    ||r.state==='PREPARED'&&(r.startedAt!==null||r.finishedAt!==null||r.cancelledAt!==null)
    ||r.state==='LIVE'&&(!r.startedAt||r.finishedAt!==null||r.cancelledAt!==null)
    ||r.state==='FINISHED'&&(!r.startedAt||!r.finishedAt||r.cancelledAt!==null)
    ||r.state==='CANCELLED'&&(r.startedAt!==null||r.finishedAt!==null||!r.cancelledAt))return unavailable();
  return Object.freeze({...r,actions:Object.freeze({...a})}) as unknown as ManagedClass;
}
function readGroup(v:unknown):ClassGroup {
  const r=record(v,['id','name','courseName','state','canPrepare']);
  if(!uuid(r.id)||!text(r.name,1000)||!text(r.courseName,1000)||!['DRAFT','PUBLISHED','WITHDRAWN','CANCELLED'].includes(String(r.state))
    ||typeof r.canPrepare!=='boolean'||r.state==='CANCELLED'&&r.canPrepare)return unavailable();
  return Object.freeze({...r}) as unknown as ClassGroup;
}
function page<T>(v:unknown,parse:(v:unknown)=>T):Page<T> {
  const r=record(v,['items','page','pageSize','total']);
  if(!Array.isArray(r.items)||!Number.isSafeInteger(r.page)||(r.page as number)<1||!Number.isSafeInteger(r.pageSize)||(r.pageSize as number)<1||(r.pageSize as number)>50
    ||!Number.isSafeInteger(r.total)||(r.total as number)<0||r.items.length>(r.pageSize as number)||r.items.length>(r.total as number))return unavailable();
  return Object.freeze({...r,items:Object.freeze(r.items.map(parse))}) as unknown as Page<T>;
}
function result(v:unknown,commandId:string):CommandResult {
  const r=record(v,['resource','command']),c=record(r.command,['id','replayed','result','appliedRevision','appliedEventSeq']);
  if(c.id!==commandId||typeof c.replayed!=='boolean'||!['APPLIED','NO_CHANGE'].includes(String(c.result))||!decimal(c.appliedRevision)
    ||!(c.appliedEventSeq===null||decimal(c.appliedEventSeq))||c.result==='APPLIED'&&c.appliedEventSeq===null)return unavailable();
  return Object.freeze({resource:readSession(r.resource),command:Object.freeze({...c})}) as unknown as CommandResult;
}
export function createClassesApi(client:ApiClient,signal?:AbortSignal) {
  async function mutate(resourceId:string,input:CommandInput|EditInput,operation:'edit'|'start'|'finish'|'cancel') {
    const body={commandId:id(input.commandId),expectedRevision:input.expectedRevision,...(operation==='edit'?{title:(input as EditInput).title,description:(input as EditInput).description}:{})};
    const r=result(await client.request('/classes/sessions/'+id(resourceId)+(operation==='edit'?'':'/'+operation),{method:operation==='edit'?'PATCH':'POST',body,signal}),input.commandId);
    if(r.resource.id!==resourceId)return unavailable();return r;
  }
  return {
    scope:(next:AbortSignal)=>createClassesApi(client,signal?AbortSignal.any([signal,next]):next),
    async groups(filters:Omit<Filters,'state'>={}) {return page(await client.request('/classes/groups',{query:{...filters},signal}),readGroup);},
    async group(groupId:string) {const r=readGroup(await client.request('/classes/groups/'+id(groupId),{signal}));if(r.id!==groupId)return unavailable();return r;},
    async sessions(groupId:string,filters:Filters={}) {const r=page(await client.request('/classes/groups/'+id(groupId)+'/sessions',{query:{...filters},signal}),readSession);if(r.items.some(s=>s.groupId!==groupId))return unavailable();return r;},
    async session(classId:string) {const r=readSession(await client.request('/classes/sessions/'+id(classId),{signal}));if(r.id!==classId)return unavailable();return r;},
    async create(groupId:string,input:CreateInput) {
      const r=result(await client.request('/classes/groups/'+id(groupId)+'/sessions',{method:'POST',body:{commandId:id(input.commandId),title:input.title,description:input.description},signal}),input.commandId);
      if(r.resource.groupId!==groupId)return unavailable();return r;
    },
    edit:(classId:string,input:EditInput)=>mutate(classId,input,'edit'),
    start:(classId:string,input:CommandInput)=>mutate(classId,input,'start'),
    finish:(classId:string,input:CommandInput)=>mutate(classId,input,'finish'),
    cancel:(classId:string,input:CommandInput)=>mutate(classId,input,'cancel'),
    async command(commandId:string):Promise<CommandLookup> {
      const raw=await client.request('/classes/commands/'+id(commandId),{signal});
      const r=record(raw,raw&&typeof raw==='object'&&'result'in raw&&raw.result==='APPLIED'?['result','response']:['result']);
      if(r.result==='NOT_CONFIRMED')return {result:'NOT_CONFIRMED'};
      if(r.result!=='APPLIED')return unavailable();return {result:'APPLIED',response:result(r.response,commandId)};
    },
  };
}
export type ClassesApi=ReturnType<typeof createClassesApi>;
