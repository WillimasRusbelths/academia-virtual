import type { DeliverPending } from '../application/deliver-pending.js';

/** Provider de ciclo de vida ensamblado por Nest; no crea otro proceso. */
export class DeliveryScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly executor: DeliverPending) {}

  onApplicationBootstrap(): void {
    const run = () => {
      this.pending = this.executor.tick().catch(() => {
        console.error('Ciclo de correo no completado. Detalles omitidos.');
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
