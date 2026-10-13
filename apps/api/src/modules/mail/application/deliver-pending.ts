import { MailTransportFailure } from './delivery-ports.js';
import type { DeliveryEligibility, EncryptedMailPayload, Mailer, MailPayload, PayloadCipher } from './delivery-ports.js';

export interface DeliveryCandidate extends EncryptedMailPayload {
  readonly id: string;
  readonly tokenId: string;
}
export interface DeliveryClaim { readonly id: string; readonly claimId: string }
export type DeliveryFailure = 'TIMEOUT' | 'TEMPORARY' | 'PERMANENT' | 'EXPIRED';

export interface DeliveryStore {
  sweep(): Promise<void>;
  candidates(): Promise<DeliveryCandidate[]>;
  claim(candidate: DeliveryCandidate): Promise<DeliveryClaim | null>;
  cancel(candidate: DeliveryCandidate, reason: 'EXPIRED' | 'OBSOLETE' | 'PERMANENT'): Promise<void>;
  finish(claim: DeliveryClaim, failure: DeliveryFailure | null): Promise<boolean>;
}

/** Un ciclo no se superpone a otro; SMTP nunca se ejecuta dentro de la persistencia. */
export class DeliverPending {
  private running: Promise<void> | null = null;
  constructor(private readonly store: DeliveryStore, private readonly eligibility: DeliveryEligibility,
    private readonly cipher: PayloadCipher, private readonly mailer: Mailer) {}

  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.cycle().finally(() => { this.running = null; });
    return this.running;
  }

  private async cycle(): Promise<void> {
    await this.store.sweep();
    const candidates = (await this.store.candidates()).slice(0, 2);
    const results = await Promise.allSettled(candidates.map(candidate => this.deliver(candidate)));
    if (results.some(result => result.status === 'rejected')) throw new Error('Ciclo de correo no completado. Detalles omitidos.');
  }

  private async deliver(candidate: DeliveryCandidate): Promise<void> {
    const eligible = await this.eligibility.check(candidate.tokenId);
    if (eligible !== 'ELIGIBLE') { await this.store.cancel(candidate, eligible); return; }
    let payload: MailPayload;
    try { payload = this.cipher.decrypt(candidate); }
    catch { await this.store.cancel(candidate, 'PERMANENT'); return; }
    const claim = await this.store.claim(candidate);
    if (!claim) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: DeliveryFailure | null = null;
    try {
      await Promise.race([
        this.mailer.send(payload, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new MailTransportFailure('TIMEOUT')); }, 20_000);
        }),
      ]);
    } catch (error) { failure = controller.signal.aborted ? 'TIMEOUT'
      : error instanceof MailTransportFailure ? error.kind : 'TEMPORARY'; }
    finally { clearTimeout(timer); }
    // Un fallo de BD aquí conserva el lease. SMTP pudo aceptar aunque no haya confirmación.
    await this.store.finish(claim, failure);
  }
}
