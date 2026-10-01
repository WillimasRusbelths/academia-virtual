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
);
