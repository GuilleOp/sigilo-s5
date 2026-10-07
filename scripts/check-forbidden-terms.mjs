// Revisa que los archivos preparados para commit no contengan términos prohibidos.
// La lista vive en .forbidden-terms.local (no versionado), un término por línea.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const LIST_FILE = '.forbidden-terms.local';

if (!existsSync(LIST_FILE)) process.exit(0);

const terms = readFileSync(LIST_FILE, 'utf8')
  .split('\n')
  .map((line) => line.trim().toLowerCase())
  .filter((line) => line && !line.startsWith('#'));

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const hits = [];
for (const file of staged) {
  const content = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' }).toLowerCase();
  for (const term of terms) {
    if (content.includes(term) || file.toLowerCase().includes(term)) hits.push(`${file}: ${term}`);
  }
}

if (hits.length > 0) {
  console.error('Commit bloqueado: términos prohibidos encontrados.');
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
