// Pruebas de la normalización del identificador y de su etiqueta de dominio.
import { describe, expect, it } from 'vitest';
import { utf8Decode } from '@sigilo/core';
import {
  corroborationInput,
  corroborationLabel,
  normalizeEntityId,
  normalizeIdentifier,
  normalizeOcid,
  normalizePersonName,
  normalizeRfc,
} from './identifier.ts';

describe('normalización del identificador', () => {
  it('normaliza el nombre como @sigilo/anonimato: sin acentos, mayúsculas, sin palabras vacías', () => {
    expect(normalizePersonName('  Servidor  Ficticio Úno de la Peña ')).toBe(
      'SERVIDOR FICTICIO UNO PENA',
    );
    expect(normalizePersonName('servidor ficticio uno')).toBe(
      normalizePersonName('SERVIDOR FICTICIO ÚNO'),
    );
    expect(() => normalizePersonName('Uno')).toThrow('nombre y apellido');
    expect(() => normalizePersonName('de la')).toThrow();
  });

  it('normaliza la clave del ente, el RFC y el ocid', () => {
    expect(normalizeEntityId(' ve-programas ')).toBe('VE-PROGRAMAS');
    expect(() => normalizeEntityId('VE PROGRAMAS')).toThrow('ente');
    expect(normalizeRfc('cfe-010101 aa1')).toBe('CFE010101AA1');
    expect(normalizeRfc('ñaxe-900101-ab3')).toBe('ÑAXE900101AB3');
    expect(() => normalizeRfc('CFE01010')).toThrow('RFC');
    expect(normalizeOcid(' ocds-fict00-IFFE-AD-2026-0042 ')).toBe('OCDS-FICT00-IFFE-AD-2026-0042');
    expect(() => normalizeOcid('IFFE-AD-2026-0042')).toThrow('procedimiento');
  });

  it('arma la etiqueta de dominio con el tipo y el valor', () => {
    expect(
      corroborationLabel({
        kind: 'servidor',
        name: 'Servidor Ficticio Uno',
        entityId: 'VE-INSTITUTO',
      }),
    ).toBe('sigilo/v1/corroboration/servidor:SERVIDOR FICTICIO UNO|VE-INSTITUTO');
    expect(corroborationLabel({ kind: 'rfc', rfc: 'CFE010101AA1' })).toBe(
      'sigilo/v1/corroboration/rfc:CFE010101AA1',
    );
    const input = corroborationInput({ kind: 'ocid', ocid: 'ocds-fict00-IFFE-AD-2026-0042' });
    expect(utf8Decode(input)).toBe('sigilo/v1/corroboration/ocid:OCDS-FICT00-IFFE-AD-2026-0042');
    expect(normalizeIdentifier({ kind: 'rfc', rfc: 'cfe010101aa1' })).toBe('CFE010101AA1');
  });
});
