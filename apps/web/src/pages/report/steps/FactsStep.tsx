// Paso 2: hechos (ubicación, oficina, conducta, periodo, persona denunciada y descripción).
import { MONTH_NAMES } from '../../../lib/format.ts';
import { InvisibleCharactersAlert } from '../../../components/InvisibleCharactersAlert.tsx';
import { ReviewedTextArea } from '../../../components/ReviewedTextArea.tsx';
import { TextField } from '../../../components/Field.tsx';
import { setFact } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';
import { CatalogFields } from './CatalogFields.tsx';
import { LocationFields } from './LocationFields.tsx';

interface FactsStepProps {
  draft: ReportDraft;
  errors: FieldErrors;
}

const YEARS_BACK = 10;
/** Mínimo y máximo de la descripción (los mismos que pide la validación del paso). */
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 10000;
const ACCUSED_LABEL = 'Persona o cargo denunciado';

/** Formulario de hechos. */
export function FactsStep({ draft, errors }: FactsStepProps) {
  const { facts } = draft;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, index) => String(currentYear - index));
  const periodError = errors['period'];
  const periodDescription = periodError ? 'period-hint period-error' : 'period-hint';
  return (
    <>
      <LocationFields facts={facts} errors={errors} />
      <CatalogFields facts={facts} errors={errors} />
      <fieldset id="period" data-group-field className="field">
        <legend>¿Cuándo pasó? (mes y año, aproximados)</legend>
        <p id="period-hint" className="field__hint">
          No pongas el día exacto: el mes basta y te protege más.
        </p>
        <div className="word-grid">
          <div>
            <label htmlFor="period-month">Mes</label>
            <select
              id="period-month"
              aria-describedby={periodDescription}
              aria-invalid={periodError ? true : undefined}
              aria-required="true"
              value={facts.periodMonth}
              onChange={(event) => setFact('periodMonth', event.target.value)}
              data-testid="period-month"
            >
              <option value="">Elige el mes</option>
              {MONTH_NAMES.map((month, index) => (
                <option key={month} value={String(index + 1).padStart(2, '0')}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="period-year">Año</label>
            <select
              id="period-year"
              aria-describedby={periodDescription}
              aria-invalid={periodError ? true : undefined}
              aria-required="true"
              value={facts.periodYear}
              onChange={(event) => setFact('periodYear', event.target.value)}
              data-testid="period-year"
            >
              <option value="">Elige el año</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        {periodError && (
          <p id="period-error" className="field__error">
            Error: {periodError}
          </p>
        )}
      </fieldset>
      <TextField
        id="accused"
        label={ACCUSED_LABEL}
        hint="Por ejemplo: «la persona titular de la Dirección de Compras»."
        required
        value={facts.accused}
        maxLength={2000}
        error={errors['accused']}
        onChange={(event) => setFact('accused', event.target.value)}
        data-testid="accused-input"
      />
      <InvisibleCharactersAlert
        text={facts.accused}
        onChange={(value) => setFact('accused', value)}
        fieldLabel={ACCUSED_LABEL}
        fieldId="accused"
      />
      <ReviewedTextArea
        id="description"
        label="Describe lo que pasó"
        hint="Cuenta qué pasó, quién lo hizo y cómo. No pongas cosas que solo tú sabes. Escribe por lo menos una frase."
        required
        value={facts.description}
        minLength={DESCRIPTION_MIN}
        maxLength={DESCRIPTION_MAX}
        error={errors['description']}
        onChange={(value) => setFact('description', value)}
      />
    </>
  );
}
