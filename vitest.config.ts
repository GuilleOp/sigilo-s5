// Configuración global de pruebas unitarias. Cada paquete coloca sus pruebas junto al código.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'tools/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.tsx',
      'scripts/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: true,
    // `npm run test:coverage`: cobertura con V8 del código de los paquetes, sin las pruebas.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**', 'tools/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/test-support/**'],
    },
  },
});
