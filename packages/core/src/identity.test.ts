// Pruebas del bloque de identidad sellado: relleno fijo, AAD ligado al recibo y validación.
import type { IdentityBlock } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { fromBase64Url } from './encoding.ts';
import { openIdentity, sealIdentity } from './identity.ts';
import { generateBoxKeyPair, keyIdFor } from './keys.ts';
import { deriveReceiptKeys } from './receipt-keys.ts';
import { randomBytes } from './random.ts';

const OPEN_ERROR = 'No se pudo abrir el sobre.';
// Datos sintéticos de prueba.
const BLOCK: IdentityBlock = {
  fullName: 'Persona Ficticia Pérez',
  contact: 'contacto@ejemplo.invalid',
  witnesses: ['Testigo Uno'],
  originalEvidenceSha256: ['a'.repeat(64)],
};

function setup() {
  const authority = generateBoxKeyPair();
  const recipient = { keyId: keyIdFor(authority.publicKey), publicKey: authority.publicKey };
  const { authVerifier } = deriveReceiptKeys(randomBytes(11));
  return { authority, recipient, authVerifier };
}

describe('identidad sellada', () => {
  it('hace ida y vuelta', async () => {
    const { authority, recipient, authVerifier } = setup();
    const envelope = await sealIdentity(BLOCK, recipient, authVerifier);
    expect(await openIdentity(envelope, authority.privateKey, authVerifier)).toEqual(BLOCK);
  });

  it('oculta la longitud: bloques distintos producen el mismo tamaño', async () => {
    const { recipient, authVerifier } = setup();
    const small = await sealIdentity(
      { fullName: 'A', witnesses: [], originalEvidenceSha256: [] },
      recipient,
      authVerifier,
    );
    const large = await sealIdentity(BLOCK, recipient, authVerifier);
    // 4096 bytes de texto en claro más 16 de etiqueta.
    expect(fromBase64Url(small.ct)).toHaveLength(4112);
    expect(fromBase64Url(large.ct)).toHaveLength(4112);
  });

  it('descarta campos ajenos al esquema', async () => {
    const { authority, recipient, authVerifier } = setup();
    const extra = { ...BLOCK, extra: 'no debe viajar' } as IdentityBlock;
    const envelope = await sealIdentity(extra, recipient, authVerifier);
    expect(await openIdentity(envelope, authority.privateKey, authVerifier)).toEqual(BLOCK);
  });

  it('no abre con otro authVerifier ni con otra llave', async () => {
    const { authority, recipient, authVerifier } = setup();
    const envelope = await sealIdentity(BLOCK, recipient, authVerifier);
    const otherVerifier = deriveReceiptKeys(randomBytes(11)).authVerifier;
    await expect(openIdentity(envelope, authority.privateKey, otherVerifier)).rejects.toThrow(
      OPEN_ERROR,
    );
    await expect(
      openIdentity(envelope, generateBoxKeyPair().privateKey, authVerifier),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza bloques inválidos sin citar sus datos', async () => {
    const { recipient, authVerifier } = setup();
    const invalid = { ...BLOCK, fullName: '' };
    await expect(sealIdentity(invalid, recipient, authVerifier)).rejects.toThrow(
      'El bloque de identidad no es válido.',
    );
  });

  it('rechaza bloques que exceden 4096 bytes', async () => {
    const { recipient, authVerifier } = setup();
    const huge: IdentityBlock = {
      fullName: 'Ñ'.repeat(200),
      contact: 'Ñ'.repeat(200),
      witnesses: Array<string>(10).fill('Ñ'.repeat(500)),
      originalEvidenceSha256: [],
    };
    await expect(sealIdentity(huge, recipient, authVerifier)).rejects.toThrow('excede 4096 bytes');
  });

  it('rechaza un authVerifier mal formado', async () => {
    const { recipient } = setup();
    await expect(sealIdentity(BLOCK, recipient, 'no válido')).rejects.toThrow('verificador');
  });
});
