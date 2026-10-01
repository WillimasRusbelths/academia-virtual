import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from '../../ops/lint/import-boundaries.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'test-results/**', 'playwright-report/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    plugins: { architecture: boundaries },
    rules: {
      'architecture/web-layers': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
    },
  },
);
