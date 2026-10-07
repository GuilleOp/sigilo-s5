// Entidad federativa y municipio opcional; el catálogo se filtra en el navegador.
import { municipalitiesOf } from '../../../catalogs/catalog-search.ts';
import { STATES } from '../../../catalogs/states.ts';
import { SelectField } from '../../../components/Field.tsx';
import { setFact } from '../../../state/report-draft.ts';
import type { FactsDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';

interface LocationFieldsProps {
  facts: FactsDraft;
  errors: FieldErrors;
}

/** Selectores de ubicación. */
export function LocationFields({ facts, errors }: LocationFieldsProps) {
  const municipalities = municipalitiesOf(facts.stateCode);
  return (
    <fieldset>
      <legend>¿Dónde ocurrió?</legend>
      <SelectField
        id="stateCode"
        label="Entidad federativa"
        value={facts.stateCode}
        error={errors['stateCode']}
        onChange={(event) => {
          setFact('stateCode', event.target.value);
          setFact('municipalityCode', '');
        }}
        data-testid="state-select"
      >
        <option value="">Elige una entidad</option>
        {STATES.map((state) => (
          <option key={state.code} value={state.code}>
            {state.name}
          </option>
        ))}
      </SelectField>
      {facts.stateCode !== '' &&
        (municipalities.length > 0 ? (
          <SelectField
            id="municipalityCode"
            label="Municipio (opcional)"
            hint="Dejarlo en blanco te protege más: hay más personas que podrían haber denunciado."
            value={facts.municipalityCode}
            onChange={(event) => setFact('municipalityCode', event.target.value)}
            data-testid="municipality-select"
          >
            <option value="">No indicar municipio (solo la entidad)</option>
            {municipalities.map((municipality) => (
              <option key={municipality.code} value={municipality.code}>
                {municipality.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="field__hint">
            Para esta entidad la denuncia se registra solo a nivel entidad, sin municipio.
          </p>
        ))}
    </fieldset>
  );
}
