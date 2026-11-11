// Opciones del campo «Oficina o institución de gobierno»: los entes reales de la PDN de la entidad
// elegida (primero los del municipio elegido, luego estatales y federales), después los ficticios
// de la demostración y, al final, «Otro ente público».
import { entityLabel, PUBLIC_ENTITIES } from '@sigilo/contracts';
import type { PublicEntityOption } from '@sigilo/contracts';
import type { ComboboxGroup, ComboboxOption } from '../components/ComboboxField.tsx';

/** Lugar elegido: entidad y, si se indicó, municipio (con sus nombres para los encabezados). */
export interface EntityPlace {
  stateCode: string;
  stateName: string;
  municipalityCode: string;
  municipalityName: string | undefined;
}

/** Opciones agrupadas y el texto en que se busca cada una. */
export interface EntityOptions {
  options: ComboboxOption[];
  groups: ComboboxGroup[];
  /** Texto de búsqueda: el nombre mostrado y, si difiere, el de la PDN. */
  searchText: (option: ComboboxOption) => string;
}

const OTHER_ENTITY_ID = 'VE-OTRO';

function byName(a: PublicEntityOption, b: PublicEntityOption): number {
  return a.name.localeCompare(b.name, 'es');
}

/** Arma las opciones con los entes reales cargados (vacío mientras no se descargan). */
export function entityOptionsFor(
  realEntities: readonly PublicEntityOption[],
  place: EntityPlace,
): EntityOptions {
  const real = realEntities.filter(
    (entity) => entity.stateCode === place.stateCode || entity.level === 'federal',
  );
  const isChosenTown = (entity: PublicEntityOption) =>
    place.municipalityCode !== '' &&
    entity.level === 'municipal' &&
    entity.municipalityCode === place.municipalityCode;
  const sections: { key: string; label: string; entities: PublicEntityOption[] }[] = [
    {
      key: 'municipio',
      label: `Municipio de ${place.municipalityName ?? ''}`,
      entities: real.filter(isChosenTown),
    },
    {
      key: 'estatal',
      label: `Estatales de ${place.stateName}`,
      entities: real.filter((entity) => entity.level === 'estatal'),
    },
    {
      key: 'federal',
      label: 'Federales',
      entities: real.filter((entity) => entity.level === 'federal'),
    },
    {
      key: 'municipal',
      label:
        place.municipalityCode === ''
          ? `Municipales de ${place.stateName}`
          : `Otros municipios de ${place.stateName}`,
      entities: real.filter((entity) => entity.level === 'municipal' && !isChosenTown(entity)),
    },
    {
      key: 'ficticia',
      label: 'De demostración (ficticias)',
      entities: PUBLIC_ENTITIES.filter((entity) => entity.isFictitious === true),
    },
    {
      key: 'otro',
      label: '¿No está en la lista?',
      entities: PUBLIC_ENTITIES.filter((entity) => entity.id === OTHER_ENTITY_ID),
    },
  ];
  const sourceNames = new Map<string, string>();
  const options: ComboboxOption[] = [];
  const groups: ComboboxGroup[] = [];
  for (const section of sections) {
    if (section.entities.length === 0) continue;
    groups.push({ key: section.key, label: section.label });
    for (const entity of [...section.entities].sort(
      section.key === 'ficticia' ? () => 0 : byName,
    )) {
      if (entity.sourceName !== undefined) sourceNames.set(entity.id, entity.sourceName);
      options.push({ value: entity.id, label: entityLabel(entity), group: section.key });
    }
  }
  return {
    options,
    groups,
    searchText: (option) => {
      const source = sourceNames.get(option.value);
      return source === undefined ? option.label : `${option.label} ${source}`;
    },
  };
}
