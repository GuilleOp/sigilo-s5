// Pruebas de «Lo que sale de tu equipo»: la lista dice lo que de verdad viaja según el modo, las
// pruebas, la protección y la corroboración, y las 8 palabras siempre se quedan en el equipo.
import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../../../state/report-draft.ts';
import type { ReportDraft } from '../../../state/report-draft.ts';
import { stayingItems, travellingItems } from './OutgoingPanel.tsx';

function draftWith(overrides: Partial<ReportDraft>): ReportDraft {
  return { ...emptyDraft(), ...overrides };
}

describe('travellingItems y stayingItems', () => {
  it('en modo anónimo no hay sobre con el nombre, ni correo, ni teléfono, ni cuenta', () => {
    const draft = draftWith({ mode: 'anonymous' });
    expect(travellingItems(draft, true).join(' ')).not.toMatch(/sobre aparte/u);
    expect(travellingItems(draft, true)).toContain('Ninguna prueba.');
    expect(stayingItems(draft).join(' ')).toMatch(/correo o tu teléfono: no los pedimos/u);
  });

  it('con identidad sellada dice que el nombre y el contacto viajan sellados', () => {
    const draft = draftWith({ mode: 'sealed', protectionRequested: true });
    const travels = travellingItems(draft, false).join(' ');
    expect(travels).toMatch(/nombre y el contacto que diste, en un sobre aparte/u);
    expect(travels).toMatch(/pediste medidas de protección/u);
    expect(stayingItems(draft).join(' ')).not.toMatch(/no los pedimos/u);
  });

  it('menciona la segunda llave y, solo por la red y si se pidió, la corroboración', () => {
    const corroboration = { kind: 'rfc' as const, value: 'XAXX010101000', personName: '' };
    const draft = draftWith({ mode: 'anonymous', corroboration });
    expect(travellingItems(draft, true).join(' ')).toMatch(/segunda copia.*nunca lleva tu nombre/u);
    expect(travellingItems(draft, true).join(' ')).toMatch(/etiqueta ciega/u);
    expect(travellingItems(draft, false).join(' ')).not.toMatch(/etiqueta ciega/u);
    expect(travellingItems(draftWith({ mode: 'anonymous' }), true).join(' ')).not.toMatch(
      /etiqueta ciega/u,
    );
  });

  it('cuenta las copias limpias de las pruebas', () => {
    const clean = { id: 'a', blob: new Blob(), url: 'blob:a' };
    const item = { clean: [clean, { ...clean, id: 'b' }] } as unknown as ReportDraft['evidence'][0];
    const draft = draftWith({ mode: 'anonymous', evidence: [item] });
    expect(travellingItems(draft, true)).toContain(
      '2 pruebas limpias, sin ubicación ni datos del equipo.',
    );
  });

  it('las 8 palabras nunca viajan', () => {
    for (const mode of ['anonymous', 'sealed'] as const) {
      const draft = draftWith({ mode });
      expect(stayingItems(draft)).toContain('Tus 8 palabras.');
      expect(travellingItems(draft, true).join(' ')).toMatch(/nadie puede saber tus 8 palabras/u);
    }
  });
});
