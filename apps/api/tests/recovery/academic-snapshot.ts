import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import type {createDatabase} from '../../src/infrastructure/database/database.js';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const save=(name:string,value:unknown)=>writeFileSync('/recovery-private/'+name+'.json',JSON.stringify(value),{mode:0o600});
// Comparación íntegra en destino ficticio; CHECK normalizado por PostgreSQL como V16.
export async function recoverySnapshot(database:ReturnType<typeof createDatabase>,schema:string){
  const counts:Record<string,string>={};
  for(const {table_name:table} of (await database.pool.query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name`,[schema])).rows)
    counts[table]=(await database.pool.query(`SELECT count(*) FROM "${table}"`)).rows[0].count;
  const data:Record<string,string>={};
  for(const table of Object.keys(counts)){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table))throw Error('Invalid fixture table');data[table]=digest((await database.pool.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows);}
  const users=digest((await database.pool.query('SELECT * FROM "User" ORDER BY id')).rows);
  const marker=digest((await database.pool.query('SELECT * FROM "SystemState"')).rows);
  const audit=digest((await database.pool.query('SELECT * FROM "AuditEvent" ORDER BY id')).rows);
  const constraints=(await database.pool.query(`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 ORDER BY c.relname,k.conname`,[schema])).rows;
  // pg_restore reparsa CHECK y aplana AND asociativos. Compara la expresión reescrita
  // por PostgreSQL, sin ejecutar filas ni quitar paréntesis indiscriminadamente.
  const client=await database.pool.connect();
  try {await client.query('BEGIN READ ONLY');await client.query('SET LOCAL enable_indexscan=off; SET LOCAL enable_bitmapscan=off; SET LOCAL enable_indexonlyscan=off');
    for(const constraint of constraints)if(constraint.definition.startsWith('CHECK ')){
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(constraint.relname))throw new Error('Tabla no permitida.');
      const plan=await client.query(`EXPLAIN (FORMAT JSON, VERBOSE, COSTS OFF) SELECT 1 FROM "${constraint.relname}" WHERE ${constraint.definition.slice(6)}`);
      constraint.definition=JSON.stringify(plan.rows[0]['QUERY PLAN']);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const columns=(await database.pool.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema=$1 ORDER BY table_name,ordinal_position`,[schema])).rows;
  const indexes=(await database.pool.query('SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname',[schema])).rows;
  const functions=(await database.pool.query(`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 ORDER BY p.proname`,[schema])).rows;
  const triggers=(await database.pool.query(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,[schema])).rows;
  const enums=(await database.pool.query(`SELECT t.typname,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 ORDER BY t.typname,e.enumsortorder`,[schema])).rows;
  const views=(await database.pool.query('SELECT viewname,definition FROM pg_views WHERE schemaname=$1 ORDER BY viewname',[schema])).rows;
  const grants=(await database.pool.query('SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema=$1 ORDER BY table_name,grantee,privilege_type',[schema])).rows;
  const catalog={constraints,columns,indexes,functions,triggers,enums,views,grants};
  save('catalog-'+new URL(database.pool.options.connectionString!).pathname.slice(1),catalog);
  return {counts,data,users,marker,audit,catalog:digest(catalog)};
}
