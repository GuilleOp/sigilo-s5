// Semáforo de riesgo de reidentificación: nivel en texto, forma distinta por nivel y razones.
import type { ReactNode } from 'react';
import type { RiskAssessment } from '@sigilo/huella';

const LEVEL_TEXT: Readonly<Record<RiskAssessment['level'], string>> = {
  low: 'Riesgo bajo',
  medium: 'Riesgo medio',
  high: 'Riesgo alto',
};

const LEVEL_HINT: Readonly<Record<RiskAssessment['level'], string>> = {
  low: 'No vemos señales fuertes que te identifiquen. Aun así, revisa lo que escribiste.',
  medium: 'Hay datos que podrían ayudar a identificarte. Te recomendamos corregirlos.',
  high: 'Con estos datos sería fácil saber quién eres. Corrígelos antes de enviar.',
};

interface RiskMeterProps {
  assessment: RiskAssessment;
  children?: ReactNode;
}

/** Muestra el resultado de `assessRisk`. */
export function RiskMeter({ assessment, children }: RiskMeterProps) {
  return (
    <section
      className={`risk risk--${assessment.level}`}
      aria-labelledby="risk-title"
      data-testid="risk-meter"
      data-level={assessment.level}
    >
      <h3 id="risk-title" className="risk__level">
        <span className="risk__icon" aria-hidden="true" />
        {LEVEL_TEXT[assessment.level]} ({assessment.score} de 100)
      </h3>
      <p>{LEVEL_HINT[assessment.level]}</p>
      {assessment.reasons.length > 0 && (
        <>
          <p>
            <strong>Por qué:</strong>
          </p>
          <ul>
            {assessment.reasons.map((reason) => (
              <li key={reason.text}>{reason.text}</li>
            ))}
          </ul>
        </>
      )}
      {children}
    </section>
  );
}
