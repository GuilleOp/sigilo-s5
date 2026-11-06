// Pruebas del tema: se recuerda solo el nombre del tema, nunca en quiosco, y un almacenamiento
// bloqueado no rompe nada.
import { describe, expect, it } from 'vitest';
import { readStoredTheme, storeTheme, THEME_STORAGE_KEY } from './theme.ts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const BLOCKED = (): Storage => {
  throw new Error('Almacenamiento bloqueado');
};

describe('tema', () => {
  it('guarda y lee el tema elegido', () => {
    const storage = memoryStorage();
    storeTheme('contrast', false, () => storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('contrast');
    expect(readStoredTheme(() => storage)).toBe('contrast');
    expect(storage.length).toBe(1);
  });

  it('en quiosco no guarda nada y borra lo anterior', () => {
    const storage = memoryStorage();
    storeTheme('dark', false, () => storage);
    storeTheme('dark', true, () => storage);
    expect(storage.length).toBe(0);
  });

  it('un valor inválido o un almacenamiento bloqueado dan «como mi sistema»', () => {
    const storage = memoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'fucsia');
    expect(readStoredTheme(() => storage)).toBe('system');
    expect(readStoredTheme(BLOCKED)).toBe('system');
    expect(() => storeTheme('dark', false, BLOCKED)).not.toThrow();
  });
});
