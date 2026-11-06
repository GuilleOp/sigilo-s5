// Tema de la interfaz: claro, oscuro, alto contraste o «como mi sistema». Es una preferencia de
// interfaz, no un dato de la denuncia: se recuerda en el navegador (con try/catch, porque el
// almacenamiento puede estar bloqueado), salvo en modo quiosco, donde no se guarda nada.
import { createMemoryStore } from './memory-store.ts';

/** Tema elegido. `system` sigue la preferencia del sistema (oscuro o más contraste). */
export type ThemeChoice = 'system' | 'light' | 'dark' | 'contrast';

/** Llave del almacenamiento: solo guarda el nombre del tema. */
export const THEME_STORAGE_KEY = 'sigilo-tema';

const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark', 'contrast'];

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value);
}

/** Lee el tema guardado; `system` si no hay, si no es válido o si el almacenamiento falla. */
export function readStoredTheme(storage: () => Storage = () => window.localStorage): ThemeChoice {
  try {
    const value = storage().getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Guarda el tema. En quiosco lo borra en lugar de guardarlo (el equipo es de todas las personas).
 * Seguridad: solo se guarda esta preferencia, nunca algo de la denuncia (PRV-10).
 */
export function storeTheme(
  choice: ThemeChoice,
  isKiosk: boolean,
  storage: () => Storage = () => window.localStorage,
): void {
  try {
    if (isKiosk || choice === 'system') storage().removeItem(THEME_STORAGE_KEY);
    else storage().setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Almacenamiento bloqueado o lleno: el tema dura solo mientras la página está abierta.
  }
}

/** Refleja el tema en `<html data-theme>`; sin atributo, mandan las preferencias del sistema. */
export function applyTheme(choice: ThemeChoice, root: HTMLElement): void {
  if (choice === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = choice;
}

let initialTheme: ThemeChoice = 'system';

/** Fija el tema de arranque (lo lee `main.tsx` antes de pintar). */
export function setInitialTheme(choice: ThemeChoice): void {
  initialTheme = choice;
  themeStore.reset();
}

/** Tema de esta pestaña. La salida rápida lo deja como al arrancar. */
export const themeStore = createMemoryStore<ThemeChoice>(() => initialTheme);
