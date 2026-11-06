// Pruebas de los modos de uso: se leen de la dirección y, al borrar todo, vuelven a los de arranque
// (un quiosco sigue siendo quiosco para la siguiente persona).
import { describe, expect, it } from 'vitest';
import { resetAllStores } from './memory-store.ts';
import { modesFromQuery, setInitialModes, setUsageMode, usageModesStore } from './usage-modes.ts';

describe('modos de uso', () => {
  it('lee los modos de la dirección', () => {
    expect(modesFromQuery('?modo=quiosco,lectura-facil')).toEqual({
      isAssisted: false,
      isKiosk: true,
      isLowConnection: false,
      isEasyReading: true,
    });
    expect(modesFromQuery('').isKiosk).toBe(false);
  });

  it('al borrar todo vuelve a los modos de arranque', () => {
    setInitialModes(modesFromQuery('?modo=quiosco'));
    setUsageMode('isAssisted', true);
    expect(usageModesStore.get().isAssisted).toBe(true);
    resetAllStores();
    expect(usageModesStore.get()).toMatchObject({ isKiosk: true, isAssisted: false });
    setInitialModes(modesFromQuery(''));
  });
});
