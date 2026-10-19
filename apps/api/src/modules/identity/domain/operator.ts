export class InvalidOperatorRef extends Error {
  readonly code='VALIDATION_ERROR';
  constructor(){super('Referencia de operador no válida.');}
}
export function requireOperatorRef(value:unknown):string {
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value))throw new InvalidOperatorRef();
  return value;
}
