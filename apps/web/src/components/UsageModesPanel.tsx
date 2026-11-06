// Modos de uso: denuncia asistida, quiosco, poca conexión y lectura fácil (en «Preferencias»), y
// la barra del quiosco con «Terminar y borrar todo», siempre visible cuando el quiosco está activo.
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '../app/paths.ts';
import { announce } from '../lib/announce.ts';
import { focusAfterRender } from '../lib/focus.ts';
import { resetAllStores, useMemoryStore } from '../state/memory-store.ts';
import { applyModesToDocument, setUsageMode, usageModesStore } from '../state/usage-modes.ts';
import type { UsageModes } from '../state/usage-modes.ts';

const MODES: readonly { key: keyof UsageModes; label: string; hint: string }[] = [
  {
    key: 'isAssisted',
    label: 'Me ayuda otra persona',
    hint: 'Te avisamos cuándo pedirle que se aparte, para que solo tú veas tus 8 palabras.',
  },
  {
    key: 'isKiosk',
    label: 'Equipo compartido (quiosco)',
    hint: 'No se puede copiar el recibo y, al terminar, se borra todo de esta pantalla.',
  },
  {
    key: 'isLowConnection',
    label: 'Tengo poca conexión',
    hint: 'Si una consulta falla, la repetimos hasta 4 veces (en lugar de 2), con más espera entre intentos, y te avisamos. Los envíos nunca se repiten solos.',
  },
  {
    key: 'isEasyReading',
    label: 'Lectura fácil',
    hint: 'Agranda la letra y deja más espacio entre líneas y entre palabras.',
  },
];

/** Barra del quiosco; además refleja los modos en `<html>` para los estilos. */
export function KioskBar() {
  const modes = useMemoryStore(usageModesStore);
  const navigate = useNavigate();
  useEffect(() => applyModesToDocument(modes, document.documentElement), [modes]);
  if (!modes.isKiosk) return null;

  function finishKiosk(): void {
    // Seguridad: en un equipo compartido no debe quedar nada de la denuncia ni del recibo.
    resetAllStores();
    void navigate(PATHS.home);
    focusAfterRender(() => document.querySelector<HTMLElement>('#contenido h1'));
    announce(
      'Terminamos y borramos todo de esta pantalla. El equipo está listo para otra persona.',
    );
  }

  return (
    <div className="kiosk-bar no-print" data-testid="kiosk-bar">
      <p>
        <strong>Equipo compartido.</strong> Nada se guarda aquí. Anota tus 8 palabras en papel y no
        les tomes foto con este equipo.
      </p>
      <button type="button" className="button" onClick={finishKiosk} data-testid="kiosk-finish">
        Terminar y borrar todo
      </button>
    </div>
  );
}

/** Casillas de los modos de uso. */
export function UsageModesPanel() {
  const modes = useMemoryStore(usageModesStore);
  return (
    <fieldset className="usage-modes" data-testid="usage-modes">
      <legend>Modos de uso</legend>
      {MODES.map((mode) => (
        <div key={mode.key} className="choice">
          <input
            type="checkbox"
            id={`usage-mode-${mode.key}`}
            checked={modes[mode.key]}
            aria-describedby={`usage-mode-${mode.key}-hint`}
            onChange={(event) => setUsageMode(mode.key, event.target.checked)}
            data-testid={`usage-${mode.key}`}
          />
          <div>
            <label htmlFor={`usage-mode-${mode.key}`} className="choice__title">
              {mode.label}
            </label>
            <p id={`usage-mode-${mode.key}-hint`} className="usage-modes__hint">
              {mode.hint}
            </p>
          </div>
        </div>
      ))}
    </fieldset>
  );
}
