// AUD-06 tasa de archivo en casos corroborados y AUD-07 concentración de archivos en un mismo
// denunciado o proveedor. Patrones por autoridad: cada campaña coordinada cuenta como un caso.
import { daysBetween } from '@sigilo/contexto-pdn';
import { AUDITOR_CONFIG, RULES_VERSION } from '../config.ts';
import type { AuditorConfig } from '../config.ts';
import { SIGNAL_NOTE } from '../signal.ts';
import { formatPercent, toPermille } from '../text.ts';
import type { AuditSignal, CaseRecord } from '../types.ts';
import { isLackOfElementsArchive } from './archive-against-evidence.ts';
import type { ClosureAct } from '../types.ts';

/** Indica si el caso tiene pruebas, corroboración o un dato confirmado en registros públicos. */
export function isCorroborated(
  record: CaseRecord,
  minIndependentReporters = AUDITOR_CONFIG.archiveAgainstEvidence.minIndependentReporters,
): boolean {
  return (
    record.attachments.length > 0 ||
    record.independentReporters >= minIndependentReporters ||
    record.verifications.some((item) => item.outcome === 'confirmed')
  );
}

/** Casos archivados por falta de elementos, según los acuerdos ligados a cada caso. */
function archivedCaseRefs(acts: readonly ClosureAct[]): Set<string> {
  return new Set(
    acts.flatMap((act) =>
      act.caseRef !== null && isLackOfElementsArchive(act) ? [act.caseRef] : [],
    ),
  );
}

/** Unidad de conteo: la campaña completa o el caso. */
function unitOf(record: CaseRecord): string {
  return record.campaignGroupId === null
    ? `case:${record.caseRef}`
    : `campaign:${record.campaignGroupId}`;
}

function inWindow(record: CaseRecord, today: string, windowDays: number): boolean {
  const age = daysBetween(record.receivedOn, today);
  return age >= 0 && age <= windowDays;
}

/** AUD-06 para una autoridad; `null` si hay pocos casos corroborados o la tasa es menor que el umbral. */
export function detectCorroboratedArchiveRate(
  authorityId: string,
  cases: readonly CaseRecord[],
  acts: readonly ClosureAct[],
  today: string,
  config: AuditorConfig['corroboratedArchiveRate'] = AUDITOR_CONFIG.corroboratedArchiveRate,
): AuditSignal | null {
  const archived = archivedCaseRefs(acts.filter((act) => act.authorityId === authorityId));
  const units = new Map<string, boolean>();
  for (const record of cases) {
    if (record.authorityId !== authorityId || !inWindow(record, today, config.windowDays)) continue;
    if (!isCorroborated(record)) continue;
    const unit = unitOf(record);
    units.set(unit, (units.get(unit) ?? false) || archived.has(record.caseRef));
  }
  const total = units.size;
  const archivedCount = [...units.values()].filter(Boolean).length;
  if (total < config.minCases) return null;
  const rate = archivedCount / total;
  if (toPermille(rate) < config.minRatePermille) return null;
  return {
    ruleId: 'AUD-06',
    key: 'signal.corroborated-archive-rate',
    name: 'Muchos archivos por falta de elementos en casos con pruebas o corroboración',
    explanation:
      `En los últimos ${config.windowDays} días, la autoridad archivó por falta de elementos ${archivedCount} de ${total} casos ` +
      `que tenían pruebas, corroboración o datos confirmados (${formatPercent(rate)}).`,
    subject: { kind: 'authority', id: authorityId, authorityId },
    evidence: [
      {
        label: 'Tasa de archivo en casos corroborados',
        actText: `${archivedCount} acuerdos de archivo por falta de elementos.`,
        counterpart: `${total} casos con pruebas, corroboración o datos confirmados (cada campaña coordinada cuenta como uno).`,
        counterpartSource: 'Casos y acuerdos registrados en el nodo',
      },
    ],
    basis: {
      references: [{ law: 'LGRA', article: '100' }],
      text: `Regla publicada: con ${config.minCases} casos corroborados o más, una tasa de archivo de ${formatPercent(config.minRatePermille / 1000)} o más. Es un patrón agregado: no dice nada de un caso en particular.`,
    },
    note: SIGNAL_NOTE,
    source: 'rules',
    metrics: { corroboratedCases: total, archived: archivedCount, ratePermille: toPermille(rate) },
    rulesVersion: RULES_VERSION,
  };
}

/** Clave a la vista: los primeros caracteres de la clave seudónima o el identificador público. */
function shortKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 12)}…` : key;
}

/** AUD-07 para una autoridad: una señal por cada denunciado o proveedor con archivos concentrados. */
export function detectArchiveConcentration(
  authorityId: string,
  cases: readonly CaseRecord[],
  acts: readonly ClosureAct[],
  today: string,
  config: AuditorConfig['archiveConcentration'] = AUDITOR_CONFIG.archiveConcentration,
): AuditSignal[] {
  const archived = archivedCaseRefs(acts.filter((act) => act.authorityId === authorityId));
  // clave → unidad → archivada
  const byKey = new Map<string, { kind: 'accused' | 'supplier'; units: Map<string, boolean> }>();
  for (const record of cases) {
    if (record.authorityId !== authorityId || !inWindow(record, today, config.windowDays)) continue;
    const keys: { key: string; kind: 'accused' | 'supplier' }[] = [
      ...(record.accusedKey === null
        ? []
        : [{ key: `accused:${record.accusedKey}`, kind: 'accused' as const }]),
      ...record.supplierKeys.map((key) => ({ key: `supplier:${key}`, kind: 'supplier' as const })),
    ];
    for (const { key, kind } of keys) {
      const entry = byKey.get(key) ?? { kind, units: new Map<string, boolean>() };
      const unit = unitOf(record);
      entry.units.set(unit, (entry.units.get(unit) ?? false) || archived.has(record.caseRef));
      byKey.set(key, entry);
    }
  }
  const signals: AuditSignal[] = [];
  for (const [key, { kind, units }] of [...byKey].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const total = units.size;
    const archivedCount = [...units.values()].filter(Boolean).length;
    if (archivedCount < config.minArchives) continue;
    const rate = archivedCount / total;
    if (toPermille(rate) < config.minArchiveRatePermille) continue;
    const visible = shortKey(key.slice(key.indexOf(':') + 1));
    const who =
      kind === 'accused'
        ? `la misma persona denunciada (clave ${visible})`
        : `el mismo proveedor (${visible})`;
    signals.push({
      ruleId: 'AUD-07',
      key: 'signal.archive-concentration',
      name:
        kind === 'accused'
          ? 'Archivos concentrados en una misma persona denunciada'
          : 'Archivos concentrados en un mismo proveedor',
      explanation:
        `${archivedCount} de ${total} denuncias distintas sobre ${who} terminaron archivadas por falta de elementos. ` +
        'Que varias denuncias independientes se archiven igual merece una segunda mirada; no dice nada sobre la persona o la empresa.',
      subject: { kind: 'authority', id: authorityId, authorityId },
      evidence: [
        {
          label: kind === 'accused' ? 'Persona denunciada (clave seudónima)' : 'Proveedor',
          actText: `${archivedCount} acuerdos de archivo por falta de elementos.`,
          counterpart: `${total} denuncias distintas (cada campaña coordinada cuenta como una).`,
          counterpartSource: 'Casos y acuerdos registrados en el nodo',
        },
      ],
      basis: {
        references: [{ law: 'LGRA', article: '100' }],
        text: `Regla publicada: ${config.minArchives} archivos o más sobre la misma clave y ${formatPercent(config.minArchiveRatePermille / 1000)} o más de sus denuncias archivadas.`,
      },
      note: SIGNAL_NOTE,
      source: 'rules',
      metrics: { cases: total, archived: archivedCount, ratePermille: toPermille(rate) },
      rulesVersion: RULES_VERSION,
    });
  }
  return signals;
}
