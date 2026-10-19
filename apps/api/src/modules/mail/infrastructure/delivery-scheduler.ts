import type { DeliverPending } from '../application/deliver-pending.js';
import { securityEvents, newCorrelationId } from '../../../infrastructure/logging/security-events.js';

/** Provider de ciclo de vida ensamblado por Nest; no crea otro proceso. */
export class DeliveryScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly executor: DeliverPending) {}

  onApplicationBootstrap(): void {
    const run = () => {
      this.pending = this.executor.tick().catch(() => {
        securityEvents.record({category:'OPERATION',action:'RUNTIME_FAILURE',result:'FAILED',
          reasonCode:'TEMPORARILY_UNAVAILABLE',actorKind:'SYSTEM',targetKind:'IDENTITY_SCOPE'},newCorrelationId());
      });
    };
    this.timer = setInterval(run, 5000);
    this.timer.unref();
    run();
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
  }
}
