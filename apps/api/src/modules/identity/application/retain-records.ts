import type { MailRetention, MailRetentionCounts } from '../../mail/public/retention.js';

export interface IdentityRetentionCounts {
  sessions: number; tokens: number; auditEvents: number; rateEvents: number; rateBuckets: number;
}
export interface IdentityRetention { runBatch(limit: number): Promise<IdentityRetentionCounts> }
export function retentionLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error('Límite de mantenimiento inválido.');
  return value;
}

/** Cada lote confirmado sobrevive a una interrupción; repetir vuelve a seleccionar lo pendiente. */
export class RetainRecords {
  constructor(private readonly identity: IdentityRetention, private readonly mail: MailRetention) {}
  async execute(batchSize = 100, maxBatches = 10) {
    retentionLimit(batchSize);retentionLimit(maxBatches);
    const counts: IdentityRetentionCounts & MailRetentionCounts = {
      sessions:0,tokens:0,auditEvents:0,rateEvents:0,rateBuckets:0,cancelledDeliveries:0,purgedDeliveries:0,
    };
    let batches=0;
    for (; batches<maxBatches; batches++) {
      // Correo termina y borra su payload antes de que identidad pueda purgar el token.
      const current={...await this.mail.runBatch(batchSize),...await this.identity.runBatch(batchSize)};
      for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key]+=current[key];
      if (Object.values(current).every(count=>count===0)) return {counts,batches:batches+1,noChanges:true};
    }
    return {counts,batches,noChanges:false};
  }
}
