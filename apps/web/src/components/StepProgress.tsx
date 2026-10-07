// Progreso del asistente por pasos: lista con el paso actual marcado con aria-current. El número
// y "(listo)" están en el texto, no en el CSS, para que los lectores de pantalla los lean.

interface StepProgressProps {
  steps: readonly string[];
  current: number;
}

/** Lista ordenada de pasos con el actual marcado. */
export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <div className="no-print">
      <p id="step-progress-title" className="visually-hidden">
        Avance de tu denuncia: paso {current + 1} de {steps.length}
      </p>
      <ol className="steps" role="list" aria-labelledby="step-progress-title">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className={index < current ? 'is-done' : undefined}
          >
            <span className="steps__number">{index + 1}.</span> {step}
            {index < current && ' (listo)'}
          </li>
        ))}
      </ol>
    </div>
  );
}
