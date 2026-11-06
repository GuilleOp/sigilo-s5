// Resultado de una verificación contra un registro público con tres resultados: confirmado,
// contradicho o sin cobertura. Lleva el distintivo del sistema consultado (dirección A) y el estado
// siempre con ícono y texto; «sin cobertura» nunca se presenta como evidencia de nada.
import type { ReactNode } from 'react';
import { StateTag } from './a/StateTag.tsx';
import type { StateTone } from './a/StateTag.tsx';
import { SystemBadge } from './a/SystemBadge.tsx';
import type { SystemKey } from './a/SystemBadge.tsx';

/** Resultado de la verificación. */
export type VerificationOutcome = 'confirmed' | 'contradicted' | 'no_coverage';

/** Texto de cada resultado (docs/demo-escenario.md, sección 6.5). */
export const VERIFICATION_LABELS: Readonly<Record<VerificationOutcome, string>> = {
  confirmed: 'Confirmada en el registro público de sanciones',
  contradicted: 'El registro público de sanciones dice otra cosa',
  no_coverage: 'No podemos comprobarlo. Que no aparezca no significa que la sanción no exista.',
};

const OUTCOME_TAGS: Readonly<Record<VerificationOutcome, { tone: StateTone; text: string }>> = {
  confirmed: { tone: 'ok', text: 'Confirmado' },
  contradicted: { tone: 'bad', text: 'Contradicho' },
  no_coverage: { tone: 'nocov', text: 'Sin cobertura' },
};

interface VerificationResultProps {
  outcome: VerificationOutcome;
  /** Sistema consultado; por omisión, el S3 (sanciones). */
  system?: SystemKey;
  /** Título propio; por omisión, el texto del resultado. */
  title?: string;
  children?: ReactNode;
  testId?: string;
}

/** Resultado con el distintivo de la fuente, su estado y la explicación. */
export function VerificationResult({
  outcome,
  system = 'S3',
  title,
  children,
  testId,
}: VerificationResultProps) {
  return (
    <div className="verification" data-outcome={outcome} data-testid={testId}>
      <SystemBadge system={system} size="sm" isLabelled />
      <div className="verification__body">
        <p className="verification__title">
          <StateTag tone={OUTCOME_TAGS[outcome].tone}>{OUTCOME_TAGS[outcome].text}</StateTag>
          <strong>{title ?? VERIFICATION_LABELS[outcome]}</strong>
        </p>
        {children}
      </div>
    </div>
  );
}
