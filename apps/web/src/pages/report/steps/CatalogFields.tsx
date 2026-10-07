// Ente público y conducta, con búsqueda local sobre los catálogos completos.
import { useState } from 'react';
import { filterByQuery, findOffense } from '../../../catalogs/catalog-search.ts';
import { OFFENSE_GROUPS, OFFENSES } from '../../../catalogs/offenses.ts';
import { GOVERNMENT_LEVEL_LABELS, PUBLIC_ENTITIES } from '../../../catalogs/public-entities.ts';
import { SelectField, TextField } from '../../../components/Field.tsx';
import { setFact } from '../../../state/report-draft.ts';
import type { FactsDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';

interface CatalogFieldsProps {
  facts: FactsDraft;
  errors: FieldErrors;
}

/** Selectores de ente y conducta con filtro. */
export function CatalogFields({ facts, errors }: CatalogFieldsProps) {
  const [entityQuery, setEntityQuery] = useState('');
  const [offenseQuery, setOffenseQuery] = useState('');
  const entities = filterByQuery(PUBLIC_ENTITIES, entityQuery, (entity) => entity.name);
  const offenses = filterByQuery(
    OFFENSES,
    offenseQuery,
    (offense) => `${offense.name} ${offense.hint}`,
  );
  const selectedOffense = findOffense(facts.offenseCode);

  return (
    <fieldset>
      <legend>¿Quién y qué?</legend>
      <TextField
        id="entityQuery"
        label="Buscar ente público"
        hint="Escribe parte del nombre para reducir la lista. La búsqueda ocurre solo en tu equipo."
        value={entityQuery}
        onChange={(event) => setEntityQuery(event.target.value)}
      />
      <SelectField
        id="entityId"
        label="Ente público"
        value={facts.entityId}
        error={errors['entityId']}
        onChange={(event) => setFact('entityId', event.target.value)}
        data-testid="entity-select"
      >
        <option value="">Elige un ente ({entities.length} disponibles)</option>
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name} ({GOVERNMENT_LEVEL_LABELS[entity.level]})
          </option>
        ))}
      </SelectField>
      <TextField
        id="offenseQuery"
        label="Buscar conducta"
        hint="Por ejemplo: dinero, contrato, familiar."
        value={offenseQuery}
        onChange={(event) => setOffenseQuery(event.target.value)}
      />
      <SelectField
        id="offenseCode"
        label="Conducta que más se parece a lo que pasó"
        hint={selectedOffense?.hint ?? 'Si dudas, elige la más cercana; la autoridad la revisará.'}
        value={facts.offenseCode}
        error={errors['offenseCode']}
        onChange={(event) => setFact('offenseCode', event.target.value)}
        data-testid="offense-select"
      >
        <option value="">Elige una conducta ({offenses.length} disponibles)</option>
        {OFFENSE_GROUPS.map(({ group, label }) => {
          const items = offenses.filter((offense) => offense.group === group);
          if (items.length === 0) return null;
          return (
            <optgroup key={group} label={label}>
              {items.map((offense) => (
                <option key={offense.code} value={offense.code}>
                  {offense.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </SelectField>
    </fieldset>
  );
}
