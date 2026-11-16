// Pruebas del recorrido con teclado del campo de catálogo (patrón «combobox» de WAI-ARIA, sin
// selección automática): la flecha abajo no se salta la primera opción.
import { describe, expect, it } from 'vitest';
import { nextActiveIndex, openingActiveIndex } from './ComboboxField.tsx';

describe('campo de catálogo con teclado', () => {
  it('después de escribir (sin opción activa), la flecha abajo va a la primera', () => {
    expect(nextActiveIndex(-1, 'ArrowDown', 5)).toBe(0);
    expect(nextActiveIndex(0, 'ArrowDown', 5)).toBe(1);
    expect(nextActiveIndex(-1, 'ArrowUp', 5)).toBe(4);
    expect(nextActiveIndex(4, 'ArrowDown', 5)).toBe(4);
    expect(nextActiveIndex(0, 'ArrowUp', 5)).toBe(0);
    expect(nextActiveIndex(-1, 'ArrowDown', 0)).toBe(-1);
  });

  it('al abrir marca la elegida; sin elegida, la primera con flecha y ninguna con el ratón', () => {
    expect(openingActiveIndex(2, 'ArrowDown', 5)).toBe(2);
    expect(openingActiveIndex(-1, 'ArrowDown', 5)).toBe(0);
    expect(openingActiveIndex(-1, 'ArrowUp', 5)).toBe(4);
    expect(openingActiveIndex(-1, null, 5)).toBe(-1);
  });
});
