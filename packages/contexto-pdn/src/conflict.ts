// Conflicto de interés antes de turnar: organizaciones declaradas en común (S1) y cadena de mando (S2).
// Nunca bloquea el turnado: exige excusa o justificación (LGRA, art. 58) y queda en la bitácora.

import { citeSource } from './citation.ts';
import { assessCoverage } from './coverage.ts';
import type { CoverageMatrix } from './coverage.ts';
import { organizationKey, personNameKey } from './names.ts';
import type {
  DeclaredInterestsSource,
  Evidence,
  NoCoverageReason,
  PersonRef,
  ProcurementStaffRecord,
  ProcurementStaffSource,
  SourceCitation,
} from './types.ts';

/** Alerta de conflicto con su evidencia. */
export interface ConflictAlert {
  /** `conflict.shared-interest` (S1) o `conflict.chain-of-command` (S2). */
  kind: 'conflict.shared-interest' | 'conflict.chain-of-command';
  title: string;
  explanation: string;
  evidence: readonly Evidence[];
}

/** Lo que no se pudo revisar y por qué. */
export interface ConflictGap {
  system: 'S1' | 'S2';
  reason: NoCoverageReason;
  explanation: string;
}

/** Resultado de la revisión de conflicto de interés. */
export interface ConflictCheck {
  outcome: 'possible-conflict' | 'none-found' | 'no_coverage';
  /** Siempre `false`: la alerta nunca impide turnar. */
  blocksRouting: false;
  /** Con un posible conflicto, la autoridad debe excusarse o justificar antes de aceptar. */
  requiresExcuseOrJustification: boolean;
  alerts: readonly ConflictAlert[];
  gaps: readonly ConflictGap[];
  summary: string;
  citations: readonly SourceCitation[];
}

/** Niveles de la cadena de mando que se recorren hacia arriba. */
export const CHAIN_OF_COMMAND_DEPTH = 5;

function chainOf(
  source: ProcurementStaffSource,
  start: ProcurementStaffRecord,
  person: PersonRef,
): ProcurementStaffRecord[] {
  const chain: ProcurementStaffRecord[] = [];
  const seen = new Set<string>([personNameKey(start.fullName)]);
  let current: ProcurementStaffRecord | null = start;
  while (current?.supervisor && chain.length < CHAIN_OF_COMMAND_DEPTH) {
    const key = personNameKey(current.supervisor.fullName);
    if (seen.has(key)) break;
    seen.add(key);
    const next: ProcurementStaffRecord | null = source.findStaff({
      ...person,
      fullName: current.supervisor.fullName,
    });
    chain.push(
      next ?? {
        recordId: '',
        fullName: current.supervisor.fullName,
        institution: current.institution,
        position: current.supervisor.position,
        areaType: '',
        isContractingArea: false,
        supervisor: null,
      },
    );
    current = next;
  }
  return chain;
}

/**
 * Compara a la persona titular de la autoridad destino con la persona denunciada: organizaciones
 * declaradas en común en S1 (se muestran los nombres, no los porcentajes) y si una está en la
 * cadena de mando de la otra en S2. Consulta la matriz de cobertura antes de opinar.
 */
export function checkConflictOfInterest(input: {
  matrix: CoverageMatrix;
  s1: DeclaredInterestsSource | null;
  s2: ProcurementStaffSource | null;
  authorityHead: PersonRef;
  accused: PersonRef;
}): ConflictCheck {
  const { matrix, s1, s2, authorityHead, accused } = input;
  const alerts: ConflictAlert[] = [];
  const gaps: ConflictGap[] = [];
  const citations: SourceCitation[] = [];

  if (s1 === null) {
    gaps.push({
      system: 'S1',
      reason: 'state-without-system',
      explanation: 'No hay una fuente de S1 configurada.',
    });
  } else {
    const coverage = [authorityHead, accused].map((person) =>
      assessCoverage({
        matrix,
        source: s1,
        stateCode: person.stateCode,
        institution: person.institution,
      }),
    );
    const missing = coverage.find((item) => !item.isCovered);
    citations.push(citeSource(s1.info));
    if (missing !== undefined && !missing.isCovered) {
      gaps.push({ system: 'S1', reason: missing.reason, explanation: missing.detail });
    } else {
      const head = s1.findDeclaration(authorityHead);
      const other = s1.findDeclaration(accused);
      if (head === null || other === null) {
        gaps.push({
          system: 'S1',
          reason: 'record-not-found',
          explanation:
            'No encontramos la declaración de una de las dos personas; esto no descarta un conflicto.',
        });
      } else {
        const accusedKeys = new Map(
          other.organizations.map((item) => [organizationKey(item.name), item.name]),
        );
        const shared = head.organizations.filter((item) =>
          accusedKeys.has(organizationKey(item.name)),
        );
        if (shared.length > 0) {
          const citation = citeSource(s1.info);
          alerts.push({
            kind: 'conflict.shared-interest',
            title: 'Posible conflicto de interés: intereses declarados en común',
            explanation: `La persona titular de la autoridad y la persona denunciada declaran participación en ${shared.length === 1 ? 'la misma organización' : `las mismas ${shared.length} organizaciones`} (${citation.text}).`,
            evidence: shared.map((item) => ({
              label: 'Organización en común',
              value: item.name,
              citation,
            })),
          });
        }
      }
    }
  }

  if (s2 === null) {
    gaps.push({
      system: 'S2',
      reason: 'state-without-system',
      explanation: 'No hay una fuente de S2 configurada.',
    });
  } else {
    const coverage = assessCoverage({
      matrix,
      source: s2,
      stateCode: accused.stateCode,
      institution: accused.institution,
    });
    citations.push(citeSource(s2.info));
    if (!coverage.isCovered) {
      gaps.push({ system: 'S2', reason: coverage.reason, explanation: coverage.detail });
    } else {
      const accusedRecord = s2.findStaff(accused);
      const headRecord = s2.findStaff(authorityHead);
      const headKey = personNameKey(authorityHead.fullName);
      const accusedKey = personNameKey(accused.fullName);
      const citation = citeSource(s2.info);
      const headAboveAccused = accusedRecord === null ? [] : chainOf(s2, accusedRecord, accused);
      const accusedAboveHead = headRecord === null ? [] : chainOf(s2, headRecord, authorityHead);
      const headIndex = headAboveAccused.findIndex(
        (item) => personNameKey(item.fullName) === headKey,
      );
      const accusedIndex = accusedAboveHead.findIndex(
        (item) => personNameKey(item.fullName) === accusedKey,
      );
      if (headIndex >= 0 || accusedIndex >= 0) {
        const isHeadSuperior = headIndex >= 0;
        const levels = (isHeadSuperior ? headIndex : accusedIndex) + 1;
        alerts.push({
          kind: 'conflict.chain-of-command',
          title: 'Posible conflicto de interés: cadena de mando',
          explanation: `${isHeadSuperior ? 'La persona titular de la autoridad es superior' : 'La persona denunciada es superior'} de la otra (${levels === 1 ? 'superior inmediato' : `${levels} niveles arriba`}) según ${citation.text}.`,
          evidence: (isHeadSuperior ? headAboveAccused : accusedAboveHead)
            .slice(0, levels)
            .map((item) => ({
              label: 'Superior',
              value: `${item.fullName}, ${item.position}`,
              citation,
            })),
        });
      } else if (accusedRecord === null && headRecord === null) {
        gaps.push({
          system: 'S2',
          reason: 'record-not-found',
          explanation:
            'Ninguna de las dos personas aparece en S2; no se pudo revisar la cadena de mando.',
        });
      }
    }
  }

  const outcome =
    alerts.length > 0 ? 'possible-conflict' : gaps.length > 0 ? 'no_coverage' : 'none-found';
  const summary =
    outcome === 'possible-conflict'
      ? 'Posible conflicto de interés. Puedes turnar, pero la autoridad debe excusarse o justificar por escrito antes de aceptar (LGRA, art. 58).'
      : outcome === 'none-found'
        ? 'No encontramos intereses en común ni relación de mando en los registros disponibles. Esto no descarta un conflicto.'
        : 'No se pudo revisar todo: faltan datos de una fuente. Que no aparezca un conflicto no significa que no exista.';
  return {
    outcome,
    blocksRouting: false,
    requiresExcuseOrJustification: alerts.length > 0,
    alerts,
    gaps,
    summary,
    citations,
  };
}
