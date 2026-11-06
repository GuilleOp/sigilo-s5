// Ajustes de lectura del menú «Accesibilidad»: tamaño del texto, interlineado y espacio entre
// letras. Como el tema, son preferencias de la interfaz y no datos de la denuncia: se recuerdan en
// el navegador (con try/catch), salvo en modo quiosco, donde no se guarda nada (PRV-10).
import { createMemoryStore } from './memory-store.ts';

/** Ajustes de lectura. `lineHeight` nulo deja el interlineado de la hoja de estilos. */
export interface DisplaySettings {
  /** Tamaño del texto en porcentaje (100 = tamaño normal). */
  textScale: number;
  /** Interlineado, o `null` para el de la página. */
  lineHeight: number | null;
  /** Espacio entre letras, en `em`. */
  letterSpacing: number;
}

export const TEXT_SCALE = { min: 100, max: 200, step: 10, default: 100 } as const;
export const LINE_HEIGHT = { min: 1.5, max: 2.5, step: 0.1, default: 1.5 } as const;
export const LETTER_SPACING = { min: 0, max: 0.2, step: 0.02, default: 0 } as const;

/** Llave del almacenamiento: solo guarda estos tres números. */
export const DISPLAY_STORAGE_KEY = 'sigilo-lectura';

export const DEFAULT_DISPLAY: DisplaySettings = {
  textScale: TEXT_SCALE.default,
  lineHeight: null,
  letterSpacing: LETTER_SPACING.default,
};

/** Redondea al paso y limita al rango (evita errores de coma flotante como 1.7000000000000002). */
export function snap(value: number, range: { min: number; max: number; step: number }): number {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const steps = Math.round((clamped - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(4));
}

/** Indica si los ajustes son los de la página (nada que guardar ni aplicar). */
export function isDefaultDisplay(settings: DisplaySettings): boolean {
  return (
    settings.textScale === TEXT_SCALE.default &&
    settings.lineHeight === null &&
    settings.letterSpacing === LETTER_SPACING.default
  );
}

/** Valida lo leído del almacenamiento; cualquier valor extraño vuelve al ajuste normal. */
export function parseDisplaySettings(raw: unknown): DisplaySettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DISPLAY;
  const value = raw as Record<string, unknown>;
  const number = (key: string): number | null =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : null;
  const scale = number('textScale');
  const line = number('lineHeight');
  const spacing = number('letterSpacing');
  return {
    textScale: scale === null ? TEXT_SCALE.default : snap(scale, TEXT_SCALE),
    lineHeight: line === null ? null : snap(line, LINE_HEIGHT),
    letterSpacing: spacing === null ? LETTER_SPACING.default : snap(spacing, LETTER_SPACING),
  };
}

/** Lee los ajustes guardados; los normales si no hay o si el almacenamiento falla. */
export function readStoredDisplay(
  storage: () => Storage = () => window.localStorage,
): DisplaySettings {
  try {
    const text = storage().getItem(DISPLAY_STORAGE_KEY);
    return text === null ? DEFAULT_DISPLAY : parseDisplaySettings(JSON.parse(text));
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/** Guarda los ajustes; en quiosco o con los normales, borra lo guardado. */
export function storeDisplay(
  settings: DisplaySettings,
  isKiosk: boolean,
  storage: () => Storage = () => window.localStorage,
): void {
  try {
    if (isKiosk || isDefaultDisplay(settings)) storage().removeItem(DISPLAY_STORAGE_KEY);
    else storage().setItem(DISPLAY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Almacenamiento bloqueado o lleno: los ajustes duran mientras la página está abierta.
  }
}

/** Refleja los ajustes en `<html>` como variables que usan los estilos base. */
export function applyDisplay(settings: DisplaySettings, root: HTMLElement): void {
  root.style.setProperty('--user-text-scale', String(settings.textScale / 100));
  if (settings.lineHeight === null) root.style.removeProperty('--user-line-height');
  else root.style.setProperty('--user-line-height', String(settings.lineHeight));
  if (settings.letterSpacing === 0) root.style.removeProperty('--user-letter-spacing');
  else root.style.setProperty('--user-letter-spacing', `${settings.letterSpacing}em`);
}

let initialDisplay: DisplaySettings = DEFAULT_DISPLAY;

/** Fija los ajustes de arranque (los lee `main.tsx` antes de pintar). */
export function setInitialDisplay(settings: DisplaySettings): void {
  initialDisplay = settings;
  displayStore.reset();
}

/** Ajustes de esta pestaña. La salida rápida los deja como al arrancar. */
export const displayStore = createMemoryStore<DisplaySettings>(() => initialDisplay);
