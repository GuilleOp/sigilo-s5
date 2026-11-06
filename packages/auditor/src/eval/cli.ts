// `npm run auditor:eval`: escribe packages/auditor/EVALUACION.md; con `-- --check` solo comprueba
// que el archivo versionado está al día (código de salida 1 si no).
import { readFileSync, writeFileSync } from 'node:fs';
import { renderEvaluation } from './report.ts';

const target = new URL('../../EVALUACION.md', import.meta.url);
const content = await renderEvaluation();

if (process.argv.includes('--check')) {
  let current: string;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    current = '';
  }
  if (current !== content) {
    console.error('EVALUACION.md no está al día: ejecuta npm run auditor:eval.');
    process.exit(1);
  }
} else {
  writeFileSync(target, content);
  console.warn(`Evaluación escrita en ${target.pathname}`);
}
