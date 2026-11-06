// Pruebas de los ajustes de lectura: valores dentro de su rango y paso, solo números guardados,
// nada en quiosco ni con los ajustes normales, y un almacenamiento bloqueado no rompe nada.
import { describe, expect, it } from 'vitest';
import {
  applyDisplay,
  DEFAULT_DISPLAY,
  DISPLAY_STORAGE_KEY,
  LINE_HEIGHT,
  parseDisplaySettings,
  readStoredDisplay,
  snap,
  storeDisplay,
  TEXT_SCALE,
} from './display-settings.ts';

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

describe('ajustes de lectura', () => {
  it('ajusta al paso y al rango sin errores de coma flotante', () => {
    expect(snap(1.7000000001, LINE_HEIGHT)).toBe(1.7);
    expect(snap(9, LINE_HEIGHT)).toBe(2.5);
    expect(snap(95, TEXT_SCALE)).toBe(100);
    expect(snap(134, TEXT_SCALE)).toBe(130);
  });

  it('guarda y lee solo los tres números', () => {
    const storage = memoryStorage();
    const settings = { textScale: 150, lineHeight: 2, letterSpacing: 0.06 };
    storeDisplay(settings, false, () => storage);
    expect(JSON.parse(storage.getItem(DISPLAY_STORAGE_KEY) ?? '')).toEqual(settings);
    expect(readStoredDisplay(() => storage)).toEqual(settings);
  });

  it('no guarda nada en quiosco ni con los ajustes normales', () => {
    const storage = memoryStorage();
    storeDisplay({ ...DEFAULT_DISPLAY, textScale: 150 }, false, () => storage);
    storeDisplay({ ...DEFAULT_DISPLAY, textScale: 150 }, true, () => storage);
    expect(storage.length).toBe(0);
    storeDisplay({ ...DEFAULT_DISPLAY, textScale: 150 }, false, () => storage);
    storeDisplay(DEFAULT_DISPLAY, false, () => storage);
    expect(storage.length).toBe(0);
  });

  it('descarta valores extraños y sobrevive a un almacenamiento bloqueado', () => {
    expect(parseDisplaySettings({ textScale: 'grande', lineHeight: 99, extra: 'x' })).toEqual({
      textScale: 100,
      lineHeight: 2.5,
      letterSpacing: 0,
    });
    expect(parseDisplaySettings(null)).toEqual(DEFAULT_DISPLAY);
    expect(readStoredDisplay(BLOCKED)).toEqual(DEFAULT_DISPLAY);
    expect(() => storeDisplay(DEFAULT_DISPLAY, false, BLOCKED)).not.toThrow();
  });

  it('refleja los ajustes como variables del documento', () => {
    const properties = new Map<string, string>();
    const root = {
      style: {
        setProperty: (key: string, value: string) => void properties.set(key, value),
        removeProperty: (key: string) => void properties.delete(key),
      },
    } as unknown as HTMLElement;
    applyDisplay({ textScale: 130, lineHeight: 2, letterSpacing: 0.04 }, root);
    expect(Object.fromEntries(properties)).toEqual({
      '--user-text-scale': '1.3',
      '--user-line-height': '2',
      '--user-letter-spacing': '0.04em',
    });
    applyDisplay(DEFAULT_DISPLAY, root);
    expect(Object.fromEntries(properties)).toEqual({ '--user-text-scale': '1' });
  });
});
