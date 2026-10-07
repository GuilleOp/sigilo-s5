// Configuración de ESLint (flat config) para todo el monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/server/data/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Math.random no es criptográficamente seguro: usar crypto.getRandomValues.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usar crypto.getRandomValues.' },
      ],
      // Prohibido enviar datos a consola en código de producción (posible fuga).
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'scripts/**', 'e2e/**'],
    rules: { 'no-console': 'off' },
  },
);
