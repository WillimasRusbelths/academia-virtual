import type { SessionRepository } from '../../authorization/public/session.js';

export const LOGOUT=Symbol('Logout');
export class Logout {
  constructor(private readonly sessions:Pick<SessionRepository,'revoke'>){}
  async execute(secret:string|null):Promise<void> {if(secret!==null)await this.sessions.revoke(secret);}
}
