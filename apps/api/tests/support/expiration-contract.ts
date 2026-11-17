/// <reference types="vite/client" />
import { expect } from 'vitest';
import type { Pool } from 'pg';
import type { createReservationOfferingParticipant } from '../../src/modules/academic-offering/infrastructure/reservation-participant.js';

/** Contrato de conformidad del ensayo, no implementación ni API pública. */
export interface ExpirationCandidate {readonly id:string;readonly expiresAt:bigint}
export type ExpirationOutcome='EXPIRED'|'NOT_DUE'|'ALREADY_TERMINAL';
export interface ExpirationWork {
  horizon():Promise<ExpirationCandidate|null>;
  page(input:{readonly after:ExpirationCandidate|null;readonly through:ExpirationCandidate;readonly limit:number}):Promise<readonly ExpirationCandidate[]>;
  expire(orderId:string):Promise<ExpirationOutcome>;
}
export interface ExpirationTick {readonly examined:number;readonly expired:number;readonly failed:number}
export interface ExpirationWorker {
  tick():Promise<ExpirationTick>;
  onApplicationBootstrap():void;
  beforeApplicationShutdown():Promise<void>;
}
export interface ExpirationOptions {readonly batchSize?:number;readonly intervalMs?:number}
interface Exports {
  createExpirationScheduler?:(work:ExpirationWork,options?:ExpirationOptions)=>ExpirationWorker;
  createReservationExpiration?:(pool:Pool,offering:typeof createReservationOfferingParticipant,options?:ExpirationOptions)=>ExpirationWorker;
}
const modules=import.meta.glob<Exports>('../../src/modules/enrollment/infrastructure/expiration-scheduler.ts',{eager:true});
export function schedulerTarget(work:ExpirationWork,options?:ExpirationOptions):ExpirationWorker{
  const factory=Object.values(modules)[0]?.createExpirationScheduler;
  expect(factory,'T063 pendiente: scheduler de vencimiento ausente; no es fallo de import/configuración').toBeTypeOf('function');
  return factory!(work,options);
}
export function expirationWorker(pool:Pool,offering:typeof createReservationOfferingParticipant,options?:ExpirationOptions):ExpirationWorker{
  const factory=Object.values(modules)[0]?.createReservationExpiration;
  expect(factory,'T063 pendiente: composición PG del scheduler ausente; no es fallo de PG/import/configuración').toBeTypeOf('function');
  return factory!(pool,offering,options);
}
