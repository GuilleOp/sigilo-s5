// Reglas que emparejan el catálogo de faltas del S5 con las claves de SIGILO.
import { describe, expect, it } from 'vitest';
import { codeFor } from './s5-equivalencias.ts';

const base = { id: 1, entidad: 22, ley: 'LEY DE PRUEBA', articulo: '1', fraccion: null };

function falta(
  clasificacion: 'faltaGrave' | 'noGrave' | 'hechoCorrupcion',
  nombre: string,
  servidorPublico: boolean | null = true,
  particular: boolean | null = false,
) {
  return { ...base, clasificacion, nombre, servidorPublico, particular };
}

describe('equivalencias con el catálogo del S5', () => {
  it('empareja las faltas graves por su nombre, sin importar acentos ni mayúsculas', () => {
    expect(codeFor(falta('faltaGrave', 'Cohecho'))).toBe('LGRA-52');
    expect(codeFor(falta('faltaGrave', 'Actuación bajo Conflicto de Intereses'))).toBe('LGRA-58');
    expect(codeFor(falta('faltaGrave', 'Nepotismo'))).toBe('LGRA-63-BIS');
    expect(codeFor(falta('hechoCorrupcion', 'Cohecho a servidores públicos extranjeros'))).toBe(
      'CPF-222-BIS',
    );
  });

  it('distingue la misma falta cometida por un particular', () => {
    expect(codeFor(falta('faltaGrave', 'Tráfico de influencias'))).toBe('LGRA-61');
    expect(codeFor(falta('faltaGrave', 'Tráfico de influencias', false, true))).toBe('LGRA-68');
    expect(codeFor(falta('faltaGrave', 'Contratación indebida', false, true))).toBe('LGRA-72');
    // El S5 rotula así el art. 55 de servidores; de particulares es el art. 69.
    expect(codeFor(falta('faltaGrave', 'Utilización de información falsa'))).toBe('LGRA-55');
    expect(codeFor(falta('faltaGrave', 'Utilización de información falsa', false, true))).toBe(
      'LGRA-69',
    );
  });

  it('agrupa las no graves y deja fuera los delitos sin equivalente', () => {
    expect(
      codeFor(falta('noGrave', 'No presentación de declaración de situación patrimonial')),
    ).toBe('LGRA-49');
    expect(codeFor(falta('noGrave', 'Daños y perjuicios a la Hacienda Pública'))).toBe('LGRA-50');
    expect(codeFor(falta('hechoCorrupcion', 'Ejercicio indebido y abandono del servicio'))).toBe(
      'CPF-214',
    );
    expect(codeFor(falta('hechoCorrupcion', 'Tortura'))).toBeNull();
  });
});
