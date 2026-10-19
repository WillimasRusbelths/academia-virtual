import { AuthorizationFailure, permits } from '../../authorization/public/session.js';
import type { SessionActor } from '../../authorization/public/session.js';
import { requireUserId, UserNotFound } from './list-users.js';
import type { AdministrativeUserQueries } from './list-users.js';

export const GET_USER=Symbol('GetUser');
export class GetUser {
  constructor(private readonly queries:AdministrativeUserQueries){}
  async execute(actor:SessionActor,id:string) {
    if(!permits(actor.role,'users:manage'))throw new AuthorizationFailure('FORBIDDEN');
    const view=await this.queries.get(actor,requireUserId(id));
    if(!view)throw new UserNotFound();return view;
  }
}
