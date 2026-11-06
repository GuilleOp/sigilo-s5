// Barra del quiosco con «Terminar y borrar todo», siempre visible cuando el quiosco está activo.
// Los modos de uso se eligen en el menú «Accesibilidad» (AccessibilityTools.tsx).
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PATHS } from '../app/paths.ts';
import { announce } from '../lib/announce.ts';
import { focusAfterRender } from '../lib/focus.ts';
import { resetAllStores, useMemoryStore } from '../state/memory-store.ts';
import { applyModesToDocument, usageModesStore } from '../state/usage-modes.ts';

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
