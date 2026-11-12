// Pruebas de TOTP (RFC 6238) y HOTP (RFC 4226): vectores de los RFC, bordes de la ventana de ±1
// paso, un solo uso por paso, Base32 y la URI `otpauth://`.
import { describe, expect, it } from 'vitest';
import {
  fromBase32,
  hotp,
  isTotpCodeFormat,
  otpauthUri,
  toBase32,
  totpCode,
  totpStep,
  verifyTotp,
} from './totp.ts';

/** Secreto de los apéndices de ambos RFC para SHA-1: «12345678901234567890» en ASCII. */
const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

describe('HOTP (RFC 4226, apéndice D)', () => {
  it('reproduce los diez valores de prueba', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expect(expected.map((_, counter) => hotp(RFC_SECRET, counter))).toEqual(expected);
  });
});

describe('TOTP (RFC 6238, apéndice B, SHA-1)', () => {
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('en %i s da %s con 8 dígitos', (seconds, code) => {
    expect(totpCode(RFC_SECRET, seconds * 1000, { digits: 8 })).toBe(code);
  });

  it('con 6 dígitos da los últimos seis de cada vector', () => {
    for (const [seconds, code] of vectors) {
      expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code.slice(2));
    }
  });

  it('cambia de paso cada 30 segundos exactos', () => {
    expect(totpStep(29_999)).toBe(0);
    expect(totpStep(30_000)).toBe(1);
    expect(totpStep(59_000)).toBe(1);
  });
});

describe('verificación con ventana de ±1 paso', () => {
  const now = 1_700_000_015_000;
  const step = totpStep(now);

  it('acepta el paso anterior, el actual y el siguiente y dice cuál coincidió', () => {
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
  });

  it('rechaza dos pasos atrás o adelante', () => {
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), now, null)).toBeNull();
  });

  it('en el borde del paso, el código anterior sigue valiendo 30 s y luego vence', () => {
    const boundary = (step + 1) * 30_000;
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, boundary - 1, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, boundary, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, boundary + 29_999, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, boundary + 30_000, null)).toBeNull();
  });

  it('no repite: un paso igual o anterior al último aceptado no vale', () => {
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step + 1)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
    // El siguiente paso sigue sirviendo después de aceptar el actual.
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now, step)).toBe(step + 1);
  });

  it('rechaza formatos que no son 6 dígitos y acepta espacios', () => {
    expect(isTotpCodeFormat('12345')).toBe(false);
    expect(isTotpCodeFormat('1234567')).toBe(false);
    expect(isTotpCodeFormat('12a456')).toBe(false);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, 'ABCDEF', now, null)).toBeNull();
  });
});

describe('Base32 y otpauth://', () => {
  it('codifica como RFC 4648 (sin relleno) y vuelve', () => {
    expect(toBase32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    expect(toBase32(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(fromBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(RFC_SECRET);
    expect(fromBase32('MZXW6YTBOI======')).toEqual(new TextEncoder().encode('foobar'));
    expect(() => fromBase32('MZXW6YTB01')).toThrow(/Base32/u);
  });

  it('arma la URI con emisor, etiqueta, secreto y parámetros', () => {
    const uri = otpauthUri({
      issuer: 'SIGILO node.federal',
      label: 'fiscalia',
      secret: RFC_SECRET,
    });
    expect(uri).toBe(
      'otpauth://totp/SIGILO%20node.federal:fiscalia?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=SIGILO%20node.federal&algorithm=SHA1&digits=6&period=30',
    );
  });
});
