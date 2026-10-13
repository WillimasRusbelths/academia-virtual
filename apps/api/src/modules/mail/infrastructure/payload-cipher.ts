import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Environment } from '../../../infrastructure/config/environment.js';
import { ConfigurationError } from '../../../infrastructure/config/environment.js';
import { MailPayloadUnavailable, validateMailPayload } from '../application/delivery-ports.js';
import type { PayloadCipher } from '../application/delivery-ports.js';

/** La única clave activa procede del entorno; no forma parte del resultado persistible. */
export function createPayloadCipher(environment: Pick<Environment, 'mailPayloadKey' | 'mailKeyId' | 'appOrigin'>): PayloadCipher {
  if (environment.mailPayloadKey.length !== 32 || !/^[A-Za-z0-9_-]{1,64}$/.test(environment.mailKeyId)) {
    throw new ConfigurationError('cifrado de correo');
  }
  const key = Buffer.from(environment.mailPayloadKey);
  const keyId = environment.mailKeyId;
  const associatedData = Buffer.from(keyId, 'utf8');
  return {
    encrypt(payload) {
      const data = validateMailPayload(payload, environment.appOrigin);
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
      cipher.setAAD(associatedData);
      const encryptedPayload = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
      return { encryptedPayload, nonce, authTag: cipher.getAuthTag(), keyId };
    },
    decrypt(payload) {
      try {
        if (payload.keyId !== keyId || payload.nonce.length !== 12 || payload.authTag.length !== 16) {
          throw new MailPayloadUnavailable();
        }
        const decipher = createDecipheriv('aes-256-gcm', key, payload.nonce, { authTagLength: 16 });
        decipher.setAAD(associatedData);
        decipher.setAuthTag(payload.authTag);
        const plain = Buffer.concat([decipher.update(payload.encryptedPayload), decipher.final()]);
        return validateMailPayload(JSON.parse(plain.toString('utf8')), environment.appOrigin);
      } catch { throw new MailPayloadUnavailable(); }
    },
  };
}
