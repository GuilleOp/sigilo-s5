// Lectura de las equivalencias con el catálogo de faltas del S5.
import { describe, expect, it } from 'vitest';
import { equivalenceStateKey, localReferences } from './s5-equivalences.ts';
import type { S5Equivalences } from './s5-equivalences.ts';

const DATA: S5Equivalences = {
  fuente: 'prueba',
  generado: '2026-11-11',
  leyes: ['LEY DE RESPONSABILIDADES DE PRUEBA', 'CÓDIGO PENAL DE PRUEBA'],
  entidades: {
    '22': {
      'LGRA-52': [
        [10, 0, '39'],
        [11, 1, '268, fr. I'],
      ],
    },
  },
};

describe('equivalencias del S5', () => {
  it('devuelve los artículos de la entidad y resuelve la clave equivalente a la principal', () => {
    expect(localReferences(DATA, '22', 'CPF-222')).toEqual([
      { s5Id: 10, law: 'LEY DE RESPONSABILIDADES DE PRUEBA', article: '39' },
      { s5Id: 11, law: 'CÓDIGO PENAL DE PRUEBA', article: '268, fr. I' },
    ]);
    expect(localReferences(DATA, '20', 'LGRA-52')).toEqual([]);
  });

  it('usa la ley federal para oficinas federales', () => {
    expect(equivalenceStateKey('VE-INSTITUTO', '22')).toBe('federal');
  });
});
