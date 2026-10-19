import { requireOperatorRef } from '../domain/operator.js';

export interface RestoredStateCounts { sessions:number; tokens:number; mail:number }
export interface RestoredState { invalidate():Promise<RestoredStateCounts> }

/** Operación global de mantenimiento; requiere escritores detenidos por el operador. */
export class InvalidateRestoredState {
  constructor(private readonly state:RestoredState) {}
  async execute(operatorRef:unknown):Promise<RestoredStateCounts> {
    requireOperatorRef(operatorRef);
    return this.state.invalidate();
  }
}
