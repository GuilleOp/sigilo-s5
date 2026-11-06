// AUD-01 · Cierre con plantilla: el texto del acuerdo es casi igual al de muchos otros acuerdos de
// la misma autoridad. Shingles de 3 palabras y Jaccard, sin dependencias ni red.
import { daysBetween } from '@sigilo/contexto-pdn';
import { AUDITOR_CONFIG, RULES_VERSION } from '../config.ts';
import type { AuditorConfig } from '../config.ts';
import { SIGNAL_NOTE } from '../signal.ts';
import {
  coveredFragments,
  formatPercent,
  jaccard,
  shingles,
  tokenize,
  toPermille,
} from '../text.ts';
import type { AuditSignal, ClosureAct } from '../types.ts';

/** Resultado de comparar un acuerdo con los demás de su autoridad. */
export interface TemplateComparison {
  closureId: string;
  /** Acuerdos comparados (misma autoridad, dentro de la ventana, motivos no excluidos). */
  compared: number;
  /** Acuerdos con similitud igual o mayor que el umbral, del más parecido al menos. */
  matches: readonly { id: string; fileNumber: string; similarityPermille: number }[];
  /** Proporción del texto evaluado que se repite en al menos la mitad de los coincidentes. */
  repeatedPermille: number;
  isFlagged: boolean;
}

interface Prepared {
  act: ClosureAct;
  tokens: ReturnType<typeof tokenize>;
  shingles: Set<string>;
}

// Caché por objeto: el lote compara cada acuerdo con todos los demás (n² comparaciones, n
// tokenizaciones). Para decenas de miles de acuerdos convendría MinHash con bandas.
const PREPARED = new WeakMap<ClosureAct, Map<number, Prepared>>();

function prepare(act: ClosureAct, size: number): Prepared {
  const bySize = PREPARED.get(act) ?? new Map<number, Prepared>();
  const cached = bySize.get(size);
  if (cached !== undefined && cached.act.text === act.text) return cached;
  const tokens = tokenize(act.text);
  const prepared = { act, tokens, shingles: shingles(tokens, size) };
  bySize.set(size, prepared);
  PREPARED.set(act, bySize);
  return prepared;
}

function isComparable(act: ClosureAct, config: AuditorConfig['templateClosure']): boolean {
  return act.reason === null || !config.excludedReasons.includes(act.reason);
}

// La ventana es simétrica: al revisar un lote histórico, el primer acuerdo de una serie también se
// compara con los posteriores. Al evaluar un acuerdo nuevo solo existen los anteriores.
function inWindow(target: ClosureAct, other: ClosureAct, windowDays: number): boolean {
  return Math.abs(daysBetween(other.issuedOn, target.issuedOn)) <= windowDays;
}

/**
 * Compara un acuerdo con los acuerdos de la MISMA autoridad emitidos a no más de `windowDays`
 * días (los de otras autoridades se ignoran). Pura y determinista.
 */
export function compareWithAuthority(
  target: ClosureAct,
  corpus: readonly ClosureAct[],
  config: AuditorConfig['templateClosure'] = AUDITOR_CONFIG.templateClosure,
): TemplateComparison & { fragments: { text: string }[]; closest: ClosureAct | null } {
  const size = config.shingleSize;
  const prepared = prepare(target, size);
  const others = corpus.filter(
    (act) =>
      act.id !== target.id &&
      act.authorityId === target.authorityId &&
      isComparable(act, config) &&
      inWindow(target, act, config.windowDays),
  );
  const scored = others
    .map((act) => {
      const other = prepare(act, size);
      return { other, similarity: jaccard(prepared.shingles, other.shingles) };
    })
    .filter((item) => toPermille(item.similarity) >= config.similarityPermille)
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.other.act.id.localeCompare(right.other.act.id),
    );

  // Un shingle se repite si aparece en al menos la mitad (configurable) de los coincidentes.
  const counts = new Map<string, number>();
  for (const { other } of scored) {
    for (const item of other.shingles) {
      if (prepared.shingles.has(item)) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  const needed = Math.max(1, Math.ceil((scored.length * config.repeatedSharePermille) / 1000));
  const repeated = new Set([...counts].filter(([, count]) => count >= needed).map(([key]) => key));
  const coverage =
    scored.length === 0
      ? { ratio: 0, fragments: [] }
      : coveredFragments(target.text, prepared.tokens, size, repeated);

  const isFlagged = isComparable(target, config) && scored.length >= config.minMatches;
  return {
    closureId: target.id,
    compared: others.length,
    matches: scored.map(({ other, similarity }) => ({
      id: other.act.id,
      fileNumber: other.act.fileNumber,
      similarityPermille: toPermille(similarity),
    })),
    repeatedPermille: toPermille(coverage.ratio),
    isFlagged,
    fragments: coverage.fragments.map((fragment) => ({ text: fragment.text })),
    closest: scored[0]?.other.act ?? null,
  };
}

/** AUD-01 sobre un acuerdo; `null` si no se señala. */
export function detectTemplateClosure(
  target: ClosureAct,
  corpus: readonly ClosureAct[],
  config: AuditorConfig['templateClosure'] = AUDITOR_CONFIG.templateClosure,
): AuditSignal | null {
  const result = compareWithAuthority(target, corpus, config);
  if (!result.isFlagged || result.closest === null) return null;
  const top = result.matches[0];
  const threshold = config.similarityPermille / 1000;
  const repeatedText = result.fragments.map((fragment) => `«${fragment.text}»`).join(' … ');
  return {
    ruleId: 'AUD-01',
    key: 'signal.template-closure',
    name: 'Acuerdo con texto de plantilla',
    explanation:
      `El texto de este acuerdo es casi igual al de otros ${result.matches.length} acuerdos de la misma ` +
      `autoridad emitidos con no más de ${config.windowDays} días de diferencia (similitud de ${threshold.toFixed(2)} o más). ` +
      `El ${formatPercent(result.repeatedPermille / 1000)} de sus palabras se repite en esos acuerdos, ` +
      'sin cambiar más que el expediente o la fecha. Un acuerdo así puede no explicar los hechos de cada caso.',
    subject: { kind: 'closure', id: target.id, authorityId: target.authorityId },
    evidence: [
      {
        label: 'Texto que se repite',
        actText: repeatedText === '' ? null : repeatedText,
        counterpart: `Aparece en ${result.matches.length} de ${result.compared} acuerdos comparados de la misma autoridad; cubre el ${formatPercent(result.repeatedPermille / 1000)} del acuerdo.`,
        counterpartSource:
          'Acuerdos de cierre y de calificación registrados por la autoridad en el nodo',
      },
      {
        label: 'El acuerdo más parecido',
        actText: target.text,
        counterpart: `${result.closest.fileNumber} (${result.closest.issuedOn}): ${result.closest.text}`,
        counterpartSource: `Similitud ${((top?.similarityPermille ?? 0) / 1000).toFixed(2)} (Jaccard de shingles de ${config.shingleSize} palabras)`,
      },
    ],
    basis: {
      references: [
        { law: 'LGRA', article: '100' },
        { law: 'BPDN', article: '58' },
      ],
      text:
        'La calificación de la falta y el archivo por falta de elementos deben motivarse con los hechos del expediente (LGRA, art. 100). ' +
        `Regla publicada: al menos ${config.minMatches} acuerdos de la misma autoridad con similitud de ${threshold.toFixed(2)} o más.`,
    },
    note: SIGNAL_NOTE,
    source: 'rules',
    metrics: {
      matches: result.matches.length,
      compared: result.compared,
      topSimilarityPermille: top?.similarityPermille ?? 0,
      repeatedPermille: result.repeatedPermille,
    },
    rulesVersion: RULES_VERSION,
  };
}

/** AUD-01 sobre todos los acuerdos: cada uno contra los demás de su autoridad. */
export function detectTemplateClosures(
  acts: readonly ClosureAct[],
  config: AuditorConfig['templateClosure'] = AUDITOR_CONFIG.templateClosure,
): AuditSignal[] {
  return acts.flatMap((act) => {
    const signal = detectTemplateClosure(act, acts, config);
    return signal === null ? [] : [signal];
  });
}
