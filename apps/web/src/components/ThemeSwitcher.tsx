// Selector de tema visible y accesible: grupo de botones de opción (claro, oscuro, alto contraste
// o «como mi sistema»). La elección se recuerda en el navegador salvo en modo quiosco.
import { useEffect } from 'react';
import { useMemoryStore } from '../state/memory-store.ts';
import { applyTheme, storeTheme, themeStore } from '../state/theme.ts';
import type { ThemeChoice } from '../state/theme.ts';
import { usageModesStore } from '../state/usage-modes.ts';

const OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Como mi sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'contrast', label: 'Alto contraste' },
];

/** Selector de tema. */
export function ThemeSwitcher() {
  const theme = useMemoryStore(themeStore);
  const { isKiosk } = useMemoryStore(usageModesStore);

  useEffect(() => {
    applyTheme(theme, document.documentElement);
    storeTheme(theme, isKiosk);
  }, [theme, isKiosk]);

  return (
    <fieldset className="theme-switcher no-print" data-testid="theme-switcher">
      <legend>Colores de la página</legend>
      <div className="theme-switcher__options">
        {OPTIONS.map((option) => (
          <span key={option.value} className="theme-switcher__option">
            <input
              type="radio"
              id={`theme-${option.value}`}
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => themeStore.set(() => option.value)}
              data-testid={`theme-${option.value}`}
            />
            <label htmlFor={`theme-${option.value}`}>{option.label}</label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}
