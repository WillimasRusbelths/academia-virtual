import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { AcademicOfferingDataset } from './academic-offering.js';
import { maintenanceSeed, resetAcademicFixture } from './academic-maintenance-fixture.js';
import { PostgresSessionStore } from '../../src/modules/identity/infrastructure/session-store.js';
import { PostgresAuditWriter } from '../../src/modules/audit/infrastructure/audit-writer.js';
import { ChangeAccess } from '../../src/modules/identity/application/change-access.js';
import { PostgresAccessChangeStore } from '../../src/modules/identity/infrastructure/access-change-store.js';
import type { Pool } from 'pg';
import type { Us1Http } from './us1-http.js';

export const courseStates = ['DRAFT','PUBLISHED','WITHDRAWN'] as const;
export const groupStates = [...courseStates,'CANCELLED'] as const;
export type CourseState = typeof courseStates[number];
export type GroupState = typeof groupStates[number];
export async function us4Seed(data: AcademicOfferingDataset, options: {courseState?:CourseState;groupState?:GroupState} = {}) {
  await data.context.database.pool.query(`UPDATE "User" SET role='TEACHER',status='ACTIVE',"disabledAt"=NULL,
    "emailVerifiedAt"=COALESCE("emailVerifiedAt",clock_timestamp()) WHERE id=$1`, [data.account('TEACHER').id]);
  await resetAcademicFixture(data);
  const seed=await maintenanceSeed(data, { otherTeacherId: data.otherTeacher.userId,
    firstCourseDraft:options.courseState==='DRAFT',firstGroupDraft:options.groupState==='DRAFT' });
  if(options.courseState&&options.courseState!=='DRAFT')await data.context.database.pool.query('UPDATE "AcademicCourse" SET state=$2 WHERE id=$1',[seed.courseId,options.courseState]);
  if(options.groupState)await setGroupState(data,seed.groupId,options.groupState);
  return seed;
}
export async function setGroupState(data: AcademicOfferingDataset, id: string, state: GroupState) {
  await data.context.database.pool.query(`UPDATE "AcademicGroup" SET state=$2::"AcademicGroupState",
    "cancellationReason"=CASE WHEN $2::text='CANCELLED' THEN 'PRIVATE_US4_REASON' ELSE NULL END,
    "cancelledAt"=CASE WHEN $2::text='CANCELLED' THEN clock_timestamp() ELSE NULL END WHERE id=$1`, [id,state]);
}
export function accessChanger(pool: Pool, sessions: PostgresSessionStore) {
  return new ChangeAccess(new PostgresAccessChangeStore(pool, { authorization: sessions, audit: new PostgresAuditWriter() }));
}
export async function changeTeacher(data: AcademicOfferingDataset, kind: 'role'|'status', value: string, pool = data.context.database.pool) {
  const sessions = new PostgresSessionStore(pool), actor = await sessions.lookup(data.secondAdmin.secret);
  expect(actor).not.toBeNull();
  return accessChanger(pool, sessions).execute(actor!, { id: data.account('TEACHER').id,kind,value,requestId:randomUUID() });
}
/** Transporte real de la composición existente: no añade rutas ni resultados de negocio. */
export function academicRequest(http: Us1Http, method: string, route: string, secret: string, body?: object) {
  return fetch(`${http.url}/api/v1${route}`, { method,headers:http.headers(secret),...(body?{body:JSON.stringify(body)}:{}) });
}
export function assertSafeDenied(value: unknown, data: AcademicOfferingDataset) {
  expect(value).not.toHaveProperty('data'); const text=JSON.stringify(value);
  for(const role of ['ADMIN','STUDENT','TEACHER'] as const){expect(text).not.toContain(data.account(role).email);expect(text).not.toContain(data.account(role).sessions[0].secret);}
  expect(text).not.toMatch(/PRIVATE_US4|passwordHash|authVersion|eligibilityVersion|publishedTeacher|Academic(?:Group|Course)|\b(?:SELECT|UPDATE|INSERT)\b/);
}
