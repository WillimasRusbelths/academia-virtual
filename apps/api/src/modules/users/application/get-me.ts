import { AuthorizationFailure } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import type { UserView } from '../public/account.js';

export const GET_ME=Symbol('GetMe');
export interface UserQueries {getOwn(actor:SessionActor):Promise<UserView|null>}
export class UserReadUnavailable extends Error {
  readonly code='TEMPORARILY_UNAVAILABLE';
  constructor(){super('La consulta no pudo completarse. Detalles omitidos.');}
}
export class GetMe {
  constructor(private readonly queries:UserQueries){}
  async execute(actor:SessionActor):Promise<UserView> {
    const view=await this.queries.getOwn(actor);
    if(!view)throw new AuthorizationFailure('AUTH_REQUIRED');
    return view;
  }
}
