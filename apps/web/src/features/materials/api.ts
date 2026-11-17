import { ApiFailure } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';

export const FILE_LIMIT = 20_000_000;
export type MaterialState = 'PREPARED'|'PUBLISHED'|'WITHDRAWN';
export interface MaterialReference { readonly id:string;readonly state:MaterialState;readonly revision:string;readonly title:string;readonly description:string|null }
export interface ManagedMaterial extends MaterialReference {
  readonly groupId:string;readonly mediaType:string;readonly byteSize:number;readonly downloadName:string;
  readonly createdBy:string;readonly createdAt:string;readonly updatedAt:string;readonly publishedAt:string|null;readonly withdrawnAt:string|null;
}
export interface MaterialGroup {
  readonly id:string;readonly name:string;readonly courseName:string;readonly state:'DRAFT'|'PUBLISHED'|'WITHDRAWN'|'CANCELLED';
  readonly actions:{readonly prepare:boolean;readonly edit:boolean;readonly publish:boolean;readonly withdraw:boolean};
}
export interface Page<T> {readonly items:readonly T[];readonly page:number;readonly pageSize:number;readonly total:number}
export interface StudentMaterial {
  readonly id:string;readonly groupId:string;readonly title:string;readonly description:string|null;
  readonly mediaType:string;readonly byteSize:number;readonly downloadName:string;readonly publishedAt:string;
}
export interface StudentMaterialGroup {readonly id:string;readonly name:string;readonly courseName:string}
export type MaterialRead=ManagedMaterial|StudentMaterial;
export type MaterialGroupRead=MaterialGroup|StudentMaterialGroup;
export const isManagedMaterial=(item:MaterialRead):item is ManagedMaterial=>'state' in item;
export const isManagedGroup=(item:MaterialGroupRead):item is MaterialGroup=>'state' in item;
export interface Filters {readonly page?:number;readonly pageSize?:number;readonly state?:MaterialState}
export interface UploadInput {
  readonly intentionId:string;readonly title:string;readonly description:string|null;readonly downloadName:string;
  readonly mediaType:string;readonly byteSize:number;readonly sha256:string;
}
export interface UploadStatus {readonly uploadId:string;readonly state:'PENDING'|'COMPLETED';readonly materialId:string|null;readonly command:{readonly replayed:boolean}}
export interface PublishInput {readonly commandId:string;readonly expectedRevision:string}
export interface EditInput extends PublishInput {readonly title:string;readonly description:string|null}
export interface PublishResult {readonly resource:MaterialReference;readonly command:{readonly replayed:boolean;readonly appliedRevision:string;readonly result:'APPLIED'|'NO_CHANGE'}}
export interface ManagementCommands {
  createUpload(groupId:string,input:UploadInput):Promise<UploadStatus>;
  putContent(uploadId:string,file:File):Promise<MaterialReference>;
  uploadStatus(uploadId:string):Promise<UploadStatus>;
  getMaterial(materialId:string):Promise<MaterialReference>;
  publish(materialId:string,input:PublishInput):Promise<PublishResult>;
}
const unavailable=():never=>{throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar el resultado. Consúltalo antes de reintentar manualmente.');};
function record(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))return unavailable();
  const row=value as Record<string,unknown>;
  if(keys.some(key=>!Object.hasOwn(row,key))||Object.keys(row).some(key=>!keys.includes(key)))return unavailable();
  return row;
}
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const id=(value:string)=>isUuid(value)?value:unavailable();
const revision=(value:unknown):value is string=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const instant=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value)&&Number.isFinite(Date.parse(value));
const nullableInstant=(value:unknown)=>value===null||instant(value);
export function readMaterial(value:unknown):ManagedMaterial {
  const row=record(value,['id','groupId','title','description','state','revision','mediaType','byteSize','downloadName','createdBy','createdAt','updatedAt','publishedAt','withdrawnAt']);
  if(!isUuid(row.id)||!isUuid(row.groupId)||!isUuid(row.createdBy)||!revision(row.revision)||!text(row.title)
    ||!(row.description===null||typeof row.description==='string')||!['PREPARED','PUBLISHED','WITHDRAWN'].includes(String(row.state))
    ||!['application/pdf','image/jpeg','image/png'].includes(String(row.mediaType))||!text(row.downloadName)
    ||!Number.isSafeInteger(row.byteSize)||(row.byteSize as number)<1||(row.byteSize as number)>FILE_LIMIT
    ||!instant(row.createdAt)||!instant(row.updatedAt)||!nullableInstant(row.publishedAt)||!nullableInstant(row.withdrawnAt)
    ||row.state==='PUBLISHED'&&row.publishedAt===null||row.state==='WITHDRAWN'&&row.withdrawnAt===null)return unavailable();
  return Object.freeze({...row}) as unknown as ManagedMaterial;
}
function group(value:unknown):MaterialGroupRead {
  if(value&&typeof value==='object'&&!Object.hasOwn(value,'state')) {
    const row=record(value,['id','name','courseName']);
    if(!isUuid(row.id)||!text(row.name)||!text(row.courseName))return unavailable();
    return Object.freeze({...row}) as unknown as StudentMaterialGroup;
  }
  const row=record(value,['id','name','courseName','state','actions']),actions=record(row.actions,['prepare','edit','publish','withdraw']);
  if(!isUuid(row.id)||!text(row.name)||!text(row.courseName)||!['DRAFT','PUBLISHED','WITHDRAWN','CANCELLED'].includes(String(row.state))
    ||Object.values(actions).some(value=>typeof value!=='boolean'))return unavailable();
  return Object.freeze({...row,actions:Object.freeze({...actions})}) as unknown as MaterialGroup;
}
function materialRead(value:unknown):MaterialRead {
  if(value&&typeof value==='object'&&Object.hasOwn(value,'state'))return readMaterial(value);
  const row=record(value,['id','groupId','title','description','mediaType','byteSize','downloadName','publishedAt']);
  if(!isUuid(row.id)||!isUuid(row.groupId)||!text(row.title)||[...row.title].length>200
    ||!(row.description===null||typeof row.description==='string'&&[...row.description].length<=2000)
    ||!['application/pdf','image/jpeg','image/png'].includes(String(row.mediaType))||!text(row.downloadName)
    ||!Number.isSafeInteger(row.byteSize)||(row.byteSize as number)<1||(row.byteSize as number)>FILE_LIMIT||!instant(row.publishedAt))return unavailable();
  return Object.freeze({...row}) as unknown as StudentMaterial;
}
function page<T>(value:unknown,read:(value:unknown)=>T):Page<T> {
  const row=record(value,['items','page','pageSize','total']);
  if(!Array.isArray(row.items)||!Number.isSafeInteger(row.page)||(row.page as number)<1||!Number.isSafeInteger(row.pageSize)
    ||(row.pageSize as number)<1||(row.pageSize as number)>50||!Number.isSafeInteger(row.total)||(row.total as number)<0
    ||row.items.length>(row.pageSize as number)||row.items.length>(row.total as number))return unavailable();
  return Object.freeze({...row,items:Object.freeze(row.items.map(read))}) as unknown as Page<T>;
}
function upload(value:unknown):UploadStatus {
  const row=record(value,['uploadId','state','materialId','command']),command=record(row.command,['replayed']);
  if(!isUuid(row.uploadId)||typeof command.replayed!=='boolean'
    ||!(row.state==='PENDING'&&row.materialId===null||row.state==='COMPLETED'&&isUuid(row.materialId)))return unavailable();
  return Object.freeze({...row,command:Object.freeze({...command})}) as unknown as UploadStatus;
}
export function createMaterialsApi(client:ApiClient,signal?:AbortSignal) {
  async function command(materialId:string,input:PublishInput|EditInput,operation:'edit'|'publish'|'withdraw') {
    const result=record(await client.request('/materials/items/'+id(materialId)+(operation==='edit'?'':'/'+operation),
      {method:operation==='edit'?'PATCH':'POST',body:{...input},signal}),['resource','command']);
    const resource=readMaterial(result.resource),receipt=record(result.command,['id','replayed','appliedRevision','result']);
    if(resource.id!==materialId||!isUuid(receipt.id)||receipt.id!==input.commandId||typeof receipt.replayed!=='boolean'
      ||!revision(receipt.appliedRevision)||!['APPLIED','NO_CHANGE'].includes(String(receipt.result)))return unavailable();
    return {resource,command:receipt} as unknown as PublishResult & {resource:ManagedMaterial};
  }
  return {
    scope:(next:AbortSignal)=>createMaterialsApi(client,signal?AbortSignal.any([signal,next]):next),
    async groups(filters:Omit<Filters,'state'>={}) {return page(await client.request('/materials/groups',{query:{...filters},signal}),group);},
    async group(groupId:string) {const value=group(await client.request('/materials/groups/'+id(groupId),{signal}));if(value.id!==groupId)return unavailable();return value;},
    async items(groupId:string,filters:Filters={}) {
      const result=page(await client.request('/materials/groups/'+id(groupId)+'/items',{query:{...filters},signal}),materialRead);
      if(result.items.some(item=>item.groupId!==groupId))return unavailable();return result;
    },
    async download(materialId:string) {
      if(!client.download)return unavailable();
      return client.download('/materials/items/'+id(materialId)+'/content',signal);
    },
    async createUpload(groupId:string,input:UploadInput) {return upload(await client.request('/materials/groups/'+id(groupId)+'/uploads',{method:'POST',body:{...input},signal}));},
    async uploadStatus(uploadId:string) {const value=upload(await client.request('/materials/uploads/'+id(uploadId),{signal}));if(value.uploadId!==uploadId)return unavailable();return value;},
    async putContent(uploadId:string,file:File) {
      if(!client.upload)return unavailable();
      const result=record(await client.upload('/materials/uploads/'+id(uploadId)+'/content',file,signal),['resource','replayed']);
      if(typeof result.replayed!=='boolean')return unavailable();return readMaterial(result.resource);
    },
    async getMaterial(materialId:string) {const value=readMaterial(await client.request('/materials/items/'+id(materialId),{signal}));if(value.id!==materialId)return unavailable();return value;},
    edit:(materialId:string,input:EditInput)=>command(materialId,input,'edit'),
    publish:(materialId:string,input:PublishInput)=>command(materialId,input,'publish'),
    withdraw:(materialId:string,input:PublishInput)=>command(materialId,input,'withdraw'),
  };
}
export type MaterialsApi=ReturnType<typeof createMaterialsApi>;
