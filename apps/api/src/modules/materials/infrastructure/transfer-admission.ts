import type { EventEmitter } from 'node:events';
import { MaterialError } from '../public/errors.js';
import { isAccountId } from '../../users/public/account.js';

// Shared by all compositions within this process, not one counter per request/module.
let active = 0;
const actors = new Map<string, number>();
export interface TransferLimits { readonly transferLimit: number; readonly actorTransferLimit: number }
type TerminalEvents = Pick<EventEmitter, 'once' | 'off'> & {
  readonly aborted?: boolean; readonly destroyed?: boolean; readonly closed?: boolean; readonly writableFinished?: boolean;
};
export function createTransferAdmission(limits: TransferLimits) {
  if (!Number.isInteger(limits.transferLimit) || limits.transferLimit < 1 || limits.transferLimit > 2
    || limits.actorTransferLimit !== 1) throw new TypeError('Invalid materials transfer limits.');
  function acquire(actorId: string) {
    if (!isAccountId(actorId)) throw new MaterialError('AUTH_REQUIRED');
    const id = actorId.toLowerCase();
    if ((actors.get(id) ?? 0) >= limits.actorTransferLimit) throw new MaterialError('RATE_LIMITED', undefined, 1);
    if (active >= limits.transferLimit) throw new MaterialError('TEMPORARILY_UNAVAILABLE', undefined, 1);
    active++; actors.set(id, (actors.get(id) ?? 0) + 1);
    let released = false;
    const bindings: { emitter: Pick<EventEmitter, 'once' | 'off'>; event: string }[] = [];
    function release() {
      if (released) return;
      released = true; active--;
      const remaining = (actors.get(id) ?? 1) - 1;
      if (remaining) actors.set(id, remaining); else actors.delete(id);
      for (const { emitter, event } of bindings) emitter.off(event, release);
      bindings.length = 0;
    }
    function bind(emitter: TerminalEvents) {
      if (released) return;
      try {
        if (emitter.aborted || emitter.destroyed || emitter.closed || emitter.writableFinished) {
          throw new MaterialError('TEMPORARILY_UNAVAILABLE');
        }
        for (const event of ['finish', 'close', 'error', 'aborted']) {
          if (released) break;
          bindings.push({ emitter, event }); emitter.once(event, release);
        }
      } catch (error) { release(); throw error; }
    }
    return Object.freeze({ release, bind });
  }
  return Object.freeze({ acquire,
    async admit(actorId: string, authorize: () => Promise<void>, events: readonly TerminalEvents[]) {
      await authorize();
      const lease = acquire(actorId);
      try { for (const event of events) lease.bind(event); return lease; }
      catch (error) { lease.release(); throw error; }
    },
  });
}
