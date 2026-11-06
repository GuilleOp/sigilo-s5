// Semáforo de riesgo de reidentificación, en una frase: qué tan fácil sería saber quién eres. La
// forma del ícono cambia por nivel (no solo el color). El porqué y la puntuación quedan a un toque;
// las acciones para corregir, si las hay, siempre a la vista.
import type { ReactNode } from 'react';
import type { RiskAssessment } from '@sigilo/huella';

const LEVEL_TEXT: Readonly<Record<RiskAssessment['level'], string>> = {
  low: 'No vemos nada que te delate.',
  medium: 'Hay datos que podrían delatarte.',
  high: 'Con esto sería fácil saber quién eres.',
};

const LEVEL_HINT: Readonly<Record<RiskAssessment['level'], string>> = {
  low: 'Aun así, léelo una vez más.',
  medium: 'Te recomendamos corregirlos.',
  high: 'Corrígelo antes de enviar.',
};

/** Nivel con su nombre, para quien quiera el detalle. */
const LEVEL_NAME: Readonly<Record<RiskAssessment['level'], string>> = {
  low: 'Riesgo bajo',
  medium: 'Riesgo medio',
  high: 'Riesgo alto',
};

interface RiskMeterProps {
  assessment: RiskAssessment;
  children?: ReactNode;
}

/** Resumen en una frase del nivel, para anunciarlo tras corregir algo. */
export function riskSummary(assessment: RiskAssessment): string {
  return `${LEVEL_TEXT[assessment.level]} ${LEVEL_HINT[assessment.level]}`;
}

/** Muestra el resultado de `assessRisk`. El título recibe el foco tras cada acción. */
export function RiskMeter({ assessment, children }: RiskMeterProps) {
  return (
    <section
      className={`risk risk--${assessment.level}`}
      aria-labelledby="risk-title"
      data-testid="risk-meter"
      data-level={assessment.level}
    >
      <h3 id="risk-title" className="risk__level" tabIndex={-1}>
        <span className="risk__icon" aria-hidden="true" />
        {LEVEL_TEXT[assessment.level]}
      </h3>
      <p>{LEVEL_HINT[assessment.level]}</p>
      {children}
      {assessment.reasons.length > 0 && (
        <details className="more">
          <summary>Ver por qué</summary>
          <p>
            {LEVEL_NAME[assessment.level]}: {assessment.score} de 100.
          </p>
          <ul>
            {assessment.reasons.map((reason) => (
              <li key={reason.text}>{reason.text}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
