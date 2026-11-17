/// <reference types="vite/client" />
import { expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { SessionActor, Permission } from '../../src/modules/authorization/public/session.js';
import type { AdminCourse, CommandResult, CourseState } from '../../src/modules/academic-offering/public/offer.js';

/** Puerto de conformidad de pruebas, NO implementación ni interfaz pública de producto.
 * Los callbacks solo mutan agregados ficticios. Al incorporar T013/T014 se conectarán
 * aquí sus capacidades reales, sin cambiar expectativas ni crear endpoints de ensayo.
 */
export interface Topology {
  accountIds: readonly string[];
  courseIds: readonly string[];
  groupIds: readonly string[];
}
export interface AuthorizationDependency {
  revalidateInTransaction(client: PoolClient, actor: SessionActor, permission: Permission): Promise<void>;
}
export interface TransactionWork<T> {
  actor: SessionActor;
  permission: Permission;
  discover(client: PoolClient): Promise<Topology>;
  recheck(client: PoolClient, locked: Topology): Promise<Topology>;
  apply(client: PoolClient): Promise<T>;
}
export type TransactionTarget = <T>(work: TransactionWork<T>) => Promise<T>;
export interface FixtureMutation {
  resource: AdminCourse;
  result: 'APPLIED' | 'NO_CHANGE';
  beforeState: CourseState;
  beforeRevision: string;
}
export interface CommandWork extends TransactionWork<FixtureMutation> {
  commandId: string;
  requestId: string;
  operation: 'COURSE_EDIT' | 'COURSE_PUBLISH';
  targetKind: 'COURSE';
  targetId: string;
  expectedRevision: string;
  payload: Readonly<Record<string, unknown>>;
  project(client: PoolClient): Promise<AdminCourse>;
}
export type CommandTarget = (work: CommandWork) => Promise<CommandResult<AdminCourse>>;
interface TransactionExports {
  createAcademicTransaction?: (pool: Pool, authorization: AuthorizationDependency) => TransactionTarget;
}
interface CommandExports {
  createAcademicCommandWriter?: (pool: Pool, authorization: AuthorizationDependency,
    options?: { audit?: { write(client: PoolClient, event: unknown): Promise<void> } }) => CommandTarget;
}

// Globs literales: no import estático a archivo inexistente, catch de imports,
// fallback que simule éxito, test.skip o test.fails. Un módulo inválido sí falla.
const transactions = import.meta.glob<TransactionExports>('../../src/infrastructure/database/academic-transaction.ts', { eager: true });
const commands = import.meta.glob<CommandExports>('../../src/modules/academic-offering/infrastructure/offering-store.ts', { eager: true });
export function transactionTarget(pool: Pool, authorization: AuthorizationDependency): TransactionTarget {
  const factory = Object.values(transactions)[0]?.createAcademicTransaction;
  expect(factory, 'T013 pendiente: capacidad académica transaccional ausente; no es error de import/conexión').toBeTypeOf('function');
  return factory!(pool, authorization);
}
export function commandTarget(pool: Pool, authorization: AuthorizationDependency,
  options?: Parameters<NonNullable<CommandExports['createAcademicCommandWriter']>>[2]): CommandTarget {
  const factory = Object.values(commands)[0]?.createAcademicCommandWriter;
  expect(factory, 'T014 pendiente: escritor académico de comandos ausente; no es error de import/conexión').toBeTypeOf('function');
  return factory!(pool, authorization, options);
}

/** Decorar conexiones reales, sin pool nuevo ni SQL/credenciales en el informe.
 * before/after permiten fallos de transporte deterministas, no falsear resultados SQL.
 */
export function instrumentPool(pool: Pool, hooks: {
  before?(sql: string, pid: number): void | Promise<void>;
  after?(sql: string, pid: number): void | Promise<void>;
} = {}) {
  const statements: { sql: string; pid: number }[] = [];
  const pids: number[] = []; const releases: boolean[] = [];
  const decorated = new Proxy(pool, { get(target, property) {
    if (property === 'connect') return async () => {
      const client = await target.connect();
      const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pids.push(pid);
      return new Proxy(client, { get(connection, member) {
        if (member === 'query') return async (sql: string, values?: unknown[]) => {
          statements.push({ sql, pid }); await hooks.before?.(sql, pid);
          const result = await connection.query(sql, values); await hooks.after?.(sql, pid); return result;
        };
        if (member === 'release') return (broken = false) => { releases.push(broken); connection.release(broken); };
        const value: unknown = Reflect.get(connection, member);
        return typeof value === 'function' ? value.bind(connection) : value;
      } });
    };
    const value: unknown = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { pool: decorated, statements, pids, releases };
}

export function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
