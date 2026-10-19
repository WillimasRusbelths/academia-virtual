import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['**/dist/**']},eslint.configs.recommended,...tseslint.configs.recommended,{
  files:['**/*.{js,mjs,ts}'],languageOptions:{globals:{process:'readonly',Buffer:'readonly',URL:'readonly',fetch:'readonly',setInterval:'readonly',clearInterval:'readonly',setTimeout:'readonly',console:'readonly',__ENV:'readonly',open:'readonly'}},
});
