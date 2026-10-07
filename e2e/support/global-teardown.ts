// Limpieza global de E2E: borra el directorio temporal con la base y los archivos sintéticos.
// Con `SIGILO_E2E_KEEP=1` se conserva para inspeccionarlo después de un fallo.
import { rmSync } from 'node:fs';
import { workspaceDir } from './environment.ts';

/** Borra el directorio temporal de la corrida. */
export default function globalTeardown(): void {
  const dir = workspaceDir();
  if (process.env.SIGILO_E2E_KEEP === '1') {
    console.log(`Directorio de E2E conservado en ${dir}`);
    return;
  }
  rmSync(dir, { recursive: true, force: true });
}
