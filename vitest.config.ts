// Configuración global de pruebas unitarias. Cada paquete coloca sus pruebas junto al código.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/src/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: true,
  },
});
