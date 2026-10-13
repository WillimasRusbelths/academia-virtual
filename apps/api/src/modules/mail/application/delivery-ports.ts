export type MailTemplate = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

/** Solo los datos necesarios para un enlace; nunca credenciales de contraseña. */
export interface MailPayload {
  readonly recipient: string;
  readonly link: string;
  readonly template: MailTemplate;
}

export interface EncryptedMailPayload {
  readonly encryptedPayload: Uint8Array;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly keyId: string;
}

export interface PayloadCipher {
  encrypt(payload: MailPayload): EncryptedMailPayload;
  decrypt(payload: EncryptedMailPayload): MailPayload;
}

export interface Mailer {
  /** Éxito significa aceptación SMTP, no entrega final ni lectura. */
  send(payload: MailPayload): Promise<void>;
}

/** El adaptador de identidad se implementa con el ejecutor, no en el módulo mail. */
export interface DeliveryEligibility {
  check(tokenId: string): Promise<'ELIGIBLE' | 'EXPIRED' | 'OBSOLETE'>;
}

export class MailPayloadInvalid extends Error {
  constructor() { super('Contenido de correo inválido. Valores omitidos.'); }
}

export class MailPayloadUnavailable extends Error {
  constructor() { super('Contenido de correo no disponible. Valores omitidos.'); }
}

export class MailTransportFailure extends Error {
  constructor(readonly kind: 'TIMEOUT' | 'TEMPORARY' | 'PERMANENT') {
    super('No se pudo confirmar la aceptación del correo. Detalles omitidos.');
  }
}

/** Lista cerrada también en ejecución: las propiedades extra no se cifran ni envían. */
export function validateMailPayload(value: unknown, origin: string): MailPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MailPayloadInvalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'link,recipient,template'
    || typeof data.recipient !== 'string' || data.recipient.length > 254
    || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(data.recipient)
    || typeof data.link !== 'string' || typeof data.template !== 'string'
    || !['VERIFY_EMAIL', 'RESET_PASSWORD'].includes(data.template)) {
    throw new MailPayloadInvalid();
  }
  let link: URL;
  try { link = new URL(data.link); } catch { throw new MailPayloadInvalid(); }
  const route = data.template === 'VERIFY_EMAIL' ? '/verificar-correo' : '/restablecer';
  if (link.origin !== origin || !['http:', 'https:'].includes(link.protocol) || link.username || link.password
    || link.pathname !== route || link.search || !/^#[A-Za-z0-9_-]{43}$/.test(link.hash)) {
    throw new MailPayloadInvalid();
  }
  return Object.freeze({ recipient: data.recipient, link: data.link, template: data.template as MailTemplate });
}
