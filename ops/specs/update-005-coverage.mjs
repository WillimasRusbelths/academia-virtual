import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { extractRequirementReferences } from './task-references.mjs';

// Índice vigente: no modifica checkpoints de planificación/adopción anteriores.
const options = process.argv.slice(2);
if (options.some(option => option !== '--write') || options.length > 1) throw new Error('Opción admitida: --write');
const base = new URL('../../specs/005-clases-chat/', import.meta.url);
const source = readFileSync(new URL('tasks.md', base), 'utf8').replaceAll('\r\n', '\n');
const spec = readFileSync(new URL('spec.md', base), 'utf8');
const requirements = [...spec.matchAll(/^- \*\*((?:FR|SC)-\d{3})\*\*:/gm)].map(match => match[1]);
const tasks = [...source.matchAll(/^- \[([ xX])\] (T\d{3}) (.+)$/gm)];
assert.equal(tasks.length, 86);
assert.equal(requirements.length, 31);
const byRequirement = Object.fromEntries(requirements.map(id => [id, []]));
const byTask = {};
for (const [index, match] of tasks.entries()) {
  const id = match[2];
  assert.equal(id, `T${String(index + 1).padStart(3, '0')}`);
  const refs = extractRequirementReferences(match[3]);
  assert.ok(refs.length > 0, `${id} sin referencia`);
  byTask[id] = refs;
  for (const ref of refs) {
    assert.ok(byRequirement[ref], `${id}: requisito desconocido ${ref}`);
    byRequirement[ref].push(id);
  }
}
assert.ok(Object.values(byRequirement).every(ids => ids.length > 0));
const file = new URL('evidence/tasks-coverage.json', base);
const current = JSON.parse(readFileSync(file, 'utf8'));
const updated = { ...current, status: 'SEGUIMIENTO_DE_IMPLEMENTACION',
  totalTasks: tasks.length, completedTasks: tasks.filter(match => match[1].toLowerCase() === 'x').length,
  byRequirement, byTask, tasksSha256: createHash('sha256').update(source).digest('hex'),
  generator: 'node ops/specs/update-005-coverage.mjs --write' };
if (options.includes('--write')) writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
else {
  for (const key of ['totalTasks', 'completedTasks', 'byRequirement', 'byTask', 'tasksSha256']) {
    assert.deepEqual(current[key], updated[key], `Índice desactualizado: ${key}`);
  }
}
console.log(JSON.stringify({ totalTasks: updated.totalTasks, completedTasks: updated.completedTasks,
  requirementsWithTask: requirements.length, acceptance: 'No inferida desde el índice', written: options.includes('--write') }));
