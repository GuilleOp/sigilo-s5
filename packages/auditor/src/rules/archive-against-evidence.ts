// AUD-02 · Archivo contra evidencia: un archivo «por falta de elementos» cuando la denuncia trae
// pruebas, está corroborada o la PDN confirmó datos, y el acuerdo no se ocupa de ellos.
import type { Verification } from '@sigilo/contexto-pdn';
import { AUDITOR_CONFIG, RULES_VERSION } from '../config.ts';
import type { AuditorConfig } from '../config.ts';
import { SIGNAL_NOTE } from '../signal.ts';
import { foldText, sentenceMentioning } from '../text.ts';
import { actKindOf } from './downgraded-qualification.ts';
import type { AuditSignal, CaseRecord, ClosureAct, EvidencePair } from '../types.ts';

const LACK_OF_ELEMENTS =
  /\b(?:falta|insuficiencia|ausencia|carencia) de elementos\b|\belementos (?:in)?suficientes\b|\bsin elementos\b/u;

/**
 * Indica si el acuerdo archiva por falta de elementos: por el motivo del catálogo
 * (`insufficient_information`) o, si no se registró motivo, por el texto.
 */
export function isLackOfElementsArchive(act: ClosureAct): boolean {
  // Un acuerdo de calificación no es un archivo, aunque diga «no se cuenta con elementos».
  if (actKindOf(act) === 'qualification') return false;
  if (act.reason === 'insufficient_information') return true;
  if (act.reason !== null && act.reason !== 'other') return false;
  return LACK_OF_ELEMENTS.test(foldText(act.text));
}

/** Prueba o dato que el acuerdo debió considerar. */
interface EvidenceItem {
  pair: Omit<EvidencePair, 'actText'>;
  /** Raíces de palabras que indican que el acuerdo se ocupa del dato. */
  terms: readonly string[];
}

const ATTACHMENT_TERMS = [
  'prueba',
  'anexo',
  'adjunt',
  'fotograf',
  'documento aportado',
  'cotizaci',
];
const CORROBORATION_TERMS = [
  'corrobor',
  'otra denuncia',
  'otras denuncias',
  'denunciantes',
  'testimon',
];
const CHECK_TERMS: Readonly<Record<Verification['check'], readonly string[]>> = {
  contract: ['contrato', 'adjudicaci', 'procedimiento de contratacion', 'ocds-'],
  'tax-list-69b': [
    '69-b',
    '69 b',
    'operaciones presuntamente inexistentes',
    'operaciones inexistentes',
  ],
  sanction: ['sanci'],
};

/** Pruebas y datos confirmados del caso, cada uno con las palabras que indican que se consideró. */
function evidenceItems(
  record: CaseRecord,
  config: AuditorConfig['archiveAgainstEvidence'],
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (record.attachments.length > 0) {
    items.push({
      pair: {
        label: 'Pruebas adjuntas',
        counterpart: `La denuncia trae ${record.attachments.length} ${record.attachments.length === 1 ? 'prueba' : 'pruebas'}: ${record.attachments.map((item) => item.label).join('; ')}.`,
        counterpartSource: 'Denuncia (pruebas limpias de Huella Cero)',
      },
      terms: ATTACHMENT_TERMS,
    });
  }
  if (record.independentReporters >= config.minIndependentReporters) {
    items.push({
      pair: {
        label: 'Corroboración independiente',
        counterpart: `${record.independentReporters} personas independientes denuncian los mismos hechos.`,
        counterpartSource: 'Corroboración ciega y señales de independencia',
      },
      terms: CORROBORATION_TERMS,
    });
  }
  for (const verification of record.verifications) {
    if (verification.outcome !== 'confirmed') continue;
    items.push({
      pair: {
        label: verification.title,
        counterpart: verification.explanation,
        counterpartSource: verification.citations.map((citation) => citation.text).join('; '),
      },
      terms: CHECK_TERMS[verification.check],
    });
  }
  return items;
}

/**
 * AUD-02 sobre un acuerdo y su caso; `null` si el acuerdo no archiva por falta de elementos, si
 * no hay pruebas ni datos confirmados o si el acuerdo se ocupa de todos ellos.
 */
export function detectArchiveAgainstEvidence(
  act: ClosureAct,
  record: CaseRecord,
  config: AuditorConfig['archiveAgainstEvidence'] = AUDITOR_CONFIG.archiveAgainstEvidence,
): AuditSignal | null {
  if (!isLackOfElementsArchive(act)) return null;
  const items = evidenceItems(record, config);
  if (items.length === 0) return null;
  const evidence: EvidencePair[] = items.map((item) => ({
    ...item.pair,
    actText: sentenceMentioning(act.text, item.terms),
  }));
  const unaddressed = evidence.filter((pair) => pair.actText === null).length;
  if (unaddressed === 0) return null;
  return {
    ruleId: 'AUD-02',
    key: 'signal.archive-against-evidence',
    name: 'Archivo por falta de elementos con pruebas o datos confirmados',
    explanation:
      `El acuerdo archiva por falta de elementos, pero el caso tiene ${items.length} ${items.length === 1 ? 'elemento' : 'elementos'} ` +
      `(pruebas, corroboración o datos confirmados en registros públicos) y el acuerdo no menciona ${unaddressed === items.length ? 'ninguno' : `${unaddressed} de ellos`}. ` +
      'Conviene revisar si se analizaron antes de archivar.',
    subject: { kind: 'closure', id: act.id, authorityId: act.authorityId },
    evidence: evidence.map((pair) => ({
      ...pair,
      actText: pair.actText ?? 'El acuerdo no lo menciona.',
    })),
    basis: {
      references: [{ law: 'LGRA', article: '100' }],
      text:
        'El archivo procede cuando no hay elementos suficientes (LGRA, art. 100); la denuncia puede reabrirse con nuevos indicios. ' +
        'La regla solo compara lo que el acuerdo dice con lo que el caso ya contiene.',
    },
    note: SIGNAL_NOTE,
    source: 'rules',
    metrics: { evidenceItems: items.length, unaddressed },
    rulesVersion: RULES_VERSION,
  };
}
