/** Capacidad pública requerida por mail y proporcionada por el adaptador de identidad. */
export interface DeliveryEligibility {
  check(tokenId: string): Promise<'ELIGIBLE' | 'EXPIRED' | 'OBSOLETE'>;
}

/** Sobre persistible que los productores preparan con el adaptador de cifrado. */
export interface EncryptedMailPayload {
  readonly encryptedPayload: Uint8Array;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly keyId: string;
}
