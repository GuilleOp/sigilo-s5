// AUD-03 · Calificación degradada: hechos que el catálogo asocia a una falta grave y que la
// autoridad califica como no grave. Fundamento de la señal: LGRA art. 64, fr. I; no afirma que la haya.
import { findOffense, offenseReference } from '@sigilo/contracts';
import { classifyOffense } from '@sigilo/contexto-pdn';
import { RULES_VERSION } from '../config.ts';
import { SIGNAL_NOTE } from '../signal.ts';
import { foldText, sentenceMentioning } from '../text.ts';
import type {
  AuditSignal,
  AuthorityActKind,
  CaseRecord,
  ClosureAct,
  Qualification,
} from '../types.ts';

const NON_SERIOUS_PATTERN = /\b(?:falta(?:s)? (?:administrativa(?:s)? )?|como )no grave(?:s)?\b/u;
const SERIOUS_PATTERN = /\bfalta(?:s)? (?:administrativa(?:s)? )?grave(?:s)?\b/u;

/** Tipo del acuerdo: el registrado o, si falta, el que se deduce del motivo y del texto. */
export function actKindOf(act: ClosureAct): AuthorityActKind {
  if (act.kind !== undefined) return act.kind;
  return act.reason === null && qualificationOf(act) !== null ? 'qualification' : 'closure';
}

/** Calificación del acuerdo: la registrada o, si falta, la que dice el texto. */
export function qualificationOf(act: ClosureAct): Qualification | null {
  if (act.qualification !== null) return act.qualification;
  const folded = foldText(act.text);
  if (NON_SERIOUS_PATTERN.test(folded)) return 'no-grave';
  if (SERIOUS_PATTERN.test(folded)) return 'grave';
  return null;
}

/** AUD-03 sobre un acuerdo y su caso; `null` si no hay degradación. */
export function detectDowngradedQualification(
  act: ClosureAct,
  record: CaseRecord,
): AuditSignal | null {
  const severity = classifyOffense(record.offenseCode);
  if (severity !== 'grave' && severity !== 'crime') return null;
  if (qualificationOf(act) !== 'no-grave') return null;
  const offense = findOffense(record.offenseCode);
  const reference = offenseReference(record.offenseCode);
  const where =
    reference === undefined ? record.offenseCode : `${reference.law}, art. ${reference.article}`;
  const catalogText =
    severity === 'crime'
      ? `${offense?.label ?? record.offenseCode} (${where}): el catálogo la registra como delito por hechos de corrupción.`
      : `${offense?.label ?? record.offenseCode} (${where}): el catálogo la ubica entre las faltas graves (LGRA, arts. 51 a 64 y 65 a 72).`;
  return {
    ruleId: 'AUD-03',
    key: 'signal.downgraded-qualification',
    name: 'Calificada como no grave, aunque el catálogo la asocia a una falta grave',
    explanation:
      `La conducta denunciada está en el catálogo como falta grave, pero la autoridad la calificó como no grave${actKindOf(act) === 'qualification' ? ' en su acuerdo de calificación' : ''}. ` +
      'Puede tener razones (por ejemplo, que los hechos investigados resulten ser otros); la señal pide revisar que el acuerdo las explique.',
    subject: { kind: 'closure', id: act.id, authorityId: act.authorityId },
    evidence: [
      {
        label: 'Calificación de la autoridad',
        actText:
          sentenceMentioning(act.text, ['no grave']) ?? 'Calificación registrada: falta no grave.',
        counterpart: catalogText,
        counterpartSource: 'Catálogo de conductas (@sigilo/contracts)',
      },
    ],
    basis: {
      references: [{ law: 'LGRA', article: '64', fraction: 'I' }],
      text:
        'La LGRA, art. 64, fr. I, describe como obstrucción de la justicia simular faltas no graves durante la investigación de faltas graves. ' +
        'Esta señal no afirma que eso haya ocurrido: solo compara la calificación con el catálogo. La persona denunciante puede inconformarse (LGRA, arts. 102 y 103).',
    },
    note: SIGNAL_NOTE,
    source: 'rules',
    metrics: {},
    rulesVersion: RULES_VERSION,
  };
}
