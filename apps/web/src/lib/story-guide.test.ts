// Ayudas del relato: partes presentes y conductas sugeridas por palabras.
import { describe, expect, it } from 'vitest';
import { storyParts, suggestOffenses } from './story-guide.ts';

const STORY =
  'En marzo, en la ventanilla de licencias, el encargado me pidió dinero para agilizar el trámite y como no pagué retrasó mi permiso dos semanas.';

describe('ayudas del relato', () => {
  it('marca las partes que el relato ya cuenta', () => {
    const present = Object.fromEntries(storyParts(STORY).map((part) => [part.key, part.isPresent]));
    expect(present).toEqual({ what: true, when: true, where: true, effect: true });
    const empty = storyParts('Algo pasó y no me gustó para nada.');
    expect(empty.find((part) => part.key === 'when')?.isPresent).toBe(false);
  });

  it('sugiere el cohecho cuando le piden dinero, sin importar acentos', () => {
    expect(suggestOffenses(STORY).map((offense) => offense.code)).toContain('LGRA-52');
    expect(
      suggestOffenses(
        'El director contrató a su hermano y a su sobrino como asesores sin concurso.',
      ).map((offense) => offense.code),
    ).toContain('LGRA-63-BIS');
  });

  it('no sugiere nada con relatos muy cortos o sin palabras clave', () => {
    expect(suggestOffenses('Me pidió dinero')).toEqual([]);
    expect(suggestOffenses('La oficina estaba cerrada todo el día y nadie me atendió.')).toEqual(
      [],
    );
  });
});
