import type { EnrollmentErrorCode, EnrollmentField } from '../../modules/enrollment/public/errors.js';
export type EnrollmentTargetKind = 'NONE'|'COURSE'|'ORDER'|'ENROLLMENT'|'INCIDENT'|'RESERVATION_REQUEST';
export interface EnrollmentRouteContract {
  readonly role:'ADMIN'|'STUDENT'; readonly targetKind:EnrollmentTargetKind; readonly param?:string;
  readonly fields:readonly EnrollmentField[]; readonly conflicts:readonly EnrollmentErrorCode[]; readonly command?:boolean;
}
const entry=(role:EnrollmentRouteContract['role'],fields:readonly EnrollmentField[]=[],targetKind:EnrollmentTargetKind='NONE',param?:string,
  conflicts:readonly EnrollmentErrorCode[]=[],command=false):EnrollmentRouteContract=>Object.freeze({role,fields,targetKind,param,conflicts,command});
const selection:readonly EnrollmentErrorCode[]=['ACTIVE_ORDER_EXISTS','COURSE_COMMITMENT_EXISTS','OFFERING_NOT_RESERVABLE','CAPACITY_UNAVAILABLE','STUDENT_SCHEDULE_CONFLICT'];
/** Catálogo de transporte previsto. No registra controladores ni habilita permisos. */
export const enrollmentRouteContracts:Readonly<Record<string,EnrollmentRouteContract>>=Object.freeze({
  'GET /admin/enrollment/courses/:courseId/price':entry('ADMIN',[],'COURSE','courseId'),
  'PUT /admin/enrollment/courses/:courseId/price':entry('ADMIN',['commandId','expectedRevision','amountMinor','currency'],'COURSE','courseId',['IDEMPOTENCY_CONFLICT','ENROLLMENT_VERSION_CONFLICT'],true),
  'GET /enrollment/offerings':entry('STUDENT',['q','page','pageSize']),
  'POST /enrollment/selection-preview':entry('STUDENT',['groupIds'],'NONE',undefined,selection),
  'POST /enrollment/reservation-requests':entry('STUDENT',['intentionId','groupIds'],'NONE',undefined,[...selection,'IDEMPOTENCY_CONFLICT']),
  'GET /enrollment/reservation-requests':entry('STUDENT',['page','pageSize']),
  'GET /enrollment/reservation-requests/:intentionId':entry('STUDENT',[],'RESERVATION_REQUEST','intentionId'),
  'GET /enrollment/orders':entry('STUDENT',['page','pageSize']),
  'GET /enrollment/orders/current':entry('STUDENT'),
  'GET /enrollment/orders/:orderId':entry('STUDENT',[],'ORDER','orderId'),
  'POST /enrollment/orders/:orderId/payment-attempts':entry('STUDENT',['initiationId'],'ORDER','orderId',['IDEMPOTENCY_CONFLICT','RESERVATION_EXPIRED','PAYMENT_NOT_ALLOWED']),
  'GET /enrollment/enrollments':entry('STUDENT',['page','pageSize']),
  'GET /enrollment/enrollments/:enrollmentId':entry('STUDENT',[],'ENROLLMENT','enrollmentId'),
  'GET /admin/enrollment/orders':entry('ADMIN',['page','pageSize','studentId']),
  'GET /admin/enrollment/orders/:orderId':entry('ADMIN',[],'ORDER','orderId'),
  'GET /admin/enrollment/incidents':entry('ADMIN',['page','pageSize']),
  'GET /admin/enrollment/incidents/:incidentId':entry('ADMIN',[],'INCIDENT','incidentId'),
  'POST /admin/enrollment/incidents/:incidentId/follow-ups':entry('ADMIN',['commandId','content'],'INCIDENT','incidentId',['IDEMPOTENCY_CONFLICT'],true),
});
export function enrollmentRoute(method:string,template:string):EnrollmentRouteContract|undefined {
  const key=method+' '+template;
  return Object.hasOwn(enrollmentRouteContracts,key)?enrollmentRouteContracts[key]:undefined;
}
export function enrollmentFamily(path:string):boolean {return /^\/(?:admin\/)?enrollment(?:\/|$)/.test(path);}
export const enrollmentConflictCodes:readonly EnrollmentErrorCode[]=Object.freeze(['IDEMPOTENCY_CONFLICT','ENROLLMENT_VERSION_CONFLICT',...selection,'RESERVATION_EXPIRED','PAYMENT_NOT_ALLOWED']);
