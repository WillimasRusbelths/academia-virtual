import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from '../../ops/lint/import-boundaries.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'generated/**', 'coverage/**', 'test-results/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: { architecture: boundaries },
    rules: {
      'architecture/api-layers': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts', 'src/modules/*/domain/**/*.ts', 'src/modules/*/public/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'process', 'fetch', 'XMLHttpRequest', 'WebSocket', 'require'],
      'no-restricted-syntax': ['error', {
        selector: 'ImportExpression[source.type!="Literal"]',
        message: 'El núcleo usa dependencias estáticas verificables, no carga dinámica calculada.',
      }],
    },
  },
  { files: ['src/**/*.test.ts'], rules: { 'architecture/api-layers': 'off' } },
);
