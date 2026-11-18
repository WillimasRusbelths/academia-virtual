import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {extractRequirementReferences} from './task-references.mjs';

const write = process.argv.includes('--write');
if (process.argv.slice(2).some(arg => arg !== '--write')) throw new Error('Uso: node ops/specs/validate-005-tasks.mjs [--write]');
const dir = 'specs/005-clases-chat/';
const base = '460768330babb5f0a1f077f221d8f6ad8883633c';
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const git = (...args) => execFileSync('git', args, {encoding: 'utf8', windowsHide: true}).trim();
const checks = [];
const check = (name, pass, detail) => checks.push({name, pass, ...(detail === undefined ? {} : {detail})});
const hash = file => createHash('sha256').update(read(file)).digest('hex');

// Casos de regresión del fallo de cobertura; no son pruebas funcionales del producto.
const examples = [
  ['FR-008/009', ['FR-008', 'FR-009']],
  ['FR-002/005–FR-007/017', ['FR-002', 'FR-005', 'FR-006', 'FR-007', 'FR-017']],
  ['FR-001–004/013/018', ['FR-001', 'FR-002', 'FR-003', 'FR-004', 'FR-013', 'FR-018']],
  ['SC-001/002/004/005', ['SC-001', 'SC-002', 'SC-004', 'SC-005']],
  ['FR-008/009/SC-002/003/007', ['FR-008', 'FR-009', 'SC-002', 'SC-003', 'SC-007']],
  ['FR-019; FR-019; SC-007', ['FR-019', 'SC-007']],
  ['US1.1 y Q16, T021', []],
];
for (const [input, expected] of examples) assert.deepEqual(extractRequirementReferences(input), expected);
for (const input of ['FR-009–FR-008', 'FR-008–SC-009', 'SC-000']) assert.throws(() => extractRequirementReferences(input));
check('regresion-parser-10-casos', true);

const spec = read(dir + 'spec.md');
const tasksText = read(dir + 'tasks.md');
const requirements = [...spec.matchAll(/^- \*\*((?:FR|SC)-\d{3})\*\*/gm)].map(match => match[1]);
const tasks = []; let phase = 0;
for (const [index, line] of tasksText.split('\n').entries()) {
  const heading = /^## Fase (\d+)/.exec(line); if (heading) phase = Number(heading[1]);
  if (!/^- \[[ xX]\] T/.test(line)) continue;
  const match = /^- \[([ xX])\] (T\d{3})(?: (\[P\]))?(?: \[(US\d)\])? (.+)$/.exec(line);
  if (!match) throw new Error('Formato inválido en línea ' + (index + 1));
  const dependencies = new Set();
  // El punto y coma separa prerrequisitos de notas sobre tareas aún pendientes.
  const after = (match[5].split('Tras ')[1] ?? '').split(';')[0];
  for (const part of after.matchAll(/T(\d{3})(?:[–-]T(\d{3}))?/g)) {
    for (let n = Number(part[1]); n <= Number(part[2] ?? part[1]); n++) dependencies.add('T' + String(n).padStart(3, '0'));
  }
  tasks.push({id: match[2], completed: match[1] !== ' ', parallel: !!match[3], story: match[4] ?? null,
    phase, line: index + 1, text: match[5], dependencies: [...dependencies], references: extractRequirementReferences(match[5])});
}
check('86-tareas-no-completadas', tasks.length === 86 && tasks.every(task => !task.completed));
check('ids-unicos-secuenciales', tasks.every((task, index) => task.id === 'T' + String(index + 1).padStart(3, '0')));
check('rutas-concretas', tasks.every(task => /`(?:apps|specs|ops|load-tests|\.github)\//.test(task.text)));
check('etiquetas-por-fase', tasks.every(task => task.story === ({3: 'US1', 4: 'US2', 5: 'US3', 6: 'US4'}[task.phase] ?? null)));
const ids = new Set(tasks.map(task => task.id));
check('dependencias-previas-validas', tasks.every(task => (task.id === 'T001' || task.dependencies.length > 0)
  && task.dependencies.every(dep => ids.has(dep) && dep < task.id)));
const deps = id => tasks.find(task => task.id === id)?.dependencies ?? [];
check('T084-no-espera-humanos', ['T076', 'T077', 'T078', 'T079'].every(id => deps('T084').includes(id))
  && !['T080', 'T081', 'T082', 'T083'].some(id => deps('T084').includes(id)));
check('T085-permite-preliminar', deps('T085').length === 1 && deps('T085')[0] === 'T084');
check('T086-sigue-exigiendo-humanos-y-puertas', ['T040', 'T078', 'T080', 'T081', 'T082', 'T083', 'T084', 'T085'].every(id => deps('T086').includes(id)));
check('bloqueos-video-conservados', ['T035', 'T039', 'T040', 'T086'].every(id => tasks.find(task => task.id === id)?.text.includes('BLOQUEADA')));
const byRequirement = Object.fromEntries(requirements.map(key => [key, tasks.filter(task => task.references.includes(key)).map(task => task.id)]));
check('31-requisitos-con-asociacion', requirements.length === 31 && Object.values(byRequirement).every(list => list.length));
check('sin-referencias-desconocidas', tasks.every(task => task.references.every(key => requirements.includes(key))));
check('sin-tareas-huerfanas', tasks.every(task => task.references.some(key => key.startsWith('FR-'))));
check('regresion-FR009-FR017-FR021', byRequirement['FR-009'].includes('T039')
  && byRequirement['FR-017'].includes('T067') && byRequirement['FR-021'].includes('T025'));
const priorSpec = git('show', base + ':' + dir + 'spec.md').replace(/\r\n/g, '\n');
check('cuerpo-funcional-spec-vigente-preservado', spec.slice(spec.indexOf('**Input**')).trim() === priorSpec.slice(priorSpec.indexOf('**Input**')).trim());
const scope = {stories: (spec.match(/^### User Story /gm) ?? []).length,
  scenarios: (spec.match(/^\d+\. \*\*Given\*\*/gm) ?? []).length,
  requirements: (spec.match(/^- \*\*FR-\d{3}\*\*/gm) ?? []).length,
  criteria: (spec.match(/^- \*\*SC-\d{3}\*\*/gm) ?? []).length};
check('alcance-vigente-4-24-23-8', JSON.stringify(scope) === JSON.stringify({stories: 4, scenarios: 24, requirements: 23, criteria: 8}));
check('constitucion-y-evidencias-previas-intactas', git('diff', '--name-only', base, '--', '.specify/memory/constitution.md',
  dir + 'evidence/tasks-generation-results.json', dir + 'evidence/tasks-generation-report.md', dir + 'evidence/planning-review.json') === '');
check('propuesta-no-adoptada', read(dir + 'evidence/video-scope-proposal.md').includes('PROPUESTA PREPARADA, NO ADOPTADA')
  && read(dir + 'video-gate.md').includes('NO PASADO'));
check('cloudflare-fuera-del-mvp', tasksText.includes('Cloudflare queda fuera del MVP (V04)'));
check('puntero-y-rama-005', JSON.parse(read('.specify/feature.json')).feature_directory === 'specs/005-clases-chat'
  && git('branch', '--show-current') === 'feat/005-clases-chat');
const changed = [...new Set([...git('diff', '--name-only', base).split(/\r?\n/), ...git('ls-files', '--others', '--exclude-standard').split(/\r?\n/)].filter(Boolean))];
check('cambios-limitados-a-correccion', changed.every(file => file.startsWith(dir) || ['ops/specs/task-references.mjs', 'ops/specs/validate-005-tasks.mjs'].includes(file)), changed);
const previous = JSON.parse(read(dir + 'evidence/tasks-generation-results.json'));
const restoredAssociations = Object.fromEntries(requirements.map(key => [key, byRequirement[key].filter(id => !(previous.coverage[key] ?? []).includes(id))]));
const index = {date: '2026-11-17', timezone: 'America/Lima', baseline: base, status: 'INDICE_ACTUAL_CORREGIDO',
  totalTasks: tasks.length, completedTasks: 0, scope, coverageMeaning: 'asociación documental, incluidas tareas bloqueadas; no es implementación o aceptación',
  byRequirement, byTask: Object.fromEntries(tasks.map(task => [task.id, task.references])),
  restoredAssociationCount: Object.values(restoredAssociations).reduce((count, values) => count + values.length, 0),
  historicalIndexPreserved: dir + 'evidence/tasks-generation-results.json', tasksSha256: hash(dir + 'tasks.md'),
  hashNormalization: 'UTF-8 con LF; CRLF normalizado',
  generator: 'node ops/specs/validate-005-tasks.mjs --write'};
if (write) fs.writeFileSync(dir + 'evidence/tasks-coverage.json', JSON.stringify(index, null, 2) + '\n');
check('indice-actual-coincide', fs.existsSync(dir + 'evidence/tasks-coverage.json')
  && read(dir + 'evidence/tasks-coverage.json').trim() === JSON.stringify(index, null, 2));
const broken = []; let localLinks = 0;
for (const file of [dir + 'tasks.md', dir + 'spec.md', dir + 'plan.md', dir + 'video-gate.md',
  dir + 'evidence/video-scope-proposal.md', dir + 'evidence/tasks-corrections-report.md']) {
  for (const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(match[1])) continue;
    localLinks++;
    const target = path.resolve(path.dirname(file), match[1].split('#')[0]);
    if (!fs.existsSync(target) && !(write && target === path.resolve(dir + 'evidence/tasks-corrections-results.json'))) broken.push({file, target: match[1]});
  }
}
check('enlaces-locales', broken.length === 0, {count: localLinks, broken});
const result = {date: '2026-11-17', timezone: 'America/Lima', baseline: base,
  status: checks.every(item => item.pass) ? 'I1_I2_CORREGIDOS_C1_PROPUESTA_PENDIENTE' : 'VALIDACION_FALLIDA',
  findings: {I1: 'CORREGIDO', I2: 'CORREGIDO', C1: 'PROPUESTA_PREPARADA_NO_ADOPTADA'},
  implementationPerformed: false, productTestsExecuted: false, constitutionAmended: false, videoGate: 'NO_PASADO',
  totalTasks: tasks.length, completedTasks: 0, proposal: dir + 'evidence/video-scope-proposal.md',
  restoredAssociations, coverageIndex: dir + 'evidence/tasks-coverage.json',
  parserRegressionCases: 10, validationPassed: checks.every(item => item.pass), checks,
  hashes: Object.fromEntries([dir + 'tasks.md', dir + 'evidence/video-scope-proposal.md', 'ops/specs/task-references.mjs',
    'ops/specs/validate-005-tasks.mjs', dir + 'evidence/tasks-generation-results.json'].map(file => [file, hash(file)]))};
if (write) fs.writeFileSync(dir + 'evidence/tasks-corrections-results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({validationPassed: result.validationPassed, status: result.status, totalTasks: tasks.length,
  requirementsWithTask: Object.keys(byRequirement).length, restoredAssociations: index.restoredAssociationCount,
  parserRegressionCases: 10, structuralChecks: checks.length, localLinks, failed: checks.filter(item => !item.pass)}, null, 2));
if (!result.validationPassed) process.exitCode = 1;
