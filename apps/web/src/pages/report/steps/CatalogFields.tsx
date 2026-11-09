// Oficina de gobierno y conducta: un solo campo por decisión, donde se escribe para filtrar y se
// elige en la misma lista. Usa los catálogos de contracts (los mismos que valida el servidor); las
// conductas se agrupan por situación cotidiana.
import {
  findOffense,
  GOVERNMENT_LEVEL_LABELS,
  OFFENSE_SITUATIONS,
  OFFENSES,
  PUBLIC_ENTITIES,
} from '@sigilo/contracts';
import { ComboboxField } from '../../../components/ComboboxField.tsx';
import type { ComboboxOption } from '../../../components/ComboboxField.tsx';
import { setFact } from '../../../state/report-draft.ts';
import type { FactsDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';

interface CatalogFieldsProps {
  facts: FactsDraft;
  errors: FieldErrors;
}

const ENTITY_OPTIONS: readonly ComboboxOption[] = PUBLIC_ENTITIES.map((entity) => ({
  value: entity.id,
  label: `${entity.name} (${GOVERNMENT_LEVEL_LABELS[entity.level]})`,
}));

const OFFENSE_OPTIONS: readonly ComboboxOption[] = OFFENSES.map((offense) => ({
  value: offense.code,
  label: offense.label,
  group: offense.situation,
}));

const OFFENSE_GROUPS = OFFENSE_SITUATIONS.map(({ situation, label }) => ({
  key: situation,
  label,
}));

/** Busca también en el término legal y la explicación de cada conducta. */
function offenseSearchText(option: ComboboxOption): string {
  const offense = findOffense(option.value);
  return offense ? `${offense.label} ${offense.legalTerm} ${offense.hint}` : option.label;
}

/** Campos de oficina y conducta. */
export function CatalogFields({ facts, errors }: CatalogFieldsProps) {
  const selectedOffense = findOffense(facts.offenseCode);
  return (
    <fieldset>
      <legend>¿Quién y qué?</legend>
      <ComboboxField
        id="entityId"
        label="Oficina o institución de gobierno"
        hint="Escribe parte del nombre o abre la lista."
        required
        options={ENTITY_OPTIONS}
        value={facts.entityId}
        error={errors['entityId']}
        onChange={(value) => setFact('entityId', value)}
        noun="oficinas"
        testId="entity-select"
      />
      <ComboboxField
        id="offenseCode"
        label="¿Qué hizo la persona? Elige lo más parecido"
        hint={
          selectedOffense?.hint ??
          'Escribe una palabra (dinero, contrato, familiar) o abre la lista. Si dudas, elige lo más cercano: la autoridad lo revisará.'
        }
        required
        options={OFFENSE_OPTIONS}
        groups={OFFENSE_GROUPS}
        value={facts.offenseCode}
        error={errors['offenseCode']}
        onChange={(value) => setFact('offenseCode', value)}
        searchText={offenseSearchText}
        noun="conductas"
        testId="offense-select"
      />
    </fieldset>
  );
}
