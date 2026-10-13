/** Capacidad pública requerida por mail y proporcionada por el adaptador de identidad. */
export interface DeliveryEligibility {
  check(tokenId: string): Promise<'ELIGIBLE' | 'EXPIRED' | 'OBSOLETE'>;
}
