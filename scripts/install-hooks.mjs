// Instala el hook pre-commit local que ejecuta la revisión de términos prohibidos.
import { chmodSync, writeFileSync } from 'node:fs';

const HOOK_PATH = '.git/hooks/pre-commit';
writeFileSync(HOOK_PATH, '#!/bin/sh\nnode scripts/check-forbidden-terms.mjs\n');
chmodSync(HOOK_PATH, 0o755);
console.log('Hook pre-commit instalado.');
