/** Contrato interno entre módulos; no es una respuesta HTTP ni autoriza publicaciones. */
export interface TeacherSummary {
  readonly userId: string;
  readonly name: string;
}

export interface TeacherEligibility extends TeacherSummary {
  readonly eligible: boolean;
  /** Generación de pérdida de habilitación. Recuperar la cuenta no renueva snapshots. */
  readonly eligibilityVersion: bigint;
}

export interface TeacherDirectoryQuery {
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface TeacherDirectoryPage {
  readonly items: readonly TeacherSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface TeachingDirectory {
  find(userId: string): Promise<TeacherEligibility | null>;
  listEligible(query: TeacherDirectoryQuery): Promise<TeacherDirectoryPage>;
}

export class TeachingDirectoryInvalid extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor() { super('Consulta docente inválida. Valores omitidos.'); }
}

export class TeachingDirectoryUnavailable extends Error {
  readonly code = 'TEMPORARILY_UNAVAILABLE';
  constructor() { super('Directorio docente temporalmente no disponible.'); }
}
