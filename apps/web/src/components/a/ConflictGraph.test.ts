// Pruebas del acomodo de nombres en el grafo del conflicto: dos líneas sin truncar y, si no cabe,
// solo se abrevia la razón social.
import { describe, expect, it } from 'vitest';
import { organizationLines, wrapWords } from './ConflictGraph.tsx';

describe('grafo del conflicto', () => {
  it('parte por palabras sin cortar ninguna', () => {
    expect(wrapWords('Inmobiliaria Ficticia Ejemplo, S.A. de C.V.', 26)).toEqual([
      'Inmobiliaria Ficticia',
      'Ejemplo, S.A. de C.V.',
    ]);
  });

  it('los nombres del escenario caben completos en dos líneas', () => {
    for (const name of [
      'Inmobiliaria Ficticia Ejemplo, S.A. de C.V.',
      'Asociación Ficticia de Egresados Ejemplo, A.C.',
    ]) {
      const lines = organizationLines(name);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.join(' ')).toBe(name);
    }
  });

  it('si no cabe, abrevia solo la razón social', () => {
    const lines = organizationLines(
      'Constructora Ficticia del Norte, Sociedad Anónima de Capital Variable',
    );
    expect(lines).toEqual(['Constructora Ficticia del', 'Norte, S.A. de C.V.']);
  });

  it('nunca pasa de dos líneas', () => {
    const lines = organizationLines(
      'Fundación Ficticia para el Desarrollo Comunitario Sustentable del Sureste Mexicano, A.C.',
    );
    expect(lines.length).toBe(2);
  });
});
