import type { PoolClient } from 'pg';
import { isAccountId } from '../public/account.js';
import { ClassAuthorsInvalid, ClassAuthorsUnavailable } from '../public/class-authors.js';
import type { ClassAuthor, ClassAuthors, ClassAuthorsScope } from '../public/class-authors.js';

/** Transaction-scoped projection by authorized references, never a directory.
 * Only users reads User, with an explicit minimal select and output mapping. */
export function createClassAuthors(client: PoolClient, scope: ClassAuthorsScope): ClassAuthors {
  return Object.freeze({ async byIds(authorIds: readonly string[]) {
    if (!Array.isArray(authorIds) || Array.from(authorIds).some(id => !isAccountId(id))) throw new ClassAuthorsInvalid();
    const ids = Object.freeze([...new Set(authorIds)].sort());
    scope.assertReferences(ids);
    return scope.use(async () => {
      if (!ids.length) return Object.freeze([]);
      try {
        const rows = (await client.query<ClassAuthor>('SELECT id,name,role FROM "User" WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows;
        return Object.freeze(rows.map(row => Object.freeze({ id: row.id, name: row.name, role: row.role })));
      } catch { throw new ClassAuthorsUnavailable(); }
    });
  } });
}
