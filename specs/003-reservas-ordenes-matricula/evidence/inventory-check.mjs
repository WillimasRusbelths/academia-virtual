import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Control documental de T001. Solo lee: no regenera evidencia ni opera servicios.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const feature = 'specs/003-reservas-ordenes-matricula';
const absolute = p => path.resolve(root, p);
const read = p => fs.readFileSync(absolute(p), 'utf8').replace(/^\uFEFF/, '');
const json = p => JSON.parse(read(p));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(absolute(p))).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const inventory = json(`${feature}/evidence/inventory.json`);
const taskPath = `${feature}/tasks.md`;
const normalized = text => text.replace(/\r\n/g, '\n');

assert.equal(git(['rev-parse', 'HEAD']), inventory.base.commit, 'La base Git cambió; este control corresponde al checkpoint T001.');
assert.equal(git(['branch', '--show-current']), inventory.base.branch);
assert.equal(git(['rev-parse', 'feat/002-oferta-academica']), inventory.base.academicOfferingHead);
const trackedPaths = git(['ls-files', '-z']).split('\0').filter(Boolean).sort();
assert.deepEqual(trackedPaths, inventory.tracked.map(f => f.path));
assert.equal(inventory.tracked.length, inventory.base.trackedCount);
for (const file of inventory.tracked) {
  assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'));
  if (file.path !== taskPath) assert.equal(sha(file.path), file.sha256, `Cambio fuera de T001: ${file.path}`);
}
const before = normalized(git(['show', `${inventory.base.commit}:${taskPath}`]));
const after = normalized(read(taskPath)).trimEnd();
assert.equal(after, before
  .replace('**Estado**: 94 tareas previstas, todas pendientes; cero implementación o pruebas de producto por generarlas.',
    '**Estado**: 94 tareas previstas; T001 completada y 93 pendientes. Inventario documental verificado; sin implementación funcional ni pruebas de producto ejecutadas.')
  .replace('- [ ] T001 ', '- [X] T001 '));
const taskLines = after.split('\n').filter(line => /^- \[[ xX]\] T\d{3} /.test(line));
assert.equal(taskLines.length, 94);
assert.deepEqual(taskLines.filter(line => /^- \[[xX]\]/.test(line)).map(line => line.match(/T\d{3}/)[0]), ['T001']);
const checklist = read(inventory.checklist.path);
assert.equal((checklist.match(/^- \[[xX]\]/gm) || []).length, 12);
assert.equal((checklist.match(/^- \[ \]/gm) || []).length, 4);
assert.equal((read(`${feature}/spec.md`).match(/^- Q: /gm) || []).length, 15);
const migrations = inventory.tracked.filter(f => /^apps\/api\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(f.path));
assert.equal(migrations.length, 5);
assert.deepEqual(inventory.migrations, migrations);
for (const file of [...inventory.publicSurfaces, ...inventory.plannedContracts]) {
  assert.equal(sha(file.path), file.sha256);
}
for (const record of inventory.scripts) assert.deepEqual(json(record.path).scripts, record.scripts);
for (const [file, pending, complete] of [
  ['specs/001-identidad-acceso-roles/tasks.md', ['T104', 'T108'], ['T103']],
  ['specs/002-oferta-academica/tasks.md', ['T073', 'T074'], []],
]) {
  for (const id of pending) assert.match(read(file), new RegExp(`^- \\[ \\] ${id} `, 'm'));
  for (const id of complete) assert.match(read(file), new RegExp(`^- \\[[xX]\\] ${id} `, 'm'));
}
assert.equal(fs.existsSync(absolute('.specify/extensions.yml')), inventory.prerequisites.hooksFilePresent);
const changed = git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean);
const staged = git(['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean);
const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
for (const p of [...changed, ...staged, ...untracked]) assert.ok(inventory.allowedChanges.includes(p), `Archivo fuera del alcance: ${p}`);
for (const p of inventory.allowedChanges) assert.ok(fs.existsSync(absolute(p)), `Falta artefacto: ${p}`);
for (const p of ['.cache/reservas-t001/capture.mjs', inventory.privateManifest.path]) {
  assert.ok(git(['check-ignore', p]), 'La evidencia privada debe estar ignorada.');
}
let privateVerified = 0;
if (fs.existsSync(absolute(inventory.privateManifest.path))) {
  const manifest = json(inventory.privateManifest.path);
  assert.equal(manifest.baseCommit, inventory.base.commit);
  assert.equal(manifest.files.length, inventory.privateManifest.total);
  for (const file of manifest.files) {
    // No imprimir rutas ni huellas privadas incluso al fallar.
    assert.ok(sha(file.path) === file.sha256, 'Cambió un archivo protegido privado.');
    privateVerified++;
  }
} else {
  assert.ok(!process.argv.includes('--require-private'), 'Falta manifiesto privado; no se acredita preservación privada en este equipo.');
}
execFileSync('git', ['diff', '--check'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
console.log(JSON.stringify({ task: 'T001', result: 'PASS', baseCommit: inventory.base.commit,
  trackedBaseline: inventory.tracked.length, trackedUnchanged: inventory.tracked.length - 1,
  historicalProtected: inventory.privateManifest.historicalCount, privateVerified,
  privateStatus: privateVerified ? 'VERIFICADO' : 'NO_DISPONIBLE', migrations: migrations.length,
  checklist: '12/16 conservado', clarifications: 15, completed: ['T001'], pending: 93,
  whitespaceErrors: 0, productTestsExecuted: 0, servicesOperated: false }));
