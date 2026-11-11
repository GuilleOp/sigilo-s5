// Ayudas automáticas bajo el relato: las cuatro partes que conviene contar se marcan solas cuando
// el relato ya las menciona, y, si las palabras se parecen a una conducta del catálogo, se ofrece
// usarla con un toque. Todo se calcula en este navegador.
import { offenseSeverity } from '@sigilo/contracts';
import type { OffenseSeverity } from '@sigilo/contracts';
import { announce } from '../../../lib/announce.ts';
import { storyParts, suggestOffenses } from '../../../lib/story-guide.ts';
import { setFact } from '../../../state/report-draft.ts';
import type { FactsDraft } from '../../../state/report-draft.ts';

const SEVERITY_LABELS: Readonly<Record<OffenseSeverity, string>> = {
  serious: 'Puede ser falta grave',
  non_serious: 'Puede ser falta no grave',
  private_party: 'Falta grave de particulares',
  crime: 'Puede ser delito',
};

interface StoryHelpersProps {
  facts: FactsDraft;
}

/** Guía del relato y conductas sugeridas. */
export function StoryHelpers({ facts }: StoryHelpersProps) {
  const parts = storyParts(facts.description);
  const suggestions = suggestOffenses(facts.description).filter(
    (offense) => offense.code !== facts.offenseCode,
  );
  return (
    <div className="story-helpers" data-testid="story-helpers">
      <ul className="story-parts" aria-label="Lo que ayuda contar">
        {parts.map((part) => (
          <li
            key={part.key}
            className={`story-part${part.isPresent ? ' story-part--done' : ''}`}
            data-testid={`story-part-${part.key}`}
            data-present={part.isPresent}
          >
            <span className="story-part__mark" aria-hidden="true">
              {part.isPresent ? '✓' : '○'}
            </span>
            <span>
              <strong>{part.title}</strong>
              <span className="visually-hidden">
                {part.isPresent ? ': ya lo cuentas.' : ': todavía no.'}
              </span>
              <span className="story-part__tip">{part.tip}</span>
            </span>
          </li>
        ))}
      </ul>
      {suggestions.length > 0 && (
        <section
          className="story-suggestions"
          aria-labelledby="story-suggestions-title"
          data-testid="story-suggestions"
        >
          <h3 id="story-suggestions-title">Por lo que cuentas, podría ser</h3>
          <p className="field__hint">
            Es una orientación por tus palabras, calculada en tu equipo. La autoridad decide.
          </p>
          <ul>
            {suggestions.map((offense) => {
              const severity = offenseSeverity(offense.code);
              return (
                <li key={offense.code} className="story-suggestion">
                  <span>
                    <strong>{offense.label}</strong>
                    {severity && (
                      <span className="story-suggestion__tag">{SEVERITY_LABELS[severity]}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setFact('offenseCode', offense.code);
                      announce(`Elegiste: ${offense.label}.`);
                    }}
                    data-testid="story-suggestion-use"
                  >
                    Usar esta
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
