import type { PoolClient } from 'pg';
import type { EnrollmentCalendar } from '../application/ports.js';
import { civilDate } from '../domain/calendar.js';
import { formatInstant, InstantInputError } from '../domain/instant.js';
import type { InstantUs } from '../domain/instant.js';

/** Proyección explícita NUMERIC -> texto -> bigint, sin parsers globales/Date. */
export function instantFromEpochText(value: unknown): InstantUs {
  if (typeof value !== 'string' || value.trim() !== value || !/^(0|-?[1-9]\d*)$/.test(value)) throw new InstantInputError();
  return BigInt(value);
}
/** PostgreSQL representa el año ampliado sin el signo/ceros ISO. No usa Date. */
export function postgresInstantParameter(value: InstantUs): string {
  return formatInstant(value).replace(/^\+(\d{6})-/, (_match, year: string) => BigInt(year).toString() + '-');
}
/** Lee los límites persistidos originales: no reconvierte fechas de oferta actuales. */
export async function readOriginalPeriodBounds(client: PoolClient, orderItemId: string) {
  const row = (await client.query<{ start: string; end: string }>(`SELECT
    (extract(epoch FROM "groupStartAt")*1000000)::numeric(30,0)::text AS start,
    (extract(epoch FROM "enrollmentValidUntil")*1000000)::numeric(30,0)::text AS end
    FROM "EnrollmentOrderItem" WHERE id=$1`, [orderItemId])).rows[0];
  if (!row) throw new InstantInputError();
  return Object.freeze({ groupStartAt: instantFromEpochText(row.start), enrollmentValidUntil: instantFromEpochText(row.end) });
}
/** Participante de calendario, ligado al mismo cliente; no abre transacciones.
 * El dueño de la transacción conserva los límites obtenidos al confirmar, sin
 * recalcularlos al leer, matricular, republicar o actualizar tzdata.
 */
export function createEnrollmentCalendar(client: PoolClient): EnrollmentCalendar {
  return {
    async originalBounds(periodStart, periodEnd) {
      civilDate(periodStart); civilDate(periodEnd);
      if (periodStart > periodEnd) throw new InstantInputError();
      const row = (await client.query<{ start: string; end: string }>(`SELECT
        (extract(epoch FROM ($1::date::timestamp AT TIME ZONE 'America/Lima'))*1000000)::numeric(30,0)::text AS start,
        (extract(epoch FROM (($2::date+1)::timestamp AT TIME ZONE 'America/Lima'))*1000000)::numeric(30,0)::text AS end`,
      [periodStart, periodEnd])).rows[0];
      return Object.freeze({ groupStartAt: instantFromEpochText(row.start), enrollmentValidUntil: instantFromEpochText(row.end) });
    },
  };
}
