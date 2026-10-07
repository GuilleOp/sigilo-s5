// Oficina de gobierno y conducta, con búsqueda local sobre los catálogos de contracts (los mismos
// que valida el servidor). Las conductas se agrupan por situación cotidiana y la opción elegida
// sigue en la lista aunque la búsqueda no la incluya.
import { useEffect, useRef, useState } from 'react';
import {
  findEntity,
  findOffense,
  GOVERNMENT_LEVEL_LABELS,
  OFFENSE_SITUATIONS,
  OFFENSES,
  PUBLIC_ENTITIES,
} from '@sigilo/contracts';
import { SelectField, TextField } from '../../../components/Field.tsx';
import { announce } from '../../../lib/announce.ts';
import { filterByQuery } from '../../../lib/catalog-search.ts';
import { setFact } from '../../../state/report-draft.ts';
import type { FactsDraft } from '../../../state/report-draft.ts';
import type { FieldErrors } from '../../../state/report-validation.ts';

interface CatalogFieldsProps {
  facts: FactsDraft;
  errors: FieldErrors;
}

/** Espera tras la última tecla antes de anunciar el número de resultados. */
const ANNOUNCE_DELAY_MS = 700;

function resultsText(count: number): string {
  return count === 1 ? 'Hay 1 resultado.' : `Hay ${count} resultados.`;
}

/** Anuncia el número de resultados cuando la persona deja de escribir en la búsqueda. */
function useResultsAnnouncement(query: string, count: number, listName: string): void {
  const announcedQuery = useRef(query);
  useEffect(() => {
    // Solo cuando cambia la búsqueda (no al montar ni por el doble efecto del modo estricto).
    if (announcedQuery.current === query) return;
    const timer = setTimeout(() => {
      announcedQuery.current = query;
      announce(`${resultsText(count)} En la lista de ${listName}.`);
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, count, listName]);
}

/** Agrega la opción elegida al inicio si la búsqueda la dejó fuera. */
function keepSelected<T>(filtered: readonly T[], selected: T | undefined): T[] {
  if (selected === undefined || filtered.includes(selected)) return [...filtered];
  return [selected, ...filtered];
}

/** Selectores de oficina y conducta con filtro. */
export function CatalogFields({ facts, errors }: CatalogFieldsProps) {
  const [entityQuery, setEntityQuery] = useState('');
  const [offenseQuery, setOffenseQuery] = useState('');
  const filteredEntities = filterByQuery(PUBLIC_ENTITIES, entityQuery, (entity) => entity.name);
  const filteredOffenses = filterByQuery(
    OFFENSES,
    offenseQuery,
    (offense) => `${offense.label} ${offense.legalTerm} ${offense.hint}`,
  );
  const selectedOffense = findOffense(facts.offenseCode);
  const entities = keepSelected(filteredEntities, findEntity(facts.entityId));
  const offenses = keepSelected(filteredOffenses, selectedOffense);
  useResultsAnnouncement(entityQuery, filteredEntities.length, 'oficinas');
  useResultsAnnouncement(offenseQuery, filteredOffenses.length, 'conductas');

  return (
    <fieldset>
      <legend>¿Quién y qué?</legend>
      <TextField
        id="entityQuery"
        label="Buscar oficina o institución (opcional)"
        hint={
          <>
            Escribe parte del nombre para reducir la lista. La búsqueda ocurre solo en tu equipo.{' '}
            <span data-testid="entity-results">{resultsText(filteredEntities.length)}</span>
          </>
        }
        value={entityQuery}
        onChange={(event) => setEntityQuery(event.target.value)}
      />
      <SelectField
        id="entityId"
        label="Oficina o institución de gobierno"
        required
        value={facts.entityId}
        error={errors['entityId']}
        onChange={(event) => setFact('entityId', event.target.value)}
        data-testid="entity-select"
      >
        <option value="">Elige una oficina ({filteredEntities.length} en la lista)</option>
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name} ({GOVERNMENT_LEVEL_LABELS[entity.level]})
          </option>
        ))}
      </SelectField>
      <TextField
        id="offenseQuery"
        label="Buscar en la lista de conductas (opcional)"
        hint={
          <>
            Por ejemplo: dinero, contrato, familiar.{' '}
            <span data-testid="offense-results">{resultsText(filteredOffenses.length)}</span>
          </>
        }
        value={offenseQuery}
        onChange={(event) => setOffenseQuery(event.target.value)}
      />
      <SelectField
        id="offenseCode"
        label="¿Qué hizo la persona? Elige lo más parecido"
        hint={selectedOffense?.hint ?? 'Si dudas, elige lo más cercano: la autoridad lo revisará.'}
        required
        value={facts.offenseCode}
        error={errors['offenseCode']}
        onChange={(event) => setFact('offenseCode', event.target.value)}
        data-testid="offense-select"
      >
        <option value="">Elige una conducta ({filteredOffenses.length} en la lista)</option>
        {OFFENSE_SITUATIONS.map(({ situation, label }) => {
          const items = offenses.filter((offense) => offense.situation === situation);
          if (items.length === 0) return null;
          return (
            <optgroup key={situation} label={label}>
              {items.map((offense) => (
                <option key={offense.code} value={offense.code}>
                  {offense.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </SelectField>
    </fieldset>
  );
}
