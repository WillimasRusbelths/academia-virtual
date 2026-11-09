import { ApiFailure } from '../../shared/api-client';
import type { ApiClient, ApiCode } from '../../shared/api-client';

export interface Slot {readonly dayOfWeek:number;readonly startTime:string;readonly endTime:string}
export interface Page<T> {readonly items:readonly T[];readonly total:number;readonly page:number;readonly pageSize:number}
export interface Filters {readonly page?:number;readonly pageSize?:number;readonly q?:string}
export interface InventoryItem {
  readonly groupId:string;readonly courseId:string;readonly courseName:string;readonly groupName:string;readonly teacherName:string|null;
  readonly periodStart:string|null;readonly periodEnd:string|null;readonly timeZone:'America/Lima';readonly schedule:readonly Slot[];
  readonly capacity:number;readonly reserved:number;readonly occupied:number;readonly available:number;readonly priceMinor:string|null;readonly currency:'PEN';
}
export interface Preview {readonly items:readonly InventoryItem[];readonly totalMinor:string;readonly evaluatedAt:string}
export type ReservationResult={readonly id:string;readonly intentionId:string}&(
  {readonly state:'ADMITTED';readonly admittedAt:string}|
  {readonly state:'CONFIRMED';readonly orderId:string;readonly admittedAt?:string}|
  {readonly state:'REJECTED';readonly decisionCode:ApiCode;readonly admittedAt?:string});
export interface OrderItem {
  readonly courseId:string;readonly groupId:string;readonly courseName:string;readonly groupName:string;readonly priceMinor:string;readonly currency:'PEN';
  readonly periodStart:string;readonly periodEnd:string;readonly timeZone:'America/Lima';readonly schedule:readonly Slot[];
  readonly groupStartAt:string;readonly enrollmentValidUntil:string;
}
export interface Order {
  readonly id:string;readonly state:'RESERVED'|'EXPIRED'|'ENROLLED';readonly revision:string;readonly totalMinor:string;readonly currency:'PEN';
  readonly confirmedAt:string;readonly expiresAt:string;readonly serverNow:string;readonly items:readonly OrderItem[];
  readonly paymentAllowed:boolean;readonly paymentMessage:string|null;readonly paymentState:'NOT_PAID'|'PENDING'|'APPLIED'|'INCIDENT';readonly incidentSummary:string|null;
}
export type PaymentAttemptState='SUBMITTING'|'PENDING'|'INITIATION_UNKNOWN'|'FAILED_NO_CHARGE'|'APPLIED'|'INCIDENT';
export interface PaymentAttempt {readonly id:string;readonly state:PaymentAttemptState}
export interface Enrollment {
  readonly id:string;readonly orderId:string;readonly courseId:string;readonly groupId:string;readonly courseName:string;readonly groupName:string;
  readonly state:'ENROLLED'|'HISTORICAL';readonly periodStart:string;readonly periodEnd:string;readonly timeZone:'America/Lima';
  readonly schedule:readonly Slot[];readonly confirmedAt:string;readonly validUntil:string;
}
const unavailable=():never=>{throw new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','No se pudo confirmar el resultado. Consúltalo antes de reintentar manualmente.');};
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return unavailable();
  const row=value as Record<string,unknown>;
  if(required.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>![...required,...optional].includes(k)))return unavailable();
  return row;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&v.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const money=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)&&v.trim()===v;
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const days=(y:number,m:number)=>[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
function civil(v:unknown):v is string {
  if(typeof v!=='string'||v.length!==10||!/^\d{4}-\d\d-\d\d$/.test(v))return false;
  const [y,m,d]=v.split('-').map(Number);return y>=1&&m>=1&&m<=12&&d>=1&&d<=days(y,m);
}
/** Validación exacta gregoriana: no redondear microsegundos mediante Date. */
function point(v:unknown):bigint|null {
  if(typeof v!=='string')return null;
  const match=/^(\d{4}|\+\d{6})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.(\d{6})Z$/.exec(v);
  if(!match||match[0]!==v)return null;
  const [y,m,d,h,min,s]=match.slice(1,7).map(Number);
  if(y<1||match[1].startsWith('+')&&y<10000||m<1||m>12||d<1||d>days(y,m)||h>23||min>59||s>59)return null;
  const previous=y-1;let ordinal=365*previous+Math.floor(previous/4)-Math.floor(previous/100)+Math.floor(previous/400)+d-1;
  for(let month=1;month<m;month++)ordinal+=days(y,month);
  return BigInt(ordinal)*86400000000n+BigInt(h*3600+min*60+s)*1000000n+BigInt(match[7]);
}
const instant=(v:unknown):v is string=>point(v)!==null;
function slots(value:unknown):readonly Slot[]{
  if(!Array.isArray(value))return unavailable();
  return Object.freeze(value.map(v=>{const s=object(v,['dayOfWeek','startTime','endTime']);
    if(!integer(s.dayOfWeek)||s.dayOfWeek<1||s.dayOfWeek>7||typeof s.startTime!=='string'||typeof s.endTime!=='string'
      ||s.startTime.length!==5||s.endTime.length!==5||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)||!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(s.endTime)||s.startTime>=s.endTime)return unavailable();
    return Object.freeze({dayOfWeek:s.dayOfWeek,startTime:s.startTime,endTime:s.endTime});}));
}
const safeCodes:readonly ApiCode[]=['VALIDATION_ERROR','AUTH_REQUIRED','FORBIDDEN','ACTIVE_ORDER_EXISTS','COURSE_COMMITMENT_EXISTS','OFFERING_NOT_RESERVABLE','CAPACITY_UNAVAILABLE','STUDENT_SCHEDULE_CONFLICT'];
function requestView(value:unknown):ReservationResult {
  const state=value&&typeof value==='object'?(value as Record<string,unknown>).state:undefined;
  const fields=state==='ADMITTED'?['admittedAt']:state==='CONFIRMED'?['orderId']:state==='REJECTED'?['decisionCode']:unavailable();
  const r=object(value,['id','intentionId','state',...fields],state==='ADMITTED'?[]:['admittedAt']);
  if(!uuid(r.id)||!uuid(r.intentionId)||r.admittedAt!==undefined&&!instant(r.admittedAt)
    ||state==='ADMITTED'&&!instant(r.admittedAt)||state==='CONFIRMED'&&!uuid(r.orderId)
    ||state==='REJECTED'&&(typeof r.decisionCode!=='string'||!safeCodes.includes(r.decisionCode as ApiCode)))return unavailable();
  return Object.freeze(r) as unknown as ReservationResult;
}
function inventory(value:unknown):InventoryItem {
  const r=object(value,['groupId','courseId','courseName','groupName','teacherName','periodStart','periodEnd','timeZone','schedule','capacity','reserved','occupied','available','priceMinor','currency']);
  if(!uuid(r.groupId)||!uuid(r.courseId)||!text(r.courseName)||!text(r.groupName)||!(r.teacherName===null||text(r.teacherName))
    ||!(r.periodStart===null||civil(r.periodStart))||!(r.periodEnd===null||civil(r.periodEnd))||r.timeZone!=='America/Lima'||r.currency!=='PEN'
    ||!integer(r.capacity)||r.capacity<1||r.capacity>50||!integer(r.reserved)||!integer(r.occupied)||!integer(r.available)
    ||r.available!==r.capacity-r.reserved-r.occupied||!(r.priceMinor===null||money(r.priceMinor)))return unavailable();
  return Object.freeze({...r,schedule:slots(r.schedule)}) as unknown as InventoryItem;
}
function orderItem(value:unknown):OrderItem {
  const r=object(value,['courseId','groupId','courseName','groupName','priceMinor','currency','periodStart','periodEnd','timeZone','schedule','groupStartAt','enrollmentValidUntil']);
  if(!uuid(r.courseId)||!uuid(r.groupId)||!text(r.courseName)||!text(r.groupName)||!money(r.priceMinor)||r.currency!=='PEN'
    ||!civil(r.periodStart)||!civil(r.periodEnd)||r.periodStart>r.periodEnd||r.timeZone!=='America/Lima'
    ||!instant(r.groupStartAt)||!instant(r.enrollmentValidUntil)||point(r.groupStartAt)!>=point(r.enrollmentValidUntil)!)return unavailable();
  return Object.freeze({...r,schedule:slots(r.schedule)}) as unknown as OrderItem;
}
export function orderView(value:unknown):Order {
  const r=object(value,['id','state','revision','totalMinor','currency','confirmedAt','expiresAt','serverNow','items','paymentAllowed','paymentMessage','paymentState','incidentSummary']);
  if(!uuid(r.id)||typeof r.state!=='string'||!['RESERVED','EXPIRED','ENROLLED'].includes(r.state)||!money(r.revision)||BigInt(r.revision)<1n||BigInt(r.revision)>9223372036854775807n
    ||!money(r.totalMinor)||r.currency!=='PEN'||!instant(r.confirmedAt)||!instant(r.expiresAt)||!instant(r.serverNow)||!Array.isArray(r.items)||!r.items.length
    ||point(r.expiresAt)!-point(r.confirmedAt)!!==86400000000n||point(r.serverNow)!<point(r.confirmedAt)!
    ||typeof r.paymentAllowed!=='boolean'||!(r.paymentMessage===null||r.paymentMessage==='Oferta no disponible.')
    ||typeof r.paymentState!=='string'||!['NOT_PAID','PENDING','APPLIED','INCIDENT'].includes(r.paymentState)
    ||!(r.incidentSummary===null||r.incidentSummary==='Pago en conciliación, sin matrícula.'))return unavailable();
  const items=r.items.map(orderItem);
  if(new Set(items.map(i=>i.courseId)).size!==items.length||items.reduce((n,i)=>n+BigInt(i.priceMinor),0n)!==BigInt(r.totalMinor)
    ||r.state==='ENROLLED'&&!['APPLIED','INCIDENT'].includes(r.paymentState as string)||r.paymentState==='APPLIED'&&r.state!=='ENROLLED'
    ||r.paymentAllowed&&(r.state!=='RESERVED'||point(r.serverNow)!>=point(r.expiresAt)!||r.paymentState!=='NOT_PAID'||r.paymentMessage!==null))return unavailable();
  return Object.freeze({...r,items:Object.freeze(items)}) as unknown as Order;
}
export function paymentAttempt(value:unknown):PaymentAttempt {
  const r=object(value,['id','state']);
  if(!uuid(r.id)||typeof r.state!=='string'||!['SUBMITTING','PENDING','INITIATION_UNKNOWN','FAILED_NO_CHARGE','APPLIED','INCIDENT'].includes(r.state))return unavailable();
  return Object.freeze({id:r.id,state:r.state as PaymentAttemptState});
}
function enrollmentView(value:unknown):Enrollment {
  const r=object(value,['id','orderId','courseId','groupId','courseName','groupName','state','periodStart','periodEnd','timeZone','schedule','confirmedAt','validUntil']);
  if(!uuid(r.id)||!uuid(r.orderId)||!uuid(r.courseId)||!uuid(r.groupId)||!text(r.courseName)||!text(r.groupName)
    ||!['ENROLLED','HISTORICAL'].includes(r.state as string)||!civil(r.periodStart)||!civil(r.periodEnd)||r.periodStart>r.periodEnd
    ||r.timeZone!=='America/Lima'||!instant(r.confirmedAt)||!instant(r.validUntil)||point(r.confirmedAt)!>=point(r.validUntil)!)return unavailable();
  return Object.freeze({...r,schedule:slots(r.schedule)}) as unknown as Enrollment;
}
function paginated<T>(value:unknown,parse:(v:unknown)=>T,extra:readonly string[]=[]):Page<T>&Record<string,unknown>{
  const r=object(value,['items','page','pageSize','total',...extra]);
  if(!Array.isArray(r.items)||!integer(r.total)||!integer(r.page)||r.page<1||!integer(r.pageSize)||r.pageSize<1||r.pageSize>50||r.items.length>r.pageSize)return unavailable();
  return Object.freeze({...r,items:Object.freeze(r.items.map(parse))}) as Page<T>&Record<string,unknown>;
}
const reference=(value:string)=>{if(!uuid(value))return unavailable();return value.toLowerCase();};
function ownRequest(value:unknown,intentionId:string):ReservationResult {const result=requestView(value);if(result.intentionId.toLowerCase()!==reference(intentionId))return unavailable();return result;}
/** Solo acciones explícitas: no polling, replay automático ni almacenamiento local. */
export function createEnrollmentApi(client:ApiClient){
  return {
    async initiatePayment(orderId:string,initiationId:string,signal?:AbortSignal){return paymentAttempt(await client.request('/enrollment/orders/'+reference(orderId)+'/payment-attempts',{method:'POST',body:{initiationId:reference(initiationId)},signal}));},
    async enrollments(input:Omit<Filters,'q'>={},signal?:AbortSignal){return paginated(await client.request('/enrollment/enrollments',{query:{page:input.page??1,pageSize:input.pageSize??20},signal}),enrollmentView);},
    async enrollment(id:string,signal?:AbortSignal){const result=enrollmentView(await client.request('/enrollment/enrollments/'+reference(id),{signal}));if(result.id.toLowerCase()!==reference(id))return unavailable();return result;},
    async offerings(input:Filters={},signal?:AbortSignal){const result=paginated(await client.request('/enrollment/offerings',{query:{page:input.page??1,pageSize:input.pageSize??20,...(input.q===undefined?{}:{q:input.q})},signal}),inventory,['evaluatedAt']);
      if(!instant(result.evaluatedAt))return unavailable();return Object.freeze({items:result.items,total:result.total,page:result.page,pageSize:result.pageSize,evaluatedAt:result.evaluatedAt});},
    async preview(groupIds:readonly string[],signal?:AbortSignal):Promise<Preview>{const r=object(await client.request('/enrollment/selection-preview',{method:'POST',body:{groupIds:[...groupIds]},signal}),['items','totalMinor','evaluatedAt']);
      if(!Array.isArray(r.items)||!money(r.totalMinor)||!instant(r.evaluatedAt))return unavailable();const items=r.items.map(inventory);
      if(items.some(i=>i.priceMinor===null)||items.reduce((n,i)=>n+BigInt(i.priceMinor!),0n)!==BigInt(r.totalMinor))return unavailable();
      return Object.freeze({items:Object.freeze(items),totalMinor:r.totalMinor,evaluatedAt:r.evaluatedAt});},
    async reserve(input:{readonly intentionId:string;readonly groupIds:readonly string[]},signal?:AbortSignal){return ownRequest(await client.request('/enrollment/reservation-requests',{method:'POST',body:{intentionId:input.intentionId,groupIds:[...input.groupIds]},signal}),input.intentionId);},
    async request(intentionId:string,signal?:AbortSignal){return ownRequest(await client.request('/enrollment/reservation-requests/'+reference(intentionId),{signal}),intentionId);},
    async requests(input:Omit<Filters,'q'>={},signal?:AbortSignal){return paginated(await client.request('/enrollment/reservation-requests',{query:{page:input.page??1,pageSize:input.pageSize??20},signal}),requestView);},
    async order(id:string,signal?:AbortSignal){const result=orderView(await client.request('/enrollment/orders/'+reference(id),{signal}));if(result.id.toLowerCase()!==reference(id))return unavailable();return result;},
    async orders(input:Omit<Filters,'q'>={},signal?:AbortSignal){return paginated(await client.request('/enrollment/orders',{query:{page:input.page??1,pageSize:input.pageSize??20},signal}),orderView);},
    async currentOrder(signal?:AbortSignal){const result=await client.request('/enrollment/orders/current',{signal});return result===null?null:orderView(result);},
  };
}
export type EnrollmentApi=ReturnType<typeof createEnrollmentApi>;
