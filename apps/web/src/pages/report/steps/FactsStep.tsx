// Paso 2: hechos (ubicación, ente, conducta, periodo, persona denunciada y descripción).
import { MONTH_NAMES } from '../../../lib/format.ts';
import { InvisibleCharactersAlert } from '../../../components/InvisibleCharactersAlert.tsx';
import { ReviewedTextArea } from '../../../components/ReviewedTextArea.tsx';
import { FieldShell, TextField } from '../../../components/Field.tsx';
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

/** Formulario de hechos. */
export function FactsStep({ draft, errors }: FactsStepProps) {
  const { facts } = draft;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, index) => String(currentYear - index));
  return (
    <>
      <LocationFields facts={facts} errors={errors} />
      <CatalogFields facts={facts} errors={errors} />
      <FieldShell
        id="period"
        label="¿Cuándo ocurrió? (mes y año aproximados)"
        hint="No pongas el día exacto: el mes basta y te protege más."
        error={errors['period']}
      >
        {(describedBy) => (
          <div className="word-grid">
            <select
              id="period"
              aria-label="Mes"
              aria-describedby={describedBy}
              aria-invalid={errors['period'] ? true : undefined}
              value={facts.periodMonth}
              onChange={(event) => setFact('periodMonth', event.target.value)}
              data-testid="period-month"
            >
              <option value="">Mes</option>
              {MONTH_NAMES.map((month, index) => (
                <option key={month} value={String(index + 1).padStart(2, '0')}>
                  {month}
                </option>
              ))}
            </select>
            <select
              aria-label="Año"
              aria-describedby={describedBy}
              value={facts.periodYear}
              onChange={(event) => setFact('periodYear', event.target.value)}
              data-testid="period-year"
            >
              <option value="">Año</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
      </FieldShell>
      <TextField
        id="accused"
        label="Persona o cargo denunciado"
        hint="Por ejemplo: «la persona titular de la Dirección de Compras»."
        value={facts.accused}
        maxLength={2000}
        error={errors['accused']}
        onChange={(event) => setFact('accused', event.target.value)}
        data-testid="accused-input"
      />
      <InvisibleCharactersAlert
        text={facts.accused}
        onChange={(value) => setFact('accused', value)}
        fieldLabel="Persona o cargo denunciado"
      />
      <ReviewedTextArea
        id="description"
        label="Describe lo que pasó"
        hint="Cuenta qué pasó, quién participó y cómo. Evita datos que solo tú sabrías. Mínimo 20 caracteres."
        value={facts.description}
        maxLength={10000}
        error={errors['description']}
        onChange={(value) => setFact('description', value)}
      />
    </>
  );
}
