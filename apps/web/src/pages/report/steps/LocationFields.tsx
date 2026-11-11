// Estado y municipio opcional, con los catálogos de contracts (los mismos que valida el servidor):
// los municipios y alcaldías del INEGI de las 32 entidades, ordenados alfabéticamente.
import { isEntityOfState, municipalitiesOf, STATES } from '@sigilo/contracts';
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
  const municipalities = municipalitiesOf(facts.stateCode).sort((a, b) =>
    a.name.localeCompare(b.name, 'es'),
  );
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
          // Un ente estatal o municipal real de otra entidad deja de valer.
          if (!isEntityOfState(facts.entityId, event.target.value)) setFact('entityId', '');
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
      {facts.stateCode !== '' && municipalities.length > 0 && (
        <SelectField
          id="municipalityCode"
          label="Municipio o alcaldía (opcional)"
          hint="Si lo dejas en blanco, es más difícil saber que fuiste tú."
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
      )}
    </fieldset>
  );
}
