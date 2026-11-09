// Campo único para elegir de un catálogo: se escribe para filtrar y se elige en la misma lista
// (patrón «combobox» de WAI-ARIA con lista desplegable). Sustituye al par «Buscar» + «Elige», que
// obligaba a usar dos campos para una sola decisión.
// Seguridad: el filtro corre en el navegador sobre el catálogo completo; nada de lo escrito sale.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { announce } from '../lib/announce.ts';
import { filterByQuery } from '../lib/catalog-search.ts';
import { FieldShell, PRIVATE_TEXT_ATTRIBUTES } from './Field.tsx';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Clave del grupo al que pertenece, si la lista se agrupa. */
  group?: string;
}

export interface ComboboxGroup {
  key: string;
  label: string;
}

interface ComboboxFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  options: readonly ComboboxOption[];
  /** Grupos en el orden en que se muestran; sin grupos, la lista es plana. */
  groups?: readonly ComboboxGroup[];
  value: string;
  onChange: (value: string) => void;
  /** Texto en el que se busca; por omisión, la etiqueta. */
  searchText?: (option: ComboboxOption) => string;
  /** Nombre en plural de lo que se lista, para el anuncio de resultados («oficinas»). */
  noun: string;
  testId: string;
}

/** Espera tras la última tecla antes de anunciar el número de resultados. */
const ANNOUNCE_DELAY_MS = 700;

function resultsText(count: number, noun: string): string {
  if (count === 0) return `Ninguna coincidencia en la lista de ${noun}.`;
  return count === 1 ? 'Hay 1 resultado.' : `Hay ${count} resultados.`;
}

/** Ordena por grupo para que las flechas recorran la lista en el orden en que se ve. */
function inGroupOrder(
  options: readonly ComboboxOption[],
  groups: readonly ComboboxGroup[] | undefined,
): ComboboxOption[] {
  if (groups === undefined) return [...options];
  return groups.flatMap(({ key }) => options.filter((option) => option.group === key));
}

/** Campo de catálogo con búsqueda y lista en un solo control. */
export function ComboboxField({
  id,
  label,
  hint,
  error,
  required,
  options,
  groups,
  value,
  onChange,
  searchText = (option) => option.label,
  noun,
  testId,
}: ComboboxFieldProps) {
  const [query, setQuery] = useState('');
  /** La persona está escribiendo: el texto es su búsqueda, no la opción elegida. */
  const [isTyping, setTyping] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const announcedQuery = useRef(query);

  const selected = options.find((option) => option.value === value);
  const shown = inGroupOrder(
    isTyping ? filterByQuery(options, query, searchText) : options,
    groups,
  );
  const listId = `${id}-lista`;
  const optionId = (index: number) => `${id}-opcion-${index}`;
  const activeOption = isOpen && active >= 0 ? shown[active] : undefined;

  // Anuncia cuántas opciones quedan cuando la persona deja de escribir.
  useEffect(() => {
    if (!isTyping || announcedQuery.current === query) return;
    const timer = setTimeout(() => {
      announcedQuery.current = query;
      announce(resultsText(shown.length, noun));
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isTyping, query, shown.length, noun]);

  // La opción activa queda a la vista dentro de la lista.
  useEffect(() => {
    if (!isOpen || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  function open(): void {
    setOpen(true);
    setActive(
      Math.max(
        0,
        shown.findIndex((option) => option.value === value),
      ),
    );
  }

  function close(): void {
    setOpen(false);
    setTyping(false);
    setQuery('');
    setActive(-1);
  }

  function choose(option: ComboboxOption): void {
    onChange(option.value);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) return open();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => Math.min(shown.length - 1, Math.max(0, current + step)));
    } else if (event.key === 'Enter' && activeOption !== undefined) {
      // Enter elige la opción marcada y no envía el formulario.
      event.preventDefault();
      choose(activeOption);
    } else if (event.key === 'Escape' && isOpen) {
      close();
    }
  }

  const renderOption = (option: ComboboxOption) => {
    const index = shown.indexOf(option);
    const isSelected = option.value === value;
    return (
      <div
        key={option.value}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        className={`combobox__option${index === active ? ' combobox__option--active' : ''}`}
        data-testid={`${testId}-option`}
        data-value={option.value}
        onPointerMove={() => setActive(index)}
        onClick={() => choose(option)}
      >
        <span>{option.label}</span>
        {isSelected && (
          <span className="combobox__check" aria-hidden="true">
            ✓
          </span>
        )}
      </div>
    );
  };

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <div className="combobox">
          <input
            id={id}
            type="text"
            role="combobox"
            {...PRIVATE_TEXT_ATTRIBUTES}
            className="combobox__input"
            placeholder="Escribe o elige de la lista"
            value={isTyping ? query : (selected?.label ?? '')}
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={isOpen && shown.length > 0 ? listId : undefined}
            aria-activedescendant={activeOption ? optionId(active) : undefined}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            aria-required={required ? true : undefined}
            data-testid={testId}
            onClick={() => (isOpen ? close() : open())}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              setQuery(event.target.value);
              setTyping(true);
              setOpen(true);
              setActive(0);
            }}
            // Al salir sin elegir se conserva la opción que ya estaba.
            onBlur={close}
          />
          <span className="combobox__chevron" aria-hidden="true" />
          {isOpen && shown.length === 0 && (
            <p className="combobox__empty">Sin coincidencias. Prueba con otra palabra.</p>
          )}
          {isOpen && shown.length > 0 && (
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              className="combobox__list"
              // Pulsar una opción no quita el foco del campo (si no, se cerraría antes del clic).
              onPointerDown={(event) => event.preventDefault()}
            >
              {groups === undefined
                ? shown.map(renderOption)
                : groups.map(({ key, label: groupLabel }) => {
                    const items = shown.filter((option) => option.group === key);
                    if (items.length === 0) return null;
                    return (
                      <div key={key} role="group" aria-labelledby={`${id}-grupo-${key}`}>
                        <p id={`${id}-grupo-${key}`} className="combobox__group">
                          {groupLabel}
                        </p>
                        {items.map(renderOption)}
                      </div>
                    );
                  })}
            </div>
          )}
        </div>
      )}
    </FieldShell>
  );
}
