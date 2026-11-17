import { expect, expectTypeOf, test } from 'vitest';
import type { SessionActor } from '../../src/modules/authorization/public/session.js';
import type { AdministrativeEnrollmentPermission, EnrollmentAuthorization, EnrollmentPermission, OwnEnrollmentPermission, ReservationCoordinator, TemporalDecision } from '../../src/modules/enrollment/application/ports.js';
import type { ReservationSelection } from '../../src/modules/enrollment/public/enrollment.js';
import type { PaymentGateway, AuthenticPaymentEvidence } from '../../src/modules/enrollment/public/payments.js';
import type { GroupCommitmentPolicy } from '../../src/modules/enrollment/public/commitments.js';
import type { ReservationOfferingAccess } from '../../src/modules/academic-offering/public/reservation-boundary.js';
import { effectiveSchedulesOverlap } from '../../src/modules/academic-offering/public/schedule.js';
import type { EffectiveSchedule } from '../../src/modules/academic-offering/public/schedule.js';

test('T010 contratos de dueño: selección sin precios/reloj y participantes sin conexión', () => {
  expectTypeOf<keyof ReservationSelection>().toEqualTypeOf<'intentionId' | 'groupIds'>();
  expectTypeOf<keyof ReservationOfferingAccess>().toEqualTypeOf<'discover' | 'snapshots'>();
  expectTypeOf<keyof PaymentGateway>().toEqualTypeOf<'initiate' | 'recover' | 'verify'>();
  expectTypeOf<Parameters<GroupCommitmentPolicy['check']>[0]['evaluatedAt']>().toEqualTypeOf<bigint>();
  expectTypeOf<Parameters<EnrollmentAuthorization['revalidate']>[0]>().toEqualTypeOf<SessionActor>();
  expectTypeOf<Parameters<ReservationCoordinator['run']>[0]>().toEqualTypeOf<SessionActor>();
  // @ts-expect-error un reloj del cliente no puede construir el token de la unidad de trabajo
  const forged: TemporalDecision = { at: 1n };
  // @ts-expect-error SYSTEM no es un actor de usuario aceptado por el coordinador
  const system: SessionActor = { userId: 'system', sessionId: '', authVersion: 0n, role: 'SYSTEM' };
  expect(forged.at).toBe(1n); expect(system.role).toBe('SYSTEM');
});
test('T010 evidencia externa no se presenta como conciliación ni matrícula', () => {
  expectTypeOf<AuthenticPaymentEvidence['amountUnits']>().toEqualTypeOf<bigint>();
  expectTypeOf<AuthenticPaymentEvidence['currency']>().toEqualTypeOf<string>();
  expectTypeOf<Extract<keyof AuthenticPaymentEvidence, 'verificationFinishedAt' | 'orderId' | 'studentId' | 'reconciliationState'>>().toEqualTypeOf<never>();
});
test('T012 puertos usan la matriz pública y no amplían SessionActor/Repository para SYSTEM o PG', () => {
  expectTypeOf<Parameters<EnrollmentAuthorization['revalidate']>[1]>().toEqualTypeOf<EnrollmentPermission>();
  expectTypeOf<EnrollmentPermission>().toEqualTypeOf<OwnEnrollmentPermission | AdministrativeEnrollmentPermission>();
  expectTypeOf<Extract<SessionActor['role'],'SYSTEM'>>().toEqualTypeOf<never>();
});
const schedule = (periodStart: string, periodEnd: string, startTime = '18:00', endTime = '19:00'): EffectiveSchedule => ({
  periodStart, periodEnd, timeZone: 'America/Lima', schedule: [{ dayOfWeek: 1, startTime, endTime }],
});
test('T010 superficie pública D06 compara ocurrencias efectivas y permite adyacencia', () => {
  expect(effectiveSchedulesOverlap(schedule('2030-01-01', '2030-01-07'), schedule('2030-01-07', '2030-01-14'))).toBe(true);
  // Ambos períodos contienen un lunes, pero su intersección 8–13 no contiene ninguno.
  expect(effectiveSchedulesOverlap(schedule('2030-01-01', '2030-01-13'), schedule('2030-01-08', '2030-01-14'))).toBe(false);
  expect(effectiveSchedulesOverlap(schedule('2030-01-01', '2030-01-07'), schedule('2030-01-07', '2030-01-14', '19:00', '20:00'))).toBe(false);
});
