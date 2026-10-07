// ESLint de la aplicación web: reglas del monorepo más las reglas de hooks de React.
import reactHooks from 'eslint-plugin-react-hooks';
import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
];
