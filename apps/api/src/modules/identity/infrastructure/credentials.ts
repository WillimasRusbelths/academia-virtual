import { createHash, randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import { CredentialOverload, CredentialUnavailable } from '../application/credentials.js';
import type { AccessSecrets, PasswordCredentials } from '../application/credentials.js';

export const ARGON2_PARAMETERS = Object.freeze({ type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 });
export const HASH_CONCURRENCY = 2;
export const HASH_QUEUE_MAX = 50;
export const HASH_WAIT_MS = 5000;

/** Puerto de la biblioteca criptográfica; facilita probar saturación sin bajar su costo. */
export interface Argon2Engine {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
}
const nativeEngine: Argon2Engine = {
  hash: password => hash(password, ARGON2_PARAMETERS),
  verify: (encoded, password) => verify(encoded, password),
};

interface WaitingHash { start(): void; expire(): void; deadline: number; timer: ReturnType<typeof setTimeout> }

class HashGate {
  private active = 0;
  private waiting: WaitingHash[] = [];

  run<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const start = () => {
        this.active++;
        void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
          this.active--;
          this.drain();
        });
      };
      if (this.active < HASH_CONCURRENCY) { start(); return; }
      if (this.waiting.length >= HASH_QUEUE_MAX) { reject(new CredentialOverload()); return; }
      const pending: WaitingHash = {
        start, expire: () => reject(new CredentialOverload()), deadline: performance.now() + HASH_WAIT_MS,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(pending);
          if (index !== -1) { this.waiting.splice(index, 1); pending.expire(); }
        }, HASH_WAIT_MS),
      };
      this.waiting.push(pending);
    });
  }

  private drain() {
    while (this.active < HASH_CONCURRENCY && this.waiting.length) {
      const pending = this.waiting.shift()!;
      clearTimeout(pending.timer);
      if (performance.now() >= pending.deadline) pending.expire();
      else pending.start();
    }
  }
}

// Compartido por todos los adaptadores del proceso; no almacena autorización ni cuotas.
const gate = new HashGate();
const phc = /^\$argon2id\$v=19\$([^$]+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
function validHash(value: string | null): value is string {
  const match = value?.match(phc);
  return !!match && match[1].split(',').sort().join(',') === 'm=19456,p=1,t=2'
    && Buffer.from(match[2], 'base64').length >= 16 && Buffer.from(match[3], 'base64').length === 32;
}

export async function createPasswordCredentials(engine: Argon2Engine = nativeEngine): Promise<PasswordCredentials> {
  async function limited<T>(operation: () => Promise<T>): Promise<T> {
    return gate.run(async () => {
      try { return await operation(); }
      catch { throw new CredentialUnavailable(); }
    });
  }
  const dummy = await limited(() => engine.hash(randomBytes(32).toString('base64url')));
  if (!validHash(dummy)) throw new CredentialUnavailable();
  return {
    hash: password => limited(() => engine.hash(password)),
    async verify(password, encodedHash) {
      const usable = validHash(encodedHash);
      const matches = await limited(() => engine.verify(usable ? encodedHash : dummy, password));
      return usable && matches;
    },
  };
}

export const accessSecrets: AccessSecrets = Object.freeze({
  issue() {
    const bytes = randomBytes(32);
    return { secret: bytes.toString('base64url'), digest: createHash('sha256').update(bytes).digest() };
  },
  digest(secret: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
    const bytes = Buffer.from(secret, 'base64url');
    if (bytes.length !== 32 || bytes.toString('base64url') !== secret) return null;
    return createHash('sha256').update(bytes).digest();
  },
});
