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
  },
});
