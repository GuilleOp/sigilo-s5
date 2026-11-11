// Oficina de gobierno y conducta: un solo campo por decisión, donde se escribe para filtrar y se
// elige en la misma lista. Las oficinas son las reales del directorio de la PDN de la entidad
// elegida (se descarga solo su fragmento y el federal) y las ficticias de la demostración; las
// conductas se agrupan por situación cotidiana. El servidor valida todo contra los mismos catálogos.
import {
  findMunicipality,
  findOffense,
  findState,
  offenseActor,
  OFFENSE_SITUATIONS,
  OFFENSES,
  UNCLASSIFIED_OFFENSE_CODE,
} from '@sigilo/contracts';
import { useStateEntities } from '../../../catalogs/entity-catalog.ts';
import { entityOptionsFor } from '../../../catalogs/entity-options.ts';
import { Alert } from '../../../components/Alert.tsx';
import { foldForSearch } from '../../../lib/catalog-search.ts';
import { ComboboxField } from '../../../components/ComboboxField.tsx';
import type { ComboboxOption } from '../../../components/ComboboxField.tsx';
import { setFact } from '../../../state/report-draft.ts';
import type { FactsDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';

interface CatalogFieldsProps {
  facts: FactsDraft;
  errors: FieldErrors;
}

const OFFENSE_OPTIONS: readonly ComboboxOption[] = OFFENSES.map((offense) => ({
  value: offense.code,
  label: offense.label,
  group: offense.situation,
}));

/**
 * Hechos que tienen su propia vía (fiscalías especializadas y comisiones de derechos humanos): se
 * avisa, sin impedir el envío.
 */
const OWN_CHANNEL_WORDS = /tortur|desaparec|ejecucion extrajudicial/u;

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

/** Pista del campo de oficina según la entidad y la descarga de su catálogo. */
function entityHint(status: string, stateName: string | undefined): string {
  if (stateName === undefined) {
    return 'Elige primero el estado para ver sus instituciones. Escribe parte del nombre o abre la lista.';
  }
  if (status === 'loading') return `Cargando las instituciones de ${stateName}…`;
  if (status === 'failed') {
    return `No pudimos cargar las instituciones de ${stateName}. Si no encuentras la tuya, elige «Otro ente público» y descríbela en los hechos.`;
  }
  return 'Escribe parte del nombre o abre la lista. Primero salen las de tu municipio, luego las estatales y las federales.';
}

/** Campos de oficina y conducta. */
export function CatalogFields({ facts, errors }: CatalogFieldsProps) {
  const stateName = findState(facts.stateCode)?.name;
  const realEntities = useStateEntities(facts.stateCode);
  const entityOptions = entityOptionsFor(realEntities.entities, {
    stateCode: facts.stateCode,
    stateName: stateName ?? '',
    municipalityCode: facts.municipalityCode,
    municipalityName: findMunicipality(facts.stateCode, facts.municipalityCode)?.name,
  });
  const selectedOffense = findOffense(facts.offenseCode);
  // La conducta ya elegida sigue en la lista aunque no sea del grupo elegido.
  const offenseOptions =
    facts.accusedRole === ''
      ? OFFENSE_OPTIONS
      : OFFENSE_OPTIONS.filter(
          (option) =>
            offenseActor(option.value) === facts.accusedRole ||
            option.value === UNCLASSIFIED_OFFENSE_CODE ||
            option.value === facts.offenseCode,
        );
  return (
    <fieldset>
      <legend>¿Quién y qué?</legend>
      <ComboboxField
        id="entityId"
        label="Oficina o institución de gobierno"
        hint={entityHint(realEntities.status, stateName)}
        required
        options={entityOptions.options}
        groups={entityOptions.groups}
        searchText={entityOptions.searchText}
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
      {OWN_CHANNEL_WORDS.test(foldForSearch(facts.description)) && (
        <Alert tone="info" title="Esto también tiene su propia vía" testId="own-channel-notice">
          <p>
            Si hubo tortura o la desaparición de una persona, denúncialo también ante la fiscalía
            especializada de tu estado o la comisión de derechos humanos. Tu denuncia aquí se envía
            igual.
          </p>
        </Alert>
      )}
    </fieldset>
  );
}
