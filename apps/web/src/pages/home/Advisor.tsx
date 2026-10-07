// "Asesor antes de denunciar": cinco preguntas con consejos personalizados, todo en memoria.
// Al mostrar los consejos el foco va a su encabezado, y el modo recomendado pasa al asistente.
import { useState } from 'react';
import { Link } from 'react-router';
import { PATHS } from '../../app/paths.ts';
import { ADVISOR_QUESTIONS, adviseReporter } from '../../lib/advisor.ts';
import type { AdvisorAnswers } from '../../lib/advisor.ts';
import { advisorRecommendationStore } from '../../lib/advisor-recommendation.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { reportDraftStore } from '../../state/report-draft.ts';

/** Encabezado de los consejos: recibe el foco al mostrarlos. */
const TIPS_TITLE_ID = 'advisor-tips-title';

/** Cuestionario y resultado del asesor. */
export function Advisor() {
  const [answers, setAnswers] = useState<AdvisorAnswers>({});
  const [isShown, setShown] = useState(false);
  const result = adviseReporter(answers);

  /** Pasa la recomendación al asistente (solo en memoria) sin cambiar un modo ya elegido. */
  function startReport(): void {
    advisorRecommendationStore.set(() => result.recommendedMode);
    reportDraftStore.set((draft) =>
      draft.mode === null ? { ...draft, mode: result.recommendedMode } : draft,
    );
  }

  return (
    <section className="card" aria-labelledby="advisor-title" data-testid="advisor">
      <h2 id="advisor-title">Asesor antes de denunciar</h2>
      <p>
        Responde lo que quieras; nada se envía ni se guarda. Te daremos consejos para protegerte.
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setShown(true);
          focusAfterRender(TIPS_TITLE_ID);
        }}
      >
        {ADVISOR_QUESTIONS.map((question) => (
          <fieldset key={question.id}>
            <legend>{question.text} (opcional)</legend>
            {question.options.map((option) => (
              <label key={option.value} className="choice">
                <input
                  type="radio"
                  name={`advisor-${question.id}`}
                  value={option.value}
                  checked={answers[question.id] === option.value}
                  onChange={() =>
                    setAnswers((current) => ({ ...current, [question.id]: option.value }))
                  }
                  data-testid={`advisor-${question.id}-${option.value}`}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <button type="submit" className="button" data-testid="advisor-submit">
          Ver mis consejos
        </button>
      </form>
      <div data-testid="advisor-result">
        {isShown && (
          <>
            <h3 id={TIPS_TITLE_ID} tabIndex={-1}>
              Tus consejos
            </h3>
            <p>
              <strong>{result.modeReason}</strong>
            </p>
            {result.tips.length === 0 ? (
              <p>
                Con tus respuestas no vemos riesgos especiales. Revisa de todos modos lo que
                escribas.
              </p>
            ) : (
              <ul>
                {result.tips.map((tip) => (
                  <li key={tip.id}>
                    <strong>
                      {tip.priority === 'important' ? 'Importante: ' : ''}
                      {tip.title}.
                    </strong>{' '}
                    {tip.text}
                  </li>
                ))}
              </ul>
            )}
            <Link
              className="button"
              to={PATHS.report}
              onClick={startReport}
              data-testid="advisor-start"
            >
              Empezar mi denuncia
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
