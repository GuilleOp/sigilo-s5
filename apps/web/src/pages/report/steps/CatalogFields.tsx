// Oficina de gobierno y conducta: un solo campo por decisión, donde se escribe para filtrar y se
// elige en la misma lista. Usa los catálogos de contracts (los mismos que valida el servidor); las
// conductas se agrupan por situación cotidiana.
import {
  findOffense,
  GOVERNMENT_LEVEL_LABELS,
  offenseActor,
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

/** «¿Quién lo hizo?»: solo acorta la lista de conductas; nunca sale del navegador. */
const ROLE_CHOICES: readonly { value: FactsDraft['accusedRole']; label: string }[] = [
  { value: 'public-servant', label: 'Una persona servidora pública' },
  { value: 'private-party', label: 'Un particular: empresa, proveedor o persona' },
  { value: '', label: 'No sé' },
];

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
  // La conducta ya elegida sigue en la lista aunque no sea del grupo elegido.
  const offenseOptions =
    facts.accusedRole === ''
      ? OFFENSE_OPTIONS
      : OFFENSE_OPTIONS.filter(
          (option) =>
            offenseActor(option.value) === facts.accusedRole || option.value === facts.offenseCode,
        );
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
      <fieldset className="field">
        <legend>¿Quién lo hizo?</legend>
        <p className="field__hint" id="accused-role-hint">
          Nos ayuda a mostrarte menos opciones. Si no sabes, elige «No sé».
        </p>
        <div className="choice-list">
          {ROLE_CHOICES.map((choice) => (
            <div key={choice.value || 'unknown'} className="choice">
              <input
                type="radio"
                id={`accused-role-${choice.value || 'unknown'}`}
                name="accused-role"
                aria-describedby="accused-role-hint"
                checked={facts.accusedRole === choice.value}
                onChange={() => setFact('accusedRole', choice.value)}
                data-testid={`accused-role-${choice.value || 'unknown'}`}
              />
              <label htmlFor={`accused-role-${choice.value || 'unknown'}`}>{choice.label}</label>
            </div>
          ))}
        </div>
      </fieldset>
      <ComboboxField
        id="offenseCode"
        label="¿Qué hizo la persona? Elige lo más parecido"
        hint={
          selectedOffense?.hint ??
          'Escribe una palabra (dinero, contrato, familiar) o abre la lista. Si dudas, elige lo más cercano: la autoridad lo revisará.'
        }
        required
        options={offenseOptions}
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
