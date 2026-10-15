import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, Linter } from 'eslint';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import boundaries from '../../../../ops/lint/import-boundaries.mjs';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
const normalize = (value: string) => value.replaceAll('\\', '/');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name))
    : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path.join(directory, entry.name)] : []);
}
const sources = files(root);
const imports = new Map(sources.map(filename => {
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const dependencies: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)) dependencies.push(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      dependencies.push(node.argument.literal.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) dependencies.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [filename, dependencies] as const;
}));
const local = (filename: string) => (imports.get(filename) ?? []).filter(value => value.startsWith('.'))
  .map(value => path.resolve(path.dirname(filename), value.replace(/\.js$/, '.ts')));
const relative = (filename: string) => normalize(path.relative(root, filename));

describe('VA: dependencias del código real', () => {
  test('todas las capas cumplen ESLint, incluido guard y superficies públicas', async () => {
    const eslint = new ESLint({ cwd: path.resolve(root, '..') });
    const results = await eslint.lintFiles([path.join(root, '**/*.ts')]);
    expect(results.flatMap(result => result.messages.filter(message => message.severity === 2)
      .map(message => `${relative(result.filePath)}:${message.line} ${message.ruleId}`))).toEqual([]);
  });

  test('el cierre transitivo del núcleo no alcanza IO, composición ni DTO HTTP', () => {
    const violations: string[] = [];
    const core = /modules\/[^/]+\/(application|domain|public)\//;
    for (const filename of sources.filter(value => core.test(relative(value)))) {
      const visited = new Set<string>();
      function walk(current: string) {
        if (visited.has(current)) return;
        visited.add(current);
        for (const imported of imports.get(current) ?? []) {
          if (!imported.startsWith('.')) violations.push(`${relative(filename)} -> ${imported}`);
        }
        for (const target of local(current)) {
          if (!imports.has(target) || !core.test(relative(target))) violations.push(`${relative(filename)} -> ${relative(target)}`);
          else walk(target);
        }
      }
      walk(filename);
    }
    expect(violations).toEqual([]);
  });

  test('el grafo de archivos y las raíces de composición no tienen ciclos', () => {
    const active = new Set<string>(); const done = new Set<string>(); const cycles: string[] = [];
    function visit(filename: string, trail: string[]) {
      if (active.has(filename)) { cycles.push([...trail, filename].map(relative).join(' -> ')); return; }
      if (done.has(filename)) return;
      active.add(filename);
      for (const dependency of local(filename)) if (imports.has(dependency)) visit(dependency, [...trail, filename]);
      active.delete(filename); done.add(filename);
    }
    for (const filename of sources) visit(filename, []);
    expect(cycles).toEqual([]);
  });

  test('HTTP y CLI consumen aplicación; no comparten reglas a través de entradas', () => {
    const controllers = sources.filter(filename => filename.endsWith('.controller.ts') && relative(filename).startsWith('modules/'));
    expect(controllers.length).toBeGreaterThan(0);
    for (const controller of controllers) {
      expect(local(controller).some(target => relative(target).includes('/application/'))).toBe(true);
      expect(local(controller).some(target => /\/(infrastructure|cli)\//.test(relative(target)))).toBe(false);
    }
    const bootstrap = path.join(root, 'cli/bootstrap-admin.ts');
    expect(local(bootstrap).map(relative)).toContain('modules/identity/application/bootstrap-admin.ts');
    expect(local(bootstrap).map(relative)).toContain('modules/identity/application/issue-action-link.ts');
    expect(local(bootstrap).some(target => /entrypoints|\.controller\.ts$/.test(target))).toBe(false);
  });

  test('las barreras rechazan escapes reales que el patrón de carpetas no cubría', () => {
    const cases = [
      ['identity/domain/rule.ts', "import '../../../../http/transport.js';"],
      ['identity/application/use-case.ts', "import '../identity.module.js';"],
      ['identity/application/use-case.ts', "export * from '../../../../infrastructure/config/environment.js';"],
      ['authorization/entrypoints/http/guard.ts', "import '../../../../infrastructure/database/database.js';"],
      ['identity/public/access.ts', "export * from '../infrastructure/session-store.js';"],
    ];
    const linter = new Linter();
    for (const [filename, code] of cases) {
      const messages = linter.verify(code, [{ files: ['**/*.ts'], plugins: { architecture: boundaries },
        rules: { 'architecture/api-layers': 'error' } }], { filename: `apps/api/src/modules/${filename}` });
      expect(messages.some(message => message.ruleId === 'architecture/api-layers')).toBe(true);
    }
  });
});
