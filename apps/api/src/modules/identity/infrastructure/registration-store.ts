import type { Pool } from 'pg';
import type { RegistrationStore } from '../application/register-student.js';
import type { ActionLinkAccount,ActionLinkAdmission } from '../application/issue-action-link.js';
import { persistActionLink } from './action-token-store.js';
import { actionTransaction } from './action-transaction.js';

export class PostgresRegistrationStore implements RegistrationStore {
  constructor(private readonly pool:Pool){}
  create(input:Parameters<RegistrationStore['create']>[0],admission:ActionLinkAdmission):Promise<void> {
    return actionTransaction(this.pool,async client=>{
      const now=(await client.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0].now;
      const account=(await client.query<ActionLinkAccount>(`INSERT INTO "User"
        (name,email,"emailCanonical",role,status,"passwordHash","mustSetPassword","createdAt","updatedAt")
        VALUES ($1,$2,$3,'STUDENT','ACTIVE',$4,false,$5,$5) ON CONFLICT ("emailCanonical") DO NOTHING
        RETURNING id,email,"emailCanonical",status,"emailVerifiedAt"`,[input.name,input.email,input.emailCanonical,input.passwordHash,now])).rows[0];
      // Insertar no modifica una cuenta existente; tampoco genera otro enlace para ella.
      if(account && admission.allowed){
        const prepared=admission.prepare(account,now);
        if(!prepared)throw new Error('Preparación de alta no disponible. Valores omitidos.');
        await persistActionLink(client,account,prepared,now);
      }
    });
  }
}
