// Progreso del asistente por pasos, accesible con aria-current y texto "Paso N de M".

interface StepProgressProps {
  steps: readonly string[];
  current: number;
}

/** Lista ordenada de pasos con el actual marcado. */
export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <nav aria-label="Progreso de la denuncia" className="no-print">
      <p className="visually-hidden">
        Paso {current + 1} de {steps.length}
      </p>
      <ol className="steps">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className={index < current ? 'is-done' : undefined}
          >
            {step}
          </li>
        ))}
      </ol>
    </nav>
  );
}
