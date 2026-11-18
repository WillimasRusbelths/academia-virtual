import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { classesFixture, type ClassesFixture } from '../support/classes.js';
import { createClassAuthors } from '../../src/modules/users/infrastructure/class-authors.js';
import type { ClassAuthors, ClassAuthorsScope } from '../../src/modules/users/public/class-authors.js';

let f: ClassesFixture;
beforeAll(async () => { f = await classesFixture(); }, 120000);
afterAll(async () => { await f?.cleanup(); });
async function run<T>(ids: readonly string[], apply: (value: ClassAuthors, client: PoolClient) => Promise<T>) {
  const client = await f.pool.connect(); let active = true;
  const allowed = new Set(ids);
  const scope: ClassAuthorsScope = {
    assertReferences(requested) { if (!active || requested.some(id => !allowed.has(id))) throw new Error('Unauthorized author references'); },
    async use(operation) { if (!active) throw new Error('Expired authors scope'); return operation(); },
  };
  try { await client.query('BEGIN'); return await apply(createClassAuthors(client, scope), client); }
  finally { active = false; await client.query('ROLLBACK'); client.release(); }
}
test('solo id/name/role actuales para autores referenciados, sin correo/estado/credenciales o roster', async () => {
  const ids = [f.student.userId, f.teacher.userId, f.admin.userId];
  await run(ids, async value => {
    const rows = await value.byIds([...ids, f.student.userId]);
    expect(rows.map(r => r.id)).toEqual([...ids].sort());
    expect(rows.map(r => r.role).sort()).toEqual(['ADMIN', 'STUDENT', 'TEACHER']);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['id', 'name', 'role']);
    expect(Object.isFrozen(rows)).toBe(true); expect(rows.every(Object.isFrozen)).toBe(true);
    const json = JSON.stringify(rows);
    expect(json).not.toMatch(/email|password|status|authVersion|provisional|tokenHash|example\.test/i);
  });
});
test('cambio no confirmado de nombre/rol se ve solo por la conexión titular', async () => {
  await run([f.student.userId], async (value, client) => {
    await client.query(`UPDATE "User" SET name='Autor actualizado ficticio',role='TEACHER' WHERE id=$1`, [f.student.userId]);
    expect(await value.byIds([f.student.userId])).toEqual([{ id: f.student.userId, name: 'Autor actualizado ficticio', role: 'TEACHER' }]);
    expect((await f.pool.query('SELECT name,role FROM "User" WHERE id=$1', [f.student.userId])).rows[0]).toMatchObject({ role: 'STUDENT' });
  });
});
test('sin referencia autorizada no se consulta cuenta ajena; lote vacío no enumera usuarios', async () => {
  await run([f.student.userId], async (value, client) => {
    const query = vi.spyOn(client, 'query');
    try {
      await expect(value.byIds([f.unEnrolledStudent.userId])).rejects.toThrow('Unauthorized author references');
      expect(await value.byIds([])).toEqual([]); expect(query).not.toHaveBeenCalled();
    } finally { query.mockRestore(); }
  });
});
test('referencias inexistentes no producen otras cuentas y entradas inválidas fallan antes de SQL', async () => {
  const unknown = randomUUID();
  await run([unknown], async (value, client) => {
    expect(await value.byIds([unknown])).toEqual([]);
    const query = vi.spyOn(client, 'query');
    try {
      for (const input of [['not-an-id'], [f.student.userId, null], new Array(1), null, f.student.userId])
        await expect(value.byIds(input as unknown as readonly string[])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(query).not.toHaveBeenCalled();
    } finally { query.mockRestore(); }
  });
});
test('capacidad de autores expira al cerrar la transacción, incluso con lote vacío', async () => {
  let leaked: ClassAuthors | undefined;
  await run([f.student.userId], async value => { leaked = value; });
  await expect(leaked!.byIds([f.student.userId])).rejects.toThrow('Unauthorized author references');
  await expect(leaked!.byIds([])).rejects.toThrow('Unauthorized author references');
});
test('consulta parametrizada mínima; sin locks ni BEGIN propio y fallo BD con mensaje seguro', async () => {
  await run([f.student.userId], async (value, client) => {
    const query = vi.spyOn(client, 'query');
    try {
      await value.byIds([f.student.userId]);
      expect(query.mock.calls).toHaveLength(1);
      expect(String(query.mock.calls[0][0])).toMatch(/SELECT id,name,role FROM "User" WHERE id=ANY/);
      expect(String(query.mock.calls[0][0])).not.toMatch(/SELECT \*|FOR UPDATE|FOR SHARE|BEGIN|COMMIT|email|status/i);
      query.mockRejectedValueOnce(new Error('synthetic private database details'));
      await expect(value.byIds([f.student.userId])).rejects.toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE', message: 'Autores temporalmente no disponibles.' });
    } finally { query.mockRestore(); }
  });
});
