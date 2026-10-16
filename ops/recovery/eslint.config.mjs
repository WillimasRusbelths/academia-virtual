import eslint from '@eslint/js';
export default [eslint.configs.recommended,{
  files:['**/*.mjs'],languageOptions:{globals:{Buffer:'readonly',process:'readonly'}},
}];
