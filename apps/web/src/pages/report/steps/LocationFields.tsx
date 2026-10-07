// Estado y municipio opcional, con los catálogos de contracts (los mismos que valida el servidor).
import { municipalitiesOf, STATES } from '@sigilo/contracts';
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
      <legend>¿Dónde pasó?</legend>
      <SelectField
        id="stateCode"
        label="Estado"
        required
        value={facts.stateCode}
        error={errors['stateCode']}
        onChange={(event) => {
          setFact('stateCode', event.target.value);
          setFact('municipalityCode', '');
        }}
        data-testid="state-select"
      >
        <option value="">Elige un estado</option>
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
            <option value="">No indicar municipio (solo el estado)</option>
            {municipalities.map((municipality) => (
              <option key={municipality.code} value={municipality.code}>
                {municipality.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="field__hint">
            Para este estado la denuncia se registra solo con el estado, sin municipio.
          </p>
        ))}
    </fieldset>
  );
}
