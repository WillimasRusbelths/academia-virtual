import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { test, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/probe/client';
import { probeUrl } from '../../../../ops/local/compatibility/env.mjs';

test('Prisma desde Nest usa rol restringido y rollback real, con cierre del pool', async () => {
  const connectionString = probeUrl();
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) });
  const module = await Test.createTestingModule({ providers: [{ provide: PrismaClient, useValue: client }] }).compile();
  const db = module.get(PrismaClient);
  let stage = 'conexión';
  try {
    await db.$connect();
    stage = 'atributos del rol';
    const [role] = await db.$queryRaw<Array<{rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean;rolbypassrls:boolean}>>`
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false});
    stage = 'aislamiento de esquema y bases';
    const [privilege] = await db.$queryRaw<Array<{can_create:boolean;can_dev:boolean}>>`
      SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
      has_database_privilege(current_user, 'academia_dev', 'CONNECT') AS can_dev`;
    expect(privilege).toEqual({can_create:false,can_dev:false});
    stage = 'escritura y lectura transaccional';
    const id = randomUUID();
    const rollback = new Error('ROLLBACK_PROBE');
    await expect(db.$transaction(async tx => {
      await tx.compatibilityProbe.create({ data: { id, value: 'ensayo ficticio' } });
      expect((await tx.compatibilityProbe.findUniqueOrThrow({ where: { id } })).value).toBe('ensayo ficticio');
      stage = 'rollback solicitado';
      throw rollback;
    })).rejects.toBe(rollback);
    stage = 'ausencia de escritura tras rollback';
    expect(await db.compatibilityProbe.findUnique({ where: { id } })).toBeNull();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const safeCode = /^(P\d{4}|[0-9A-Z]{5})$/.test(code) ? ` (${code})` : '';
    // eslint-disable-next-line preserve-caught-error -- la causa del driver puede contener la URL privada
    throw new Error(`V00 PostgreSQL falló en ${stage}${safeCode}; detalles privados omitidos.`);
  } finally { await db.$disconnect(); await module.close(); }
});
