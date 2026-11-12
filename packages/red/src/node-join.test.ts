// Pruebas del alta de un nodo sin secretos: paquete de la red, solicitud firmada, huellas,
// rotación del enlace y secretos derivados iguales en ambos lados.
import { describe, expect, it } from 'vitest';
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor, toBase64Url } from '@sigilo/core';
import { encodePublicKey, trustAnchorFromDirectory } from './directory.ts';
import { buildDemoDirectory, generateDemoNetworkKeys } from './demo-network.ts';
import { signFunctionTable } from './function-table.ts';
import {
  deriveLinkSecrets,
  joinRequestFingerprint,
  networkFingerprint,
  sameFingerprint,
  signJoinRequest,
  signLinkRotation,
  signNetworkPackage,
  verifyJoinRequest,
  verifyLinkRotation,
  verifyNetworkPackage,
} from './node-join.ts';
import type { NodeJoinRequestBody } from './node-join.ts';

const DAY = '2026-11-12';

function joinBody(): {
  body: NodeJoinRequestBody;
  signing: ReturnType<typeof generateSigningKeyPair>;
  link: ReturnType<typeof generateBoxKeyPair>;
} {
  const signing = generateSigningKeyPair();
  const box = generateBoxKeyPair();
  const inboxBox = generateBoxKeyPair();
  const inboxSigning = generateSigningKeyPair();
  const link = generateBoxKeyPair();
  const nodeSigning = encodePublicKey(signing.publicKey);
  const nodeBox = encodePublicKey(box.publicKey);
  const table = signFunctionTable(
    {
      format: 1,
      nodeId: 'node.ejemplo',
      stateCode: '20',
      version: 1,
      issuedOn: DAY,
      functions: {
        intake: [
          {
            governmentLevels: ['estatal', 'municipal'],
            entityIds: [],
            holder: { kind: 'authority', authorityId: 'authority.buzon-ejemplo' },
          },
        ],
        operation: [
          {
            governmentLevels: ['estatal', 'municipal'],
            entityIds: [],
            holder: { kind: 'institution', name: 'Secretaría Ficticia' },
          },
        ],
        investigation: [],
        substantiation: [],
        resolution: [],
        supervision: [],
        prosecution: [],
        observer: [],
      },
    },
    signing.privateKey,
  );
  const body: NodeJoinRequestBody = {
    tipo: 'sigilo/solicitud-alta-nodo',
    v: 1,
    creada: DAY,
    software: '1.1.0',
    nodo: {
      id: 'node.ejemplo',
      name: 'Nodo ficticio',
      baseUrl: 'https://denuncias.ejemplo.invalid',
      boxKeyId: nodeBox.keyId,
      boxPublicKey: nodeBox.publicKey,
      signingKeyId: nodeSigning.keyId,
      signingPublicKey: nodeSigning.publicKey,
    },
    buzon: {
      id: 'authority.buzon-ejemplo',
      name: 'Buzón general ficticio',
      nodeId: 'node.ejemplo',
      governmentLevel: 'estatal',
      stateCode: '20',
      role: 'inbox',
      competence: {
        governmentLevels: ['estatal', 'municipal'],
        stateCodes: ['20'],
        entityIds: [],
        laws: ['LGRA', 'CPF'],
      },
      keyId: keyIdFor(inboxBox.publicKey),
      boxPublicKey: toBase64Url(inboxBox.publicKey),
      signingPublicKey: toBase64Url(inboxSigning.publicKey),
      supervisorId: null,
      validFrom: DAY,
      validUntil: null,
    },
    tablaDeFunciones: table,
    enlace: {
      keyId: keyIdFor(link.publicKey),
      boxPublicKey: toBase64Url(link.publicKey),
      epoca: 1,
    },
    contacto: {
      institucion: 'Secretaría Ficticia',
      responsable: 'Persona Ficticia',
      cargo: 'Titular de TI',
      correo: 'ti@ejemplo.invalid',
      telefono: '5500000000',
    },
  };
  return { body, signing, link };
}

describe('paquete de la red', () => {
  it('se firma, se verifica y su huella no depende de la frescura', () => {
    const keys = generateDemoNetworkKeys();
    const trust = trustAnchorFromDirectory(
      buildDemoDirectory(keys, { issuedOn: DAY, baseUrls: {} }),
    );
    const link = generateBoxKeyPair();
    const pkg = signNetworkPackage(
      {
        tipo: 'sigilo/paquete-de-red',
        v: 1,
        nombre: 'Red ficticia',
        ventanillaUrl: 'https://ventanilla.ejemplo.invalid',
        trust,
        enlace: { keyId: keyIdFor(link.publicKey), boxPublicKey: toBase64Url(link.publicKey) },
        emitido: DAY,
      },
      keys.operator.privateKey,
    );
    expect(verifyNetworkPackage(pkg)).not.toBeNull();
    expect(verifyNetworkPackage({ ...pkg, nombre: 'Otra red' })).toBeNull();
    const fingerprint = networkFingerprint(trust);
    expect(fingerprint.replace(/ /gu, '')).toHaveLength(32);
    expect(networkFingerprint({ ...trust, minDirectorySerial: 9 })).toBe(fingerprint);
    expect(networkFingerprint({ ...trust, threshold: 1 })).not.toBe(fingerprint);
  });
});

describe('solicitud de alta', () => {
  it('verifica la firma del nodo y su huella cubre las tres llaves', () => {
    const { body, signing } = joinBody();
    const request = signJoinRequest(body, signing.privateKey);
    const check = verifyJoinRequest(request);
    expect(check.valid).toBe(true);
    const fingerprint = joinRequestFingerprint(request);
    expect(sameFingerprint(fingerprint, fingerprint.replace(/ /gu, '').toUpperCase())).toBe(true);
    const otherLink = generateBoxKeyPair();
    const changed = {
      ...request,
      enlace: {
        keyId: keyIdFor(otherLink.publicKey),
        boxPublicKey: toBase64Url(otherLink.publicKey),
        epoca: 1,
      },
    };
    expect(joinRequestFingerprint(changed)).not.toBe(fingerprint);
    // Cambiar cualquier campo rompe la firma.
    expect(verifyJoinRequest(changed).valid).toBe(false);
  });

  it('rechaza http, un buzón de otro nodo y una tabla sin la firma del nodo', () => {
    const { body, signing } = joinBody();
    const http = signJoinRequest(
      { ...body, nodo: { ...body.nodo, baseUrl: 'http://denuncias.ejemplo.invalid' } },
      signing.privateKey,
    );
    expect(verifyJoinRequest(http).valid).toBe(false);
    expect(verifyJoinRequest(http, { allowHttp: true }).valid).toBe(true);
    const foreign = signJoinRequest(
      { ...body, buzon: { ...body.buzon, nodeId: 'node.otro' } },
      signing.privateKey,
    );
    const check = verifyJoinRequest(foreign);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.problems).toContain('El buzón es de otro nodo.');
    const otherSigner = generateSigningKeyPair();
    const unsignedTable = signJoinRequest(
      {
        ...body,
        tablaDeFunciones: signFunctionTable(body.tablaDeFunciones.table, otherSigner.privateKey),
      },
      signing.privateKey,
    );
    expect(verifyJoinRequest(unsignedTable).valid).toBe(false);
  });
});

describe('secretos de enlace derivados', () => {
  it('son iguales en el nodo y en la SESNA y cambian con la época y el nodo', () => {
    const node = generateBoxKeyPair();
    const sesna = generateBoxKeyPair();
    const fromNode = deriveLinkSecrets({
      ownPrivateKey: node.privateKey,
      peerPublicKey: sesna.publicKey,
      nodeId: 'node.ejemplo',
      epoch: 1,
    });
    const fromSesna = deriveLinkSecrets({
      ownPrivateKey: sesna.privateKey,
      peerPublicKey: node.publicKey,
      nodeId: 'node.ejemplo',
      epoch: 1,
    });
    expect(fromNode).toEqual(fromSesna);
    expect(fromNode.relaySecret).not.toBe(fromNode.oauthClientSecret);
    const nextEpoch = deriveLinkSecrets({
      ownPrivateKey: node.privateKey,
      peerPublicKey: sesna.publicKey,
      nodeId: 'node.ejemplo',
      epoch: 2,
    });
    expect(nextEpoch.relaySecret).not.toBe(fromNode.relaySecret);
    const otherNode = deriveLinkSecrets({
      ownPrivateKey: node.privateKey,
      peerPublicKey: sesna.publicKey,
      nodeId: 'node.otro',
      epoch: 1,
    });
    expect(otherNode.oauthClientSecret).not.toBe(fromNode.oauthClientSecret);
    expect(() =>
      deriveLinkSecrets({
        ownPrivateKey: node.privateKey,
        peerPublicKey: new Uint8Array(32),
        nodeId: 'node.ejemplo',
        epoch: 1,
      }),
    ).toThrow();
  });
});

describe('rotación de la llave de enlace', () => {
  it('solo vale con la firma del nodo', () => {
    const signing = generateSigningKeyPair();
    const link = generateBoxKeyPair();
    const rotation = signLinkRotation(
      {
        tipo: 'sigilo/rotacion-enlace',
        v: 1,
        nodeId: 'node.ejemplo',
        creada: DAY,
        enlace: {
          keyId: keyIdFor(link.publicKey),
          boxPublicKey: toBase64Url(link.publicKey),
          epoca: 2,
        },
      },
      signing.privateKey,
    );
    expect(verifyLinkRotation(rotation, toBase64Url(signing.publicKey))).not.toBeNull();
    const other = generateSigningKeyPair();
    expect(verifyLinkRotation(rotation, toBase64Url(other.publicKey))).toBeNull();
  });
});
