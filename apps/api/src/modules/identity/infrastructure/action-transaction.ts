import type { Pool,PoolClient } from 'pg';
import { ActionLinkUnavailable } from '../application/issue-action-link.js';
import { accountTransaction } from '../../../infrastructure/database/account-transaction.js';

/** Solo conflictos abortados y rollback confirmado se reintentan; un commit ambiguo no. */
export function actionTransaction<T>(pool:Pool,operation:(client:PoolClient)=>Promise<T>):Promise<T> {
  return accountTransaction(pool,operation,()=>new ActionLinkUnavailable(),()=>false);
}
