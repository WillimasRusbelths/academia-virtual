import { Linter } from 'eslint';
import { describe, expect, test } from 'vitest';
import boundaries from '../../../../ops/lint/import-boundaries.mjs';

function messages(code: string, filename: string, rule: 'api-layers' | 'web-layers') {
  const linter = new Linter();
  return linter.verify(code, [{
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    plugins: { architecture: boundaries },
    rules: { [`architecture/${rule}`]: 'error' },
  }], { filename });
}

describe('límites del monolito modular', () => {
  test('dominio no importa Nest ni infraestructura', () => {
    const external = messages("import '@nestjs/common';", 'apps/api/src/modules/identity/domain/rule.ts', 'api-layers');
    const inward = messages("import '../infrastructure/store.js';", 'apps/api/src/modules/identity/domain/rule.ts', 'api-layers');
    expect(external.map(({ messageId }) => messageId)).toEqual(['external']);
    expect(inward.map(({ messageId }) => messageId)).toEqual(['layer']);
  });

  test('aplicación usa dominio y otro módulo solo por public', () => {
    expect(messages("import '../domain/rule.js';", 'apps/api/src/modules/identity/application/use-case.ts', 'api-layers')).toHaveLength(0);
    expect(messages("import '../../users/infrastructure/store.js';", 'apps/api/src/modules/identity/application/use-case.ts', 'api-layers')[0]?.messageId).toBe('module');
    expect(messages("import '../../users/public/profile.js';", 'apps/api/src/modules/identity/application/use-case.ts', 'api-layers')).toHaveLength(0);
  });

  test('frontend mantiene shared y features sin ciclos laterales', () => {
    expect(messages("import '../../shared/ui/field.js';", 'apps/web/src/features/auth/login.ts', 'web-layers')).toHaveLength(0);
    expect(messages("import '../../features/profile/view.js';", 'apps/web/src/features/auth/login.ts', 'web-layers')[0]?.messageId).toBe('feature');
    expect(messages("import '../features/auth/login.js';", 'apps/web/src/shared/button.ts', 'web-layers')[0]?.messageId).toBe('app');
  });

  test('T017 oferta mantiene núcleo puro y superficies públicas, incluso en infraestructura', () => {
    for (const layer of ['application','domain','public']) {
      const file = `apps/api/src/modules/academic-offering/${layer}/contract.ts`;
      expect(messages("import 'pg';", file, 'api-layers')[0]?.messageId).toBe('external');
      expect(messages("import '@nestjs/common';", file, 'api-layers')[0]?.messageId).toBe('external');
      expect(messages("export * from '../../../infrastructure/database/academic-transaction.js';", file, 'api-layers')[0]?.messageId).toBe('escape');
    }
    const adapter = 'apps/api/src/modules/academic-offering/infrastructure/offering-store.ts';
    expect(messages("import '../../identity/infrastructure/session-store.js';", adapter, 'api-layers')[0]?.messageId).toBe('module');
    expect(messages("import '../../users/infrastructure/teaching-directory.js';", adapter, 'api-layers')[0]?.messageId).toBe('module');
    expect(messages("import '../../users/public/teaching-directory.js';", adapter, 'api-layers')).toHaveLength(0);
    expect(messages("import '../../authorization/public/session.js';", adapter, 'api-layers')).toHaveLength(0);
    expect(messages("import '../../../infrastructure/database/academic-transaction.js';", adapter, 'api-layers')).toHaveLength(0);
    expect(messages("export * from '../infrastructure/offering-store.js';", 'apps/api/src/modules/academic-offering/public/offer.ts', 'api-layers')[0]?.messageId).toBe('layer');
  });
});
